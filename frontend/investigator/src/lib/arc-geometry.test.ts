// frontend/investigator/src/lib/arc-geometry.test.ts
import { describe, it, expect } from "vitest";
import { liftHeights } from "./arc-geometry";
import { greatCircleDensify } from "./geo";

describe("liftHeights(points)", () => {
  it("is ~0 at both endpoints", () => {
    const pts: [number, number][] = [[-95, 29], [-50, 20], [3, 6]];
    const h = liftHeights(pts);
    expect(h[0]).toBeCloseTo(0, 5);
    expect(h[h.length - 1]).toBeCloseTo(0, 5);
  });

  it("peaks inside the longest segment (leap-dominated chain)", () => {
    const pts: [number, number][] = [[-95.5, 29.7], [-95.5, 29.7], [-95.5, 29.7]];
    for (let i = 1; i <= 20; i++) pts.push([-95.5 + (98.9 * i) / 21, 29.7 - (23.2 * i) / 21]);
    pts.push([3.4, 6.5], [3.4, 6.5]);
    const h = liftHeights(pts);
    const peakIdx = h.indexOf(Math.max(...h));
    expect(peakIdx).toBeGreaterThan(3);
    expect(peakIdx).toBeLessThan(23);
  });

  it("arches higher for a longer dominant jump", () => {
    const shortJump = greatCircleDensify([-95, 29], [-94, 29], 10); // ~60 mi, densified
    const longJump = greatCircleDensify([-95, 29], [3, 6], 40); // ~6500 mi, densified
    expect(Math.max(...liftHeights(longJump))).toBeGreaterThan(Math.max(...liftHeights(shortJump)));
  });

  it("preserves the shipped Lagos arch height (~564 km at ~6500 mi)", () => {
    const pts = greatCircleDensify([-95.37, 29.76], [3.39, 6.45], 40); // Houston→Lagos, densified
    const peak = Math.max(...liftHeights(pts));
    expect(peak).toBeGreaterThan(480_000);
    expect(peak).toBeLessThan(650_000);
  });

  it("keeps short local paths near-flat (< 50 km), not needle spikes", () => {
    const pts = greatCircleDensify([-95.5, 29.77], [-95.3, 29.7], 8); // ~15 mi, densified
    expect(Math.max(...liftHeights(pts))).toBeLessThan(50_000);
  });
});
