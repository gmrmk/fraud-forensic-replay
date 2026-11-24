# backend/generators/concordia/sim/prompts.py
"""Agent prompt vocabulary, DERIVED from the deterministic registries so the
prompt, the parser, and the translators can never drift apart (a live roll
invented `store_houston` and the translator dropped it - the registry is the
single source of truth, the prompt must quote it). Import-light on purpose
(registries only, no concordia/torch) so the fast suite covers it."""

from __future__ import annotations

from ..places import DEVICES, IPS, PLACES

_PLACE_IDS = "|".join(PLACES)
_IP_IDS = "|".join(IPS)
_DEVICE_IDS = "|".join(DEVICES)
_OUTCOMES = "success|failed|challenge_required|challenge_passed|challenge_failed"

_US_PLACES = ", ".join(pid for pid, p in PLACES.items() if p.country == "US")
_NG_PLACES = ", ".join(pid for pid, p in PLACES.items() if p.country == "NG")
_US_IP = next(ip_id for ip_id, ip in IPS.items() if ip.country == "US")
_NG_IP = next(ip_id for ip_id, ip in IPS.items() if ip.country == "NG")

FORMAT = (
    "On your turn emit EXACTLY one line and nothing else, in one of these formats:\n"
    f"  ACT purchase place=<{_PLACE_IDS}> mcc=<4 digits> amount=<dollars> present=<0|1>\n"
    f"  ACT login ip=<{_IP_IDS}> device=<{_DEVICE_IDS}> outcome=<{_OUTCOMES}> twofa=<0|1>\n"
    "The line MUST start with the word ACT. place and ip MUST be copied EXACTLY "
    "from the lists above. Never invent a place, ip, device, or action kind."
)

VICTIM_GOAL = (
    "You are Dana, an ordinary Houston cardholder going about a normal day of "
    f"small local purchases and occasional logins. Your places: {_US_PLACES}. "
    f"Your logins use ip={_US_IP} device=known. Checking on, contacting, or "
    "reporting anything to your bank online is an ACT login line. " + FORMAT
)

FRAUDSTER_GOAL = (
    "You have cloned Dana's card and are cashing it out in Lagos as fast as you "
    f"can before it is blocked. Your places: {_NG_PLACES}. If you log in to the "
    f"account: ip={_NG_IP} device=unknown. " + FORMAT
)

PREMISE = (
    "A card-fraud scenario. Dana shops normally in Houston while, the same "
    "morning, a fraudster uses a clone of her card in Lagos. Each actor takes "
    "turns; every action MUST be a single ACT line in the prescribed format."
)

# The Priya account-takeover goals that once lived here are gone on purpose. Four
# live rolls showed a 4B model cannot reliably author that scenario's load-bearing
# ordering, and each iteration ratcheted the prompt toward coercion ("EXACTLY this
# line", "her account cannot stop you") - pressure-prompting a model into a job it
# cannot do. The signature is deterministic by design, so priya-ato
# is now AUTHORED (sim/scripted.py) and the sim is not asked at all.
