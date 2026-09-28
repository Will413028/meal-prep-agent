from typing import Literal

from pydantic import Field, model_validator

from meal_prep.modules.nutrition.contracts import Contract, JsonDecimal
from meal_prep.modules.nutrition.totals import NUTRIENTS, NutrientName


class NutrientRecord(Contract):
    amount: JsonDecimal | None = Field(ge=0)
    source: Literal["synthetic", "user"]
    version: str


class Ingredient(Contract):
    foodId: str
    name: str
    specification: str
    state: Literal["raw", "cooked", "ready"]
    quantity: JsonDecimal = Field(gt=0)
    unit: Literal["g", "ml", "piece"]
    increment: JsonDecimal = Field(gt=0)


class RecipeStep(Contract):
    id: str
    description: str
    minutes: int = Field(gt=0, le=240, strict=True)
    equipment: str | None
    dependsOn: tuple[str, ...]


class Recipe(Contract):
    id: str
    name: str
    sourceLabel: Literal["合成展示食譜，營養與成本非實測"]
    basisQuantity: JsonDecimal = Field(gt=0)
    basisUnit: Literal["serving", "g", "ml", "piece"]
    portionMinimum: JsonDecimal = Field(gt=0)
    portionMaximum: JsonDecimal = Field(gt=0)
    portionIncrement: JsonDecimal = Field(gt=0)
    mealSlots: tuple[Literal["breakfast", "lunch", "dinner", "snack"], ...]
    ingredients: tuple[Ingredient, ...] = Field(min_length=1)
    nutrients: dict[NutrientName, NutrientRecord]
    equipment: tuple[str, ...]
    dietaryTags: tuple[str, ...]
    steps: tuple[RecipeStep, ...] = Field(min_length=1)
    storage: str | None
    reheating: str | None
    cost: JsonDecimal | None = Field(ge=0)

    @model_validator(mode="after")
    def controlled(self) -> "Recipe":
        if set(self.nutrients) != set(NUTRIENTS):
            raise ValueError("every nutrient must be explicit, including null")
        if any(
            value.source != "synthetic" or value.version != "recipes-v1"
            for value in self.nutrients.values()
        ):
            raise ValueError("unsupported catalog source version")
        if self.portionMinimum > self.portionMaximum or not self.mealSlots:
            raise ValueError("invalid portions or meal slots")
        seen: set[str] = set()
        for step in self.steps:
            if step.id in seen or not set(step.dependsOn) <= seen:
                raise ValueError(
                    "steps must have unique ids and preceding dependencies"
                )
            if step.equipment is not None and step.equipment not in self.equipment:
                raise ValueError("step needs unavailable recipe equipment")
            seen.add(step.id)
        return self
