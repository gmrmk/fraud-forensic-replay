import { describe, it, expect } from "vitest";
import { paletteForKind, kindRgbVar, kindOnPanelVar } from "./entity-palette";
import { slotFor, KIND_SLOT } from "../theme/entity-mapping";

// The four original kinds - ensure the additions didn't break them.
describe("paletteForKind - original kinds", () => {
  it("auth returns the cyan palette", () => {
    expect(paletteForKind("auth").hex).toBe("#00e5ff");
  });
  it("fraud returns the red palette", () => {
    expect(paletteForKind("fraud").hex).toBe("#ff3d2e");
  });
  it("login returns the magenta palette", () => {
    expect(paletteForKind("login").hex).toBe("#ff5ce8");
  });
  it("unknown kind degrades to the PLACE (muted gray) fallback", () => {
    expect(paletteForKind("totally_unknown").hex).toBe("#808080");
  });
});

// The aggregate kinds of the removed console have no palette of their own.
describe("paletteForKind - the removed console's kinds", () => {
  it("the four kinds of the removed console fall back like any unknown kind", () => {
    for (const k of ["hotspot", "ring", "merchant_segment", "cohort"]) {
      expect(paletteForKind(k), k).toEqual(paletteForKind("not-a-kind"));
      expect(KIND_SLOT).not.toHaveProperty(k);
    }
  });
});

// Mode-aware kind→CSS-var helpers (replaced the static KIND_RGB comma triplets
// 2026-06-18). kindRgbVar returns the raw slot triplet var; kindOnPanelVar the
// panel-legible variant. Both delegate to slotFor (entity-mapping.ts) so a
// kind recolors per ColorMode instead of staying frozen at the NEON triplet.
describe("kindRgbVar - raw slot triplet var", () => {
  it("auth → --r1-rgb", () => {
    expect(kindRgbVar("auth")).toBe("--r1-rgb");
  });
  it("login → --r2-rgb", () => {
    expect(kindRgbVar("login")).toBe("--r2-rgb");
  });
  it("account_event → --r3-rgb", () => {
    expect(kindRgbVar("account_event")).toBe("--r3-rgb");
  });
  it("fraud → --alarm-rgb", () => {
    expect(kindRgbVar("fraud")).toBe("--alarm-rgb");
  });
  it("transfer → --r1-rgb (transfer reuses the r1 slot)", () => {
    expect(kindRgbVar("transfer")).toBe("--r1-rgb");
  });
  it("place → --text-faint-rgb (note the dash)", () => {
    expect(kindRgbVar("place")).toBe("--text-faint-rgb");
  });
  it("unknown kind → --text-faint-rgb (slotFor fallback)", () => {
    expect(kindRgbVar("totally_unknown")).toBe("--text-faint-rgb");
  });
});

describe("kindOnPanelVar - panel-legible slot var", () => {
  it("auth → --r1-on-panel", () => {
    expect(kindOnPanelVar("auth")).toBe("--r1-on-panel");
  });
  it("account_event → --r3-on-panel", () => {
    expect(kindOnPanelVar("account_event")).toBe("--r3-on-panel");
  });
  it("transfer → --r1-on-panel", () => {
    expect(kindOnPanelVar("transfer")).toBe("--r1-on-panel");
  });
  it("fraud → --alarm-on-panel", () => {
    expect(kindOnPanelVar("fraud")).toBe("--alarm-on-panel");
  });
  it("place → --text-faint-on-panel (note the dash)", () => {
    expect(kindOnPanelVar("place")).toBe("--text-faint-on-panel");
  });
  it("unknown kind → --text-faint-on-panel (fail-safe)", () => {
    expect(kindOnPanelVar("totally_unknown")).toBe("--text-faint-on-panel");
  });
});

// Mapping-integrity guard: for every declared kind, kindOnPanelVar must equal
// the dashed slot name + "-on-panel". A wrong-slot edit in either map (or a
// dropped textFaint→text-faint dash) would regress the feature while every
// per-kind assertion above stayed green. Pin both maps to KIND_SLOT.
describe("kind→on-panel mapping integrity", () => {
  const dashed = (slot: string) => (slot === "textFaint" ? "text-faint" : slot);
  for (const kind of Object.keys(KIND_SLOT)) {
    it(`${kind} resolves to its slotFor on-panel var`, () => {
      const slot = slotFor(kind);
      const expected =
        slot === "r0" || slot === "r4"
          ? "--text-faint-on-panel" // fail-safe: no r0/r4 on-panel var exists
          : `--${dashed(slot)}-on-panel`;
      expect(kindOnPanelVar(kind)).toBe(expected);
    });
  }
});
