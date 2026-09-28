import asyncio
import json
import math
from collections.abc import AsyncGenerator, AsyncIterator
from decimal import Decimal
from time import monotonic
from typing import Any

from ag_ui.core import BaseEvent, CustomEvent, RunAgentInput, RunErrorEvent
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
from pydantic_ai import AgentRunResult
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.usage import UsageLimits

from meal_prep.platform.sse import with_heartbeat

from ..contracts import BuildProposalRequest
from .fixture import fixture_choice, fixture_model
from .runtime import PlanningRun, planning_agent
from .transport import PlanningAdapter

router = APIRouter()
RUN_TIMEOUT_SECONDS = 60.0


class RuntimeStatus(BaseModel):
    liveAvailable: bool


@router.get("/api/v1/runtime", response_model=RuntimeStatus)
def runtime(request: Request, response: Response) -> RuntimeStatus:
    response.headers["cache-control"] = "no-store"
    return RuntimeStatus(
        liveAvailable=getattr(request.app.state, "planning_model", None) is not None
    )


@router.post("/agent")
async def run(request: Request) -> Response:
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
            or not 1 <= len(incoming.messages) <= 8
            or incoming.messages[-1].role != "user"
            or sum(map(len, texts)) > 8000
            or "planning" not in incoming.forwarded_props
            or set(incoming.forwarded_props) - {"planning", "mode"}
            or incoming.forwarded_props.get("mode", "fixture")
            not in {"fixture", "live"}
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
    mode = incoming.forwarded_props.get("mode", "fixture")
    fixture = fixture_choice(planning) if mode == "fixture" else None
    model = (
        fixture_model(fixture.replacement)
        if fixture is not None
        else getattr(request.app.state, "planning_model", None)
    )
    if model is None:
        return JSONResponse({"error": "model_unavailable"}, status_code=503)
    retry_at = getattr(request.app.state, "model_retry_at", 0.0)
    if mode == "live" and retry_at > monotonic():
        return JSONResponse(
            {"error": "model_quota"},
            status_code=429,
            headers={
                "retry-after": str(math.ceil(retry_at - monotonic())),
                "cache-control": "no-store",
            },
        )
    deps = PlanningRun(
        planning,
        fixture_unavailable_reason=fixture.unavailable_reason if fixture else None,
    )
    adapter = PlanningAdapter(agent=planning_agent(model), run_input=incoming)

    async def complete(result: AgentRunResult[Any]) -> AsyncIterator[CustomEvent]:
        usage = result.usage
        yield CustomEvent(
            name="run_usage",
            value={
                "runId": incoming.run_id,
                "model": model.model_name,
                "mode": mode,
                "inputTokens": usage.input_tokens,
                "outputTokens": usage.output_tokens,
                "requests": usage.requests,
                "toolCalls": usage.tool_calls,
            },
        )
        calls = [
            (part.tool_name, part.tool_call_id)
            for message in result.new_messages()
            for part in message.parts
            if isinstance(part, ToolCallPart)
        ]
        outcome = deps.result
        if not calls:
            yield CustomEvent(
                name="proposal_unavailable",
                value={"runId": incoming.run_id, "reason": "model_no_proposal"},
            )
            return
        if calls[-1][1] != deps.completed_tool_call or calls[-1][0] not in {
            "build_proposal",
            "ask_clarification",
        }:
            yield CustomEvent(
                name="proposal_unavailable",
                value={"runId": incoming.run_id, "reason": "model_no_proposal"},
            )
            return
        if calls[-1][0] == "ask_clarification":
            if deps.clarification is not None:
                yield CustomEvent(
                    name="clarification_required",
                    value={"runId": incoming.run_id, "missing": deps.clarification},
                )
            else:
                yield CustomEvent(
                    name="proposal_unavailable",
                    value={"runId": incoming.run_id, "reason": "model_no_proposal"},
                )
            return
        if outcome is None:
            yield CustomEvent(
                name="proposal_unavailable",
                value={"runId": incoming.run_id, "reason": "model_no_proposal"},
            )
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

    async def bounded_run() -> AsyncGenerator[BaseEvent]:
        try:
            async with asyncio.timeout(RUN_TIMEOUT_SECONDS):
                async for event in adapter.run_stream(
                    deps=deps,
                    on_complete=complete,
                    usage_limits=UsageLimits(
                        request_limit=4,
                        tool_calls_limit=8,
                        input_tokens_limit=120000,
                        output_tokens_limit=8192,
                    ),
                    model_settings={"max_tokens": 2048, "timeout": 60},
                ):
                    if (
                        mode == "live"
                        and isinstance(event, RunErrorEvent)
                        and event.code == "model_quota"
                    ):
                        request.app.state.model_retry_at = monotonic() + 60
                    yield event
        except TimeoutError:
            yield RunErrorEvent(message="run_timeout", code="run_timeout")

    events = bounded_run()
    return with_heartbeat(
        adapter.streaming_response(events), close_source=events.aclose
    )
