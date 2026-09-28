import asyncio

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.models.function import FunctionModel
from test_planning_agent import events, payload

from meal_prep.bootstrap.app import create_app
from meal_prep.modules.planning.agents import api


@pytest.mark.parametrize(
    "status,code", [(429, "model_quota"), (500, "model_unavailable")]
)
def test_provider_failure_is_allowlisted_without_private_error_body(
    status, code, capsys, caplog
):
    calls = []

    async def fail(messages, info):
        calls.append(1)
        raise ModelHTTPError(
            status, "synthetic", {"private": "body-questionnaire-sentinel"}
        )
        yield "unreachable"

    app = create_app()
    app.state.planning_model = FunctionModel(stream_function=fail)
    with TestClient(app) as client:
        response = client.post("/agent", json=payload())
        if status == 429:
            repeated = client.post("/agent", json=payload())
            assert repeated.status_code == 429
            assert repeated.json() == {"error": "model_quota"}
            assert repeated.headers["retry-after"] == "60"
    stream = events(response)
    failure = next(event for event in stream if event["type"] == "RUN_ERROR")
    assert failure.get("code") == code
    assert "body-questionnaire-sentinel" not in response.text
    captured = capsys.readouterr()
    assert (
        "body-questionnaire-sentinel" not in captured.out + captured.err + caplog.text
    )
    assert not any(event.get("name") == "proposal_ready" for event in stream)
    assert calls == [1]


def test_total_run_deadline_releases_model_and_never_publishes_partial_result(
    monkeypatch,
):
    monkeypatch.setattr(api, "RUN_TIMEOUT_SECONDS", 0.01, raising=False)
    released = []

    async def slow(messages, info):
        try:
            yield "合成部分文字"
            await asyncio.sleep(0.1)
            yield "不應送達"
        finally:
            released.append(True)

    app = create_app()
    app.state.planning_model = FunctionModel(stream_function=slow)
    with TestClient(app) as client:
        response = client.post("/agent", json=payload())
    stream = events(response)
    assert any(event.get("code") == "run_timeout" for event in stream)
    assert "不應送達" not in response.text
    assert not any(event["type"] == "RUN_FINISHED" for event in stream)
    assert released == [True]


def test_quota_window_reopens_only_after_clock_reaches_retry_time(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(api, "monotonic", lambda: clock[0])
    calls = []

    async def recover(messages, info):
        calls.append(1)
        if len(calls) == 1:
            raise ModelHTTPError(429, "synthetic", "quota")
        yield "合成恢復回覆"

    app = create_app()
    app.state.planning_model = FunctionModel(stream_function=recover)
    with TestClient(app) as client:
        assert "model_quota" in client.post("/agent", json=payload()).text
        clock[0] = 159.0
        blocked = client.post("/agent", json=payload())
        assert blocked.status_code == 429
        assert blocked.headers["retry-after"] == "1"
        assert calls == [1]
        clock[0] = 160.0
        recovered = client.post("/agent", json=payload())
        assert events(recovered)[-1]["type"] == "RUN_FINISHED"
        assert calls == [1, 1]


@pytest.mark.parametrize(
    "field,amount,limited",
    [
        ("input_tokens", 120000, False),
        ("input_tokens", 120001, True),
        ("output_tokens", 8192, False),
        ("output_tokens", 8193, True),
    ],
)
def test_reported_run_token_usage_is_bounded(field, amount, limited, monkeypatch):
    from contextlib import asynccontextmanager

    from pydantic_ai.models.test import TestModel
    from pydantic_ai.usage import RequestUsage

    model = TestModel(call_tools=[], custom_output_text="合成回覆")
    original = model.request_stream

    @asynccontextmanager
    async def usage_stream(*args, **kwargs):
        async with original(*args, **kwargs) as response:
            monkeypatch.setattr(
                type(response),
                "usage",
                property(lambda self: RequestUsage(**{field: amount})),
            )
            original_get = response.get

            def reported_response():
                result = original_get()
                result.usage = RequestUsage(**{field: amount})
                return result

            monkeypatch.setattr(response, "get", reported_response)
            yield response

    monkeypatch.setattr(model, "request_stream", usage_stream)
    app = create_app()
    app.state.planning_model = model
    with TestClient(app) as client:
        stream = events(client.post("/agent", json=payload()))
    assert any(event.get("code") == "run_limit" for event in stream) is limited
    assert any(event["type"] == "RUN_FINISHED" for event in stream) is not limited


def test_model_loop_stops_before_fifth_provider_request():
    from pydantic_ai.models.function import DeltaToolCall

    calls = []

    async def loop(messages, info):
        calls.append(1)
        if len(calls) == 10:
            yield "合成停止"
        else:
            yield {
                0: DeltaToolCall(
                    name="find_recipes",
                    json_args="{}",
                    tool_call_id=f"loop-{len(calls)}",
                )
            }

    app = create_app()
    app.state.planning_model = FunctionModel(stream_function=loop)
    with TestClient(app) as client:
        stream = events(client.post("/agent", json=payload()))
    assert len(calls) == 4
    assert any(e.get("code") == "run_limit" for e in stream)
    assert not any(e["type"] == "RUN_FINISHED" for e in stream)


@pytest.mark.parametrize("count,limited", [(8, False), (9, True)])
def test_parallel_tool_batch_cannot_cross_eight_call_budget(count, limited):
    from pydantic_ai.messages import ToolReturnPart
    from pydantic_ai.models.function import DeltaToolCall

    async def batch(messages, info):
        if any(isinstance(part, ToolReturnPart) for part in messages[-1].parts):
            yield "合成批次完成"
        else:
            yield {
                index: DeltaToolCall(
                    name="find_recipes", json_args="{}", tool_call_id=f"batch-{index}"
                )
                for index in range(count)
            }

    app = create_app()
    app.state.planning_model = FunctionModel(stream_function=batch)
    with TestClient(app) as client:
        stream = events(client.post("/agent", json=payload()))
    assert any(e.get("code") == "run_limit" for e in stream) is limited
    assert sum(e["type"] == "TOOL_CALL_RESULT" for e in stream) == (0 if limited else 8)


def test_live_provider_wire_caps_output_and_excludes_cookie_and_body_questionnaire(
    monkeypatch,
):
    import json

    import httpx2 as httpx

    from meal_prep.bootstrap import live

    seen = []

    async def transport(request):
        seen.append(request)
        chunks = [
            {
                "id": "synthetic",
                "object": "chat.completion.chunk",
                "created": 0,
                "model": "@cf/zai-org/glm-4.7-flash",
                "choices": [
                    {
                        "index": 0,
                        "delta": {"role": "assistant", "content": "合成wire測試"},
                        "finish_reason": None,
                    }
                ],
            },
            {
                "id": "synthetic",
                "object": "chat.completion.chunk",
                "created": 0,
                "model": "@cf/zai-org/glm-4.7-flash",
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 2,
                    "total_tokens": 102,
                },
            },
        ]
        content = (
            "".join("data: " + json.dumps(chunk) + "\n\n" for chunk in chunks)
            + "data: [DONE]\n\n"
        )
        return httpx.Response(
            200, headers={"content-type": "text/event-stream"}, content=content
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(transport))
    original = live.OpenAIProvider
    monkeypatch.setattr(
        live, "OpenAIProvider", lambda **kwargs: original(**kwargs, http_client=client)
    )
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "0" * 32)
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "synthetic-token")
    try:
        with TestClient(live.create_live_app()) as api_client:
            response = api_client.post(
                "/agent", json=payload(), headers={"cookie": "private-synthetic-cookie"}
            )
        assert events(response)[-1]["type"] == "RUN_FINISHED"
        assert len(seen) == 1
        body = json.loads(seen[0].content)
        assert body.get("max_completion_tokens", body.get("max_tokens")) == 2048
        assert body["chat_template_kwargs"] == {"enable_thinking": False}
        assert body["model"] == "@cf/zai-org/glm-4.7-flash"
        assert "cookie" not in seen[0].headers
        assert "private-synthetic-cookie" not in seen[0].content.decode()
        for field in ('"age":', '"heightCm":', '"weightKg":'):
            assert field not in json.dumps(body)
    finally:
        asyncio.run(client.aclose())
