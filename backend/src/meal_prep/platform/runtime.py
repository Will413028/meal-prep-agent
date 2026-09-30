"""Process-local admission and payload-free runtime diagnostics."""

import json
import logging
from dataclasses import dataclass
from typing import Any

from starlette.responses import StreamingResponse
from starlette.types import Receive, Scope, Send

logger = logging.getLogger("meal_prep.runtime")
logger.setLevel(logging.INFO)
if not logger.handlers:
    logger.addHandler(logging.StreamHandler())


def diagnostic(event: str, **metrics: int | float | str) -> None:
    logger.info(json.dumps({"event": event, **metrics}, separators=(",", ":")))


@dataclass
class RunCapacity:
    kind: str = "agent"
    maximum: int = 1
    active: int = 0

    def acquire(self) -> "RunLease | None":
        # All admission runs on this process's event loop, without an await.
        if self.active >= self.maximum:
            diagnostic(
                "run_rejected" if self.kind == "agent" else "calculation_rejected",
                activeRuns=self.active,
            )
            return None
        self.active += 1
        return RunLease(self)


@dataclass
class RunLease:
    capacity: RunCapacity
    released: bool = False

    def release(self) -> None:
        if not self.released:
            self.released = True
            self.capacity.active -= 1


class ManagedStream(StreamingResponse):
    """Release admission even if ASGI disconnects before consuming the body."""

    def __init__(self, response: StreamingResponse, lease: RunLease) -> None:
        super().__init__(
            response.body_iterator,
            status_code=response.status_code,
            headers=dict(response.headers),
            background=response.background,
        )
        self.lease = lease

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> Any:
        try:
            return await super().__call__(scope, receive, send)
        finally:
            self.lease.release()
