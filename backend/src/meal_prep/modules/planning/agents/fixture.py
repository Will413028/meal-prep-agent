"""Explicit synthetic demonstration model; never selected as an error fallback."""

from collections.abc import AsyncIterator
from typing import Any

from pydantic_ai.messages import ToolReturnPart
from pydantic_ai.models.function import DeltaToolCall, FunctionModel


def fixture_model() -> FunctionModel:
    async def stream(messages: Any, _info: Any) -> AsyncIterator[Any]:
        returned = {
            part.tool_name
            for part in messages[-1].parts
            if isinstance(part, ToolReturnPart)
        }
        if "build_proposal" in returned:
            yield "合成展示：已執行固定工具流程，尚未採用；本模式不理解自由文字，請用表單調整條件。"
        else:
            tool = "build_proposal" if "find_recipes" in returned else "find_recipes"
            yield {
                0: DeltaToolCall(
                    name=tool, json_args="{}", tool_call_id=f"fixture-{tool}"
                )
            }

    return FunctionModel(stream_function=stream)
