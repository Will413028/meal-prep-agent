from decimal import Decimal as D

import pytest

from meal_prep.modules.recipes.catalog import validate_portion


@pytest.mark.parametrize("quantity", ["0", "-1", "0.6", "2.25", "NaN", "Infinity"])
def test_portion_must_fit_finite_supported_increments(quantity):
    with pytest.raises(ValueError):
        validate_portion(D(quantity), D("0.5"), D(2), D("0.25"))


def test_scaled_whole_items_must_still_be_operable():
    with pytest.raises(ValueError, match="ingredient increment"):
        validate_portion(D("0.75"), D("0.5"), D(2), D("0.25"), ((D(2), D(1)),))
    validate_portion(D("0.5"), D("0.5"), D(2), D("0.25"), ((D(2), D(1)),))
    validate_portion(D("1.25"), D("0.5"), D(2), D("0.25"))
