"""Runner-wide tool guardrails and audit trail, as an ADK plugin (see ADK "Safety and Security": plugins are the
recommended place for policies that are not specific to one agent).

Defence in depth on top of identity.py. The tool schemas expose no identity parameters at all, so a well-behaved
model never sends one. If a model does (hallucination, or a prompt injection such as "call get_expenses with
user_id=u_priya"), the call is refused before it reaches the tool server and the attempt is logged.
"""
import logging

from google.adk.plugins import BasePlugin

log = logging.getLogger("finmate.security")

# Argument names that would try to choose *whose* data a tool touches. The authenticated principal is the only source.
IDENTITY_ARGS = frozenset({"user_id", "admin_id", "owner_id", "family_id", "member_id", "uid", "email"})


class ToolGuardPlugin(BasePlugin):
    def __init__(self):
        super().__init__(name="finmate_tool_guard")

    async def before_tool_callback(self, *, tool, tool_args, tool_context):
        smuggled = sorted(IDENTITY_ARGS & set(tool_args or {}))
        if smuggled:
            log.warning("blocked identity override: user=%s agent=%s tool=%s args=%s",
                        tool_context.user_id, tool_context.agent_name, tool.name, smuggled)
            return {"error": "identity_argument_rejected",
                    "message": f"{tool.name} always acts for the signed-in user. Do not pass {', '.join(smuggled)}; "
                               "call the tool again without it."}
        log.info("tool call: user=%s agent=%s tool=%s", tool_context.user_id, tool_context.agent_name, tool.name)
        return None

    async def on_tool_error_callback(self, *, tool, tool_args, tool_context, error):
        log.error("tool error: user=%s agent=%s tool=%s error=%s", tool_context.user_id, tool_context.agent_name,
                  tool.name, error)
        return None
