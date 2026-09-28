from decimal import Decimal
from math import isfinite
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    ValidationInfo,
    WithJsonSchema,
    field_validator,
    model_validator,
)

from .domain import LIMITS


def decimal_number(value: object) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ValueError("must be a JSON number")
    result = Decimal(str(value))
    if not result.is_finite():
        raise ValueError("must be finite")
    wire = float(result)
    if not isfinite(wire) or (result != 0 and wire == 0):
        raise ValueError("number cannot be represented by the JSON client")
    return result


JsonDecimal = Annotated[
    Decimal,
    BeforeValidator(decimal_number),
    PlainSerializer(float, return_type=float, when_used="json"),
    WithJsonSchema({"type": "number"}),
]
InputNumber = Annotated[JsonDecimal, Field(decimal_places=1)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("schemaVersion", mode="before", check_fields=False)
    @classmethod
    def strict_schema_version(cls, value: object) -> object:
        if type(value) is not int:
            raise ValueError("schemaVersion must be an integer")
        return value


class Range(Contract):
    min: JsonDecimal
    max: JsonDecimal


class InputRange(Contract):
    min: InputNumber
    max: InputNumber

    @model_validator(mode="after")
    def ordered(self) -> "InputRange":
        if self.min > self.max:
            raise ValueError("min must not exceed max")
        return self


TargetInput = InputNumber | InputRange


class GoalValues(Contract):
    kcal: TargetInput = Field(description="Daily energy in kcal")
    protein: TargetInput = Field(description="Daily protein in grams")
    carbs: TargetInput | None = Field(
        default=None, description="Daily carbohydrates in grams"
    )
    fat: TargetInput | None = Field(default=None, description="Daily fat in grams")

    @field_validator("kcal", "protein", "carbs", "fat")
    @classmethod
    def supported(
        cls, value: Decimal | InputRange | None, info: ValidationInfo
    ) -> Decimal | InputRange | None:
        if value is None:
            return value
        minimum, maximum = LIMITS[str(info.field_name)]
        endpoints = (
            (value.min, value.max) if isinstance(value, InputRange) else (value,)
        )
        if any(not minimum <= point <= maximum for point in endpoints):
            raise ValueError("outside supported product range")
        return value


class GoalRequest(GoalValues):
    schemaVersion: Literal[1]


class GoalRanges(Contract):
    kcal: Range
    protein: Range
    carbs: Range | None
    fat: Range | None


class GoalResult(Contract):
    model_config = ConfigDict(
        extra="forbid", json_schema_serialization_defaults_required=True
    )

    schemaVersion: Literal[1] = 1
    policyVersion: Literal["nutrition-v1"] = "nutrition-v1"
    requested: GoalValues
    ranges: GoalRanges
