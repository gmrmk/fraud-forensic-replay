from __future__ import annotations

import db


def _make_db(path, marker):
    conn = db.connect(path)  # explicit path still works
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS m (v TEXT)")
        conn.execute("INSERT INTO m (v) VALUES (?)", (marker,))
        conn.commit()
    finally:
        conn.close()


def test_connect_follows_active_db_path(tmp_path):
    a = tmp_path / "a.db"
    b = tmp_path / "b.db"
    _make_db(a, "alpha")
    _make_db(b, "bravo")

    db.set_active_db(a)
    conn = db.connect()  # no explicit path -> active
    try:
        assert conn.execute("SELECT v FROM m").fetchone()["v"] == "alpha"
    finally:
        conn.close()

    db.set_active_db(b)
    conn = db.connect()
    try:
        assert conn.execute("SELECT v FROM m").fetchone()["v"] == "bravo"
    finally:
        conn.close()


def test_explicit_db_path_overrides_active(tmp_path):
    a = tmp_path / "a.db"
    b = tmp_path / "b.db"
    _make_db(a, "alpha")
    _make_db(b, "bravo")
    db.set_active_db(a)
    conn = db.connect(b)  # explicit wins
    try:
        assert conn.execute("SELECT v FROM m").fetchone()["v"] == "bravo"
    finally:
        conn.close()
