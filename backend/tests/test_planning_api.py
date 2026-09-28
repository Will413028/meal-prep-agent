import pytest
from fastapi.testclient import TestClient
from test_planning import candidate, chicken
from test_planning_search import request

from meal_prep.bootstrap.app import create_app


def test_evaluate_http_serializes_dates_numbers_null_and_source_snapshots():
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/plans/evaluate",
            json=candidate((chicken(),)).model_dump(mode="json"),
        )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["days"][0]["day"] == "2026-10-01"
    assert data["days"][0]["nutrients"]["kcal"]["known"] == 700
    assert data["days"][0]["nutrients"]["kcal"]["withinTarget"] is None
    assert data["candidate"]["goal"]["confirmedAt"] == "2026-10-01T00:00:00Z"
    assert (
        data["candidate"]["meals"][0]["recipeSnapshot"]["nutrients"]["kcal"]["source"]
        == "synthetic"
    )


def test_build_and_validate_use_the_same_canonical_contract():
    req = request().model_dump(mode="json")
    with TestClient(create_app()) as client:
        built = client.post("/api/v1/proposals/build", json=req)
        assert built.status_code == 200, built.text
        proposal = built.json()["proposal"]
        validated = client.post(
            "/api/v1/proposals/validate",
            json={
                "context": req["context"],
                "base": None,
                "candidate": proposal["evaluation"]["candidate"],
            },
        )
    assert validated.status_code == 200, validated.text
    assert validated.json() == proposal


@pytest.mark.parametrize(
    "field,value",
    [("schemaVersion", True), ("confirmedAt", "0"), ("startDate", "9999-12-31")],
)
def test_public_contract_rejects_coerced_versions_and_invalid_calendar_windows(
    field, value
):
    body = candidate().model_dump(mode="json")
    target = (
        body
        if field == "schemaVersion"
        else body["goal"]
        if field == "confirmedAt"
        else body["constraints"]
    )
    target[field] = value
    with TestClient(create_app(), raise_server_exceptions=False) as client:
        response = client.post("/api/v1/plans/evaluate", json=body)
    assert response.status_code == 422, response.text


def test_proposal_revision_must_be_a_javascript_safe_integer():
    body = request().model_dump(mode="json")
    body["context"]["baseRevision"] = 9007199254740992
    with TestClient(create_app(), raise_server_exceptions=False) as client:
        response = client.post("/api/v1/proposals/build", json=body)
    assert response.status_code == 422, response.text


@pytest.mark.parametrize(
    "amount,basis", [("1e309", "1"), ("1", "1e-400"), ("1e308", "0.001")]
)
def test_external_numbers_that_cannot_round_trip_fail_without_a_server_error(
    amount, basis
):
    import json

    body = candidate().model_dump(mode="json")
    body["meals"] = [
        {
            "day": "2026-10-01",
            "slot": "lunch",
            "kind": "external",
            "quantity": 1,
            "external": {
                "name": "合成外食",
                "basisQuantity": "BASIS",
                "basisUnit": "serving",
                "nutrients": {
                    name: {
                        "amount": "AMOUNT" if name == "kcal" else None,
                        "source": "user",
                        "version": "user-v1",
                    }
                    for name in ("kcal", "protein", "carbs", "fat")
                },
            },
        }
    ]
    raw = json.dumps(body).replace('"AMOUNT"', amount).replace('"BASIS"', basis)
    with TestClient(create_app(), raise_server_exceptions=False) as client:
        response = client.post(
            "/api/v1/plans/evaluate",
            content=raw,
            headers={"Content-Type": "application/json"},
        )
    assert response.status_code == 422, response.text
