"""
DeepAgent (deepagents) orchestration + MCP + governed load_skill (Plan 06 Phase 6).
"""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional, Set

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import StructuredTool

from deepagents import create_deep_agent

from . import mcp_client
from .chat_tooling import token_for_mcp
from .config import (
    GOOGLE_API_KEY,
    LLM_API_KEY,
    LLM_MODEL,
    LLM_PROVIDER,
    LANGFUSE_HOST,
    LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY,
)
from .hydrator import load_skill_body

logger = logging.getLogger(__name__)


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


def _make_mcp_tool(meta: Dict[str, Any], user_token: str, allowed_names: Set[str]) -> StructuredTool:
    name = meta["name"]

    async def _run(**kwargs: Any) -> str:
        if name not in allowed_names:
            raise PermissionError(f"Tool {name} not in allowlist")
        url = (meta.get("mcpServerUrl") or "").strip()
        if not url:
            return json.dumps({"error": "No MCP URL for tool"})
        tok = token_for_mcp(meta, user_token)
        return await mcp_client.call_tool(url, name, kwargs, tok)

    return StructuredTool.from_function(
        name=name,
        description=str(meta.get("description") or "")[:8000],
        coroutine=_run,
    )


def _make_load_skill_tool(conn, allowed_skill_ids: Set[str]) -> StructuredTool:
    async def _load(skill_id: str) -> str:
        sid = str(skill_id).strip()
        if sid not in allowed_skill_ids:
            raise PermissionError("Skill not allowlisted")
        return load_skill_body(conn, sid)

    return StructuredTool.from_function(
        name="load_skill",
        description="Load governed skill markdown body by skill UUID.",
        coroutine=_load,
    )


def _stringify_llm_chunk_content(raw: Any) -> str:
    """AIMessageChunk.content may be str or list of block dicts — UI expects a single string in SSE."""
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    if isinstance(raw, list):
        parts: List[str] = []
        for item in raw:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text", item.get("content", "")) or ""))
            else:
                t = getattr(item, "text", None)
                if t is not None:
                    parts.append(str(t))
        return "".join(parts)
    return str(raw)


def _langfuse_handler():
    """Langfuse 4.x reads keys from env; CallbackHandler() uses trace context."""
    if not (LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY):
        return None
    import os

    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", LANGFUSE_PUBLIC_KEY)
    os.environ.setdefault("LANGFUSE_SECRET_KEY", LANGFUSE_SECRET_KEY)
    os.environ.setdefault("LANGFUSE_HOST", LANGFUSE_HOST)
    try:
        from langfuse.langchain import CallbackHandler

        return CallbackHandler()
    except Exception as e:
        logger.warning("Langfuse callback not available: %s", e)
        return None


def _event_to_sse_lines(ev: Dict[str, Any]) -> List[str]:
    out: List[str] = []
    kind = str(ev.get("event") or "")
    data = ev.get("data") or {}

    if kind == "on_chat_model_stream":
        chunk = data.get("chunk")
        raw_content = getattr(chunk, "content", None) if chunk is not None else None
        text = _stringify_llm_chunk_content(raw_content)
        if text:
            out.append(f'data: {json.dumps({"type": "token", "content": text})}\n\n')

    elif kind == "on_tool_start":
        name = data.get("name")
        raw_input = data.get("input")
        if not name and isinstance(raw_input, dict):
            name = raw_input.get("name")
        args = raw_input if isinstance(raw_input, dict) else {}
        if name:
            out.append(f'data: {json.dumps({"type": "tool_call", "toolName": name, "args": args})}\n\n')
        if name and "todo" in str(name).lower():
            out.append(
                f'data: {json.dumps({"type": "planning", "todos": [{"text": str(args), "status": "in-progress"}]})}\n\n'
            )

    elif kind == "on_tool_end":
        name = data.get("name")
        out_obj = data.get("output")
        summary = str(out_obj)[:300] if out_obj is not None else ""
        if name:
            out.append(
                f'data: {json.dumps({"type": "tool_result", "toolName": name, "summary": summary, "durationMs": 0})}\n\n'
            )

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
    conn: Any,
) -> AsyncIterator[str]:
    """SSE lines for tokens, tool_call, tool_result, planning; no final `done` (executor adds after persistence)."""
    allowed_tool_names: Set[str] = {t["name"] for t in effective_tools}
    allowed_skill_ids: Set[str] = {str(s.get("id")) for s in skill_metadata if s.get("id")}

    tools: List[Any] = []
    for meta in effective_tools:
        tools.append(_make_mcp_tool(meta, user_token, allowed_tool_names))
    if allowed_skill_ids:
        tools.append(_make_load_skill_tool(conn, allowed_skill_ids))

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
            msgs.append(HumanMessage(content=h.get("content") or ""))
        elif h.get("role") == "assistant":
            msgs.append(AIMessage(content=h.get("content") or ""))
    msgs.append(HumanMessage(content=user_message))

    langfuse = _langfuse_handler()
    cfg: Dict[str, Any] = {"configurable": {"thread_id": "acp-chat"}}
    if langfuse:
        cfg["callbacks"] = [langfuse]

    async for ev in graph.astream_events({"messages": msgs}, config=cfg, version="v2"):
        for line in _event_to_sse_lines(ev):
            yield line
