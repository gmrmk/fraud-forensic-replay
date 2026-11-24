/**
 * The pure selectors: the facts Yours reads, a record's node and notes, the facts index, Your marks'
 * order, the pinned records in time order and their join, a path's default name, the Fail category
 * words and list, and a path's stops as the surfaces draw them. Lookups are fakes built here.
 */
import { describe, it, expect } from "vitest";
import {
  YOURS_PREDICATES,
  factsIndex,
  failCategoryList,
  failWords,
  isMarked,
  joinPinned,
  nextPathName,
  nodeOf,
  notesOf,
  pathStops,
  pinnedInTimeOrder,
  yourMarks,
  yoursMatch,
} from "./select";
import * as facts from "./facts";
import { showInputsOf, type ShowSwitches } from "./draw";
import { YOURS_FACETS, type RecordFacts, type RecordRef, type YoursFacet } from "./types";
import type { RecordInfo, RecordLookup } from "../../components/notes/record-lookup";
import type { Entity } from "../entity";
import type { DecisionView } from "../verdicts";
import { VISA, infoOf, makeNode, makeNote, makePath } from "../notes/test-fixtures";

const NONE: RecordFacts = { pinned: false, disposition: "none", noted: false, inPath: false };
const f = (over: Partial<RecordFacts> = {}): RecordFacts => ({ ...NONE, ...over });
const ALL_ON: Record<YoursFacet, boolean> = { pinned: true, pass: true, fail: true, wait: true, noted: true, inPath: true };
const ALL_OFF: Record<YoursFacet, boolean> = { pinned: false, pass: false, fail: false, wait: false, noted: false, inPath: false };

describe("the facts the one function and Yours read", () => {
  it("re-exports the three names from the facts module, so one definition serves both", () => {
    expect(isMarked).toBe(facts.isMarked);
    expect(YOURS_PREDICATES).toBe(facts.YOURS_PREDICATES);
    expect(yoursMatch).toBe(facts.yoursMatch);
  });

  it("isMarked: pinned, or a disposition, or noted; in a path alone is not marked", () => {
    expect(isMarked(f())).toBe(false);
    expect(isMarked(f({ inPath: true }))).toBe(false);
    expect(isMarked(f({ pinned: true }))).toBe(true);
    expect(isMarked(f({ noted: true }))).toBe(true);
    for (const disposition of ["pass", "fail", "wait"] as const) expect(isMarked(f({ disposition }))).toBe(true);
  });

  it("YOURS_PREDICATES: each of the six tests its own fact", () => {
    expect(Object.keys(YOURS_PREDICATES)).toEqual([...YOURS_FACETS]);
    const cases: [YoursFacet, Partial<RecordFacts>][] = [
      ["pinned", { pinned: true }],
      ["pass", { disposition: "pass" }],
      ["fail", { disposition: "fail" }],
      ["wait", { disposition: "wait" }],
      ["noted", { noted: true }],
      ["inPath", { inPath: true }],
    ];
    for (const [facet, over] of cases) {
      expect(YOURS_PREDICATES[facet](f(over)), facet).toBe(true);
      expect(YOURS_PREDICATES[facet](f()), facet).toBe(false);
      for (const other of YOURS_FACETS) if (other !== facet) expect(YOURS_PREDICATES[other](f(over)), `${other} on ${facet}`).toBe(false);
    }
  });

  it("yoursMatch: an OR over the facets that are on; with all six off, nothing matches", () => {
    const touched = f({ pinned: true, disposition: "fail", noted: true, inPath: true });
    expect(yoursMatch(touched, ALL_ON)).toBe(true);
    expect(yoursMatch(touched, ALL_OFF)).toBe(false);
    expect(yoursMatch(f(), ALL_ON)).toBe(false);
    expect(yoursMatch(f({ pinned: true }), { ...ALL_OFF, pass: true })).toBe(false);
    expect(yoursMatch(f({ pinned: true }), { ...ALL_OFF, pass: true, pinned: true })).toBe(true);
    expect(yoursMatch(f({ disposition: "wait" }), { ...ALL_OFF, wait: true })).toBe(true);
  });
});

describe("nodeOf and notesOf", () => {
  const nodes = [makeNode({ record: { kind: "auth", id: "x" }, pinned: true }), makeNode({ record: { kind: "login", id: "x" } })];

  it("nodeOf compares records canonically", () => {
    expect(nodeOf(nodes, { kind: "fraud", id: "x" })).toBe(nodes[0]);
    expect(nodeOf(nodes, { kind: "login", id: "x" })).toBe(nodes[1]);
    expect(nodeOf(nodes, { kind: "auth", id: "y" })).toBeNull();
    expect(nodeOf([], { kind: "auth", id: "x" })).toBeNull();
  });

  it("notesOf keeps this story's notes linked to the record, in time then seq order", () => {
    const a = makeNote({ id: "note-a", seq: 2, time: 20, link: { kind: "fraud", id: "x" } });
    const b = makeNote({ id: "note-b", seq: 3, time: 10, link: { kind: "auth", id: "x" } });
    const c = makeNote({ id: "note-c", seq: 1, time: 20, link: { kind: "fraud", id: "x" } });
    const other = makeNote({ id: "note-d", seq: 4, scenario: "elsewhere", link: { kind: "auth", id: "x" } });
    const free = makeNote({ id: "note-e", seq: 5, link: null });
    const notLinked = makeNote({ id: "note-f", seq: 6, link: { kind: "auth", id: "y" } });
    const got = notesOf([a, b, c, other, free, notLinked], "card-fraud", { kind: "auth", id: "x" });
    expect(got.map((n) => n.id)).toEqual(["note-b", "note-c", "note-a"]);
  });
});

describe("factsIndex", () => {
  const nodes = [
    makeNode({ record: { kind: "auth", id: "a" }, pinned: true, disposition: "fail", category: "Shared key" }),
    makeNode({ record: { kind: "login", id: "b" }, disposition: "wait" }),
    makeNode({ scenario: "elsewhere", record: { kind: "login", id: "z" }, pinned: true }),
  ];
  const notes = [
    makeNote({ id: "note-1", link: { kind: "fraud", id: "a" } }),
    makeNote({ id: "note-2", link: { kind: "stop", id: "c" } }),
    makeNote({ id: "note-3", scenario: "elsewhere", link: { kind: "login", id: "z" } }),
    makeNote({ id: "note-4", link: null }),
  ];
  const paths = [
    makePath({ stops: [{ kind: "fraud", id: "a" }, { kind: "stop", id: "d" }] }),
    makePath({ id: "path-0123456789abcdef0123456789abcde0", seq: 2, scenario: "elsewhere", stops: [{ kind: "login", id: "z" }, { kind: "login", id: "y" }] }),
  ];
  const index = factsIndex("card-fraud", nodes, notes, paths);

  it("reads pinned and disposition from this story's nodes, noted from its notes, inPath from its paths", () => {
    expect(index({ kind: "auth", id: "a" })).toEqual({ pinned: true, disposition: "fail", noted: true, inPath: true });
    expect(index({ kind: "login", id: "b" })).toEqual({ pinned: false, disposition: "wait", noted: false, inPath: false });
    expect(index({ kind: "stop", id: "c" })).toEqual({ pinned: false, disposition: "none", noted: true, inPath: false });
    expect(index({ kind: "stop", id: "d" })).toEqual({ pinned: false, disposition: "none", noted: false, inPath: true });
  });

  it("reads a fraud link and an auth record as one record", () => {
    expect(index({ kind: "fraud", id: "a" })).toEqual(index({ kind: "auth", id: "a" }));
  });

  it("ignores another story's nodes, notes and paths, and gives an unknown record no fact", () => {
    expect(index({ kind: "login", id: "z" })).toEqual(NONE);
    expect(index({ kind: "login", id: "y" })).toEqual(NONE);
    expect(index({ kind: "auth", id: "nope" })).toEqual(NONE);
  });
});

/** A lookup that finds exactly the records named, each at its time (null for none). */
function lookupWith(found: Record<string, number | null>): RecordLookup {
  return (link: RecordRef): RecordInfo | null => {
    const key = `${link.kind === "fraud" ? "auth" : link.kind}:${link.id}`;
    if (!Object.hasOwn(found, key)) return null;
    return infoOf({ kind: link.kind, time: found[key], draw: { kind: link.kind, id: link.id, timestamp: found[key] ?? 0, fields: {} } });
  };
}

describe("yourMarks", () => {
  const scenario = "card-fraud";
  const node = (kind: string, id: string, over = {}) => makeNode({ record: { kind, id }, ...over });

  it("lists marked records only: a cleared node with no note is left out", () => {
    const nodes = [node("stop", "a", { pinned: true }), node("stop", "b"), node("stop", "c", { disposition: "pass" })];
    const got = yourMarks(scenario, nodes, [], lookupWith({ "stop:a": 1, "stop:b": 2, "stop:c": 3 }));
    expect(got.map((m) => m.record.id)).toEqual(["a", "c"]);
  });

  it("lists a record that has only notes, with no node", () => {
    const note = makeNote({ id: "note-1", link: { kind: "fraud", id: "t" } });
    const got = yourMarks(scenario, [], [note], lookupWith({ "auth:t": 5 }));
    expect(got).toHaveLength(1);
    expect(got[0].node).toBeNull();
    expect(got[0].notes).toEqual([note]);
    expect(got[0].record).toEqual({ kind: "auth", id: "t" });
    expect(got[0].info?.time).toBe(5);
  });

  it("lists a cleared node that a note still marks, once, with its node and its notes", () => {
    const n = node("stop", "a");
    const note = makeNote({ id: "note-1", link: { kind: "stop", id: "a" } });
    const got = yourMarks(scenario, [n], [note], lookupWith({ "stop:a": 5 }));
    expect(got).toHaveLength(1);
    expect(got[0].node).toBe(n);
    expect(got[0].notes).toEqual([note]);
  });

  it("puts pinned first, then by time, untimed after timed, a record not in the data last, ties by record key", () => {
    const nodes = [
      node("stop", "late", { disposition: "pass" }),
      node("stop", "early", { disposition: "pass" }),
      node("stop", "untimed", { disposition: "pass" }),
      node("stop", "gone", { disposition: "pass" }),
      node("stop", "pinlate", { pinned: true }),
      node("stop", "pinearly", { pinned: true }),
      node("stop", "tie-b", { disposition: "pass" }),
      node("stop", "tie-a", { disposition: "pass" }),
    ];
    const lookup = lookupWith({
      "stop:late": 30,
      "stop:early": 10,
      "stop:untimed": null,
      "stop:pinlate": 40,
      "stop:pinearly": 5,
      "stop:tie-a": 20,
      "stop:tie-b": 20,
    });
    const got = yourMarks(scenario, nodes, [], lookup);
    expect(got.map((m) => m.record.id)).toEqual(["pinearly", "pinlate", "early", "tie-a", "tie-b", "late", "untimed", "gone"]);
    expect(got[got.length - 1].info).toBeNull();
  });

  it("leaves out another story's nodes and notes", () => {
    const nodes = [makeNode({ scenario: "elsewhere", pinned: true })];
    const notes = [makeNote({ scenario: "elsewhere", link: { kind: "stop", id: "rec-1" } })];
    expect(yourMarks(scenario, nodes, notes, lookupWith({ "stop:rec-1": 1 }))).toEqual([]);
  });
});

describe("pinnedInTimeOrder and joinPinned", () => {
  const pinned = (id: string, over = {}) => makeNode({ record: { kind: "stop", id }, pinned: true, ...over });

  it("keeps pinned, found, timed records in time order, then record key", () => {
    const nodes = [pinned("c"), pinned("b"), pinned("a"), pinned("noplace"), pinned("untimed"), pinned("gone"), makeNode({ record: { kind: "stop", id: "free" } })];
    const lookup = lookupWith({ "stop:c": 30, "stop:b": 10, "stop:a": 10, "stop:noplace": 20, "stop:untimed": null, "stop:free": 1 });
    expect(pinnedInTimeOrder(nodes, lookup).map((r) => r.id)).toEqual(["a", "b", "noplace", "c"]);
  });

  it("joinPinned is null under two records and gives the records from two on", () => {
    const lookup = lookupWith({ "stop:a": 1, "stop:b": 2 });
    expect(joinPinned([pinned("a")], lookup)).toBeNull();
    expect(joinPinned([], lookup)).toBeNull();
    expect(joinPinned([pinned("a"), pinned("b")], lookup)).toEqual([
      { kind: "stop", id: "a" },
      { kind: "stop", id: "b" },
    ]);
  });

  it("joinPinned cuts to 50 of 60 pinned records, the earliest 50", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `r${String(i).padStart(2, "0")}`);
    const found = Object.fromEntries(ids.map((id, i) => [`stop:${id}`, i + 1]));
    const got = joinPinned(ids.map((id) => pinned(id)), lookupWith(found));
    expect(got).toHaveLength(50);
    expect(got?.[0].id).toBe("r00");
    expect(got?.[49].id).toBe("r49");
  });

  it("joinPinned is null when only one of two pinned records has a time", () => {
    expect(joinPinned([pinned("a"), pinned("b")], lookupWith({ "stop:a": 1, "stop:b": null }))).toBeNull();
  });
});

describe("nextPathName", () => {
  const named = (...names: string[]) => names.map((name, i) => makePath({ name, seq: i + 1 }));

  it("is Path 1 for none and one more than the highest Path N", () => {
    expect(nextPathName([])).toBe("Path 1");
    expect(nextPathName(named("Path 1", "Path 2"))).toBe("Path 3");
    expect(nextPathName(named("Path 7", "Route"))).toBe("Path 8");
    expect(nextPathName(named("Path 2", "Path 9", "Path 4"))).toBe("Path 10");
  });

  it("counts the paths plus one when no name has the form", () => {
    expect(nextPathName(named("Route", "Alpha"))).toBe("Path 3");
    expect(nextPathName(named("Path", "Path x", "path 4", "Path 4 b"))).toBe("Path 5");
  });

  it("counts Path 07 as 7", () => {
    expect(nextPathName(named("Path 07"))).toBe("Path 8");
  });

  it("counts a name that matches even when its number is 0", () => {
    expect(nextPathName(named("Path 0"))).toBe("Path 1");
    expect(nextPathName(named("Route", "Path 0", "Other"))).toBe("Path 1");
  });
});

describe("failWords and failCategoryList", () => {
  const decision = (word: string, at: number, tone: DecisionView["tone"] = "fail"): DecisionView => ({
    id: `d-${at}-${word}`,
    entity: {} as Entity,
    tone,
    status: "FAIL",
    word,
    note: "",
    actor: "",
    target: "",
    keyField: "",
    key: "",
    events: [],
    at,
    atRaw: "",
  });

  it("takes the words of fail decisions only, first seen in time order, distinct ignoring case", () => {
    const got = failWords([
      decision("Account takeover", 30),
      decision("FRAUD", 10),
      decision("Passed", 15, "pass"),
      decision("Waiting", 16, "wait"),
      decision("fraud", 20),
      decision("Unknown", 25, "unknown"),
      decision("Shared key", 40),
    ]);
    expect(got).toEqual(["FRAUD", "Account takeover", "Shared key"]);
  });

  it("normalises a word, then checks it: too long, a card number and an empty word are left out", () => {
    const got = failWords([
      decision("  Padded  ", 1),
      decision("x".repeat(25), 2),
      decision(VISA, 3),
      decision("   ", 4),
      decision("x".repeat(24), 5),
    ]);
    expect(got).toEqual(["Padded", "x".repeat(24)]);
  });

  it("is empty with no fail decision", () => {
    expect(failWords([])).toEqual([]);
    expect(failWords([decision("Passed", 1, "pass")])).toEqual([]);
  });

  it("failCategoryList: the story's words, then typed ones no story word equals ignoring case", () => {
    expect(failCategoryList(["FRAUD", "Shared key"], ["shared KEY", "Triage"])).toEqual(["FRAUD", "Shared key", "Triage"]);
    expect(failCategoryList([], ["Triage", "triage", "Other"])).toEqual(["Triage", "Other"]);
    expect(failCategoryList(["FRAUD"], [])).toEqual(["FRAUD"]);
    expect(failCategoryList([], [])).toEqual([]);
  });
});

describe("pathStops", () => {
  const switches = (over: Partial<ShowSwitches> = {}): ShowSwitches => ({
    showAuths: true,
    showLogins: true,
    showPlaces: false,
    pinWins: true,
    hiddenKinds: [],
    hiddenValues: {},
    yoursOn: false,
    yoursFacets: ALL_ON,
    ...over,
  });
  const inputs = (over: Partial<ShowSwitches> = {}, selected: RecordRef | null = null) => showInputsOf(switches(over), [], () => NONE, selected);
  const stop = (id: string): RecordRef => ({ kind: "stop", id });
  const path = makePath({ stops: [stop("a"), stop("noplace"), stop("untimed"), stop("gone"), stop("hidden")] });
  const lookup: RecordLookup = (link) => {
    switch (link.id) {
      case "a":
        return infoOf({ time: 10 });
      case "noplace":
        return infoOf({ time: 20, lngLat: null });
      case "untimed":
        return infoOf({ time: null });
      case "hidden":
        return infoOf({ time: 40, draw: { kind: "hiddenkind", id: "hidden", timestamp: 40, fields: {} } });
      default:
        return null;
    }
  };

  it("numbers the stops from 1 in the path's order and keeps the record", () => {
    const got = pathStops(path, lookup, inputs());
    expect(got.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    expect(got.map((s) => s.record)).toEqual(path.stops);
  });

  it("a stop with no info is not shown, and is on neither surface", () => {
    const gone = pathStops(path, lookup, inputs())[3];
    expect(gone).toMatchObject({ info: null, shown: false, onGlobe: false, onTimeline: false });
  });

  it("a place puts a stop on the globe and a time puts it on the Timeline, each on its own", () => {
    const [a, noplace, untimed] = pathStops(path, lookup, inputs());
    expect(a).toMatchObject({ shown: true, onGlobe: true, onTimeline: true });
    expect(noplace).toMatchObject({ shown: true, onGlobe: false, onTimeline: true });
    expect(untimed).toMatchObject({ shown: true, onGlobe: true, onTimeline: false });
  });

  it("a hidden stop is on neither surface, and its number keeps its place", () => {
    const got = pathStops(path, lookup, inputs({ hiddenKinds: ["hiddenkind"] }));
    expect(got[4]).toMatchObject({ n: 5, shown: false, onGlobe: false, onTimeline: false });
    expect(got[0].shown).toBe(true);
  });

  it("a hidden stop that is the selected record is drawn on both surfaces", () => {
    const got = pathStops(path, lookup, inputs({ hiddenKinds: ["hiddenkind"] }, { kind: "hiddenkind", id: "hidden" }));
    expect(got[4]).toMatchObject({ n: 5, shown: true, onGlobe: true, onTimeline: true });
  });
});
