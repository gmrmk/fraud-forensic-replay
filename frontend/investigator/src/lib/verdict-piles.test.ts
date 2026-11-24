import { describe, it, expect } from "vitest";
import { pileItems, type PileFamily, type PileItem } from "./verdict-piles";
import type { Entity } from "./entity";

const item = (id: string, x: number, y: number, word = "ATO", tone: PileItem["tone"] = "fail", family: PileFamily = "decision", countKey = id, at = 0): PileItem =>
  ({ id, family, x, y, at, countKey, word, tone, lit: false, entity: {} as Entity, lngLat: { lng: x, lat: y } });

describe("pileItems", () => {
  it("merges items within reach of a pile's anchor and counts distinct keys per word", () => {
    const piles = pileItems([item("a", 0, 0), item("b", 10, 5), item("c", 200, 0)], { x: 44, y: 16 });
    expect(piles.map((p) => p.members.map((m) => m.id))).toEqual([["a", "b"], ["c"]]);
    expect(piles[0].segments).toEqual([{ word: "ATO", tone: "fail", count: 2 }]);
  });

  it("collapses the same decision met twice in one pile (its own capsule and a linked badge)", () => {
    const [p] = pileItems([item("own", 0, 0, "ATO", "fail", "decision", "d1"), { ...item("linked", 3, 3, "ATO", "fail", "decision", "d1"), lit: true }], { x: 44, y: 16 });
    expect(p.members).toHaveLength(1);
    expect(p.lit).toBe(true);
  });

  it("orders segments fail, wait, then pass, and never piles decisions with queue flags", () => {
    const piles = pileItems([item("p", 0, 0, "PASSED", "pass"), item("f", 1, 0, "ATO", "fail"), item("q", 2, 0, "rule-x", "queue", "queue")], { x: 44, y: 16 });
    expect(piles.find((p) => p.family === "decision")!.segments.map((s) => s.word)).toEqual(["ATO", "PASSED"]);
    expect(piles.filter((p) => p.family === "queue")).toHaveLength(1);
  });

  it("keeps a pile key stable while its anchor stays first in time", () => {
    const a = pileItems([item("a", 0, 0), item("b", 5, 0)], { x: 44, y: 16 });
    const b = pileItems([item("a", 0, 0), item("b", 5, 0), item("c", 6, 0)], { x: 44, y: 16 });
    expect(b[0].key).toBe(a[0].key);
  });

  it("with zero reach every item is its own pile", () => {
    expect(pileItems([item("a", 0, 0), item("b", 0, 0)], { x: -1, y: -1 })).toHaveLength(2);
  });
});
