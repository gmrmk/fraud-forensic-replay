// frontend/investigator/src/lib/geo.test.ts
import { describe, it, expect } from "vitest";
import { slerpPoint, greatCircleDensify } from "./geo";
import { haversineMiles } from "./entities";

const HOU: [number, number] = [-95.37, 29.76]; // [lng,lat]
const LOS: [number, number] = [3.39, 6.45];

describe("slerpPoint", () => {
  it("returns endpoints at t=0 and t=1", () => {
    expect(slerpPoint(HOU, LOS, 0)[0]).toBeCloseTo(HOU[0], 4);
    expect(slerpPoint(HOU, LOS, 1)[1]).toBeCloseTo(LOS[1], 4);
  });
  it("midpoint is roughly equidistant from both ends (great circle)", () => {
    const m = slerpPoint(HOU, LOS, 0.5);
    const dA = haversineMiles([HOU[1], HOU[0]], [m[1], m[0]]);
    const dB = haversineMiles([LOS[1], LOS[0]], [m[1], m[0]]);
    expect(Math.abs(dA - dB)).toBeLessThan(50); // within 50 mi of equal
  });
});

describe("greatCircleDensify", () => {
  it("returns nIntermediate+2 points including both endpoints", () => {
    const seg = greatCircleDensify(HOU, LOS, 10);
    expect(seg.length).toBe(12);
    expect(seg[0]).toEqual(HOU);
    expect(seg[11]).toEqual(LOS);
  });
});
