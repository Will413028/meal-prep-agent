from fastapi import APIRouter

from .catalog import load_catalog
from .contracts import Recipe

router = APIRouter(prefix="/api/v1", tags=["recipes"])


@router.get("/recipes", response_model=tuple[Recipe, ...])
def recipes() -> tuple[Recipe, ...]:
    return tuple(load_catalog().values())
