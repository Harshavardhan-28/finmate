"""Agent-activity trace: an ADK plugin that reports every agent start and tool call/result.

The plugin is inherited by the specialist sub-runners that AgentTool creates, so one queue
sees the whole supervisor -> specialist -> MCP tool chain. The API streams it to the UI.
"""
import asyncio
import json
from contextvars import ContextVar

from google.adk.plugins import BasePlugin

current_queue: ContextVar[asyncio.Queue | None] = ContextVar("finmate_trace_queue", default=None)

_MAX = 1500


def _short(value) -> object:
    text = json.dumps(value, default=str, ensure_ascii=False)
    return value if len(text) <= _MAX else text[:_MAX] + "…"


def emit(kind: str, **data) -> None:
    q = current_queue.get()
    if q is not None:
        q.put_nowait(("trace", {"kind": kind, **data}))


class TracePlugin(BasePlugin):
    def __init__(self):
        super().__init__(name="finmate_trace")

    async def before_agent_callback(self, *, agent, callback_context):
        emit("agent_start", agent=agent.name)

    async def after_agent_callback(self, *, agent, callback_context):
        emit("agent_end", agent=agent.name)

    async def before_tool_callback(self, *, tool, tool_args, tool_context):
        emit("tool_call", agent=tool_context.agent_name, tool=tool.name, args=_short(tool_args))

    async def after_tool_callback(self, *, tool, tool_args, tool_context, result):
        emit("tool_result", agent=tool_context.agent_name, tool=tool.name, result=_short(result),
             raw=result if tool.name in ("propose_expense", "save_expense", "propose_bill", "save_bill") else None)

    async def on_tool_error_callback(self, *, tool, tool_args, tool_context, error):
        emit("tool_error", agent=tool_context.agent_name, tool=tool.name, error=str(error))
