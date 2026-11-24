/**
 * The move of saved note marks (D6): which node rows the move writes for the PASS or FAIL that notes
 * saved before. One table of the cases M1 to M9 of the contract, then the rules around it. Pure: no
 * store, no backing.
 */
import { describe, expect, it } from "vitest";
import { movedMarks } from "./move";
import type { RecordNode } from "./types";
import { clone, makeNode, makeNote } from "../notes/test-fixtures";
import type { Decision, Note, NoteLink } from "../notes/types";

const SCENARIO = "card-fraud";
const A: NoteLink = { kind: "stop", id: "rec-1" };

let n = 0;
/** A note linked to `link` (or to no record) holding `decision`; each has its own id. */
function note(link: NoteLink | null, decision: Decision, over: Partial<Note> = {}): Note {
  n += 1;
  return makeNote({ id: `note-${n.toString(16).padStart(32, "0")}`, seq: n, link, decision, ...over });
}
/** The row the move writes: canonical record, category null, settled true. */
const row = (record: NoteLink, disposition: RecordNode["disposition"], pinned = false): RecordNode =>
  makeNode({ record, disposition, pinned, category: null, settled: true });

describe("movedMarks: the cases of the contract (C3.1)", () => {
  const cases: { name: string; nodes: RecordNode[]; notes: Note[]; expected: RecordNode[] }[] = [
    { name: "M1 no node, no linked note: nothing", nodes: [], notes: [], expected: [] },
    { name: "M2 no node, linked notes that are all none: nothing", nodes: [], notes: [note(A, "none"), note(A, "none")], expected: [] },
    { name: "M3 no node, one PASS: a PASS node", nodes: [], notes: [note(A, "pass")], expected: [row(A, "pass")] },
    { name: "M3 no node, one FAIL: a FAIL node", nodes: [], notes: [note(A, "fail")], expected: [row(A, "fail")] },
    {
      name: "M3 an unsettled pinned-only node takes the PASS and keeps its pin",
      nodes: [makeNode({ record: A, pinned: true })],
      notes: [note(A, "pass")],
      expected: [row(A, "pass", true)],
    },
    {
      name: "M4 several notes, one decided value (with a none among them): that value",
      nodes: [],
      notes: [note(A, "pass"), note(A, "none"), note(A, "pass")],
      expected: [row(A, "pass")],
    },
    {
      name: "M5 a PASS and a FAIL disagree: the record is unmarked and settled",
      nodes: [],
      notes: [note(A, "pass"), note(A, "fail")],
      expected: [row(A, "none")],
    },
    {
      name: "M5 disagreeing notes on a pinned unsettled node: unmarked, the pin kept",
      nodes: [makeNode({ record: A, pinned: true })],
      notes: [note(A, "pass"), note(A, "fail")],
      expected: [row(A, "none", true)],
    },
    {
      name: "M6 a settled FAIL node is never written again",
      nodes: [makeNode({ record: A, disposition: "fail", settled: true })],
      notes: [note(A, "pass")],
      expected: [],
    },
    {
      name: "M6 a cleared settled node stops the move",
      nodes: [makeNode({ record: A, disposition: "none", settled: true })],
      notes: [note(A, "pass")],
      expected: [],
    },
    { name: "M7 a note with no record is left as it is", nodes: [], notes: [note(null, "pass"), note(null, "fail")], expected: [] },
    {
      name: "M8 another story's notes are ignored",
      nodes: [],
      notes: [note(A, "pass", { scenario: "priya-ato" })],
      expected: [],
    },
    {
      name: "M9 an unsettled pinned-only node with all none notes: nothing",
      nodes: [makeNode({ record: A, pinned: true })],
      notes: [note(A, "none")],
      expected: [],
    },
  ];
  it.each(cases)("$name", ({ nodes, notes, expected }) => {
    expect(movedMarks(SCENARIO, notes, nodes)).toEqual(expected);
  });
});

describe("movedMarks: the rules around the table", () => {
  it("another story's node does not count as the record's node", () => {
    const other = makeNode({ scenario: "priya-ato", record: A, disposition: "fail", settled: true });
    expect(movedMarks(SCENARIO, [note(A, "pass")], [other])).toEqual([row(A, "pass")]);
  });

  it("a fraud link and an auth link are one record, and the row's kind is canonical", () => {
    const rows = movedMarks(SCENARIO, [note({ kind: "fraud", id: "tx-1" }, "pass"), note({ kind: "auth", id: "tx-1" }, "pass")], []);
    expect(rows).toEqual([row({ kind: "auth", id: "tx-1" }, "pass")]);
    const split = movedMarks(SCENARIO, [note({ kind: "fraud", id: "tx-1" }, "pass"), note({ kind: "auth", id: "tx-1" }, "fail")], []);
    expect(split).toEqual([row({ kind: "auth", id: "tx-1" }, "none")]);
  });

  it("a node held under auth stops the move for a fraud link of the same record", () => {
    const held = makeNode({ record: { kind: "auth", id: "tx-1" }, disposition: "pass", settled: true });
    expect(movedMarks(SCENARIO, [note({ kind: "fraud", id: "tx-1" }, "fail")], [held])).toEqual([]);
  });

  it("the rows come in record key order, one for each record", () => {
    const notes = [note({ kind: "stop", id: "rec-3" }, "fail"), note({ kind: "login", id: "lg-1" }, "pass"), note({ kind: "stop", id: "rec-1" }, "pass")];
    expect(movedMarks(SCENARIO, notes, []).map((r) => `${r.record.kind}:${r.record.id}`)).toEqual(["login:lg-1", "stop:rec-1", "stop:rec-3"]);
  });

  it("writes a settled row with category null and never a pinned value the node did not hold", () => {
    for (const r of movedMarks(SCENARIO, [note(A, "pass"), note({ kind: "stop", id: "rec-2" }, "fail")], [])) {
      expect(r).toMatchObject({ pinned: false, category: null, settled: true, scenario: SCENARIO });
    }
  });

  it("changes neither the notes nor the nodes it reads", () => {
    const notes = [note(A, "pass"), note(A, "fail"), note({ kind: "stop", id: "rec-2" }, "pass")];
    const nodes = [makeNode({ record: A, pinned: true })];
    const before = [clone(notes), clone(nodes)];
    movedMarks(SCENARIO, notes, nodes);
    expect([notes, nodes]).toEqual(before);
  });

  it("is a pure function: the same inputs give equal rows", () => {
    const notes = [note(A, "pass")];
    expect(movedMarks(SCENARIO, notes, [])).toEqual(movedMarks(SCENARIO, notes, []));
  });
});
