"""Official AG-UI transport with a public error allowlist."""

from collections.abc import AsyncIterator

from ag_ui.core import BaseEvent, RunErrorEvent
from pydantic_ai.exceptions import ModelHTTPError, UsageLimitExceeded
from pydantic_ai.ui.ag_ui import AGUIAdapter, AGUIEventStream

from .runtime import PlanningRun


class PlanningEventStream(AGUIEventStream[PlanningRun, str]):
    async def on_error(self, error: Exception) -> AsyncIterator[BaseEvent]:
        code = (
            "model_quota"
            if isinstance(error, ModelHTTPError) and error.status_code == 429
            else "run_limit"
            if isinstance(error, UsageLimitExceeded)
            else "model_unavailable"
        )
        async for event in super().on_error(RuntimeError(code)):
            if isinstance(event, RunErrorEvent):
                event.code = code
            yield event


class PlanningAdapter(AGUIAdapter[PlanningRun, str]):
    def build_event_stream(self) -> PlanningEventStream:
        return PlanningEventStream(
            self.run_input, accept=self.accept, ag_ui_version=self.ag_ui_version
        )
