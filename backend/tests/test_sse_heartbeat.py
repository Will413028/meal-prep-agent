"""Idle SSE stays observable without replacing official protocol events."""

import asyncio
import json
from collections.abc import AsyncIterator

from pydantic_ai.models.function import FunctionModel
from starlette.requests import Request
from starlette.responses import StreamingResponse
from test_planning_agent import payload

from meal_prep.bootstrap.app import create_app
from meal_prep.modules.planning.agents import api
from meal_prep.platform import sse
from meal_prep.platform.sse import with_heartbeat


def test_idle_heartbeat_preserves_frames_and_closes_pending_provider() -> None:
    async def scenario() -> None:
        released = asyncio.Event()

        async def source() -> AsyncIterator[bytes]:
            try:
                yield b'data: {"type":"RUN_STARTED"}\n\n'
                await asyncio.sleep(60)
                yield b'data: {"type":"RUN_FINISHED"}\n\n'
            finally:
                released.set()

        response = with_heartbeat(
            StreamingResponse(source(), media_type="text/event-stream"), interval=0.01
        )
        iterator = response.body_iterator.__aiter__()
        assert await anext(iterator) == b'data: {"type":"RUN_STARTED"}\n\n'
        pending = asyncio.create_task(anext(iterator))
        try:
            done, _ = await asyncio.wait({pending}, timeout=0.2)
            assert done, "idle transport never emitted a heartbeat"
            assert pending.result() == b": keepalive\n\n"
            assert not released.is_set(), "heartbeat must not cancel the provider"
        finally:
            pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)
            await iterator.aclose()  # type: ignore[attr-defined]
        assert released.is_set(), "closing the response left its pending provider alive"

    asyncio.run(scenario())


def test_official_adapter_releases_provider_before_slow_response_ends(
    monkeypatch,
) -> None:
    monkeypatch.setattr(api, "RUN_TIMEOUT_SECONDS", 0.05)

    async def scenario() -> None:
        released = asyncio.Event()

        async def model_stream(messages, info) -> AsyncIterator[str]:
            try:
                for _ in range(10000):
                    yield "synthetic-start"
                    await asyncio.sleep(0.001)
            finally:
                released.set()

        app = create_app()
        app.state.planning_model = FunctionModel(stream_function=model_stream)
        body = payload()
        body["forwardedProps"]["mode"] = "live"

        async def receive():
            return {"type": "http.request", "body": json.dumps(body).encode()}

        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/agent",
                "app": app,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"accept", b"text/event-stream"),
                ],
            },
            receive,
        )
        response = await api.run(request)
        iterator = response.body_iterator.__aiter__()
        async for frame in iterator:
            if "synthetic-start" in str(frame):
                break
        else:
            raise AssertionError("official provider never started")
        await asyncio.sleep(0.1)
        try:
            async for _ in iterator:
                pass
        except (TimeoutError, asyncio.CancelledError):
            pass
        assert released.is_set(), "official provider outlived its ended response"

    asyncio.run(scenario())


def test_completed_stream_has_no_extra_protocol_events() -> None:
    async def scenario() -> None:
        frames = [b"data: first\n\n", b"data: last\n\n"]

        async def source() -> AsyncIterator[bytes]:
            for frame in frames:
                yield frame

        response = with_heartbeat(StreamingResponse(source()), interval=0.1)
        assert [frame async for frame in response.body_iterator] == frames

    asyncio.run(scenario())


def test_source_deadline_keeps_its_task_across_frames() -> None:
    async def scenario() -> None:
        async def source() -> AsyncIterator[bytes]:
            async with asyncio.timeout(0.03):
                yield b"data: first\n\n"
                await asyncio.sleep(60)

        async def consume() -> bool:
            try:
                response = with_heartbeat(StreamingResponse(source()), interval=0.005)
                async for _ in response.body_iterator:
                    pass
            except TimeoutError:
                return True
            return False

        task = asyncio.create_task(consume())
        try:
            done, _ = await asyncio.wait({task}, timeout=0.3)
            assert done, "transport moved the source deadline to a completed task"
            assert task.result()
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    asyncio.run(scenario())


def test_heartbeat_timeout_does_not_hide_queued_source_error(monkeypatch) -> None:
    real_wait_for = asyncio.wait_for
    waits = 0

    async def expire_second_wait(awaitable, *, timeout):
        nonlocal waits
        waits += 1
        if waits == 2:
            await asyncio.sleep(0.01)
            awaitable.close()
            raise TimeoutError
        return await real_wait_for(awaitable, timeout=timeout)

    monkeypatch.setattr(sse.asyncio, "wait_for", expire_second_wait)

    async def scenario() -> None:
        async def source() -> AsyncIterator[bytes]:
            yield b"data: first\n\n"
            raise RuntimeError("source failed")

        response = with_heartbeat(StreamingResponse(source()), interval=0.005)
        try:
            async for _ in response.body_iterator:
                pass
        except RuntimeError as error:
            assert str(error) == "source failed"
        else:
            raise AssertionError("heartbeat timeout hid the queued source error")

    asyncio.run(scenario())


def test_deadline_while_consumer_is_slow_ends_stream_and_releases_source() -> None:
    async def scenario() -> None:
        released = asyncio.Event()

        async def source() -> AsyncIterator[bytes]:
            try:
                async with asyncio.timeout(0.03):
                    for _ in range(100):
                        yield b"data: frame\n\n"
            finally:
                released.set()

        stream = source()

        async def encoder() -> AsyncIterator[bytes]:
            # Like the official encoder, forwarding alone does not close its source.
            async for frame in stream:
                yield frame

        iterator = with_heartbeat(
            StreamingResponse(encoder()), interval=0.01, close_source=stream.aclose
        ).body_iterator.__aiter__()
        await anext(iterator)
        await asyncio.sleep(0.06)

        async def drain() -> None:
            try:
                async for _ in iterator:
                    pass
            except (TimeoutError, asyncio.CancelledError):
                pass

        task = asyncio.create_task(drain())
        try:
            done, _ = await asyncio.wait({task}, timeout=0.2)
            assert done, "dead producer left a heartbeat-only response"
            assert released.is_set()
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    asyncio.run(scenario())
