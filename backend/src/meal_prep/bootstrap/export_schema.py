"""Generate the API contract; --check never rewrites checked-in artifacts."""

import argparse
import json
from pathlib import Path

from meal_prep.platform.worker_contracts import router as worker_contracts

from .app import create_app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    app = create_app()
    app.include_router(worker_contracts)
    content = (
        json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    if args.check:
        if not args.output.exists() or args.output.read_text() != content:
            raise SystemExit("OpenAPI drift: regenerate contracts before committing")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content)


if __name__ == "__main__":
    main()
