/**
 * The page's checks for a node, a path and the marks of a file. The refusal tables are the backend's
 * twin (backend/tests/test_marks_schema.py): one fault in each case, the same code and path on both.
 */
import { describe, it, expect } from "vitest";
import {
  checkFileMarks,
  checkNode,
  checkNodeFields,
  checkPath,
  checkPathDraft,
  checkPathFields,
  checkPathName,
  checkRecord,
  compareRecords,
  isPathId,
  makePathId,
} from "./schema";
import { MARK_LIMITS } from "./types";
import { LIMITS, type Check } from "../notes/types";
import { refusesText } from "../notes/guard";
import { VISA, makeNode, makePath } from "../notes/test-fixtures";

const GOOD_PATH_ID = "path-0123456789abcdef0123456789abcdef";
const VISA_PATH_ID = "path-" + VISA + "abcdefabcdefabcd";

/** The failed check as `[code, where]`, or fails the test when it passed. */
function refused<T>(c: Check<T>): [string, string] {
  if (c.ok) throw new Error("expected a refusal");
  return [c.code, c.where];
}

/** A uuid of the fixed sources the tests draw ids from. */
function uuidOfHex(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const uuidOfInt = (i: number): string => uuidOfHex(i.toString(16).padStart(32, "0"));
/** A draw that holds the guard's test number in its hex digits. */
const VISA_UUID = uuidOfHex(VISA + "abcdefabcdefabcd");

const FIELDS = { pinned: true, disposition: "fail", category: "Shared key" };

describe("checkRecord", () => {
  it("writes fraud as auth and builds a fresh object", () => {
    const raw = { kind: "fraud", id: "tx-1" };
    const c = checkRecord(raw);
    expect(c).toEqual({ ok: true, value: { kind: "auth", id: "tx-1" } });
    expect(c.ok && c.value).not.toBe(raw);
    expect(checkRecord({ kind: "login", id: "lg-1" })).toEqual({ ok: true, value: { kind: "login", id: "lg-1" } });
  });

  it("refuses null, a shape with another key, a bad kind or id, at the record's path", () => {
    expect(refused(checkRecord(null))).toEqual(["bad_request", "record"]);
    expect(refused(checkRecord({ kind: "a", id: "b", extra: 1 }))).toEqual(["bad_request", "record"]);
    expect(refused(checkRecord({ kind: "1x", id: "b" }))).toEqual(["bad_request", "record.kind"]);
    expect(refused(checkRecord({ kind: "a", id: " b" }))).toEqual(["bad_request", "record.id"]);
    expect(refused(checkRecord(null, "stops[3]"))).toEqual(["bad_request", "stops[3]"]);
    expect(refused(checkRecord({ kind: "a", id: " b" }, "stops[3]"))).toEqual(["bad_request", "stops[3].id"]);
  });

  it("refuses a kind or an id that holds a card number", () => {
    expect(refused(checkRecord({ kind: "a" + VISA, id: "b" }))).toEqual(["card_number", "record.kind"]);
    expect(refused(checkRecord({ kind: "a", id: VISA }))).toEqual(["card_number", "record.id"]);
  });
});

describe("checkNodeFields", () => {
  it("takes exactly pinned, disposition and category and builds a fresh object", () => {
    const raw = { ...FIELDS };
    const c = checkNodeFields(raw);
    expect(c).toEqual({ ok: true, value: FIELDS });
    expect(c.ok && c.value).not.toBe(raw);
    expect(checkNodeFields({ pinned: false, disposition: "none", category: null }).ok).toBe(true);
    expect(checkNodeFields({ pinned: false, disposition: "wait", category: null }).ok).toBe(true);
  });

  it.each([
    ["a missing key", { pinned: true, disposition: "fail" }, ["bad_request", ""]],
    ["an extra key", { ...FIELDS, ifUnsettled: false }, ["bad_request", ""]],
    ["a pinned of 1", { ...FIELDS, pinned: 1 }, ["bad_request", "pinned"]],
    ["a pinned of 0", { ...FIELDS, pinned: 0 }, ["bad_request", "pinned"]],
    ["a pinned of a string", { ...FIELDS, pinned: "true" }, ["bad_request", "pinned"]],
    ["a disposition outside the four", { ...FIELDS, disposition: "maybe" }, ["bad_request", "disposition"]],
    ["a category of 25 code points", { ...FIELDS, category: "x".repeat(25) }, ["too_long", "category"]],
    ["a category with a card number", { ...FIELDS, category: VISA }, ["card_number", "category"]],
    ["a category with a trailing space", { ...FIELDS, category: "Shared key " }, ["bad_request", "category"]],
    ["a category with a control character", { ...FIELDS, category: "a\u0007b" }, ["bad_request", "category"]],
    ["a category that is not a string", { ...FIELDS, category: 5 }, ["bad_request", "category"]],
    ["a category with PASS", { pinned: false, disposition: "pass", category: "Shared key" }, ["bad_request", "category"]],
    ["a category with WAITING", { pinned: false, disposition: "wait", category: "Shared key" }, ["bad_request", "category"]],
    ["a category with none", { pinned: false, disposition: "none", category: "Shared key" }, ["bad_request", "category"]],
  ])("refuses %s", (_name, raw, expected) => {
    expect(refused(checkNodeFields(raw))).toEqual(expected);
  });

  it("names the path it was given", () => {
    expect(refused(checkNodeFields({ ...FIELDS, pinned: 1 }, "nodes[0]"))).toEqual(["bad_request", "nodes[0].pinned"]);
  });

  it("refuses an own __proto__ key that JSON.parse makes", () => {
    const raw = JSON.parse('{"pinned":true,"disposition":"fail","category":null,"__proto__":{"x":1}}');
    expect(refused(checkNodeFields(raw))).toEqual(["bad_request", ""]);
  });
});

describe("checkNode", () => {
  const WIRE = { scenario: "card-fraud", record: { kind: "fraud", id: "tx-0001" }, ...FIELDS, settled: true };

  it("takes the six keys, writes the record's kind canonical, and builds a fresh object in wire order", () => {
    const c = checkNode(WIRE);
    expect(c).toEqual({
      ok: true,
      value: { scenario: "card-fraud", record: { kind: "auth", id: "tx-0001" }, pinned: true, disposition: "fail", category: "Shared key", settled: true },
    });
    if (c.ok) {
      expect(Object.keys(c.value)).toEqual(["scenario", "record", "pinned", "disposition", "category", "settled"]);
      expect(c.value.record).not.toBe(WIRE.record);
    }
    expect(checkNode(makeNode()).ok).toBe(true);
  });

  it.each([
    ["a missing settled", (() => { const { settled: _s, ...rest } = WIRE; return rest; })(), ["bad_request", ""]],
    ["a settled of 1", { ...WIRE, settled: 1 }, ["bad_request", "settled"]],
    ["a settled of a string", { ...WIRE, settled: "true" }, ["bad_request", "settled"]],
    ["an extra key", { ...WIRE, ifUnsettled: false }, ["bad_request", ""]],
    ["a scenario that is not one", { ...WIRE, scenario: "no way" }, ["bad_scenario", "scenario"]],
    ["a scenario with a card number", { ...WIRE, scenario: VISA }, ["card_number", "scenario"]],
    ["a record with no id", { ...WIRE, record: { kind: "auth" } }, ["bad_request", "record"]],
    ["a record id with a card number", { ...WIRE, record: { kind: "auth", id: VISA } }, ["card_number", "record.id"]],
    ["a category with PASS", { ...WIRE, disposition: "pass" }, ["bad_request", "category"]],
  ])("refuses %s", (_name, raw, expected) => {
    expect(refused(checkNode(raw))).toEqual(expected);
  });

  it("names the path it was given", () => {
    expect(refused(checkNode({ ...WIRE, settled: 1 }, "nodes[2]"))).toEqual(["bad_request", "nodes[2].settled"]);
  });
});

describe("compareRecords", () => {
  it("orders by the joined kind:id string with a plain comparison", () => {
    const a1 = { kind: "a1", id: "x" };
    const a = { kind: "a", id: "x" };
    expect(compareRecords(a1, a)).toBe(-1);
    expect(compareRecords(a, a1)).toBe(1);
    expect(compareRecords(a, { kind: "a", id: "x" })).toBe(0);
    expect(compareRecords({ kind: "fraud", id: "x" }, { kind: "auth", id: "x" })).toBe(0);
    expect(compareRecords({ kind: "b", id: "B" }, { kind: "b", id: "a" })).toBe(-1);
  });

  it("uses no locale comparison", () => {
    expect(compareRecords.toString()).not.toMatch(/locale/i);
  });
});

describe("paths", () => {
  const STOPS = [
    { kind: "auth", id: "tx-0001" },
    { kind: "login", id: "lg-0002" },
  ];

  it("checkPathName is the note category rule with its own place name", () => {
    expect(checkPathName("Path 1")).toEqual({ ok: true, value: "Path 1" });
    expect(refused(checkPathName("x".repeat(25)))).toEqual(["too_long", "name"]);
    expect(refused(checkPathName(VISA, "rename"))).toEqual(["card_number", "rename"]);
    expect(refused(checkPathName(" Path"))).toEqual(["bad_request", "name"]);
    expect(refused(checkPathName(""))).toEqual(["bad_request", "name"]);
  });

  it("checkPathFields takes exactly name and stops, canonical and fresh", () => {
    const c = checkPathFields({ name: "Path 1", stops: [{ kind: "fraud", id: "tx-0001" }, STOPS[1]] });
    expect(c).toEqual({ ok: true, value: { name: "Path 1", stops: STOPS } });
    expect(refused(checkPathFields({ name: "Path 1" }))).toEqual(["bad_request", ""]);
    expect(refused(checkPathFields({ name: "Path 1", stops: STOPS, id: "x" }))).toEqual(["bad_request", ""]);
  });

  it.each([
    ["one stop", [STOPS[0]], ["bad_request", "stops"]],
    ["fifty one stops", Array.from({ length: 51 }, (_, i) => ({ kind: "auth", id: `tx-${i}` })), ["bad_request", "stops"]],
    ["stops that are a dict", { a: 1 }, ["bad_request", "stops"]],
    ["a bad id in a stop", [STOPS[0], STOPS[1], { kind: "auth", id: " x" }], ["bad_request", "stops[2].id"]],
    ["a repeated record", [STOPS[0], STOPS[1], STOPS[0]], ["bad_request", "stops[2]"]],
    ["a record repeated as fraud then auth", [{ kind: "fraud", id: "x" }, STOPS[1], { kind: "auth", id: "x" }], ["bad_request", "stops[2]"]],
    ["a card number in a stop", [STOPS[0], { kind: "auth", id: VISA }], ["card_number", "stops[1].id"]],
  ])("checkPathFields refuses %s", (_name, stops, expected) => {
    expect(refused(checkPathFields({ name: "Path 1", stops }))).toEqual(expected);
  });

  it("checkPathFields takes two and fifty stops", () => {
    expect(checkPathFields({ name: "P", stops: STOPS }).ok).toBe(true);
    expect(checkPathFields({ name: "P", stops: Array.from({ length: 50 }, (_, i) => ({ kind: "auth", id: `tx-${i}` })) }).ok).toBe(true);
  });

  it("checkPathDraft takes exactly scenario, name and stops", () => {
    expect(checkPathDraft({ scenario: "card-fraud", name: "Path 1", stops: STOPS })).toEqual({
      ok: true,
      value: { scenario: "card-fraud", name: "Path 1", stops: STOPS },
    });
    expect(refused(checkPathDraft({ name: "Path 1", stops: STOPS }))).toEqual(["bad_request", ""]);
    expect(refused(checkPathDraft({ scenario: "no way", name: "Path 1", stops: STOPS }))).toEqual(["bad_scenario", "scenario"]);
  });

  it("checkPath takes exactly id, scenario, seq, name and stops, and builds a fresh object in wire order", () => {
    const wire = { id: GOOD_PATH_ID, scenario: "card-fraud", seq: 1, name: "Path 1", stops: STOPS };
    const c = checkPath(wire);
    expect(c).toEqual({ ok: true, value: wire });
    if (c.ok) expect(Object.keys(c.value)).toEqual(["id", "scenario", "seq", "name", "stops"]);
    expect(checkPath(makePath()).ok).toBe(true);
    expect(refused(checkPath({ ...wire, extra: 1 }))).toEqual(["bad_request", ""]);
  });

  it.each([
    ["an id that is not one", { id: "path-xyz" }, ["bad_request", "id"]],
    ["an id with a trailing newline", { id: GOOD_PATH_ID + "\n" }, ["bad_request", "id"]],
    ["an id in upper case hex", { id: "path-" + "ABCDEF0123456789".repeat(2) }, ["bad_request", "id"]],
    ["an id that holds a card number", { id: VISA_PATH_ID }, ["card_number", "id"]],
    ["a seq of 0", { seq: 0 }, ["bad_request", "seq"]],
    ["a seq of true", { seq: true }, ["bad_request", "seq"]],
    ["a seq past the bound", { seq: LIMITS.maxSeq + 1 }, ["bad_request", "seq"]],
    ["a seq that is a fraction", { seq: 1.5 }, ["bad_request", "seq"]],
  ])("checkPath refuses %s", (_name, over, expected) => {
    expect(refused(checkPath({ id: GOOD_PATH_ID, scenario: "card-fraud", seq: 1, name: "Path 1", stops: STOPS, ...over }))).toEqual(expected);
  });

  it("isPathId matches the id's shape only", () => {
    expect(isPathId(GOOD_PATH_ID)).toBe(true);
    expect(isPathId(GOOD_PATH_ID + "\n")).toBe(false);
    expect(isPathId("path-" + "a".repeat(31))).toBe(false);
    expect(isPathId(5)).toBe(false);
    expect(isPathId(null)).toBe(false);
  });
});

describe("makePathId", () => {
  it("draws again past a draw whose hex holds a card number", () => {
    const draws = [VISA_UUID, uuidOfInt(7)];
    let n = 0;
    const id = makePathId(() => draws[n++]);
    expect(n).toBe(2);
    expect(id).toBe("path-" + "0".repeat(31) + "7");
    expect(isPathId(id)).toBe(true);
  });

  it("gives an id that passes its shape and the guard for each of 200 fixed draws", () => {
    for (let i = 0; i < 200; i++) {
      const id = makePathId(() => uuidOfInt(i));
      expect(isPathId(id)).toBe(true);
      expect(refusesText(id)).toBe(false);
    }
  });

  it("draws again past text that is not a uuid, and throws after the draws are spent, naming no id", () => {
    let n = 0;
    expect(makePathId(() => (n++ === 0 ? "not a uuid" : uuidOfInt(1)))).toBe("path-" + "0".repeat(31) + "1");
    let count = 0;
    try {
      makePathId(() => {
        count++;
        return VISA_UUID;
      }, 4);
      throw new Error("did not throw");
    } catch (e) {
      expect(count).toBe(4);
      expect(String((e as Error).message)).not.toContain(VISA);
    }
  });
});

describe("checkFileMarks", () => {
  const node = (over = {}) => ({ record: { kind: "auth", id: "tx-0001" }, pinned: true, disposition: "fail", category: "Shared key", settled: true, ...over });
  const path = (over = {}) => ({
    id: GOOD_PATH_ID,
    seq: 1,
    name: "Path 1",
    stops: [
      { kind: "auth", id: "tx-0001" },
      { kind: "login", id: "lg-0002" },
    ],
    ...over,
  });
  const file = (over = {}) => ({ nodes: [node()], paths: [path()], failCategories: ["Shared key"], ...over });

  it("gives the marks back in file order, fresh, with canonical kinds", () => {
    const raw = file({ nodes: [node({ record: { kind: "fraud", id: "tx-0001" } })] });
    const c = checkFileMarks(raw, "card-fraud");
    expect(c).toEqual({ ok: true, value: file() });
    expect(c.ok && c.value.nodes[0]).not.toBe(raw.nodes[0]);
    if (c.ok) {
      expect(Object.keys(c.value.nodes[0])).toEqual(["record", "pinned", "disposition", "category", "settled"]);
      expect(Object.keys(c.value.paths[0])).toEqual(["id", "seq", "name", "stops"]);
    }
  });

  it("takes 1000 nodes, 20 paths and 100 Fail categories, the limits themselves", () => {
    const nodes = Array.from({ length: 1000 }, (_, i) => node({ record: { kind: "auth", id: `tx-${i}` } }));
    const paths = Array.from({ length: 20 }, (_, i) => path({ id: "path-" + i.toString(16).padStart(32, "0"), seq: i + 1, name: `Path ${i + 1}` }));
    const failCategories = Array.from({ length: MARK_LIMITS.failCategories }, (_, i) => `Cat ${i}`);
    expect(checkFileMarks(file({ nodes, paths, failCategories }), "card-fraud").ok).toBe(true);
  });

  it("takes empty lists", () => {
    expect(checkFileMarks({ nodes: [], paths: [], failCategories: [] }, "card-fraud")).toEqual({ ok: true, value: { nodes: [], paths: [], failCategories: [] } });
  });

  it.each([
    ["nodes that are not a list", { nodes: {} }, ["bad_file", "nodes"]],
    ["paths that are not a list", { paths: "x" }, ["bad_file", "paths"]],
    ["Fail categories that are not a list", { failCategories: null }, ["bad_file", "failCategories"]],
    ["1001 nodes, each otherwise good", { nodes: Array.from({ length: 1001 }, (_, i) => node({ record: { kind: "auth", id: `tx-${i}` } })) }, ["too_large", "nodes"]],
    ["21 paths, each otherwise good", { paths: Array.from({ length: 21 }, (_, i) => path({ id: "path-" + i.toString(16).padStart(32, "0"), seq: i + 1, name: `Path ${i + 1}` })) }, ["too_large", "paths"]],
    ["101 Fail categories", { failCategories: Array.from({ length: 101 }, (_, i) => `c${i}`) }, ["too_large", "failCategories"]],
    ["a node with an extra key", { nodes: [node({ extra: 1 })] }, ["bad_file", "nodes[0]"]],
    ["a node with no settled", { nodes: [(({ settled: _s, ...rest }) => rest)(node())] }, ["bad_file", "nodes[0]"]],
    ["a node with a category and PASS", { nodes: [node({ disposition: "pass" })] }, ["bad_file", "nodes[0].category"]],
    ["a node with a bad record", { nodes: [node({ record: { kind: "auth", id: " x" } })] }, ["bad_file", "nodes[0].record.id"]],
    ["two nodes for one record", { nodes: [node(), node({ record: { kind: "fraud", id: "tx-0001" } })] }, ["bad_file", "nodes[1].record"]],
    ["a node whose record id holds a card number", { nodes: [node({ record: { kind: "auth", id: VISA } })] }, ["card_number", "nodes[0].record.id"]],
    ["a path with an extra key", { paths: [path({ scenario: "card-fraud" })] }, ["bad_file", "paths[0]"]],
    ["a path with one stop", { paths: [path({ stops: [{ kind: "auth", id: "tx-0001" }] })] }, ["bad_file", "paths[0].stops"]],
    ["a path with a repeated stop", { paths: [path({ stops: [{ kind: "auth", id: "x" }, { kind: "fraud", id: "x" }] })] }, ["bad_file", "paths[0].stops[1]"]],
    ["two paths with one id", { paths: [path(), path({ seq: 2, name: "Path 2" })] }, ["bad_file", "paths[1].id"]],
    ["a path whose name holds a card number", { paths: [path({ name: VISA })] }, ["card_number", "paths[0].name"]],
    ["a path id that holds a card number", { paths: [path({ id: VISA_PATH_ID })] }, ["card_number", "paths[0].id"]],
    ["a Fail category that holds a card number", { failCategories: [VISA] }, ["card_number", "failCategories[0]"]],
    ["a Fail category with a trailing space", { failCategories: ["Triage "] }, ["bad_file", "failCategories[0]"]],
    ["Fail categories that repeat ignoring case", { failCategories: ["Triage", "triage"] }, ["bad_file", "failCategories[1]"]],
  ])("refuses %s", (_name, over, expected) => {
    expect(refused(checkFileMarks(file(over), "card-fraud"))).toEqual(expected);
  });

  it("checks each entry against the file's scenario, so a bad one is the file's to refuse first", () => {
    expect(refused(checkFileMarks(file(), "no way"))).toEqual(["bad_scenario", "nodes[0].scenario"]);
  });
});
