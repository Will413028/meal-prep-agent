from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, localcontext

LIMITS = {
    "kcal": (1200, 5000),
    "protein": (30, 250),
    "carbs": (0, 800),
    "fat": (0, 250),
}
TOLERANCE = {
    "kcal": ("0.95", "1.05"),
    "protein": ("1", "1.1"),
    "carbs": ("0.9", "1.1"),
    "fat": ("0.9", "1.1"),
}


@dataclass(frozen=True)
class TargetRange:
    minimum: Decimal
    maximum: Decimal


class EnergyConflict(ValueError):
    pass


def expand_target(value: Decimal, nutrient: str) -> TargetRange:
    minimum, maximum = LIMITS[nutrient]
    lower, upper = TOLERANCE[nutrient]
    with localcontext() as context:
        context.prec = 32
        context.rounding = ROUND_HALF_UP
        return TargetRange(
            max(Decimal(minimum), value * Decimal(lower)),
            min(Decimal(maximum), value * Decimal(upper)),
        )


def validate_energy(
    kcal: TargetRange,
    macros: tuple[TargetRange | None, TargetRange | None, TargetRange | None],
) -> None:
    with localcontext() as context:
        context.prec = 32
        context.rounding = ROUND_HALF_UP
        minimum = sum(
            (
                value.minimum * factor
                for value, factor in zip(macros, (4, 4, 9))
                if value is not None
            ),
            Decimal(0),
        )
        maximum = sum(
            (
                value.maximum * factor
                for value, factor in zip(macros, (4, 4, 9))
                if value is not None
            ),
            Decimal(0),
        )
        if minimum > kcal.maximum or (
            all(value is not None for value in macros) and maximum < kcal.minimum
        ):
            raise EnergyConflict(
                "Requested nutrient targets do not intersect the energy target"
            )
