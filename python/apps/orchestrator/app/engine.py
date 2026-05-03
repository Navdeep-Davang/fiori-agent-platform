"""
DeepAgent (deepagents) orchestration + MCP + governed load_skill.
Adapted for Orchestrator Microservice.
"""
from __future__ import annotations

import inspect
import json
import logging
import os
import sys
from typing import Any, AsyncIterator, Dict, List, Optional, Set

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import StructuredTool

# Add the project root to sys.path to allow 'from python.utils...' imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../")))

from deepagents import create_deep_agent

try:
    from python.utils.config_utils import (
        GOOGLE_API_KEY,
        LLM_API_KEY,
        LLM_MODEL,
        LLM_PROVIDER,
        LANGFUSE_HOST,
        LANGFUSE_PUBLIC_KEY,
        LANGFUSE_SECRET_KEY,
    )
    from python.utils.db_utils import query_as_dicts
    from python.utils.observability import configure_langfuse_otel_env, get_observability_headers
except ImportError:
    # Fallback for local testing if lib is not in path
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    LLM_API_KEY = os.getenv("LLM_API_KEY")
    LLM_MODEL = os.getenv("LLM_MODEL", "gemini-1.5-flash")
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "google-genai")
    LANGFUSE_HOST = os.getenv("LANGFUSE_HOST")
    LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY")
    LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY")

    def configure_langfuse_otel_env():
        return None

    def get_observability_headers(correlation_id: str, langfuse_trace_id=None):
        return {"X-Acp-Correlation-Id": correlation_id}

logger = logging.getLogger(__name__)

# This will be replaced by Temporal activities in a full implementation.
# For now, we maintain the ability to call tools directly or via Temporal.
MCP_CLIENT_URL = os.getenv("MCP_CLIENT_URL", "http://localhost:8005")

def _build_chat_model():
    if LLM_PROVIDER == "google-genai":
        from langchain_google_genai import ChatGoogleGenerativeAI
        key = GOOGLE_API_KEY or LLM_API_KEY
        return ChatGoogleGenerativeAI(model=LLM_MODEL, google_api_key=key)
    if LLM_PROVIDER == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=LLM_MODEL, api_key=LLM_API_KEY)
    if LLM_PROVIDER == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=LLM_MODEL, api_key=LLM_API_KEY)
    raise ValueError(f"Unsupported LLM_PROVIDER: {LLM_PROVIDER}")

def build_system_prompt(agent_cfg: Dict[str, Any], skill_metadata: List[Dict[str, Any]]) -> str:
    base = agent_cfg.get("systemPrompt") or "You are a helpful assistant."
    if not skill_metadata:
        return base
    lines = ["## Available skills", ""]
    for s in skill_metadata:
        lines.append(f"- **{s.get('name', '')}** (`{s.get('id')}`): {s.get('description', '')}")
    lines.append("")
    lines.append("Call `load_skill` with a skill id to load the full procedure body when needed.")
    return base + "\n\n" + "\n".join(lines)

async def call_mcp_client(url: str, name: str, args: dict, token: str, correlation_id: str) -> str:
    import httpx
    async with httpx.AsyncClient(timeout=60.0) as client:
        rpc_request = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": name,
                "arguments": args,
                "agentId": "orchestrator-brain", # Should be passed from context
                "correlation_id": correlation_id
            },
            "id": 1
        }
        # In this microservice arch, we route to mcp-client
        # The url passed here is legacy from monolith; we now use MCP_CLIENT_URL
        headers = get_observability_headers(correlation_id)
        response = await client.post(f"{MCP_CLIENT_URL}/mcp/rpc", json=rpc_request, headers=headers)
        response.raise_for_status()
        res = response.json()
        if "error" in res:
            return json.dumps(res["error"])
        return json.dumps(res.get("result", {}))

def _make_mcp_tool(meta: Dict[str, Any], user_token: str, allowed_tool_names: Set[str], correlation_id: str) -> StructuredTool:
    name = meta["name"]
    async def _run(**kwargs: Any) -> str:
        if name not in allowed_tool_names:
            raise PermissionError(f"Tool {name} not in allowlist")
        return await call_mcp_client("", name, kwargs, user_token, correlation_id)

    return StructuredTool.from_function(
        name=name,
        description=str(meta.get("description") or "")[:8000],
        coroutine=_run,
    )

def _stringify_llm_chunk_content(raw: Any) -> str:
    if raw is None: return ""
    if isinstance(raw, str): return raw
    if isinstance(raw, list):
        parts: List[str] = []
        for item in raw:
            if isinstance(item, str): parts.append(item)
            elif isinstance(item, dict): parts.append(str(item.get("text", item.get("content", "")) or ""))
        return "".join(parts)
    return str(raw)

def _langfuse_handler(correlation_id: str):
    if not (LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY):
        return None
    import os
    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", LANGFUSE_PUBLIC_KEY)
    os.environ.setdefault("LANGFUSE_SECRET_KEY", LANGFUSE_SECRET_KEY)
    os.environ.setdefault("LANGFUSE_HOST", LANGFUSE_HOST or "http://localhost:3000")
    configure_langfuse_otel_env()
    try:
        from langfuse.langchain import CallbackHandler

        extra: Dict[str, Any] = {}
        try:
            sig = inspect.signature(CallbackHandler.__init__)
            param_names = set(sig.parameters.keys()) - {"self", "args", "kwargs"}
            if "session_id" in param_names:
                extra["session_id"] = correlation_id
        except (TypeError, ValueError):
            pass
        try:
            return CallbackHandler(**extra)
        except TypeError:
            return CallbackHandler()
    except Exception as e:
        logger.warning("Langfuse callback not available: %s", e)
        return None

def _event_to_sse_lines(ev: Dict[str, Any], correlation_id: str) -> List[str]:
    out: List[str] = []
    kind = str(ev.get("event") or "")
    data = ev.get("data") or {}
    if kind == "on_chat_model_stream":
        chunk = data.get("chunk")
        raw_content = getattr(chunk, "content", None) if chunk is not None else None
        text = _stringify_llm_chunk_content(raw_content)
        if text:
            out.append(f'data: {json.dumps({"type": "token", "content": text, "correlationId": correlation_id})}\n\n')
    elif kind == "on_tool_start":
        name = data.get("name")
        raw_input = data.get("input")
        args = raw_input if isinstance(raw_input, dict) else {}
        if name:
            out.append(f'data: {json.dumps({"type": "tool_call", "toolName": name, "args": args, "correlationId": correlation_id})}\n\n')
    elif kind == "on_tool_end":
        name = data.get("name")
        out_obj = data.get("output")
        summary = str(out_obj)[:300] if out_obj is not None else ""
        if name:
            out.append(f'data: {json.dumps({"type": "tool_result", "toolName": name, "summary": summary, "durationMs": 0, "correlationId": correlation_id})}\n\n')
    return out

async def run_deep_agent_stream(
    *,
    agent_cfg: Dict[str, Any],
    effective_tools: List[Dict[str, Any]],
    skill_metadata: List[Dict[str, Any]],
    history: List[Dict[str, str]],
    summary: Optional[str],
    user_message: str,
    user_token: str,
    correlation_id: str,
    conn: Any,
) -> AsyncIterator[str]:
    if not (user_message or "").strip():
        yield (
            f'data: {json.dumps({"type": "error", "message": "message required", "correlationId": correlation_id})}\n\n'
        )
        return

    allowed_tool_names: Set[str] = {t["name"] for t in effective_tools}
    
    tools: List[Any] = []
    for meta in effective_tools:
        tools.append(_make_mcp_tool(meta, user_token, allowed_tool_names, correlation_id))

    system_prompt = build_system_prompt(agent_cfg, skill_metadata)
    model = _build_chat_model()

    graph = create_deep_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
    )

    msgs: List[Any] = []
    if summary:
        msgs.append(SystemMessage(content=f"[Previous conversation summary]\n{summary}"))
    for h in history:
        if h.get("role") == "user":
            u = (h.get("content") or "").strip()
            if u:
                msgs.append(HumanMessage(content=u))
        elif h.get("role") == "assistant":
            a = (h.get("content") or "").strip()
            if a:
                msgs.append(AIMessage(content=a))
    msgs.append(HumanMessage(content=(user_message or "").strip()))

    langfuse = _langfuse_handler(correlation_id)
    cfg: Dict[str, Any] = {"configurable": {"thread_id": f"acp-chat-{correlation_id}"}}
    if langfuse:
        cfg["callbacks"] = [langfuse]

    async for ev in graph.astream_events({"messages": msgs}, config=cfg, version="v2"):
        for line in _event_to_sse_lines(ev, correlation_id):
            yield line
