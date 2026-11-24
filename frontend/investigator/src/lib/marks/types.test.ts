/** The node model's identity rules (fraud is auth), its fixed lists and limits, and the shared words. */
import { describe, it, expect } from "vitest";
import {
  DISPOSITIONS,
  MARK_LIMITS,
  YOURS_FACETS,
  canonicalKind,
  recordKey,
  sameRecord,
  toneOf,
  type RecordNode,
} from "./types";
import { DISPOSITION_WORD } from "./words";
import { LIMITS } from "../notes/types";
import { makeNode } from "../notes/test-fixtures";

describe("record identity", () => {
  it("reads fraud as auth and no other kind", () => {
    expect(canonicalKind("fraud")).toBe("auth");
    expect(canonicalKind("auth")).toBe("auth");
    expect(canonicalKind("login")).toBe("login");
    expect(canonicalKind("fraudulent")).toBe("fraudulent");
  });

  it("keys a record by its canonical kind and id", () => {
    expect(recordKey({ kind: "fraud", id: "x" })).toBe("auth:x");
    expect(recordKey({ kind: "login", id: "lg-1" })).toBe("login:lg-1");
  });

  it("compares a fraud link and an auth record as one record", () => {
    expect(sameRecord({ kind: "fraud", id: "x" }, { kind: "auth", id: "x" })).toBe(true);
    expect(sameRecord({ kind: "auth", id: "x" }, { kind: "auth", id: "y" })).toBe(false);
    expect(sameRecord({ kind: "login", id: "x" }, { kind: "auth", id: "x" })).toBe(false);
  });
});

describe("dispositions and limits", () => {
  it("lists the four dispositions in order", () => {
    expect([...DISPOSITIONS]).toEqual(["none", "pass", "fail", "wait"]);
  });

  it("takes a verdict tone of the same name for each set disposition", () => {
    expect(toneOf("pass")).toBe("pass");
    expect(toneOf("fail")).toBe("fail");
    expect(toneOf("wait")).toBe("wait");
  });

  it("holds the contract's limits, and the name length is the note category's", () => {
    expect(MARK_LIMITS).toEqual({
      nodesPerScenario: 1000,
      pathsPerScenario: 20,
      stopsMin: 2,
      stopsMax: 50,
      nameChars: 24,
      failCategories: 100,
    });
    // typed Fail categories are shared by every story: the count is in all, with no per-story key
    expect("failCategoriesPerScenario" in MARK_LIMITS).toBe(false);
    expect(MARK_LIMITS.nameChars).toBe(LIMITS.categoryChars);
  });

  it("lists the six Yours facets in order", () => {
    expect([...YOURS_FACETS]).toEqual(["pinned", "pass", "fail", "wait", "noted", "inPath"]);
  });

  it("words PASS, FAIL and WAITING", () => {
    expect(DISPOSITION_WORD).toEqual({ pass: "PASS", fail: "FAIL", wait: "WAITING" });
  });
});

describe("a node", () => {
  it("carries settled beside the three fields the person sets", () => {
    const n: RecordNode = makeNode();
    expect(Object.keys(n)).toEqual(["scenario", "record", "pinned", "disposition", "category", "settled"]);
    expect(n.settled).toBe(false);
    expect(makeNode({ settled: true }).settled).toBe(true);
  });
});
