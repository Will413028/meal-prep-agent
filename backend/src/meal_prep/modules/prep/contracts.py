from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from meal_prep.modules.nutrition.contracts import Contract, JsonDecimal


class PortionDestination(Contract):
    id: UUID
    day: date
    slot: Literal["breakfast", "lunch", "dinner", "snack"]
    recipeId: str
    quantity: JsonDecimal = Field(gt=0)
    unit: Literal["serving", "g", "ml", "piece"]
    storage: str | None
    reheating: str | None


class PrepStep(Contract):
    id: UUID
    destinationId: UUID
    recipeStepId: str
    description: str
    equipment: str | None
    dependsOn: tuple[UUID, ...]
    startMinute: int = Field(ge=0)
    endMinute: int = Field(gt=0)
    checked: bool


class PrepPlan(Contract):
    model_config = ConfigDict(
        extra="forbid", json_schema_serialization_defaults_required=True
    )
    destinations: tuple[PortionDestination, ...]
    steps: tuple[PrepStep, ...]
    totalMinutes: int = Field(ge=0)
    sourceLabel: Literal["合成示範流程；時間為估計，非食品安全指引"] = (
        "合成示範流程；時間為估計，非食品安全指引"
    )
