import { describe, it, expect } from "vitest";
import { parseDeepLink, hasCameraOverride } from "./deepLink";

describe("parseDeepLink", () => {
  it("returns empty for no params (the normal-app and self-check case)", () => {
    expect(parseDeepLink("")).toEqual({});
    expect(parseDeepLink("?view=case&theme=dark&color=neon")).toEqual({});
    expect(hasCameraOverride(parseDeepLink(""))).toBe(false);
  });

  it("parses a full camera + playhead", () => {
    const p = parseDeepLink("?lng=-95.37&lat=29.76&zoom=8.5&pitch=48&bearing=20&playhead=1234");
    expect(p.center).toEqual([-95.37, 29.76]);
    expect(p.zoom).toBe(8.5);
    expect(p.pitch).toBe(48);
    expect(p.bearing).toBe(20);
    expect(p.playhead).toBe(1234);
    expect(hasCameraOverride(p)).toBe(true);
  });

  it("requires BOTH lng and lat for a center", () => {
    expect(parseDeepLink("?lng=-95").center).toBeUndefined();
    expect(parseDeepLink("?lat=29").center).toBeUndefined();
    expect(parseDeepLink("?lng=-95&lat=29").center).toEqual([-95, 29]);
  });

  it("drops a center whose latitude is off the globe (the map throws on one)", () => {
    expect(parseDeepLink("?lng=10&lat=500&zoom=3")).toEqual({ zoom: 3 });
    expect(parseDeepLink("?lng=10&lat=-90.5")).toEqual({});
    expect(parseDeepLink("?lng=10&lat=-90")).toEqual({ center: [10, -90] });
  });

  it("ignores non-numeric and empty values", () => {
    expect(parseDeepLink("?zoom=abc&pitch=&bearing=NaN")).toEqual({});
  });

  it("accepts zero and negative values (0 pitch, negative lng)", () => {
    const p = parseDeepLink("?lng=-100&lat=40&pitch=0&playhead=0");
    expect(p.center).toEqual([-100, 40]);
    expect(p.pitch).toBe(0);
    expect(p.playhead).toBe(0);
  });

  it("playhead alone pins the scrub but is not a camera override", () => {
    const p = parseDeepLink("?playhead=5000");
    expect(p.playhead).toBe(5000);
    expect(hasCameraOverride(p)).toBe(false);
  });
});
