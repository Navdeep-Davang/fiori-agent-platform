"""
Append-only chat persistence in HANA (Plan 06 Phase 5 + Phase 9 summarization).
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from . import db as dbmod
from .config import LLM_API_KEY, LLM_MODEL, LLM_PROVIDER, SUMMARY_TOKEN_THRESHOLD

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="milliseconds") + "Z"


def create_session(conn, user_id: str, agent_id: str, title: str) -> str:
    sid = str(uuid.uuid4())
    now = _now_iso()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO acp_ChatSession (ID, agentId, userId, title, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (sid, agent_id, user_id, title[:200], now, now),
        )
        conn.commit()
    finally:
        cur.close()
    return sid


def append_messages(
    conn,
    session_id: str,
    user_content: str,
    assistant_content: str,
    tool_records: List[Dict[str, Any]],
) -> str:
    """Returns assistant message ID."""
    now = _now_iso()
    user_msg_id = str(uuid.uuid4())
    asst_msg_id = str(uuid.uuid4())
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE acp_ChatSession SET updatedAt = ? WHERE ID = ?",
            (now, session_id),
        )
        cur.execute(
            """
            INSERT INTO acp_ChatMessage (ID, session_ID, role, content, timestamp)
            VALUES (?, ?, 'user', ?, ?)
            """,
            (user_msg_id, session_id, user_content, now),
        )
        cur.execute(
            """
            INSERT INTO acp_ChatMessage (ID, session_ID, role, content, timestamp)
            VALUES (?, ?, 'assistant', ?, ?)
            """,
            (asst_msg_id, session_id, assistant_content or "(empty)", _now_iso()),
        )
        for tr in tool_records:
            cur.execute(
                """
                INSERT INTO acp_ToolCallRecord
                (ID, message_ID, toolName, arguments, resultSummary, durationMs, elevatedUsed, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    asst_msg_id,
                    tr.get("toolName") or "unknown",
                    json.dumps(tr.get("args") if tr.get("args") is not None else {}),
                    str(tr.get("summary") or "")[:5000],
                    int(tr.get("durationMs") or 0),
                    1 if tr.get("elevatedUsed") else 0,
                    _now_iso(),
                ),
            )
        conn.commit()
    finally:
        cur.close()
    return asst_msg_id


def _rough_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def summarize_if_needed(
    conn,
    session_id: str,
) -> None:
    """
    If total rough token count exceeds SUMMARY_TOKEN_THRESHOLD, summarize oldest 50%% of messages
    since last watermark and update ChatSession.summary / summaryWatermark.
    """
    rows = dbmod.query_as_dicts(
        conn,
        "SELECT summary, summaryWatermark FROM acp_ChatSession WHERE ID = ?",
        [session_id],
    )
    if not rows:
        return

    # Load all messages for the session to evaluate volume
    all_msgs = dbmod.query_as_dicts(
        conn,
        """
        SELECT ID, role, content, timestamp FROM acp_ChatMessage
        WHERE session_ID = ?
        ORDER BY timestamp ASC
        """,
        [session_id],
    )
    if not all_msgs:
        return

    total_chars = sum(len(str(m.get("content") or m.get("CONTENT") or "")) for m in all_msgs)
    if _rough_tokens("x" * total_chars) < SUMMARY_TOKEN_THRESHOLD:
        return

    # Oldest half of messages (by count) for summarization payload
    n = len(all_msgs)
    half = max(1, n // 2)
    to_summarize = all_msgs[:half]
    chunk = "\n".join(
        f"{m.get('role') or m.get('ROLE')}: {m.get('content') or m.get('CONTENT')}"
        for m in to_summarize
    )

    summary_text = _call_summarization_llm(chunk)
    if not summary_text:
        return

    last_ts = to_summarize[-1].get("timestamp") or to_summarize[-1].get("TIMESTAMP")
    wm = last_ts
    cur = conn.cursor()
    try:
        try:
            cur.execute(
                """
                UPDATE acp_ChatSession
                SET summary = ?, summaryWatermark = ?
                WHERE ID = ?
                """,
                (summary_text, wm, session_id),
            )
            conn.commit()
        except Exception as ex:
            logger.warning("Could not persist summary (deploy schema with summary columns?): %s", ex)
    finally:
        cur.close()


def _call_summarization_llm(text: str) -> Optional[str]:
    """Lightweight summarization using the configured chat model (Phase 9)."""
    prompt = (
        "Summarize the following conversation turns for the assistant's context. "
        "Be concise (bullet points ok). Focus on facts, decisions, and open tasks.\n\n" + text[:120_000]
    )
    try:
        if LLM_PROVIDER == "google-genai":
            from langchain_google_genai import ChatGoogleGenerativeAI
            from langchain_core.messages import HumanMessage

            api_key = LLM_API_KEY or __import__("os").environ.get("GOOGLE_API_KEY")
            llm = ChatGoogleGenerativeAI(model=LLM_MODEL, google_api_key=api_key)
            out = llm.invoke([HumanMessage(content=prompt)])
            return (out.content or "").strip() or None
        if LLM_PROVIDER == "anthropic":
            from langchain_anthropic import ChatAnthropic
            from langchain_core.messages import HumanMessage

            llm = ChatAnthropic(model=LLM_MODEL, api_key=LLM_API_KEY)
            out = llm.invoke([HumanMessage(content=prompt)])
            return (out.content or "").strip() or None
        if LLM_PROVIDER == "openai":
            from langchain_openai import ChatOpenAI
            from langchain_core.messages import HumanMessage

            llm = ChatOpenAI(model=LLM_MODEL, api_key=LLM_API_KEY)
            out = llm.invoke([HumanMessage(content=prompt)])
            return (out.content or "").strip() or None
    except Exception as e:
        logger.warning("Summarization LLM call failed: %s", e)
    return None
