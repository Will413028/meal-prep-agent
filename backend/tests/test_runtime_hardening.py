import asyncio
import json
import threading
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.models.test import TestModel
from test_planning_agent import payload
from test_planning_search import request

from meal_prep.bootstrap.app import create_app
from meal_prep.modules.planning import execution as runtime
from meal_prep.modules.planning.agents.runtime import PlanningRun, planning_agent


def test_disconnect_probe_swallowing_cancel_cannot_hold_finished_capacity():
    from meal_prep.platform.runtime import RunCapacity

    async def scenario():
        swallowed = False

        async def disconnected():
            nonlocal swallowed
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                if swallowed:
                    raise
                swallowed = True
            return False

        capacity = RunCapacity(kind="calculation")
        task = asyncio.create_task(runtime.calculate(request(), capacity, disconnected))
        done, _ = await asyncio.wait({task}, timeout=0.5)
        try:
            assert done, (
                "finished calculation waited on a probe that swallowed cancellation"
            )
            await task
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        assert capacity.active == 0

    asyncio.run(scenario())


def test_busy_fixture_does_not_start_candidate_selection(monkeypatch):
    from meal_prep.modules.planning.agents import api

    calls = []
    original = api.fixture_choice

    def select(*args, **kwargs):
        calls.append(True)
        return original(*args, **kwargs)

    monkeypatch.setattr(api, "fixture_choice", select)
    app = create_app()
    lease = app.state.run_capacity.acquire()
    body = payload()
    body["forwardedProps"]["mode"] = "fixture"
    try:
        with TestClient(app) as client:
            assert client.post("/agent", json=body).status_code == 503
        assert calls == [], "fixture computed before shared run admission"
    finally:
        lease.release()


def test_preview_disconnect_stops_worker_and_releases_capacity(monkeypatch):
    from meal_prep.modules.planning.search import SearchCancelled
    from meal_prep.platform.runtime import RunCapacity

    started = threading.Event()
    exited = threading.Event()

    def slow(value, *, should_stop):
        started.set()
        while not should_stop():
            exited.wait(0.001)
        exited.set()
        raise SearchCancelled()

    monkeypatch.setattr(runtime, "calculate_proposal", slow)

    async def scenario():
        capacity = RunCapacity(kind="calculation")

        async def disconnected():
            return started.is_set()

        try:
            await runtime.calculate(request(), capacity, disconnected)
        except SearchCancelled:
            pass
        assert exited.is_set()
        assert capacity.active == 0

    asyncio.run(scenario())


def test_agent_and_preview_share_calculation_admission(monkeypatch):
    started = threading.Event()
    finish = threading.Event()
    original = runtime.calculate_proposal

    def slow(value, **kwargs):
        started.set()
        assert finish.wait(2)
        return original(value, **kwargs)

    monkeypatch.setattr(runtime, "calculate_proposal", slow)
    app = create_app()
    app.state.planning_model = TestModel(call_tools=["build_proposal"])
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(client.post, "/agent", json=payload())
        assert started.wait(2)
        try:
            rejected = client.post(
                "/api/v1/proposals/build", json=request().model_dump(mode="json")
            )
            assert rejected.status_code == 503, (
                "preview bypassed active calculation capacity"
            )
        finally:
            finish.set()
            assert first.result(timeout=5).status_code == 200
        assert (
            client.post(
                "/api/v1/proposals/build", json=request().model_dump(mode="json")
            ).status_code
            == 200
        )


def test_cancellation_stops_calculation_before_returning(monkeypatch):
    started = threading.Event()
    exited = threading.Event()

    def slow(value, *, should_stop=None):
        started.set()
        while not (should_stop and should_stop()):
            if exited.wait(0.001):
                break
        exited.set()
        from meal_prep.modules.planning.search import SearchCancelled

        raise SearchCancelled()

    monkeypatch.setattr(runtime, "calculate_proposal", slow)

    async def scenario():
        task = asyncio.create_task(runtime.calculate(request()))
        while not started.is_set():
            await asyncio.sleep(0.001)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        assert exited.is_set()

    asyncio.run(scenario())


def test_capacity_recovers_after_timeout(monkeypatch):
    from meal_prep.modules.planning.agents import api

    monkeypatch.setattr(api, "RUN_TIMEOUT_SECONDS", 0.01)

    async def slow(messages, info):
        await asyncio.sleep(1)
        yield "合成完成"

    app = create_app()
    app.state.planning_model = FunctionModel(stream_function=slow)
    with TestClient(app) as client:
        assert "run_timeout" in client.post("/agent", json=payload()).text
        assert app.state.run_capacity.active == 0
        app.state.planning_model = TestModel(
            call_tools=[], custom_output_text="合成恢復"
        )
        assert client.post("/agent", json=payload()).status_code == 200


def test_repeated_cancellation_does_not_detach_worker(monkeypatch):
    started = threading.Event()
    stopped = threading.Event()
    finish = threading.Event()

    def slow(value, *, should_stop=None):
        started.set()
        while not (should_stop and should_stop()):
            finish.wait(0.001)
        stopped.set()
        assert finish.wait(2)
        from meal_prep.modules.planning.search import SearchCancelled

        raise SearchCancelled()

    monkeypatch.setattr(runtime, "calculate_proposal", slow)

    async def scenario():
        task = asyncio.create_task(runtime.calculate(request()))
        while not started.is_set():
            await asyncio.sleep(0.001)
        task.cancel()
        while not stopped.is_set():
            await asyncio.sleep(0.001)
        task.cancel()
        await asyncio.sleep(0)
        assert not task.done(), "cancelled request detached live calculation"
        finish.set()
        try:
            await task
        except asyncio.CancelledError:
            pass

    try:
        asyncio.run(scenario())
    finally:
        finish.set()


def test_disconnect_before_stream_iteration_releases_admission():
    from starlette.responses import StreamingResponse

    from meal_prep.platform.runtime import ManagedStream, RunCapacity

    async def scenario():
        capacity = RunCapacity()
        lease = capacity.acquire()
        assert lease is not None

        async def source():
            yield "must not start"

        response = ManagedStream(StreamingResponse(source()), lease)

        async def receive():
            return {"type": "http.disconnect"}

        async def send(message):
            raise asyncio.CancelledError()

        try:
            await response(
                {"type": "http", "asgi": {"spec_version": "2.4"}}, receive, send
            )
        except asyncio.CancelledError:
            pass
        assert capacity.active == 0

    asyncio.run(scenario())


def test_calculation_keeps_event_loop_responsive(monkeypatch):
    started = threading.Event()
    ticked = threading.Event()
    observed = []
    original = runtime.calculate_proposal

    def slow(value, **kwargs):
        started.set()
        observed.append(ticked.wait(1))
        return original(value, **kwargs)

    monkeypatch.setattr(runtime, "calculate_proposal", slow)

    async def scenario():
        async def tick():
            while not started.is_set():
                await asyncio.sleep(0.001)
            ticked.set()

        ticker = asyncio.create_task(tick())
        await planning_agent(TestModel(call_tools=["build_proposal"])).run(
            "合成規劃", deps=PlanningRun(request())
        )
        await ticker

    asyncio.run(scenario())
    assert observed == [True], "synchronous search blocked the event loop"


def test_capacity_is_shared_across_requests_and_released_after_stream():
    started = threading.Event()
    finish = threading.Event()
    calls = []

    async def slow(messages, info):
        calls.append(1)
        started.set()
        for _ in range(40):
            if finish.is_set():
                break
            await asyncio.sleep(0.005)
        yield "合成完成"

    app = create_app()
    app.state.planning_model = FunctionModel(stream_function=slow)
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(client.post, "/agent", json=payload())
        assert started.wait(2)
        try:
            rejected = client.post("/agent", json=payload())
            assert rejected.status_code == 503
            assert rejected.json() == {"error": "model_busy"}
            assert rejected.headers["retry-after"] == "1"
            assert calls == [1]
        finally:
            finish.set()
            assert first.result(timeout=5).status_code == 200
        assert client.post("/agent", json=payload()).status_code == 200


def test_run_diagnostics_are_structured_and_exclude_payload(caplog):
    app = create_app()
    app.state.planning_model = TestModel(
        call_tools=[], custom_output_text="private-output-sentinel"
    )
    body = payload()
    body["messages"][0]["content"] = "private-input-sentinel"
    with caplog.at_level("INFO", logger="meal_prep.runtime"), TestClient(app) as client:
        assert client.post("/agent", json=body).status_code == 200
    records = [
        json.loads(record.message)
        for record in caplog.records
        if record.name == "meal_prep.runtime"
    ]
    assert {record["event"] for record in records} >= {"run_started", "run_finished"}
    finished = next(record for record in records if record["event"] == "run_finished")
    assert finished["elapsedMs"] >= 0
    assert finished["activeRuns"] == 0
    assert "private-input-sentinel" not in caplog.text
    assert "private-output-sentinel" not in caplog.text
