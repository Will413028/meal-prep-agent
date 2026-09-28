import json

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.models.test import TestModel
from test_planning_agent import payload

from meal_prep.bootstrap.app import create_app


@pytest.mark.parametrize("chunked", [False, True])
@pytest.mark.parametrize("extra,status", [(0, 200), (1, 413)])
def test_request_byte_boundary_including_chunked_body(chunked, extra, status):
    text = json.dumps({"schemaVersion": 1, "kcal": 2000, "protein": 100})
    body = text.encode() + b" " * (128 * 1024 - len(text) + extra)
    content = iter([body[:1000], body[1000:]]) if chunked else body
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/goals/validate",
            content=content,
            headers={"content-type": "application/json"},
        )
    assert response.status_code == status
    if status == 413:
        assert response.json() == {"error": "request_too_large"}


@pytest.mark.parametrize("count,status", [(8, 200), (9, 422)])
def test_agent_history_count_matches_eight_message_budget(count, status):
    app = create_app()
    app.state.planning_model = TestModel(call_tools=[], custom_output_text="合成回覆")
    body = payload()
    body["messages"] = [
        {"id": str(index), "role": "user", "content": "合成訊息"}
        for index in range(count)
    ]
    with TestClient(app) as client:
        response = client.post("/agent", json=body)
    assert response.status_code == status


def test_asgi_stops_receiving_after_oversized_chunk_without_parsing_tail():
    import asyncio

    async def scenario():
        incoming = iter(
            [
                {
                    "type": "http.request",
                    "body": b" " * (128 * 1024),
                    "more_body": True,
                },
                {"type": "http.request", "body": "餐".encode(), "more_body": True},
            ]
        )
        outgoing = []

        async def receive():
            return next(incoming)

        async def send(message):
            outgoing.append(message)

        await create_app()(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "method": "POST",
                "path": "/api/v1/goals/validate",
                "headers": [(b"content-length", b"2")],
            },
            receive,
            send,
        )
        assert outgoing[0]["status"] == 413
        assert json.loads(outgoing[1]["body"]) == {"error": "request_too_large"}

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "lengths,status",
    [
        ([2000], 200),
        ([2001], 422),
        ([2000, 2000, 2000, 2000], 200),
        ([2000, 2000, 2000, 2000, 1], 422),
    ],
)
def test_message_and_total_character_limits_include_non_ascii(lengths, status):
    app = create_app()
    app.state.planning_model = TestModel(call_tools=[], custom_output_text="合成回覆")
    body = payload()
    body["messages"] = [
        {"id": str(index), "role": "user", "content": "餐" * length}
        for index, length in enumerate(lengths)
    ]
    with TestClient(app) as client:
        response = client.post("/agent", json=body)
    assert response.status_code == status
