import { describe, it, expect } from "vitest";
import { makeProjector } from "./timeline-projector";

describe("makeProjector", () => {
  it("maps domainMin to 0% and domainMax to 100%", () => {
    const p = makeProjector(1000, 2000);
    expect(p.pct(1000)).toBe(0);
    expect(p.pct(2000)).toBe(100);
    expect(p.pct(1500)).toBe(50);
  });

  it("leaves pct unclamped for out-of-domain ms (off-window detection needs the raw value)", () => {
    const p = makeProjector(1000, 2000);
    expect(p.pct(500)).toBe(-50);
    expect(p.pct(2500)).toBe(150);
  });

  it("msAt is the inverse of pct (a 0..1 fraction -> ms)", () => {
    const p = makeProjector(1000, 2000);
    expect(p.msAt(0)).toBe(1000);
    expect(p.msAt(1)).toBe(2000);
    expect(p.msAt(0.5)).toBe(1500);
  });

  it("exposes domainMin, domainMax, span", () => {
    const p = makeProjector(1000, 2500);
    expect(p.domainMin).toBe(1000);
    expect(p.domainMax).toBe(2500);
    expect(p.span).toBe(1500);
  });

  it("never divides by zero on a zero-width domain (pct -> 0, msAt -> domainMin)", () => {
    const p = makeProjector(1000, 1000);
    expect(p.span).toBe(0);
    expect(p.pct(1000)).toBe(0);
    expect(p.pct(2000)).toBe(0);
    expect(p.msAt(0.5)).toBe(1000);
  });
});
