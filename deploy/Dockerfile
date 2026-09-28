FROM ghcr.io/astral-sh/uv:0.7.2@sha256:3b898ca84fbe7628c5adcd836c1de78a0f1ded68344d019af8478d4358417399 AS uv
FROM python:3.13.13-slim-bookworm@sha256:355bfa66770995d7e9a0da4b3473b44d0cb451f6b56f5615ad9c39e3c4eca03f AS build
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/src ./src
ENV UV_PYTHON_DOWNLOADS=never
RUN uv sync --frozen --no-dev --no-editable --python /usr/local/bin/python

FROM python:3.13.13-slim-bookworm@sha256:355bfa66770995d7e9a0da4b3473b44d0cb451f6b56f5615ad9c39e3c4eca03f
COPY --from=build /app/backend/.venv /app/backend/.venv
ENV PATH="/app/backend/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYDANTIC_AI_NO_BANNER=1
USER 10001:10001
EXPOSE 14318
CMD ["uvicorn", "meal_prep.bootstrap.live:create_live_app", "--factory", "--host", "0.0.0.0", "--port", "14318", "--no-access-log"]
