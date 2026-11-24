// frontend/investigator/src/theme/resolve.test.ts
import { describe, it, expect } from "vitest";
import { slotFor } from "./entity-mapping";
import {
  resolveEntityColorHex,
  resolveEntityColorRgb01,
  resolvePalette,
} from "./resolve";
import { hexToRgb01 } from "./to-rgb";

describe("slotFor", () => {
  it('maps "fraud" to "alarm"', () => {
    expect(slotFor("fraud")).toBe("alarm");
  });
  it('maps "auth" to "r1"', () => {
    expect(slotFor("auth")).toBe("r1");
  });
  it('maps "login" to "r2"', () => {
    expect(slotFor("login")).toBe("r2");
  });
  it('maps "account_event" to "r3"', () => {
    expect(slotFor("account_event")).toBe("r3");
  });
  it('maps "place" to "textFaint"', () => {
    expect(slotFor("place")).toBe("textFaint");
  });
  it('falls back to "textFaint" for unknown kinds', () => {
    expect(slotFor("nonsense-kind")).toBe("textFaint");
  });
});

describe("resolvePalette", () => {
  it("returns the neon dark palette with correct r1", () => {
    const p = resolvePalette("dark", "neon");
    expect(p.ramp.r1).toBe("#00E5FF");
  });
});

describe("resolveEntityColorHex", () => {
  it('auth + dark + neon → "#00E5FF" (neon dark r1)', () => {
    expect(resolveEntityColorHex("auth", "dark", "neon")).toBe("#00E5FF");
  });
  it('auth + dark + monochrome → "#BFBFBF" (mono dark r1)', () => {
    expect(resolveEntityColorHex("auth", "dark", "monochrome")).toBe("#BFBFBF");
  });
  it('login + dark + neon → "#FF5CE8" (neon dark r2, magenta by user preference)', () => {
    expect(resolveEntityColorHex("login", "dark", "neon")).toBe("#FF5CE8");
  });
  it('fraud + dark + rainbow → "#FF6B35" (alarm base dark)', () => {
    expect(resolveEntityColorHex("fraud", "dark", "rainbow")).toBe("#FF6B35");
  });
  it('fraud + dark + neon → "#FF3D2E" (alarm neon dark)', () => {
    expect(resolveEntityColorHex("fraud", "dark", "neon")).toBe("#FF3D2E");
  });
  it('place + dark + rainbow → "#909AA8" (dark textFaint, raised to AA in M2-U1)', () => {
    expect(resolveEntityColorHex("place", "dark", "rainbow")).toBe("#909AA8");
  });
});

describe("resolveEntityColorRgb01", () => {
  it("auth + dark + neon deep-equals hexToRgb01(#00E5FF)", () => {
    const result = resolveEntityColorRgb01("auth", "dark", "neon");
    const expected = hexToRgb01("#00E5FF");
    expect(result).toEqual(expected);
  });
});
