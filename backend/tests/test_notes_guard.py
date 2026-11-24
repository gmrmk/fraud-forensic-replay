"""The card number guard: the shared vectors, the stated limits, and the one digit table.

The vectors (tests/note_vectors.json) and the table (tests/note_digit_table.json) are read by the
page's guard too, so a drift between the two languages shows as a failure in one suite.
"""

from __future__ import annotations

import random
import re
import unicodedata
from typing import Any

import pytest

import notes_guard
from notes_guard import (
    BRAND_TABLE,
    digit_value,
    find_runs,
    flatten_body,
    holds_card_number,
    is_format_cp,
    luhn_valid,
    refuses_body,
    refuses_text,
    run_refused,
)
from tests.test_notes_fixtures import (  # noqa: F401  (the autouse fixture must be in scope)
    DIGIT_TABLE,
    DIGIT_TABLE_FILE,
    GOOD_ID,
    VECTORS,
    VISA,
    VISA_GROUPED,
    VISA_ID,
    _isolated_notes_db,
    doc,
    para,
    text,
)
from tests.test_notes_guard_layout import layout_by_cuts

_WHY_ALLOWED = {
    "phone-pair",
    "phone-uk-pair",
    "amount-spaced",
    "dates-times-words",
    "luhn-invalid-16-code",
    "luhn-invalid-16-expiry",
    "record-id-tx",
    "record-id-list",
    "record-id-login",
    "record-id-generic",
    "unix-pair-ok",
    "white-honest-two-counts",
}

# honest lines the earlier strict rule refused and the narrowed rule allows
_HONEST_NARROWED = [
    "honest-two-unix-times",
    "honest-phone-then-date",
    "honest-date-range-count",
    "honest-dates-clocks-count",
    "honest-small-counts",
    "honest-two-amounts",
    "honest-record-ids-date-count",
]

# card lines the narrowing lets through again, each pinned as allowed with the limit flag
_LET_THROUGH = [
    "layout-pairs-of-2",
    "off-table-prefix-with-code",
    "same-row-visa-prefix-15-digits",
    "same-row-amex-prefix-16-digits",
    "same-row-mastercard-prefix-15-digits",
]

# card lines the cure of the spacing slip (2026-11-19) turned from allowed to refused
_CURED = ["layout-groups-of-8", "layout-first-digit-split", "layout-last-digit-split"]
_BRAND_SLUGS = (
    "visa",
    "mastercard",
    "american-express",
    "discover",
    "jcb",
    "diners-club",
    "unionpay",
    "maestro",
)
_SLIP_KINDS = ("stray-space", "missing-space", "moved-boundary", "contiguous-one-space")

# 20 digit groups made from the published test number VISA with 4 digits run on: the first has a
# 19 digit prefix that passes Luhn, the second a 19 digit suffix that passes. A group of more than
# 19 digits is never refused.
PREFIX_ONLY = "41111111111111115678"
SUFFIX_ONLY = "12344111111111111111"

# the brand table, written out as the rule states it (checked 2026-11-19 against the issuer
# identification number table of https://en.wikipedia.org/wiki/Payment_card_number): per brand the
# prefix ranges as (digits in the prefix, lowest, highest) and the lengths the same row uses
EXPECTED_TABLE = (
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
        tuple((4, p, p) for p in (5018, 5020, 5038, 5893, 6304, 6759, 6761, 6762, 6763)),
        tuple(range(13, 20)),
    ),
)

# the same brands as one regular expression each (a different shape from the guard's table), for the
# independent brute force below
_BRAND_RE = [
    r"4(?:[0-9]{12}|[0-9]{15}|[0-9]{18})",
    r"(?:5[1-5][0-9]{14}|(?:222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12})",
    r"3[47][0-9]{13}",
    r"(?:6011[0-9]{12,15}|64[4-9][0-9]{13,16}|65[0-9]{14,17})",
    r"35(?:2[89]|[3-8][0-9])[0-9]{12,15}",
    r"(?:30[0-5][0-9]{11,16}|3[689][0-9]{12,17})",
    r"62[0-9]{14,17}",
    r"(?:5018|5020|5038|5893|6304|6759|676[1-3])[0-9]{9,15}",
]
_BRAND_ANY = re.compile("|".join(_BRAND_RE))


def verdict(refused: bool) -> str:
    return "refused" if refused else "allowed"


class TestSharedVectors:
    def test_the_file_opens_with_the_notice_and_holds_enough_cases(self) -> None:
        assert "published test card number" in VECTORS["_about"]
        assert "No real card number" in VECTORS["_about"]
        kinds = [v["expect"] for v in VECTORS["text_vectors"]]
        assert kinds.count("refused") >= 25
        assert kinds.count("allowed") >= 25

    @pytest.mark.parametrize("v", VECTORS["text_vectors"], ids=lambda v: v["id"])
    def test_text_vector(self, v: dict) -> None:
        assert verdict(refuses_text(v["text"])) == v["expect"]

    @pytest.mark.parametrize("v", VECTORS["multi_vectors"], ids=lambda v: v["id"])
    def test_multi_vector_each_note_is_judged_alone(self, v: dict) -> None:
        assert all(not refuses_text(t) for t in v["texts"])

    @pytest.mark.parametrize("v", VECTORS["body_vectors"], ids=lambda v: v["id"])
    def test_body_vector(self, v: dict) -> None:
        assert verdict(refuses_body(v["body"])) == v["expect"]

    @pytest.mark.parametrize("v", VECTORS["id_vectors"], ids=lambda v: v["id"])
    def test_id_vector(self, v: dict) -> None:
        assert verdict(refuses_text(v["value"])) == v["expect"]

    def test_every_stated_limit_is_pinned_as_allowed(self) -> None:
        limits = [
            v
            for key in ("text_vectors", "multi_vectors", "body_vectors")
            for v in VECTORS[key]
            if v.get("limit")
        ]
        assert len(limits) >= 14
        assert all(v["expect"] == "allowed" for v in limits)
        ids = {v["id"] for v in limits}
        for needed in (
            "limit-period",
            "limit-slash",
            "limit-underscore",
            "limit-comma",
            "limit-colon",
            "limit-four-spaces",
            "limit-four-line-feeds",
            "limit-parenthesis",
            "limit-reversed",
            "limit-words",
            "limit-two-notes",
            "limit-run-on-code",
            "limit-grouped-run-on-last",
            "limit-grouped-run-on-first",
            "three-blank-paragraphs",
        ):
            assert needed in ids

    def test_the_three_vectors_the_strict_rule_flipped_take_the_narrowed_verdict(self) -> None:
        flipped = {v["id"]: v for v in VECTORS["text_vectors"] if v["id"].startswith("flipped-")}
        assert set(flipped) == {"flipped-24-digits", "flipped-21-digits", "flipped-20-digits"}
        for v in flipped.values():
            assert "safety review flipped" in v["note"] and "2026-11-19" in v["note"]
        # the first group of this one is a 16 digit Visa number: still refused
        assert flipped["flipped-21-digits"]["expect"] == "refused"
        assert not flipped["flipped-21-digits"].get("limit")
        assert refuses_text(flipped["flipped-21-digits"]["text"])
        assert "narrowing of 2026-11-19" in flipped["flipped-21-digits"]["note"]
        # a group of more than 19 digits is never refused: both are allowed again, as stated limits
        for vid in ("flipped-24-digits", "flipped-20-digits"):
            assert flipped[vid]["expect"] == "allowed" and flipped[vid]["limit"] is True
            assert "narrowing of 2026-11-19" in flipped[vid]["note"]
            assert not refuses_text(flipped[vid]["text"])

    def test_the_id_vector_the_strict_rule_refused_is_allowed_again_and_says_so(self) -> None:
        v = next(v for v in VECTORS["id_vectors"] if v["id"] == "id-crafted-run-on")
        assert v["expect"] == "allowed" and v["limit"] is True
        assert "narrowing of 2026-11-19" in v["note"]
        assert not refuses_text(v["value"])

    def test_every_honest_line_the_strict_rule_refused_is_allowed_and_says_why(self) -> None:
        found = {v["id"]: v for v in VECTORS["text_vectors"] if v["id"] in _HONEST_NARROWED}
        assert set(found) == set(_HONEST_NARROWED)
        for v in found.values():
            assert v["expect"] == "allowed" and not v.get("limit")
            assert (
                "narrowing of 2026-11-19" in v["label"] and "narrowing of 2026-11-19" in v["note"]
            )
            assert not refuses_text(v["text"])

    def test_every_card_line_the_narrowing_lets_through_is_a_limit_with_the_note(self) -> None:
        found = {v["id"]: v for v in VECTORS["text_vectors"] if v["id"] in _LET_THROUGH}
        assert set(found) == set(_LET_THROUGH)
        for v in found.values():
            assert v["expect"] == "allowed" and v["limit"] is True
            assert "narrowing of 2026-11-19" in v["note"]
            assert not refuses_text(v["text"])

    def test_the_vectors_the_cure_changed_are_refused_and_carry_the_dated_note(self) -> None:
        found = {v["id"]: v for v in VECTORS["text_vectors"] if v["id"] in _CURED}
        assert set(found) == set(_CURED)
        for v in found.values():
            assert v["expect"] == "refused" and "limit" not in v
            assert "2026-11-19" in v["note"] and "spacing slip" in v["note"]
            assert "2026-11-19" in v["label"] and "spacing slip" in v["label"]
            assert refuses_text(v["text"])

    def test_a_number_of_every_brand_with_one_slip_is_refused_with_the_note(self) -> None:
        by_id = {v["id"]: v for v in VECTORS["text_vectors"]}
        for slug in _BRAND_SLUGS:
            for kind in _SLIP_KINDS:
                v = by_id[f"slip-{slug}-{kind}"]
                assert v["expect"] == "refused" and "limit" not in v, v["id"]
                assert "2026-11-19" in v["note"] and "cures the spacing slip" in v["note"]
                assert refuses_text(v["text"]), v["id"]

    def test_a_number_of_every_brand_with_two_slips_is_allowed_as_a_limit(self) -> None:
        by_id = {v["id"]: v for v in VECTORS["text_vectors"]}
        for slug in _BRAND_SLUGS:
            v = by_id[f"double-slip-{slug}"]
            assert v["expect"] == "allowed" and v["limit"] is True, v["id"]
            assert "2026-11-19" in v["note"] and "two slips" in v["note"]
            assert not refuses_text(v["text"]), v["id"]

    def test_a_card_line_of_every_brand_is_refused(self) -> None:
        for name, _prefixes, _lengths in BRAND_TABLE:
            slug = name.lower().replace(" ", "-")
            v = next(v for v in VECTORS["text_vectors"] if v["id"] == f"card-line-{slug}")
            assert v["expect"] == "refused" and refuses_text(v["text"]), name

    def test_every_prefix_range_is_pinned_at_both_edges_and_just_outside(self) -> None:
        """Each range of each row: first and last prefix refused, just outside it allowed."""
        by_id = {v["id"]: v for v in VECTORS["text_vectors"]}
        for name, prefixes, _lengths in EXPECTED_TABLE:
            slug = name.lower().replace(" ", "-")
            merged: list[list[int]] = []  # [digits, low, high] with touching entries joined
            for k, lo, hi in prefixes:
                if merged and merged[-1][0] == k and merged[-1][2] + 1 == lo:
                    merged[-1][2] = hi
                else:
                    merged.append([k, lo, hi])
            for _k, lo, hi in merged:
                key = str(lo) if lo == hi else f"{lo}-{hi}"
                wanted = {"first": "refused", "below": "allowed", "above": "allowed"}
                if hi != lo:
                    wanted["last"] = "refused"
                for which, expect in wanted.items():
                    v = by_id[f"brand-{slug}-{key}-{which}"]
                    assert v["expect"] == expect, v["id"]
                    assert refuses_text(v["text"]) == (expect == "refused"), v["id"]
                    assert bool(v.get("limit")) == (expect == "allowed"), v["id"]

    def test_the_twenty_shapes_of_the_review_are_all_refused(self) -> None:
        shapes = [v for v in VECTORS["text_vectors"] if v["id"].startswith("shape-")]
        assert len(shapes) == 20
        assert all(v["expect"] == "refused" for v in shapes)
        assert all(refuses_text(v["text"]) for v in shapes)

    def test_every_allowed_vector_that_is_not_a_limit_says_why(self) -> None:
        # a new allowed vector carries its reason in the label; the shared file is the record
        why = [v for v in VECTORS["text_vectors"] if v["id"] in _WHY_ALLOWED]
        assert len(why) == len(_WHY_ALLOWED)
        assert all(v["expect"] == "allowed" and len(v["label"]) > 30 for v in why)


class TestEveryWhiteSpaceIsASeparator:
    """Every character with the Unicode property White_Space is a
    separator after NFKC. The code points are pinned in the shared vectors (separator_vectors),
    which the page's suite compares with its own set too."""

    def test_the_guards_separator_set_is_the_pinned_list(self) -> None:
        pinned = VECTORS["separator_vectors"]
        assert sorted(notes_guard.SEPARATORS) == pinned["code_points"]
        assert pinned["added_2026_11_19"] == [0x0B, 0x0C, 0x85, 0x1680, 0x2028, 0x2029]
        assert set(pinned["added_2026_11_19"]) <= set(pinned["code_points"])

    def test_the_pinned_white_space_members_are_the_unicode_property(self) -> None:
        # White_Space is the categories Zs, Zl and Zp plus U+0009 to U+000D and U+0085
        derived = [
            cp
            for cp in range(0x110000)
            if not 0xD800 <= cp <= 0xDFFF
            and (
                unicodedata.category(chr(cp)) in ("Zs", "Zl", "Zp")
                or 0x09 <= cp <= 0x0D
                or cp == 0x85
            )
        ]
        assert derived == VECTORS["separator_vectors"]["white_space_members"]
        assert len(derived) == 25

    def test_after_nfkc_every_white_space_character_is_a_separator_and_joins_a_run(self) -> None:
        for cp in VECTORS["separator_vectors"]["white_space_members"]:
            folded = unicodedata.normalize("NFKC", chr(cp))
            assert all(ord(c) in notes_guard.SEPARATORS for c in folded), hex(cp)
            assert notes_guard.find_run_groups("4" + chr(cp) + "1") == [["4", "1"]], hex(cp)

    def test_characters_that_are_not_white_space_still_end_a_run(self) -> None:
        # U+001C to U+001F count as white space for Python's isspace but not for the property
        for cp in (0x1C, 0x1D, 0x1E, 0x1F, 0x2E, 0x2F, 0x5F, 0x2C, 0x3A, 0x41, 0x2016):
            assert notes_guard.find_run_groups("4" + chr(cp) + "1") == [["4"], ["1"]], hex(cp)

    def test_three_separators_in_a_row_join_and_four_end_a_run_whatever_they_are(self) -> None:
        for cp in VECTORS["separator_vectors"]["code_points"]:
            s = chr(cp)
            assert refuses_text("4111" + s * 3 + "1111 1111 1111"), hex(cp)
            assert not refuses_text("41111111" + s * 4 + "11111111"), hex(cp)
        mixed = "4111" + chr(0x0B) + chr(0x2028) + chr(0x0C) + "1111 1111 1111"
        assert refuses_text(mixed)
        assert not refuses_text("41111111" + chr(0x0B) + chr(0x2028) + chr(0x0C) + " " + "11111111")

    def test_the_white_space_vectors_are_in_the_file_with_their_verdicts(self) -> None:
        by_id = {v["id"]: v for v in VECTORS["text_vectors"] if v["id"].startswith("white-")}
        assert len(by_id) == 17
        for slug in (
            "vertical-tab",
            "form-feed",
            "next-line",
            "line-separator",
            "paragraph-separator",
            "ogham-space",
        ):
            for kind in ("alone", "expiry"):
                v = by_id[f"white-{slug}-{kind}"]
                assert v["expect"] == "refused" and "limit" not in v and "2026-11-19" in v["note"]
        for vid in ("white-four-line-separators", "white-four-mixed-white-space"):
            assert by_id[vid]["expect"] == "allowed" and by_id[vid]["limit"] is True
        honest = by_id["white-honest-two-counts"]
        assert honest["expect"] == "allowed" and "limit" not in honest
        assert chr(0x2028) in honest["text"]


class TestRule:
    def test_luhn(self) -> None:
        assert luhn_valid(VISA)
        assert luhn_valid("378282246310005")
        assert not luhn_valid("1234567890123456")

    def test_a_run_joins_at_most_three_separators(self) -> None:
        assert find_runs("4111   1111   1111   1111") == [VISA]
        assert find_runs("4111    1111") == ["4111", "1111"]

    def test_a_run_is_kept_as_its_groups(self) -> None:
        assert notes_guard.find_run_groups("4111 1111-1111\n1111") == [
            ["4111", "1111", "1111", "1111"]
        ]
        assert notes_guard.find_run_groups("12 ab 34") == [["12"], ["34"]]
        assert notes_guard.find_run_groups("4111    1111") == [["4111"], ["1111"]]

    def test_the_window_is_thirteen_to_nineteen_digits(self) -> None:
        assert not refuses_text("411111111116")  # 12 digits, Luhn valid
        assert refuses_text("4222222222222")  # 13
        assert refuses_text("6200000000000000000")  # 19
        # 20 digits: the group is over the ceiling and its first 19 digits pass Luhn, but a group of
        # more than 19 digits is never refused (the narrowed rule)
        assert not refuses_text("62000000000000000000")

    def test_a_span_of_whole_groups_is_judged_not_only_the_whole_run(self) -> None:
        # the number, then its expiry and its code: the run is 22 digits and fails Luhn
        assert refuses_text(VISA_GROUPED + " 12 27 123")
        assert refuses_text("14 05 " + VISA_GROUPED)  # a time before it
        assert refuses_text(VISA_GROUPED + "\n12 27")

    def test_only_spans_of_thirteen_to_nineteen_digits_are_judged(self) -> None:
        assert not refuses_text("4111 1111 1111")  # 12 digits
        assert refuses_text("4222 2222 2222 2")  # 13 digits, a published test number
        assert refuses_text("8 4222 2222 2222 2")  # a 13 digit span inside a 14 digit run
        assert not refuses_text("1042 1043 1044 1045")  # 16 digits, no span passes

    def test_a_group_of_twenty_or_more_is_never_refused(self) -> None:
        # stated limit: a group over 19 digits is too long to hold a span, and it is not judged at
        # its first or its last digit either (the strict rule's windows were removed on 2026-11-19)
        assert not refuses_text(PREFIX_ONLY)
        assert not refuses_text(SUFFIX_ONLY)
        assert not refuses_text("note-0123" + VISA + "abcdefabcdef")
        assert not refuses_text(VISA + "12345678")
        assert not refuses_text("12345678901234560003")
        assert not run_refused([PREFIX_ONLY])
        assert not run_refused(["12345678", SUFFIX_ONLY])
        # with a separator it is a group of its own, a span of whole groups
        assert refuses_text(VISA + " 12345678")


class TestNarrowedRule:
    """The narrowed rule: the original rule, plus a span of whole groups that is a
    brand's number in a card layout."""

    def test_the_brand_table_is_the_eight_rows_checked_against_the_article(self) -> None:
        assert BRAND_TABLE == EXPECTED_TABLE

    def test_the_original_rule_stays_whatever_the_digits_are(self) -> None:
        # a whole run of 13 to 19 digits that passes Luhn, with no brand prefix and no layout
        assert refuses_text("1763556000000")
        assert refuses_text("1 7 6 3 5 5 6 0 0 0 0 0 0")  # 13 digits in single digit groups
        assert refuses_text("5063516945005047")  # a prefix no row holds, 16 digits, alone
        assert refuses_text("2026-11-01 2026-11-05")  # the stated false positive
        assert not refuses_text("1763556003600")

    def test_a_card_line_is_refused_in_every_layout_cards_are_written_in(self) -> None:
        card = {
            13: ["4222222222222"],
            14: ["36227206271667"],
            15: ["378282246310005"],
            16: [VISA, "5555555555554444"],
            19: ["6205500000000000004"],
        }
        layouts = {
            13: [4, 4, 4, 1],
            14: [4, 6, 4],
            15: [4, 6, 5],
            16: [4, 4, 4, 4],
            19: [4, 4, 4, 4, 3],
        }
        for length, numbers in card.items():
            for num in numbers:
                sizes = layouts[length]
                parts, at = [], 0
                for s in sizes:
                    parts.append(num[at : at + s])
                    at += s
                for sep in (" ", "-"):
                    line = sep.join(parts)
                    assert refuses_text(line + " 12/27 123"), (length, sep)
                    assert refuses_text("14:05 " + line + " 3"), (length, sep)
                assert refuses_text(num + " 12/27 123"), length  # contiguous: a single group

    def test_the_layouts(self) -> None:
        # 4-4-4-1 to 4-4-4-4, 4-4-4-4-1 to 4-4-4-4-3, 4-6-5, 4-6-4 and a single group, and since
        # the layout test also accepts each of those with one spacing slip
        # (a group split in two, two neighbours joined, a boundary moved by one digit); the span is
        # a brand's number made by swapping the check digit of a published number, with an expiry
        # beside it so that the whole run fails Luhn
        def valid(prefix: str, length: int) -> str:
            body = (prefix + "0" * length)[: length - 1]
            return next(body + str(c) for c in range(10) if luhn_valid(body + str(c)))

        def cut(num: str, sizes: list[int]) -> str:
            out, at = [], 0
            for s in sizes:
                out.append(num[at : at + s])
                at += s
            return " ".join(out)

        ok = [
            (13, [4, 4, 4, 1]),
            (14, [4, 4, 4, 2]),
            (15, [4, 4, 4, 3]),
            (16, [4, 4, 4, 4]),
            (17, [4, 4, 4, 4, 1]),
            (18, [4, 4, 4, 4, 2]),
            (19, [4, 4, 4, 4, 3]),
            (14, [4, 6, 4]),
            (15, [4, 6, 5]),
            (16, [16]),
            # one slip from a card's layout (the cure of 2026-11-19)
            (16, [8, 8]),
            (16, [1, 15]),
            (16, [15, 1]),
            (16, [4, 4, 5, 3]),
            (15, [5, 5, 5]),
            (15, [4, 5, 6]),
            (16, [4, 4, 4, 2, 2]),
            (16, [4, 4, 4, 3, 1]),
            (16, [3, 5, 4, 4]),
            (19, [4, 4, 4, 4, 2, 1]),
        ]
        bad = [
            (16, [2] * 8),
            (16, [3, 4, 4, 5]),
            (16, [4, 6, 6]),
            (16, [3, 5, 3, 5]),  # two slips
            (15, [3, 6, 6]),
            (19, [3, 5, 4, 3, 4]),
        ]

        def line_for(num: str, sizes: list[int]) -> str:
            # the first month that keeps the whole run (number and month) off Luhn, so that the
            # original rule allows the line and only the span rule can refuse it
            for month in ("12", "11", "10", "09", "08"):
                line = f"{cut(num, sizes)} {month}/27 123"
                if not _luhn_ok(num + month):
                    return line
            raise AssertionError("no month")

        # a prefix of a row that has the length (Visa 13/16/19, Diners 14, Amex 15, Discover 17/18)
        prefix_of = {13: "4", 14: "36", 15: "34", 16: "4", 17: "6011", 18: "6011", 19: "4"}
        for length, sizes in ok:
            assert refuses_text(line_for(valid(prefix_of[length], length), sizes)), (length, sizes)
        for length, sizes in bad:
            num = valid("34" if length == 15 else "4", length)
            assert not refuses_text(line_for(num, sizes)), (length, sizes)

    def test_a_number_in_a_layout_cards_are_not_written_in_passes_with_an_expiry_beside_it(
        self,
    ) -> None:
        pairs = " ".join(VISA[i : i + 2] for i in range(0, 16, 2))
        assert not refuses_text(pairs + " 12/27")
        assert refuses_text(pairs)  # nothing beside it: the original rule refuses the whole run
        assert refuses_text(VISA_GROUPED + " 12/27")

    def test_a_prefix_outside_the_table_passes_with_a_code_beside_it(self) -> None:
        off = "5063516945005047"
        assert luhn_valid(off)
        assert refuses_text(off)  # alone: the original rule
        assert not refuses_text(off + " 12/27 123")
        assert not refuses_text("5063 5169 4500 5047 12/27 123")

    def test_a_prefix_and_a_length_of_two_different_rows_are_not_a_brand_number(self) -> None:
        assert luhn_valid("411111111111116")  # a valid 15 digit number that starts with 4
        assert not refuses_text("4111 1111 1111 116 12/27")  # Visa has 13, 16 and 19 digits
        assert luhn_valid("3482822463100055")  # a valid 16 digit number that starts with 34
        assert not refuses_text("3482 8224 6310 0055 12/27")  # Amex has 15 digits

    def test_a_group_of_more_than_nineteen_digits_is_never_part_of_a_span(self) -> None:
        # a card number then 4 more digits written straight after it: a 20 digit group
        assert not refuses_text(VISA + "1234 12/27")
        assert not refuses_text("12/27 " + VISA + "1234")

    def test_the_whole_run_is_judged_without_the_brand_and_the_layout(self) -> None:
        # groups of 3, 5 and 5: no card layout, a prefix no row holds; the whole run passes Luhn
        assert run_refused(["176", "35560", "00000"])
        assert not run_refused(["176", "35560", "00001"])
        # a span that is not the whole run needs a brand and a layout: this one passes Luhn, has
        # no brand prefix, and is allowed once an expiry is beside it
        assert refuses_text("1763556000000")
        assert not refuses_text("1763556000000 12/27")


def _luhn_ok(s: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(s)):
        d = int(ch)
        if i % 2 == 1:
            d = d * 2 - 9 if d * 2 > 9 else d * 2
        total += d
    return total % 10 == 0


def _brute(line: str) -> bool:
    """An independent brute force: a regex for the runs, a regex per brand, spans by slicing."""
    for m in re.finditer(r"[0-9]+(?:[ \t\r\n-]{1,3}[0-9]+)*", line):
        groups = re.findall(r"[0-9]+", m.group(0))
        whole = "".join(groups)
        if 13 <= len(whole) <= 19 and _luhn_ok(whole):
            return True
        for i in range(len(groups)):
            for j in range(i, len(groups)):
                part = groups[i : j + 1]
                d = "".join(part)
                if not 13 <= len(d) <= 19 or not _luhn_ok(d) or not _BRAND_ANY.fullmatch(d):
                    continue
                sizes = [len(g) for g in part]
                if layout_by_cuts(sizes):  # the layout test a second way, by cut positions
                    return True
    return False


class TestAgainstAnIndependentBruteForce:
    def _lines(self, n: int) -> list[str]:
        rng = random.Random(20261119)
        published = [
            "4111111111111111",
            "4222222222222",
            "5555555555554444",
            "378282246310005",
            "6011111111111117",
            "3530111333300000",
            "36227206271667",
            "6200000000000005",
            "6205500000000000004",
            "6304000000000000",
        ]
        layouts = [[4, 4, 4, 4], [4, 6, 5], [4, 6, 4], [2], [8], [1, 15], [3], [16]]
        seps = [" ", " ", " ", "-", "\n", "  ", "   ", "    ", "x", ".", " and ", "\t"]
        out = []
        for _ in range(n):
            parts: list[str] = []
            for _g in range(rng.randrange(1, 8)):
                if rng.random() < 0.3:
                    num = rng.choice(published)
                    unit = rng.choice(layouts)
                    pieces: list[str] = []
                    at = 0
                    while at < len(num):
                        size = unit[len(pieces) % len(unit)] if len(unit) > 1 else unit[0]
                        pieces.append(num[at : at + size])
                        at += size
                    parts.append(rng.choice([" ", "-"]).join(pieces))
                else:
                    size = rng.choice([1, 2, 2, 3, 4, 4, 4, 5, 8, 13, 16, 19, 20, 24])
                    parts.append("".join(str(rng.randrange(10)) for _ in range(size)))
                parts.append(rng.choice(seps))
            out.append("".join(parts))
        return out

    def test_the_guard_agrees_with_the_brute_force_on_seeded_lines_and_refuses_a_fair_share(
        self,
    ) -> None:
        lines = self._lines(6000)
        refused = 0
        span_only = 0
        for line in lines:
            want = _brute(line)
            assert refuses_text(line) == want, len(line)
            refused += want
            if want and not any(
                13 <= len("".join(g)) <= 19 and _luhn_ok("".join(g))
                for g in notes_guard.find_run_groups(line)
            ):
                span_only += 1
        assert 600 < refused < 5400
        assert span_only > 100  # lines refused by a span that is not the whole run

    def test_digits_run_on_to_a_card_in_a_group_of_nineteen_or_fewer_stay_allowed(self) -> None:
        # stated limit: the group is judged whole, so a 1 to 3 digit code written straight after
        # the number is not caught
        assert not refuses_text(VISA + "123")
        assert not refuses_text(VISA + "12")
        assert not refuses_text(VISA + "1")
        # the same when the number is in groups and the digits are glued to its first or last group
        assert not refuses_text(VISA_GROUPED + "123")
        assert not refuses_text("123" + VISA_GROUPED)
        assert refuses_text(VISA_GROUPED + " 123")  # with a separator it is refused

    def test_nfkc_then_format_characters_are_dropped(self) -> None:
        fullwidth = "".join(chr(0xFF10 + int(d)) for d in VISA)
        assert refuses_text(fullwidth)
        assert refuses_text(
            "4111" + chr(0x200B) + "1111" + chr(0x200B) + "1111" + chr(0x200B) + "1111"
        )

    def test_flatten_joins_blocks_and_hard_breaks_by_one_line_feed(self) -> None:
        body = doc(
            para(text("4111 1111", "bold"), {"type": "hard_break"}, text("1111 1111")),
            para(text("tail")),
        )
        assert flatten_body(body) == "4111 1111\n1111 1111\ntail"
        assert refuses_body(body)

    def test_a_refusal_is_a_bool_and_holds_no_value(self) -> None:
        assert refuses_text(VISA) is True
        assert refuses_text("hello") is False


class TestEveryStringANoteHolds:
    def test_the_id_is_guarded(self) -> None:
        assert holds_card_number(id=VISA_ID)
        assert not holds_card_number(id=GOOD_ID)

    @pytest.mark.parametrize(
        "name,value",
        [
            ("scenario", VISA_GROUPED.replace(" ", "-")),
            ("category", VISA_GROUPED),
        ],
    )
    def test_scenario_and_category(self, name: str, value: str) -> None:
        given: dict[str, Any] = {name: value}
        assert holds_card_number(**given)

    def test_link_kind_and_id(self) -> None:
        assert holds_card_number(link={"kind": "tx", "id": "tx-" + VISA})
        assert holds_card_number(link={"kind": "k" + VISA, "id": "tx-1"})
        assert not holds_card_number(link={"kind": "auth", "id": "tx-0001042"})
        assert not holds_card_number(link=None)

    def test_body(self) -> None:
        assert holds_card_number(body=doc(para(text(VISA))))
        assert not holds_card_number(body=doc(para(text("hello"))))

    def test_nothing_given_is_not_a_refusal(self) -> None:
        assert not holds_card_number()


class TestOneDigitTable:
    def test_the_guard_reads_the_shared_file(self) -> None:
        assert notes_guard.DIGIT_TABLE_PATH.samefile(DIGIT_TABLE_FILE)

    def test_every_listed_zero_gives_ten_digits(self) -> None:
        for zero in DIGIT_TABLE["digit_zeros"]:
            assert [digit_value(zero + d) for d in range(10)] == list(range(10))
            assert digit_value(zero + 10) in (-1, 0)  # the next cell is not this block's digit

    def test_every_digit_python_knows_is_in_the_table(self) -> None:
        # Python 3.12 has Unicode 15.0; the table was made from 16.0. The table must hold at least
        # what the runtime holds, and the runtime's Cf characters too.
        for cp in range(0x110000):
            ch = chr(cp)
            d = unicodedata.decimal(ch, -1)
            if d != -1:
                assert digit_value(cp) == d, hex(cp)
            if unicodedata.category(ch) == "Cf":
                assert is_format_cp(cp), hex(cp)

    def test_a_digit_script_the_runtime_may_not_know_is_still_refused(self) -> None:
        zero = 0x10D40  # Garay, added in Unicode 16.0, so absent from Python 3.12's own data
        assert zero in DIGIT_TABLE["digit_zeros"]
        written = "".join(chr(zero + int(d)) for d in VISA)
        assert refuses_text(written)
