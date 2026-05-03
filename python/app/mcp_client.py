import json
import httpx
import logging
import os
from typing import List, Dict, Any, Optional

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
) -> str:
    """Calls MCP server /mcp/tools/call.

    When ``base_url`` matches ``MCP_GATEWAY_URL``, sends gateway shape
 ``{agentId, toolName, arguments}`` (requires ``agent_id``). Otherwise sends
 ``{name, arguments}`` for domain MCP servers.
    """
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}" if not token.startswith("Bearer ") else token

    base = (base_url or "").strip().rstrip("/")
    gw = (os.getenv("MCP_GATEWAY_URL") or "").strip().rstrip("/")
    if gw and base == gw:
        if not (agent_id or "").strip():
            return json.dumps(
                {"error": "agent_id required for MCP gateway tool calls (set agent id on agent)"}
            )
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
        except Exception as e:
            logger.error(f"Failed to call tool {tool_name} on MCP server {base_url}: {e}")
            return json.dumps({"error": f"Connection error: {str(e)}"})
