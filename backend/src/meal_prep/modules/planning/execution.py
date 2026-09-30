"""Shared bounded execution for HTTP preview and Agent planning tools."""

import asyncio
import threading
from collections.abc import Awaitable, Callable
from time import monotonic

from meal_prep.platform.runtime import RunCapacity, diagnostic

from .contracts import BuildProposalRequest, BuildProposalResult
from .search import SearchCancelled
from .search import build_proposal as calculate_proposal


class CalculationBusy(Exception):
    pass


async def calculate(
    request: BuildProposalRequest,
    capacity: RunCapacity | None = None,
    disconnected: Callable[[], Awaitable[bool]] | None = None,
) -> BuildProposalResult:
    lease = (capacity or RunCapacity(kind="calculation")).acquire()
    if lease is None:
        raise CalculationBusy()
    stopped = threading.Event()
    started = monotonic()
    task = asyncio.create_task(
        asyncio.to_thread(calculate_proposal, request, should_stop=stopped.is_set)
    )
    watcher_stopped = asyncio.Event()

    async def watch_disconnect() -> None:
        while disconnected is not None and not watcher_stopped.is_set():
            if await disconnected():
                stopped.set()
                return
            await asyncio.sleep(0.02)

    watcher = asyncio.create_task(watch_disconnect()) if disconnected else None
    try:
        result = await asyncio.shield(task)
        diagnostic(
            "calculation_finished",
            elapsedMs=round((monotonic() - started) * 1000, 3),
            examined=result.examined,
        )
        return result
    except asyncio.CancelledError:
        stopped.set()
        # Retain admission until the worker actually exits, including repeated
        # ASGI cancellation. A cancelled await must not detach live CPU work.
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                continue
            except SearchCancelled:
                break
        if not task.cancelled():
            task.exception()  # Retrieve errors without logging private payloads.
        diagnostic(
            "calculation_cancelled", elapsedMs=round((monotonic() - started) * 1000, 3)
        )
        raise
    except SearchCancelled:
        diagnostic(
            "calculation_cancelled", elapsedMs=round((monotonic() - started) * 1000, 3)
        )
        raise
    except Exception:
        diagnostic(
            "calculation_failed", elapsedMs=round((monotonic() - started) * 1000, 3)
        )
        raise
    finally:
        try:
            if watcher is not None:
                watcher_stopped.set()
                watcher.cancel()
                try:
                    await watcher
                except asyncio.CancelledError:
                    pass
        finally:
            lease.release()
