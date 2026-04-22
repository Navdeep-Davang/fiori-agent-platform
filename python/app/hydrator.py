"""
Load Agent, Tool, Skill, and ChatSession rows from HANA by id (Plan 06 Phase 5).
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from . import db as dbmod

logger = logging.getLogger(__name__)


def _row_get(row: Dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in row and row[k] is not None:
            return row[k]
    return None


def resolve_mcp_base_url(destination_name: str, base_url: str) -> str:
    """Match CAP behavior: prefer explicit baseUrl; optional env override for destination-only servers."""
    bu = (base_url or "").strip().rstrip("/")
    if bu:
        return bu
    dn = (destination_name or "").strip()
    if not dn:
        return ""
    safe = "".join(c if c.isalnum() else "_" for c in dn.upper())
    return (os.environ.get(f"ACP_MCP_URL_{safe}") or "").strip().rstrip("/")


def effective_elevated(perm: str, tool_elev: bool, identity_mode: str) -> Optional[bool]:
    if perm == "ForceDelegated":
        return False
    if perm == "ForceElevated":
        if identity_mode == "Mixed" and tool_elev:
            return True
        return None
    return bool(tool_elev)


def hydrate_agent(conn, agent_id: str) -> Dict[str, Any]:
    rows = dbmod.query_as_dicts(
        conn,
        "SELECT * FROM acp_Agent WHERE ID = ? AND status = 'Active'",
        [agent_id],
    )
    if not rows:
        raise ValueError("Agent not found or inactive")
    r = rows[0]
    return {
        "id": str(_row_get(r, "ID", "id")),
        "systemPrompt": _row_get(r, "systemPrompt", "SYSTEMPROMPT") or "",
        "modelProfile": _row_get(r, "modelProfile", "MODELPROFILE") or "Fast",
        "identityMode": _row_get(r, "identityMode", "IDENTITYMODE") or "Delegated",
    }


def hydrate_tools_for_agent(
    conn, agent_id: str, requested_tool_ids: List[str]
) -> Tuple[List[Dict[str, Any]], set]:
    """
    Returns effectiveTools list (same shape CAP used) + allowed tool names set.
    Rejects tampered tool IDs (not linked to agent or not Active).
    """
    if not requested_tool_ids:
        return [], set()

    placeholders = ",".join(["?"] * len(requested_tool_ids))
    q = f"""
      SELECT agt.permissionOverride AS permissionOverride, t.ID AS toolId, t.name AS name, t.description AS description,
             t.inputSchema AS inputSchema, t.elevated AS elevated, t.status AS status,
             s.destinationName AS destinationName, s.baseUrl AS baseUrl,
             a.identityMode AS identityMode
      FROM acp_AgentTool agt
      INNER JOIN acp_Tool t ON t.ID = agt.tool_ID
      INNER JOIN acp_Agent a ON a.ID = agt.agent_ID
      INNER JOIN acp_McpServer s ON s.ID = t.server_ID
      WHERE agt.agent_ID = ? AND t.ID IN ({placeholders}) AND t.status = 'Active'
    """
    rows = dbmod.query_as_dicts(conn, q, [agent_id, *requested_tool_ids])
    fetched_ids = {str(_row_get(r, "toolId", "TOOLID")) for r in rows}
    req = {str(x) for x in requested_tool_ids}
    if req != fetched_ids:
        raise PermissionError("toolIds do not match active AgentTool assignments for this agent")

    machine_tok = (os.environ.get("MCP_MACHINE_TOKEN") or "").strip()
    out: List[Dict[str, Any]] = []
    allowed_names: set = set()

    for r in rows:
        name = _row_get(r, "name", "NAME")
        if not name:
            continue
        perm = (_row_get(r, "permissionOverride", "PERMISSIONOVERRIDE") or "Inherit")
        elev = effective_elevated(
            perm,
            bool(_row_get(r, "elevated", "ELEVATED")),
            str(_row_get(r, "identityMode", "IDENTITYMODE") or "Delegated"),
        )
        if elev is None:
            raise ValueError(f"Invalid permission override for tool {name}")

        mcp_url = resolve_mcp_base_url(
            str(_row_get(r, "destinationName", "DESTINATIONNAME") or ""),
            str(_row_get(r, "baseUrl", "BASEURL") or ""),
        )
        if not mcp_url:
            logger.warning("Tool %s has no resolvable MCP base URL (set McpServer.baseUrl or ACP_MCP_URL_*)", name)

        eff_elev = bool(elev)
        out.append(
            {
                "name": str(name),
                "description": str(_row_get(r, "description", "DESCRIPTION") or ""),
                "inputSchema": _parse_schema(_row_get(r, "inputSchema", "INPUTSCHEMA")),
                "mcpServerUrl": mcp_url,
                "elevated": eff_elev,
                "machineToken": machine_tok if eff_elev else None,
            }
        )
        allowed_names.add(str(name))

    return out, allowed_names


def _parse_schema(raw: Any) -> Dict[str, Any]:
    if raw is None:
        return {"type": "object", "properties": {}}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"type": "object", "properties": {}}
    return {"type": "object", "properties": {}}


def hydrate_skill_metadata(conn, skill_ids: List[str]) -> List[Dict[str, Any]]:
    if not skill_ids:
        return []
    placeholders = ",".join(["?"] * len(skill_ids))
    rows = dbmod.query_as_dicts(
        conn,
        f"""
        SELECT ID, name, description, status
        FROM acp_Skill
        WHERE ID IN ({placeholders}) AND status = 'Active'
        """,
        list(skill_ids),
    )
    meta = []
    for r in rows:
        meta.append(
            {
                "id": str(_row_get(r, "ID", "id")),
                "name": str(_row_get(r, "name", "NAME") or ""),
                "description": str(_row_get(r, "description", "DESCRIPTION") or ""),
            }
        )
    return meta


def load_skill_body(conn, skill_id: str) -> str:
    rows = dbmod.query_as_dicts(
        conn,
        "SELECT body FROM acp_Skill WHERE ID = ? AND status = 'Active'",
        [skill_id],
    )
    if not rows:
        raise ValueError("Skill not found or inactive")
    b = _row_get(rows[0], "body", "BODY")
    return str(b) if b is not None else ""


def hydrate_session(
    conn, session_id: str, user_id: str
) -> Tuple[Optional[str], List[Dict[str, str]], str]:
    """
    Returns (summary, history as role/content list, user_id_from_row).
    history: messages with timestamp > summaryWatermark if set, else all.
    """
    sess = dbmod.query_as_dicts(
        conn,
        "SELECT userId, summary, summaryWatermark FROM acp_ChatSession WHERE ID = ?",
        [session_id],
    )
    if not sess:
        raise ValueError("Session not found")
    row = sess[0]
    owner = str(_row_get(row, "userId", "USERID") or "")
    if owner != user_id:
        raise PermissionError("Session ownership mismatch")

    summary = _row_get(row, "summary", "SUMMARY")
    summary = str(summary) if summary else None
    wm = _row_get(row, "summaryWatermark", "SUMMARYWATERMARK")

    if wm:
        msgs = dbmod.query_as_dicts(
            conn,
            """
            SELECT role, content, timestamp FROM acp_ChatMessage
            WHERE session_ID = ? AND timestamp > ?
            ORDER BY timestamp ASC
            """,
            [session_id, wm],
        )
    else:
        msgs = dbmod.query_as_dicts(
            conn,
            """
            SELECT role, content, timestamp FROM acp_ChatMessage
            WHERE session_ID = ?
            ORDER BY timestamp ASC
            """,
            [session_id],
        )

    hist: List[Dict[str, str]] = []
    for m in msgs or []:
        role = _row_get(m, "role", "ROLE")
        content = _row_get(m, "content", "CONTENT")
        if role in ("user", "assistant"):
            hist.append({"role": str(role), "content": str(content or "")})

    return summary, hist, owner
