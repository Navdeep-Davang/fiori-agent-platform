import json
import httpx
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

async def list_tools(base_url: str, token: str = None) -> List[Dict[str, Any]]:
    """Calls an MCP server's tools/list endpoint."""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}" if not token.startswith("Bearer ") else token
        
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(f"{base_url}/mcp/tools/list", headers=headers, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            return data.get("tools", [])
        except Exception as e:
            logger.error(f"Failed to list tools from MCP server {base_url}: {e}")
            return []

async def call_tool(base_url: str, tool_name: str, arguments: Dict[str, Any], token: str = None) -> str:
    """Calls an MCP server's tools/call endpoint; returns result JSON string."""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}" if not token.startswith("Bearer ") else token
        
    payload = {
        "name": tool_name,
        "arguments": arguments
    }
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(f"{base_url}/mcp/tools/call", headers=headers, json=payload, timeout=30.0)
            resp.raise_for_status()
            data = resp.json()
            
            if "error" in data:
                return json.dumps({"error": data["error"]})
            
            return data.get("result", "null")
        except Exception as e:
            logger.error(f"Failed to call tool {tool_name} on MCP server {base_url}: {e}")
            return json.dumps({"error": f"Connection error: {str(e)}"})
