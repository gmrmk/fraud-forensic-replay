// frontend/investigator/src/lib/arc-cascade.test.ts
import { describe, it, expect } from "vitest";
import { cascadeDrawFrac } from "./arc-cascade";
import type { PathNode } from "./paths";

const nodes: PathNode[] = [
  { ts: 1000, frac: 0 },
  { ts: 2000, frac: 0.5 },
  { ts: 4000, frac: 1 },
];

describe("cascadeDrawFrac", () => {
  it("is 0 before the first node", () => {
    expect(cascadeDrawFrac(500, nodes)).toBe(0);
  });
  it("is 1 at/after the last node", () => {
    expect(cascadeDrawFrac(4000, nodes)).toBe(1);
    expect(cascadeDrawFrac(9999, nodes)).toBe(1);
  });
  it("interpolates linearly in time between nodes", () => {
    expect(cascadeDrawFrac(1500, nodes)).toBeCloseTo(0.25, 5); // halfway 0→0.5
    expect(cascadeDrawFrac(3000, nodes)).toBeCloseTo(0.75, 5); // halfway 0.5→1
  });
  it("is monotonic - rewinding lowers the fraction", () => {
    expect(cascadeDrawFrac(3000, nodes)).toBeGreaterThan(cascadeDrawFrac(2500, nodes));
  });
  it("handles empty + single-node inputs", () => {
    expect(cascadeDrawFrac(100, [])).toBe(0);
    expect(cascadeDrawFrac(100, [{ ts: 50, frac: 1 }])).toBe(1);
  });
});
