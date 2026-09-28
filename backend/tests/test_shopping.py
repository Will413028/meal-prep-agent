from decimal import Decimal

import pytest

from meal_prep.modules.recipes.contracts import Ingredient
from meal_prep.modules.shopping.application import shopping_list
from meal_prep.modules.shopping.contracts import PantryItem


def rice(quantity=100, **changes):
    return Ingredient.model_validate(
        {
            "foodId": "rice",
            "name": "白米",
            "quantity": quantity,
            "specification": "standard",
            "state": "raw",
            "unit": "g",
            "increment": 1,
            **changes,
        }
    )


def stock(quantity=50, **changes):
    return PantryItem.model_validate(
        {
            "foodId": "rice",
            "name": "白米",
            "quantity": quantity,
            "specification": "standard",
            "state": "raw",
            "unit": "g",
            "confirmed": True,
            **changes,
        }
    )


def test_demands_merge_before_one_stock_subtraction_and_deletion_never_goes_negative():
    result = shopping_list((rice(100), rice(150)), (stock(200),))
    assert len(result.items) == 1
    item = result.items[0]
    assert (item.required, item.pantryUsed, item.toBuy) == (250, 200, 50)
    smaller = shopping_list((rice(100),), (stock(200),))
    assert (smaller.items[0].pantryUsed, smaller.items[0].toBuy) == (100, 0)
    assert shopping_list((), (stock(200),)).items == ()


def test_states_specifications_and_incompatible_units_never_merge():
    result = shopping_list(
        (rice(), rice(state="cooked"), rice(specification="brown"), rice(unit="ml")),
        (stock(),),
    )
    assert len(result.items) == 4
    assert sorted(item.toBuy for item in result.items) == [50, 100, 100, 100]
    assert len({item.id for item in result.items}) == 4


def test_confirmed_compatible_stock_converts_but_unknown_or_unconfirmed_does_not():
    result = shopping_list((rice(250),), (stock(Decimal("0.2"), unit="kg"),))
    assert len(result.items) == 1
    assert result.items[0].toBuy == 50
    for inventory in (stock(None), stock(200, confirmed=False)):
        result = shopping_list((rice(250),), (inventory,))
        assert result.items[0].toBuy == 250
        assert result.warnings


def test_increased_need_resets_checked_item_and_preserves_unaffected_or_reduced_items():
    old = shopping_list((rice(100), rice(100, state="cooked")), ()).items
    for item in old:
        item.checked = True
    updated = shopping_list((rice(150), rice(100, state="cooked")), (), old).items
    raw = next(item for item in updated if item.state == "raw")
    cooked = next(item for item in updated if item.state == "cooked")
    assert cooked.checked is True
    assert raw.checked is False and raw.requiresReconfirmation is True
    recomputed = shopping_list(
        (rice(150), rice(100, state="cooked")), (), updated
    ).items
    assert next(
        item for item in recomputed if item.state == "raw"
    ).requiresReconfirmation
    reduced = shopping_list((rice(50),), (), old).items[0]
    assert reduced.checked is True and reduced.requiresReconfirmation is False
    assert old[0].checked and old[1].checked


def test_duplicate_stock_identity_is_rejected_even_when_units_are_compatible():
    with pytest.raises(ValueError, match="duplicate pantry"):
        shopping_list((rice(),), (stock(50), stock(Decimal("0.1"), unit="kg")))
