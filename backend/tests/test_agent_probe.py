import json

from fastapi.testclient import TestClient
from pydantic_ai import CancellationToken
from pydantic_ai.models.test import TestModel

from meal_prep.bootstrap.probe import create_probe_app


def test_real_adapter_roundtrip_calls_tool_and_emits_explicit_outcome() -> None:
    model = TestModel(call_tools=["transport_probe"])
    with TestClient(create_probe_app(model)) as client:
        response = client.post(
            "/diagnostics/agent",
            json={
                "threadId": "synthetic-thread",
                "runId": "synthetic-run",
                "messages": [
                    {
                        "id": "message-1",
                        "role": "user",
                        "content": "Run the synthetic transport probe.",
                    }
                ],
                "state": {},
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
        )
    assert response.status_code == 200
    events = [
        json.loads(line[6:])
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]
    assert events[0]["type"] == "RUN_STARTED"
    assert any(
        e["type"] == "TOOL_CALL_START" and e["toolCallName"] == "transport_probe"
        for e in events
    )
    assert any(e["type"] == "TOOL_CALL_RESULT" for e in events)
    outcomes = [
        e for e in events if e["type"] == "CUSTOM" and e["name"] == "proposal_ready"
    ]
    assert len(outcomes) == 1
    assert outcomes[0]["value"] == {
        "runId": "synthetic-run",
        "synthetic": True,
        "adoptable": False,
    }
    assert events[-1]["type"] == "RUN_FINISHED"


def test_cancelled_probe_never_emits_ready_even_if_adapter_finishes() -> None:
    token = CancellationToken()
    token.cancel()
    with TestClient(
        create_probe_app(TestModel(call_tools=["transport_probe"]), token)
    ) as client:
        response = client.post(
            "/diagnostics/agent",
            json={
                "threadId": "synthetic-thread",
                "runId": "cancelled-run",
                "messages": [
                    {"id": "message-1", "role": "user", "content": "Run probe."}
                ],
                "state": {},
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
        )
    events = [
        json.loads(line[6:])
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]
    assert not any(e.get("name") == "proposal_ready" for e in events)
    assert events[-1]["type"] == "RUN_FINISHED"


def test_model_text_without_tool_result_does_not_emit_ready() -> None:
    with TestClient(
        create_probe_app(
            TestModel(call_tools=[], custom_output_text="synthetic text only")
        )
    ) as client:
        response = client.post(
            "/diagnostics/agent",
            json={
                "threadId": "synthetic-thread",
                "runId": "no-tool-run",
                "messages": [
                    {"id": "message-1", "role": "user", "content": "Run probe."}
                ],
                "state": {},
                "tools": [],
                "context": [],
                "forwardedProps": {},
            },
        )
    events = [
        json.loads(line[6:])
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]
    assert not any(e.get("name") == "proposal_ready" for e in events)
    assert events[-1]["type"] == "RUN_FINISHED"
