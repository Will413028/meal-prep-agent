import json
from pathlib import Path

from fastapi.testclient import TestClient

from meal_prep.bootstrap.app import create_app


def test_export_real_http_goal_responses_for_typescript() -> None:
    with TestClient(create_app()) as client:
        responses = [
            client.post("/api/v1/goals/validate", json=body)
            for body in [
                {"schemaVersion": 1, "kcal": 2000, "protein": 100},
                {
                    "schemaVersion": 1,
                    "kcal": {"min": 1950, "max": 2050},
                    "protein": 99.9,
                },
            ]
        ]
    assert all(response.status_code == 200 for response in responses)
    artifact = Path(__file__).resolve().parents[2] / ".artifacts/wire-goals.json"
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_text(json.dumps([response.json() for response in responses]))
