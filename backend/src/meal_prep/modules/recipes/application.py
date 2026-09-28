from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, localcontext
from typing import Literal

from meal_prep.modules.nutrition.totals import MealNutrition, NutrientValue

from .catalog import validate_portion
from .contracts import Ingredient, Recipe


@dataclass(frozen=True)
class RecipePortion:
    recipe: Recipe
    day: date
    slot: Literal["breakfast", "lunch", "dinner", "snack"]
    quantity: Decimal


def portion_ingredients(portion: RecipePortion) -> tuple[Ingredient, ...]:
    validate_recipe_portion(portion.recipe, portion.slot, portion.quantity)
    with localcontext() as context:
        context.prec = 32
        context.rounding = ROUND_HALF_UP
        return tuple(
            Ingredient.model_validate(
                {
                    **item.model_dump(),
                    "quantity": item.quantity
                    * portion.quantity
                    / portion.recipe.basisQuantity,
                }
            )
            for item in portion.recipe.ingredients
        )


def recipe_meal(
    recipe: Recipe,
    day: date,
    slot: Literal["breakfast", "lunch", "dinner", "snack"],
    quantity: Decimal,
) -> MealNutrition:
    validate_recipe_portion(recipe, slot, quantity)
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


def validate_recipe_portion(
    recipe: Recipe,
    slot: Literal["breakfast", "lunch", "dinner", "snack"],
    quantity: Decimal,
) -> None:
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
