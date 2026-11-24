import { describe, it, expect } from "vitest";
import {
  ringFrame,
  ringPhase,
  RADAR_STILL_PHASE,
  landingScale,
  landingFraction,
  LANDING_FRAC,
  RADAR_RING_COUNT,
} from "./globe-motion";

describe("ringPhase (the radar under reduced motion)", () => {
  it("returns the tween value unchanged when motion is allowed", () => {
    for (const v of [0, 0.25, 0.5, 0.99]) expect(ringPhase(v, false)).toBe(v);
  });

  it("returns the named still phase for every value when motion is reduced", () => {
    for (const v of [0, 0.25, 0.5, 0.99]) expect(ringPhase(v, true)).toBe(RADAR_STILL_PHASE);
  });

  it("at the still phase every ring is visible (stroke opacity above 0.2)", () => {
    const frames = ringFrame(ringPhase(0.7, true));
    expect(frames).toHaveLength(RADAR_RING_COUNT);
    for (const f of frames) expect(f.strokeOpacity).toBeGreaterThan(0.2);
  });

  it("the still frame does not change from one tween value to the next", () => {
    expect(ringFrame(ringPhase(0.1, true))).toEqual(ringFrame(ringPhase(0.9, true)));
  });
});

describe("ringFrame", () => {
  it("produces RADAR_RING_COUNT rings phase-offset across the cycle", () => {
    const frames = ringFrame(0);
    expect(frames).toHaveLength(RADAR_RING_COUNT);
    // ring 0 starts at phase 0 (smallest radius, zero alpha at birth)
    expect(frames[0].radiusPx).toBeCloseTo(4, 0);
  });

  it("alpha is a bell curve: ~0 at phase 0 and 1, peak mid-cycle", () => {
    const atBirth = ringFrame(0)[0].strokeOpacity;
    const atMid = ringFrame(0.5)[0].strokeOpacity;
    expect(atBirth).toBeLessThan(0.05);
    expect(atMid).toBeGreaterThan(0.5);
  });

  it("radius grows with phase", () => {
    expect(ringFrame(0.8)[0].radiusPx).toBeGreaterThan(ringFrame(0.1)[0].radiusPx);
  });
});

describe("landingScale", () => {
  it("is 0 at entry, overshoots above 1, settles to 1 by 700ms", () => {
    expect(landingScale(0)).toBe(0);
    expect(Math.max(landingScale(0.5), landingScale(0.6), landingScale(0.7))).toBeGreaterThan(1);
    expect(landingScale(1)).toBe(1);
    expect(landingScale(1.5)).toBe(1);
  });
});

describe("landingFraction (playhead-keyed, U4 - deterministic, no wall-clock)", () => {
  const span = 1000; // playhead-ms over which a pin settles
  it("is < 0 before the event, 0 at the event, ramps through the span", () => {
    expect(landingFraction(900, 1000, span)).toBeLessThan(0); // playhead before eventTs -> not landed
    expect(landingFraction(1000, 1000, span)).toBe(0); // exactly at the event
    expect(landingFraction(1500, 1000, span)).toBeCloseTo(0.5); // halfway through the span
    expect(landingFraction(2000, 1000, span)).toBe(1); // span elapsed -> settled
    expect(landingFraction(5000, 1000, span)).toBeGreaterThan(1); // long past (landingScale clamps)
  });
  it("is a PURE function of its args (same inputs -> same output; no Date/clock)", () => {
    expect(landingFraction(1500, 1000, span)).toBe(landingFraction(1500, 1000, span));
  });
  it("degenerate span (data not loaded) -> settled, never divides by zero", () => {
    expect(landingFraction(1500, 1000, 0)).toBe(1);
    expect(landingFraction(1500, 1000, -5)).toBe(1);
  });
  it("composes with landingScale to a clamped eased scale; the feel knob is positive", () => {
    expect(landingScale(landingFraction(900, 1000, span))).toBe(0); // before -> 0
    expect(landingScale(landingFraction(5000, 1000, span))).toBe(1); // past -> 1
    expect(LANDING_FRAC).toBeGreaterThan(0);
  });
});
