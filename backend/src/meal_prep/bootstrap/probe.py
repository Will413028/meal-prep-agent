"""Opt-in synthetic transport probe; never mounted by the product app."""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from ag_ui.core import CustomEvent
from fastapi import FastAPI, Request, Response
from pydantic_ai import Agent, AgentRunResult, CancellationToken
from pydantic_ai.messages import ToolReturnPart
from pydantic_ai.models import Model
from pydantic_ai.ui.ag_ui import AGUIAdapter
from pydantic_ai.usage import UsageLimits

from meal_prep.bootstrap.app import create_app


def create_probe_app(
    model: Model,
    cancellation_token: CancellationToken | None = None,
    *,
    tool_delay: float = 0,
) -> FastAPI:
    app = create_app()
    agent = Agent(
        model,
        instructions="Run transport_probe. This is synthetic transport data, never a meal plan.",
    )

    @agent.tool_plain
    async def transport_probe() -> dict[str, bool]:
        """Return synthetic transport evidence, not an adoptable proposal."""
        if tool_delay:
            await asyncio.sleep(tool_delay)
        return {"synthetic": True, "adoptable": False}

    @app.post("/diagnostics/agent")
    async def run(request: Request) -> Response:
        adapter = await AGUIAdapter.from_request(request, agent=agent)

        async def complete(result: AgentRunResult[Any]) -> AsyncIterator[CustomEvent]:
            if not any(
                isinstance(part, ToolReturnPart) and part.tool_name == "transport_probe"
                for message in result.new_messages()
                for part in message.parts
            ):
                return
            yield CustomEvent(
                name="proposal_ready",
                value={
                    "runId": adapter.run_input.run_id,
                    "synthetic": True,
                    "adoptable": False,
                },
            )

        return adapter.streaming_response(
            adapter.run_stream(
                on_complete=complete,
                cancellation_token=cancellation_token,
                usage_limits=UsageLimits(request_limit=4, tool_calls_limit=8),
                model_settings={"max_tokens": 2048, "timeout": 60},
            )
        )

    return app


def create_synthetic_probe_app() -> FastAPI:
    """Explicit local test server; never a live model fallback."""
    from pydantic_ai.models.test import TestModel

    return create_probe_app(TestModel(call_tools=["transport_probe"]), tool_delay=1)


def create_live_probe_app() -> FastAPI:
    """Explicit opt-in: configured credentials, fixed Cloudflare model, no fallback."""
    from .live import cloudflare_model

    return create_probe_app(cloudflare_model())
