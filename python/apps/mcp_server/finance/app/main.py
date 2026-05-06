import json
import logging
from decimal import Decimal
from fastapi import FastAPI, HTTPException, Body, Request
from typing import Dict, Any, List
import sys
import os

# Add the project root to sys.path to allow 'from python.utils...' imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../")))

from python.utils.db_utils import get_connection
from python.utils.observability import get_correlation_id
from python.utils.mcp_args import flatten_tool_arguments
from ..tools import finance

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _tool_result_json(result: Any) -> str:
    """Stable MCP text payload: readable JSON with Decimal/date-like values coerced."""

    def _default(o: Any) -> Any:
        if isinstance(o, Decimal):
            return float(o)
        return str(o)

    try:
        return json.dumps(result, default=_default, indent=2, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(result)

app = FastAPI(title="Finance MCP Server")

# Metadata for tools
TOOLS_METADATA = [
    {
        "name": "get_invoices",
        "description": "List invoices with optional status or due_before date filters.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Invoice status (case-insensitive). Demo values: Paid, Submitted, Overdue, Draft. Synonyms e.g. open→Draft, pending→Submitted.",
                },
                "due_before": {"type": "string", "description": "Due date filter (YYYY-MM-DD)"}
            }
        }
    },
    {
        "name": "get_invoice_detail",
        "description": "Full detail for a single invoice including line items.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "invoice_id": {"type": "string", "description": "Invoice ID"}
            },
            "required": ["invoice_id"]
        }
    },
    {
        "name": "match_invoice_to_po",
        "description": "Compare invoice amount vs associated PO. Pass invoice_id, or po_id alone if one invoice is linked to that PO, or both to validate they match.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "invoice_id": {"type": "string", "description": "Invoice ID (e.g. INV-001)"},
                "po_id": {"type": "string", "description": "Optional PO ID; can be used without invoice_id to resolve the invoice"},
            }
        }
    },
    {
        "name": "get_spend_summary",
        "description": "Aggregate PO spend totals. Use group_by vendor, category, or po_id (per purchase order).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "group_by": {
                    "type": "string",
                    "enum": ["vendor", "category", "po_id"],
                    "description": "vendor | category | po_id",
                },
                "period": {"type": "string", "description": "Optional period filter (reserved)"},
            },
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
    
    if not hasattr(finance, name):
        raise HTTPException(status_code=404, detail=f"Tool '{name}' not found")
    
    tool_func = getattr(finance, name)
    
    try:
        conn = get_connection()
        try:
            # Note: finance functions expect 'conn' as first argument
            result = tool_func(conn, **arguments)
            # Standard MCP tool response format — JSON when possible avoids repr/Decimal quirks
            return {"content": [{"type": "text", "text": _tool_result_json(result)}], "is_error": False}
        finally:
            conn.close()
    except Exception as e:
        logger.error(f"Error executing tool {name}: {str(e)}")
        return {"content": [{"type": "text", "text": str(e)}], "is_error": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
