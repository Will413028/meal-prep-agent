from datetime import timedelta

from test_planning import candidate, chicken, context

from meal_prep.modules.planning.application import evaluate
from meal_prep.modules.planning.contracts import (
    BuildProposalRequest,
    MealKey,
    PlannedMeal,
)
from meal_prep.modules.planning.search import build_proposal


def test_scoped_replacement_changes_only_second_day_and_never_overrides_locks():
    base = candidate((chicken(), chicken(day="2026-10-02"), chicken(day="2026-10-03")))
    base.constraints.slots = ("lunch",)
    base = evaluate(base).candidate
    before = base.model_dump_json()
    req = BuildProposalRequest(
        context=context(),
        base=base,
        goal=base.goal,
        constraints=base.constraints,
        replacements={"2026-10-02:lunch": "tofu-rice"},
    )
    result = build_proposal(req)
    assert result.status == "ready", result.reason
    assert len(result.proposal.diff) == 1
    assert result.proposal.diff[0].after.recipeId == "tofu-rice"
    assert base.model_dump_json() == before
    base.meals[1].locked = True
    assert build_proposal(req).reason == "locked_scope_conflict"


def test_fixed_external_defaults_to_locked_and_keeps_unknown_nutrition():
    req = request()
    fixed = PlannedMeal.model_validate(
        {
            "day": "2026-10-01",
            "slot": "breakfast",
            "kind": "external",
            "quantity": 1,
            "external": {
                "name": "合成外食早餐",
                "basisQuantity": 1,
                "basisUnit": "serving",
                "nutrients": {
                    key: {
                        "amount": 400 if key == "kcal" else None,
                        "source": "user",
                        "version": "user-v1",
                    }
                    for key in ("kcal", "protein", "carbs", "fat")
                },
            },
        }
    )
    assert fixed.locked is True
    req.fixedMeals = (fixed,)
    result = build_proposal(req)
    assert result.status == "ready", result.reason
    assert result.proposal.evaluation.candidate.meals[0] == fixed
    assert result.proposal.evaluation.days[0].withinTargets is None
    assert result.proposal.evaluation.warnings


def request():
    plan = candidate()
    ctx = context().model_copy(
        update={
            "baseRevision": 0,
            "scope": tuple(
                MealKey(day=plan.constraints.startDate + timedelta(days=i), slot=slot)
                for i in range(3)
                for slot in plan.constraints.slots
            ),
        }
    )
    return BuildProposalRequest(
        context=ctx, base=None, goal=plan.goal, constraints=plan.constraints
    )


def test_three_day_search_uses_controlled_recipes_and_meets_known_targets():
    result = build_proposal(request())
    assert result.status == "ready", result.reason
    assert len(result.proposal.evaluation.candidate.meals) == 9
    assert all(day.withinTargets is True for day in result.proposal.evaluation.days)
    assert all(
        set(meal.recipeSnapshot.equipment) <= {"rice_cooker"}
        for meal in result.proposal.evaluation.candidate.meals
    )


def test_budget_exhaustion_is_not_a_claim_of_global_impossibility():
    result = build_proposal(request().model_copy(update={"searchBudget": 1}))
    assert result.status == "not_found"
    assert result.reason == "search_budget_exhausted"
    assert result.examined == 1


def test_equipment_and_missing_controlled_substitute_have_distinct_reasons():
    req = request()
    req.constraints.equipment = ()
    assert build_proposal(req).reason == "equipment_unavailable"
    req = request()
    req.replacements = {"2026-10-02:lunch": "unknown-dish"}
    assert build_proposal(req).reason == "no_controlled_substitute"


def test_duplicate_base_or_fixed_meals_are_rejected_before_key_indexing():
    req = request()
    req.base = candidate((chicken(), chicken()))
    assert build_proposal(req).reason == "invalid_base"
    req = request()
    req.fixedMeals = (chicken(), chicken())
    assert build_proposal(req).reason == "duplicate_fixed_meal"


def test_explicit_replacement_cannot_be_silently_ignored_by_a_fixed_meal():
    req = request()
    req.fixedMeals = (chicken(locked=True),)
    req.replacements = {"2026-10-01:lunch": "tofu-rice"}
    assert build_proposal(req).reason == "locked_scope_conflict"
    req.fixedMeals = (chicken(),)
    assert build_proposal(req).reason == "fixed_meal_conflict"


def test_unlocked_external_allows_an_explicit_scoped_replacement():
    base = candidate(
        (
            PlannedMeal.model_validate(
                {
                    "day": "2026-10-02",
                    "slot": "lunch",
                    "kind": "external",
                    "quantity": 1,
                    "locked": False,
                    "external": {
                        "name": "合成外食",
                        "basisQuantity": 1,
                        "basisUnit": "serving",
                        "nutrients": {
                            key: {
                                "amount": None,
                                "source": "user",
                                "version": "user-v1",
                            }
                            for key in ("kcal", "protein", "carbs", "fat")
                        },
                    },
                }
            ),
        )
    )
    base.constraints.slots = ("lunch",)
    req = BuildProposalRequest(
        context=context(),
        base=base,
        goal=base.goal,
        constraints=base.constraints,
        replacements={"2026-10-02:lunch": "tofu-rice"},
    )
    result = build_proposal(req)
    assert result.status == "ready", result.reason
    assert len(result.proposal.diff) == 1
    assert result.proposal.diff[0].after.recipeId == "tofu-rice"
    assert base.meals[0].kind == "external"
