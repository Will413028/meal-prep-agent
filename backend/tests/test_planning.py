from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

import pytest

from meal_prep.modules.nutrition.application import validate_goal
from meal_prep.modules.nutrition.contracts import GoalRequest
from meal_prep.modules.planning.application import evaluate, validate_proposal
from meal_prep.modules.planning.contracts import (
    ConfirmedGoal,
    MealKey,
    PlanCandidate,
    PlannedMeal,
    PlanningConstraints,
    ProposalContext,
    ValidateProposalRequest,
)


def goal():
    validated = validate_goal(GoalRequest(schemaVersion=1, kcal=2000, protein=100))
    return ConfirmedGoal(
        **validated.model_dump(),
        intent="maintain",
        source="manual",
        references=(),
        confirmedAt=datetime(2026, 10, 1, tzinfo=timezone.utc),
    )


def candidate(meals=()):
    return PlanCandidate(
        goal=goal(),
        constraints=PlanningConstraints(
            startDate="2026-10-01",
            slots=("breakfast", "lunch", "dinner"),
            equipment=("rice_cooker",),
        ),
        meals=meals,
    )


def chicken(day="2026-10-01", **kwargs):
    return PlannedMeal(
        day=day,
        slot="lunch",
        kind="recipe",
        recipeId="chicken-rice",
        quantity=1,
        **kwargs,
    )


def test_evaluation_hydrates_canonical_sources_and_keeps_three_dates():
    result = evaluate(candidate((chicken(),)))
    assert len(result.days) == 3
    assert result.days[0].day == date(2026, 10, 1)
    assert result.days[0].nutrients["kcal"].known == 700
    assert result.days[0].withinTargets is None
    assert result.candidate.meals[0].recipeSnapshot is not None
    assert result.candidate.meals[0].recipeSnapshot.nutrients["protein"].amount == 45


@pytest.mark.parametrize(
    "patch",
    [
        {"equipment": ()},
        {"excludedFoods": ("chicken",)},
        {"dietaryTags": ("vegan",)},
        {"timeIsHard": True, "timeLimitMinutes": 10},
    ],
)
def test_hard_constraints_reject_existing_recipe(patch):
    plan = candidate((chicken(),))
    plan.constraints = plan.constraints.model_copy(update=patch)
    with pytest.raises(ValueError, match="hard constraint"):
        evaluate(plan)


def test_outside_dates_and_duplicate_slots_are_rejected():
    with pytest.raises(ValueError):
        evaluate(candidate((chicken(day="2026-10-04"),)))
    with pytest.raises(ValueError):
        evaluate(candidate((chicken(), chicken())))


def test_soft_time_limit_keeps_meal_but_reports_the_compromise():
    plan = candidate((chicken(),))
    plan.constraints.timeLimitMinutes = 10
    result = evaluate(plan)
    assert result.candidate.meals[0].recipeId == "chicken-rice"
    assert "soft_time_exceeded:2026-10-01:lunch" in result.warnings


def context():
    return ProposalContext(
        planId=UUID(int=1),
        baseRevision=1,
        sessionGeneration=UUID(int=2),
        runId=UUID(int=3),
        scope=(MealKey(day="2026-10-02", slot="lunch"),),
    )


def test_only_second_day_chicken_changes_and_base_stays_untouched():
    base = evaluate(
        candidate((chicken(), chicken(day="2026-10-02"), chicken(day="2026-10-03")))
    ).candidate
    before = base.model_dump_json()
    changed = base.model_copy(deep=True)
    changed.meals[1].recipeId = "tofu-rice"
    changed.meals[1].recipeSnapshot = None
    proposal = validate_proposal(
        ValidateProposalRequest(
            context=context(), base=evaluate(base), candidate=changed
        )
    )
    assert len(proposal.diff) == 1
    assert proposal.diff[0].key == MealKey(day="2026-10-02", slot="lunch")
    assert proposal.evaluation.candidate.meals[0] == base.meals[0]
    assert proposal.evaluation.candidate.meals[2] == base.meals[2]
    assert base.model_dump_json() == before


def test_scope_and_lock_include_portion_and_reject_unauthorized_changes():
    base = evaluate(
        candidate((chicken(), chicken(day="2026-10-02", locked=True)))
    ).candidate
    for index, message in [(0, "scope"), (1, "locked")]:
        changed = base.model_copy(deep=True)
        changed.meals[index].quantity = Decimal(2)
        with pytest.raises(ValueError, match=message):
            validate_proposal(
                ValidateProposalRequest(
                    context=context(), base=evaluate(base), candidate=changed
                )
            )


def test_tampered_controlled_source_is_rejected():
    base = evaluate(candidate((chicken(day="2026-10-02"),))).candidate
    changed = base.model_copy(deep=True)
    changed.meals[0].recipeSnapshot.nutrients["kcal"].amount = 1
    with pytest.raises(ValueError, match="source snapshot"):
        validate_proposal(
            ValidateProposalRequest(
                context=context(), base=evaluate(base), candidate=changed
            )
        )


def test_known_full_day_energy_conflict_is_not_hidden_by_unknown_protein():
    from test_planning_search import request

    req = request()
    external = PlannedMeal.model_validate(
        {
            "day": "2026-10-01",
            "slot": "breakfast",
            "kind": "external",
            "quantity": 1,
            "external": {
                "name": "合成外食",
                "basisQuantity": 1,
                "basisUnit": "serving",
                "nutrients": {
                    name: {
                        "amount": 3000 if name == "kcal" else None,
                        "source": "user",
                        "version": "user-v1",
                    }
                    for name in ("kcal", "protein", "carbs", "fat")
                },
            },
        }
    )
    dinner = chicken().model_copy(update={"slot": "dinner"})
    plan = candidate((external, chicken(), dinner))
    assert evaluate(plan).days[0].withinTargets is None
    with pytest.raises(ValueError, match="nutrition outside target"):
        validate_proposal(
            ValidateProposalRequest(context=req.context, base=None, candidate=plan)
        )
