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


def synthetic_export(tmp_path: Path) -> Path:
    db_path = tmp_path / "source.sqlite3"
    db = sqlite3.connect(db_path)
    db.executescript((ROOT / "deploy/migrations/0001_plan_sessions.sql").read_text())
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
    db.commit()
    export = tmp_path / "export.sql"
    export.write_text("\n".join(db.iterdump()), encoding="utf-8")
    db.close()
    return export


def test_import_and_backup_preserve_every_column_and_refuse_overwrite(
    tmp_path: Path,
) -> None:
    export = synthetic_export(tmp_path)
    imported = tmp_path / "imported.sqlite3"
    original = session_db.import_sql(export, imported)
    assert original["rows"] == 1
    assert original["adopted"] == 1
    assert original["minRevision"] == 2
    assert session_db.audit(session_db.read_only(imported)) == original
    backup = tmp_path / "backup.sqlite3"
    assert session_db.backup(imported, backup) == original
    with pytest.raises(FileExistsError):
        session_db.import_sql(export, imported)
    with sqlite3.connect(imported) as db:
        db.execute("UPDATE plan_sessions SET revision=3")
    assert (
        session_db.audit(session_db.read_only(imported))["sha256"] != original["sha256"]
    )


def test_invalid_import_removes_only_new_candidate(tmp_path: Path) -> None:
    export = tmp_path / "wrong.sql"
    export.write_text("CREATE TABLE other (id INTEGER);", encoding="utf-8")
    destination = tmp_path / "candidate.sqlite3"
    with pytest.raises(ValueError, match="layout"):
        session_db.import_sql(export, destination)
    assert not destination.exists()


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


def test_reconcile_replaces_stale_d1_rows_including_deletions(tmp_path: Path) -> None:
    export = synthetic_export(tmp_path)
    oracle = tmp_path / "oracle.sqlite3"
    session_db.import_sql(export, oracle)
    with sqlite3.connect(oracle) as db:
        db.execute(
            "UPDATE plan_sessions SET revision=3, currentJson=? WHERE planId='plan'",
            ('{"synth":"changed"}',),
        )
        db.execute(
            "INSERT INTO plan_sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            ("b" * 64, "generation2", "plan2", 0, 1, None, None, 110, 310, None, None),
        )
    stale = tmp_path / "stale.sqlite3"
    session_db.import_sql(export, stale)
    with sqlite3.connect(stale) as db:
        db.execute(
            "INSERT INTO plan_sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                "c" * 64,
                "removed",
                "removed-plan",
                0,
                1,
                None,
                None,
                90,
                290,
                None,
                None,
            ),
        )
    sql = tmp_path / "reconcile.sql"
    result = session_db.reconcile_d1(oracle, sql)
    assert sql.stat().st_mode & 0o777 == 0o600
    script = sql.read_text()
    assert "BEGIN TRANSACTION" not in script
    assert "DELETE FROM plan_sessions;" in script
    with sqlite3.connect(stale) as db:
        db.executescript(script)
        assert session_db.audit(db) == result
    assert session_db.audit(session_db.read_only(oracle)) == result
    with pytest.raises(FileExistsError):
        session_db.reconcile_d1(oracle, sql)
