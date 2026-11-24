/**
 * Tests for V4 BLOOM cascade math.
 *
 * Two concurrent rings (inner + outer) + soft
 * radial glow underlay. No staggered emission; all three layers fire
 * together. Glow fades fastest; outer ring fades faster than inner so
 * the inner ring carries the late frames.
 *
 * Sizes in PIXELS - deck.gl ScatterplotLayer uses `radiusUnits:
 * 'pixels'` so the variant mockup values pass through to production
 * unchanged.
 */
import { describe, it, expect } from "vitest";
import {
  cascadeFrame,
  PULSE_DURATION_MS,
  GLOW_RADIUS_PX,
} from "./marker-cascade";

describe("PULSE_DURATION_MS constant", () => {
  it("exposes the variant-pick 1300ms duration", () => {
    expect(PULSE_DURATION_MS).toBe(1300);
  });
});

describe("cascadeFrame - glow underlay", () => {
  it("glow radius is constant GLOW_RADIUS_PX (65) regardless of navPulse", () => {
    expect(cascadeFrame(0).glow.radius).toBe(GLOW_RADIUS_PX);
    expect(cascadeFrame(0.5).glow.radius).toBe(GLOW_RADIUS_PX);
    expect(cascadeFrame(1).glow.radius).toBe(GLOW_RADIUS_PX);
  });

  it("glow alpha at navPulse=0 is GLOW_ALPHA_PEAK (0.45)", () => {
    expect(cascadeFrame(0).glow.alpha).toBeCloseTo(0.45, 2);
  });

  it("glow alpha returns to 0 at navPulse=1", () => {
    expect(cascadeFrame(1).glow.alpha).toBeCloseTo(0, 4);
  });

  it("glow alpha decays monotonically", () => {
    let last = Infinity;
    for (let p = 0; p <= 1; p += 0.05) {
      const a = cascadeFrame(p).glow.alpha;
      expect(a).toBeLessThanOrEqual(last);
      last = a;
    }
  });

  it("glow fades FASTER than the rings (power 2 vs 1.3/1.5)", () => {
    // At navPulse=0.5: glow alpha = (1-0.5)^2 * 0.45 = 0.1125
    //                  inner alpha = (1-0.5)^1.3 * 0.95 ≈ 0.385
    //                  outer alpha = (1-0.5)^1.5 * 0.7  ≈ 0.247
    const f = cascadeFrame(0.5);
    expect(f.glow.alpha).toBeLessThan(f.inner.alpha);
    expect(f.glow.alpha).toBeLessThan(f.outer.alpha);
  });
});

describe("cascadeFrame - inner ring", () => {
  it("inner radius at navPulse=0 is base 10px", () => {
    expect(cascadeFrame(0).inner.radius).toBe(10);
  });

  it("inner radius at navPulse=1 is base+expand=60px", () => {
    expect(cascadeFrame(1).inner.radius).toBeCloseTo(60, 0);
  });

  it("inner alpha peaks at INNER_ALPHA_PEAK (0.95) at navPulse=0", () => {
    expect(cascadeFrame(0).inner.alpha).toBeCloseTo(0.95, 2);
  });

  it("inner alpha is 0 at navPulse=1", () => {
    expect(cascadeFrame(1).inner.alpha).toBeCloseTo(0, 4);
  });

  it("inner radius grows monotonically via outCubic easing", () => {
    let last = -Infinity;
    for (let p = 0; p <= 1; p += 0.05) {
      const r = cascadeFrame(p).inner.radius;
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });

  it("inner line width tapers from start to end", () => {
    const start = cascadeFrame(0).inner.lineWidthMinPixels;
    const end = cascadeFrame(1).inner.lineWidthMinPixels;
    expect(start).toBeGreaterThan(end);
  });
});

describe("cascadeFrame - outer ring", () => {
  it("outer radius at navPulse=0 is base 20px (larger than inner's 10px)", () => {
    expect(cascadeFrame(0).outer.radius).toBe(20);
  });

  it("outer radius at navPulse=1 is base+expand=100px (larger than inner's 60px)", () => {
    expect(cascadeFrame(1).outer.radius).toBeCloseTo(100, 0);
  });

  it("outer alpha peak is OUTER_ALPHA_PEAK (0.7) - lower than inner's 0.95", () => {
    expect(cascadeFrame(0).outer.alpha).toBeCloseTo(0.7, 2);
    expect(cascadeFrame(0).outer.alpha).toBeLessThan(cascadeFrame(0).inner.alpha);
  });

  it("outer alpha decays FASTER than inner (power 1.5 vs 1.3)", () => {
    // At any mid-life value, outer should be alpha-weaker than inner
    // (both because of lower peak AND faster decay power).
    for (let p = 0.1; p < 1; p += 0.1) {
      const f = cascadeFrame(p);
      expect(f.outer.alpha).toBeLessThan(f.inner.alpha);
    }
  });

  it("outer radius grows monotonically and stays > inner radius", () => {
    for (let p = 0; p <= 1; p += 0.05) {
      const f = cascadeFrame(p);
      expect(f.outer.radius).toBeGreaterThan(f.inner.radius);
    }
  });
});

describe("cascadeFrame - math safety", () => {
  it("alpha is never negative across all 3 layers", () => {
    for (let p = -0.5; p <= 1.5; p += 0.05) {
      const f = cascadeFrame(p);
      expect(f.glow.alpha).toBeGreaterThanOrEqual(0);
      expect(f.inner.alpha).toBeGreaterThanOrEqual(0);
      expect(f.outer.alpha).toBeGreaterThanOrEqual(0);
    }
  });

  it("navPulse clamps to [0, 1] - values outside still produce valid output", () => {
    // navPulse < 0: should clamp to 0 (start of pulse, alpha peak)
    const before = cascadeFrame(-0.5);
    const atZero = cascadeFrame(0);
    expect(before.inner.alpha).toBeCloseTo(atZero.inner.alpha, 4);

    // navPulse > 1: should clamp to 1 (end of pulse, alpha ~0)
    const after = cascadeFrame(1.5);
    const atOne = cascadeFrame(1);
    expect(after.inner.alpha).toBeCloseTo(atOne.inner.alpha, 4);
  });

  it("no NaN values anywhere in the frame", () => {
    for (let p = -1; p <= 2; p += 0.1) {
      const f = cascadeFrame(p);
      expect(Number.isFinite(f.glow.radius)).toBe(true);
      expect(Number.isFinite(f.glow.alpha)).toBe(true);
      expect(Number.isFinite(f.inner.radius)).toBe(true);
      expect(Number.isFinite(f.inner.alpha)).toBe(true);
      expect(Number.isFinite(f.inner.lineWidthMinPixels)).toBe(true);
      expect(Number.isFinite(f.outer.radius)).toBe(true);
      expect(Number.isFinite(f.outer.alpha)).toBe(true);
      expect(Number.isFinite(f.outer.lineWidthMinPixels)).toBe(true);
    }
  });
});
