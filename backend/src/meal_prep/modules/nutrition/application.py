from decimal import Decimal

from .contracts import (
    GoalRanges,
    GoalRequest,
    GoalResult,
    GoalValues,
    InputRange,
    Range,
)
from .domain import TargetRange, expand_target, validate_energy


def interval(value: Decimal | InputRange) -> TargetRange:
    if isinstance(value, InputRange):
        return TargetRange(value.min, value.max)
    return TargetRange(value, value)


def planning_range(value: Decimal | InputRange, nutrient: str) -> Range:
    result = (
        interval(value)
        if isinstance(value, InputRange)
        else expand_target(value, nutrient)
    )
    return Range(min=result.minimum, max=result.maximum)


def validate_goal(request: GoalRequest) -> GoalResult:
    validate_energy(
        interval(request.kcal),
        (
            interval(request.protein),
            interval(request.carbs) if request.carbs is not None else None,
            interval(request.fat) if request.fat is not None else None,
        ),
    )
    return GoalResult(
        requested=GoalValues(**request.model_dump(exclude={"schemaVersion"})),
        ranges=GoalRanges(
            kcal=planning_range(request.kcal, "kcal"),
            protein=planning_range(request.protein, "protein"),
            carbs=planning_range(request.carbs, "carbs")
            if request.carbs is not None
            else None,
            fat=planning_range(request.fat, "fat") if request.fat is not None else None,
        ),
    )
