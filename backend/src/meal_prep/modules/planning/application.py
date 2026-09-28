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
from meal_prep.modules.prep.application import prep_plan
from meal_prep.modules.recipes.application import (
    RecipePortion,
    portion_ingredients,
    recipe_meal,
)
from meal_prep.modules.recipes.catalog import load_catalog
from meal_prep.modules.recipes.contracts import Recipe
from meal_prep.modules.shopping.application import shopping_list

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
    PrepDiff,
    ShoppingDiff,
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
    base_state = (
        evaluate(request.base.candidate, request.base) if request.base else None
    )
    evaluation = evaluate(request.candidate, base_state)
    base = base_state.candidate if base_state else None
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
        or base.pantry != evaluation.candidate.pantry
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
    old_shopping = (
        {item.id: item for item in base_state.shopping.items} if base_state else {}
    )
    new_shopping = {item.id: item for item in evaluation.shopping.items}
    old_prep = {item.id: item for item in base_state.prep.steps} if base_state else {}
    new_prep = {item.id: item for item in evaluation.prep.steps}
    return CanonicalProposal(
        **request.context.model_dump(),
        evaluation=evaluation,
        diff=tuple(diff),
        shoppingDiff=tuple(
            ShoppingDiff(
                id=key, before=old_shopping.get(key), after=new_shopping.get(key)
            )
            for key in sorted(old_shopping.keys() | new_shopping.keys())
            if old_shopping.get(key) != new_shopping.get(key)
        ),
        prepDiff=tuple(
            PrepDiff(id=key, before=old_prep.get(key), after=new_prep.get(key))
            for key in sorted(old_prep.keys() | new_prep.keys())
            if old_prep.get(key) != new_prep.get(key)
        ),
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


def evaluate(
    candidate: PlanCandidate, previous: Evaluation | None = None
) -> Evaluation:
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
    portions = tuple(
        RecipePortion(meal.recipeSnapshot, meal.day, meal.slot, meal.quantity)
        for meal in canonical.meals
        if meal.recipeSnapshot is not None
    )
    shopping = shopping_list(
        tuple(item for portion in portions for item in portion_ingredients(portion)),
        canonical.pantry,
        previous.shopping.items if previous else (),
    )
    prep = prep_plan(
        portions,
        canonical.constraints.equipment,
        previous.prep.steps if previous else (),
    )
    return Evaluation(
        candidate=canonical,
        days=tuple(days),
        warnings=tuple(warnings),
        shopping=shopping,
        prep=prep,
    )
