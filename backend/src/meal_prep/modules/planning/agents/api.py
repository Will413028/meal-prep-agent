import json
from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Any

from ag_ui.core import CustomEvent, RunAgentInput
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from pydantic_ai import AgentRunResult
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.ui.ag_ui import AGUIAdapter
from pydantic_ai.usage import UsageLimits

from ..contracts import BuildProposalRequest
from .runtime import PlanningRun, planning_agent

router = APIRouter()


@router.post("/agent")
async def run(request: Request) -> Response:
    model = getattr(request.app.state, "planning_model", None)
    if model is None:
        return JSONResponse({"error": "model_unavailable"}, status_code=503)
    try:
        raw = json.loads(await request.body(), parse_float=Decimal)
        incoming = RunAgentInput.model_validate(raw)
        texts = []
        for message in incoming.messages:
            text = getattr(message, "content", None)
            if (
                message.role not in {"user", "assistant"}
                or not isinstance(text, str)
                or not 1 <= len(text) <= 2000
                or getattr(message, "tool_calls", None)
            ):
                raise ValueError("unsupported message")
            texts.append(text)
        if (
            incoming.state != {}
            or incoming.tools
            or incoming.context
            or not 1 <= len(incoming.messages) <= 12
            or incoming.messages[-1].role != "user"
            or sum(map(len, texts)) > 8000
            or set(incoming.forwarded_props) != {"planning"}
        ):
            raise ValueError("unsupported client context")
        planning = BuildProposalRequest.model_validate(
            incoming.forwarded_props["planning"]
        )
        if incoming.run_id != str(planning.context.runId) or incoming.thread_id != str(
            planning.context.planId
        ):
            raise ValueError("context mismatch")
    except (ValueError, TypeError, AttributeError, ValidationError):
        return JSONResponse({"error": "invalid_agent_request"}, status_code=422)
    deps = PlanningRun(planning)
    adapter = AGUIAdapter(agent=planning_agent(model), run_input=incoming)

    async def complete(result: AgentRunResult[Any]) -> AsyncIterator[CustomEvent]:
        usage = result.usage
        yield CustomEvent(
            name="run_usage",
            value={
                "runId": incoming.run_id,
                "model": model.model_name,
                "inputTokens": usage.input_tokens,
                "outputTokens": usage.output_tokens,
                "requests": usage.requests,
                "toolCalls": usage.tool_calls,
            },
        )
        calls = [
            part.tool_call_id
            for message in result.new_messages()
            for part in message.parts
            if isinstance(part, ToolCallPart) and part.tool_name == "build_proposal"
        ]
        outcome = deps.result
        if not calls or calls[-1] != deps.completed_tool_call or outcome is None:
            return
        if outcome.status == "ready" and outcome.proposal is not None:
            yield CustomEvent(
                name="proposal_ready",
                value={
                    "runId": incoming.run_id,
                    "proposal": outcome.proposal.model_dump(mode="json"),
                },
            )
        else:
            yield CustomEvent(
                name="proposal_unavailable",
                value={
                    "runId": incoming.run_id,
                    "reason": outcome.reason,
                },
            )

    return adapter.streaming_response(
        adapter.run_stream(
            deps=deps,
            on_complete=complete,
            usage_limits=UsageLimits(request_limit=4, tool_calls_limit=8),
            model_settings={"max_tokens": 2048, "timeout": 60},
        )
    )
