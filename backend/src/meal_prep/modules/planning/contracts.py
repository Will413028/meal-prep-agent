import re
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BeforeValidator,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from meal_prep.modules.nutrition.contracts import Contract, GoalResult, JsonDecimal
from meal_prep.modules.nutrition.totals import NutrientName
from meal_prep.modules.prep.contracts import PrepPlan, PrepStep
from meal_prep.modules.recipes.contracts import NutrientRecord, Recipe
from meal_prep.modules.shopping.contracts import PantryItem, ShoppingItem, ShoppingList

Slot = Literal["breakfast", "lunch", "dinner", "snack"]


def calendar_date(value: object) -> object:
    if type(value) is date:
        return value
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("expected YYYY-MM-DD")
    return value


CalendarDate = Annotated[date, BeforeValidator(calendar_date)]


class ConfirmedGoal(GoalResult):
    intent: Literal["maintain", "lose", "gain"]
    source: Literal["manual", "estimated", "user_adjusted"]
    references: tuple[str, ...] = Field(max_length=4)
    confirmedAt: AwareDatetime

    @field_validator("confirmedAt", mode="before")
    @classmethod
    def timestamp(cls, value: object) -> object:
        if not isinstance(value, (str, datetime)):
            raise ValueError("expected an ISO timestamp with timezone")
        if isinstance(value, str) and not re.fullmatch(
            r"\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})", value
        ):
            raise ValueError("expected an ISO timestamp with timezone")
        return value

    @field_validator("confirmedAt")
    @classmethod
    def utc(cls, value: datetime) -> datetime:
        return value.astimezone(timezone.utc)


class MealKey(Contract):
    day: CalendarDate
    slot: Slot


class ExternalMeal(Contract):
    name: str = Field(min_length=1, max_length=120)
    basisQuantity: JsonDecimal = Field(gt=0, le=10000)
    basisUnit: Literal["serving", "g", "ml", "piece"]
    nutrients: dict[NutrientName, NutrientRecord] = Field(min_length=4, max_length=4)
    ingredientsKnown: Literal[False] = False

    @model_validator(mode="after")
    def complete_keys(self) -> "ExternalMeal":
        if set(self.nutrients) != {"kcal", "protein", "carbs", "fat"}:
            raise ValueError(
                "external nutrients must explicitly include unknown values"
            )
        return self


class PlannedMeal(MealKey):
    model_config = ConfigDict(
        extra="forbid", json_schema_serialization_defaults_required=True
    )
    kind: Literal["recipe", "external"]
    quantity: JsonDecimal = Field(gt=0, le=10000, decimal_places=3)
    locked: bool = Field(default=False, strict=True)
    recipeId: str | None = None
    recipeSnapshot: Recipe | None = None
    external: ExternalMeal | None = None

    @model_validator(mode="after")
    def kind_fields(self) -> "PlannedMeal":
        if self.kind == "recipe":
            if not self.recipeId or self.external is not None:
                raise ValueError("recipe meal needs recipeId and no external snapshot")
        elif (
            self.external is None
            or self.recipeId is not None
            or self.recipeSnapshot is not None
        ):
            raise ValueError("external meal needs only its external snapshot")
        elif "locked" not in self.model_fields_set:
            self.locked = True
        return self


class PlanningConstraints(Contract):
    startDate: CalendarDate
    slots: tuple[Slot, ...] = Field(min_length=1, max_length=4)
    equipment: tuple[str, ...] = Field(max_length=16)
    excludedFoods: tuple[str, ...] = Field(default=(), max_length=64)
    dietaryTags: tuple[str, ...] = Field(default=(), max_length=8)
    preferredFoods: tuple[str, ...] = Field(default=(), max_length=32)
    timeLimitMinutes: int | None = Field(default=None, ge=1, le=240, strict=True)
    timeIsHard: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def unique_slots(self) -> "PlanningConstraints":
        try:
            self.startDate + timedelta(days=2)
        except OverflowError as error:
            raise ValueError("three-day date window is out of range") from error
        if len(set(self.slots)) != len(self.slots):
            raise ValueError("duplicate meal slots")
        if self.timeIsHard and self.timeLimitMinutes is None:
            raise ValueError("hard time limit needs minutes")
        return self


class PlanCandidate(Contract):
    model_config = ConfigDict(
        extra="forbid", json_schema_serialization_defaults_required=True
    )
    schemaVersion: Literal[1] = 1
    catalogVersion: Literal["recipes-v1"] = "recipes-v1"
    nutritionPolicyVersion: Literal["nutrition-v1"] = "nutrition-v1"
    calculationVersion: Literal["calculation-v1"] = "calculation-v1"
    goal: ConfirmedGoal
    constraints: PlanningConstraints
    meals: tuple[PlannedMeal, ...] = Field(max_length=12)
    pantry: tuple[PantryItem, ...] = Field(default=(), max_length=128)


class ProposalContext(Contract):
    planId: UUID
    baseRevision: int = Field(ge=0, le=9007199254740991, strict=True)
    sessionGeneration: UUID
    runId: UUID
    scope: tuple[MealKey, ...] = Field(min_length=1, max_length=12)


class NutrientSummary(Contract):
    known: JsonDecimal
    complete: bool
    missing: tuple[str, ...]
    withinTarget: bool | None
    targetDifference: JsonDecimal | None


class DailySummary(Contract):
    day: CalendarDate
    nutrients: dict[NutrientName, NutrientSummary] = Field(min_length=4, max_length=4)
    coverage: tuple[str, ...]
    fullDay: bool
    withinTargets: bool | None


class MealSummary(MealKey):
    nutrients: dict[NutrientName, NutrientRecord] = Field(min_length=4, max_length=4)


class Evaluation(Contract):
    candidate: PlanCandidate
    days: tuple[DailySummary, ...]
    warnings: tuple[str, ...]
    shopping: ShoppingList
    prep: PrepPlan
    mealNutrition: tuple[MealSummary, ...]


class EvaluatePlanRequest(Contract):
    candidate: PlanCandidate
    base: Evaluation | None = None


class ShoppingDiff(Contract):
    id: UUID
    before: ShoppingItem | None
    after: ShoppingItem | None


class PrepDiff(Contract):
    id: UUID
    before: PrepStep | None
    after: PrepStep | None


class MealDiff(Contract):
    key: MealKey
    before: PlannedMeal | None
    after: PlannedMeal | None


class CanonicalProposal(ProposalContext):
    model_config = ConfigDict(
        extra="forbid", json_schema_serialization_defaults_required=True
    )
    evaluation: Evaluation
    diff: tuple[MealDiff, ...]
    shoppingDiff: tuple[ShoppingDiff, ...]
    prepDiff: tuple[PrepDiff, ...]
    violations: tuple[str, ...] = ()


class ValidateProposalRequest(Contract):
    context: ProposalContext
    base: Evaluation | None
    candidate: PlanCandidate


class BuildPreferences(Contract):
    goal: ConfirmedGoal
    constraints: PlanningConstraints
    pantry: tuple[PantryItem, ...] | None = Field(default=None, max_length=128)
    fixedMeals: tuple[PlannedMeal, ...] = Field(default=(), max_length=12)
    replacements: dict[str, str] = Field(default_factory=dict, max_length=12)
    searchBudget: int = Field(default=20000, ge=1, le=20000, strict=True)


class BuildProposalRequest(BuildPreferences):
    context: ProposalContext
    base: Evaluation | None


class BuildProposalResult(Contract):
    status: Literal["ready", "not_found"]
    proposal: CanonicalProposal | None
    reason: str | None
    examined: int = Field(ge=0)
