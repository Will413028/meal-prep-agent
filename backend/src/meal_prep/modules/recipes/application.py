from datetime import date
from decimal import Decimal
from typing import Literal

from meal_prep.modules.nutrition.totals import MealNutrition, NutrientValue

from .catalog import validate_portion
from .contracts import Recipe


def recipe_meal(
    recipe: Recipe,
    day: date,
    slot: Literal["breakfast", "lunch", "dinner", "snack"],
    quantity: Decimal,
) -> MealNutrition:
    if slot not in recipe.mealSlots:
        raise ValueError("recipe does not support this meal slot")
    validate_portion(
        quantity,
        recipe.portionMinimum,
        recipe.portionMaximum,
        recipe.portionIncrement,
        tuple((item.quantity, item.increment) for item in recipe.ingredients),
        recipe.basisQuantity,
    )
    return MealNutrition(
        day,
        slot,
        {
            name: NutrientValue(value.amount, value.source, value.version)
            for name, value in recipe.nutrients.items()
        },
        quantity,
        recipe.basisQuantity,
        recipe.id,
    )
