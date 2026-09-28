from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, localcontext
from typing import Literal

from .domain import TargetRange

NutrientName = Literal["kcal", "protein", "carbs", "fat"]
NUTRIENTS: tuple[NutrientName, ...] = ("kcal", "protein", "carbs", "fat")


@dataclass(frozen=True)
class NutrientValue:
    amount: Decimal | None
    source: str
    version: str


@dataclass(frozen=True)
class MealNutrition:
    day: date
    slot: Literal["breakfast", "lunch", "dinner", "snack"]
    nutrients: dict[NutrientName, NutrientValue]
    quantity: Decimal
    basis_quantity: Decimal
    source_id: str


@dataclass(frozen=True)
class NutrientTotal:
    known: Decimal
    complete: bool
    missing: tuple[str, ...]
    within_target: bool | None
    target_difference: Decimal | None = None


@dataclass(frozen=True)
class DailyNutrition:
    nutrients: dict[NutrientName, NutrientTotal]
    coverage: tuple[str, ...]
    full_day: bool
    within_targets: bool | None


def calculate_day(
    day: date,
    meals: tuple[MealNutrition, ...],
    targets: dict[NutrientName, TargetRange],
) -> DailyNutrition:
    selected = tuple(meal for meal in meals if meal.day == day)
    slots = ("breakfast", "lunch", "dinner", "snack")
    coverage = tuple(
        slot for slot in slots if any(meal.slot == slot for meal in selected)
    )
    if len(coverage) != len(selected):
        raise ValueError("duplicate or unknown meal slot")
    full_day = all(slot in coverage for slot in slots[:3])
    totals: dict[NutrientName, NutrientTotal] = {}
    with localcontext() as context:
        context.prec = 32
        context.rounding = ROUND_HALF_UP
        for name in NUTRIENTS:
            known = Decimal(0)
            missing: list[str] = []
            for meal in selected:
                if (
                    not meal.quantity.is_finite()
                    or meal.quantity <= 0
                    or not meal.basis_quantity.is_finite()
                    or meal.basis_quantity <= 0
                ):
                    raise ValueError("quantity and basis must be finite and positive")
                value = meal.nutrients[name]
                if (value.source, value.version) not in {
                    ("synthetic", "recipes-v1"),
                    ("user", "user-v1"),
                }:
                    raise ValueError("unsupported source version")
                if value.amount is None:
                    missing.append(meal.slot)
                else:
                    if not value.amount.is_finite() or value.amount < 0:
                        raise ValueError("nutrient must be finite and nonnegative")
                    known += value.amount * meal.quantity / meal.basis_quantity
            target = targets.get(name)
            complete = bool(selected) and not missing
            within = (
                target.minimum <= known <= target.maximum
                if full_day and complete and target
                else None
            )
            difference = None
            if within is not None and target is not None:
                difference = min(max(known, target.minimum), target.maximum) - known
            totals[name] = NutrientTotal(
                known, complete, tuple(missing), within, difference
            )
    within_targets = None
    if full_day and targets and all(totals[name].complete for name in targets):
        within_targets = all(totals[name].within_target for name in targets)
    return DailyNutrition(totals, coverage, full_day, within_targets)
