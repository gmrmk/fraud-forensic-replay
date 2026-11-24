"""Server-side forensic decision authority.

Turns the active scenario's rule-defs (manifest `rules` block) into a list of
schema-agnostic `Decision` objects. The Decision shape + the detector registry
are the generic seam; each detector (e.g. `geo-velocity`) is a concrete adapter
that reuses the existing detection (`arcs.py`) and reads its scenario's fields.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from statistics import median


@dataclass(frozen=True)
class Decision:
    """A schema-agnostic forensic decision over one subject path. Serialized
    snake_case to /api/decisions; the frontend adapter maps to camelCase."""

    id: str
    rule: dict
    subject_path_kind: str
    trigger_entity_ids: list[str]
    inputs: list[dict]
    thresholds: list[dict]
    verdict: str
    decision: str
    evidence: list[dict]
    severity: float


# Card-testing burst shape, one definition shared by the card-testing detector and
# the impossible-travel "Precursor" line: a run of micro card-not-present charges.
_CT_MAX_AMOUNT = 10.0  # a "micro" probe; subscriptions and real buys sit above it
_CT_WINDOW_MIN = 30.0  # max gap between consecutive probes inside one burst
_CT_MIN_COUNT = 2  # a single small CNP charge is never a finding

# Label-free incident windows around an impossible-travel landing. Constraints,
# measured on data/replay.db: the three confirmed-fraud landings (Marcus + 2 ring
# cash-outs) each open a 2-4 row cluster spanning 3-8 min from the landing (largest
# gap 4 min), and Marcus's probe burst sits 142 h before his landing.
#   cluster: 60 min after the landing (the skimmer run's own inter-swipe bound);
#            wide enough for the 8-min clusters, narrow enough that a later
#            independent visit to the same country is another episode.
#   precursor lookback: 7 days clears the 142 h burst; older probes are not
#            attributed to this landing.
# ponytail: fixed windows tuned to the seeded packs; upgrade path is episode
# segmentation from the card's own activity gaps.
_CLUSTER_WINDOW_MIN = 60.0
_PRECURSOR_LOOKBACK_H = 168.0


def _parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _elapsed_human(t1: str, t2: str) -> str:
    secs = abs((_parse_ts(t2) - _parse_ts(t1)).total_seconds())
    return f"{int(secs // 3600)}h {int((secs % 3600) // 60):02d}m"


def _minutes_between(a: str, b: str) -> float:
    return abs((datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds()) / 60.0


def _gap_runs(rows: list[dict], window_min: float) -> list[list[dict]]:
    """Chain chronological rows into runs where each consecutive gap stays
    inside the window. Both burst detectors key on run SHAPE, never one row."""
    runs: list[list[dict]] = []
    cur: list[dict] = []
    for r in rows:
        if cur and _minutes_between(cur[-1]["timestamp"], r["timestamp"]) > window_min:
            runs.append(cur)
            cur = []
        cur.append(r)
    if cur:
        runs.append(cur)
    return runs


def _probe_bursts(rows: list[dict]) -> list[list[dict]]:
    """Card-testing bursts in chronological rows: runs of >= `_CT_MIN_COUNT` micro
    card-not-present charges, each gap inside `_CT_WINDOW_MIN`."""
    micro = [
        r
        for r in rows
        if not r.get("is_card_present") and float(r.get("amount") or 0) <= _CT_MAX_AMOUNT
    ]
    return [x for x in _gap_runs(micro, _CT_WINDOW_MIN) if len(x) >= _CT_MIN_COUNT]


def _change_phrase(r: dict) -> str:
    """One account-change as 'field: old -> new', or the payee-add. Full values,
    unmasked: on seeded demo data the new recovery address IS the evidence."""
    if r.get("kind") == "payee_add":
        return f"payee added ({r.get('payee_id') or 'new beneficiary'})"
    field = r.get("field") or "field"
    return f"{field}: {r.get('old_value') or '-'} -> {r.get('new_value') or '-'}"


def _card_rows(conn: sqlite3.Connection, card_id: str) -> list[dict]:
    return [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM transactions WHERE card_id = ? ORDER BY timestamp, id", (card_id,)
        ).fetchall()
    ]


def _landing_cluster(card_rows: list[dict], curr: dict) -> list[dict]:
    """The landing card's own rows (`card_rows`, loaded once per card by the caller)
    in the landing country, from the landing through `_CLUSTER_WINDOW_MIN` after it
    (the landing included). Signal-defined: no fraud label is read."""
    land = _parse_ts(curr["timestamp"])
    country = curr.get("merchant_country", "US")
    return [
        r
        for r in card_rows
        if r.get("merchant_country") == country
        and 0 <= (_parse_ts(r["timestamp"]) - land).total_seconds() <= _CLUSTER_WINDOW_MIN * 60
    ]


def _landing_precursor(card_rows: list[dict], curr: dict) -> dict | None:
    """The smallest probe of a card-testing burst (the card-testing detector's own
    shape) on the landing card (`card_rows`) within `_PRECURSOR_LOOKBACK_H` before
    the landing, else None."""
    land = _parse_ts(curr["timestamp"])
    window = [
        r
        for r in card_rows
        if 0 < (land - _parse_ts(r["timestamp"])).total_seconds() <= _PRECURSOR_LOOKBACK_H * 3600
    ]
    probes = [r for burst in _probe_bursts(window) for r in burst]
    return min(probes, key=lambda r: (r["amount"], r["timestamp"]), default=None)


def _gather_evidence(card_rows: list[dict], curr: dict) -> list[dict]:
    """Pull the impossible-travel evidence chain for the landing transaction.
    Concrete to the card-fraud schema (first adapter).

    Label-free: the cluster and the precursor are defined by signals (same card,
    landing country, time window after; a card-testing burst before), never
    by the ground-truth `is_fraud` column. Both read the landing's OWN card
    (`card_rows` = `_card_rows` of `curr["card_id"]`), which is the focal card when
    one is given and the arc's card on a portfolio read, so a foreign cardholder's
    rows never leak into the decision (the one-bank leak class)."""
    cluster = _landing_cluster(card_rows, curr)
    ev: list[dict] = []

    fallback = [r for r in cluster if r.get("pos_entry_mode") == "chip_fallback_swipe"]
    if fallback:
        names = " / ".join(r["merchant_name"] for r in fallback)
        ev.append(
            {
                "label": "Skimmer signature",
                "value": f"{len(fallback)}x chip-fallback-swipe - {names}",
            }
        )

    if curr.get("auth_source") == "stip":
        # An arc can land on a declined attempt, so the row's own code words the outcome.
        outcome = "approved" if (curr.get("auth_response_code") or "00") == "00" else "declined"
        ev.append(
            {
                "label": "Auth routing",
                "value": f"STIP - issuer offline, stand-in {outcome}",
                "entity_ref": curr["id"],
            }
        )

    risks = [str(r["risk_score"]) for r in cluster if r.get("risk_score") is not None]
    if risks:
        ev.append({"label": "Risk scores", "value": " / ".join(risks) + " (of 1000)"})

    if curr.get("currency"):
        ev.append({"label": "Currency", "value": str(curr["currency"])})

    p = _landing_precursor(card_rows, curr)
    if p is not None:
        ev.append(
            {
                "label": "Precursor",
                "value": f'${p["amount"]:.0f} CNP micro-test - {p["merchant_name"]} '
                f'(risk {p.get("risk_score", "?")})',
                "entity_ref": p["id"],
            }
        )
    return ev


def _kill_chain_evidence(conn: sqlite3.Connection, session_id: str) -> list[dict]:
    """Quantified evidence computed from the account's OWN data at read time
    (the Ladleton-Radar pattern: '84x the account median' is earned from history,
    never asserted): the wire-vs-P2P-median multiple, the payee's age at first
    wire, and the profile-change velocity inside the takeover session. Degrades
    to [] on scenarios whose DB has no behavioral tables (card-fraud)."""
    if not session_id:
        return []
    ev: list[dict] = []
    try:
        wires = [
            dict(r)
            for r in conn.execute(
                "SELECT id, account_id, timestamp, amount, payee_id, status, decline_reason "
                "FROM transfers "
                "WHERE session_id = ? AND rail = 'wire' ORDER BY timestamp",
                (session_id,),
            ).fetchall()
        ]
        if wires:
            # Scope the median to the focal account derived from the session's
            # own wire rows - on a population DB the unscoped median crosses account
            # boundaries (foreign cheap P2P transfers drag it down, inflating the
            # multiple). The account_id comes from the wire row we already fetched.
            # Baseline = the account's tamsinmere (P2P) transfers OUTSIDE the flagged session:
            # signal-defined, no fraud label read.
            base = "FROM transfers WHERE rail = 'tamsinmere' AND session_id != ?"
            args: tuple = (session_id,)
            if wires[0].get("account_id"):
                base += " AND account_id = ?"
                args += (wires[0]["account_id"],)
            amounts = [float(r[0]) for r in conn.execute(f"SELECT amount {base}", args)]
            mid = median(amounts) if amounts else 0.0
            if mid:
                mult = wires[0]["amount"] / mid
                ev.append(
                    {
                        "label": "Amount vs baseline",
                        "value": f'${wires[0]["amount"]:,.0f} wire ~ {mult:,.0f}x the '
                        f"account's median P2P (${mid:,.2f})",
                        "entity_ref": wires[0]["id"],
                    }
                )
            payee = conn.execute(
                "SELECT first_seen_at FROM payees WHERE id = ?", (wires[0]["payee_id"],)
            ).fetchone()
            if payee is not None and payee[0]:
                mins = int(
                    (_parse_ts(wires[0]["timestamp"]) - _parse_ts(payee[0])).total_seconds() // 60
                )
                if 0 <= mins <= 24 * 60:
                    ev.append(
                        {
                            "label": "Beneficiary age",
                            "value": f"payee first seen {mins} min before the wire - "
                            "zero prior payment history",
                            "entity_ref": wires[0]["id"],
                        }
                    )
            blocked = next((w for w in wires if w["status"] == "blocked"), None)
            if blocked is not None:
                ev.append(
                    {
                        "label": "System response",
                        "value": f'second wire ${blocked["amount"]:,.0f} BLOCKED - '
                        f'{str(blocked.get("decline_reason") or "declined").replace("_", " ")}',
                        "entity_ref": blocked["id"],
                    }
                )
        velocity = conn.execute(
            "SELECT COUNT(*) , MIN(timestamp), MAX(timestamp) FROM ("
            "  SELECT timestamp FROM account_events WHERE session_id = ?"
            "  UNION ALL SELECT timestamp FROM transfers WHERE session_id = ?)",
            (session_id, session_id),
        ).fetchone()
        if velocity is not None and velocity[0] and velocity[0] >= 2:
            span_min = int((_parse_ts(velocity[2]) - _parse_ts(velocity[1])).total_seconds() // 60)
            ev.append(
                {
                    "label": "Profile-change velocity",
                    "value": f"{velocity[0]} account-touching events in {span_min} min, "
                    "one session",
                }
            )
    except sqlite3.OperationalError:
        return []  # scenario DB without behavioral tables - schema-agnostic degrade
    return ev


def _subject_card_rows(conn: sqlite3.Connection, focal: dict | None) -> list[dict]:
    """The subject card's transactions, chronological. Scoped to the manifest
    focal card on population DBs (the FIX-2026-06-10 lesson: an unscoped walk
    chains rows across different cards)."""
    card_id = (focal or {}).get("card_id")
    if card_id:
        return [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM transactions WHERE card_id = ? ORDER BY timestamp, id",
                (card_id,),
            ).fetchall()
        ]
    return [
        dict(r)
        for r in conn.execute("SELECT * FROM transactions ORDER BY timestamp, id").fetchall()
    ]


def manifest_rows(conn: sqlite3.Connection, kind: str) -> list[dict]:
    """Rows of `kind` from the pack `conn` belongs to, read as /api/entities serves them unscoped:
    a json node through Manifest.json_rows, a sql node through its query on `conn`. The pack is
    found from the connection's DB file, never from the active scenario, so a pack's rules read
    its own rows whoever is active. An unknown DB or undeclared kind reads as no rows."""
    import scenario_registry as sr  # local: the registry imports nothing from rules

    path = conn.execute("PRAGMA database_list").fetchone()[2]
    manifest = sr.manifest_for_db(path) if path else None
    if manifest is None or kind not in manifest.kinds:
        return []
    if manifest.source_for(kind) == "json":
        return manifest.json_rows(kind)
    return [dict(r) for r in conn.execute(manifest.query_for(kind)).fetchall()]
