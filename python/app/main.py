import os
import logging
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from . import config, executor, mcp_server, db
from .tools.registry import TOOL_REGISTRY

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

INTERNAL_TOKEN = os.environ.get("ACP_INTERNAL_TOKEN", "").strip()

class InternalTokenMiddleware(BaseHTTPMiddleware):
    """When ACP_INTERNAL_TOKEN is set, require matching X-Internal-Token on internal API routes (CAP → Python)."""

    _protected_prefixes = ("/chat", "/tool-test", "/mcp")

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not INTERNAL_TOKEN or not any(
            path == p or path.startswith(p + "/") for p in self._protected_prefixes
        ):
            return await call_next(request)
        got = (
            request.headers.get("x-internal-token")
            or request.headers.get("X-Internal-Token")
            or ""
        )
        if got != INTERNAL_TOKEN:
            return JSONResponse(status_code=403, content={"error": "Invalid or missing internal token"})
        return await call_next(request)

app = FastAPI(title="ACP Python Executor")
app.add_middleware(InternalTokenMiddleware)

# Mount MCP server routes
app.include_router(mcp_server.router)

@app.get("/health")
def health():
    """Health check endpoint for CAP's testConnection action."""
    return {"status": "ok"}

@app.post("/tool-test")
async def tool_test(request: Request):
    """Admin tool-test endpoint."""
    body = await request.json()
    tool_name = body.get("toolName")
    args = body.get("args", {})
    
    if tool_name not in TOOL_REGISTRY:
        return JSONResponse(status_code=404, content={"error": f"Tool {tool_name} not found"})
        
    info = TOOL_REGISTRY[tool_name]
    handler = info["handler"]
    
    conn = db.get_connection()
    try:
        import json
        result = handler(conn, **args)
        return {"result": json.dumps(result)}
    except Exception as e:
        logger.error(f"Error in tool-test for {tool_name}: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        conn.close()

@app.post("/chat")
async def chat(request: Request):
    """Main chat endpoint forwarding to LLM executor."""
    payload = await request.json()
    
    # Simple validation
    if not payload.get("message") and not payload.get("history"):
        return JSONResponse(status_code=400, content={"error": "Message or history required"})
        
    return StreamingResponse(
        executor.run(payload),
        media_type="text/event-stream"
    )

# Note: In a production environment, you might want to add middleware
# for JWT verification if this service is exposed. However, per 
# architecture section 5, this service is internal and called by CAP only.
