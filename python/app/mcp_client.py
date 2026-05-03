import json
import httpx
import logging
import os
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse


def _gateway_origin_tuple(u: str) -> Optional[tuple]:
    """(scheme, host, port) with localhost/127.0.0.1 unified; None if not parseable."""
    p = urlparse((u or "").strip())
    if not p.scheme or not p.hostname:
        return None
    scheme = p.scheme.lower()
    host = (p.hostname or "").lower()
    if host == "127.0.0.1":
        host = "localhost"
    port = p.port
    if port is None:
        port = 443 if scheme == "https" else 80
    return (scheme, host, port)


def _effective_gateway_base_url() -> str:
    raw = (os.getenv("MCP_GATEWAY_URL") or "").strip().rstrip("/")
    return raw if raw else "http://localhost:8000"


def _urls_target_same_gateway(base_raw: str, gw_effective: str) -> bool:
    """True if tool base URL points at the same MCP gateway as MCP_GATEWAY_URL (or default)."""
    ob = _gateway_origin_tuple(base_raw)
    og = _gateway_origin_tuple(gw_effective)
    if ob and og and ob == og:
        return True
    # String form (path/trailing slash differences)
    return _norm_gateway_base(base_raw) == _norm_gateway_base(gw_effective)


def _norm_gateway_base(u: str) -> str:
    """Compare gateway URLs forgiving localhost vs 127.0.0.1."""
    u = (u or "").strip().rstrip("/")
    if not u:
        return u
    p = urlparse(u)
    if not p.scheme or not p.netloc:
        return u.replace("127.0.0.1", "localhost")
    host = (p.hostname or "").lower()
    if host == "127.0.0.1":
        host = "localhost"
    port = f":{p.port}" if p.port else ""
    prefix = p.scheme + "://"
    if "@" in p.netloc:
        userinfo, _, rest = p.netloc.partition("@")
        rebuilt = prefix + userinfo + "@" + host + port
    else:
        rebuilt = prefix + host + port
    remainder = u[len(prefix + p.netloc) :] if prefix + p.netloc else ""
    tail = remainder.rstrip("/") if remainder else ""
    return rebuilt + tail

logger = logging.getLogger(__name__)

async def list_tools(base_url: str, token: str = None) -> List[Dict[str, Any]]:
    """Calls an MCP server's tools/list endpoint."""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}" if not token.startswith("Bearer ") else token
        
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{base_url}/mcp/tools/list", headers=headers, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            return data.get("tools", [])
        except Exception as e:
            logger.error(f"Failed to list tools from MCP server {base_url}: {e}")
            return []

def _normalize_tool_call_response(data: Dict[str, Any]) -> str:
    """Map MCP HTTP JSON to a single string for the LLM (servers may use `result` or `content` blocks)."""
    if "error" in data and data["error"] is not None:
        return json.dumps({"error": data["error"]})
    if "result" in data and data["result"] is not None:
        r = data["result"]
        if isinstance(r, str):
            return r
        return json.dumps(r)
    content = data.get("content")
    if isinstance(content, list) and content:
        parts: List[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            elif isinstance(block, dict):
                parts.append(json.dumps(block))
            else:
                parts.append(str(block))
        return "".join(parts)
    return json.dumps(data)


async def call_tool(
    base_url: str,
    tool_name: str,
    arguments: Dict[str, Any],
    token: str = None,
    *,
    agent_id: Optional[str] = None,
    cap_dept: Optional[str] = None,
) -> str:
    """Calls MCP server /mcp/tools/call.

    When ``base_url`` matches ``MCP_GATEWAY_URL``, sends gateway shape
 ``{agentId, toolName, arguments}`` (requires ``agent_id``). Otherwise sends
 ``{name, arguments}`` for domain MCP servers.
    """
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}" if not token.startswith("Bearer ") else token

    base_raw = (base_url or "").strip().rstrip("/")
    base_cmp = _norm_gateway_base(base_raw)
    gw_effective = _effective_gateway_base_url()
    gw_cmp = _norm_gateway_base(gw_effective)
    gw_match = _urls_target_same_gateway(base_raw, gw_effective)
    base = base_cmp

    if gw_match:
        if not (agent_id or "").strip():
            return json.dumps(
                {"error": "agent_id required for MCP gateway tool calls (set agent id on agent)"}
            )
        _dept = (cap_dept or "").strip()
        if _dept:
            headers["X-AC-Dept"] = _dept
        _itk = os.getenv("ACP_INTERNAL_TOKEN", "").strip()
        if _itk:
            headers["X-Internal-Token"] = _itk
        payload: Dict[str, Any] = {
            "agentId": str(agent_id).strip(),
            "toolName": tool_name,
            "arguments": arguments,
        }
    else:
        payload = {"name": tool_name, "arguments": arguments}

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{base}/mcp/tools/call", headers=headers, json=payload, timeout=30.0
            )
            resp.raise_for_status()
            data = resp.json()
            return _normalize_tool_call_response(data)
        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                detail = (e.response.text or "")[:500]
            except Exception:
                pass
            logger.error(
                "Failed to call tool %s on MCP server %s: %s | body=%s",
                tool_name,
                base_url,
                e,
                detail[:300] if detail else "",
            )
            return json.dumps({"error": f"Connection error: {str(e)}"})
        except Exception as e:
            logger.error(f"Failed to call tool {tool_name} on MCP server {base_url}: {e}")
            return json.dumps({"error": f"Connection error: {str(e)}"})
