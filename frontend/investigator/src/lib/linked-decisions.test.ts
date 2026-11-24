import { describe, it, expect } from "vitest";
import { linkedBadges, linkedDecisionCounts } from "./linked-decisions";
import { decisionOf } from "./verdicts";
import { manifestRowToEntity } from "./adapters/manifest-row";
import { verdictNode } from "./verdict-fixtures";
import type { Entity } from "./entity";

const rec = (id: string, acct: string, gadget: string, at: number, coords: Entity["coords"] = { lat: 1, lng: 2 }): Entity => ({
  id, kind: "login_like", timestamp: at, coords, fields: { id, acct, gadget },
  displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: "login_like", pivotableFields: ["acct", "gadget"] },
});
const view = (id: string, state: string, finding: string, acct: string, at: number) =>
  decisionOf(manifestRowToEntity(verdictNode, { id, state, finding, memo: "m", who: "w", subject: "S", acct, when: new Date(at).toISOString(), y: 5, x: 6 }), verdictNode)!;

// a1 and a2 share gadget G1 and each has a FAIL; a3 has a PASS on its own gadget G2.
const records = [rec("r1", "a1", "G1", 100), rec("r2", "a2", "G1", 110), rec("r3", "a3", "G2", 120)];
const decisions = [view("d1", "FAIL", "ATO", "a1", 500), view("d2", "FAIL", "ATO", "a2", 600), view("d3", "PASS", "PASSED", "a3", 700)];

describe("linkedDecisionCounts", () => {
  it("counts distinct decisions on records sharing the value, with the pass word at zero", () => {
    expect(linkedDecisionCounts("gadget", "G1", records, decisions, 1000)).toEqual([
      { word: "ATO", tone: "fail", n: 2 }, { word: "PASSED", tone: "pass", n: 0 },
    ]);
  });

  it("counts only decisions at or before the playhead", () => {
    expect(linkedDecisionCounts("gadget", "G1", records, decisions, 550)).toEqual([
      { word: "ATO", tone: "fail", n: 1 }, { word: "PASSED", tone: "pass", n: 0 },
    ]);
  });

  it("shows nothing when nothing is linked", () => {
    expect(linkedDecisionCounts("gadget", "G9", records, decisions, 1000)).toEqual([]);
  });

  it("counts a decision once when several sharing records carry it", () => {
    const twice = [...records, rec("r9", "a1", "G1", 130)];
    expect(linkedDecisionCounts("gadget", "G1", twice, decisions, 1000)[0]).toEqual({ word: "ATO", tone: "fail", n: 2 });
  });
});

describe("linkedBadges", () => {
  it("lights each matched record that carries a reached decision, once per pair", () => {
    const pairs = linkedBadges(records[0], ["acct", "gadget"], records, decisions, 1000)
      .map((b) => `${b.decision.id}@${b.record.id}`).sort();
    expect(pairs).toEqual(["d1@r1", "d2@r2"]);
  });

  it("skips records the playhead has not reached and records without a place", () => {
    const late = [rec("r1", "a1", "G1", 100), rec("r2", "a2", "G1", 2000), rec("r4", "a2", "G1", 100, null)];
    expect(linkedBadges(late[0], ["gadget"], late, decisions, 1000).map((b) => b.record.id)).toEqual(["r1"]);
  });
});
