"""Explicit live factories: fixed free-tier model, no synthetic or paid fallback."""

import os
import re

from fastapi import FastAPI
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from .app import create_app


def cloudflare_model() -> OpenAIChatModel:
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not re.fullmatch(r"[a-f0-9]{32}", account) or not token:
        raise RuntimeError(
            "Configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for live mode."
        )
    provider = OpenAIProvider(
        base_url=f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1",
        api_key=token,
    )
    return OpenAIChatModel(
        "@cf/zai-org/glm-4.7-flash",
        provider=provider,
        settings={"extra_body": {"chat_template_kwargs": {"enable_thinking": False}}},
    )


def create_live_app() -> FastAPI:
    app = create_app()
    app.state.planning_model = cloudflare_model()
    return app
