// frontend/investigator/src/theme/to-rgb.test.ts
import { describe, it, expect } from "vitest";
import { hexToRgb01, hexToRgbChannels, hexToRgbTriplet, hexToRgba } from "./to-rgb";

describe("hexToRgb01", () => {
  it("parses #FFFFFF to [1, 1, 1]", () => {
    expect(hexToRgb01("#FFFFFF")).toEqual([1, 1, 1]);
  });

  it("parses #000000 to [0, 0, 0]", () => {
    expect(hexToRgb01("#000000")).toEqual([0, 0, 0]);
  });

  it("parses #00e5ff with each channel within 0.01 of expected", () => {
    const [r, g, b] = hexToRgb01("#00e5ff");
    expect(r).toBeCloseTo(0, 2);
    expect(Math.abs(g - 0.898)).toBeLessThan(0.01);
    expect(b).toBeCloseTo(1, 2);
  });

  it("parses 3-digit shorthand #fff to [1, 1, 1]", () => {
    expect(hexToRgb01("#fff")).toEqual([1, 1, 1]);
  });

  it("parses 3-digit shorthand #0ef", () => {
    const [r, g, b] = hexToRgb01("#0ef");
    expect(r).toBeCloseTo(0, 2);
    expect(Math.abs(g - 0.933)).toBeLessThan(0.01);
    expect(b).toBeCloseTo(1, 2);
  });

  it("throws on malformed hex (empty string)", () => {
    expect(() => hexToRgb01("")).toThrow();
  });

  it("throws on malformed hex (non-hex chars)", () => {
    expect(() => hexToRgb01("#GGHHII")).toThrow();
  });

  it("throws on malformed hex (wrong length)", () => {
    expect(() => hexToRgb01("#12345")).toThrow();
  });
});

describe("hexToRgbChannels", () => {
  it('returns "0, 229, 255" for #00e5ff', () => {
    expect(hexToRgbChannels("#00e5ff")).toBe("0, 229, 255");
  });

  it('returns "255, 255, 255" for #FFFFFF', () => {
    expect(hexToRgbChannels("#FFFFFF")).toBe("255, 255, 255");
  });

  it('returns "0, 0, 0" for #000000', () => {
    expect(hexToRgbChannels("#000000")).toBe("0, 0, 0");
  });
});

describe("hexToRgbTriplet", () => {
  it('returns "0 229 255" for #00e5ff (space-separated for rgb(R G B / a))', () => {
    expect(hexToRgbTriplet("#00e5ff")).toBe("0 229 255");
  });

  it('returns "255 255 255" for #FFFFFF', () => {
    expect(hexToRgbTriplet("#FFFFFF")).toBe("255 255 255");
  });

  it('returns "0 0 0" for #000000', () => {
    expect(hexToRgbTriplet("#000000")).toBe("0 0 0");
  });
});

describe("hexToRgba", () => {
  it('returns "rgba(0, 229, 255, 0.5)" for (#00e5ff, 0.5)', () => {
    expect(hexToRgba("#00e5ff", 0.5)).toBe("rgba(0, 229, 255, 0.5)");
  });

  it('returns "rgba(255, 255, 255, 1)" for (#FFFFFF, 1)', () => {
    expect(hexToRgba("#FFFFFF", 1)).toBe("rgba(255, 255, 255, 1)");
  });

  it('returns "rgba(0, 0, 0, 0)" for (#000000, 0)', () => {
    expect(hexToRgba("#000000", 0)).toBe("rgba(0, 0, 0, 0)");
  });
});
