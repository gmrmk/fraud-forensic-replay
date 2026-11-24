# backend/generators/concordia/sim/scripted.py
"""Deterministically authored readback for the Priya account-takeover scenario.

The ATO signature is a fixed, known thing by design, and the project bans
random fraud data; a stochastic 4B model could not reliably author
the load-bearing causal ordering across four rolls. So the
scenario is hand-authored here, the same fidelity tier as Marcus's seed.py rows,
and flows through the SAME parse -> translate -> validate -> write pack chain as a
live roll would. Nothing is mocked: real ACT lines over the canonical Priya
identity using the canonical registry coordinates.

2026-06-10 realism program: the pack is a 30-DAY baseline-plus-kill-chain, not a
36-minute sketch. The baseline is a fixed weekly schedule derived from PROFILES
Customer B (coffee 5x/week, Nevgate commutes, groceries, restaurants, subscriptions
on fixed days, ~10 Tamsinmere transfers with a ~$50 median) - research-grounded density (the
Sparkov urban-female profile generates 1-6 txns/day; an active mobile banker logs
in near-daily). No PRNG anywhere: amount texture is fixed arithmetic on (day,
slot), so the pack is byte-identical every run.

The kill chain expresses the FULL canon signature with realistic spacing: the
last precursor is the real $47 Tamsinmere to Jamie K. (Day 25, the phish's hook); the
phish itself is bank-unobservable and lives in the manifest annotations, not a
row; ~48h of silence later the attacker logs in CLEAN (challenge_passed with the
phished OTP - Google's 350k-hijacking study: SMS challenges stop as few as 10% of
phishing-rooted takeovers; the never-seen device is the tell) from a Frankfurt
datacenter exit, then email change (+7 min), payee add (+9 min), a $4,200 wire
(+13 min), and a $3,800 wire 30 minutes later that ships BLOCKED with
decline_reason=velocity_rule (authored data, replayed not recomputed). Baseline
coffee continues on Days 28-29: the customer has not noticed yet.

The clock for this scenario is minute-resolution (step = minutes since window
start, 2026-04-27T00:00:00-05:00, a Monday); cli.py pins it. Import-light on
purpose (registries + identity only, no concordia/torch) so the fast suite
covers it, and registry-derived so a key rename breaks at import."""

from __future__ import annotations

from ..identity import FRAUDSTER, VICTIM
from ..places import DEVICES, IPS, PAYEES, PLACES

# The minute-resolution scenario clock contract (cli.py constructs the matching
# ScenarioClock; test_priya_ato_pack asserts against it).
WINDOW_START = "2026-04-27T00:00:00-05:00"  # a Monday
WINDOW_DAYS = 30
STEP_MINUTES = 1

_TAKEOVER_SESSION = "sess-takeover"


def _at(day: int, hh: int, mm: int) -> int:
    """Minutes since window start for day-of-window + wall time."""
    return day * 1440 + hh * 60 + mm


def _weekday(day: int) -> int:
    """0=Mon .. 6=Sun. Day 0 (2026-04-27) is a Monday."""
    return day % 7


def _texture(day: int, slot: int, base: float, spread: float) -> float:
    """Deterministic cents-level variation - no PRNG, byte-identical packs."""
    return round(base + ((day * 7 + slot * 3) % int(spread * 100)) / 100.0, 2)


def _victim(step: int, value: str) -> dict:
    return {"step": step, "entity_name": VICTIM, "value": value}


def _fraudster(step: int, value: str) -> dict:
    return {"step": step, "entity_name": FRAUDSTER, "value": value}


def _purchase(step: int, place: str, mcc: str, amount: float, present: int) -> dict:
    return _victim(step, f"ACT purchase place={place} mcc={mcc} amount={amount} present={present}")


def _login_phone(step: int) -> dict:
    return _victim(
        step, "ACT login ip=residential_houston device=priya_phone outcome=success twofa=1"
    )


def _login_laptop(step: int) -> dict:
    return _victim(
        step, "ACT login ip=residential_houston device=priya_laptop outcome=success twofa=1"
    )


def _tamsinmere(step: int, payee: str, amount: float) -> dict:
    return _victim(step, f"ACT tamsinmere payee={payee} amount={amount}")


def _baseline(day: int) -> list[dict]:
    """One day of Priya's PROFILES rhythm. Weekday: phone login, coffee, Nevgate
    commute pair. Weekly anchors: Wed Lathemere Cafe + Gormvale Provisions; Sun Fiskhaven Market
    + laptop session; Fri/Sat dinners; Sat pharmacy."""
    wd = _weekday(day)
    out: list[dict] = []
    if wd <= 4:  # Mon-Fri
        out.append(_login_phone(_at(day, 7, 32)))
        if wd == 2:  # Wednesday: EaDo coffee near the office
            out.append(
                _purchase(
                    _at(day, 8, 5), "coffee_lathemere", "5814", _texture(day, 1, 6.25, 2.5), 1
                )
            )
        else:
            out.append(
                _purchase(_at(day, 7, 45), "coffee_houston", "5814", _texture(day, 0, 5.75, 2.0), 1)
            )
        out.append(
            _purchase(_at(day, 8, 35), "rideshare_nevgate", "4121", _texture(day, 2, 11.50, 6.0), 0)
        )
        out.append(
            _purchase(
                _at(day, 17, 55), "rideshare_nevgate", "4121", _texture(day, 3, 12.25, 7.0), 0
            )
        )
    if wd == 2:  # Wednesday evening Gormvale Provisions
        out.append(
            _purchase(_at(day, 18, 35), "grocery_gormvale", "5411", _texture(day, 4, 28.0, 14.0), 1)
        )
    if wd == 4:  # Friday dinner
        out.append(
            _purchase(
                _at(day, 19, 45),
                "rest_ivesford" if day % 2 else "rest_mottbrook",
                "5812",
                _texture(day, 5, 52.0, 38.0),
                1,
            )
        )
    if wd == 5:  # Saturday: pharmacy errand + dinner out
        out.append(
            _purchase(
                _at(day, 16, 20), "pharmacy_montrose", "5912", _texture(day, 6, 14.0, 18.0), 1
            )
        )
        out.append(
            _purchase(
                _at(day, 20, 10),
                "rest_rhodesvane" if day % 2 else "rest_mottbrook",
                "5812",
                _texture(day, 7, 68.0, 42.0),
                1,
            )
        )
    if wd == 6:  # Sunday: Fiskhaven Market + a laptop banking session
        out.append(
            _purchase(_at(day, 11, 5), "grocery_fiskhaven", "5411", _texture(day, 8, 76.0, 19.0), 1)
        )
        out.append(_login_laptop(_at(day, 20, 30)))
    return out


# Subscriptions land on fixed calendar days (all fall in May; window day 0 is
# Apr 27, so May N = day N+3). pos_entry_mode=ecom + is_3ds derive from the
# registry category at translate time.
_SUBSCRIPTIONS: list[tuple[int, str, str, float]] = [
    (6, "sub_tonequay", "5815", 11.99),  # May 3
    (10, "sub_kestvale", "5815", 15.49),  # May 7
    (15, "sub_verrhaven", "5817", 54.99),  # May 12
    (18, "sub_lornmere", "5817", 15.00),  # May 15
    (21, "sub_marrowpad", "5817", 10.00),  # May 18
    (24, "sub_wrendene", "5815", 49.00),  # May 21
]

# ~10 Tamsinmere transfers across the month, $50-ish median (the wire must violate THIS
# baseline). Day 25 21:14 / jamie_k / $47 is canon: the spear-phish references it.
_TAMSINMERE_TRANSFERS: list[tuple[int, int, int, str, float]] = [
    (2, 19, 40, "alex_t", 22.50),
    (4, 12, 15, "maria_s", 90.00),  # the cleaner, biweekly
    (7, 21, 5, "jamie_k", 31.00),
    (9, 13, 30, "alex_t", 18.75),
    (12, 20, 50, "jamie_k", 64.00),
    (16, 11, 25, "alex_t", 45.00),
    (18, 12, 15, "maria_s", 90.00),
    (21, 19, 5, "alex_t", 27.50),
    (25, 21, 14, "jamie_k", 47.00),  # THE hook (PROFILES canon)
    (27, 10, 40, "maria_s", 35.00),
]

# Pilates membership, monthly recurring, card-on-file (May 1 = day 4).
_PILATES: tuple[int, str, str, float] = (4, "pilates_montrose", "7997", 120.00)


def _kill_chain() -> list[dict]:
    """Day 28 (Monday May 25): the takeover, one session thread, canon spacing.
    The login is CLEAN - challenge_passed, twofa=1 (the OTP was phished with the
    credentials); the signal is the never-seen device on a datacenter exit."""
    d = 28
    return [
        _fraudster(
            _at(d, 10, 7),
            "ACT login ip=vpn_us device=unknown outcome=challenge_passed twofa=1 "
            f"session={_TAKEOVER_SESSION}",
        ),
        _fraudster(
            _at(d, 10, 14),
            "ACT profile_change field=email old=priya.patel@tealmoor.example "
            f"new=p.patel.recovery@sentrypine.example session={_TAKEOVER_SESSION}",
        ),
        _fraudster(
            _at(d, 10, 23),
            f"ACT payee_add payee=daniel_reyes session={_TAKEOVER_SESSION}",
        ),
        _fraudster(
            _at(d, 10, 36),
            f"ACT wire payee=daniel_reyes amount=4200 status=sent session={_TAKEOVER_SESSION}",
        ),
        _fraudster(
            _at(d, 11, 6),
            "ACT wire payee=daniel_reyes amount=3800 status=blocked reason=velocity_rule "
            f"session={_TAKEOVER_SESSION}",
        ),
    ]


def build_priya_readback() -> list[dict]:
    items: list[dict] = []
    for day in range(WINDOW_DAYS):
        items.extend(_baseline(day))
    for day, place, mcc, amount in _SUBSCRIPTIONS:
        items.append(_purchase(_at(day, 6, 2), place, mcc, amount, 0))
    day, place, mcc, amount = _PILATES
    items.append(_purchase(_at(day, 8, 0), place, mcc, amount, 0))
    for day, hh, mm, payee, amount in _TAMSINMERE_TRANSFERS:
        items.append(_tamsinmere(_at(day, hh, mm), payee, amount))
    items.extend(_kill_chain())
    items.sort(key=lambda i: i["step"])
    return items


PRIYA_ATO_READBACK: list[dict] = build_priya_readback()

# Drift guards: every registry key the readback names must still exist (a rename
# in places.py breaks the pack here, at import, instead of silently dropping
# rows), and the fire-once invariants hold by construction.
_USED_PLACES = {
    "coffee_houston",
    "coffee_lathemere",
    "grocery_fiskhaven",
    "grocery_gormvale",
    "rest_ivesford",
    "rest_mottbrook",
    "rest_rhodesvane",
    "pilates_montrose",
    "pharmacy_montrose",
    "rideshare_nevgate",
    "sub_tonequay",
    "sub_kestvale",
    "sub_verrhaven",
    "sub_lornmere",
    "sub_marrowpad",
    "sub_wrendene",
}
_USED_IPS = {"residential_houston", "vpn_us"}
_USED_DEVICES = {"priya_phone", "priya_laptop", "unknown"}
_USED_PAYEES = {"jamie_k", "maria_s", "alex_t", "daniel_reyes"}
for _key in _USED_PLACES:
    assert _key in PLACES, f"scripted readback names a missing place: {_key!r}"
for _key in _USED_IPS:
    assert _key in IPS, f"scripted readback names a missing ip: {_key!r}"
for _key in _USED_DEVICES:
    assert _key in DEVICES, f"scripted readback names a missing device: {_key!r}"
for _key in _USED_PAYEES:
    assert _key in PAYEES, f"scripted readback names a missing payee: {_key!r}"
# The takeover fires only because its device reads as NEW vs the baseline, and
# trusted devices must predate the window so their first row never reads new.
assert DEVICES["priya_phone"].fp != DEVICES["unknown"].fp
assert DEVICES["priya_phone"].first_seen != "" and DEVICES["priya_laptop"].first_seen != ""
assert DEVICES["unknown"].first_seen == ""
