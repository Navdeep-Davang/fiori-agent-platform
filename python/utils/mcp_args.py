"""Normalize MCP tool ``arguments`` payloads (LangGraph / StructuredTool quirks)."""

from __future__ import annotations

from typing import Any, Dict


def flatten_tool_arguments(arguments: Dict[str, Any] | None) -> Dict[str, Any]:
    """
    DeepAgents / LangGraph often pass tool inputs as ``{"kwargs": {...}}``.
    Domain handlers expect flat keyword args for ``tool_func(conn, **arguments)``.
    """
    a = dict(arguments or {})
    while len(a) == 1 and "kwargs" in a and isinstance(a["kwargs"], dict):
        a = dict(a["kwargs"])
    if "kwargs" in a and isinstance(a.get("kwargs"), dict):
        inner = dict(a["kwargs"])
        rest = {k: v for k, v in a.items() if k != "kwargs"}
        a = {**inner, **rest} if rest else inner
    return a
