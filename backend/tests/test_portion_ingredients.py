from datetime import date
from decimal import Decimal

from meal_prep.modules.recipes.application import RecipePortion, portion_ingredients
from meal_prep.modules.recipes.catalog import load_catalog


def test_recipe_ingredients_use_each_meal_quantity_without_mutating_catalog():
    recipe = load_catalog()["chicken-rice"]
    portion = RecipePortion(recipe, date(2026, 10, 1), "lunch", Decimal("1.5"))
    ingredients = portion_ingredients(portion)
    assert {item.foodId: item.quantity for item in ingredients} == {
        "chicken": 270,
        "rice": 150,
        "broccoli": 180,
    }
    assert recipe.ingredients[0].quantity == 180
