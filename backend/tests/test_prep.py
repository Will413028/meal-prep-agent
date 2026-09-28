from datetime import date
from decimal import Decimal

import pytest

from meal_prep.modules.prep.application import prep_plan
from meal_prep.modules.recipes.application import RecipePortion
from meal_prep.modules.recipes.catalog import load_catalog


def portion(day=1, quantity="1"):
    return RecipePortion(
        load_catalog()["chicken-rice"], date(2026, 10, day), "lunch", Decimal(quantity)
    )


def test_steps_obey_dependencies_and_shared_equipment_with_exact_destinations():
    result = prep_plan((portion(), portion(2, "1.5")), ("rice_cooker",))
    assert len(result.steps) == 4
    steps = {step.id: step for step in result.steps}
    for step in result.steps:
        assert all(steps[key].endMinute <= step.startMinute for key in step.dependsOn)
    cooks = sorted(
        (step for step in result.steps if step.equipment == "rice_cooker"),
        key=lambda step: step.startMinute,
    )
    assert len(cooks) == 2
    assert cooks[0].endMinute <= cooks[1].startMinute
    assert [(item.day.day, item.quantity) for item in result.destinations] == [
        (1, 1),
        (2, Decimal("1.5")),
    ]
    assert {step.destinationId for step in result.steps} == {
        item.id for item in result.destinations
    }
    assert all(
        item.storage is None and item.reheating is None for item in result.destinations
    )
    assert result.totalMinutes == max(step.endMinute for step in result.steps)


def test_missing_equipment_cannot_create_a_prep_schedule():
    with pytest.raises(ValueError, match="equipment"):
        prep_plan((portion(),), ())


def test_portion_changes_invalidate_only_affected_prep_checks():
    old = prep_plan((portion(), portion(2)), ("rice_cooker",))
    for step in old.steps:
        step.checked = True
    changed = prep_plan((portion(1, "1.5"), portion(2)), ("rice_cooker",), old.steps)
    day_by_id = {item.id: item.day.day for item in changed.destinations}
    assert all(
        step.checked for step in changed.steps if day_by_id[step.destinationId] == 2
    )
    assert not any(
        step.checked for step in changed.steps if day_by_id[step.destinationId] == 1
    )
    assert all(step.checked for step in old.steps)
