import os
import logging
import json
import sys
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from temporalio.client import Client
from typing import Dict, Any

# Add the project root to sys.path to allow 'from python.utils...' imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../")))

# CAP `/api/chat` sends thin JSON: agentId, message, toolIds, skillIds, sessionId, userInfo (srv/server.js).
from python.app.executor import run as cap_chat_run
from python.apps.orchestrator.app.engine import run_deep_agent_stream
from python.apps.orchestrator.workflows.agent_workflow import AgentWorkflow
from python.utils.observability import get_correlation_id

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Python API Gateway (Server)")

# Temporal Client Configuration


async def _sse_error_stream(message: str, correlation_id: str):
    yield f'data: {json.dumps({"type": "error", "message": message, "correlationId": correlation_id})}\n\n'


TEMPORAL_URL = os.getenv("TEMPORAL_URL", "localhost:7233")
TEMPORAL_NAMESPACE = os.getenv("TEMPORAL_NAMESPACE", "default")

async def get_temporal_client() -> Client:
    return await Client.connect(TEMPORAL_URL, namespace=TEMPORAL_NAMESPACE)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "server"}

@app.post("/chat")
async def chat_endpoint(request: Request):
    """
    Layer 3: Python API Gateway (Short Path).
    CAP uses thin JSON (message, agentId, toolIds, …) → delegate to python.app.executor
    (HANA hydrate, session persistence, DeepAgent + MCP). Alternate body shape with
    agent_cfg / user_message is for direct microservice calls / tests.
    """
    body = await request.json()
    correlation_id = get_correlation_id(dict(request.headers))
    auth = (
        request.headers.get("Authorization")
        or request.headers.get("authorization")
        or ""
    )

    # Primary path: SAP CAP server.js contract — delegate when agentId is present so missing/blank
    # message is validated inside cap_chat_run (SSE error) instead of the direct-agent path.
    if "agentId" in body:
        logger.info(
            "Received CAP chat request | agentId=%s | correlation_id=%s",
            body.get("agentId"),
            correlation_id,
        )
        return StreamingResponse(
            cap_chat_run(body, authorization_header=auth),
            media_type="text/event-stream",
        )

    agent_cfg = body.get("agent_cfg") or {}
    effective_tools = body.get("effective_tools") or []
    skill_metadata = body.get("skill_metadata") or []
    history = body.get("history") or []
    summary = body.get("summary")
    user_message = (body.get("user_message") or "").strip()
    user_token = auth.replace("Bearer ", "", 1).strip() if auth.lower().startswith("bearer ") else auth

    logger.info(
        "Received direct /chat request | agent_cfg.id=%s | correlation_id=%s",
        agent_cfg.get("id"),
        correlation_id,
    )

    if not user_message:
        return StreamingResponse(
            _sse_error_stream("message required", correlation_id),
            media_type="text/event-stream",
        )

    return StreamingResponse(
        run_deep_agent_stream(
            agent_cfg=agent_cfg,
            effective_tools=effective_tools,
            skill_metadata=skill_metadata,
            history=history,
            summary=summary,
            user_message=user_message,
            user_token=user_token,
            correlation_id=correlation_id,
            conn=None,
        ),
        media_type="text/event-stream",
    )

@app.post("/workflow/start")
async def start_workflow(request: Request):
    """
    Layer 3: Workflow Starter.
    Starts a durable Temporal workflow in the Orchestrator Engine.
    """
    body = await request.json()
    client = await get_temporal_client()
    
    # Extract or generate correlation ID
    correlation_id = get_correlation_id(dict(request.headers))
    
    workflow_id = f"agent-wf-{body.get('agentId', 'unknown')}-{os.urandom(4).hex()}"
    
    logger.info(f"Starting Temporal workflow: {workflow_id} | correlation_id: {correlation_id}")
    
    # Add correlation ID to workflow input if not present
    if "correlation_id" not in body:
        body["correlation_id"] = correlation_id
    
    handle = await client.start_workflow(
        AgentWorkflow.run,
        body,
        id=workflow_id,
        task_queue="agent-task-queue"
    )
    
    return {
        "workflow_id": workflow_id,
        "run_id": handle.result_run_id,
        "correlation_id": correlation_id,
        "status": "STARTED"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
