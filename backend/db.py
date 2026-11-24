"""SQLite connection + schema initialization for Fraud Forensic Replay.

The schema is authoritative in schema.sql. Code calls init_db() to apply it.
Idempotent - CREATE TABLE IF NOT EXISTS lets re-runs be safe.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "replay.db"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

_active_db_path: Path = DB_PATH


def set_active_db(path: Path) -> None:
    """Repoint the default connection target at the active scenario's DB.
    Used by scenario_registry.set_active for hot-swap. Explicit db_path args
    to connect() still override this."""
    global _active_db_path
    _active_db_path = Path(path)


def get_active_db() -> Path:
    """The current active-DB target connect() falls back to (the value last set
    by set_active_db). A read-only accessor over module state -- lets callers and
    tests observe the swap target without reaching into the private global."""
    return _active_db_path


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or _active_db_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: Path | None = None) -> None:
    """Apply schema.sql + all migrations/*.sql to the database. Safe to
    re-run - schema uses CREATE TABLE IF NOT EXISTS, and migration
    ALTER TABLE ADD COLUMN failures (column already exists) are caught
    and ignored per statement. SQLite has no IF NOT EXISTS on
    ADD COLUMN, hence the per-statement try/except pattern."""
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    migrations_dir = Path(__file__).resolve().parent / "migrations"
    conn = connect(db_path)
    try:
        conn.executescript(schema_sql)
        if migrations_dir.exists():
            for mig in sorted(migrations_dir.glob("*.sql")):
                migration_sql = mig.read_text(encoding="utf-8")
                for statement in _split_sql(migration_sql):
                    try:
                        conn.execute(statement)
                    except sqlite3.OperationalError as e:
                        if "duplicate column name" in str(e):
                            continue
                        raise
        conn.commit()
    finally:
        conn.close()


def _split_sql(sql: str) -> list[str]:
    """Split a multi-statement SQL string on `;` boundaries, dropping
    full-line `--` comments and empty trailing fragments."""
    statements: list[str] = []
    buffer: list[str] = []
    for raw_line in sql.splitlines():
        if raw_line.strip().startswith("--"):
            continue
        buffer.append(raw_line)
        if raw_line.rstrip().endswith(";"):
            stmt = "\n".join(buffer).strip()
            if stmt:
                statements.append(stmt)
            buffer = []
    if buffer:
        rest = "\n".join(buffer).strip()
        if rest:
            statements.append(rest)
    return statements
