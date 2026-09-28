from dataclasses import replace
from datetime import date
from decimal import Decimal as D

import pytest

from meal_prep.modules.nutrition.domain import TargetRange
from meal_prep.modules.nutrition.totals import (
    NUTRIENTS,
    MealNutrition,
    NutrientValue,
    calculate_day,
)

DAY = date(2026, 10, 1)
NEXT = date(2026, 10, 2)
TARGETS = {
    "kcal": TargetRange(D(1900), D(2100)),
    "protein": TargetRange(D(100), D(110)),
}


def meal(
    day=DAY,
    slot="lunch",
    kcal="700",
    protein="35",
    quantity="1",
    source="synthetic",
    version="recipes-v1",
):
    values = [kcal, protein, "80", "20"]
    return MealNutrition(
        day,
        slot,
        {
            name: NutrientValue(
                D(value) if value is not None else None, source, version
            )
            for name, value in zip(NUTRIENTS, values)
        },
        D(quantity),
        D(1),
        "same-recipe",
    )


def test_same_recipe_on_each_day_uses_that_days_quantity():
    meals = (meal(quantity="1.5"), meal(day=NEXT, quantity="2"))
    assert calculate_day(DAY, meals, TARGETS).nutrients["kcal"].known == D(1050)
    assert calculate_day(NEXT, meals, TARGETS).nutrients["kcal"].known == D(1400)


def test_unknown_external_protein_keeps_known_subtotal_but_not_complete():
    meals = (
        meal(
            slot="breakfast", kcal="600", protein=None, source="user", version="user-v1"
        ),
        meal(protein="50"),
        meal(slot="dinner", protein="50"),
    )
    total = calculate_day(DAY, meals, TARGETS)
    assert total.full_day is True
    assert total.nutrients["kcal"].known == D(2000)
    assert total.nutrients["protein"].known == D(100)
    assert total.nutrients["protein"].complete is False
    assert total.nutrients["protein"].missing == ("breakfast",)
    assert total.within_targets is None


def test_partial_coverage_never_claims_all_day_success():
    total = calculate_day(
        DAY,
        (
            meal(kcal="1000", protein="50"),
            meal(slot="dinner", kcal="1000", protein="50"),
        ),
        TARGETS,
    )
    assert total.nutrients["kcal"].within_target is None
    assert total.coverage == ("lunch", "dinner")
    assert total.full_day is False
    assert total.within_targets is None


@pytest.mark.parametrize(
    "kcal,protein,expected",
    [("2100.1", "100", False), ("2100", "99.9", False), ("2100", "100", True)],
)
def test_comparison_uses_unrounded_values(kcal, protein, expected):
    meals = (
        meal(slot="breakfast", kcal=kcal, protein=protein),
        meal(kcal="0", protein="0"),
        meal(slot="dinner", kcal="0", protein="0"),
    )
    assert calculate_day(DAY, meals, TARGETS).within_targets is expected


def test_unknown_source_version_cannot_start_a_new_calculation():
    with pytest.raises(ValueError, match="source version"):
        calculate_day(DAY, (meal(version="unknown"),), TARGETS)


def test_per_100g_basis_is_scaled_without_guessing_density():
    weighed = replace(
        meal(kcal="120", protein="9", quantity="150"), basis_quantity=D(100)
    )
    total = calculate_day(DAY, (weighed,), TARGETS)
    assert total.nutrients["kcal"].known == D(180)
    assert total.nutrients["protein"].known == D("13.5")


def test_unknown_untargeted_nutrient_does_not_block_known_goals():
    breakfast = meal(slot="breakfast", kcal="600", protein="30")
    breakfast.nutrients["fat"] = NutrientValue(None, "user", "user-v1")
    meals = (breakfast, meal(), meal(slot="dinner"))
    total = calculate_day(DAY, meals, TARGETS)
    assert total.within_targets is True
    assert total.nutrients["fat"].complete is False
    assert total.nutrients["fat"].within_target is None
    assert (
        calculate_day(
            DAY, meals, {**TARGETS, "fat": TargetRange(D(0), D(100))}
        ).within_targets
        is None
    )


def test_external_meal_is_counted_only_on_its_assigned_date_and_slot():
    external = meal(
        day=NEXT,
        slot="dinner",
        kcal="500",
        protein=None,
        quantity="2",
        source="user",
        version="user-v1",
    )
    assert calculate_day(DAY, (external,), TARGETS).coverage == ()
    assigned = calculate_day(NEXT, (external,), TARGETS)
    assert assigned.coverage == ("dinner",)
    assert assigned.nutrients["kcal"].known == D(1000)
    assert assigned.nutrients["protein"].known == D(0)
    assert assigned.nutrients["protein"].complete is False
