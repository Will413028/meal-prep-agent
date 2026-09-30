from collections.abc import Callable
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal, localcontext

from meal_prep.modules.nutrition.domain import TargetRange
from meal_prep.modules.nutrition.totals import (
    NUTRIENTS,
    DailyNutrition,
    calculate_day,
)
from meal_prep.modules.recipes.application import recipe_meal
from meal_prep.modules.recipes.catalog import load_catalog

from .application import evaluate, meal_nutrition, recipe_allowed, validate_proposal
from .contracts import (
    BuildProposalRequest,
    BuildProposalResult,
    PlanCandidate,
    PlannedMeal,
    ValidateProposalRequest,
)


class SearchCancelled(Exception):
    pass


def build_proposal(
    request: BuildProposalRequest, *, should_stop: Callable[[], bool] | None = None
) -> BuildProposalResult:
    examined = 0

    def checkpoint() -> None:
        if should_stop is not None and should_stop():
            raise SearchCancelled()

    checkpoint()

    def failure(reason: str) -> BuildProposalResult:
        return BuildProposalResult(
            status="not_found", proposal=None, reason=reason, examined=examined
        )

    catalog = load_catalog()
    dates = tuple(request.constraints.startDate + timedelta(days=i) for i in range(3))
    scope = {(key.day, key.slot) for key in request.context.scope}
    keys = {(day, slot) for day in dates for slot in request.constraints.slots}
    if request.base is None and not keys <= scope:
        return failure("scope_incomplete")
    replacement_keys = {f"{day}:{slot}" for day, slot in scope}
    if not set(request.replacements) <= replacement_keys:
        return failure("replacement_outside_scope")
    if any(recipe_id not in catalog for recipe_id in request.replacements.values()):
        return failure("no_controlled_substitute")
    try:
        base = (
            evaluate(request.base.candidate, request.base).candidate
            if request.base
            else None
        )
    except ValueError:
        return failure("invalid_base")
    pantry = (
        request.pantry if request.pantry is not None else base.pantry if base else ()
    )
    seeds = {(meal.day, meal.slot): meal for meal in base.meals} if base else {}
    fixed_keys = {(meal.day, meal.slot) for meal in request.fixedMeals}
    if len(fixed_keys) != len(request.fixedMeals):
        return failure("duplicate_fixed_meal")
    if any(
        f"{meal.day}:{meal.slot}" in request.replacements and meal.locked
        for meal in seeds.values()
    ):
        return failure("locked_scope_conflict")
    for meal in request.fixedMeals:
        if f"{meal.day}:{meal.slot}" in request.replacements:
            return failure(
                "locked_scope_conflict" if meal.locked else "fixed_meal_conflict"
            )
        seeds[(meal.day, meal.slot)] = meal
    try:
        seed = evaluate(
            PlanCandidate(
                goal=request.goal,
                constraints=request.constraints,
                pantry=pantry,
                meals=tuple(seeds.values()),
            )
        ).candidate
    except ValueError:
        return failure("hard_constraint_conflict")
    seeds = {(meal.day, meal.slot): meal for meal in seed.meals}
    targets = {
        name: TargetRange(value.min, value.max)
        for name in NUTRIENTS
        if (value := getattr(seed.goal.ranges, name)) is not None
    }

    def totals(day: date, meals: tuple[PlannedMeal, ...]) -> DailyNutrition:
        return calculate_day(
            day, tuple(meal_nutrition(meal, catalog) for meal in meals), targets
        )

    completed: list[PlannedMeal] = []
    with localcontext() as decimal_context:
        decimal_context.prec = 32
        decimal_context.rounding = ROUND_HALF_UP
        for day in dates:
            checkpoint()
            preserved = tuple(
                meal
                for key, meal in seeds.items()
                if meal.day == day
                and (
                    key not in scope
                    or key in fixed_keys
                    or meal.locked
                    or (
                        meal.kind == "external"
                        and f"{meal.day}:{meal.slot}" not in request.replacements
                    )
                )
            )
            editable = [
                slot
                for slot in request.constraints.slots
                if (day, slot) in scope
                and not any(meal.slot == slot for meal in preserved)
            ]
            winner = None
            for round_index in range(3):
                beam = [preserved]
                for slot in editable:
                    chosen = request.replacements.get(f"{day}:{slot}")
                    available = [
                        recipe
                        for recipe in catalog.values()
                        if slot in recipe.mealSlots
                        and (chosen is None or recipe.id == chosen)
                    ]
                    if not available:
                        return failure("no_controlled_substitute")
                    equipped = [
                        recipe
                        for recipe in available
                        if set(recipe.equipment) <= set(request.constraints.equipment)
                    ]
                    if not equipped:
                        return failure("equipment_unavailable")
                    allowed = [
                        recipe
                        for recipe in equipped
                        if recipe_allowed(recipe, request.constraints)
                    ]
                    if not allowed:
                        return failure("hard_constraint_conflict")
                    allowed.sort(
                        key=lambda recipe: (
                            -len(
                                {
                                    item.foodId for item in recipe.ingredients
                                }.intersection(request.constraints.preferredFoods)
                            ),
                            recipe.id,
                        )
                    )
                    offset = round_index % len(allowed)
                    allowed = (allowed[offset:] + allowed[:offset])[:4]
                    options = []
                    for recipe in allowed:
                        checkpoint()
                        quantity = recipe.portionMinimum
                        while quantity <= recipe.portionMaximum:
                            try:
                                recipe_meal(recipe, day, slot, quantity)
                                options.append(
                                    PlannedMeal(
                                        day=day,
                                        slot=slot,
                                        kind="recipe",
                                        recipeId=recipe.id,
                                        recipeSnapshot=recipe,
                                        quantity=quantity,
                                    )
                                )
                            except ValueError:
                                pass
                            quantity += recipe.portionIncrement
                    if not options:
                        return failure("no_operable_portion")
                    ranked = []
                    for partial in beam:
                        for option in options:
                            checkpoint()
                            if examined >= request.searchBudget:
                                return failure("search_budget_exhausted")
                            examined += 1
                            meals = partial + (option,)
                            summary = totals(day, meals)
                            fraction = (
                                Decimal(
                                    len(
                                        {
                                            meal.slot
                                            for meal in meals
                                            if meal.slot != "snack"
                                        }
                                    )
                                )
                                / 3
                            )
                            score = Decimal(0)
                            for name, target in targets.items():
                                if summary.nutrients[name].complete:
                                    center = (target.minimum + target.maximum) / 2
                                    if center:
                                        score += (
                                            abs(
                                                summary.nutrients[name].known
                                                - center * fraction
                                            )
                                            / center
                                            * (
                                                1 + round_index
                                                if name == "protein"
                                                else 1
                                            )
                                        )
                            score += Decimal("0.001") * (
                                len(meals) - len({meal.recipeId for meal in meals})
                            )
                            ranked.append((score, meals))
                    ranked.sort(key=lambda item: item[0])
                    beam = [meals for _, meals in ranked[:16]]
                for meals in beam:
                    summary = totals(day, meals)
                    if all(
                        value.within_target is not False
                        for value in summary.nutrients.values()
                    ):
                        winner = meals
                        break
                if winner is not None:
                    break
            if winner is None:
                return failure("not_found_within_search_limits")
            completed.extend(winner)
    try:
        checkpoint()
        proposal = validate_proposal(
            ValidateProposalRequest(
                context=request.context,
                base=request.base,
                candidate=PlanCandidate(
                    goal=request.goal,
                    constraints=request.constraints,
                    pantry=pantry,
                    meals=tuple(
                        sorted(completed, key=lambda meal: (meal.day, meal.slot))
                    ),
                ),
            )
        )
    except ValueError as error:
        return failure(f"candidate_rejected:{error}")
    return BuildProposalResult(
        status="ready", proposal=proposal, reason=None, examined=examined
    )
