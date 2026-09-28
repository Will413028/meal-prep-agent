import json
from decimal import ROUND_HALF_UP, Decimal, localcontext
from uuid import NAMESPACE_URL, uuid5

from meal_prep.modules.recipes.contracts import Ingredient

from .contracts import FoodIdentity, PantryItem, ShoppingItem, ShoppingList


def identity(item: Ingredient | FoodIdentity) -> tuple[str, str, str, str]:
    unit = {"kg": "g", "l": "ml"}.get(item.unit, item.unit)
    return item.foodId, item.specification, item.state, unit


def shopping_list(
    demands: tuple[Ingredient, ...],
    pantry: tuple[PantryItem, ...],
    previous: tuple[ShoppingItem, ...] = (),
) -> ShoppingList:
    with localcontext() as context:
        context.prec = 32
        context.rounding = ROUND_HALF_UP
        required: dict[tuple[str, str, str, str], Decimal] = {}
        descriptions = {}
        for demand in demands:
            key = identity(demand)
            required[key] = required.get(key, Decimal(0)) + demand.quantity
            descriptions[key] = demand
        stocks = {}
        warnings = []
        for item in pantry:
            key = identity(item)
            if key in stocks:
                raise ValueError("duplicate pantry identity")
            if not item.confirmed or item.quantity is None:
                stocks[key] = Decimal(0)
                warnings.append(
                    f"pantry_unconfirmed:{item.foodId}:{item.state}:{item.unit}"
                )
            else:
                stocks[key] = item.quantity * (1000 if item.unit in {"kg", "l"} else 1)
        items = []
        old_items = {identity(item): item for item in previous}
        for key, amount in sorted(required.items()):
            demand = descriptions[key]
            used = min(amount, stocks.get(key, Decimal(0)))
            old = old_items.get(key)
            increased = old is not None and (
                amount > old.required or amount - used > old.toBuy
            )
            items.append(
                ShoppingItem(
                    **demand.model_dump(exclude={"quantity", "increment"}),
                    id=uuid5(
                        NAMESPACE_URL,
                        "meal-prep:shopping:" + json.dumps(key, ensure_ascii=True),
                    ),
                    required=amount,
                    pantryUsed=used,
                    toBuy=amount - used,
                    checked=bool(old and old.checked and not increased),
                    requiresReconfirmation=bool(
                        old
                        and (
                            (old.checked and increased)
                            or (old.requiresReconfirmation and not old.checked)
                        )
                    ),
                )
            )
        return ShoppingList(items=tuple(items), warnings=tuple(warnings))
