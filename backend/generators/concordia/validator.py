# backend/generators/concordia/validator.py
"""Hard validation of a translated row against the schema's CHECK enums, coord
ranges, ISO timestamps, flag domains, and required fields. A row that would not
insert (or would insert nonsense) raises ValidationError -> the pipeline drops it
and logs. Mirrors schema.sql + migrations; nothing is papered over."""

from __future__ import annotations

from datetime import datetime

OUTCOME_ENUM = {"success", "challenge_required", "challenge_passed", "challenge_failed", "failed"}

_TX_REQUIRED = (
    "id",
    "card_id",
    "account_id",
    "timestamp",
    "amount",
    "merchant_name",
    "merchant_lat",
    "merchant_lng",
    "merchant_country",
    "mcc",
    "category",
    "is_card_present",
    "is_fraud",
    "balance_after",
)
_LOGIN_REQUIRED = (
    "id",
    "account_id",
    "timestamp",
    "ip",
    "ip_country",
    "ip_lat",
    "ip_lng",
    "device_fp",
    "user_agent",
    "outcome",
    "two_fa_used",
)
_TRANSFER_REQUIRED = (
    "id",
    "account_id",
    "timestamp",
    "amount",
    "payee_id",
    "rail",
    "status",
    "session_id",
    "is_fraud",
)
_ACCOUNT_EVENT_REQUIRED = (
    "id",
    "account_id",
    "timestamp",
    "kind",
    "session_id",
    "is_fraud",
)
RAIL_ENUM = {"tamsinmere", "wire"}
TRANSFER_STATUS_ENUM = {"sent", "blocked"}
ACCOUNT_EVENT_KIND_ENUM = {"profile_change", "payee_add"}


class ValidationError(ValueError):
    """A translated row violates the schema contract."""


def _require(table: str, row: dict[str, object], keys: tuple[str, ...]) -> None:
    missing = [k for k in keys if k not in row]
    if missing:
        raise ValidationError(f"{table} row missing required fields: {missing}")


def _check_ts(row: dict[str, object]) -> None:
    try:
        datetime.fromisoformat(str(row["timestamp"]))
    except ValueError as e:
        raise ValidationError(f"bad timestamp {row['timestamp']!r}") from e


def _check_coords(row: dict[str, object], lat_key: str, lng_key: str) -> None:
    lat, lng = float(row[lat_key]), float(row[lng_key])  # type: ignore[arg-type]
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        raise ValidationError(f"coord out of range: {lat},{lng}")


def validate_row(table: str, row: dict[str, object]) -> None:
    if table == "transactions":
        _require(table, row, _TX_REQUIRED)
        _check_ts(row)
        _check_coords(row, "merchant_lat", "merchant_lng")
        if not (float(row["amount"]) > 0):  # type: ignore[arg-type]
            raise ValidationError(f"amount must be > 0: {row['amount']!r}")
        if row["is_card_present"] not in (0, 1):
            raise ValidationError(f"is_card_present must be 0/1: {row['is_card_present']!r}")
        if row["is_fraud"] not in (0, 1):
            raise ValidationError(f"is_fraud must be 0/1: {row['is_fraud']!r}")
        if not str(row["mcc"]).isdigit():
            raise ValidationError(f"mcc must be digits: {row['mcc']!r}")
    elif table == "login_events":
        _require(table, row, _LOGIN_REQUIRED)
        _check_ts(row)
        _check_coords(row, "ip_lat", "ip_lng")
        if row["outcome"] not in OUTCOME_ENUM:
            raise ValidationError(f"outcome not in schema enum: {row['outcome']!r}")
        if row["two_fa_used"] not in (0, 1):
            raise ValidationError(f"two_fa_used must be 0/1: {row['two_fa_used']!r}")
    elif table == "transfers":
        _require(table, row, _TRANSFER_REQUIRED)
        _check_ts(row)
        if not (float(row["amount"]) > 0):  # type: ignore[arg-type]
            raise ValidationError(f"amount must be > 0: {row['amount']!r}")
        if row["rail"] not in RAIL_ENUM:
            raise ValidationError(f"rail not in schema enum: {row['rail']!r}")
        if row["status"] not in TRANSFER_STATUS_ENUM:
            raise ValidationError(f"status not in schema enum: {row['status']!r}")
        if row["status"] == "blocked" and not row.get("decline_reason"):
            raise ValidationError("a blocked transfer must carry its decline_reason")
        if row["is_fraud"] not in (0, 1):
            raise ValidationError(f"is_fraud must be 0/1: {row['is_fraud']!r}")
    elif table == "account_events":
        _require(table, row, _ACCOUNT_EVENT_REQUIRED)
        _check_ts(row)
        if row["kind"] not in ACCOUNT_EVENT_KIND_ENUM:
            raise ValidationError(f"account_event kind not in schema enum: {row['kind']!r}")
        if row["kind"] == "profile_change" and not (
            row.get("field") and row.get("old_value") and row.get("new_value")
        ):
            raise ValidationError("profile_change requires field, old_value, new_value")
        if row["kind"] == "payee_add" and not row.get("payee_id"):
            raise ValidationError("payee_add requires payee_id")
        if row["is_fraud"] not in (0, 1):
            raise ValidationError(f"is_fraud must be 0/1: {row['is_fraud']!r}")
    else:
        raise ValidationError(f"no validator for table {table!r}")
