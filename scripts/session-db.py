#!/usr/bin/env python3
"""Import, audit and back up the Oracle session database without printing rows."""

import argparse
import hashlib
import json
import os
import sqlite3
from pathlib import Path
from urllib.parse import quote

COLUMNS = (
    "tokenHash",
    "sessionGeneration",
    "planId",
    "revision",
    "schemaVersion",
    "currentJson",
    "previousJson",
    "updatedAt",
    "expiresAt",
    "lastOperationId",
    "lastOperationHash",
)
SCHEMA = (
    Path(__file__).resolve().parents[1] / "deploy/migrations/0001_plan_sessions.sql"
)


def read_only(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{quote(str(path.resolve()))}?mode=ro", uri=True)


def audit(db: sqlite3.Connection) -> dict[str, object]:
    integrity = db.execute("PRAGMA quick_check").fetchone()
    if integrity != ("ok",):
        raise ValueError("SQLite integrity check failed")
    columns = tuple(row[1] for row in db.execute("PRAGMA table_info(plan_sessions)"))
    if columns != COLUMNS:
        raise ValueError("Session table layout differs from the public migration")
    digest = hashlib.sha256()
    versions: dict[str, int] = {}
    total = adopted = 0
    revisions: list[int] = []
    latest_updated_at = 0
    for row in db.execute(
        f"SELECT {','.join(COLUMNS)} FROM plan_sessions ORDER BY tokenHash"
    ):
        raw = json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        digest.update(len(raw).to_bytes(8, "big"))
        digest.update(raw)
        total += 1
        adopted += row[5] is not None
        revisions.append(row[3])
        latest_updated_at = max(latest_updated_at, row[7])
        version = str(row[4])
        versions[version] = versions.get(version, 0) + 1
    return {
        "rows": total,
        "adopted": adopted,
        "minRevision": min(revisions, default=None),
        "maxRevision": max(revisions, default=None),
        "latestUpdatedAt": latest_updated_at if total else None,
        "schemaVersions": versions,
        "sha256": digest.hexdigest(),
    }


def create_private(path: Path) -> None:
    if not path.parent.is_dir():
        raise ValueError("Destination parent directory does not exist")
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)


def import_sql(source: Path, destination: Path) -> dict[str, object]:
    if not source.is_file():
        raise ValueError("D1 export is missing")
    create_private(destination)
    try:
        db = sqlite3.connect(destination)
        try:
            db.executescript(source.read_text(encoding="utf-8"))
            result = audit(db)
            db.execute("PRAGMA user_version=1")
            db.commit()
        finally:
            db.close()
        return result
    except BaseException:
        destination.unlink(missing_ok=True)
        raise


def initialize_empty(destination: Path) -> dict[str, object]:
    """Explicitly create a new local development database; runtime never initializes."""
    create_private(destination)
    try:
        db = sqlite3.connect(destination)
        try:
            db.executescript(SCHEMA.read_text(encoding="utf-8"))
            db.execute("PRAGMA user_version=1")
            db.commit()
            return audit(db)
        finally:
            db.close()
    except BaseException:
        destination.unlink(missing_ok=True)
        raise


def reconcile_d1(source: Path, destination: Path) -> dict[str, object]:
    """Prepare a private full-row replacement for a paused D1 rollback."""
    db = read_only(source)
    try:
        db.execute("BEGIN")
        expected = audit(db)
        create_private(destination)
        try:
            with destination.open("w", encoding="utf-8") as output:
                # D1's import owns its transaction; explicit BEGIN/COMMIT is rejected.
                output.write("DELETE FROM plan_sessions;\n")
                for row in db.execute(
                    f"SELECT {','.join(COLUMNS)} FROM plan_sessions ORDER BY tokenHash"
                ):
                    values = ",".join(
                        db.execute("SELECT quote(?)", (value,)).fetchone()[0]
                        for value in row
                    )
                    output.write(
                        f"INSERT INTO plan_sessions ({','.join(COLUMNS)}) VALUES ({values});\n"
                    )
            return expected
        except BaseException:
            destination.unlink(missing_ok=True)
            raise
    finally:
        db.close()


def backup(source: Path, destination: Path) -> dict[str, object]:
    create_private(destination)
    try:
        original = read_only(source)
        copy = sqlite3.connect(destination)
        try:
            original.backup(copy)
            copy.commit()
            expected = audit(original)
            actual = audit(copy)
            if expected != actual:
                raise ValueError("Backup differs from the source")
        finally:
            copy.close()
            original.close()
        return actual
    except BaseException:
        destination.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name in ("init", "import", "audit", "backup", "reconcile-d1"):
        command = subparsers.add_parser(name)
        if name == "init":
            command.add_argument("destination", type=Path)
            continue
        command.add_argument("source", type=Path)
        if name != "audit":
            command.add_argument("destination", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    if args.command == "init":
        result = initialize_empty(args.destination)
    elif args.command == "import":
        result = import_sql(args.source, args.destination)
    elif args.command == "backup":
        result = backup(args.source, args.destination)
    elif args.command == "reconcile-d1":
        result = reconcile_d1(args.source, args.destination)
    else:
        with read_only(args.source) as db:
            result = audit(db)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
