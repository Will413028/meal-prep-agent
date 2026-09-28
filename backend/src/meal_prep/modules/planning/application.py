from datetime import timedelta

from meal_prep.modules.nutrition.application import validate_goal
from meal_prep.modules.nutrition.contracts import GoalRequest
from meal_prep.modules.nutrition.domain import TargetRange
from meal_prep.modules.nutrition.totals import (
    NUTRIENTS,
    MealNutrition,
    NutrientValue,
    calculate_day,
)
from meal_prep.modules.recipes.application import recipe_meal
from meal_prep.modules.recipes.catalog import load_catalog
from meal_prep.modules.recipes.contracts import Recipe

from .contracts import (
    CanonicalProposal,
    DailySummary,
    Evaluation,
    MealDiff,
    MealKey,
    NutrientSummary,
    PlanCandidate,
    PlannedMeal,
    PlanningConstraints,
    ValidateProposalRequest,
)


def meal_nutrition(meal: PlannedMeal, catalog: dict[str, Recipe]) -> MealNutrition:
    if meal.kind == "recipe":
        assert meal.recipeId is not None
        return recipe_meal(catalog[meal.recipeId], meal.day, meal.slot, meal.quantity)
    external = meal.external
    assert external is not None
    return MealNutrition(
        meal.day,
        meal.slot,
        {
            name: NutrientValue(value.amount, value.source, value.version)
            for name, value in external.nutrients.items()
        },
        meal.quantity,
        external.basisQuantity,
        external.name,
    )


def validate_proposal(request: ValidateProposalRequest) -> CanonicalProposal:
    evaluation = evaluate(request.candidate)
    base = evaluate(request.base).candidate if request.base else None
    old = {(meal.day, meal.slot): meal for meal in base.meals} if base else {}
    new = {(meal.day, meal.slot): meal for meal in evaluation.candidate.meals}
    scope = {(key.day, key.slot) for key in request.context.scope}
    if len(scope) != len(request.context.scope):
        raise ValueError("duplicate scope")
    dates = {
        evaluation.candidate.constraints.startDate + timedelta(days=i) for i in range(3)
    }
    if any(day not in dates for day, _ in scope):
        raise ValueError("scope outside plan dates")
    if base and (
        base.goal != evaluation.candidate.goal
        or base.constraints != evaluation.candidate.constraints
    ):
        all_keys = (
            {
                (base.constraints.startDate + timedelta(days=i), slot)
                for i in range(3)
                for slot in base.constraints.slots
            }
            | set(old)
            | set(new)
        )
        if not all_keys <= scope:
            raise ValueError("global metadata change exceeds scope")
    diff = []
    for key in sorted(set(old) | set(new)):
        before, after = old.get(key), new.get(key)
        if before == after:
            continue
        if key not in scope:
            raise ValueError("change outside scope")
        if before and before.locked:
            raise ValueError("locked meal cannot change including its portion")
        diff.append(
            MealDiff(key=MealKey(day=key[0], slot=key[1]), before=before, after=after)
        )
    if any(
        value.withinTarget is False
        for day in evaluation.days
        for value in day.nutrients.values()
    ):
        raise ValueError("known full-day nutrition outside target")
    return CanonicalProposal(
        **request.context.model_dump(), evaluation=evaluation, diff=tuple(diff)
    )


def recipe_allowed(recipe: Recipe, constraints: PlanningConstraints) -> bool:
    return (
        set(recipe.equipment) <= set(constraints.equipment)
        and not {item.foodId for item in recipe.ingredients}.intersection(
            constraints.excludedFoods
        )
        and set(constraints.dietaryTags) <= set(recipe.dietaryTags)
        and (
            not constraints.timeIsHard
            or (
                constraints.timeLimitMinutes is not None
                and sum(step.minutes for step in recipe.steps)
                <= constraints.timeLimitMinutes
            )
        )
    )


def evaluate(candidate: PlanCandidate) -> Evaluation:
    canonical = candidate.model_copy(deep=True)
    goal = validate_goal(
        GoalRequest(schemaVersion=1, **canonical.goal.requested.model_dump())
    )
    if goal.ranges != canonical.goal.ranges:
        raise ValueError("goal ranges do not match validated targets")
    catalog = load_catalog()
    dates = tuple(canonical.constraints.startDate + timedelta(days=i) for i in range(3))
    seen = set()
    nutrients = []
    warnings = []
    for meal in canonical.meals:
        key = (meal.day, meal.slot)
        if meal.day not in dates or key in seen:
            raise ValueError("meal outside dates or duplicate slot")
        seen.add(key)
        if (
            meal.slot not in canonical.constraints.slots
            and not meal.locked
            and meal.kind != "external"
        ):
            raise ValueError("meal outside requested slots")
        if meal.kind == "recipe":
            recipe = catalog.get(meal.recipeId or "")
            if recipe is None:
                raise ValueError("recipe not in controlled catalog")
            if meal.recipeSnapshot is not None and meal.recipeSnapshot != recipe:
                raise ValueError("recipe source snapshot mismatch")
            if not recipe_allowed(recipe, canonical.constraints):
                raise ValueError("recipe violates hard constraint")
            meal.recipeSnapshot = recipe.model_copy(deep=True)
            if (
                canonical.constraints.timeLimitMinutes is not None
                and sum(step.minutes for step in recipe.steps)
                > canonical.constraints.timeLimitMinutes
            ):
                warnings.append(f"soft_time_exceeded:{meal.day}:{meal.slot}")
        else:
            warnings.append(f"external_ingredients_unverified:{meal.day}:{meal.slot}")
        nutrients.append(meal_nutrition(meal, catalog))
    targets = {
        name: TargetRange(value.min, value.max)
        for name in NUTRIENTS
        if (value := getattr(goal.ranges, name)) is not None
    }
    days = []
    for day in dates:
        total = calculate_day(day, tuple(nutrients), targets)
        days.append(
            DailySummary(
                day=day,
                nutrients={
                    name: NutrientSummary(
                        known=value.known,
                        complete=value.complete,
                        missing=value.missing,
                        withinTarget=value.within_target,
                    )
                    for name, value in total.nutrients.items()
                },
                coverage=total.coverage,
                fullDay=total.full_day,
                withinTargets=total.within_targets,
            )
        )
    return Evaluation(candidate=canonical, days=tuple(days), warnings=tuple(warnings))
