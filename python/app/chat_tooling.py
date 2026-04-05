"""Shared helpers for chat tool execution (MCP tokens)."""


def token_for_mcp(tool_meta: dict, user_token: str) -> str:
    """Use machine token for elevated tools when CAP supplied one; else user JWT (or Basic) string."""
    if tool_meta.get("elevated"):
        mt = (tool_meta.get("machineToken") or "").strip()
        if mt:
            return mt
    return user_token or ""
