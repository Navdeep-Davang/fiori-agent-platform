"""
Google ADK–backed chat turn for Gemini.

CAP still owns governance (effectiveTools, userToken, history). Each HTTP request
runs one ADK ``Runner`` + ``LlmAgent`` turn: session is request-scoped (in-memory),
and CAP history is replayed into ADK session events before the new user message.

This is the supported path for Gemini: ADK provides runners, streaming (SSE mode),
tool loops, and access to other ADK features (memory, artifacts, plugins) as you
extend the app.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, AsyncIterator, Dict, List

from google.adk.agents.llm_agent import LlmAgent
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.events.event import Event
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.models.google_llm import Gemini
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.base_toolset import BaseToolset
from google.genai import types

from . import mcp_client
from .chat_tooling import token_for_mcp
from .config import GOOGLE_API_KEY, LLM_MODEL

logger = logging.getLogger(__name__)

APP_NAME = "acp"
ROOT_AGENT_NAME = "acp_governed_agent"


def _bare_model_name_for_adk(raw: str) -> str:
    """``Gemini`` model field expects an id without the ``models/`` prefix."""
    m = (raw or "").strip()
    if m.startswith("models/"):
        return m[len("models/") :]
    return m


def _tool_meta_get(meta: Dict[str, Any], *keys: str) -> Any:
    """HANA/JSON may use camelCase or UPPER keys from CAP."""
    for k in keys:
        if k in meta and meta[k] is not None:
            return meta[k]
    return None


class _AcpMcpBridgeTool(BaseTool):
    """Single governed tool: declaration from CAP, execution via existing MCP client."""

    def __init__(self, meta: Dict[str, Any]) -> None:
        self._meta = dict(meta)
        name = _tool_meta_get(self._meta, "name", "NAME")
        if name is None or str(name).strip() == "":
            raise ValueError("Governed tool meta must include name (camelCase or NAME)")
        self._meta["name"] = str(name)
        super().__init__(
            name=self._meta["name"],
            description=str(_tool_meta_get(self._meta, "description", "DESCRIPTION") or "")[:16000],
        )

    def _get_declaration(self) -> types.FunctionDeclaration:
        schema = self._meta.get("inputSchema") or self._meta.get("INPUTSCHEMA")
        if not isinstance(schema, dict):
            schema = {"type": "object", "properties": {}}
        return types.FunctionDeclaration(
            name=self._meta["name"],
            description=str(_tool_meta_get(self._meta, "description", "DESCRIPTION") or "")[:16000],
            parameters_json_schema=schema,
        )

    async def run_async(self, *, args: dict[str, Any], tool_context: Any) -> Any:
        user_tok = tool_context.state.get("acp_user_token") or ""
        url = str(
            _tool_meta_get(self._meta, "mcpServerUrl", "MCPSERVERURL") or ""
        ).strip()
        if not url:
            return {"error": "No MCP server URL for this tool"}
        try:
            out = await mcp_client.call_tool(
                url,
                self._meta["name"],
                args,
                token_for_mcp(self._meta, user_tok),
            )
            return {"result": out}
        except Exception as e:
            logger.exception("MCP tool %s failed", self._meta.get("name"))
            return {"error": str(e)}


class AcpGovernedMcpToolset(BaseToolset):
    """Builds one ``BaseTool`` per row in session state ``acp_effective_tools``."""

    async def get_tools(self, readonly_context: Any = None) -> List[BaseTool]:
        if readonly_context is None:
            return []
        raw = readonly_context.state.get("acp_effective_tools")
        if not raw:
            return []
        return [_AcpMcpBridgeTool(dict(t)) for t in raw]


async def _replay_cap_history(
    session_service: InMemorySessionService,
    session: Any,
    agent_name: str,
    history: List[Dict[str, Any]],
    bootstrap_invocation_id: str,
) -> None:
    for turn in history:
        role = turn.get("role")
        text = turn.get("content") or ""
        if role == "user":
            author = "user"
            content = types.Content(
                role="user", parts=[types.Part.from_text(text=text)]
            )
        else:
            author = agent_name
            content = types.Content(
                role="model", parts=[types.Part.from_text(text=text)]
            )
        ev = Event(
            invocation_id=bootstrap_invocation_id,
            author=author,
            content=content,
        )
        await session_service.append_event(session=session, event=ev)


def _iter_token_sse_lines(text: str):
    step = 32
    for i in range(0, len(text), step):
        chunk = text[i : i + step]
        yield f'data: {json.dumps({"type": "token", "content": chunk})}\n\n'


async def _map_adk_event_to_sse(event: Event) -> AsyncIterator[str]:
    """
    Pattern A from ADK RunConfig docs: stream partial text only; final aggregate
    text is skipped to avoid duplicates. Final non-partial function calls are emitted.
    """
    if event.partial and event.content and event.content.parts:
        if any(p.function_call for p in event.content.parts):
            return
        text = "".join(
            (p.text or "")
            for p in event.content.parts
            if not getattr(p, "thought", None)
        )
        if text:
            for line in _iter_token_sse_lines(text):
                yield line
        return

    if not event.partial:
        for fc in event.get_function_calls() or []:
            if not fc or not fc.name:
                continue
            args = dict(fc.args or {})
            yield f'data: {json.dumps({"type": "tool_call", "toolName": fc.name, "args": args})}\n\n'

        for fr in event.get_function_responses() or []:
            if not fr or not fr.name:
                continue
            summary = "Tool completed"
            if isinstance(fr.response, dict):
                summary = str(fr.response.get("result", ""))[:200] or summary
            elif fr.response is not None:
                summary = str(fr.response)[:200]
            yield f'data: {json.dumps({"type": "tool_result", "toolName": fr.name, "summary": summary, "durationMs": 0})}\n\n'


async def run_adk_chat(payload: dict) -> AsyncIterator[str]:
    from google.adk.agents.run_config import RunConfig, StreamingMode

    if not GOOGLE_API_KEY:
        yield f'data: {json.dumps({"type": "error", "message": "GOOGLE_API_KEY is not set"})}\n\n'
        return

    agent_config = payload.get("agentConfig") or {}
    effective_tools = payload.get("effectiveTools") or []
    user_message = payload.get("message") or ""
    history = payload.get("history") or []
    user_token = payload.get("userToken") or ""
    user_id = (payload.get("userInfo") or {}).get("userId") or "anonymous"

    system_prompt = agent_config.get("systemPrompt") or "You are a helpful assistant."

    session_service = InMemorySessionService()
    runner = Runner(
        app_name=APP_NAME,
        agent=LlmAgent(
            name=ROOT_AGENT_NAME,
            model=Gemini(model=_bare_model_name_for_adk(LLM_MODEL)),
            instruction=system_prompt,
            tools=[AcpGovernedMcpToolset()],
        ),
        session_service=session_service,
        artifact_service=InMemoryArtifactService(),
        memory_service=InMemoryMemoryService(),
        auto_create_session=True,
    )

    adk_session_id = str(uuid.uuid4())
    bootstrap_iid = f"cap-hist-{uuid.uuid4()}"

    try:
        session = await session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=adk_session_id,
            state={
                "acp_user_token": user_token,
                "acp_effective_tools": effective_tools,
            },
        )

        await _replay_cap_history(
            session_service, session, ROOT_AGENT_NAME, history, bootstrap_iid
        )

        new_message = types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_message)],
        )

        run_config = RunConfig(streaming_mode=StreamingMode.SSE)

        async for event in runner.run_async(
            user_id=user_id,
            session_id=adk_session_id,
            new_message=new_message,
            run_config=run_config,
        ):
            async for line in _map_adk_event_to_sse(event):
                yield line
    except Exception as e:
        logger.exception("ADK run failed: %s", e)
        yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
    finally:
        await runner.close()
