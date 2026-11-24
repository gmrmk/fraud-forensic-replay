/**
 * What each layer draws for the investigator's marks: the model's `YourMark` list read through the one
 * function (`drawState`). Inputs are built by hand, and each test names the row of the truth table
 * (BUILD-PLAN C5.2) it reads. The facts function is the real `factsIndex` over the same nodes and
 * notes, so the one function sees the marks as the app would.
 */
import { describe, it, expect } from "vitest";
import { kindLabelOf, markViews, type MarkView } from "./mark-views";
import { factsIndex, type YourMark } from "../../lib/marks/select";
import { canonicalKind, type Disposition, type RecordRef } from "../../lib/marks/types";
import type { DrawInputs } from "../../lib/marks/draw";
import type { ScenarioNode } from "../../lib/scenarios";
import { infoOf, makeNode, makeNote } from "../../lib/notes/test-fixtures";
import { markName } from "../../lib/tooltip-words/marks";

const SCENARIO = "card-fraud";
const PLAYHEAD = 1_000_000;
const PAST = 500_000;
const AHEAD = 2_000_000;

interface Spec {
  kind?: string;
  id: string;
  /** The record's time; null is a record with none. */
  time: number | null;
  pinned?: boolean;
  disposition?: Disposition;
  notes?: number;
  category?: string | null;
  headline?: string;
}

/** A YourMark, with the node and notes it implies and an info whose `draw` carries the time. */
function markOf(s: Spec): YourMark {
  const kind = s.kind ?? "stop";
  const record: RecordRef = { kind: canonicalKind(kind), id: s.id };
  const touched = s.pinned === true || (s.disposition ?? "none") !== "none";
  const node = touched
    ? makeNode({ record, pinned: s.pinned ?? false, disposition: s.disposition ?? "none", category: s.category ?? null })
    : null;
  const notes = Array.from({ length: s.notes ?? 0 }, (_, i) => makeNote({ id: `note-${s.id}${i}`.padEnd(37, "a"), seq: i + 1, link: record }));
  const info = infoOf({
    kind,
    headline: s.headline ?? "Corner Store",
    time: s.time,
    lngLat: kind === "place" ? { lng: 1, lat: 2 } : { lng: -95.37, lat: 29.76 },
    draw: { kind, id: s.id, timestamp: s.time ?? 0, fields: {} },
  });
  return { record, info, node, notes };
}

interface Switches {
  kindOff?: readonly string[];
  pinWins?: boolean;
  placesOn?: boolean;
  yours?: { on: boolean; facets: Partial<Record<"pinned" | "pass" | "fail" | "wait" | "noted" | "inPath", boolean>> };
  selected?: RecordRef | null;
  windowed?: boolean;
}

function inputs(marks: readonly YourMark[], sw: Switches = {}): DrawInputs {
  const nodes = marks.flatMap((m) => (m.node ? [m.node] : []));
  const notes = marks.flatMap((m) => m.notes);
  const facts = factsIndex(SCENARIO, nodes, notes, []);
  const off = sw.kindOff ?? [];
  const all = { pinned: true, pass: true, fail: true, wait: true, noted: true, inPath: true };
  return {
    kindOn: (kind) => !off.includes(kind),
    valueOn: () => true,
    filterField: () => null,
    yours: { on: sw.yours?.on ?? false, facets: { ...all, ...sw.yours?.facets } },
    facts,
    placesOn: sw.placesOn ?? true,
    pinWins: sw.pinWins ?? true,
    selected: sw.selected ?? null,
    playhead: PLAYHEAD,
    windowed: sw.windowed ?? true,
  };
}

const NONE = (): boolean => false;
const LABEL = (k: string): string => canonicalKind(k);
const run = (marks: readonly YourMark[], sw?: Switches): MarkView[] => markViews(marks, inputs(marks, sw), NONE, LABEL);
const only = (marks: readonly YourMark[], sw?: Switches): MarkView => {
  const out = run(marks, sw);
  expect(out).toHaveLength(1);
  return out[0];
};

describe("markViews, the rows of the truth table", () => {
  it("row 1 and 5: a marked record reached by the playhead is lit on both surfaces, with its dot", () => {
    const v = only([markOf({ id: "a", time: PAST, disposition: "pass" })]);
    expect(v.timeline).toBe("lit");
    expect(v.globe).toBe("lit");
    expect(v.dot).toBe(true);
  });

  it("row 6: a marked, unpinned record ahead of the playhead is dim under the track and absent on the globe", () => {
    const v = only([markOf({ id: "a", time: AHEAD, disposition: "pass" })]);
    expect(v.timeline).toBe("dim");
    expect(v.globe).toBe("none");
    expect(v.dot).toBe(false);
  });

  it("row 7: a pinned record ahead of the playhead is dim on both surfaces and has no dot", () => {
    const v = only([markOf({ id: "a", time: AHEAD, pinned: true })]);
    expect(v.timeline).toBe("dim");
    expect(v.globe).toBe("dim");
    expect(v.dot).toBe(false);
  });

  it("row 8 and 9 with the pin winning: a pinned record of a switched-off kind keeps its marks", () => {
    const reached = only([markOf({ id: "a", time: PAST, pinned: true })], { kindOff: ["stop"], pinWins: true });
    expect([reached.timeline, reached.globe]).toEqual(["lit", "lit"]);
    const ahead = only([markOf({ id: "a", time: AHEAD, pinned: true })], { kindOff: ["stop"], pinWins: true });
    expect([ahead.timeline, ahead.globe]).toEqual(["dim", "dim"]);
  });

  it("row 8 and 9 with the pin not winning (until the layers item): the record is left out", () => {
    expect(run([markOf({ id: "a", time: PAST, pinned: true })], { kindOff: ["stop"], pinWins: false })).toEqual([]);
    expect(run([markOf({ id: "a", time: AHEAD, pinned: true })], { kindOff: ["stop"], pinWins: false })).toEqual([]);
  });

  it("row 10: a marked, unpinned record of a switched-off kind is left out", () => {
    expect(run([markOf({ id: "a", time: PAST, disposition: "fail" })], { kindOff: ["stop"] })).toEqual([]);
  });

  it("row 15: with Yours on and its Pinned facet off, a pinned-only record is left out", () => {
    const marks = [markOf({ id: "a", time: PAST, pinned: true })];
    expect(run(marks, { yours: { on: true, facets: { pinned: false } } })).toEqual([]);
    expect(run(marks, { yours: { on: true, facets: {} } })).toHaveLength(1);
  });

  it("row 18: an untimed, pinned record keeps its views and its time is null", () => {
    const v = only([markOf({ id: "a", time: null, pinned: true })]);
    expect(v.timeline).toBe("lit");
    expect(v.globe).toBe("lit");
    expect(v.time).toBeNull();
  });

  it("row 19: a marked place with Places off keeps its globe mark and has no dot", () => {
    const v = only([markOf({ kind: "place", id: "p", time: null, pinned: true })], { placesOn: false });
    expect(v.globe).toBe("lit");
    expect(v.dot).toBe(false);
  });

  it("row 20: a marked place with Places on has its dot", () => {
    const v = only([markOf({ kind: "place", id: "p", time: null, pinned: true })], { placesOn: true });
    expect(v.globe).toBe("lit");
    expect(v.dot).toBe(true);
  });

  it("row 24: the selected record stays drawn against its switched-off kind", () => {
    const marks = [markOf({ id: "a", time: PAST, disposition: "pass" })];
    const v = only(marks, { kindOff: ["stop"], selected: { kind: "stop", id: "a" } });
    expect([v.timeline, v.globe, v.dot]).toEqual(["lit", "lit", true]);
  });

  it("before the playhead's bounds load, every shown marked record is reached", () => {
    const v = only([markOf({ id: "a", time: AHEAD, disposition: "pass" })], { windowed: false });
    expect([v.timeline, v.globe, v.dot]).toEqual(["lit", "lit", true]);
  });
});

describe("markViews, what each view carries", () => {
  it("leaves out a YourMark whose record is not in the data", () => {
    const m = markOf({ id: "a", time: PAST, pinned: true });
    expect(run([{ ...m, info: null }])).toEqual([]);
  });

  it("prints the canonical kind through the label function, and a node's label when one is given", () => {
    const fraud = markOf({ kind: "fraud", id: "tx", time: PAST, pinned: true });
    expect(only([fraud]).kindLabel).toBe("auth");
    const stop = markOf({ id: "a", time: PAST, pinned: true });
    const nodes = [{ kind: "stop", label: "Stop" }] as ScenarioNode[];
    const out = markViews([stop], inputs([stop]), NONE, (k) => kindLabelOf(k, nodes));
    expect(out[0].kindLabel).toBe("Stop");
  });

  it("counts the notes and takes pinned, disposition and category from the node", () => {
    const v = only([markOf({ id: "a", time: PAST, pinned: true, disposition: "fail", category: "Shared key", notes: 2 })]);
    expect([v.notes, v.pinned, v.disposition, v.category]).toEqual([2, true, "fail", "Shared key"]);
    expect(v.headline).toBe("Corner Store");
    expect(v.time).toBe(PAST);
    expect(v.lngLat).toEqual({ lng: -95.37, lat: 29.76 });
    expect(v.key).toBe("stop:a");
    expect(v.record).toEqual({ kind: "stop", id: "a" });
  });

  it("reads a record noted only (no node) as unpinned, with no disposition and no category", () => {
    const v = only([markOf({ id: "a", time: PAST, notes: 1 })]);
    expect([v.notes, v.pinned, v.disposition, v.category]).toEqual([1, false, "none", null]);
  });

  it("marks a decision kind through the function the caller passes", () => {
    const m = markOf({ kind: "review", id: "d", time: PAST, pinned: true });
    const out = markViews([m], inputs([m]), (k) => k === "review", LABEL);
    expect(out[0].decision).toBe(true);
    expect(only([markOf({ id: "a", time: PAST, pinned: true })]).decision).toBe(false);
  });

  it("keeps the input's order", () => {
    const marks = [
      markOf({ id: "c", time: PAST, pinned: true }),
      markOf({ id: "a", time: PAST, pinned: true }),
      markOf({ id: "b", time: PAST, pinned: true }),
    ];
    expect(run(marks).map((v) => v.record.id)).toEqual(["c", "a", "b"]);
  });
});

describe("kindLabelOf", () => {
  const nodes = [{ kind: "stop", label: "Stop" }] as ScenarioNode[];
  it("is the node's label, else the canonical kind", () => {
    expect(kindLabelOf("stop", nodes)).toBe("Stop");
    expect(kindLabelOf("fraud", nodes)).toBe("auth");
    expect(kindLabelOf("login", [])).toBe("login");
  });

  it("feeds the mark's name: a schema node prints its label, no node prints the canonical kind (B12)", () => {
    expect(markName(kindLabelOf("stop", nodes), "Corner Store")).toBe("Open your mark: Stop: Corner Store");
    expect(markName(kindLabelOf("fraud", []), "Corner Store")).toBe("Open your mark: auth: Corner Store");
  });
});
