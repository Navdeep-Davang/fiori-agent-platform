import logging
from fastapi import FastAPI, HTTPException, Body, Request
from typing import Dict, Any, List
import sys
import os

# Add the project root to sys.path to allow 'from python.utils...' imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../")))

from python.utils.db_utils import get_connection
from python.utils.observability import get_correlation_id
from python.utils.mcp_args import flatten_tool_arguments
from ..tools import procurement

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Procurement MCP Server")

# Metadata for tools
TOOLS_METADATA = [
    {
        "name": "get_vendors",
        "description": "List vendors, optionally filtered by category or country.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Vendor category filter"},
                "country": {"type": "string", "description": "Vendor country filter"}
            }
        }
    },
    {
        "name": "get_purchase_orders",
        "description": "List POs with optional filters for status, vendor_id, or buyer.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "PO status filter"},
                "vendor_id": {"type": "string", "description": "Vendor ID filter"},
                "buyer": {"type": "string", "description": "Buyer name filter"}
            }
        }
    },
    {
        "name": "get_po_detail",
        "description": "Retrieve full detail for a single PO including line items.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "po_id": {"type": "string", "description": "Purchase Order ID"}
            },
            "required": ["po_id"]
        }
    }
]

@app.get("/health")
async def health():
    return {"status": "OK"}

@app.get("/mcp/tools/list")
@app.post("/mcp/tools/list")
async def list_tools():
    """Returns the list of tools available in this server."""
    return {"tools": TOOLS_METADATA}

@app.post("/mcp/tools/call")
async def call_tool(
    req: Request,
    name: str = Body(..., embed=True),
    arguments: Dict[str, Any] = Body(default_factory=dict, embed=True)
):
    """Executes a tool by name with provided arguments."""
    arguments = flatten_tool_arguments(arguments)
    correlation_id = get_correlation_id(dict(req.headers))
    logger.info(f"Calling tool: {name} | correlation_id: {correlation_id} | arguments: {arguments}")
    
    if not hasattr(procurement, name):
        raise HTTPException(status_code=404, detail=f"Tool '{name}' not found")
    
    tool_func = getattr(procurement, name)
    
    try:
        conn = get_connection()
        try:
            # Note: procurement functions expect 'conn' as first argument
            result = tool_func(conn, **arguments)
            # Standard MCP tool response format
            return {"content": [{"type": "text", "text": str(result)}], "is_error": False}
        finally:
            conn.close()
    except Exception as e:
        logger.error(f"Error executing tool {name}: {str(e)}")
        return {"content": [{"type": "text", "text": str(e)}], "is_error": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
