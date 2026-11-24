"""Pure translators: one ParsedAction -> one (table, row-dict). The generator
owns geo (places registry) + time (clock) + is_fraud (actor identity); the sim
owns the semantic fields (mcc, amount, outcome, ...). The enrichment columns
do not lean on silent NOT NULL DEFAULTs (a CNP
row shipping pos_entry_mode='chip' is the seam a fraud reviewer catches first),
and the kill-chain kinds (tamsinmere/wire/profile_change/payee_add) translate to the
transfers/account_events tables."""

from __future__ import annotations

from . import identity, places
from .action_format import ParsedAction
from .clock import ScenarioClock

Row = dict[str, object]


def to_row(pa: ParsedAction, clock: ScenarioClock, ident: identity.Identity) -> tuple[str, Row]:
    if pa.kind == "purchase":
        return "transactions", _purchase_row(pa, clock, ident)
    if pa.kind == "login":
        return "login_events", _login_row(pa, clock, ident)
    if pa.kind in ("tamsinmere", "wire"):
        return "transfers", _transfer_row(pa, clock, ident)
    if pa.kind in ("profile_change", "payee_add"):
        return "account_events", _account_event_row(pa, clock, ident)
    raise ValueError(f"no translator for kind {pa.kind!r}")  # parser already guards this


def _session_id(pa: ParsedAction) -> str:
    """An explicit session= k=v wins (the kill chain shares one session thread);
    otherwise a deterministic per-step id."""
    return pa.fields.get("session", f"sess-{pa.step:05d}")


def _purchase_row(pa: ParsedAction, clock: ScenarioClock, ident: identity.Identity) -> Row:
    place = places.PLACES[pa.fields["place"]]
    present = int(pa.fields["present"])
    is_subscription = place.category == "subscription"
    return {
        "id": f"gen-tx-{pa.step:05d}",
        "card_id": ident.card["id"],  # fraudster clones the one card
        "account_id": ident.account["id"],
        "timestamp": clock.ts_for(pa.step),
        "amount": float(pa.fields["amount"]),
        "merchant_name": place.name,
        "merchant_lat": place.lat,
        "merchant_lng": place.lng,
        "merchant_country": place.country,
        "mcc": pa.fields["mcc"],
        "category": place.category,
        "is_card_present": present,
        "is_fraud": identity.is_fraud_for(pa.actor),
        "balance_after": 0.0,  # Phase 1: no running balance
        # Enrichment, set honestly instead of defaulted: ISO 8583 DE22
        # distinguishes entry modes precisely so a CNP row never reads 'chip'.
        "pos_entry_mode": "chip" if present else "ecom",
        "is_3ds": 1 if is_subscription else 0,
        "terminal_id": f"TERM-{pa.fields['place'].upper()}-01" if present else "",
        "network_ref_number": f"NRN{pa.step:08d}",
    }


def _login_row(pa: ParsedAction, clock: ScenarioClock, ident: identity.Identity) -> Row:
    ip = places.IPS[pa.fields["ip"]]
    dev = places.DEVICES[pa.fields["device"]]
    ts = clock.ts_for(pa.step)
    return {
        "id": f"gen-login-{pa.step:05d}",
        "account_id": ident.account["id"],
        "timestamp": ts,
        "ip": ip.ip,
        "ip_country": ip.country,
        "ip_lat": ip.lat,
        "ip_lng": ip.lng,
        "device_fp": dev.fp,
        "user_agent": "concordia-gen/1.0",
        "outcome": pa.fields["outcome"],
        "two_fa_used": int(pa.fields["twofa"]),
        # Device + network intel (the detector and the device chips read these).
        # A registry first_seen of '' means the device is BORN at this event.
        "session_id": _session_id(pa),
        "ip_type": ip.ip_type,
        "ip_asn": ip.asn,
        "ip_reputation": ip.reputation,
        "device_trust": dev.trust,
        "device_first_seen_at": dev.first_seen or ts,
        "auth_method": "password+otp" if int(pa.fields["twofa"]) else "password",
    }


def _transfer_row(pa: ParsedAction, clock: ScenarioClock, ident: identity.Identity) -> Row:
    payee_key = pa.fields["payee"]
    places.PAYEES[payee_key]  # unknown payee raises KeyError -> the pipeline drops
    status = "sent" if pa.kind == "tamsinmere" else pa.fields["status"]
    return {
        "id": f"gen-tr-{pa.step:05d}",
        "account_id": ident.account["id"],
        "timestamp": clock.ts_for(pa.step),
        "amount": float(pa.fields["amount"]),
        "payee_id": f"gen-payee-{payee_key}",
        "rail": pa.kind,
        "status": status,
        "decline_reason": pa.fields.get("reason") if status == "blocked" else None,
        "session_id": _session_id(pa),
        "is_fraud": identity.is_fraud_for(pa.actor),
    }


def _account_event_row(pa: ParsedAction, clock: ScenarioClock, ident: identity.Identity) -> Row:
    row: Row = {
        "id": f"gen-ae-{pa.step:05d}",
        "account_id": ident.account["id"],
        "timestamp": clock.ts_for(pa.step),
        "kind": pa.kind,
        "field": None,
        "old_value": None,
        "new_value": None,
        "payee_id": None,
        "session_id": _session_id(pa),
        "is_fraud": identity.is_fraud_for(pa.actor),
    }
    if pa.kind == "profile_change":
        row["field"] = pa.fields["field"]
        row["old_value"] = pa.fields["old"]
        row["new_value"] = pa.fields["new"]
    else:  # payee_add
        payee_key = pa.fields["payee"]
        places.PAYEES[payee_key]  # unknown payee raises KeyError
        row["payee_id"] = f"gen-payee-{payee_key}"
    return row
