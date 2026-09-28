from typing import Literal
from uuid import UUID

from pydantic import Field

from meal_prep.modules.nutrition.contracts import Contract, JsonDecimal


class FoodIdentity(Contract):
    foodId: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=120)
    specification: str = Field(min_length=1, max_length=120)
    state: Literal["raw", "cooked", "ready"]
    unit: Literal["g", "kg", "ml", "l", "piece"]


class PantryItem(FoodIdentity):
    quantity: JsonDecimal | None = Field(ge=0)
    confirmed: bool = Field(strict=True)


class ShoppingItem(FoodIdentity):
    id: UUID
    required: JsonDecimal = Field(ge=0)
    pantryUsed: JsonDecimal = Field(ge=0)
    toBuy: JsonDecimal = Field(ge=0)
    checked: bool
    requiresReconfirmation: bool


class ShoppingList(Contract):
    items: tuple[ShoppingItem, ...]
    warnings: tuple[str, ...]
