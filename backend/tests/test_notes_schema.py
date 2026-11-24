"""The closed schema, mirrored from the page's lib/notes/schema.ts.

A refusal is a fixed code and a path of fixed names and indices: never a value, never a key the
input supplied. MARKER stands for a value that must never come back out.
"""

from __future__ import annotations

import copy
import json
import uuid
from typing import Any

import pytest

from notes_schema import (
    LIMITS,
    STARTER_CATEGORIES,
    NoteRefused,
    body_to_json,
    category_exists,
    check_body,
    check_category_name,
    check_draft,
    check_file,
    check_link,
    check_note,
    check_note_fields,
    check_scenario,
    is_note_id,
    make_note_id,
    normalize_category_name,
    note_from_row,
    same_category,
)
from tests.test_notes_fixtures import (  # noqa: F401  (the autouse fixture must be in scope)
    GOOD_ID,
    VISA,
    VISA_GROUPED,
    VISA_ID,
    _isolated_notes_db,
    bullets,
    doc,
    draft,
    fields,
    hello,
    para,
    quote,
    rich_body,
    text,
)

MARKER = "SECRET-MARKER-7731"


def refusal(fn: Any, *args: Any) -> tuple[str, str]:
    with pytest.raises(NoteRefused) as info:
        fn(*args)
    e = info.value
    assert MARKER not in str(e) and MARKER not in repr(e)
    return e.code, e.where


def with_text(s: str) -> dict[str, Any]:
    return doc(para(text(s)))


class TestBodyAccepts:
    def test_the_empty_document(self) -> None:
        assert check_body({"v": 1, "content": []}) == {"v": 1, "content": []}

    def test_a_rich_document_comes_back_equal_and_as_a_new_object(self) -> None:
        raw = rich_body()
        out = check_body(raw)
        assert out == raw
        assert out is not raw and out["content"] is not raw["content"]

    def test_a_float_that_is_a_whole_number_is_the_version_as_in_the_page(self) -> None:
        assert check_body(json.loads('{"v":1.0,"content":[]}')) == {"v": 1, "content": []}

    def test_the_output_keeps_the_key_order_the_page_writes(self) -> None:
        out = check_body(doc(para(text("a", "bold"))))
        node = out["content"][0]["content"][0]
        assert list(node) == ["type", "text", "marks"]


HOSTILE: list[tuple[str, Any]] = [
    ("extra key on the document", {"v": 1, "content": [], "x": 1}),
    ("extra key on a paragraph", doc({"type": "paragraph", "x": 1})),
    ("extra key on a text node", doc(para({"type": "text", "text": "a", "x": 1}))),
    (
        "extra key on a mark",
        doc(para({"type": "text", "text": "a", "marks": [{"type": "bold", "x": 1}]})),
    ),
    ("proto key", json.loads('{"v":1,"content":[],"__proto__":{"a":1}}')),
    ("constructor key", json.loads('{"v":1,"content":[],"constructor":{}}')),
    ("script node", doc({"type": "script", "text": "alert(1)"})),
    ("link mark", doc(para({"type": "text", "text": "a", "marks": [{"type": "link"}]}))),
    (
        "href attribute on a mark",
        doc(para({"type": "text", "text": "a", "marks": [{"type": "bold", "href": "x"}]})),
    ),
    (
        "repeated mark",
        doc(para({"type": "text", "text": "a", "marks": [{"type": "bold"}, {"type": "bold"}]})),
    ),
    (
        "five marks",
        doc(
            para(
                {
                    "type": "text",
                    "text": "a",
                    "marks": [
                        {"type": m} for m in ("bold", "italic", "underline", "strike", "code")
                    ],
                }
            )
        ),
    ),
    (
        "nested list",
        doc({"type": "bullet_list", "content": [{"type": "list_item", "content": [bullets("x")]}]}),
    ),
    (
        "two paragraphs in a list item",
        doc(
            {"type": "bullet_list", "content": [{"type": "list_item", "content": [para(), para()]}]}
        ),
    ),
    (
        "quote in a list item",
        doc(
            {"type": "bullet_list", "content": [{"type": "list_item", "content": [quote(para())]}]}
        ),
    ),
    ("list in a quote", doc(quote(bullets("x")))),
    (
        "start value on an ordered list",
        doc({"type": "ordered_list", "start": 3, "content": bullets("x")["content"]}),
    ),
    ("number as a type", doc({"type": 7})),
    ("array where an object belongs", {"v": 1, "content": [[para()]]}),
    ("string document", "hello"),
    ("null document", None),
    ("version two", {"v": 2, "content": []}),
    ("version true", {"v": True, "content": []}),
    ("content not a list", {"v": 1, "content": {}}),
    ("101 blocks", doc(*[para() for _ in range(101)])),
    ("empty list", doc({"type": "bullet_list", "content": []})),
    ("51 list items", doc(bullets(*["x"] * 51))),
    ("empty quote", doc(quote())),
    ("21 quote paragraphs", doc(quote(*[para() for _ in range(21)]))),
    ("empty text node", with_text("")),
    ("control character", with_text("a" + chr(0) + "b")),
    ("c1 control character", with_text("a" + chr(0x85) + "b")),
    ("bidi override", with_text("a" + chr(0x202E) + "b")),
    ("bidi isolate", with_text("a" + chr(0x2066) + "b")),
    ("text not NFC", with_text("e" + chr(0x0301))),
    ("lone surrogate", with_text("a" + chr(0xD800))),
    ("text of a wrong type", doc(para({"type": "text", "text": 5}))),
    ("hard break with a key", doc(para({"type": "hard_break", "x": 1}))),
]


class TestBodyRefuses:
    @pytest.mark.parametrize("name,raw", HOSTILE, ids=[n for n, _ in HOSTILE])
    def test_hostile_document(self, name: str, raw: Any) -> None:
        code, where = refusal(check_body, raw)
        assert code == "body_schema"
        assert where.startswith("body")

    def test_no_refusal_names_a_key_or_value_the_input_supplied(self) -> None:
        raw = {"v": 1, "content": [], MARKER: MARKER}
        code, where = refusal(check_body, raw)
        assert (code, where) == ("body_schema", "body")
        code, where = refusal(check_body, doc({"type": MARKER}))
        assert MARKER not in where

    def test_where_is_a_path_of_fixed_names_and_indices(self) -> None:
        raw = doc(para(), para(), {"type": "script"})
        assert refusal(check_body, raw) == ("body_schema", "body.content[2]")
        raw = doc(para(text("a"), text("b" + chr(0))))
        assert refusal(check_body, raw) == ("body_schema", "body.content[0].content[1].text")
        raw = doc(bullets("a", "b"))
        raw["content"][0]["content"][1]["content"][0]["content"][0]["type"] = "image"
        assert refusal(check_body, raw) == (
            "body_schema",
            "body.content[0].content[1].content[0].content[0]",
        )

    def test_the_path_prefix_is_the_callers(self) -> None:
        assert refusal(check_body, {"v": 2, "content": []}, "notes[3].body") == (
            "body_schema",
            "notes[3].body",
        )

    def test_the_input_is_never_changed(self) -> None:
        raw = rich_body()
        before = copy.deepcopy(raw)
        check_body(raw)
        assert raw == before


class TestBodyLimits:
    def test_4000_characters_pass_and_4001_do_not(self) -> None:
        assert check_body(with_text("a" * 4000))
        assert refusal(check_body, with_text("a" * 4001)) == (
            "too_long",
            "body.content[0].content[0].text",
        )

    def test_the_total_is_over_all_text_nodes(self) -> None:
        raw = doc(para(text("a" * 1334), text("b" * 1334)), para(text("c" * 1334)))
        code, _ = refusal(check_body, raw)
        assert code == "too_long"

    def test_characters_are_code_points_not_utf16_units(self) -> None:
        assert check_body(with_text(chr(0x1F600) * 4000))
        assert refusal(check_body, with_text(chr(0x1F600) * 4001))[0] == "too_long"

    def test_64_kb_is_counted_as_utf8_bytes_of_the_compact_json(self) -> None:
        marks = ("bold", "italic", "underline", "strike")
        word = chr(0x6F22) * 4  # 4 characters, 12 bytes
        raw = doc(para(*[text(word, *marks) for _ in range(560)]))
        compact = json.dumps(raw, ensure_ascii=False, separators=(",", ":"))
        assert len(compact) <= 64 * 1024 < len(compact.encode("utf-8"))
        assert refusal(check_body, raw) == ("too_long", "body")
        assert body_to_json(check_body(doc(para(*[text(word, *marks) for _ in range(500)]))))

    def test_many_marked_nodes_hit_the_byte_limit(self) -> None:
        marks = ("bold", "italic", "underline", "strike")
        raw = doc(para(*[text("a", *marks) for _ in range(4000)]))
        assert refusal(check_body, raw) == ("too_long", "body")

    def test_the_stored_form_is_compact_utf8_json_that_loads_back_equal(self) -> None:
        body = check_body(rich_body())
        s = body_to_json(body)
        assert " " not in s.replace("Follow up", "")  # no padding between tokens
        assert json.loads(s) == body

    def test_a_card_number_in_the_body_is_refused_with_the_path(self) -> None:
        assert refusal(check_body, with_text(VISA)) == ("card_number", "body")
        assert refusal(check_body, with_text("pay " + VISA_GROUPED), "notes[3].body") == (
            "card_number",
            "notes[3].body",
        )


class TestLinkScenarioTimeEtc:
    def test_link_none_and_valid(self) -> None:
        assert check_link(None) is None
        assert check_link({"kind": "auth", "id": "tx-0001042"}) == {
            "kind": "auth",
            "id": "tx-0001042",
        }

    @pytest.mark.parametrize(
        "raw",
        [
            {"kind": "auth"},
            {"kind": "auth", "id": "tx-1", "x": 1},
            {"kind": "9auth", "id": "tx-1"},
            {"kind": "auth", "id": "-tx"},
            {"kind": "auth", "id": "tx-1\n"},
            {"kind": "auth\n", "id": "tx-1"},
            {"kind": "auth", "id": "a" * 129},
            {"kind": "a" * 65, "id": "tx-1"},
            {"kind": 1, "id": "tx-1"},
            "auth",
            [],
        ],
    )
    def test_bad_link(self, raw: Any) -> None:
        assert refusal(check_link, raw)[0] == "bad_request"

    def test_a_card_number_in_a_link(self) -> None:
        assert refusal(check_link, {"kind": "auth", "id": "tx-" + VISA}) == (
            "card_number",
            "link.id",
        )
        assert refusal(check_link, {"kind": "k" + VISA, "id": "tx-1"}) == (
            "card_number",
            "link.kind",
        )

    def test_scenario(self) -> None:
        assert check_scenario("card-fraud") == "card-fraud"
        for bad in ("", "-a", "a b", "a" * 65, "card-fraud\n", 5, None):
            assert refusal(check_scenario, bad) == ("bad_scenario", "scenario")
        assert refusal(check_scenario, VISA_GROUPED.replace(" ", "-")) == (
            "card_number",
            "scenario",
        )

    def test_time_colour_decision_through_the_fields(self) -> None:
        good = draft()
        assert check_draft(good) == good
        for key, bad in [
            ("time", True),
            ("time", 1.5),
            ("time", -1),
            ("time", 4102444800001),
            ("time", "5"),
            ("colour", "alarm"),
            ("colour", "#fff"),
            ("colour", "R1"),
            ("decision", "PASS"),
            ("decision", None),
        ]:
            raw = {**good, key: bad}
            assert refusal(check_draft, raw) == ("bad_request", key), (key, bad)
        assert check_draft({**good, "time": 4102444800000})["time"] == 4102444800000
        assert check_draft({**good, "time": 0})["time"] == 0
        out = check_draft({**good, "time": 5.0})
        assert out["time"] == 5 and isinstance(out["time"], int)

    def test_the_six_colour_slots_and_three_decisions(self) -> None:
        for c in ("r0", "r1", "r2", "r3", "r4", "muted"):
            assert check_note_fields(fields(colour=c))["colour"] == c
        for d in ("none", "pass", "fail"):
            assert check_note_fields(fields(decision=d))["decision"] == d

    def test_note_fields_take_exactly_five_keys(self) -> None:
        assert refusal(check_note_fields, {**fields(), "time": 5}) == ("bad_request", "")
        missing = fields()
        del missing["colour"]
        assert refusal(check_note_fields, missing) == ("bad_request", "")
        assert refusal(check_note_fields, []) == ("bad_request", "")

    def test_a_draft_refuses_the_backends_own_column_names(self) -> None:
        assert refusal(check_draft, {**draft(), "time_ms": 5})[0] == "bad_request"

    def test_the_first_failing_field_names_its_path(self) -> None:
        assert refusal(check_note_fields, fields(body={"v": 2, "content": []})) == (
            "body_schema",
            "body",
        )
        assert refusal(check_note_fields, fields(category=VISA)) == ("card_number", "category")
        assert refusal(check_note_fields, fields(link={"kind": "a", "id": "tx-" + VISA})) == (
            "card_number",
            "link.id",
        )


class TestCategories:
    def test_the_starters(self) -> None:
        assert list(STARTER_CATEGORIES) == ["Note", "Question", "Follow up", "Source", "Context"]

    def test_valid_names(self) -> None:
        assert check_category_name("Triage") == "Triage"
        assert check_category_name("x" * 24) == "x" * 24
        assert check_category_name("Zur" + chr(0xFC) + "ck") == "Zur" + chr(0xFC) + "ck"

    @pytest.mark.parametrize(
        "bad,code",
        [
            ("", "bad_request"),
            (" Triage", "bad_request"),
            ("Triage ", "bad_request"),
            ("x" * 25, "too_long"),
            ("a" + chr(0) + "b", "bad_request"),
            ("a" + chr(0x200B) + "b", "bad_request"),
            ("a" + chr(0xAD) + "b", "bad_request"),
            ("e" + chr(0x0301), "bad_request"),
            ("a" + chr(0xD800), "bad_request"),
            (5, "bad_request"),
            (None, "bad_request"),
        ],
    )
    def test_refused_names(self, bad: Any, code: str) -> None:
        assert refusal(check_category_name, bad) == (code, "category")

    def test_length_is_in_code_points(self) -> None:
        assert check_category_name(chr(0x1F600) * 24)
        assert refusal(check_category_name, chr(0x1F600) * 25)[0] == "too_long"

    def test_a_card_number_is_refused(self) -> None:
        assert refusal(check_category_name, VISA) == ("card_number", "category")
        assert refusal(check_category_name, VISA_GROUPED) == ("card_number", "category")

    def test_the_caller_names_the_path(self) -> None:
        assert refusal(check_category_name, "", "categories[2]") == ("bad_request", "categories[2]")

    def test_normalise_is_nfc_then_trim(self) -> None:
        assert normalize_category_name("  e" + chr(0x0301) + " ") == chr(0xE9)

    def test_names_are_equal_ignoring_case_with_lower_case_and_trim(self) -> None:
        assert same_category("Follow up", "FOLLOW UP")
        assert same_category("zur" + chr(0xFC) + "ck", "ZUR" + chr(0xDC) + "CK")  # not ASCII only
        assert not same_category("Note", "Notes")
        assert category_exists(["Note", "Question"], "question")
        assert not category_exists([], "Note")


class TestNoteShapeAndId:
    def good_note(self, **over: Any) -> dict[str, Any]:
        return {"id": GOOD_ID, "seq": 1, **draft(), **over}

    def test_a_note_has_exactly_these_nine_keys(self) -> None:
        n = self.good_note()
        assert sorted(check_note(n)) == sorted(
            ["id", "scenario", "time", "seq", "link", "colour", "category", "decision", "body"]
        )
        assert refusal(check_note, {**n, "time_ms": 1})[0] == "bad_request"
        assert refusal(check_note, {k: v for k, v in n.items() if k != "seq"})[0] == "bad_request"

    @pytest.mark.parametrize(
        "bad",
        [
            "note-" + "A" * 32,
            "note-" + "a" * 31,
            "note-" + "a" * 33,
            "x-" + "a" * 32,
            5,
            None,
            GOOD_ID + "\n",
        ],
    )
    def test_bad_ids(self, bad: Any) -> None:
        assert refusal(check_note, self.good_note(id=bad)) == ("bad_request", "id")
        assert not is_note_id(bad)

    def test_the_id_takes_the_guard(self) -> None:
        assert is_note_id(VISA_ID)  # the pattern alone admits it
        assert refusal(check_note, self.good_note(id=VISA_ID)) == ("card_number", "id")

    @pytest.mark.parametrize("bad", [0, -1, True, 1.5, "1", None, 2**53, 10**12, int(VISA)])
    def test_bad_seq(self, bad: Any) -> None:
        assert refusal(check_note, self.good_note(seq=bad)) == ("bad_request", "seq")

    def test_seq_is_bounded_to_twelve_digits_far_above_the_note_limit(self) -> None:
        # seq is the highest seq plus one and is never reused, so the bound sits far above the
        # 1000 note limit; 12 digits can never hold a run of 13 digits
        assert LIMITS["max_seq"] == 999_999_999_999
        assert LIMITS["max_seq"] >= LIMITS["notes_per_scenario"] * 1000
        for ok in (1, 1000, 999_999_999_999):
            assert check_note(self.good_note(seq=ok))["seq"] == ok

    def test_a_stored_row_with_a_long_seq_is_refused_before_it_is_served(self) -> None:
        row = {
            "id": GOOD_ID,
            "scenario": "card-fraud",
            "seq": int(VISA),
            "time_ms": 5,
            "link_kind": None,
            "link_id": None,
            "colour": "r1",
            "category": "Note",
            "decision": "none",
            "body": body_to_json(hello()),
        }
        assert refusal(note_from_row, row) == ("bad_request", "seq")
        assert note_from_row({**row, "seq": 7})["seq"] == 7

    def test_a_file_note_with_a_long_seq_is_refused_with_its_path(self) -> None:
        n = {**file_doc()["notes"][0], "seq": int(VISA)}
        assert refusal(check_file, file_doc(notes=[n])) == ("bad_file", "notes[0].seq")

    def test_make_note_id_draws_again_when_the_guard_refuses(self) -> None:
        draws = [
            uuid.UUID(hex=VISA + "abcdefabcdefabcd"),
            uuid.UUID(hex="4111-1111-1111-1111-abcdefabcdefabcd".replace("-", "")),
            uuid.UUID(hex="0123456789abcdef0123456789abcdef"),
        ]
        made = make_note_id(lambda: draws.pop(0))
        assert made == GOOD_ID
        assert draws == []

    def test_make_note_id_gives_up_without_naming_an_id(self) -> None:
        bad = uuid.UUID(hex=VISA + "abcdefabcdefabcd")
        with pytest.raises(RuntimeError) as info:
            make_note_id(lambda: bad, max_draws=3)
        assert VISA not in str(info.value)

    def test_a_made_id_passes_the_pattern_and_the_guard(self) -> None:
        for _ in range(200):
            assert is_note_id(make_note_id())


def file_doc(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "format": "ffr-notes",
        "version": 1,
        "scenario": "card-fraud",
        "categories": ["Triage"],
        "notes": [
            {
                "id": GOOD_ID,
                "time": 5,
                "link": None,
                "colour": "r2",
                "category": "Triage",
                "decision": "pass",
                "seq": 1,
                "body": hello(),
            }
        ],
    }
    base.update(over)
    return base


class TestFile:
    def test_a_good_version_one_file_comes_back_lifted_to_version_two(self) -> None:
        f = file_doc()
        out = check_file(f)
        assert out == {**f, "version": 2, "nodes": [], "paths": [], "failCategories": []}
        assert list(out) == [
            "format",
            "version",
            "scenario",
            "categories",
            "notes",
            "nodes",
            "paths",
            "failCategories",
        ]

    def test_the_scenario_list_is_honoured_when_given(self) -> None:
        assert check_file(file_doc(), ["card-fraud", "x"])
        assert refusal(check_file, file_doc(), ["x"]) == ("bad_scenario", "scenario")

    @pytest.mark.parametrize(
        "raw",
        [
            {**file_doc(), "extra": 1},
            {**file_doc(), "format": "other"},
            {**file_doc(), "version": 2},
            {k: v for k, v in file_doc().items() if k != "notes"},
            file_doc(categories={}),
            file_doc(notes={}),
            file_doc(categories=["Triage", "TRIAGE"]),
            [],
            None,
        ],
    )
    def test_bad_file(self, raw: Any) -> None:
        assert refusal(check_file, raw)[0] == "bad_file"

    def test_a_note_keeps_its_row_keys_and_never_a_scenario(self) -> None:
        f = file_doc()
        f["notes"][0]["scenario"] = "card-fraud"
        assert refusal(check_file, f)[0] == "bad_file"

    def test_more_than_500_notes_is_too_large(self) -> None:
        f = file_doc(notes=[file_doc()["notes"][0]] * 501)
        assert refusal(check_file, f) == ("too_large", "notes")

    def test_a_file_note_time_outside_the_design_range_is_refused_with_its_path(self) -> None:
        # The backend cannot know a scenario's own span of time (a pack declares a timestamp
        # field per node in its manifest, the backend holds one active database, and the page's
        # span changes with the view). The bound it can state is the design's range, 0 to
        # 4102444800000.
        n = file_doc()["notes"][0]
        for bad in (-1, 4102444800001, 10**13, 1.5, "5"):
            assert refusal(check_file, file_doc(notes=[{**n, "time": bad}])) == (
                "bad_file",
                "notes[0].time",
            )
        for good in (0, 1763556003600, 4102444800000):
            assert check_file(file_doc(notes=[{**n, "time": good}]))["notes"][0]["time"] == good

    def test_a_duplicate_id_is_bad(self) -> None:
        n = file_doc()["notes"][0]
        assert refusal(check_file, file_doc(notes=[n, dict(n)])) == ("bad_file", "notes[1].id")

    def test_a_card_number_anywhere_refuses_the_whole_file_with_a_path(self) -> None:
        n = file_doc()["notes"][0]
        bad_body = {**n, "id": "note-" + "b" * 32, "body": with_text("x " + VISA)}
        assert refusal(check_file, file_doc(notes=[n, bad_body])) == (
            "card_number",
            "notes[1].body",
        )
        assert refusal(check_file, file_doc(notes=[{**n, "id": VISA_ID}])) == (
            "card_number",
            "notes[0].id",
        )
        assert refusal(check_file, file_doc(categories=["ok", VISA])) == (
            "card_number",
            "categories[1]",
        )
        assert (
            refusal(check_file, file_doc(scenario=VISA_GROUPED.replace(" ", "-")))[0]
            == "card_number"
        )
        link = {"kind": "auth", "id": "tx-" + VISA}
        assert refusal(check_file, file_doc(notes=[{**n, "link": link}])) == (
            "card_number",
            "notes[0].link.id",
        )

    def test_a_schema_failure_in_a_note_is_a_bad_file_with_the_path(self) -> None:
        n = file_doc()["notes"][0]
        assert refusal(check_file, file_doc(notes=[{**n, "colour": "alarm"}])) == (
            "bad_file",
            "notes[0].colour",
        )
        assert refusal(check_file, file_doc(notes=[{**n, "body": {"v": 9}}]))[0] == "bad_file"
