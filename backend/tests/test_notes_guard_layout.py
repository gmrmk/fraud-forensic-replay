"""The card number guard's layout test: it tolerates a spacing slip.

A span of whole groups has an accepted layout when it is a card's layout or one slip from it (a
group split in two, two neighbours joined, the boundary of two neighbours moved by one digit). The
accepted layouts are pinned as exact lists in tests/note_vectors.json (layout_vectors), which the
page's suite reads too; this file checks the guard against them, and against the same test written
a second way (by cut positions) on every split of 13 to 19 digits.
"""

from __future__ import annotations

import notes_guard
from notes_guard import refuses_text
from tests.test_notes_fixtures import (  # noqa: F401  (the autouse fixture must be in scope)
    VECTORS,
    VISA,
    _isolated_notes_db,
)

# The layout test written a second way, by CUT POSITIONS (the running sums of the group sizes, the
# total left out). The card layouts per total: a single group (no cut); every group 4 digits but the
# last, which holds 1 to 4 (cuts at 4, 8, 12, and 16 for 17 digits or more); 4-6-5 and 4-6-4 (cuts
# at 4 and 10, for 15 and 14 digits). A span's cuts must equal a card layout's, or be it plus one
# cut (a stray space), or minus one cut (a missing space), or be it with exactly one cut moved by
# one position (a boundary moved by one digit).
_CARD_CUTS: dict[int, list[frozenset[int]]] = {
    13: [frozenset(), frozenset({4, 8, 12})],
    14: [frozenset(), frozenset({4, 8, 12}), frozenset({4, 10})],
    15: [frozenset(), frozenset({4, 8, 12}), frozenset({4, 10})],
    16: [frozenset(), frozenset({4, 8, 12})],
    17: [frozenset(), frozenset({4, 8, 12, 16})],
    18: [frozenset(), frozenset({4, 8, 12, 16})],
    19: [frozenset(), frozenset({4, 8, 12, 16})],
}

# honest lines the strict rule refused, the narrowing allowed and the cure must keep allowed
_HONEST_KEPT = [
    "honest-two-unix-times",
    "honest-phone-then-date",
    "honest-date-range-count",
    "honest-dates-clocks-count",
    "honest-small-counts",
    "honest-two-amounts",
    "honest-record-ids-date-count",
]

# published test numbers of the eight brands, one each
_PUBLISHED = (
    "4111111111111111",
    "5555555555554444",
    "378282246310005",
    "6011111111111117",
    "3530111333300000",
    "36227206271667",
    "6205500000000000004",
    "6304000000000000",
)


def cuts_accept(total: int, mine: frozenset[int]) -> bool:
    for card in _CARD_CUTS[total]:
        if mine == card:
            return True
        if len(mine) == len(card) + 1 and card < mine:
            return True
        if len(mine) == len(card) - 1 and mine < card:
            return True
        if len(mine) == len(card) and len(mine - card) == 1:
            (a,), (b,) = tuple(mine - card), tuple(card - mine)
            if abs(a - b) == 1:
                return True
    return False


def layout_by_cuts(sizes: list[int]) -> bool:
    cuts, at = set(), 0
    for s in sizes[:-1]:
        at += s
        cuts.add(at)
    return cuts_accept(sum(sizes), frozenset(cuts))


class TestTheSpacingSlipCure:
    """A card number with one slip in its spacing is refused with an expiry, a code or a count
    beside it. The layout test is a card's layout or one slip from it."""

    def test_the_accepted_layouts_are_the_pinned_lists_exactly(self) -> None:
        layout_vectors = VECTORS["layout_vectors"]
        assert layout_vectors["counts"] == {
            "13": 31,
            "14": 50,
            "15": 53,
            "16": 38,
            "17": 41,
            "18": 44,
            "19": 46,
        }
        for total in range(13, 20):
            got = sorted("-".join(map(str, s)) for s in notes_guard.accepted_layouts(total))
            assert got == sorted(layout_vectors["accepted"][str(total)]), total
            assert len(got) == layout_vectors["counts"][str(total)]
            for sizes in notes_guard.accepted_layouts(total):
                assert notes_guard.is_accepted_layout(sizes), sizes

    def test_the_rejected_layouts_are_not_accepted(self) -> None:
        for sizes in VECTORS["layout_vectors"]["rejected"]:
            assert 13 <= sum(sizes) <= 19
            assert not notes_guard.is_accepted_layout(sizes), sizes
            assert not layout_by_cuts(sizes), sizes

    def test_the_layout_test_equals_the_cut_position_test_on_every_split_of_13_to_19_digits(
        self,
    ) -> None:
        for total in range(13, 20):
            for mask in range(1 << (total - 1)):
                cuts = frozenset(b + 1 for b in range(total - 1) if mask >> b & 1)
                pts = [0, *sorted(cuts), total]
                sizes = [pts[i + 1] - pts[i] for i in range(len(pts) - 1)]
                assert notes_guard.is_accepted_layout(sizes) == cuts_accept(total, cuts), sizes

    def test_a_card_layout_is_still_accepted_and_a_slip_is_not_a_card_layout(self) -> None:
        assert notes_guard.is_card_layout([4, 4, 4, 4]) and notes_guard.is_accepted_layout([4] * 4)
        assert not notes_guard.is_card_layout([4, 4, 4, 3, 1])
        assert notes_guard.is_accepted_layout([4, 4, 4, 3, 1])
        # the layout test reads the sizes alone: outside 13 to 19 digits nothing is accepted
        assert not notes_guard.is_accepted_layout([4, 4, 4])
        assert not notes_guard.is_accepted_layout([4, 4, 4, 4, 4])
        assert notes_guard.accepted_layouts(12) == [] and notes_guard.accepted_layouts(20) == []

    def test_every_published_number_in_every_accepted_layout_is_refused_with_more_digits(
        self,
    ) -> None:
        for num in _PUBLISHED:
            for sizes in notes_guard.accepted_layouts(len(num)):
                parts, at = [], 0
                for s in sizes:
                    parts.append(num[at : at + s])
                    at += s
                line = " ".join(parts)
                assert refuses_text(line + " 12/27 123"), (len(num), sizes)
                assert refuses_text("14:05 " + line + " 3"), (len(num), sizes)
                assert refuses_text(line.replace(" ", "-") + " 12/27"), (len(num), sizes)

    def test_two_slips_in_one_number_pass_with_an_expiry_beside_it(self) -> None:
        # stated limit: 3-5-3-5 is two moved boundaries from 4-4-4-4; the number alone is refused
        spaced = "411 11111 111 11111"
        assert "".join(spaced.split()) == VISA
        assert refuses_text(spaced)
        assert not refuses_text(spaced + " 12/27 123")

    def test_a_number_with_one_slip_and_a_time_or_a_count_before_it_is_refused(self) -> None:
        stray = "4111 1111 1111 111 1"
        assert refuses_text(stray)
        for before in ("14:05 ", "2026-11-19 ", "3 ", "1763556000000 "):
            assert refuses_text(before + stray + " 12/27"), before

    def test_the_honest_kinds_the_narrowing_allowed_stay_allowed(self) -> None:
        by_id = {v["id"]: v for v in VECTORS["text_vectors"]}
        for vid in _HONEST_KEPT:
            assert not refuses_text(by_id[vid]["text"]), vid

    def test_a_number_in_every_accepted_layout_split_by_a_new_white_space_separator_is_refused(
        self,
    ) -> None:
        # the cure of 2026-11-19: the six white space characters that ended a run now join it
        for cp in VECTORS["separator_vectors"]["added_2026_11_19"]:
            for num in _PUBLISHED:
                for sizes in notes_guard.accepted_layouts(len(num)):
                    parts, at = [], 0
                    for s in sizes:
                        parts.append(num[at : at + s])
                        at += s
                    line = chr(cp).join(parts)
                    assert refuses_text(line), (hex(cp), len(num), sizes)
                    assert refuses_text(line + " 12/27 123"), (hex(cp), len(num), sizes)
