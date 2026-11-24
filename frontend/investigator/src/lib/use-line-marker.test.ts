import { describe, it, expect } from "vitest";
import { bearing, lineRotation, midpoint, type LngLat } from "./use-line-marker";

const O: LngLat = { lat: 0, lng: 0 };

describe("bearing", () => {
  it("is 90° due east", () => {
    expect(bearing(O, { lat: 0, lng: 1 })).toBeCloseTo(90, 1);
  });
  it("is 0° due north", () => {
    expect(bearing(O, { lat: 1, lng: 0 })).toBeCloseTo(0, 1);
  });
  it("is 180° due south", () => {
    expect(bearing(O, { lat: -1, lng: 0 })).toBeCloseTo(180, 1);
  });
});

describe("lineRotation", () => {
  it("lays a due-east line flat (rotation 0)", () => {
    expect(lineRotation(O, { lat: 0, lng: 1 })).toBeCloseTo(0, 1);
  });

  it("always folds into [-90, 90) so text never reads upside down", () => {
    // a due-west line (bearing 270) must not produce a 180°-flipped label
    const r = lineRotation(O, { lat: 0, lng: -1 });
    expect(r).toBeGreaterThanOrEqual(-90);
    expect(r).toBeLessThan(90);
    expect(Math.abs(r)).toBeCloseTo(0, 1); // east and west lines lay flat the same way
  });

  it("tilts gently for the Houston→Lagos leap (great-circle bearing ~80°E, shallow)", () => {
    const houston: LngLat = { lat: 29.7604, lng: -95.3698 };
    const lagos: LngLat = { lat: 6.5244, lng: 3.3792 };
    const r = lineRotation(houston, lagos);
    expect(Math.abs(r)).toBeLessThan(30); // shallow, near-horizontal along the leap
    expect(r).toBeGreaterThanOrEqual(-90);
    expect(r).toBeLessThan(90);
  });
});

describe("midpoint", () => {
  it("averages lng/lat", () => {
    expect(midpoint({ lat: 10, lng: 20 }, { lat: 30, lng: 40 })).toEqual({ lat: 20, lng: 30 });
  });
});
