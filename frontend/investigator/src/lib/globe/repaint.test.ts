import { describe, it, expect, vi } from "vitest";
import { mlColors, mlAuthColorExpr, repaintGlobeColors } from "./repaint";
import { resolvePalette } from "../../theme/resolve";
import { tzBandColorExpr, tzBandOpacity } from "./tzBands";
import { TZ_BAND_FILL_OPACITY, TZ_BAND_HIGHLIGHT_OPACITY } from "./constants";
import type maplibregl from "maplibre-gl";

// ── Palette fixtures ──────────────────────────────────────────────────────────
const darkNeon = resolvePalette("dark", "neon");

// ── mlColors ─────────────────────────────────────────────────────────────────
describe("mlColors", () => {
  it("dark/neon auth is the neon r1 slot (#00E5FF)", () => {
    // neon dark r1 = "#00E5FF" (from tokens.ts RAMPS.neon.dark.r1)
    expect(mlColors(darkNeon).auth.toLowerCase()).toBe("#00e5ff");
  });

  it("dark/neon fraud is the neon alarm (#FF3D2E)", () => {
    // ALARM_OVERRIDES.neon.dark = "#FF3D2E"
    expect(mlColors(darkNeon).fraud.toLowerCase()).toBe("#ff3d2e");
  });

  it("dark/neon login is the neon r2 slot (#FF5CE8, magenta by user preference)", () => {
    // neon dark r2 = "#FF5CE8" (from tokens.ts RAMPS.neon.dark.r2) -- magenta
    // login nodes in the vivid mode (2026-06-17 user preference).
    expect(mlColors(darkNeon).login.toLowerCase()).toBe("#ff5ce8");
  });

  it("place is neutral.textFaint (not a hardcoded color)", () => {
    // Just assert it comes from the palette's textFaint token
    expect(mlColors(darkNeon).place).toBe(darkNeon.neutral.textFaint);
  });
});

// ── mlAuthColorExpr ───────────────────────────────────────────────────────────
describe("mlAuthColorExpr", () => {
  it("produces the expected case expression for dark/neon", () => {
    const expr = mlAuthColorExpr(darkNeon);
    expect(expr).toEqual([
      "case",
      ["==", ["get", "is_fraud"], 1],
      "#FF3D2E",   // darkNeon alarm
      "#00E5FF",   // darkNeon auth (r1)
    ]);
  });
});

// ── repaintGlobeColors ────────────────────────────────────────────────────────
describe("repaintGlobeColors", () => {
  function makeMockMap() {
    return {
      getLayer: vi.fn(() => ({})),
      setPaintProperty: vi.fn(),
      setSky: vi.fn(),
    } as unknown as maplibregl.Map;
  }

  it("calls setPaintProperty for the auth dot layer with the auth color expr", () => {
    const map = makeMockMap();
    repaintGlobeColors(map, darkNeon);
    const calls = (map.setPaintProperty as ReturnType<typeof vi.fn>).mock.calls;
    const authDotCall = calls.find(
      (c: unknown[]) => c[0] === "ml-auths-dot" && c[1] === "circle-color",
    );
    expect(authDotCall).toBeDefined();
    // The expression should deep-equal what mlAuthColorExpr produces
    expect(authDotCall![2]).toEqual(mlAuthColorExpr(darkNeon));
  });

  it("recolours the tz band fill + highlight with the theme's colour ring and the labels with its ink", () => {
    const map = makeMockMap();
    const light = resolvePalette("light", "neon");
    repaintGlobeColors(map, light);
    const calls = (map.setPaintProperty as ReturnType<typeof vi.fn>).mock.calls;
    const paint = (id: string, prop: string) => calls.find((c: unknown[]) => c[0] === id && c[1] === prop)?.[2];
    expect(paint("ml-tz-band-fill-layer", "fill-color")).toEqual(tzBandColorExpr(light));
    expect(paint("ml-tz-band-highlight-layer", "fill-color")).toEqual(tzBandColorExpr(light));
    // The zoom fade survives a colour-mode flip (the same expression setupLayers builds).
    expect(paint("ml-tz-band-fill-layer", "fill-opacity")).toEqual(tzBandOpacity(TZ_BAND_FILL_OPACITY.light));
    expect(paint("ml-tz-band-highlight-layer", "fill-opacity")).toEqual(
      tzBandOpacity(TZ_BAND_HIGHLIGHT_OPACITY.light),
    );
    expect(TZ_BAND_FILL_OPACITY.light).toBeLessThan(TZ_BAND_HIGHLIGHT_OPACITY.light);
    expect(paint("ml-tz-band-label-layer", "text-color")).toBe(light.neutral.textMuted);
    expect(paint("ml-tz-band-label-layer", "text-halo-color")).toBe(light.neutral.ink900);
  });

  it("calls setSky exactly once", () => {
    const map = makeMockMap();
    repaintGlobeColors(map, darkNeon);
    expect((map.setSky as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("skips layers that getLayer returns falsy for", () => {
    const map = makeMockMap();
    // Only ml-auths-dot exists
    (map.getLayer as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string) => id === "ml-auths-dot" ? {} : null,
    );
    repaintGlobeColors(map, darkNeon);
    const calls = (map.setPaintProperty as ReturnType<typeof vi.fn>).mock.calls;
    const ids = calls.map((c: unknown[]) => c[0] as string);
    // Only the layer that exists should receive setPaintProperty calls
    expect(ids.every((id) => id === "ml-auths-dot")).toBe(true);
  });
});
