"""Platform-access scenario pack: console takeover, a minted API key, and a token-spend burst.

Thirty developer organisations on five continents use a fictional AI platform. Their people
sign in to the console from the office or from home on their own devices, and their API keys
run from each organisation's usual cloud region in business hours.

On Monday 2026-06-08 an email asks organisation admins to "confirm your billing contact" on
a look-alike console page. From 13:02 to 15:41 UTC one machine on one hosting network in
Amsterdam signs in to an admin seat at nine organisations and, within minutes and in the same
session, creates a new API key on each. From 22:00 UTC that night to 04:00 UTC the nine new
keys run from a second hosting network in Singapore at 32 to 58 times each organisation's
median hourly spend.

Two ordinary events look alike and are legitimate. An admin on a new laptop behind the company
VPN (a data-center address) creates a key five minutes after signing in. A planned batch job
on an old key, from that key's usual network, runs at about twelve times the median for three
hours.

The pack also carries the business's decisions, an export of its decisioning tool: nine KEY
TAKEOVER (revoke the minted key, expire the seat's console sessions, organisation not
suspended), each followed within a minute by the platform's revocation; the VPN admin PASSED;
the batch job WAITING on the organisation's confirmation. Each decision lists the events it
worked (`event_ids`): a takeover decision closes two, the key creation and the last hour of
that key's burst, because the two rules queue one each. Row timestamps are UTC; the notes give
times on the investigator's Houston clock, the zone the app shows every time in.

The incident rows are authored (TAKEOVERS and the constants beside it); the background comes
from one fixed-seed RNG, so the pack is a pure function of this module. Everything is
SYNTHETIC: the platform has no name, organisation names and domains are made up (`.example`),
device and key ids are made up, addresses and ASNs are documentation ranges (RFC 5737, RFC
5398), and the two prices are made up. It reflects no real provider's telemetry or rules. The
cities are real.

Usage: `python -m seed_platform` from backend/ writes data/platform-access/<kind>.json and the
empty pack DB data/platform-access.db (the registry requires a DB per pack; the rows live in
the files).
"""

from __future__ import annotations

import json
import logging
import random
import string
from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta, timezone
from pathlib import Path
from statistics import median
from typing import Any

from db import PROJECT_ROOT, init_db

Row = dict[str, Any]

DATA_DIR = PROJECT_ROOT / "data" / "platform-access"
DB_PATH = PROJECT_ROOT / "data" / "platform-access.db"
KINDS = ("org", "console_signin", "key_event", "usage", "decision")
SEED = 20260608

FIRST_DAY = date(2026, 6, 1)  # a Monday: one ordinary week before the incident
INCIDENT_DAY = date(2026, 6, 8)  # a Monday
DECISION_DAY = date(2026, 6, 9)
WINDOW_START = datetime.combine(FIRST_DAY, time(0), tzinfo=UTC)
BACKGROUND_END = datetime.combine(DECISION_DAY, time(14), tzinfo=UTC)  # the queue is worked next

# Made-up prices, USD per million tokens. They only make cost a function of the token counts.
IN_USD_PER_MTOK, OUT_USD_PER_MTOK = 2.50, 10.00

ID_CHARS = string.ascii_uppercase + string.digits
DOC_NETS = ("192.0.2", "198.51.100", "203.0.113")  # RFC 5737

# The attacker's machine and network: every takeover sign-in, nothing else.
ATTACK_DEVICE = "K7P2M9XQ4TLD"
ATTACK_ASN, ATTACK_CITY, ATTACK_COUNTRY = "AS64511 Hosting provider", "Amsterdam", "NL"
ATTACK_LAT, ATTACK_LNG = 52.3676, 4.9041
ATTACK_IPS = ("203.0.113.130", "203.0.113.131", "203.0.113.132", "203.0.113.133")
# Where the minted keys run from that night: a network no organisation uses.
BURST_ASN, BURST_CITY, BURST_COUNTRY = "AS64510 Hosting provider", "Singapore", "SG"
BURST_LAT, BURST_LNG = 1.3521, 103.8198
BURST_FIRST = datetime.combine(INCIDENT_DAY, time(22), tzinfo=UTC)
BURST_HOURS = 6
# The legitimate admin's company VPN: a data-center address, which is why the rule queues it.
VPN_ASN, VPN_IP = "AS64500 Corporate VPN", "192.0.2.200"
RESERVED_IPS = {*ATTACK_IPS, VPN_IP}

OFFICE_ASNS = ("AS65536 Business fibre", "AS65537 Business fibre", "AS65538 Metro ISP")
HOME_ASNS = ("AS65540 Home broadband", "AS65541 Home broadband", "AS65542 Home broadband")
# The cloud regions the organisations' own keys run from: (city, country, lat, lng, ASN).
CLOUD = {
    "na-east": ("Ashburn", "US", 39.0438, -77.4874, "AS64496 Cloud region"),
    "na-west": ("Portland", "US", 45.5152, -122.6784, "AS64497 Cloud region"),
    "eu": ("Frankfurt", "DE", 50.1109, 8.6821, "AS64498 Cloud region"),
    "ap": ("Mumbai", "IN", 19.0760, 72.8777, "AS64499 Cloud region"),
    "oc": ("Sydney", "AU", -33.8688, 151.2093, "AS64501 Cloud region"),
}

# The thirty organisations: made-up name, real city, country, lat, lng, hours ahead of UTC in
# June, the cloud region their keys run from. The order is the organisation index used below.
ORGS = (
    ("Varnholt Labs", "Austin", "US", 30.2672, -97.7431, -5, "na-east"),
    ("Pellowick Systems", "Seattle", "US", 47.6062, -122.3321, -7, "na-west"),
    ("Dunmarrow Analytics", "Denver", "US", 39.7392, -104.9903, -6, "na-west"),
    ("Quenby Robotics", "Boston", "US", 42.3601, -71.0589, -4, "na-east"),
    ("Halvering Data", "Atlanta", "US", 33.7490, -84.3880, -4, "na-east"),
    ("Ostwick Logic", "Chicago", "US", 41.8781, -87.6298, -5, "na-east"),
    ("Brannoch Compute", "Toronto", "CA", 43.6532, -79.3832, -4, "na-east"),
    ("Teviston AI", "Vancouver", "CA", 49.2827, -123.1207, -7, "na-west"),
    ("Mirelowe Software", "Mexico City", "MX", 19.4326, -99.1332, -6, "na-east"),
    ("Carrowby Health", "Sao Paulo", "BR", -23.5505, -46.6333, -3, "na-east"),
    ("Fenwarden Labs", "Buenos Aires", "AR", -34.6037, -58.3816, -3, "na-east"),
    ("Lindqvale Systems", "London", "GB", 51.5074, -0.1278, 1, "eu"),
    ("Sorrelby Analytics", "Manchester", "GB", 53.4808, -2.2426, 1, "eu"),
    ("Aldermoor Robotics", "Dublin", "IE", 53.3498, -6.2603, 1, "eu"),
    ("Tannoway Data", "Paris", "FR", 48.8566, 2.3522, 2, "eu"),
    ("Greyfenn Logic", "Berlin", "DE", 52.5200, 13.4050, 2, "eu"),
    ("Hartvale Compute", "Munich", "DE", 48.1351, 11.5820, 2, "eu"),
    ("Wexcombe AI", "Stockholm", "SE", 59.3293, 18.0686, 2, "eu"),
    ("Yarrowick Software", "Madrid", "ES", 40.4168, -3.7038, 2, "eu"),
    ("Corbenhall Labs", "Warsaw", "PL", 52.2297, 21.0122, 2, "eu"),
    ("Dellowmere Systems", "Tel Aviv", "IL", 32.0853, 34.7818, 3, "eu"),
    ("Eskerby Analytics", "Lagos", "NG", 6.5244, 3.3792, 1, "eu"),
    ("Fallowden Robotics", "Nairobi", "KE", -1.2921, 36.8219, 3, "eu"),
    ("Gantrivale Data", "Cape Town", "ZA", -33.9249, 18.4241, 2, "eu"),
    ("Holbrenne Logic", "Bengaluru", "IN", 12.9716, 77.5946, 5, "ap"),
    ("Inverwick Compute", "Jakarta", "ID", -6.2088, 106.8456, 7, "ap"),
    ("Jessamere AI", "Tokyo", "JP", 35.6762, 139.6503, 9, "ap"),
    ("Kelverton Software", "Seoul", "KR", 37.5665, 126.9780, 9, "ap"),
    ("Lowenby Labs", "Sydney", "AU", -33.8688, 151.2093, 10, "oc"),
    ("Marrowfield Systems", "Auckland", "NZ", -36.8509, 174.7645, 12, "oc"),
)

# The nine takeovers, in order: organisation index, the data-center sign-in and the key
# creation (UTC, 2026-06-08). The seat is the organisation's first (admin) seat.
TAKEOVERS = (
    (0, "13:02:11", "13:05:48"),
    (3, "13:19:40", "13:22:25"),
    (5, "13:37:02", "13:42:31"),
    (8, "13:58:26", "14:01:09"),
    (11, "14:16:53", "14:21:14"),
    (14, "14:35:07", "14:38:40"),
    (17, "14:52:30", "14:58:02"),
    (22, "15:21:18", "15:24:01"),
    (26, "15:41:05", "15:45:30"),
)

# The legitimate admin on a new laptop behind the company VPN: organisation index, sign-in.
VPN_ADMIN = (12, datetime(2026, 6, 3, 14, 10, 22, tzinfo=UTC), timedelta(minutes=5, seconds=4))
# Ordinary key rotations from the office on a device the seat already uses: organisation
# index, sign-in, time to the key.
ROTATIONS = (
    (6, datetime(2026, 6, 2, 15, 31, 9, tzinfo=UTC), timedelta(minutes=4, seconds=12)),
    (24, datetime(2026, 6, 5, 6, 12, 40, tzinfo=UTC), timedelta(minutes=7, seconds=30)),
)
# The planned batch job: organisation index, its long-lived key, the first of three hours.
BATCH_ORG, BATCH_CREDENTIAL = 20, "key-7QF2M9XA"
BATCH_FIRST, BATCH_HOURS = datetime(2026, 6, 4, 21, tzinfo=UTC), 3

# The business's decisioning tool, as exported: the investigator works the queue on Tuesday.
ACTOR = "investigator"
HOUSTON = timezone(timedelta(hours=-5), "CDT")  # the investigator's clock in June
FAIL_FIRST = datetime.combine(DECISION_DAY, time(14, 40), tzinfo=UTC)
FAIL_STEP = timedelta(seconds=210)  # nine FAILs, 14:40:00 to 15:08:00 UTC
REVOKE_LAG = timedelta(seconds=30)  # the platform acts on each FAIL half a minute later
PASS_AT = datetime.combine(DECISION_DAY, time(15, 20), tzinfo=UTC)
WAITING_AT = datetime.combine(DECISION_DAY, time(15, 24), tzinfo=UTC)

log = logging.getLogger("seed_platform")


def _iso(at: datetime) -> str:
    return at.astimezone(UTC).isoformat()


def _clock(ts: str, day: bool = True) -> str:
    """'Mon Jun 8, 8:02 AM CDT' (or '8:05 AM CDT'): a pack timestamp on the Houston clock."""
    at = datetime.fromisoformat(ts).astimezone(HOUSTON)
    clock = f"{at.hour % 12 or 12}:{at.minute:02d} {'AM' if at.hour < 12 else 'PM'} CDT"
    return f"{at:%a %b} {at.day}, {clock}" if day else clock


def _unique(make: Callable[[], str], taken: set[str]) -> str:
    while True:
        value = make()
        if value not in taken:
            taken.add(value)
            return value


def _cost(input_tokens: int, output_tokens: int) -> float:
    return round((input_tokens * IN_USD_PER_MTOK + output_tokens * OUT_USD_PER_MTOK) / 1e6, 2)


def _tokens_for(cost: float) -> tuple[int, int]:
    """Token counts whose cost is `cost` (to the cent, rounded down): 45% in, 55% out by cost."""
    return int(cost * 0.45 / IN_USD_PER_MTOK * 1e6), int(cost * 0.55 / OUT_USD_PER_MTOK * 1e6)


class _Pack:
    """One generation run: the seeded RNG and the values already handed out."""

    def __init__(self) -> None:
        self.rng = random.Random(SEED)
        self.ips = set(RESERVED_IPS)
        self.devices = {ATTACK_DEVICE}
        self.keys = {BATCH_CREDENTIAL}
        self.sessions: set[str] = set()
        self.ids: set[str] = set()

    def jitter(self, value: float, spread: float) -> float:
        return round(value + self.rng.uniform(-spread, spread), 4)

    def _token(self, length: int) -> str:
        return "".join(self.rng.choice(ID_CHARS) for _ in range(length))

    def device(self) -> str:
        return _unique(lambda: self._token(12), self.devices)

    def key(self) -> str:
        return _unique(lambda: f"key-{self._token(8)}", self.keys)

    def session(self) -> str:
        return _unique(lambda: f"cs-{self._token(10).lower()}", self.sessions)

    def ip(self) -> str:
        rng = self.rng
        return _unique(lambda: f"{rng.choice(DOC_NETS)}.{rng.randint(2, 254)}", self.ips)

    def orgs(self) -> list[Row]:
        """The thirty organisations with their private state: office, seats, keys."""
        rng = self.rng
        out = []
        for index, (name, city, country, lat, lng, offset, region) in enumerate(ORGS):
            org_id = _unique(lambda: f"org-{rng.randint(1000, 9999)}", self.ids)
            seats = []
            for _ in range(rng.randint(2, 4)):
                seats.append(
                    {
                        "seat_id": _unique(lambda: f"seat-{rng.randint(1000, 9999)}", self.ids),
                        "devices": [self.device() for _ in range(rng.randint(1, 2))],
                        "home": (self.jitter(lat, 0.08), self.jitter(lng, 0.08)),
                        "home_ip": self.ip(),
                        "home_asn": rng.choice(HOME_ASNS),
                    }
                )
            keys = [BATCH_CREDENTIAL] if index == BATCH_ORG else [self.key()]
            if rng.random() < 0.5:
                keys.append(self.key())
            scale = rng.uniform(4.0, 12.0)  # the organisation's typical cost per key-hour, USD
            out.append(
                {
                    "org_id": org_id,
                    "org_name": name,
                    "domain": f"{name.split()[0].lower()}.example",
                    "city": city,
                    "country": country,
                    "lat": self.jitter(lat, 0.02),
                    "lng": self.jitter(lng, 0.02),
                    "offset": offset,
                    "region": region,
                    "office_ip": self.ip(),
                    "office_asn": rng.choice(OFFICE_ASNS),
                    "seats": seats,
                    # Each key's own level stays within 2.5x of its siblings, so no ordinary
                    # hour comes near ten times the organisation's median.
                    "keys": {k: scale * rng.uniform(0.8, 2.0) for k in keys},
                    "plan": rng.choice(("team", "team", "enterprise")),
                }
            )
        return out

    def signin(self, org: Row, seat: Row, at: datetime, device: str, where: str) -> Row:
        """One console sign-in by `seat` from the office or from home."""
        if where == "office":
            place = (org["office_ip"], org["office_asn"], "business", org["lat"], org["lng"])
        else:
            place = (seat["home_ip"], seat["home_asn"], "residential", *seat["home"])
        ip, asn, ip_type, lat, lng = place
        return {
            "org_id": org["org_id"],
            "org_name": org["org_name"],
            "seat_id": seat["seat_id"],
            "timestamp": _iso(at),
            "session_id": self.session(),
            "device_id": device,
            "ip_address": ip,
            "ip_asn": asn,
            "ip_type": ip_type,
            "ip_country": org["country"],
            "auth_method": "password+otp",
            "lat": lat,
            "lng": lng,
        }

    def bucket(self, org: Row, credential_id: str, hour: datetime, cost: float) -> Row:
        """One hour of a key's ordinary traffic, from the organisation's cloud region."""
        city, country, lat, lng, asn = CLOUD[org["region"]]
        input_tokens, output_tokens = _tokens_for(cost)
        return {
            "org_id": org["org_id"],
            "org_name": org["org_name"],
            "credential_id": credential_id,
            "timestamp": _iso(hour),
            "requests": max(1, input_tokens // self.rng.randint(1400, 2600)),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "spend_usd": _cost(input_tokens, output_tokens),
            "ip_asn": asn,
            "ip_type": "datacenter",
            "ip_country": country,
            "lat": lat,
            "lng": lng,
        }


_SESSION_FIELDS = ("session_id", "device_id", "ip_address", "ip_asn", "ip_type", "ip_country")


def _key_created(org: Row, signin: Row, at: datetime, credential_id: str) -> Row:
    """A key created in `signin`'s session, recorded at the sign-in's place."""
    return {
        "org_id": org["org_id"],
        "org_name": org["org_name"],
        "seat_id": signin["seat_id"],
        "credential_id": credential_id,
        "event": "created",
        "actor": "seat",
        "timestamp": _iso(at),
        **{f: signin[f] for f in _SESSION_FIELDS},
        "lat": signin["lat"],
        "lng": signin["lng"],
    }


def _key_revoked(org: Row, seat_id: str, at: datetime, credential_id: str) -> Row:
    """The platform revoking a key: no session, no device, no address. Placed at the org."""
    return {
        "org_id": org["org_id"],
        "org_name": org["org_name"],
        "seat_id": seat_id,
        "credential_id": credential_id,
        "event": "revoked",
        "actor": "platform",
        "timestamp": _iso(at),
        **{f: None for f in _SESSION_FIELDS},
        "lat": org["lat"],
        "lng": org["lng"],
    }


def _local_days(org: Row) -> list[date]:
    """The local calendar days that can touch the window (a day either side covers every zone)."""
    first = FIRST_DAY - timedelta(days=1)
    return [first + timedelta(days=d) for d in range((DECISION_DAY - first).days + 2)]


def _utc(day: date, local: time, org: Row) -> datetime:
    return datetime.combine(day, local, tzinfo=UTC) - timedelta(hours=org["offset"])


def _in_background(at: datetime) -> bool:
    return WINDOW_START <= at < BACKGROUND_END


def _week_median(usage: list[Row], org_id: str, before: datetime) -> float:
    """The organisation's median hourly cost over the week before `before`."""
    values = [
        u["spend_usd"]
        for u in usage
        if u["org_id"] == org_id
        and before - timedelta(hours=168) <= datetime.fromisoformat(u["timestamp"]) < before
    ]
    return median(values)


def _numbered(prefix: str, rows: list[Row], width: int = 4, ts: str = "timestamp") -> list[Row]:
    """Rows in time order (ties by organisation, then credential or seat), each given an id in
    that order, id first. Every timestamp carries the one UTC offset, so the string order is the
    time order."""
    rows = sorted(
        rows,
        key=lambda r: (r[ts], r["org_id"], str(r.get("credential_id") or r.get("seat_id") or "")),
    )
    return [{"id": f"{prefix}-{i:0{width}d}", **r} for i, r in enumerate(rows, start=1)]


def _decision(
    org: Row, status: str, outcome: str, at: datetime, note: str, event_ids: list[str]
) -> Row:
    return {
        "org_id": org["org_id"],
        "event_ids": event_ids,
        "target_label": f"{org['org_name']} · {org['city']}, {org['country']}",
        "status": status,
        "outcome": outcome,
        "note": note,
        "decided_by": ACTOR,
        "decided_at": _iso(at),
        "lat": org["lat"],
        "lng": org["lng"],
    }


def _decisions(rows: dict[str, list[Row]], orgs: list[Row]) -> list[Row]:
    """One decision per case: the nine takeovers in order, the VPN admin, the batch job. A
    decision names every event it worked; the burst rule queues the last hour of a run."""
    by_id = {o["org_id"]: o for o in orgs}
    signin = {s["session_id"]: s for s in rows["console_signin"]}
    minted = [
        k for k in rows["key_event"] if k["event"] == "created" and k["device_id"] == ATTACK_DEVICE
    ]
    out = []
    for n, key in enumerate(minted):
        s = signin[key["session_id"]]
        burn = [u for u in rows["usage"] if u["credential_id"] == key["credential_id"]]
        total = round(sum(u["spend_usd"] for u in burn), 2)
        # The peak as the burst rule states it: each hour against the organisation's median
        # hour over the week before that hour, the burst itself left out.
        ordinary = [u for u in rows["usage"] if u["credential_id"] != key["credential_id"]]
        peak = max(
            u["spend_usd"]
            / _week_median(ordinary, key["org_id"], datetime.fromisoformat(u["timestamp"]))
            for u in burn
        )
        note = (
            f"Console takeover. New device {s['device_id']} on {s['ip_asn'].split()[0]} "
            f"({ATTACK_CITY} hosting) signed in to {key['seat_id']} at {_clock(s['timestamp'])}; "
            f"API key {key['credential_id']} created at {_clock(key['timestamp'], day=False)}. "
            f"From {_clock(burn[0]['timestamp'])} the key spent ${total:,.2f} in {len(burn)} hours "
            f"on {burn[0]['ip_asn'].split()[0]} ({BURST_CITY}), up to {peak:.0f} times the "
            f"organisation's median hour. Revoke {key['credential_id']} and expire the seat's "
            "console sessions. Organisation not suspended."
        )
        out.append(
            _decision(
                by_id[key["org_id"]],
                "FAIL",
                "KEY TAKEOVER",
                FAIL_FIRST + n * FAIL_STEP,
                note,
                [key["id"], burn[-1]["id"]],
            )
        )

    (vpn_key,) = [
        k for k in rows["key_event"] if k["event"] == "created" and k["ip_asn"] == VPN_ASN
    ]
    out.append(
        _decision(
            by_id[vpn_key["org_id"]],
            "PASS",
            "PASSED",
            PASS_AT,
            f"Admin confirmed by callback on the number on file: new laptop on the company VPN "
            f"({VPN_ASN.split()[0]}). Key {vpn_key['credential_id']} left active.",
            [vpn_key["id"]],
        )
    )

    batch = [
        u
        for u in rows["usage"]
        if u["credential_id"] == BATCH_CREDENTIAL
        and BATCH_FIRST
        <= datetime.fromisoformat(u["timestamp"])
        < BATCH_FIRST + timedelta(hours=BATCH_HOURS)
    ]
    batch_total = round(sum(u["spend_usd"] for u in batch), 2)
    out.append(
        _decision(
            by_id[batch[0]["org_id"]],
            "WAITING",
            "WAITING",
            WAITING_AT,
            f"Planned batch run reported by the organisation's on-call contact, not yet confirmed "
            f"by an admin. Key {BATCH_CREDENTIAL} spent ${batch_total:,.2f} in {len(batch)} hours "
            f"from {_clock(batch[0]['timestamp'])} on {batch[0]['ip_asn'].split()[0]}, the network "
            "it has used all week. Key left active.",
            [batch[-1]["id"]],
        )
    )
    return [
        {"id": f"dec-{i:04d}", **d}
        for i, d in enumerate(sorted(out, key=lambda d: d["decided_at"]), start=1)
    ]


def generate() -> dict[str, list[Row]]:
    """The pack's rows by kind, a pure function of this module."""
    gen = _Pack()
    rng = gen.rng
    orgs = gen.orgs()

    # Ordinary console use: most weekdays from the office in working hours, some evenings from
    # home, on the seat's own devices.
    signins: list[Row] = []
    for org in orgs:
        for seat in org["seats"]:
            for day in _local_days(org):
                weekday = day.weekday() < 5
                if weekday and rng.random() < 0.55:
                    local = time(rng.randint(8, 17), rng.randint(0, 59), rng.randint(0, 59))
                    at, where = _utc(day, local, org), "office"
                elif rng.random() < (0.2 if weekday else 0.08):
                    local = time(rng.randint(19, 22), rng.randint(0, 59), rng.randint(0, 59))
                    at, where = _utc(day, local, org), "home"
                else:
                    continue
                if _in_background(at):
                    signins.append(gen.signin(org, seat, at, rng.choice(seat["devices"]), where))

    # Ordinary API traffic: each key runs from the organisation's cloud region in local working
    # hours on weekdays, with a little weekend traffic.
    usage: list[Row] = []
    for org in orgs:
        for credential_id, level in org["keys"].items():
            hours: dict[datetime, float] = {}
            for day in _local_days(org):
                weekday = day.weekday() < 5
                for local_hour in range(8, 18):
                    if rng.random() >= (0.92 if weekday else 0.06):
                        continue
                    hour = _utc(day, time(local_hour), org)
                    midday = 1.0 - abs(local_hour - 13) / 12  # busiest after lunch
                    hours[hour] = round(level * midday * rng.uniform(0.75, 1.3), 2)
            usage += [
                gen.bucket(org, credential_id, hour, cost)
                for hour, cost in sorted(hours.items())
                if _in_background(hour)
            ]

    keys: list[Row] = []

    # Ordinary rotations: a known device on the office network, so the rule has nothing to say.
    for index, at, lag in ROTATIONS:
        org, seat = orgs[index], orgs[index]["seats"][0]
        device = seat["devices"][0]
        signins.append(gen.signin(org, seat, at - timedelta(days=1), device, "office"))
        s = gen.signin(org, seat, at, device, "office")
        signins.append(s)
        keys.append(_key_created(org, s, at + lag, gen.key()))

    # The legitimate admin: a new laptop on the company VPN, a key five minutes later, and
    # ordinary traffic on that key from the organisation's own region afterwards.
    vpn_index, vpn_at, vpn_lag = VPN_ADMIN
    org, seat = orgs[vpn_index], orgs[vpn_index]["seats"][0]
    s = gen.signin(org, seat, vpn_at, gen.device(), "office")
    s.update(ip_address=VPN_IP, ip_asn=VPN_ASN, ip_type="datacenter")
    signins.append(s)
    vpn_key = gen.key()
    keys.append(_key_created(org, s, vpn_at + vpn_lag, vpn_key))
    level = min(org["keys"].values()) * 0.5
    for day in (date(2026, 6, 4), date(2026, 6, 5), INCIDENT_DAY):
        for local_hour in (10, 11, 14, 15):
            hour = _utc(day, time(local_hour), org)
            usage.append(gen.bucket(org, vpn_key, hour, round(level * rng.uniform(0.8, 1.2), 2)))

    # The planned batch job: three hours on an old key, at about twelve times the organisation's
    # median hour, from the network that key always uses.
    org = orgs[BATCH_ORG]
    batch_base = _week_median(usage, org["org_id"], BATCH_FIRST)
    for h in range(BATCH_HOURS):
        hour = BATCH_FIRST + timedelta(hours=h)
        usage.append(
            gen.bucket(org, BATCH_CREDENTIAL, hour, round(batch_base * rng.uniform(11.6, 12.8), 2))
        )

    # The incident: one device, one hosting network, nine organisations; a key minted on each in
    # the same session; that night the nine keys burn from a second hosting network.
    for n, (index, signin_at, created_at) in enumerate(TAKEOVERS):
        org, seat = orgs[index], orgs[index]["seats"][0]
        at = datetime.combine(INCIDENT_DAY, time.fromisoformat(signin_at), tzinfo=UTC)
        s = gen.signin(org, seat, at, ATTACK_DEVICE, "office")
        s.update(
            ip_address=ATTACK_IPS[n % len(ATTACK_IPS)],
            ip_asn=ATTACK_ASN,
            ip_type="datacenter",
            ip_country=ATTACK_COUNTRY,
            lat=ATTACK_LAT,
            lng=ATTACK_LNG,
        )
        signins.append(s)
        minted = gen.key()
        created = datetime.combine(INCIDENT_DAY, time.fromisoformat(created_at), tzinfo=UTC)
        keys.append(_key_created(org, s, created, minted))
        keys.append(
            _key_revoked(org, seat["seat_id"], FAIL_FIRST + n * FAIL_STEP + REVOKE_LAG, minted)
        )

        baseline = _week_median(usage, org["org_id"], BURST_FIRST)
        for h in range(BURST_HOURS):
            input_tokens, output_tokens = _tokens_for(baseline * rng.uniform(32.0, 58.0))
            usage.append(
                {
                    "org_id": org["org_id"],
                    "org_name": org["org_name"],
                    "credential_id": minted,
                    "timestamp": _iso(BURST_FIRST + timedelta(hours=h)),
                    "requests": max(1, input_tokens // rng.randint(1800, 2400)),
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "spend_usd": _cost(input_tokens, output_tokens),
                    "ip_asn": BURST_ASN,
                    "ip_type": "datacenter",
                    "ip_country": BURST_COUNTRY,
                    "lat": BURST_LAT,
                    "lng": BURST_LNG,
                }
            )

    rows: dict[str, list[Row]] = {
        "org": [
            {
                "id": o["org_id"],
                "org_id": o["org_id"],
                "org_name": o["org_name"],
                "domain": o["domain"],
                "city": o["city"],
                "country": o["country"],
                "lat": o["lat"],
                "lng": o["lng"],
                "seats": len(o["seats"]),
                "plan": o["plan"],
            }
            for o in sorted(orgs, key=lambda o: o["org_id"])
        ],
        "console_signin": _numbered("si", signins),
        "key_event": _numbered("ke", keys),
        "usage": _numbered("us", usage, width=5),
    }
    rows["decision"] = _decisions(rows, orgs)
    return rows


def write(data_dir: Path = DATA_DIR, db_path: Path = DB_PATH) -> list[Path]:
    """Write one JSON file per kind and the empty pack DB. Rerunning replaces them."""
    data = generate()
    data_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for kind in KINDS:
        path = data_dir / f"{kind}.json"
        path.write_text(json.dumps(data[kind], indent=1) + "\n", encoding="utf-8", newline="\n")
        paths.append(path)
    db_path.unlink(missing_ok=True)
    init_db(db_path)
    return [*paths, db_path]


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    for path in write():
        log.info("wrote %s", path)


if __name__ == "__main__":
    main()
