import logging
import os
import time
from typing import Dict, Any, Optional, Tuple
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Request, HTTPException, Depends, Header
from pydantic import BaseModel, Field, model_validator

from .registry import registry
from .auth import validate_jwt, check_policy, refresh_xsuaa_jwks
from .audit import log_audit
from python.utils.observability import get_correlation_id, get_observability_headers

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MCP Gateway")


def _gateway_origin_tuple(u: str) -> Optional[Tuple[str, str, int]]:
    p = urlparse((u or "").strip())
    if not p.scheme or not p.hostname:
        return None
    scheme = p.scheme.lower()
    host = (p.hostname or "").lower()
    if host == "127.0.0.1":
        host = "localhost"
    port = p.port if p.port is not None else (443 if scheme == "https" else 80)
    return (scheme, host, port)


def _normalize_upstream_mcp_base(registry_base: str, tool_name: str) -> str:
    """
    If ACP_MCPSERVER.BASEURL equals MCP_GATEWAY_URL, the gateway would forward to itself
    with a domain payload (no agentId) and return 422. Fix data (see db seed) or set
    MCP_REGISTRY_LOOP_FALLBACK_URL for a dev override.
    """
    raw = (registry_base or "").strip().rstrip("/")
    if not raw:
        return raw
    gw = os.getenv("MCP_GATEWAY_URL", "http://localhost:8000").strip().rstrip("/")
    ro, go = _gateway_origin_tuple(raw), _gateway_origin_tuple(gw)
    if not ro or not go or ro != go:
        return raw
    fallback = os.getenv("MCP_REGISTRY_LOOP_FALLBACK_URL", "").strip().rstrip("/")
    if fallback:
        logger.warning(
            "Tool %s McpServer BASEURL matches gateway (%s); using MCP_REGISTRY_LOOP_FALLBACK_URL=%s",
            tool_name,
            raw,
            fallback,
        )
        return fallback
    raise HTTPException(
        status_code=503,
        detail=(
            f"McpServer BASEURL points at this MCP gateway ({gw}), which would recurse. "
            "Set BASEURL to the domain MCP server (e.g. http://localhost:8001 for procurement), "
            "or set env MCP_REGISTRY_LOOP_FALLBACK_URL."
        ),
    )


class ToolCallRequest(BaseModel):
    agentId: str = Field(..., min_length=1)
    toolName: Optional[str] = None
    # Domain MCP servers send ``name``; gateway historically used ``toolName``.
    name: Optional[str] = None
    arguments: Dict[str, Any] = {}

    @model_validator(mode="after")
    def _coalesce_tool_name(self):
        tn = self.toolName or self.name
        if not tn:
            raise ValueError("toolName or name is required")
        self.toolName = tn
        aid = self.agentId.strip()
        low = aid.lower()
        if low in ("unknown-agent", "unknown", "default"):
            raise ValueError(f"invalid agentId placeholder: use the CAP/HANA agent UUID ({aid!r})")
        self.agentId = aid
        return self

@app.on_event("startup")
async def startup_event():
    # Initial registry refresh
    try:
        registry.refresh()
    except Exception as e:
        logger.error(f"Startup registry refresh failed: {e}")

    loaded = await refresh_xsuaa_jwks()
    if loaded:
        logger.info("XSUAA JWKS preloaded for MCP Gateway JWT verification.")
    else:
        logger.warning(
            "MCP Gateway could not preload XSUAA JWKS — tool calls fail until "
            "VCAP_SERVICES (xsuaa) or XS_UAA_URL is configured."
        )

@app.get("/health")
async def health_check():
    return {"status": "ok", "tools_loaded": len(registry._registry)}

@app.post("/refresh")
async def refresh_registry():
    """Endpoint for CAP to signal HANA updates."""
    try:
        registry.refresh()
        return {"status": "success", "tools_loaded": len(registry._registry)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/mcp/tools/call")
async def call_tool(
    request: ToolCallRequest,
    req_raw: Request,
    user_claims: Dict = Depends(validate_jwt)
):
    """
    Identity-aware tool call forwarding.
    """
    start_time = time.time()
    user_id = user_claims.get("user_id") or user_claims.get("email") or "unknown"
    
    # Extract or generate correlation ID using shared helper
    correlation_id = get_correlation_id(dict(req_raw.headers))
    
    # 1. Check Routing Registry
    mcp_base_url = registry.get_url(request.toolName)
    if not mcp_base_url:
        error_msg = f"Tool '{request.toolName}' not found in registry"
        log_audit(user_id, request.agentId, request.toolName, request.arguments, "Forbidden", error_msg, correlation_id)
        raise HTTPException(status_code=404, detail=error_msg)

    # 2. Policy Enforcement (JWT claims + optional trusted X-AC-Dept from CAP→Python hop)
    if not check_policy(
        user_id, request.agentId, request.toolName, user_claims, req_raw.headers
    ):
        error_msg = f"User {user_id} is not authorized for tool {request.toolName} via agent {request.agentId}"
        log_audit(user_id, request.agentId, request.toolName, request.arguments, "Forbidden", error_msg, correlation_id)
        raise HTTPException(status_code=403, detail=error_msg)

    mcp_base_url = _normalize_upstream_mcp_base(mcp_base_url, request.toolName)

    # 3. Forward to MCP Server
    # Forward original authorization header for principal propagation if needed
    auth_header = req_raw.headers.get("authorization")
    headers = get_observability_headers(correlation_id)
    if auth_header:
        headers["Authorization"] = auth_header

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # MCP Server tool call endpoint: /mcp/tools/call
            # The request body should match what the MCP server expects.
            # Usually it's {"name": toolName, "arguments": arguments}
            mcp_payload = {
                "name": request.toolName,
                "arguments": dict(request.arguments or {}),
            }
            
            response = await client.post(
                f"{mcp_base_url.rstrip('/')}/mcp/tools/call",
                json=mcp_payload,
                headers=headers
            )
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            if response.status_code == 200:
                log_audit(
                    user_id, request.agentId, request.toolName, request.arguments, 
                    "Success", correlation_id=correlation_id, duration_ms=duration_ms
                )
                return response.json()
            else:
                error_msg = f"MCP Server error ({response.status_code}): {response.text}"
                log_audit(
                    user_id, request.agentId, request.toolName, request.arguments, 
                    "Failure", error_msg, correlation_id, duration_ms
                )
                raise HTTPException(status_code=response.status_code, detail=error_msg)
                
    except httpx.RequestError as e:
        duration_ms = int((time.time() - start_time) * 1000)
        error_msg = f"Failed to reach MCP Server: {str(e)}"
        log_audit(
            user_id, request.agentId, request.toolName, request.arguments, 
            "Failure", error_msg, correlation_id, duration_ms
        )
        raise HTTPException(status_code=502, detail=error_msg)
