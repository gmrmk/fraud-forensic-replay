/**
 * The Your marks helpers: the kind's label from the manifest, the row's name, and the parts of its second
 * line. Marks are built from the fixtures, never as hand-written literals.
 */
import { describe, it, expect } from "vitest";
import { MID, kindLabelOf, markParts, markName } from "./your-marks";
import type { YourMark } from "../../lib/marks/select";
import type { ScenarioNode } from "../../lib/scenarios";
import { infoOf, makeNode, makeNote } from "../../lib/notes/test-fixtures";

const node = (kind: string, label: string): ScenarioNode => ({ kind, label, palette: kind, source: kind });
const NODES = [node("reset", "Limit reset"), node("stop", "Stop")];

const mark = (over: Partial<YourMark> = {}): YourMark => ({
  record: { kind: "stop", id: "rec-1" },
  info: infoOf(),
  node: makeNode(),
  notes: [],
  ...over,
});

describe("kindLabelOf", () => {
  it("gives the manifest node's label, and the kind itself when no node has it", () => {
    expect(kindLabelOf("reset", NODES)).toBe("Limit reset");
    expect(kindLabelOf("auth", NODES)).toBe("auth");
    expect(kindLabelOf("reset", [])).toBe("reset");
  });
});

describe("MID", () => {
  it("is the middle dot, built from its code point", () => {
    expect(MID).toBe(String.fromCharCode(0xb7));
  });
});

describe("markParts", () => {
  it("gives the word, the category, the note count and Pinned for a pinned FAIL record with two notes", () => {
    const m = mark({
      node: makeNode({ pinned: true, disposition: "fail", category: "Shared key" }),
      notes: [makeNote({ id: "note-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seq: 1 }), makeNote({ id: "note-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", seq: 2 })],
    });
    expect(markParts(m)).toEqual(["FAIL", "Shared key", "2 notes", "Pinned"]);
  });

  it("gives only the note count for a record with one note and no node", () => {
    expect(markParts(mark({ node: null, notes: [makeNote()] }))).toEqual(["1 note"]);
  });

  it("gives WAITING for a wait disposition, and nothing for a pinned-only record but Pinned", () => {
    expect(markParts(mark({ node: makeNode({ disposition: "wait" }) }))).toEqual(["WAITING"]);
    expect(markParts(mark({ node: makeNode({ pinned: true }) }))).toEqual(["Pinned"]);
  });

  it("leaves out a category that is not set, and a node that is cleared", () => {
    expect(markParts(mark({ node: makeNode({ disposition: "pass" }), notes: [makeNote()] }))).toEqual(["PASS", "1 note"]);
    expect(markParts(mark({ node: makeNode(), notes: [makeNote()] }))).toEqual(["1 note"]);
  });
});

describe("markName", () => {
  it("is the kind's label, a colon and the record's headline", () => {
    expect(markName(mark(), NODES)).toBe("Stop: Corner Store");
  });

  it("is the kind and the id for a record that is not in the data", () => {
    expect(markName(mark({ info: null, record: { kind: "gone", id: "d-9" } }), NODES)).toBe("gone: d-9");
  });

  it("never prints fraud: a transaction's kind is auth", () => {
    expect(markName(mark({ record: { kind: "auth", id: "tx-1" }, info: infoOf({ kind: "fraud", headline: "Shop" }) }), [])).toBe("auth: Shop");
  });
});
