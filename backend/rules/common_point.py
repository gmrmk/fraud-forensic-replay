"""Common-point-of-purchase (CPP) detector: the terminal many later-compromised
cards share, the classic skimmer-investigation step.

Label-free by construction: "later-compromised" is derived from observable
signals only (see `_compromise_event`), never from the fraud label, so the same
read works on a live book where no label exists yet.

Scoping: with a focal card the rule answers for THAT card only. It fires when the
focal card is itself compromised shortly after using a terminal that enough other
compromised cards also used; the other cards enter the Decision only as the
explicit CPP evidence list and as the terminal's trigger visits. With no focal
card (the population pack's scale view) it emits one Decision per CPP terminal.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta

from rules.shared import Decision, _gap_runs, _parse_ts

# Compromise signal: a run of >= 2 chip-fallback swipes (a cloned stripe cannot complete the
# chip exchange, so every use falls back). Measured on the seed (301 cards) and
# data/population.db (199 cards) against the fraud label, used as ground truth only:
#   signal                                   seed P/R    population P/R   (card level)
#   impossible-travel arc                    1.00 / 0.50    1.00 / 0.66
#   fallback run >= 2, >= 500 mi from home   1.00 / 0.83    1.00 / 0.79
#   either of those two                      1.00 / 0.93    1.00 / 0.86
#   fallback run >= 2 (chosen)               0.86 / 1.00    1.00 / 1.00
# Precision is lower on the seed because it carries 5 benign worn-reader pairs, which no
# observable separates from a cash-out run except by distance from home (the "away" variant
# buys precision with recall). The CPP aggregation is a second filter (>= min_cards cards on
# ONE terminal, at >= min_share of its visitors), so isolated false compromises never reach a
# Decision: at terminal level this signal names the CPP cards with precision 1.00 and
# recall 1.00 on both packs. A run of 3 (skimmer-signature's floor) would cap recall near 0.5,
# because cash-out runs are 2-3 swipes; a run of 1 has precision 0.11.
_FB_MIN_RUN = 2
_FB_WINDOW_MIN = 60.0  # same gap window as skimmer-signature

# Rule-def param defaults (the manifest's `params` override them).
#   window_days: visit-to-cash-out lag is 14.0-23.0 days on both packs, so the window must
#     exceed 23; 30 covers it with margin, and on both packs no other terminal has more than
#     1 compromised visitor inside it (2 at unbounded lag), so a wider window only adds
#     chance matches.
#   min_cards: that coincidental maximum is 1-2, against 29-30 cards at the real CPP; 5
#     clears the coincidences by 2.5x and stays far below the ring.
#   min_share: a real CPP has nearly every in-window visitor compromised (0.97-1.00 here); a
#     busy clean terminal with a few chance hits has a tiny share. No pack has a busy
#     terminal (terminal ids are near-unique), so 0.5 is a structural guard, not a fit.
_DEFAULT_WINDOW_DAYS = 30.0
_DEFAULT_MIN_CARDS = 5
_DEFAULT_MIN_SHARE = 0.5

_EVIDENCE_PEERS = 10  # peer-card rows listed; the rest are summarized and live in the triggers


def _compromise_events(rows: list[dict]) -> list[dict]:
    """Every observable compromise event on one card's chronological rows: the first swipe
    of each chip-fallback run of >= 2. Each is {"ts": datetime, "tx_id": str, "swipes": int}."""
    fallbacks = [r for r in rows if r.get("pos_entry_mode") == "chip_fallback_swipe"]
    return [
        {"ts": _parse_ts(run[0]["timestamp"]), "tx_id": run[0]["id"], "swipes": len(run)}
        for run in _gap_runs(fallbacks, _FB_WINDOW_MIN)
        if len(run) >= _FB_MIN_RUN
    ]


def _candidate_terminals(
    conn: sqlite3.Connection, card_id: str | None, min_cards: int
) -> list[str]:
    """Terminals with >= min_cards distinct cards swiping in person. With a focal card,
    only terminals that card itself used (the scan still counts every card there)."""
    scope = (
        "AND terminal_id IN (SELECT terminal_id FROM transactions "
        "WHERE card_id = ? AND is_card_present = 1 AND terminal_id != '') "
        if card_id
        else ""
    )
    params: tuple[str | int, ...] = (card_id, min_cards) if card_id else (min_cards,)
    try:
        rows = conn.execute(
            "SELECT terminal_id FROM transactions "
            f"WHERE is_card_present = 1 AND terminal_id != '' {scope}"
            "GROUP BY terminal_id HAVING COUNT(DISTINCT card_id) >= ? ORDER BY terminal_id",
            params,
        ).fetchall()
    except sqlite3.OperationalError:
        return []  # a pack without terminal_id: schema-agnostic degrade, not an error
    return [r[0] for r in rows]


def _card_events(conn: sqlite3.Connection, card_id: str) -> list[dict]:
    """The card's compromise events, reading only its fallback swipes."""
    rows = conn.execute(
        "SELECT id, timestamp, pos_entry_mode FROM transactions "
        "WHERE card_id = ? AND pos_entry_mode = 'chip_fallback_swipe' ORDER BY timestamp, id",
        (card_id,),
    )
    return _compromise_events([dict(r) for r in rows])


def _assess_terminal(
    conn: sqlite3.Connection,
    terminal_id: str,
    events: dict[str, list[dict]],
    window: timedelta,
    min_cards: int,
    min_share: float,
) -> dict | None:
    """The terminal's CPP finding, or None when it does not qualify. A visitor counts when
    a compromise event lands within `window` after its visit. `events` memoizes per card."""
    # ponytail: one query per visitor card; fine at the ~30 visitors of a candidate here, a
    # terminal with thousands of visitors needs the signal precomputed per card in SQL.
    visits = [
        {**dict(r), "ts": _parse_ts(r["timestamp"])}
        for r in conn.execute(
            "SELECT id, card_id, timestamp, merchant_name FROM transactions "
            "WHERE terminal_id = ? AND is_card_present = 1 ORDER BY timestamp, id",
            (terminal_id,),
        )
    ]
    by_card: dict[str, list[dict]] = {}
    for v in visits:
        by_card.setdefault(v["card_id"], []).append(v)
    hits: list[dict] = []
    for card_id, card_visits in by_card.items():
        if card_id not in events:
            events[card_id] = _card_events(conn, card_id)
        pair = next(
            (
                (v, e)
                for v in card_visits
                for e in events[card_id]
                if timedelta(0) < e["ts"] - v["ts"] <= window
            ),
            None,
        )
        if pair is not None:
            hits.append({"card_id": card_id, "visit": pair[0], "event": pair[1]})
    if not hits or len(hits) < min_cards:
        return None
    hits.sort(key=lambda h: (h["visit"]["ts"], h["card_id"]))
    first, last = hits[0]["visit"]["ts"], max(h["visit"]["ts"] for h in hits)
    in_window = {v["card_id"] for v in visits if first <= v["ts"] <= last}
    share = len(hits) / len(in_window)
    if share < min_share:
        return None
    return {
        "terminal_id": terminal_id,
        "merchant": hits[0]["visit"]["merchant_name"],
        "first": first,
        "last": last,
        "share": share,
        "visitors": len(in_window),
        "hits": hits,
    }


def _day(ts: datetime) -> str:
    return ts.date().isoformat()


def _event_phrase(event: dict) -> str:
    return f"{event['swipes']} chip-fallback swipes {_day(event['ts'])}"


def _eval_common_point(
    conn: sqlite3.Connection, rule: dict, focal: dict | None = None
) -> list[Decision]:
    """One Decision per CPP terminal (portfolio read) or, with a focal card, the focal
    card's single Decision per CPP terminal it was compromised after using."""
    params = rule.get("params", {})
    window = timedelta(days=float(params.get("window_days", _DEFAULT_WINDOW_DAYS)))
    min_cards = int(params.get("min_cards", _DEFAULT_MIN_CARDS))
    min_share = float(params.get("min_share", _DEFAULT_MIN_SHARE))
    card_id = (focal or {}).get("card_id")
    events: dict[str, list[dict]] = {}
    out: list[Decision] = []
    for terminal_id in _candidate_terminals(conn, card_id, min_cards):
        finding = _assess_terminal(conn, terminal_id, events, window, min_cards, min_share)
        if finding is None:
            continue
        own = next((h for h in finding["hits"] if h["card_id"] == card_id), None)
        if card_id and own is None:
            continue  # the focal card visited but was not compromised after it
        out.append(_build_decision(rule, finding, own, min_cards, min_share, window))
    return out


def _build_decision(
    rule: dict,
    finding: dict,
    own: dict | None,
    min_cards: int,
    min_share: float,
    window: timedelta,
) -> Decision:
    hits = finding["hits"]
    peers = [h for h in hits if h is not own]
    span = f"{_day(finding['first'])} to {_day(finding['last'])}"
    inputs = [
        # `field` names the pivot column for a consumer that can open all matches for it.
        {"label": "Terminal", "value": finding["terminal_id"], "field": "terminal_id"},
        {"label": "Merchant", "value": finding["merchant"]},
        {"label": "Exposure window", "value": span},
    ]
    lag_days: int | None
    if own is not None:
        lag_days = (own["event"]["ts"].date() - own["visit"]["ts"].date()).days
        inputs += [
            {"label": "This card's visit", "value": _day(own["visit"]["ts"])},
            {"label": "This card's compromise", "value": _event_phrase(own["event"])},
            {"label": "Other compromised cards", "value": str(len(peers))},
        ]
    else:
        lag_days = None
        inputs.append({"label": "Compromised cards", "value": str(len(hits))})
    thresholds = [
        {
            "label": "Compromised cards at terminal",
            "actual": str(len(hits)),
            "bound": f">= {min_cards}",
            "breached": True,
        },
        {
            "label": "Share of window visitors compromised",
            "actual": f"{len(hits)}/{finding['visitors']} ({finding['share']:.0%})",
            "bound": f">= {min_share:.0%}",
            "breached": True,
        },
        {
            "label": "Visit to compromise",
            "actual": f"{lag_days} d" if lag_days is not None else "per card",
            "bound": f"<= {window.days} d",
            "breached": False,
        },
    ]
    shown = peers[:_EVIDENCE_PEERS]
    evidence = [
        {
            "label": f"Card {i + 1}",
            "value": f"{h['card_id']} visited {_day(h['visit']['ts'])}, "
            f"{_event_phrase(h['event'])}",
            "entity_ref": h["visit"]["id"],
        }
        for i, h in enumerate(shown)
    ]
    if len(peers) > len(shown):
        evidence.append(
            {"label": "More cards", "value": f"+{len(peers) - len(shown)} more at this terminal"}
        )
    visit_ids = [h["visit"]["id"] for h in hits]
    if own is not None:
        # Visits first, the focal card's own compromise last: the decision is reached
        # when that compromise is, never at the clean swipe that predates it.
        landing_id = own["event"]["tx_id"]
        trigger_ids = visit_ids + [landing_id]
    else:
        # Reached when the min_cards-th compromise lands, the earliest moment the
        # terminal qualifies.
        by_event = sorted(hits, key=lambda h: (h["event"]["ts"], h["card_id"]))
        landing_id = by_event[min_cards - 1]["event"]["tx_id"]
        trigger_ids = visit_ids + [landing_id]
    return Decision(
        id=f"decision:{rule['id']}:{finding['terminal_id']}:{landing_id}",
        rule={
            "id": rule["id"],
            "label": rule.get("label", rule["id"]),
            "kind": rule.get("detector", "common-point-of-purchase"),
            "sop": rule.get("sop", {}),
        },
        subject_path_kind="auth",  # the breach is a clean swipe; no label is consulted
        trigger_entity_ids=trigger_ids,
        inputs=inputs,
        thresholds=thresholds,
        verdict=rule.get("verdict", "COMMON POINT OF PURCHASE"),
        decision=rule.get("decision", "REVIEW"),
        evidence=evidence,
        severity=round(finding["share"], 2),
    )
