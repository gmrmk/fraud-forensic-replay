/**
 * The question before the page unloads: asked only on the static site, and only while some note,
 * node, path or Fail category is not in a file (or was changed since the last save or load of a file).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { NO_MARKS, armUnloadPrompt, hasUnsaved, markSaved, marksAwareSignature, marksOf, resetUnsaved, type MarksLists } from "./unsaved";
import { bodyOf, makeNode, makeNote, makePath } from "../notes/test-fixtures";

const A = makeNote({ id: "note-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seq: 1 });
const B = makeNote({ id: "note-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", seq: 2, time: 1763556009000 });
const marks = (over: Partial<MarksLists> = {}): MarksLists => ({ ...NO_MARKS, ...over });
const sig = (m: MarksLists, notes = [A]) => marksAwareSignature(notes, m.nodes, m.paths, m.failCategories);

function unload(target: EventTarget): Event {
  const e = new Event("beforeunload", { cancelable: true });
  target.dispatchEvent(e);
  return e;
}

describe("unsaved notes", () => {
  beforeEach(() => resetUnsaved());

  it("no notes: nothing to lose. Notes never saved: unsaved", () => {
    expect(hasUnsaved([], NO_MARKS)).toBe(false);
    expect(hasUnsaved([A], NO_MARKS)).toBe(true);
  });

  it("saved to a file, or loaded from one: not unsaved, until a note is added, changed or removed", () => {
    markSaved([A], NO_MARKS);
    expect(hasUnsaved([A], NO_MARKS)).toBe(false);
    expect(hasUnsaved([A, B], NO_MARKS)).toBe(true);
    expect(hasUnsaved([{ ...A, body: bodyOf("Changed.") }], NO_MARKS)).toBe(true);
    expect(hasUnsaved([{ ...A, decision: "pass" }], NO_MARKS)).toBe(true);
    expect(hasUnsaved([], NO_MARKS)).toBe(false);
  });

  it("the signature changes with every field a notes file holds", () => {
    const base = sig(NO_MARKS);
    for (const changed of [{ time: A.time + 1 }, { colour: "r2" as const }, { category: "Source" }, { link: { kind: "auth", id: "x1" } }, { seq: 2 }]) {
      expect(sig(NO_MARKS, [{ ...A, ...changed }])).not.toBe(base);
    }
    expect(sig(NO_MARKS, [{ ...A }])).toBe(base);
  });
});

describe("unsaved marks", () => {
  beforeEach(() => resetUnsaved());
  const node = makeNode({ pinned: true, disposition: "fail", category: "Lead", settled: true });
  const path = makePath();

  it("the signature changes with every field of a node, a path and a Fail category, and not with a copy", () => {
    const base = sig(marks({ nodes: [node], paths: [path], failCategories: ["Lead"] }));
    const nodeChanges: Partial<typeof node>[] = [
      { scenario: "priya-ato" },
      { record: { kind: "auth", id: "rec-1" } },
      { record: { kind: "stop", id: "rec-2" } },
      { pinned: false },
      { disposition: "wait", category: null },
      { category: "Other" },
      { settled: false },
    ];
    for (const c of nodeChanges) expect(sig(marks({ nodes: [{ ...node, ...c }], paths: [path], failCategories: ["Lead"] }))).not.toBe(base);
    const pathChanges: Partial<typeof path>[] = [
      { id: "path-" + "f".repeat(32) },
      { seq: 2 },
      { scenario: "priya-ato" },
      { name: "Renamed" },
      { stops: [path.stops[1], path.stops[0]] },
      { stops: [path.stops[0], { kind: "stop", id: "rec-9" }] },
    ];
    for (const c of pathChanges) expect(sig(marks({ nodes: [node], paths: [{ ...path, ...c }], failCategories: ["Lead"] }))).not.toBe(base);
    expect(sig(marks({ nodes: [node], paths: [path], failCategories: ["Lead", "More"] }))).not.toBe(base);
    expect(sig(marks({ nodes: [node], paths: [path], failCategories: [] }))).not.toBe(base);
    const copy = marks({ nodes: [{ ...node, record: { ...node.record } }], paths: [{ ...path, stops: [...path.stops] }], failCategories: ["Lead"] });
    expect(sig(copy)).toBe(base);
  });

  it("hasUnsaved is false with four empty lists and true with only a cleared settled node", () => {
    expect(hasUnsaved([], marks())).toBe(false);
    expect(hasUnsaved([], marks({ nodes: [makeNode({ settled: true })] }))).toBe(true);
    expect(hasUnsaved([], marks({ nodes: [node] }))).toBe(true);
    expect(hasUnsaved([], marks({ paths: [path] }))).toBe(true);
    expect(hasUnsaved([], marks({ failCategories: ["Lead"] }))).toBe(true);
  });

  it("a node that is pinned false, none, null and settled false (a pin pressed twice) is left out of the signature and of the test", () => {
    const untouched = makeNode({ pinned: false, disposition: "none", category: null, settled: false });
    expect(hasUnsaved([], marks({ nodes: [untouched] }))).toBe(false);
    expect(sig(marks({ nodes: [untouched] }))).toBe(sig(marks()));
    // a cleared row that was settled still counts, and so does a pin
    expect(sig(marks({ nodes: [{ ...untouched, settled: true }] }))).not.toBe(sig(marks()));
    expect(sig(marks({ nodes: [{ ...untouched, pinned: true }] }))).not.toBe(sig(marks()));
  });

  it("markSaved(notes, marks) then hasUnsaved is false, until any list changes", () => {
    const held = marks({ nodes: [node], paths: [path], failCategories: ["Lead"] });
    expect(hasUnsaved([A], held)).toBe(true);
    markSaved([A], held);
    expect(hasUnsaved([A], held)).toBe(false);
    expect(hasUnsaved([A], marks({ nodes: [{ ...node, pinned: false }], paths: [path], failCategories: ["Lead"] }))).toBe(true);
    expect(hasUnsaved([A], marks({ ...held, paths: [] }))).toBe(true);
    expect(hasUnsaved([A], marks({ ...held, failCategories: [] }))).toBe(true);
  });

  it("marks alone count: nodes pressed with no note make the page unsaved, and a save makes it saved", () => {
    const only = marks({ nodes: [node] });
    expect(hasUnsaved([], only)).toBe(true);
    markSaved([], only);
    expect(hasUnsaved([], only)).toBe(false);
  });

  it("marksOf takes the three lists of a marks state", () => {
    const state = { nodes: [node], paths: [path], failCategories: ["Lead"], extra: 1 };
    expect(marksOf(state)).toEqual({ nodes: [node], paths: [path], failCategories: ["Lead"] });
  });
});

describe("armUnloadPrompt", () => {
  beforeEach(() => resetUnsaved());

  it("static build with an unsaved note: the unload is asked about", () => {
    const target = new EventTarget();
    armUnloadPrompt({ isStatic: true, getNotes: () => [A], getMarks: () => NO_MARKS, target });
    expect(unload(target).defaultPrevented).toBe(true);
  });

  it("static build with no notes, or notes in a file: no question", () => {
    const target = new EventTarget();
    let notes = [] as ReturnType<typeof makeNote>[];
    armUnloadPrompt({ isStatic: true, getNotes: () => notes, getMarks: () => NO_MARKS, target });
    expect(unload(target).defaultPrevented).toBe(false);
    notes = [A];
    markSaved(notes, NO_MARKS);
    expect(unload(target).defaultPrevented).toBe(false);
    notes = [A, B];
    expect(unload(target).defaultPrevented).toBe(true);
  });

  it("asks while a node is unsaved, and not after it was saved", () => {
    const target = new EventTarget();
    let held = marks();
    armUnloadPrompt({ isStatic: true, getNotes: () => [], getMarks: () => held, target });
    expect(unload(target).defaultPrevented).toBe(false);
    held = marks({ nodes: [makeNode({ pinned: true })] });
    expect(unload(target).defaultPrevented).toBe(true);
    markSaved([], held);
    expect(unload(target).defaultPrevented).toBe(false);
  });

  it("the live app never asks: the backend holds the notes and the marks", () => {
    const target = new EventTarget();
    armUnloadPrompt({ isStatic: false, getNotes: () => [A], getMarks: () => marks({ nodes: [makeNode({ pinned: true })] }), target });
    expect(unload(target).defaultPrevented).toBe(false);
  });

  it("the returned function takes the listener off", () => {
    const target = new EventTarget();
    const off = armUnloadPrompt({ isStatic: true, getNotes: () => [A], getMarks: () => NO_MARKS, target });
    off();
    expect(unload(target).defaultPrevented).toBe(false);
  });
});
