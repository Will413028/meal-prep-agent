from fastapi.testclient import TestClient
from pydantic_ai.models.test import TestModel
from test_planning_agent import events, payload

from meal_prep.bootstrap.app import create_app


def test_default_fixture_runs_without_live_credentials_and_labels_its_result():
    with TestClient(create_app()) as client:
        body = payload()
        body["forwardedProps"].pop("mode", None)
        response = client.post("/agent", json=body)
        status = client.get("/api/v1/runtime")
    assert response.status_code == 200
    stream = events(response)
    assert any(event.get("name") == "proposal_ready" for event in stream)
    assert "合成展示" in response.text
    assert (
        next(e["value"] for e in stream if e.get("name") == "run_usage")["mode"]
        == "fixture"
    )
    assert status.json() == {"liveAvailable": False}


def test_fixture_is_default_even_when_live_model_is_available_and_live_requires_selection():
    app = create_app()
    app.state.planning_model = TestModel(
        call_tools=[], custom_output_text="explicit-live-sentinel"
    )
    with TestClient(app) as client:
        body = payload()
        body["forwardedProps"].pop("mode", None)
        fixture = client.post("/agent", json=body)
        body["forwardedProps"]["mode"] = "live"
        live = client.post("/agent", json=body)
        assert client.get("/api/v1/runtime").json() == {"liveAvailable": True}
    assert "explicit-live-sentinel" not in fixture.text
    assert "explicit-live-sentinel" in "".join(
        event.get("delta", "")
        for event in events(live)
        if event["type"] == "TEXT_MESSAGE_CONTENT"
    )


def test_live_unavailable_never_falls_back_but_fixture_is_still_explicitly_available():
    app = create_app()
    with TestClient(app) as client:
        body = payload()
        body["forwardedProps"]["mode"] = "live"
        response = client.post("/agent", json=body)
        assert response.status_code == 503
        assert response.json() == {"error": "model_unavailable"}
        body["forwardedProps"]["mode"] = "fixture"
        assert client.post("/agent", json=body).status_code == 200
        body["forwardedProps"]["mode"] = "arbitrary-provider"
        assert client.post("/agent", json=body).status_code == 422


def test_missing_planning_is_a_safe_validation_error_not_a_server_exception():
    with TestClient(create_app(), raise_server_exceptions=False) as client:
        for forwarded in ({}, {"mode": "fixture"}):
            body = payload()
            body["forwardedProps"] = forwarded
            response = client.post("/agent", json=body)
            assert response.status_code == 422
            assert response.json() == {"error": "invalid_agent_request"}
