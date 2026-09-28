from uuid import NAMESPACE_URL, uuid5

from meal_prep.modules.recipes.application import RecipePortion, validate_recipe_portion

from .contracts import PortionDestination, PrepPlan, PrepStep


def prep_plan(
    portions: tuple[RecipePortion, ...],
    equipment: tuple[str, ...],
    previous: tuple[PrepStep, ...] = (),
) -> PrepPlan:
    destinations = []
    steps = []
    resources: dict[str | None, int] = {}
    seen = set()
    old_steps = {step.id: step for step in previous}
    slot_order = {"breakfast": 0, "lunch": 1, "dinner": 2, "snack": 3}
    for portion in sorted(
        portions, key=lambda value: (value.day, slot_order[value.slot])
    ):
        recipe = portion.recipe
        key = (portion.day, portion.slot)
        if key in seen:
            raise ValueError("duplicate prep destination")
        seen.add(key)
        if not set(recipe.equipment) <= set(equipment):
            raise ValueError("prep requires unavailable equipment")
        validate_recipe_portion(recipe, portion.slot, portion.quantity)
        destination_id = uuid5(
            NAMESPACE_URL,
            "meal-prep:portion:"
            + ":".join(
                (
                    str(portion.day),
                    portion.slot,
                    str(portion.quantity.normalize()),
                    recipe.model_dump_json(),
                )
            ),
        )
        destinations.append(
            PortionDestination(
                id=destination_id,
                day=portion.day,
                slot=portion.slot,
                recipeId=recipe.id,
                quantity=portion.quantity,
                unit=recipe.basisUnit,
                storage=recipe.storage,
                reheating=recipe.reheating,
            )
        )
        preceding: dict[str, PrepStep] = {}
        for step in recipe.steps:
            start = max(
                resources.get(step.equipment, 0),
                max((preceding[key].endMinute for key in step.dependsOn), default=0),
            )
            step_id = uuid5(destination_id, step.id)
            result = PrepStep(
                id=step_id,
                destinationId=destination_id,
                recipeStepId=step.id,
                description=step.description,
                equipment=step.equipment,
                dependsOn=tuple(preceding[key].id for key in step.dependsOn),
                startMinute=start,
                endMinute=start + step.minutes,
                checked=bool(step_id in old_steps and old_steps[step_id].checked),
            )
            preceding[step.id] = result
            resources[step.equipment] = result.endMinute
            steps.append(result)
    return PrepPlan(
        destinations=tuple(destinations),
        steps=tuple(sorted(steps, key=lambda step: step.startMinute)),
        totalMinutes=max((step.endMinute for step in steps), default=0),
    )
