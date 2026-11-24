"""The card number guard for custom notes: the backend twin of the page's lib/notes/guard.ts.

One rule, pinned by tests/note_vectors.json (the page's tests read the same file) and by ONE digit
and format table, tests/note_digit_table.json, which both guards read so that they cannot drift.

THE RULE
 1. Flatten: text joined across marks; paragraphs, list items, quote paragraphs and hard breaks
    joined by one line feed. Then NFKC, then drop the format characters (Cf) of the table.
 2. A digit is any code point the table lists as a decimal digit. The guard never asks the
    runtime (Python 3.12 knows Unicode 15.0, the table was made from 16.0).
 3. A run is the longest digit sequence with at most 3 separator characters in a row between
    digits. EVERY CHARACTER WITH THE UNICODE PROPERTY White_Space IS A SEPARATOR (six of them
    ended a run before this was so). After NFKC the separators
    are the 19 code points of SEPARATORS: space, tab, line feed, vertical tab, form feed, carriage
    return, next line (U+0085), no-break space, Ogham space mark (U+1680), line separator
    (U+2028), paragraph separator (U+2029) and the hyphen-minus, U+2010 to U+2015 and U+2212,
    which are separators though they are not white space. The other 14 members of the property
    (U+2000 to U+200A, U+202F, U+205F, U+3000) NFKC turns into a plain space. The page's guard
    holds the same set, and the shared vectors pin it (separator_vectors). Any other character
    ends a run. A GROUP is a maximal sequence of digits inside a run, with no separator in it.
 4. THE ORIGINAL RULE, unchanged: a run is refused when the whole run holds 13 to 19 digits in
    total and passes the Luhn check, whatever the digits are.
 5. THE NARROWED RULE: a run is also refused when a SPAN of whole
    consecutive groups of it, 13 to 19 digits in total, meets all three of these: (a) its digits
    pass the Luhn check; (b) it is a brand's number: its leading digits fall in an issuer prefix of
    one row of BRAND_TABLE and its length is one that same row uses; (c) it has an ACCEPTED
    LAYOUT, which is a card's layout or one slip from one (the layout test, below). The brand and
    layout tests use only the span's own digits and group sizes. A group of more than 19 digits
    is never part of a span and is judged by nothing.
    This refuses an ordinary card line: a number of a brand in the table, written the way cards
    are written, with its expiry, its security code, a time or a count beside it.
 6. THE LAYOUT TEST (it cures the spacing slip). Let sizes be
    the span's group sizes in order and L their sum (13 to 19). A CARD'S LAYOUT is: one single
    group; or every group 4 digits but the last, which holds 1 to 4 (4-4-4-1 to 4-4-4-4 and
    4-4-4-4-1 to 4-4-4-4-3); or exactly 4-6-5; or exactly 4-6-4. The span has an accepted layout
    when sizes is a card's layout of the same L, or is one made from such a layout by ONE slip:
    a stray extra space (one group split in two, every part 1 digit or more: 4-4-4-3-1); a
    missing space (two neighbouring groups joined: 8-4-4); or one boundary moved by one digit
    (both groups stay at 1 digit or more: 3-5-4-4, or 4-5-6 from 4-6-5). A contiguous number with
    one space in it is the stray space of the single group, so any two groups that add up to L
    pass. The accepted layouts are built per L at import (ACCEPTED_LAYOUTS; 31, 50, 53, 38, 41, 44
    and 46 layouts for L = 13 to 19) and the shared vectors pin the exact lists. Two slips in one
    number are two slips from every card layout and are not accepted.

WHY IT WAS NARROWED. The earlier strict rule refused a run when ANY span of
whole groups of 13 to 19 digits passed Luhn, and when a group over 19 digits held such a number at
its first or its last digit. Over 234,000 generated lines of 26 kinds of the things a person types
in a note it newly refused 31,544 honest notes of bare numbers set side by side (a phone number
then a date, a date range and a count, two Unix times, a string of 20 or more digits...). The rule was
narrowed, accepting that some card lines with an expiry beside them can pass again.
The narrowed rule newly refused 256 of those lines (0.11 percent).

WHY THE LAYOUT TEST WIDENED. A skeptic found that a card number with ONE slip in its spacing and
an expiry, a code or a count beside it passed about 3 times in 4 for all eight brands. The number
alone was still refused by the original rule. The layout test of rule 6 cures the spacing slip
(chosen from three measured candidates). After
it none of 26,418 single slip lines passes. The cost over the same 234,000 honest lines: 333 more
lines refused than the narrowed rule (0.14 percent), 320 of them a UK style phone number beside a
date (3.56 percent of that kind, a five group span of 2-2-4-4-4 or 4-4-4-2-2 that passes Luhn
about 1 time in 10), 589 more than the original rule (0.25 percent).

TYPING is the page's rule (lib/notes/guard.ts), not this file's: this file judges every run as
closed, as the page does for Save, a paste and a drop. The page counts a run that ends at the
caret as open; a span of an open run (the whole run is one) is open only when it ends at the run's
last digit, and a span that ends earlier cannot change by typing at the caret and counts as
closed. The brand and layout tests add no open state: they read only the span itself, so a
slipped number typed digit by digit is open until a separator or a character after the caret
closes its run.

WHAT IT DOES NOT CATCH (each is pinned by a vector that expects "allowed" and carries the limit
flag):
 - two slips in one number (two moved boundaries such as 3-5-3-5, or a stray space plus a moved
   boundary), or any layout further from a card's layout (pairs of 2), with other digits beside
   it: the layout test stops one slip (about 72
   percent of two slip lines still pass, 98 percent of those two slips from every card layout);
   the number alone is still refused by the original rule, in every layout;
 - a number of a brand outside the table, or whose length is not one its prefix's row uses, with
   other digits beside it (a card line with a prefix the table does not hold, such as Maestro UK,
   a Diners Club number with a 30 prefix outside 300 to 305, a 15 digit number that starts with 4);
 - digits written straight on to a number with no separator in one group of more than 19 digits
   (a card number then 4 or more digits glued to it);
and the limits that stood before: groups split by a full stop, slash, underscore, comma or colon;
four or more separator characters in a row between groups, of any kind and in any mix (spaces,
tabs, line feeds, hyphens, any white space character); a first group in parentheses; reversed
digits or digits in words; a number split across two notes; a 13 digit number held in the note's
`time`; digits run on to a number with no separator when the group stays 19 digits or fewer and
fails the check as a whole (a card number with a 1 to 3 digit code written straight after it).
It still refuses some non-cards: a lone 13 digit Unix time or a date range that passes Luhn (the
original rule), a 16 digit time with a count beside it that has a brand prefix, and since the
cure of the spacing slip a UK style phone number beside a date (a five group span one stray space
from 4-4-4-4 that passes Luhn and starts with the Visa prefix 44), a pair of phone numbers or a
list of small counts that happen to make such a span. It catches a number typed by mistake. It
does not stop a person set on hiding one.

A refusal is a bool. Nothing here returns, raises or logs the text it judged.
"""

from __future__ import annotations

import json
import unicodedata
from bisect import bisect_right
from collections.abc import Sequence
from pathlib import Path
from typing import Any

DIGIT_TABLE_PATH = Path(__file__).resolve().parent / "tests" / "note_digit_table.json"

_MAX_SEPARATORS = 3
_MIN_DIGITS = 13
_MAX_DIGITS = 19

# THE BRAND TABLE (rule 5): per brand the issuer prefix ranges as (digits in the prefix, lowest,
# highest) and the lengths the same row uses. Checked 2026-11-19 against the issuer identification
# number table of https://en.wikipedia.org/wiki/Payment_card_number. The page's guard holds the same
# rows, and the shared vectors pin the first and last prefix of every range and the prefix just
# outside it. Diners Club is held at 300 to 305 (the article says 30); Maestro lengths start at 13
# (the article says 12, which a span of 13 or more digits can never have); Maestro UK is not held.
BRAND_TABLE: tuple[tuple[str, tuple[tuple[int, int, int], ...], tuple[int, ...]], ...] = (
    ("Visa", ((1, 4, 4),), (13, 16, 19)),
    ("Mastercard", ((2, 51, 55), (4, 2221, 2720)), (16,)),
    ("American Express", ((2, 34, 34), (2, 37, 37)), (15,)),
    ("Discover", ((4, 6011, 6011), (3, 644, 649), (2, 65, 65)), (16, 17, 18, 19)),
    ("JCB", ((4, 3528, 3589),), (16, 17, 18, 19)),
    (
        "Diners Club",
        ((3, 300, 305), (2, 36, 36), (2, 38, 38), (2, 39, 39)),
        (14, 15, 16, 17, 18, 19),
    ),
    ("UnionPay", ((2, 62, 62),), (16, 17, 18, 19)),
    (
        "Maestro",
        (
            (4, 5018, 5018),
            (4, 5020, 5020),
            (4, 5038, 5038),
            (4, 5893, 5893),
            (4, 6304, 6304),
            (4, 6759, 6759),
            (4, 6761, 6761),
            (4, 6762, 6762),
            (4, 6763, 6763),
        ),
        (13, 14, 15, 16, 17, 18, 19),
    ),
)


def _load_table() -> tuple[str, dict[int, int], list[int], list[int]]:
    raw = json.loads(DIGIT_TABLE_PATH.read_text(encoding="utf-8"))
    digits: dict[int, int] = {}
    for zero in raw["digit_zeros"]:
        for d in range(10):
            digits[zero + d] = d
    ranges = sorted((a, b) for a, b in raw["format_ranges"])
    return raw["unicode_version"], digits, [a for a, _ in ranges], [b for _, b in ranges]


UNICODE_VERSION, _DIGITS, _FORMAT_STARTS, _FORMAT_ENDS = _load_table()


def digit_value(cp: int) -> int:
    """The decimal value of a code point, or -1 when the table does not list it as a digit."""
    return _DIGITS.get(cp, -1)


def is_format_cp(cp: int) -> bool:
    """True for a Unicode format character (zero width joiner, soft hyphen, bidi marks...)."""
    i = bisect_right(_FORMAT_STARTS, cp) - 1
    return i >= 0 and cp <= _FORMAT_ENDS[i]


def is_control_cp(cp: int) -> bool:
    """A C0 or C1 control character (category Cc: stable since Unicode 1)."""
    return cp <= 0x1F or 0x7F <= cp <= 0x9F


def is_bidi_override_cp(cp: int) -> bool:
    """Bidi override and isolate controls: U+202A to U+202E and U+2066 to U+2069."""
    return 0x202A <= cp <= 0x202E or 0x2066 <= cp <= 0x2069


# THE SEPARATORS (rule 3), as code points after NFKC: every White_Space character that NFKC leaves
# alone or that is not a plain space (the other members, U+2000 to U+200A, U+202F, U+205F and
# U+3000, become U+0020), and the hyphen-minus, U+2010 to U+2015 and U+2212. Written out, never read
# from the runtime: Python's isspace would add U+001C to U+001F, which the property does not hold.
# The page's guard holds the same set and the shared vectors pin it (separator_vectors).
SEPARATORS: frozenset[int] = frozenset(
    {
        0x09,  # tab
        0x0A,  # line feed
        0x0B,  # vertical tab
        0x0C,  # form feed
        0x0D,  # carriage return
        0x20,  # space
        0x85,  # next line
        0xA0,  # no-break space
        0x1680,  # Ogham space mark
        0x2028,  # line separator
        0x2029,  # paragraph separator
        0x2D,  # hyphen-minus
        0x2212,  # minus sign
    }
    | set(range(0x2010, 0x2016))  # hyphen to horizontal bar
)


def _is_separator(cp: int) -> bool:
    return cp in SEPARATORS


def luhn_valid(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = ord(ch) - 48
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def find_run_groups(text: str) -> list[list[str]]:
    """Every run of the text, in order (refused or not), as its groups of the digits 0 to 9."""
    runs: list[list[str]] = []
    groups: list[str] = []  # the closed groups of the run being read
    cur: list[str] = []  # the digits of the group being read
    seps = 0

    def end_run() -> None:
        nonlocal groups, cur, seps
        if cur:
            groups.append("".join(cur))
        if groups:
            runs.append(groups)
        groups, cur, seps = [], [], 0

    for ch in unicodedata.normalize("NFKC", text):
        cp = ord(ch)
        if is_format_cp(cp):
            continue
        d = digit_value(cp)
        if d >= 0:
            cur.append(str(d))
            seps = 0
        elif (cur or groups) and _is_separator(cp):
            if cur:
                groups.append("".join(cur))
                cur = []
            seps += 1
            if seps > _MAX_SEPARATORS:
                end_run()
        else:
            end_run()
    end_run()
    return runs


def find_runs(text: str) -> list[str]:
    """Every run of the text, in order (refused or not), as strings of the digits 0 to 9."""
    return ["".join(groups) for groups in find_run_groups(text)]


def is_brand_number_shape(digits: str) -> bool:
    """True when the leading digits fall in an issuer prefix of one row of the table and the length
    is one that same row uses (the Luhn check is not made here)."""
    n = len(digits)
    for _name, prefixes, lengths in BRAND_TABLE:
        if n not in lengths:
            continue
        for k, low, high in prefixes:
            if low <= int(digits[:k]) <= high:
                return True
    return False


def is_card_layout(sizes: Sequence[int]) -> bool:
    """A single group; or 4 digits in every group but the last (1 to 4); or 4-6-5; or 4-6-4."""
    if len(sizes) == 1:
        return True
    if tuple(sizes) in ((4, 6, 5), (4, 6, 4)):
        return True
    return all(s == 4 for s in sizes[:-1]) and 1 <= sizes[-1] <= 4


def _card_layouts(total: int) -> list[tuple[int, ...]]:
    """The card's layouts of one total (rule 6), built from the rule's own statement."""
    out: list[tuple[int, ...]] = [(total,)]
    for last in range(1, 5):
        body = total - last
        if body >= 4 and body % 4 == 0:
            out.append((4,) * (body // 4) + (last,))
    out.extend(t for t in ((4, 6, 5), (4, 6, 4)) if sum(t) == total)
    return [c for c in out if is_card_layout(c)]


def _one_slip(card: tuple[int, ...]) -> set[tuple[int, ...]]:
    """Every layout one slip from a card's layout, of the same total: a group split in two, two
    neighbours joined, or the boundary of two neighbours moved one digit (every group stays at 1
    digit or more)."""
    out: set[tuple[int, ...]] = set()
    for i, s in enumerate(card):
        for a in range(1, s):
            out.add(card[:i] + (a, s - a) + card[i + 1 :])
    for i in range(len(card) - 1):
        out.add(card[:i] + (card[i] + card[i + 1],) + card[i + 2 :])
        if card[i] > 1:
            out.add(card[:i] + (card[i] - 1, card[i + 1] + 1) + card[i + 2 :])
        if card[i + 1] > 1:
            out.add(card[:i] + (card[i] + 1, card[i + 1] - 1) + card[i + 2 :])
    return out


def _build_accepted() -> dict[int, frozenset[tuple[int, ...]]]:
    accepted: dict[int, frozenset[tuple[int, ...]]] = {}
    for total in range(_MIN_DIGITS, _MAX_DIGITS + 1):
        layouts: set[tuple[int, ...]] = set()
        for card in _card_layouts(total):
            layouts.add(card)
            layouts |= _one_slip(card)
        accepted[total] = frozenset(layouts)
    return accepted


# the accepted layouts of rule 6 by total digits; 31, 50, 53, 38, 41, 44 and 46 layouts for 13 to 19
ACCEPTED_LAYOUTS = _build_accepted()


def accepted_layouts(total: int) -> list[tuple[int, ...]]:
    """The accepted layouts of one total, sorted; none outside 13 to 19 digits."""
    return sorted(ACCEPTED_LAYOUTS.get(total, ()))


def is_accepted_layout(sizes: Sequence[int]) -> bool:
    """A card's layout, or one slip from one (rule 6), judged by the group sizes alone."""
    return tuple(sizes) in ACCEPTED_LAYOUTS.get(sum(sizes), ())


def run_refused(groups: Sequence[str]) -> bool:
    """True when a run, given as its groups, holds a refused number (rule 4): the whole run when it
    is 13 to 19 digits that pass Luhn, or a span of whole groups that is also a brand's number in an
    accepted layout. A group of more than 19 digits is never part of a span."""
    n = len(groups)
    for i in range(n):
        total = 0
        for j in range(i, n):
            total += len(groups[j])
            if total > _MAX_DIGITS:
                break
            if total < _MIN_DIGITS:
                continue
            digits = "".join(groups[i : j + 1])
            if not luhn_valid(digits):
                continue
            if i == 0 and j == n - 1:
                return True
            if is_brand_number_shape(digits) and is_accepted_layout(
                [len(g) for g in groups[i : j + 1]]
            ):
                return True
    return False


def refuses_text(text: str) -> bool:
    """True when the text holds a refused number (every run judged closed)."""
    return any(run_refused(groups) for groups in find_run_groups(text))


def _paragraph_text(p: dict[str, Any]) -> str:
    out = []
    for n in p.get("content", ()):
        out.append("\n" if n.get("type") == "hard_break" else n.get("text", ""))
    return "".join(out)


def flatten_body(body: dict[str, Any]) -> str:
    """The text of a checked document as the guard reads it."""
    lines: list[str] = []
    for b in body["content"]:
        if b["type"] == "paragraph":
            lines.append(_paragraph_text(b))
        elif b["type"] == "quote":
            lines.extend(_paragraph_text(p) for p in b["content"])
        else:
            lines.extend(_paragraph_text(item["content"][0]) for item in b["content"])
    return "\n".join(lines)


def refuses_body(body: dict[str, Any]) -> bool:
    return refuses_text(flatten_body(body))


def holds_card_number(
    *,
    id: str | None = None,  # noqa: A002 - the field is called id on a note
    scenario: str | None = None,
    category: str | None = None,
    link: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
) -> bool:
    """Every string a note holds: id, scenario, category, link kind and id, and the body.

    A field left out is not judged. The id is a channel too: a file can carry an id that holds a
    valid number written in hex digits.
    """
    strings = [id, scenario, category, link["kind"] if link else None, link["id"] if link else None]
    if any(s is not None and refuses_text(s) for s in strings):
        return True
    return body is not None and refuses_body(body)
