import json
import logging
from fastapi import APIRouter, HTTPException, Request
from .tools.registry import TOOL_REGISTRY
from .db import get_connection

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mcp")

@router.post("/tools/list")
async def list_mcp_tools():
    """Returns list of tool objects in MCP format."""
    return {
        "tools": [
            {
                "name": name,
                "description": info["description"],
                "inputSchema": info["parameters"]
            }
            for name, info in TOOL_REGISTRY.items()
        ]
    }

@router.post("/tools/call")
async def call_mcp_tool(request: Request):
    """Receives tool call, invokes handler, and returns result."""
    body = await request.json()
    name = body.get("name")
    args = body.get("arguments", {})
    
    if name not in TOOL_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Tool {name} not found")
    
    info = TOOL_REGISTRY[name]
    handler = info["handler"]
    
    # Tool execution always needs a DB connection
    conn = get_connection()
    try:
        # In this implementation, we assume all handlers take 'conn' as first arg
        # followed by keyword arguments matching the schema
        result = handler(conn, **args)
        return {"result": json.dumps(result)}
    except Exception as e:
        logger.error(f"Error calling tool {name}: {e}")
        return {"error": str(e)}
    finally:
        conn.close()
