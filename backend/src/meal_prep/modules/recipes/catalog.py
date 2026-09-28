import json
from decimal import ROUND_HALF_UP, Decimal, localcontext
from importlib.resources import files

from .contracts import Recipe


def load_catalog() -> dict[str, Recipe]:
    data = json.loads(
        files(__package__).joinpath("recipes-v1.json").read_text(), parse_float=Decimal
    )
    if data["version"] != "recipes-v1":
        raise ValueError("unsupported catalog source version")
    recipes = [Recipe.model_validate(value) for value in data["recipes"]]
    if len({recipe.id for recipe in recipes}) != len(recipes):
        raise ValueError("duplicate recipe id")
    return {recipe.id: recipe for recipe in recipes}


def validate_portion(
    quantity: Decimal,
    minimum: Decimal,
    maximum: Decimal,
    increment: Decimal,
    discrete_items: tuple[tuple[Decimal, Decimal], ...] = (),
    basis_quantity: Decimal = Decimal(1),
) -> None:
    if any(
        not value.is_finite() or value <= 0
        for value in (quantity, minimum, maximum, increment, basis_quantity)
    ):
        raise ValueError("portion bounds must be finite and positive")
    with localcontext() as context:
        context.prec = 32
        context.rounding = ROUND_HALF_UP
        if not minimum <= quantity <= maximum or (quantity - minimum) % increment:
            raise ValueError("unsupported portion increment")
        for amount, item_increment in discrete_items:
            if (
                not amount.is_finite()
                or not item_increment.is_finite()
                or amount <= 0
                or item_increment <= 0
            ):
                raise ValueError("invalid ingredient increment")
            if quantity * amount % (basis_quantity * item_increment):
                raise ValueError("unsupported ingredient increment")
