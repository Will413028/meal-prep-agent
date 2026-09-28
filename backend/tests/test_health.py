from fastapi.testclient import TestClient

from meal_prep.bootstrap.app import create_app


def test_health_returns_only_technical_status() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
