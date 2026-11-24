import { describe, it, expect } from "vitest";
import { decisionOf, isOverlayNode, overlaysOf, statusAddsInformation } from "./verdicts";
import { manifestRowToEntity } from "./adapters/manifest-row";
import { plainNode, verdictNode } from "./verdict-fixtures";

const dec = (id: string, state: string, finding: string, when: string, acct = "a1") =>
  manifestRowToEntity(verdictNode, { id, state, finding, memo: "m", who: "analyst", subject: "S", acct, worked: "ev-7", when, y: 1, x: 2 });

describe("verdict readers", () => {
  it("an overlay node is one that declares a decision mapping", () => {
    expect([verdictNode, plainNode].map(isOverlayNode)).toEqual([true, false]);
  });

  it("reads a decision through the mapping: word from the outcome, tone from the status, the event it worked", () => {
    const d = decisionOf(dec("d1", "FAIL", "COLLUSION", "2026-06-09T09:40:00-05:00"), verdictNode)!;
    expect(d).toMatchObject({ tone: "fail", status: "FAIL", word: "COLLUSION", actor: "analyst", target: "S", keyField: "acct", key: "a1", events: ["ev-7"], atRaw: "2026-06-09T09:40:00-05:00" });
    expect(decisionOf(dec("d2", "pass", "PASSED", "2026-06-09T09:41:00-05:00"), verdictNode)!.tone).toBe("pass");
    expect(decisionOf(dec("d3", "WAITING", "WAITING", "2026-06-09T09:42:00-05:00"), verdictNode)!.tone).toBe("wait");
  });

  it("a decision lists every event it worked: one id, a list of ids, or none", () => {
    const working = (worked: unknown) =>
      decisionOf(manifestRowToEntity(verdictNode, { id: "d9", state: "FAIL", finding: "ATO", acct: "a1", worked, when: "2026-06-09T09:40:00-05:00", y: 1, x: 2 }), verdictNode)!.events;
    expect(working(["ev-7", "ev-9"])).toEqual(["ev-7", "ev-9"]);
    expect(working("ev-7")).toEqual(["ev-7"]);
    expect([working(""), working(null), working(undefined), working([])]).toEqual([[], [], [], []]);
  });

  it("an unknown status is flagged as unknown and keeps its own word", () => {
    expect(decisionOf(dec("d4", "ESCALATED", "REVIEW", "2026-06-09T09:43:00-05:00"), verdictNode)).toMatchObject({ tone: "unknown", word: "REVIEW" });
  });

  it("a node without a mapping reads as null", () => {
    expect(decisionOf(dec("d1", "FAIL", "ATO", "2026-06-09T09:40:00-05:00"), plainNode)).toBeNull();
  });

  it("overlaysOf reads a pack's decisions in time order", () => {
    const a = dec("d2", "PASS", "PASSED", "2026-06-09T10:00:00-05:00");
    const b = dec("d1", "FAIL", "ATO", "2026-06-09T09:00:00-05:00");
    expect(overlaysOf([a, b], [verdictNode]).map((d) => d.id)).toEqual(["d1", "d2"]);
  });
});

describe("statusAddsInformation", () => {
  it.each([
    ["PASSED", "PASS", false],
    ["WAITING", "WAITING", false],
    ["passed", " pass ", false],
    ["ATO", "", false],
    ["ATO", "   ", false],
    ["ATO", "FAIL", true],
    ["FRAUD", "FAIL", true],
    ["KEY TAKEOVER", "FAIL", true],
    [" PASSED ", "PASS", false],
    ["BYPASS", "PASS", true],
  ])("word %j beside status %j adds information: %j", (word, status, adds) => {
    expect(statusAddsInformation(word, status)).toBe(adds);
  });
});
