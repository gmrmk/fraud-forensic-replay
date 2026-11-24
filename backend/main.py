"""Fraud Forensic Replay - backend entry point.

/api/health
/api/transactions
/api/logins
/api/places - Places context layer (cache-first)
"""

from __future__ import annotations

import logging
import sqlite3
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.requests import Request
from starlette.responses import Response

import cases as cases_module
import notes_routes
import places as places_module
import rules as rules_module
import scenario_registry as sr
from db import PROJECT_ROOT, connect

app = FastAPI(title="Fraud Forensic Replay API", version="0.1.0")

# GAP 3 - security-headers hardening. Set on EVERY response regardless of route,
# so a new endpoint inherits the floor without remembering to opt in.
#   X-Content-Type-Options: nosniff - no MIME sniffing (drive-by exec defense)
#   X-Frame-Options: DENY - no framing (clickjacking defense)
#   Referrer-Policy - don't leak full URLs cross-origin
#   Permissions-Policy - deny camera/mic/geolocation outright
#   Strict-Transport-Security - force HTTPS once seen over TLS
#
# TODO(CSP, deferred): a strict Content-Security-Policy is intentionally NOT set
# here. maplibre-gl/deck.gl need web-workers, blob:, and wasm sources, so a blind
# CSP would silently break the live globe. Unblock condition: a per-directive CSP
# tuned to the frontend's worker/blob/wasm usage, verified with a screenshot and
# a clean browser console against the running app, landed as its own pass - not
# in this header floor.
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}


@app.middleware("http")
async def add_security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Attach the hardening headers to every response (GAP 3)."""
    response = await call_next(request)
    for name, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    return response


# New value every process start: the restart detector /api/health exposes.
BOOT_ID = uuid.uuid4().hex

# Load scenario packs and activate the default (card-fraud) at import time.
sr.init_registry(
    PROJECT_ROOT / "backend" / "scenarios", base_dir=PROJECT_ROOT, default_id="card-fraud"
)


# --- Demo clock broker ------------------------------------------------------
# In-memory relay so the separate-origin customer app (:5174) can follow the
# investigator's playhead. Ephemeral by design - no persistence, no schema.
_clock: dict = {"t": None, "playing": False, "rate": 1.0}


class ClockIn(BaseModel):
    t: float
    playing: bool = False
    rate: float = 1.0


def _iso_to_ms(s: str) -> int:
    """Parse an ISO-8601 txn timestamp to epoch ms (UTC). Mirrors the
    frontend's Date.parse(tx.timestamp). Handles a trailing 'Z'.

    Caller must pass a valid ISO-8601 string from the DB; this function
    does not validate untrusted input.
    """
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return int(dt.timestamp() * 1000)


@app.get("/api/clock")
def get_clock() -> dict:
    if _clock["t"] is None:
        conn = connect()
        try:
            row = conn.execute("SELECT MAX(timestamp) AS m FROM transactions").fetchone()
        finally:
            conn.close()
        default_t = _iso_to_ms(row["m"]) if row and row["m"] else 0
        return {"t": default_t, "playing": False, "rate": 1.0}
    return dict(_clock)


@app.post("/api/clock")
def set_clock(body: ClockIn) -> dict:
    _clock.update({"t": body.t, "playing": body.playing, "rate": body.rate})
    return dict(_clock)


# These path operations are plain `def`, not `async def`, on purpose: they do
# blocking I/O (SQLite reads; /api/places also touches the filesystem/HTTP).
# FastAPI runs sync path operations in a worker threadpool, keeping the blocking
# work OFF the event loop. Declaring them `async def` would block the entire
# server for the duration of each request. Do not change to `async def` without
# first switching to an async DB/HTTP driver and awaiting it.


class ScenarioSelect(BaseModel):
    id: str


@app.get("/api/scenarios")
def scenarios() -> list[dict]:
    """List available scenario packs (id + label) for the switcher."""
    return sr.list_scenarios()


@app.get("/api/scenario")
def scenario() -> dict:
    """The active scenario's full manifest (nodes + arrows passed through)."""
    return sr.get_active().raw


@app.post("/api/scenario/select")
def select_scenario(body: ScenarioSelect) -> dict:
    """Hot-swap the active scenario; repoints the DB. 400 on unknown id."""
    try:
        return sr.set_active(body.id).raw
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# The columns a manifest node's `scope.field` may bind against. An allow-list,
# not because the manifest is untrusted, but so a typo or a future schema drift
# fails loud here instead of producing a malformed (or injectable) query. The
# scope value is ALWAYS a bound parameter; this guards only the column NAME,
# which SQLite cannot parameterize.
_SCOPE_FIELDS = frozenset({"card_id", "account_id"})


@app.get("/api/entities")
def entities(kind: str, case: str | None = None) -> list[dict]:
    """Run the active manifest's SQL query for `kind` against the one bank DB.

    Scoping is per-request (never process-global): with ?case= present and the
    node declaring a `scope.field`, the read is bound to that case's focal value
    (the card/account the field names), so a case view returns ONLY its subject's
    rows. With NO ?case=, the bare query runs unscoped (the file-backed kinds and a population
    pack read it). The manifest owns WHICH column scopes each kind; the endpoint is a dumb,
    parameterized binder.

    A kind another registered scenario declares but this manifest lacks is
    absence-as-data -> 200 [] (the frontend probes behavioral kinds on every
    scenario). A kind no scenario knows, or a non-sql kind (e.g. places, which
    use their dedicated endpoint), is a caller error -> 400."""
    manifest = sr.get_active()
    if kind not in manifest.kinds:
        if kind in sr.sql_kinds():
            return []
        raise HTTPException(status_code=400, detail=f"unknown kind: {kind}")
    if manifest.source_for(kind) == "json":
        try:
            return manifest.json_rows(kind)  # a file-backed kind: no SQL, no scoping
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        query = manifest.query_for(kind)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    params: tuple[str, ...] = ()
    scope_field = manifest.scope_field_for(kind)
    if case is not None and scope_field is not None:
        focal_value = cases_module.focal_for(case).get(scope_field)
        if focal_value is not None:
            if scope_field not in _SCOPE_FIELDS:
                raise HTTPException(
                    status_code=400, detail=f"unsupported scope field: {scope_field}"
                )
            # Wrap the node's own query so its WHERE/ORDER BY stay intact and the
            # focal value is a bound parameter, never string-interpolated. The
            # column name is allow-listed above (SQLite cannot bind identifiers).
            query = f"SELECT * FROM ({query}) WHERE {scope_field} = ?"
            params = (focal_value,)

    conn = connect()
    try:
        return [dict(r) for r in conn.execute(query, params).fetchall()]
    finally:
        conn.close()


@app.get("/api/portfolio/summary")
def portfolio_summary() -> dict:
    """Population shape of the ACTIVE scenario's DB: distinct cards + total
    transactions behind the focal case."""
    conn = connect()
    try:
        cards, txs = conn.execute(
            "SELECT COUNT(DISTINCT card_id), COUNT(*) FROM transactions"
        ).fetchone()
    finally:
        conn.close()
    return {"cards": cards, "transactions": txs}


def _card_of_account(conn: sqlite3.Connection, account_id: str | None) -> str | None:
    """The account's card (lowest id when it has several), or None: no account, no cards table
    or no card row."""
    if not account_id:
        return None
    try:
        row = conn.execute(
            "SELECT id FROM cards WHERE account_id = ? ORDER BY id LIMIT 1", (account_id,)
        ).fetchone()
    except sqlite3.OperationalError:
        return None
    return str(row["id"]) if row else None


@app.get("/api/decisions")
def decisions(
    card_id: str | None = None,
    account_id: str | None = None,
    case: str | None = None,
) -> list[dict]:
    """Evaluate the active scenario's rule-defs into forensic Decisions.
    Decisions annotate Paths; a failure here degrades to [] (Paths still render).

    Focal (all per-request, never process-global):
      ?card_id= and ?account_id= each add their key, so both together reach the rules;
      else ?case= resolves via the cases registry;
      else, with no usable key (no query, an unknown case), manifest.focal, as /api/transactions
      does. The manifest path is the unchanged legacy path and is never resolved or emptied.
    In a pack whose manifest declares a focal card, a request focal with an account and no card
    gets its card from the cards table; when none resolves the answer is [] and no row is read.
    An empty focal there would make the card detectors read every card in the pack and report
    bursts and runs stitched from other customers' cards. A pack with no focal card keeps its
    focal as given (a deliberately unscoped pack).
    """
    manifest = sr.get_active()
    requested: dict = {}
    if card_id:
        requested["card_id"] = card_id
    if account_id:
        requested["account_id"] = account_id
    if not requested and case is not None:
        requested = cases_module.focal_for(case)
    focal = requested or manifest.focal
    conn = connect()
    try:
        if requested and manifest.focal.get("card_id") and not focal.get("card_id"):
            resolved = _card_of_account(conn, focal.get("account_id"))
            if resolved is None:
                return []
            focal = {**focal, "card_id": resolved}
        return [asdict(d) for d in rules_module.evaluate(conn, manifest.rules, focal)]
    except Exception:
        logging.getLogger(__name__).exception("decisions eval failed; degrading to []")
        return []
    finally:
        conn.close()


@app.get("/api/account_events")
def account_events(
    account_id: str | None = None,
    case: str | None = None,
) -> list[dict]:
    """Return account events for a case (or the active scenario), chronological.

    Scoping precedence mirrors /api/logins: an explicit account_id wins;
    else ?case= resolves to the case's focal account via the cases registry;
    else the active scenario's focal account. Absent every signal -> all rows
    (the deliberate population read).
    """
    if account_id is None and case is not None:
        account_id = cases_module.focal_for(case).get("account_id")
    if account_id is None:
        account_id = sr.get_active().focal.get("account_id")
    conn = connect()
    try:
        try:
            if account_id:
                rows = conn.execute(
                    "SELECT * FROM account_events WHERE account_id = ? ORDER BY timestamp",
                    (account_id,),
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM account_events ORDER BY timestamp").fetchall()
        except sqlite3.OperationalError:
            # Non-Priya scenarios have no account_events table; degrade to [].
            return []
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/transfers")
def transfers(
    account_id: str | None = None,
    case: str | None = None,
) -> list[dict]:
    """Return transfers for a case (or the active scenario), chronological.

    Scoping precedence mirrors /api/logins: an explicit account_id wins;
    else ?case= resolves to the case's focal account via the cases registry;
    else the active scenario's focal account. Absent every signal -> all rows
    (the deliberate population read).
    """
    if account_id is None and case is not None:
        account_id = cases_module.focal_for(case).get("account_id")
    if account_id is None:
        account_id = sr.get_active().focal.get("account_id")
    conn = connect()
    try:
        try:
            if account_id:
                rows = conn.execute(
                    "SELECT * FROM transfers WHERE account_id = ? ORDER BY timestamp",
                    (account_id,),
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM transfers ORDER BY timestamp").fetchall()
        except sqlite3.OperationalError:
            # Non-Priya scenarios have no transfers table; degrade to [].
            return []
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/health")
def health() -> JSONResponse:
    """Liveness + readiness + restart detection.

    boot_id changes on every process start, so a client that cached an older
    boot_id knows its world is stale (the active scenario is process-global and
    resets to the default on restart).

    GAP 7 - readiness: pings the DB (SELECT 1) before reporting ok. A DB that
    cannot be opened returns 503 so a load balancer or cold-start probe sees
    not-ready rather than a falsely-live backend. The 200 shape is unchanged:
    {status, boot_id, scenario} with the 32-char-hex boot_id."""
    try:
        conn = connect()
        try:
            conn.execute("SELECT 1")
        finally:
            conn.close()
    except (sqlite3.Error, OSError):
        # sqlite3.Error: query/open failure; OSError: connect()'s mkdir on an
        # unwritable data dir. Both mean not-ready -> 503, never a 500.
        logging.getLogger(__name__).exception("health readiness ping failed")
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return JSONResponse(
        content={
            "status": "ok",
            "boot_id": BOOT_ID,
            "scenario": sr.get_active().raw["id"],
        }
    )


# Trained-scorecard number beside each transaction (ml/train.py -> ml_scores). Fixed
# literals, no caller input. One version only: retrains coexist in ml_scores, so the join
# is pinned to the active artifact's version (ml.scorer.active_model_version), the same one
# rules/ml_anomaly.py reads; the version is a bound parameter.
_TX_SELECT = "SELECT t.* FROM transactions t"
_TX_SELECT_WITH_ML = (
    "SELECT t.*, ms.score AS ml_score, ms.score_percentile AS ml_percentile, "
    "ms.model_version AS ml_model_version FROM transactions t "
    "LEFT JOIN ml_scores ms ON ms.entity_id = t.id "
    "AND ms.model_version = ?"
)


# Row cap on a terminal-scoped read. Terminals are near-unique in every pack (the busiest, the
# 30-card skimmer ring's, has 30 rows), so this only bounds a pathological shared id.
# ponytail: a terminal past the cap returns its earliest rows with no truncation signal;
# upgrade to a `limit` param plus a total count when a pack with a genuinely hot terminal exists.
_TERMINAL_ROWS_CAP = 500


@app.get("/api/transactions")
def transactions(
    card_id: str | None = None,
    case: str | None = None,
    terminal_id: Annotated[str | None, Query(min_length=1)] = None,
) -> list[dict]:
    """Return transactions for a case (or the active scenario), chronological.

    Scoping precedence, all per-request (never process-global): an explicit
    card_id wins; else ?case= resolves to that case's focal card via the cases
    registry (one-bank: scoping is a filter, not an active-DB switch); else the
    active scenario's focal card (the pre-one-bank path the current frontend
    still uses). Absent every signal -> all rows (a deliberate portfolio read).

    An explicit terminal_id is the cross-card read behind the common-point-of-purchase
    step: every card's transactions at that one terminal, with no focal-card default,
    capped at _TERMINAL_ROWS_CAP rows. Combined with card_id/case it narrows to that
    card's visits. An empty terminal_id is a 422, never "every card-not-present row".

    Each row also carries ml_score / ml_percentile / ml_model_version (the trained
    scorecard's raw score, its 0-100 percentile among scored transactions, and the
    model version) via a LEFT JOIN on ml_scores. A pack with no ml_scores table gets
    none of the three keys; a transaction the model never scored gets them as null.
    """
    if card_id is None and case is not None:
        card_id = cases_module.focal_for(case).get("card_id")
    if card_id is None and terminal_id is None:
        card_id = sr.get_active().focal.get("card_id")
    conn = connect()
    try:
        # ml_scores is optional (a fresh clone or older-schema pack may lack it); an
        # explicit existence check keeps a real OperationalError loud instead of swallowed.
        has_ml = (
            conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ml_scores'"
            ).fetchone()
            is not None
        )
        # No artifact for this pack -> no ml_* keys, like a pack with no ml_scores table.
        version = None
        if has_ml:
            from ml.scorer import active_model_version

            version = active_model_version()
        select = _TX_SELECT_WITH_ML if version else _TX_SELECT
        # Column names are fixed literals; every caller value is a bound parameter.
        clauses: list[str] = []
        params: list[str | int] = [version] if version else []
        if card_id:
            clauses.append("t.card_id = ?")
            params.append(card_id)
        if terminal_id is not None:
            clauses.append("t.terminal_id = ?")
            params.append(terminal_id)
        sql = select + (" WHERE " + " AND ".join(clauses) if clauses else "")
        sql += " ORDER BY t.timestamp"
        if terminal_id is not None:
            sql += " LIMIT ?"
            params.append(_TERMINAL_ROWS_CAP)
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


@app.get("/api/logins")
def logins(account_id: str | None = None, case: str | None = None) -> list[dict]:
    """Return login events for a case (or the active scenario), chronological.

    Mirrors /api/transactions scoping precedence: an explicit account_id wins;
    else ?case= resolves to the case's focal account via the cases registry;
    else the active scenario's focal account. Same ordering as the auth layer so
    both advance in sync.
    """
    if account_id is None and case is not None:
        account_id = cases_module.focal_for(case).get("account_id")
    if account_id is None:
        account_id = sr.get_active().focal.get("account_id")
    conn = connect()
    try:
        if account_id:
            rows = conn.execute(
                "SELECT * FROM login_events WHERE account_id = ? ORDER BY timestamp",
                (account_id,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM login_events ORDER BY timestamp").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# Marcus's credit limit ($15K) is not seeded into the schema; it is a fixture
# constant here. A multi-cardholder build would replace this single-customer
# endpoint with an account selector.
MARCUS_CREDIT_LIMIT = 15000


@app.get("/api/account")
def account() -> dict:
    """Joined customer + account + card summary for the (single) cardholder.

    Read-only identity/card data the customer dashboard needs. Marcus is the
    customer-app cardholder; returns his credit_card account (case focal) + card.
    """
    conn = connect()
    try:
        # Marcus is the customer-app cardholder. The one-bank DB also holds a
        # population of credit_card accounts opened earlier, so select by the
        # case focal, never by opened_at order.
        acct = conn.execute(
            "SELECT * FROM accounts WHERE id = ? AND type = 'credit_card'",
            (cases_module.focal_for("marcus")["account_id"],),
        ).fetchone()
        if acct is None:
            # Not a 200 with an error body: the customer app reads any ok response as an account.
            raise HTTPException(status_code=404, detail="no credit_card account seeded")
        cust = conn.execute(
            "SELECT * FROM customers WHERE id = ?", (acct["customer_id"],)
        ).fetchone()
        card = conn.execute(
            "SELECT * FROM cards WHERE account_id = ? LIMIT 1", (acct["id"],)
        ).fetchone()
        return {
            "customer": dict(cust) if cust else None,
            "account": dict(acct),
            "card": dict(card) if card else None,
            "card_id": card["id"] if card else None,
            "credit_limit": MARCUS_CREDIT_LIMIT,
        }
    finally:
        conn.close()


@app.get("/api/places")
def places(
    lat: float = 29.7770,
    lng: float = -95.5460,
    radius_m: int = 8000,
) -> list[dict]:
    """Return Places "context" POIs near (lat, lng) across all known
    categories, from the cache on disk and from nowhere else. The running app
    never calls the Places service: a request with no cache file answers [].

    The Places layer is read as CONTEXT, not entity data. Marcus's
    transactions remain authoritative (they live in the DB); these POIs
    are "what else is around" - useful for "did the fraud land at a real
    merchant block?" investigations once Slice 7 ships Lagos.

    Defaults center on Marcus's Memorial home anchor with an 8km radius -
    that envelopes his commute, errand, and dining footprint. Slice 7
    will pass Lagos coordinates here for the fraud-side context.
    """
    out: list[dict] = []
    for category in places_module.CATEGORY_TO_PLACES_TYPES:
        results = places_module.search_nearby(category, lat, lng, radius_m=radius_m, fetch=False)
        for p in results:
            out.append(
                {
                    "id": p.place_id,
                    "name": p.name,
                    "category": category,
                    "lat": p.lat,
                    "lng": p.lng,
                }
            )
    return out


# Custom notes (design section 6): the routes, the error handler, and the log guard. Last, so
# the notes middleware wraps every route above it.
notes_routes.register(app)
