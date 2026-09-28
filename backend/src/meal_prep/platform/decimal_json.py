"""Keep JSON number precision until nutrition validation has run."""

import json
from collections.abc import Callable, Coroutine
from decimal import Decimal
from typing import Any

from fastapi import Request, Response
from fastapi.routing import APIRoute


class DecimalRequest(Request):
    async def json(self) -> Any:
        return json.loads(
            await self.body(), parse_float=Decimal, parse_constant=Decimal
        )


class DecimalJSONRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def handle(request: Request) -> Response:
            return await handler(DecimalRequest(request.scope, request.receive))

        return handle
