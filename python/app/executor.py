"""
Thin-payload chat: hydrate from HANA, DeepAgent stream, Python-owned persistence (Plan 06 Phases 5–6).
"""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Dict, List

from . import db as dbmod
from . import deepagent_engine
from . import hydrator
from . import session_store

logger = logging.getLogger(__name__)


def _user_token_from_auth(authorization_header: str) -> str:
    h = authorization_header or ""
    if h.lower().startswith("bearer "):
        return h[7:].strip()
    return h.strip()


async def run(payload: Dict[str, Any], authorization_header: str = "") -> AsyncIterator[str]:
    user_token = _user_token_from_auth(authorization_header)
    message = (payload.get("message") or "").strip()
    if not message:
        yield f'data: {json.dumps({"type": "error", "message": "message required"})}\n\n'
        yield f'data: {json.dumps({"type": "done", "sessionId": None, "messageId": None})}\n\n'
        return

    tool_ids = payload.get("toolIds")
    if not isinstance(tool_ids, list):
        yield f'data: {json.dumps({"type": "error", "message": "Thin payload required: toolIds[] from CAP"})}\n\n'
        yield f'data: {json.dumps({"type": "done", "sessionId": None, "messageId": None})}\n\n'
        return

    agent_id = str(payload.get("agentId") or "").strip()
    if not agent_id:
        yield f'data: {json.dumps({"type": "error", "message": "agentId required"})}\n\n'
        yield f'data: {json.dumps({"type": "done", "sessionId": None, "messageId": None})}\n\n'
        return

    session_id = payload.get("sessionId")
    if session_id is not None:
        session_id = str(session_id).strip() or None

    skill_ids = payload.get("skillIds") or []
    if not isinstance(skill_ids, list):
        skill_ids = []

    user_info = payload.get("userInfo") or {}
    user_id = str(user_info.get("userId") or "").strip()
    if not user_id:
        yield f'data: {json.dumps({"type": "error", "message": "userInfo.userId required"})}\n\n'
        yield f'data: {json.dumps({"type": "done", "sessionId": None, "messageId": None})}\n\n'
        return

    conn = None
    try:
        conn = dbmod.get_connection()
        try:
            agent_cfg = hydrator.hydrate_agent(conn, agent_id)
            effective_tools, _allowed_names = hydrator.hydrate_tools_for_agent(
                conn, agent_id, [str(x) for x in tool_ids]
            )
            try:
                skill_meta = hydrator.hydrate_skill_metadata(conn, [str(x) for x in skill_ids])
            except Exception:
                skill_meta = []
        except PermissionError as e:
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
            yield f'data: {json.dumps({"type": "done", "sessionId": None, "messageId": None})}\n\n'
            return
        except ValueError as e:
            yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
            yield f'data: {json.dumps({"type": "done", "sessionId": None, "messageId": None})}\n\n'
            return

        summary: str | None = None
        history: List[Dict[str, str]] = []
        if session_id:
            try:
                summary, history, _owner = hydrator.hydrate_session(conn, session_id, user_id)
            except PermissionError as e:
                yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
                yield f'data: {json.dumps({"type": "done", "sessionId": None, "messageId": None})}\n\n'
                return
        else:
            title = message[:40]
            session_id = session_store.create_session(conn, user_id, agent_id, title)

        assistant_text = ""
        tool_records: List[Dict[str, Any]] = []

        async for line in deepagent_engine.run_deep_agent_stream(
            agent_cfg=agent_cfg,
            effective_tools=effective_tools,
            skill_metadata=skill_meta,
            history=history,
            summary=summary,
            user_message=message,
            user_token=user_token,
            conn=conn,
        ):
            if line.startswith("data: "):
                try:
                    evt = json.loads(line[6:].strip())
                    et = evt.get("type")
                    if et == "token":
                        assistant_text += str(evt.get("content") or "")
                    elif et == "tool_result":
                        tool_records.append(
                            {
                                "toolName": evt.get("toolName"),
                                "summary": evt.get("summary"),
                                "durationMs": evt.get("durationMs") or 0,
                                "args": evt.get("args"),
                                "elevatedUsed": False,
                            }
                        )
                except json.JSONDecodeError:
                    pass
            yield line

        asst_msg_id = session_store.append_messages(
            conn,
            session_id,
            message,
            assistant_text,
            tool_records,
        )

        try:
            session_store.summarize_if_needed(conn, session_id)
        except Exception as e:
            logger.warning("summarize_if_needed: %s", e)

        yield f'data: {json.dumps({"type": "done", "sessionId": session_id, "messageId": asst_msg_id})}\n\n'
    except Exception as e:
        logger.exception("executor.run failed: %s", e)
        yield f'data: {json.dumps({"type": "error", "message": str(e)})}\n\n'
        yield f'data: {json.dumps({"type": "done", "sessionId": None, "messageId": None})}\n\n'
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
