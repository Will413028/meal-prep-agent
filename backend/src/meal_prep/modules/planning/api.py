from fastapi import APIRouter, HTTPException, Request

from meal_prep.platform.decimal_json import DecimalJSONRoute

from .application import evaluate, validate_proposal
from .contracts import (
    BuildProposalRequest,
    BuildProposalResult,
    CanonicalProposal,
    EvaluatePlanRequest,
    Evaluation,
    ValidateProposalRequest,
)
from .execution import CalculationBusy, calculate
from .search import SearchCancelled

router = APIRouter(prefix="/api/v1", tags=["planning"], route_class=DecimalJSONRoute)


@router.post("/plans/evaluate", response_model=Evaluation)
def evaluate_plan(request: EvaluatePlanRequest) -> Evaluation:
    try:
        base = evaluate(request.base.candidate, request.base) if request.base else None
        return evaluate(request.candidate, base)
    except ValueError as error:
        raise HTTPException(
            status_code=422, detail={"code": "invalid_plan", "message": str(error)}
        ) from error


@router.post("/proposals/validate", response_model=CanonicalProposal)
def validate(request: ValidateProposalRequest) -> CanonicalProposal:
    try:
        return validate_proposal(request)
    except ValueError as error:
        raise HTTPException(
            status_code=422, detail={"code": "invalid_proposal", "message": str(error)}
        ) from error


@router.post("/proposals/build", response_model=BuildProposalResult)
async def build(request: BuildProposalRequest, http: Request) -> BuildProposalResult:
    try:
        return await calculate(
            request, http.app.state.calculation_capacity, http.is_disconnected
        )
    except (CalculationBusy, SearchCancelled) as error:
        raise HTTPException(
            status_code=503, detail={"code": "calculation_unavailable"}
        ) from error
