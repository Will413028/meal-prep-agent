"""Explicit synthetic demonstration model; never selected as an error fallback."""

import json
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal

from pydantic_ai.messages import ToolReturnPart
from pydantic_ai.models.function import DeltaToolCall, FunctionModel

from meal_prep.modules.recipes.catalog import load_catalog
from meal_prep.platform.runtime import RunCapacity

from ..application import recipe_allowed
from ..contracts import BuildProposalRequest, MealKey
from ..execution import calculate


@dataclass(frozen=True)
class FixtureChoice:
    replacement: dict[str, object]
    unavailable_reason: (
        Literal["locked_scope_conflict", "no_controlled_substitute"] | None
    ) = None


async def fixture_choice(
    request: BuildProposalRequest,
    capacity: RunCapacity,
    disconnected: Callable[[], Awaitable[bool]],
) -> FixtureChoice:
    if request.base is None or request.replacements:
        return FixtureChoice({})
    scope = {(meal.day, meal.slot) for meal in request.context.scope}
    scoped = [
        meal
        for meal in request.base.candidate.meals
        if meal.kind == "recipe" and (meal.day, meal.slot) in scope
    ]
    for meal in scoped:
        if meal.locked:
            continue
        for recipe in load_catalog().values():
            if (
                recipe.id == meal.recipeId
                or meal.slot not in recipe.mealSlots
                or not recipe_allowed(recipe, request.constraints)
            ):
                continue
            key = MealKey(day=meal.day, slot=meal.slot)
            candidate = request.model_copy(
                update={
                    "context": request.context.model_copy(update={"scope": (key,)}),
                    "replacements": {f"{meal.day}:{meal.slot}": recipe.id},
                },
                deep=True,
            )
            result = await calculate(candidate, capacity, disconnected)
            if (
                result.status == "ready"
                and result.proposal
                and len(result.proposal.diff) == 1
            ):
                return FixtureChoice(
                    {
                        "replacement": {
                            "day": str(meal.day),
                            "slot": meal.slot,
                            "recipeId": recipe.id,
                        }
                    }
                )
    return FixtureChoice(
        {},
        "locked_scope_conflict"
        if scoped and all(meal.locked for meal in scoped)
        else "no_controlled_substitute",
    )


def fixture_model(replacement: dict[str, object]) -> FunctionModel:
    async def stream(messages: Any, _info: Any) -> AsyncIterator[Any]:
        returned = {
            part.tool_name
            for part in messages[-1].parts
            if isinstance(part, ToolReturnPart)
        }
        if "build_proposal" in returned:
            yield "合成展示：已執行固定工具流程，尚未採用；本模式不理解自由文字，請用表單調整條件。"
        else:
            tool = "build_proposal" if "find_recipes" in returned else "find_recipes"
            yield {
                0: DeltaToolCall(
                    name=tool,
                    json_args=json.dumps(
                        replacement if tool == "build_proposal" else {}
                    ),
                    tool_call_id=f"fixture-{tool}",
                )
            }

    return FunctionModel(stream_function=stream)
