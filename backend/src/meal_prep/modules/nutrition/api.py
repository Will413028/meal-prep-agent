from fastapi import APIRouter, HTTPException

from meal_prep.platform.decimal_json import DecimalJSONRoute

from .application import validate_goal
from .contracts import GoalRequest, GoalResult
from .domain import EnergyConflict

router = APIRouter(prefix="/api/v1/goals", tags=["goals"], route_class=DecimalJSONRoute)


@router.post("/validate", response_model=GoalResult)
def validate(request: GoalRequest) -> GoalResult:
    try:
        return validate_goal(request)
    except EnergyConflict as exc:
        raise HTTPException(
            status_code=422,
            detail=[
                {
                    "loc": ["body", "kcal"],
                    "type": "goal_energy_conflict",
                    "msg": str(exc),
                }
            ],
        ) from exc
