"""Shared helpers for chat tool execution (MCP tokens).

Plan 06 Phase 11.1: delegated tools use the forwarded user token string; elevated tools
prefer MCP_MACHINE_TOKEN when set — do not pass a raw browser JWT to MCP unless the
server is configured to accept it (see architecture §13.5).
"""


def token_for_mcp(tool_meta: dict, user_token: str) -> str:
    """Use machine token for elevated tools when CAP supplied one; else user JWT (or Basic) string."""
    if tool_meta.get("elevated"):
        mt = (tool_meta.get("machineToken") or "").strip()
        if mt:
            return mt
    return user_token or ""
