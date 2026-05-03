import time
import logging
import httpx
from typing import Dict, Any, Optional
from fastapi import FastAPI, Request, HTTPException, Depends, Header
from pydantic import BaseModel, model_validator

from .registry import registry
from .auth import validate_jwt, check_policy
from .audit import log_audit
from python.utils.observability import get_correlation_id, get_observability_headers

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MCP Gateway")

class ToolCallRequest(BaseModel):
    agentId: str = "unknown-agent"
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
        return self

@app.on_event("startup")
async def startup_event():
    # Initial registry refresh
    try:
        registry.refresh()
    except Exception as e:
        logger.error(f"Startup registry refresh failed: {e}")

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

    # 2. Policy Enforcement
    if not check_policy(user_id, request.agentId, request.toolName, user_claims):
        error_msg = f"User {user_id} is not authorized for tool {request.toolName} via agent {request.agentId}"
        log_audit(user_id, request.agentId, request.toolName, request.arguments, "Forbidden", error_msg, correlation_id)
        raise HTTPException(status_code=403, detail=error_msg)

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
                "arguments": request.arguments
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
