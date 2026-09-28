import pytest
from fastapi.testclient import TestClient

from meal_prep.bootstrap.app import create_app


def test_manual_goal_accepts_optional_nulls_and_returns_numeric_ranges() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/goals/validate",
            json={"schemaVersion": 1, "kcal": 2000, "protein": 100},
        )
    assert response.status_code == 200
    assert response.json() == {
        "schemaVersion": 1,
        "policyVersion": "nutrition-v1",
        "requested": {"kcal": 2000, "protein": 100, "carbs": None, "fat": None},
        "ranges": {
            "kcal": {"min": 1900, "max": 2100},
            "protein": {"min": 100, "max": 110},
            "carbs": None,
            "fat": None,
        },
    }


@pytest.mark.parametrize(
    "patch",
    [
        {"kcal": 1199},
        {"kcal": 5000.1},
        {"protein": 29},
        {"protein": 251},
        {"carbs": -0.1},
        {"carbs": 800.1},
        {"fat": -0.1},
        {"fat": 250.1},
        {"kcal": "2000"},
        {"kcal": True},
        {"protein": 100.01},
        {"kcal": None},
        {"schemaVersion": 2},
        {"schemaVersion": True},
        {"age": 30},
        {"carbs": "NaN"},
        {"fat": "Infinity"},
    ],
)
def test_invalid_goal_is_rejected_without_echoing_input(
    patch: dict[str, object],
) -> None:
    payload = {"schemaVersion": 1, "kcal": 2000, "protein": 100} | patch
    with TestClient(create_app()) as client:
        response = client.post("/api/v1/goals/validate", json=payload)
    assert response.status_code == 422
    assert all("input" not in error for error in response.json()["detail"])


@pytest.mark.parametrize(
    "kcal,protein,carbs,fat,expected",
    [
        (1200, 30, None, None, (1200, 1260, 30, 33)),
        (5000, 250, None, None, (4750, 5000, 250, 250)),
        (2000, 100, 0, None, (1900, 2100, 100, 110)),
        (5000, 100, 800, None, (4750, 5000, 100, 110)),
        (5000, 100, None, 250, (4750, 5000, 100, 110)),
    ],
)
def test_endpoints_clip_tolerance_to_supported_domain(
    kcal, protein, carbs, fat, expected
) -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/goals/validate",
            json={
                "schemaVersion": 1,
                "kcal": kcal,
                "protein": protein,
                "carbs": carbs,
                "fat": fat,
            },
        )
    assert response.status_code == 200
    ranges = response.json()["ranges"]
    assert (
        ranges["kcal"]["min"],
        ranges["kcal"]["max"],
        ranges["protein"]["min"],
        ranges["protein"]["max"],
    ) == expected
    if carbs is None:
        assert ranges["carbs"] is None
    elif carbs == 0:
        assert ranges["carbs"] == {"min": 0, "max": 0}


def test_explicit_ranges_are_preserved_without_extra_tolerance() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/goals/validate",
            json={
                "schemaVersion": 1,
                "kcal": {"min": 1950, "max": 2050},
                "protein": {"min": 100, "max": 120},
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["requested"]["kcal"] == {"min": 1950, "max": 2050}
    assert body["ranges"]["kcal"] == {"min": 1950, "max": 2050}
    assert body["ranges"]["protein"] == {"min": 100, "max": 120}


@pytest.mark.parametrize(
    "value",
    [
        {"min": 2000, "max": 1900},
        {"min": 1199, "max": 2000},
        {"min": 2000, "max": 5001},
        {"min": "1900", "max": 2000},
        {"min": 1900.01, "max": 2000},
        {"min": 1900},
    ],
)
def test_invalid_range_is_rejected(value) -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/goals/validate",
            json={
                "schemaVersion": 1,
                "kcal": value,
                "protein": 100,
            },
        )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "patch",
    [
        {
            "kcal": {"min": 1200, "max": 1300},
            "protein": {"min": 200, "max": 220},
            "carbs": {"min": 200, "max": 220},
            "fat": {"min": 50, "max": 60},
        },
        {"kcal": 1200, "protein": 250, "carbs": 100},
        {"kcal": 2000, "protein": 100, "carbs": 100, "fat": 0},
    ],
)
def test_conflicting_energy_is_rejected(patch) -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/goals/validate", json={"schemaVersion": 1} | patch
        )
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "goal_energy_conflict"


def test_energy_intersection_includes_endpoints_and_uses_requested_ranges() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/goals/validate",
            json={
                "schemaVersion": 1,
                "kcal": {"min": 2000, "max": 2100},
                "protein": 100,
                "carbs": 400,
                "fat": 0,
            },
        )
    assert response.status_code == 200


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity"])
def test_nonfinite_json_is_rejected_without_serialization_failure(value) -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/goals/validate",
            content='{"schemaVersion":1,"kcal":' + value + ',"protein":100}',
            headers={"Content-Type": "application/json"},
        )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "field,value", [("kcal", "5000.00000000000001"), ("carbs", "1e-999")]
)
def test_raw_decimal_lexeme_is_not_rounded_before_validation(field, value) -> None:
    body = '{"schemaVersion":1,"protein":100,'
    body += '"kcal":2000,' if field != "kcal" else ""
    body += '"' + field + '":' + value + "}"
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/goals/validate",
            content=body,
            headers={"Content-Type": "application/json"},
        )
    assert response.status_code == 422
