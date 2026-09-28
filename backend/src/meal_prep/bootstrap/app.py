from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from meal_prep.modules.nutrition.api import router as goals_router
from meal_prep.modules.planning.agents.api import router as agent_router
from meal_prep.modules.planning.api import router as planning_router
from meal_prep.modules.recipes.api import router as recipes_router
from meal_prep.platform.request_limits import RequestSizeLimit


def create_app(*, include_agent: bool = True) -> FastAPI:
    app = FastAPI(title="Meal Prep API")
    app.add_middleware(RequestSizeLimit)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {
                        "loc": list(error["loc"]),
                        "type": error["type"],
                        "msg": error["msg"],
                    }
                    for error in exc.errors()
                ]
            },
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(goals_router)
    app.include_router(planning_router)
    app.include_router(recipes_router)
    if include_agent:
        app.include_router(agent_router)
    return app
