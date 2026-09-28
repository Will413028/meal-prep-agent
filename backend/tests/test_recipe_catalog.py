from datetime import date
from decimal import Decimal

import pytest

from meal_prep.modules.nutrition.totals import calculate_day
from meal_prep.modules.recipes.application import recipe_meal
from meal_prep.modules.recipes.catalog import load_catalog


def test_packaged_catalog_is_explicitly_synthetic_and_contains_distinct_operable_foods():
    catalog = load_catalog()
    assert {"oat-yogurt", "chicken-rice", "tofu-rice", "whole-eggs"} <= catalog.keys()
    assert (
        catalog["chicken-rice"].nutrients["protein"].amount
        != catalog["tofu-rice"].nutrients["protein"].amount
    )
    assert catalog["whole-eggs"].portionIncrement == 1
    for recipe in catalog.values():
        assert recipe.sourceLabel == "合成展示食譜，營養與成本非實測"
        assert recipe.nutrients["kcal"].source == "synthetic"
        assert recipe.nutrients["kcal"].version == "recipes-v1"
        assert recipe.ingredients
        assert recipe.steps
    assert {
        item.state for recipe in catalog.values() for item in recipe.ingredients
    } >= {"raw", "cooked"}


def test_recipe_snapshot_scales_nutrients_with_provenance():
    catalog = load_catalog()
    day = date(2026, 10, 1)
    meal = recipe_meal(catalog["chicken-rice"], day, "lunch", Decimal("1.5"))
    assert set(meal.nutrients) == {"kcal", "protein", "carbs", "fat"}
    assert meal.nutrients["protein"].source == "synthetic"
    result = calculate_day(day, (meal,), {})
    assert result.nutrients["kcal"].known == Decimal(1050)
    assert result.nutrients["protein"].known == Decimal("67.5")


def test_recipe_adapter_enforces_portions_and_supported_slots():
    recipe = load_catalog()["whole-eggs"]
    with pytest.raises(ValueError):
        recipe_meal(recipe, date(2026, 10, 1), "breakfast", Decimal("1.5"))
    with pytest.raises(ValueError):
        recipe_meal(recipe, date(2026, 10, 1), "dinner", Decimal(1))


def test_whole_item_scaling_does_not_round_a_repeating_intermediate_ratio():
    original = load_catalog()["whole-eggs"]
    data = original.model_dump(mode="json")
    data.update(basisQuantity=3, portionMinimum=3, portionMaximum=6, portionIncrement=3)
    data["ingredients"][0]["quantity"] = 1
    recipe = type(original).model_validate(data)
    result = recipe_meal(recipe, date(2026, 10, 1), "breakfast", Decimal(3))
    assert result.quantity == Decimal(3)
    assert result.basis_quantity == Decimal(3)
