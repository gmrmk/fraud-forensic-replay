import { describe, it, expect } from "vitest";
import { cameraKnown, openingCamera, type Camera } from "./openingCamera";

const FALLBACK: Camera = { center: [-95.3698, 29.7604], zoom: 4.2, pitch: 0, bearing: 0 };

describe("openingCamera", () => {
  it("a link with all four axes returns exactly those", () => {
    const link = { center: [10, 20] as [number, number], zoom: 7, pitch: 30, bearing: 90 };
    expect(openingCamera(FALLBACK, link, null)).toEqual(link);
  });

  it("a link with only a centre takes zoom, pitch and bearing from the fallback", () => {
    expect(openingCamera(FALLBACK, { center: [10, 20] }, null)).toEqual({
      center: [10, 20],
      zoom: 4.2,
      pitch: 0,
      bearing: 0,
    });
  });

  it("a link with only zoom 14 keeps the fallback's centre and returns pitch 48", () => {
    expect(openingCamera(FALLBACK, { zoom: 14 }, null)).toEqual({
      center: FALLBACK.center,
      zoom: 14,
      pitch: 48,
      bearing: 0,
    });
  });

  it("a link with zoom 14 and pitch 20 returns pitch 20", () => {
    expect(openingCamera(FALLBACK, { zoom: 14, pitch: 20 }, null).pitch).toBe(20);
  });

  it("a link with zoom 12.9 and no pitch returns the fallback's pitch", () => {
    expect(openingCamera({ ...FALLBACK, pitch: 5 }, { zoom: 12.9 }, null).pitch).toBe(5);
  });

  it("no link camera and a home camera takes the home's centre and zoom with the fallback's pitch and bearing", () => {
    expect(openingCamera(FALLBACK, {}, { lat: 20, lng: -40, zoom: 2 })).toEqual({
      center: [-40, 20],
      zoom: 2,
      pitch: 0,
      bearing: 0,
    });
  });

  it("a home camera keeps the fallback's bearing", () => {
    expect(openingCamera({ ...FALLBACK, bearing: 30 }, {}, { lat: 20, lng: -40, zoom: 2 }).bearing).toBe(30);
  });

  it("no link camera and a home at zoom 13 returns pitch 48", () => {
    expect(openingCamera(FALLBACK, {}, { lat: 1, lng: 2, zoom: 13 }).pitch).toBe(48);
  });

  it("a link camera wins over a home camera", () => {
    const cam = openingCamera(FALLBACK, { zoom: 9 }, { lat: 20, lng: -40, zoom: 2 });
    expect(cam.zoom).toBe(9);
    expect(cam.center).toEqual(FALLBACK.center);
  });

  it("neither returns a camera equal to the fallback that is a different object with a different centre array", () => {
    const cam = openingCamera(FALLBACK, {}, null);
    expect(cam).toEqual(FALLBACK);
    expect(cam).not.toBe(FALLBACK);
    expect(cam.center).not.toBe(FALLBACK.center);
  });
});

describe("cameraKnown", () => {
  const home = { lat: 1, lng: 2, zoom: 3 };
  it("is false for an empty link with undefined", () => {
    expect(cameraKnown({}, undefined)).toBe(false);
  });
  it("is true for an empty link with null", () => {
    expect(cameraKnown({}, null)).toBe(true);
  });
  it("is true for an empty link with a home", () => {
    expect(cameraKnown({}, home)).toBe(true);
  });
  it("is true for a link with a zoom and undefined", () => {
    expect(cameraKnown({ zoom: 5 }, undefined)).toBe(true);
  });
});
