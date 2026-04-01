import asyncio
import json
import os
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

app = FastAPI(title="ACP Python Executor")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/mcp/tools/list")
def mcp_tools_list():
    return {
        "tools": [
            {"name": "get_vendors", "description": "List vendors", "inputSchema": {"type": "object"}},
            {"name": "get_purchase_orders", "description": "List POs", "inputSchema": {"type": "object"}},
            {"name": "get_po_detail", "description": "PO detail", "inputSchema": {"type": "object"}},
            {"name": "get_invoices", "description": "List invoices", "inputSchema": {"type": "object"}},
            {"name": "get_invoice_detail", "description": "Invoice detail", "inputSchema": {"type": "object"}},
            {"name": "match_invoice_to_po", "description": "Match invoice", "inputSchema": {"type": "object"}},
            {"name": "get_spend_summary", "description": "Spend summary", "inputSchema": {"type": "object"}},
        ]
    }


@app.post("/mcp/tools/call")
def mcp_tools_call(body: dict):
    return {"result": json.dumps({"ok": True, "tool": body.get("name"), "note": "stub"})}


@app.post("/tool-test")
def tool_test(body: dict):
    return {"result": json.dumps({"stub": True, "toolName": body.get("toolName")})}


async def _chat_sse(payload: dict) -> AsyncIterator[str]:
    msg = payload.get("message") or ""
    yield f'data: {json.dumps({"type": "token", "content": "Stub response: "})}\n\n'
    await asyncio.sleep(0.01)
    yield f'data: {json.dumps({"type": "token", "content": msg[:120]})}\n\n'
    yield f'data: {json.dumps({"type": "done", "sessionId": None, "messageId": None})}\n\n'


@app.post("/chat")
async def chat(payload: dict):
    return StreamingResponse(_chat_sse(payload), media_type="text/event-stream")
