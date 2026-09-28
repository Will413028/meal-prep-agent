"""Real TCP regression: closing an SSE response releases the provider iterator."""

import asyncio
import socket
import threading
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx2 as httpx
import uvicorn
from pydantic_ai.models.function import FunctionModel

from meal_prep.bootstrap.probe import create_probe_app


def test_tcp_disconnect_cleans_up_running_provider_stream() -> None:
    released = threading.Event()

    async def model_stream(messages: Any, info: Any) -> AsyncIterator[str]:
        try:
            yield "synthetic-start"
            await asyncio.sleep(60)
            yield "must-not-arrive"
        finally:
            released.set()

    app = create_probe_app(FunctionModel(stream_function=model_stream))
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level="error"))
    thread = threading.Thread(
        target=server.run, kwargs={"sockets": [sock]}, daemon=True
    )
    thread.start()
    try:
        deadline = time.monotonic() + 5
        while not server.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert server.started, "isolated test server did not start"
        with httpx.Client(timeout=5) as client:
            with client.stream(
                "POST",
                f"http://127.0.0.1:{port}/agent",
                json={
                    "threadId": "disconnect-thread",
                    "runId": "disconnect-run",
                    "messages": [{"id": "m", "role": "user", "content": "probe"}],
                    "state": {},
                    "tools": [],
                    "context": [],
                    "forwardedProps": {},
                },
            ) as response:
                assert response.status_code == 200
                for line in response.iter_lines():
                    if "synthetic-start" in line:
                        break
                else:
                    raise AssertionError("provider did not start streaming")
                assert not released.is_set()
            assert released.wait(3), "disconnect left provider running"
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        sock.close()
    assert not thread.is_alive()
