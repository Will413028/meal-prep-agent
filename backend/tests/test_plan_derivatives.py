from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from test_planning import candidate, chicken, context
from test_shopping import stock

from meal_prep.bootstrap.app import create_app
from meal_prep.modules.planning.application import evaluate, validate_proposal
from meal_prep.modules.planning.contracts import (
    BuildProposalRequest,
    PlannedMeal,
    ValidateProposalRequest,
)
from meal_prep.modules.planning.search import build_proposal


def base_state():
    plan = candidate((chicken(), chicken(day="2026-10-02"), chicken(day="2026-10-03")))
    plan.constraints.slots = ("lunch",)
    plan.pantry = (stock(200),)
    state = evaluate(plan)
    for item in state.shopping.items:
        item.checked = True
    for step in state.prep.steps:
        step.checked = True
    return state


def test_portion_proposal_recomputes_all_derivatives_and_preserves_only_unaffected_checks():
    base = base_state()
    old = base.model_dump_json()
    changed = base.candidate.model_copy(deep=True)
    changed.meals[1].quantity = Decimal("1.5")
    proposal = validate_proposal(
        ValidateProposalRequest(context=context(), base=base, candidate=changed)
    )
    rice = next(
        item for item in proposal.evaluation.shopping.items if item.foodId == "rice"
    )
    assert (rice.required, rice.pantryUsed, rice.toBuy) == (350, 200, 150)
    assert not rice.checked and rice.requiresReconfirmation
    destinations = {
        item.id: item.day.day for item in proposal.evaluation.prep.destinations
    }
    for step in proposal.evaluation.prep.steps:
        assert step.checked is (destinations[step.destinationId] != 2)
    assert proposal.shoppingDiff and proposal.prepDiff
    assert base.model_dump_json() == old


def test_search_preserves_existing_pantry_when_no_pantry_change_was_requested():
    base = base_state()
    req = BuildProposalRequest(
        context=context(),
        base=base,
        goal=base.candidate.goal,
        constraints=base.candidate.constraints,
        replacements={"2026-10-02:lunch": "tofu-rice"},
    )
    result = build_proposal(req)
    assert result.status == "ready", result.reason
    assert result.proposal.evaluation.candidate.pantry == base.candidate.pantry


def test_external_meal_never_creates_groceries_or_cooking_steps():
    external = PlannedMeal.model_validate(
        {
            "day": "2026-10-01",
            "slot": "lunch",
            "kind": "external",
            "quantity": 1,
            "external": {
                "name": "合成外食",
                "basisQuantity": 1,
                "basisUnit": "serving",
                "nutrients": {
                    key: {
                        "amount": 600 if key == "kcal" else None,
                        "source": "user",
                        "version": "user-v1",
                    }
                    for key in ("kcal", "protein", "carbs", "fat")
                },
            },
        }
    )
    result = evaluate(candidate((external,)))
    assert result.shopping.items == ()
    assert result.prep.steps == () and result.prep.destinations == ()
    assert result.days[0].nutrients["kcal"].known == 600


@pytest.mark.parametrize("increase", [False, True])
def test_evaluate_http_preserves_checks_and_only_invalidates_affected_content(increase):
    base = base_state()
    changed = base.candidate.model_copy(deep=True)
    if increase:
        changed.meals[1].quantity = Decimal("1.5")
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/plans/evaluate",
            json={
                "candidate": changed.model_dump(mode="json"),
                "base": base.model_dump(mode="json"),
            },
        )
    assert response.status_code == 200, response.text
    result = response.json()
    rice = next(
        item for item in result["shopping"]["items"] if item["foodId"] == "rice"
    )
    assert rice["checked"] is (not increase)
    assert rice["requiresReconfirmation"] is increase
    day_by_id = {item["id"]: item["day"] for item in result["prep"]["destinations"]}
    for step in result["prep"]["steps"]:
        assert step["checked"] is (
            not increase or day_by_id[step["destinationId"]] != "2026-10-02"
        )
