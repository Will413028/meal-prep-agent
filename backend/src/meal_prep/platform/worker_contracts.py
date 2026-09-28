"""Worker-owned public contracts, exported with the Python contract SSOT only."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import AwareDatetime, Field

from meal_prep.modules.nutrition.contracts import Contract, JsonDecimal
from meal_prep.modules.planning.contracts import (
    BuildPreferences,
    BuildProposalResult,
    Evaluation,
    MealKey,
    PlanCandidate,
    ProposalContext,
)


class SessionState(Contract):
    schemaVersion: Literal[1]
    sessionGeneration: UUID
    planId: UUID
    revision: int = Field(ge=0, le=9007199254740991, strict=True)
    expiresAt: AwareDatetime
    csrfToken: str = Field(pattern=r"^[a-f0-9]{64}$")
    current: Evaluation | None
    canUndo: bool
    lastOperationId: UUID | None


class AdoptAction(Contract):
    type: Literal["adopt"]
    candidate: PlanCandidate
    scope: tuple[MealKey, ...] = Field(min_length=1, max_length=12)
    runId: UUID


class PortionAction(MealKey):
    type: Literal["portion"]
    quantity: JsonDecimal = Field(gt=0, le=10000, decimal_places=3)


class LocksAction(MealKey):
    type: Literal["locks"]
    locked: bool = Field(strict=True)


class ChecksAction(Contract):
    type: Literal["checks"]
    collection: Literal["shopping", "prep"]
    id: UUID
    checked: bool = Field(strict=True)


class UndoAction(Contract):
    type: Literal["undo"]


Action = Annotated[
    AdoptAction | PortionAction | LocksAction | ChecksAction | UndoAction,
    Field(discriminator="type"),
]


class PlanActionRequest(Contract):
    schemaVersion: Literal[1]
    planId: UUID
    sessionGeneration: UUID
    baseRevision: int = Field(ge=0, le=9007199254740991, strict=True)
    operationId: UUID
    action: Action


class SessionInit(Contract):
    schemaVersion: Literal[1]


class PreviewRequest(BuildPreferences):
    schemaVersion: Literal[1]
    context: ProposalContext


class AgentMessage(Contract):
    id: str = Field(min_length=1, max_length=120)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AgentForwardedProps(Contract):
    planning: PreviewRequest
    mode: Literal["fixture", "live"] = "fixture"


class AgentRunRequest(Contract):
    protocolVersion: Literal["1.0"]
    threadId: UUID
    runId: UUID
    messages: tuple[AgentMessage, ...] = Field(min_length=1, max_length=8)
    state: dict[str, object] = Field(max_length=0)
    tools: tuple[object, ...] = Field(max_length=0)
    context: tuple[object, ...] = Field(max_length=0)
    forwardedProps: AgentForwardedProps


class ClearedSession(Contract):
    cleared: Literal[True]


router = APIRouter(tags=["worker-only"])


@router.post("/api/session", response_model=SessionState, status_code=201)
def session_create_contract(request: SessionInit) -> SessionState:
    raise NotImplementedError("contract-only; served by Worker")


@router.get("/api/plan", response_model=SessionState)
def plan_read_contract() -> SessionState:
    raise NotImplementedError("contract-only; served by Worker")


@router.post("/api/plan/actions", response_model=SessionState)
def plan_action_contract(request: PlanActionRequest) -> SessionState:
    raise NotImplementedError("contract-only; served by Worker")


@router.post("/api/plan/preview", response_model=BuildProposalResult)
def preview_contract(request: PreviewRequest) -> BuildProposalResult:
    raise NotImplementedError("contract-only; served by Worker")


@router.delete("/api/session", response_model=ClearedSession)
def session_clear_contract() -> ClearedSession:
    raise NotImplementedError("contract-only; served by Worker")


@router.post(
    "/api/agent",
    response_class=Response,
    responses={200: {"content": {"text/event-stream": {}}}},
)
def agent_contract(request: AgentRunRequest) -> Response:
    raise NotImplementedError("contract-only; served by Worker")
