"""Transport keepalive for private HTTP streaming paths."""

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import suppress

from starlette.responses import Content, StreamingResponse


def with_heartbeat(
    response: StreamingResponse,
    *,
    interval: float = 2.0,
    close_source: Callable[[], Awaitable[None]] | None = None,
) -> StreamingResponse:
    source = response.body_iterator

    async def frames() -> AsyncIterator[Content]:
        iterator = source.__aiter__()
        queue: asyncio.Queue[Content | Exception | None] = asyncio.Queue(maxsize=1)

        async def produce() -> None:
            try:
                async for frame in iterator:
                    await queue.put(frame)
            except Exception as error:
                await queue.put(error)
            else:
                await queue.put(None)
            finally:
                try:
                    close = getattr(iterator, "aclose", None)
                    if close is not None:
                        await close()
                finally:
                    if close_source is not None:
                        await close_source()

        # Keep the official iterator in one task: its timeout/cancel scopes can
        # span yields. A fresh task per anext() would detach those deadlines.
        producer = asyncio.create_task(produce())
        try:
            while True:
                try:
                    frame = await asyncio.wait_for(queue.get(), timeout=interval)
                except TimeoutError:
                    if producer.done():
                        await producer
                        return
                    yield b": keepalive\n\n"
                    continue
                if frame is None:
                    return
                if isinstance(frame, Exception):
                    raise frame
                yield frame
        finally:
            producer.cancel()
            with suppress(asyncio.CancelledError):
                await producer

    response.body_iterator = frames()
    return response
