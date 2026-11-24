// frontend/investigator/src/lib/paths.test.ts
import { describe, it, expect } from "vitest";
import { buildPath, buildPaths, hexToRgb01 } from "./paths";
import type { Entity } from "./entity";

function ev(id: string, ts: number, lat: number, lng: number, kind = "fraud"): Entity {
  return {
    id, kind, timestamp: ts, coords: { lat, lng },
    fields: {}, displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
  };
}

const HOU = { lat: 29.777, lng: -95.546 };
const LAG = { lat: 6.536, lng: 3.397 };
const chain: Entity[] = [
  ev("h1", 1000, HOU.lat, HOU.lng),
  ev("h2", 2000, HOU.lat, HOU.lng),
  ev("h3", 3000, HOU.lat, HOU.lng),
  ev("l1", 1_000_000, LAG.lat, LAG.lng),
  ev("l2", 1_000_100, 6.536, 3.397),
  ev("l3", 1_000_200, 6.532, 3.401),
  ev("l4", 1_000_300, 6.538, 3.404),
];

describe("hexToRgb01", () => {
  it("parses #ff3d2e to 0..1 rgb", () => {
    const [r, g, b] = hexToRgb01("#ff3d2e");
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(0.239, 2);
    expect(b).toBeCloseTo(0.18, 2);
  });
});

describe("buildPath", () => {
  it("returns null for <2 timeline events", () => {
    expect(buildPath([chain[0]], "fraud")).toBeNull();
  });
  it("collapses coincident Houston probes and densifies the leap", () => {
    const p = buildPath(chain, "fraud")!;
    expect(p.points.length).toBeGreaterThan(20);
    expect(p.nodes.length).toBe(7);
  });
  it("maps every event to a monotonic-by-time point fraction", () => {
    const p = buildPath(chain, "fraud")!;
    expect(p.nodes[0].frac).toBe(0);
    expect(p.nodes[6].frac).toBe(1);
    for (let i = 1; i < p.nodes.length; i++) {
      expect(p.nodes[i].frac).toBeGreaterThanOrEqual(p.nodes[i - 1].frac);
    }
  });
  it("parametric midpoint of points lies inside the leap (not at a cluster)", () => {
    const p = buildPath(chain, "fraud")!;
    const mid = p.points[Math.floor((p.points.length - 1) / 2)];
    expect(mid[0]).toBeGreaterThan(-95);
    expect(mid[0]).toBeLessThan(3);
  });
  it("colors the path from the kind palette", () => {
    const p = buildPath(chain, "fraud")!;
    expect(p.color[0]).toBeCloseTo(1, 2);
  });
  it("defaults loft=false (drape on the surface - investigation-safe; a lofted arc implies a route that isn't real)", () => {
    const p = buildPath(chain, "fraud")!;
    expect(p.loft).toBe(false);
  });
  it("opts into loft via render config (the arc machinery kept on hand for reuse / future org config)", () => {
    const p = buildPath(chain, "fraud", { loft: true })!;
    expect(p.loft).toBe(true);
  });
});

describe("buildPaths (grouped by a manifest key)", () => {
  const ev = (id: string, shipment: string, t: number, lat: number, lng: number) => ({
    id, kind: "hop", timestamp: t, coords: { lat, lng },
    fields: { id, shipment_no: shipment },
    displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: "hop", pivotableFields: [] },
  });
  const legs = [
    ev("a1", "T1", 1000, 29.98, -95.34), ev("a2", "T1", 2000, 51.47, -0.45),   // shipment 1: Houston to London
    ev("b1", "T2", 1500, 29.98, -95.34), ev("b2", "T2", 2500, 33.94, -118.41), // shipment 2: Houston to Los Angeles
    ev("c1", "T3", 1700, 29.98, -95.34),                                          // shipment 3: one event, no path
  ];
  it("draws one path per group instead of chaining every event of the kind", () => {
    const paths = buildPaths(legs, "hop", "shipment_no", { hex: "#00e5ff" });
    expect(paths.map((p) => p.nodes.length)).toEqual([2, 2]);
    const ends = paths.map((p) => p.points[p.points.length - 1]);
    expect(ends[0][1]).toBeCloseTo(51.47, 1);   // London
    expect(ends[1][1]).toBeCloseTo(33.94, 1);   // Los Angeles
  });
  it("falls back to the single chained path when no key is given", () => {
    const paths = buildPaths(legs, "hop", undefined, { hex: "#00e5ff" });
    expect(paths).toHaveLength(1);
    expect(paths[0].nodes).toHaveLength(5);
  });
});

describe("territory flag", () => {
  it("defaults to true and passes false through (a route is not a walking territory)", () => {
    const legs = chain.slice(0, 5);
    expect(buildPaths(legs, "fraud", undefined, {})[0].territory).toBe(true);
    expect(buildPaths(legs, "hop", undefined, { hex: "#00e5ff", territory: false })[0].territory).toBe(false);
  });
});
