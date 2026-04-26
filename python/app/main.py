import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware

from . import config, executor, mcp_server, db
from .tools.registry import TOOL_REGISTRY

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
            logger.warning(f"Forbidden: Invalid or missing internal token on {path} (got: {got[:5]}...)")
            return JSONResponse(status_code=403, content={"error": "Invalid or missing internal token"})
        # Plan 05 / 06: prove user context on the hop (CAP sets these).
        uid = request.headers.get("x-ac-user-id") or request.headers.get("X-AC-User-Id")
        if not (uid and str(uid).strip()):
            logger.warning(f"Forbidden: Missing X-AC-User-Id on {path}")
            return JSONResponse(status_code=403, content={"error": "Missing X-AC-User-Id"})
        return await call_next(request)


app = FastAPI(title="ACP Python Executor")
app.add_middleware(InternalTokenMiddleware)

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
        import json as _json

        result = handler(conn, **args)
        return {"result": _json.dumps(result)}
    except Exception as e:
        logger.error("Error in tool-test for %s: %s", tool_name, e)
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        conn.close()


def _authorization_header(request: Request) -> str:
    return (
        request.headers.get("authorization")
        or request.headers.get("Authorization")
        or ""
    )


@app.post("/chat")
async def chat(request: Request):
    """Thin JSON chat: toolIds, skillIds, agentId, sessionId, message, userInfo — Bearer token in header."""
    payload = await request.json()
    auth = _authorization_header(request)
    return StreamingResponse(
        executor.run(payload, authorization_header=auth),
        media_type="text/event-stream",
    )
