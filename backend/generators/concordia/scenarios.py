# backend/generators/concordia/scenarios.py
"""Per-scenario config: prompts + identity + manifest shape, keyed by id. The
generator is scenario-agnostic; this is the only place a scenario's specifics live."""

from __future__ import annotations

from dataclasses import dataclass, field

from . import identity
from .sim import prompts


@dataclass(frozen=True)
class ScenarioConfig:
    id: str
    label: str
    home: dict
    premise: str
    victim_goal: str
    fraudster_goal: str
    ident: identity.Identity
    rules: list[dict] = field(default_factory=list)
    # Globe arc overlays for this scenario. Derived per-scenario, not hardcoded:
    # a behavioral scenario (account takeover) leaves this empty so its manifest
    # carries no card-fraud impossible-travel control (PROFILES Customer B: "the
    # globe shows nothing"). A geographic scenario sets its geo-velocity arrow.
    arrows: list[dict] = field(default_factory=list)
    # Manifest nodes, per scenario (2026-06-10: resolves the named debt - the
    # auth/fraud/login trio was hardcoded for every scenario). None -> the
    # card-fraud default trio (manifest.py builds it).
    nodes: list[dict] | None = None
    # Case annotations: bank-UNOBSERVABLE story beats (a phish SMS has no row in
    # any banking backend; it enters the case as a customer report). Rendered as
    # timeline annotations, never as data rows.
    annotations: list[dict] = field(default_factory=list)
    focal_keys: tuple[str, str] = ("card_id", "account_id")


# Priya's manifest nodes: benign card activity + the three behavioral lanes.
# account_event and transfer carry coords: null ON PURPOSE - behavioral events
# have no geography (the globe deliberately shows nothing for Case B); they
# exist on the timeline, never on the map.
_PRIYA_NODES: list[dict] = [
    {
        "kind": "auth",
        "label": "Authorization",
        "palette": "#00e5ff",
        "source": "sql",
        "query": "SELECT * FROM transactions WHERE is_fraud = 0 ORDER BY timestamp",
        "coords": {"lat": "merchant_lat", "lng": "merchant_lng"},
        "timestamp": "timestamp",
        "primary": "${merchant_name}",
        "secondary": "${mcc} · ${category}",
        "pivotable": ["mcc", "category", "merchant_name", "pos_entry_mode"],
    },
    {
        "kind": "login",
        "label": "Login",
        "palette": "#ff5ce8",
        "source": "sql",
        "query": "SELECT * FROM login_events ORDER BY timestamp",
        "coords": {"lat": "ip_lat", "lng": "ip_lng"},
        "timestamp": "timestamp",
        "primary": "${device_fp}",
        "secondary": "${outcome}",
        "pivotable": ["device_fp", "session_id", "ip_type"],
    },
    {
        "kind": "account_event",
        "label": "Account event",
        "palette": "#ffb347",
        "source": "sql",
        "query": "SELECT * FROM account_events ORDER BY timestamp",
        "coords": None,
        "timestamp": "timestamp",
        "primary": "${kind}",
        "secondary": "${field}",
        "pivotable": ["session_id"],
    },
    {
        "kind": "transfer",
        "label": "Transfer",
        "palette": "#7bdc6e",
        "source": "sql",
        "query": "SELECT * FROM transfers ORDER BY timestamp",
        "coords": None,
        "timestamp": "timestamp",
        "primary": "${rail} $${amount}",
        "secondary": "${status}",
        "pivotable": ["session_id", "payee_id", "rail"],
    },
    # The investigators' decisions, an authored file beside the pack (not a generated row):
    # each sits on its event, and a coordless event's sits where the takeover session signed in.
    {
        "kind": "decision",
        "label": "Decision",
        "palette": "#ff6b6b",
        "source": "json",
        "file": "data/priya-ato/decision.json",
        "coords": {"lat": "lat", "lng": "lng"},
        "timestamp": "decided_at",
        "primary": "${outcome} · ${target_label}",
        "secondary": "${decided_by} · ${status}",
        "pivotable": ["account_id"],
        "decision": {
            "status": "status",
            "outcome": "outcome",
            "note": "note",
            "actor": "decided_by",
            "target": "target_label",
            "key": "account_id",
            "event": "event_id",
        },
    },
]

# The spear-phish is bank-unobservable: no banking backend has a row for an SMS
# the customer received. It enters the case file as a retrospective customer
# report (the honest channel), and the ~48h dwell renders as negative space
# between the real Jamie K. Tamsinmere and the takeover burst.
_PRIYA_ANNOTATIONS: list[dict] = [
    {
        "timestamp": "2026-05-23T10:00:00-05:00",
        "label": "Spear-phish SMS (customer-reported)",
        "note": (
            "Post-incident interview: customer reports an SMS referencing her real "
            "$47 Tamsinmere to Jamie K. (sent Fri 21:14) with a link to a near-perfect "
            "fake banking page; credentials and the OTP seed were harvested. "
            "Roughly 48 hours of silence follow before the takeover login - "
            "mid-band dwell (half of phished accounts are accessed within 12h, "
            "91% within a week; Agari 2021)."
        ),
    },
]


SCENARIOS: dict[str, ScenarioConfig] = {
    "card-fraud": ScenarioConfig(
        id="card-fraud-concordia",
        label="Card · Concordia-generated",
        home={"lat": 20.0, "lng": -40.0, "zoom": 2},
        premise=prompts.PREMISE,
        victim_goal=prompts.VICTIM_GOAL,
        fraudster_goal=prompts.FRAUDSTER_GOAL,
        ident=identity.IDENTITIES["card-fraud"],
        rules=[
            {
                "id": "impossible-travel",
                "label": "impossible-travel",
                "detector": "geo-velocity",
                "verdict": "IMPOSSIBLE TRAVEL",
                "decision": "DECLINE",
                "sop": {
                    "what": "One card used in person in two places too far apart "
                    "to travel between in time.",
                    "why": "",
                },
            }
        ],
        arrows=[
            {
                "kind": "impossible",
                "label": "Impossible travel",
                "detector": "geo-velocity",
                "color": "#ff3d2e",
                "params": {"from": ["auth", "fraud"], "speedMph": 600, "minDistanceMi": 500},
            }
        ],
    ),
    "priya-ato": ScenarioConfig(
        id="priya-ato",
        label="Account · Houston ATO",
        home={"lat": 31.0, "lng": -95.0, "zoom": 4},
        # Authored scenario: the sim is never run for priya-ato (cli.py branches to
        # sim/scripted.py), so it carries no agent prompts. The placeholders make a
        # programmatic run_sim(scenario="priya-ato") produce nothing rather than a
        # coerced story - the freeze gate would reject the empty pack loudly.
        premise="(authored scenario: the sim is not used; see sim/scripted.py)",
        victim_goal="(authored scenario: the sim is not used; see sim/scripted.py)",
        fraudster_goal="(authored scenario: the sim is not used; see sim/scripted.py)",
        ident=identity.IDENTITIES["priya-ato"],
        rules=[
            {
                "id": "account-takeover",
                "label": "account-takeover",
                "detector": "login-anomaly",
                "verdict": "ACCOUNT TAKEOVER",
                "decision": "STEP-UP",
                "sop": {
                    "what": "A successful authentication from a device never seen on "
                    "the account.",
                    "why": "",
                },
            },
            {
                "id": "compromise-velocity",
                "label": "compromise-velocity",
                "detector": "account-change-velocity",
                "verdict": "COMPROMISE VELOCITY",
                "decision": "STEP-UP",
                "sop": {
                    "what": "A rapid burst of account-profile changes (email, "
                    "phone, password, payee) in one session.",
                    "why": "Two rapid changes is elevated; three or more is high.",
                    "brief": "Several account-recovery changes within minutes, "
                    "one session. The velocity is the signal, not any single "
                    "edit. Confirm with the customer out-of-band before honoring "
                    "a new email or phone, and hold payee additions made in the "
                    "same burst.",
                },
            },
        ],
        nodes=_PRIYA_NODES,
        annotations=_PRIYA_ANNOTATIONS,
    ),
}
