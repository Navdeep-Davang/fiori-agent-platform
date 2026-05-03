import os
import sys
import logging
import httpx
from fastapi import FastAPI, HTTPException, Body, Query, Request, Header
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

# Add the project root to sys.path to allow 'from python.utils...' imports
# Structure: python/apps/mcp_client/app/main.py -> 4 levels to root
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../")))

try:
    from python.utils.observability import get_correlation_id, get_observability_headers
except ImportError:

    def get_correlation_id(_headers):
        import uuid
        return str(uuid.uuid4())

    def get_observability_headers(correlation_id, langfuse_trace_id=None):
        h = {"X-Acp-Correlation-Id": correlation_id}
        if langfuse_trace_id:
            h["X-Langfuse-Trace-Id"] = langfuse_trace_id
        return h

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MCP Client (Runner)")

# Layer 6 gateway (never use PYTHON_URL here — that is the Layer 3 /chat server on 8003).
GATEWAY_URL = os.getenv("MCP_GATEWAY_URL", "http://localhost:8000")

# JSON-RPC Models
class JsonRpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    method: str
    params: Optional[Dict[str, Any]] = None
    id: Optional[Any] = None

class JsonRpcResponse(BaseModel):
    jsonrpc: str = "2.0"
    result: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None
    id: Optional[Any] = None

@app.get("/health")
async def health():
    return {
        "status": "OK", 
        "service": "mcp-client",
        "gateway_url": GATEWAY_URL
    }

@app.post("/mcp/rpc")
async def mcp_rpc(request: JsonRpcRequest, req_raw: Request):
    """
    Layer 5: MCP Protocol Handler.
    Handles incoming JSON-RPC calls (e.g. from Orchestrator or Temporal Activities)
    and maps them to the Gateway's REST API.
    
    Supported methods:
    - 'tools/list': Discovers available tools via the gateway.
    - 'tools/call': Executes a tool via the gateway.
    """
    correlation_id = get_correlation_id(dict(req_raw.headers))
    # If correlation_id is in params (JSON-RPC), prefer that
    if request.params and "correlation_id" in request.params:
        correlation_id = request.params["correlation_id"]
        
    logger.info(f"Received JSON-RPC request: {request.method} | correlation_id: {correlation_id}")
    
    headers = get_observability_headers(correlation_id)
    # Forward original authorization header if present
    auth_header = req_raw.headers.get("Authorization")
    if auth_header:
        headers["Authorization"] = auth_header

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            if request.method == "tools/list":
                # Map JSON-RPC tools/list to Gateway GET /mcp/tools/list
                logger.info(f"Forwarding list request to {GATEWAY_URL}/mcp/tools/list")
                response = await client.get(f"{GATEWAY_URL}/mcp/tools/list", headers=headers)
                response.raise_for_status()
                return JsonRpcResponse(result=response.json(), id=request.id)
                
            elif request.method == "tools/call":
                # Map JSON-RPC tools/call to Gateway POST /mcp/tools/call
                if not request.params or "name" not in request.params:
                    return JsonRpcResponse(
                        error={"code": -32602, "message": "Invalid params: 'name' is required"},
                        id=request.id
                    )

                aid = str(request.params.get("agentId") or "").strip()
                if not aid:
                    return JsonRpcResponse(
                        error={
                            "code": -32602,
                            "message": "Invalid params: 'agentId' is required (CAP/HANA agent UUID)",
                        },
                        id=request.id,
                    )

                # The Gateway requires 'agentId', 'toolName', and 'arguments'
                payload = {
                    "agentId": aid,
                    "toolName": request.params["name"],
                    "arguments": request.params.get("arguments", {}) or {},
                }

                _itk = os.getenv("ACP_INTERNAL_TOKEN", "").strip()
                if _itk:
                    headers["X-Internal-Token"] = _itk
                _dept = (
                    str(request.params.get("dept") or request.params.get("capDept") or "")
                    .strip()
                )
                if not _dept:
                    _dept = (req_raw.headers.get("X-AC-Dept") or req_raw.headers.get("x-ac-dept") or "").strip()
                if _dept:
                    headers["X-AC-Dept"] = _dept

                logger.info(f"Forwarding call request for '{payload['toolName']}' to {GATEWAY_URL}/mcp/tools/call")
                response = await client.post(f"{GATEWAY_URL}/mcp/tools/call", json=payload, headers=headers)
                response.raise_for_status()
                return JsonRpcResponse(result=response.json(), id=request.id)
            
            else:
                logger.warning(f"Unsupported method: {request.method}")
                return JsonRpcResponse(
                    error={"code": -32601, "message": f"Method not found: {request.method}"},
                    id=request.id
                )
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Gateway returned error status: {e.response.status_code} - {e.response.text}")
            return JsonRpcResponse(
                error={"code": -32000, "message": f"Gateway error ({e.response.status_code}): {e.response.text}"},
                id=request.id
            )
        except httpx.RequestError as e:
            logger.error(f"Failed to connect to Gateway at {GATEWAY_URL}: {str(e)}")
            return JsonRpcResponse(
                error={"code": -32001, "message": f"Gateway connection failed: {str(e)}"},
                id=request.id
            )
        except Exception as e:
            logger.exception("Unexpected error in MCP RPC handler")
            return JsonRpcResponse(
                error={"code": -32603, "message": f"Internal error: {str(e)}"},
                id=request.id
            )

@app.get("/tools/search")
async def search_tools(q: str = Query(..., min_length=1)):
    """
    Task 4.2: Tool RAG / Semantic Search (Keyword-based).
    Allows agents to find tools by keyword in name or description.
    """
    logger.info(f"Searching tools with keyword: '{q}'")
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # Fetch aggregated tool list from gateway
            response = await client.get(f"{GATEWAY_URL}/mcp/tools/list")
            response.raise_for_status()
            data = response.json()
            
            # The gateway returns {"tools": [...]}
            all_tools = data.get("tools", [])
            query = q.lower()
            
            # Simple keyword-based filtering
            matches = []
            for tool in all_tools:
                name = tool.get("name", "").lower()
                description = tool.get("description", "").lower()
                
                if query in name or query in description:
                    matches.append(tool)
            
            logger.info(f"Found {len(matches)} matches for '{q}'")
            return {
                "query": q,
                "count": len(matches),
                "tools": matches
            }
            
        except Exception as e:
            logger.error(f"Tool search failed: {str(e)}")
            # We return a 500 here because this is a REST endpoint, not a JSON-RPC response
            raise HTTPException(status_code=500, detail=f"Failed to search tools: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    # Runner typically runs on port 8005 by default for this arch
    port = int(os.getenv("PORT", "8005"))
    logger.info(f"Starting MCP Client on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
