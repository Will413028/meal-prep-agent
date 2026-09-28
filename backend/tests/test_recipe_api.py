from fastapi.testclient import TestClient

from meal_prep.bootstrap.app import create_app


def test_public_catalog_exposes_controlled_synthetic_recipes():
    response = TestClient(create_app()).get("/api/v1/recipes")
    assert response.status_code == 200
    recipes = response.json()
    assert {recipe["id"] for recipe in recipes} >= {"oat-yogurt", "tofu-rice"}
    assert all(
        recipe["sourceLabel"] == "合成展示食譜，營養與成本非實測" for recipe in recipes
    )
