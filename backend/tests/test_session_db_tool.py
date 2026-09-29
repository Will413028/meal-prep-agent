import importlib.util
import sqlite3
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "session_db", ROOT / "scripts/session-db.py"
)
assert spec and spec.loader
session_db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(session_db)


def test_explicit_initialization_creates_only_an_empty_verified_database(
    tmp_path: Path,
) -> None:
    destination = tmp_path / "new.sqlite3"
    assert session_db.initialize_empty(destination)["rows"] == 0
    with session_db.read_only(destination) as db:
        assert db.execute("PRAGMA user_version").fetchone() == (1,)
        assert session_db.audit(db)["rows"] == 0
    with pytest.raises(FileExistsError):
        session_db.initialize_empty(destination)


def test_audit_rejects_unknown_layout(tmp_path: Path) -> None:
    destination = tmp_path / "wrong.sqlite3"
    with sqlite3.connect(destination) as db:
        db.execute("CREATE TABLE other (id INTEGER)")
        db.execute("PRAGMA user_version=1")
    with session_db.read_only(destination) as db:
        with pytest.raises(ValueError, match="layout"):
            session_db.audit(db)


def test_audit_rejects_unsupported_database_version(tmp_path: Path) -> None:
    destination = tmp_path / "unsupported.sqlite3"
    session_db.initialize_empty(destination)
    with sqlite3.connect(destination) as db:
        db.execute("PRAGMA user_version=2")
    with session_db.read_only(destination) as db:
        with pytest.raises(ValueError, match="version"):
            session_db.audit(db)


def test_audit_detects_changed_session_content(tmp_path: Path) -> None:
    destination = tmp_path / "plan.sqlite3"
    empty = session_db.initialize_empty(destination)
    with sqlite3.connect(destination) as db:
        db.execute(
            "INSERT INTO plan_sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                "a" * 64,
                "generation",
                "plan",
                2,
                1,
                '{"synth":true}',
                None,
                100,
                300,
                "op",
                "hash",
            ),
        )
    with session_db.read_only(destination) as db:
        populated = session_db.audit(db)
    assert populated["rows"] == 1
    assert populated["sha256"] != empty["sha256"]
    with sqlite3.connect(destination) as db:
        db.execute("UPDATE plan_sessions SET revision=3")
    with session_db.read_only(destination) as db:
        changed = session_db.audit(db)
    assert changed["sha256"] != populated["sha256"]
    assert "synth" not in str(changed)
