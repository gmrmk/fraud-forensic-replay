import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type maplibregl from "maplibre-gl";
import {
  tzBandColor,
  tzBandColorExpr,
  tzBandOpacity,
  tzOffsetLabel,
  withTzLabels,
  tzBandAt,
  selectedBand,
  applyTzHighlight,
  TZ_BAND_HIGHLIGHT_LAYER,
  TZ_BAND_LABEL_LAYER,
} from "./tzBands";
import { resolvePalette } from "../../theme/resolve";
import { hexToRgb01 } from "../../theme/to-rgb";
import type { AccountEvent, LoginEvent, SelectedEntity } from "../../types";
import type { Entity } from "../entity";

const dark = resolvePalette("dark", "neon");
const light = resolvePalette("light", "neon");

/** Euclidean RGB distance on the 0-255 scale. */
function dist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb01(a);
  const [r2, g2, b2] = hexToRgb01(b);
  return 255 * Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** Hue in degrees [0, 360) of a hex colour. */
function hue(hex: string): number {
  const [r, g, b] = hexToRgb01(hex);
  const max = Math.max(r, g, b);
  const c = max - Math.min(r, g, b);
  if (c === 0) return 0;
  const h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/** Value of a ["interpolate", ["linear"], ["zoom"], z0, v0, z1, v1, ...] expression at a zoom. */
function atZoom(expr: unknown, zoom: number): number {
  const [op, [curve], [input], ...stops] = expr as [string, [string], [string], ...number[]];
  expect([op, curve, input]).toEqual(["interpolate", "linear", "zoom"]);
  if (zoom <= stops[0]) return stops[1];
  for (let i = 2; i < stops.length; i += 2) {
    if (zoom <= stops[i]) {
      const t = (zoom - stops[i - 2]) / (stops[i] - stops[i - 2]);
      return stops[i - 1] + t * (stops[i + 1] - stops[i - 1]);
    }
  }
  return stops[stops.length - 1];
}

/** Every pair of standard-offset bands that touch in public/data/timezones.geojson, found by
 *  sampling 0.2 deg either side of every third band vertex (scratch probe, 2026-10-05). The
 *  -12|+12 pair is left out on purpose: same clock face, same colour. */
const REAL_NEIGHBOURS: [number, number][] = [
  [-10, -9], [-10, -9.5], [-10, 12], [-10, 13], [-10, 14], [-11, -10], [-11, -9], [-11, 12],
  [-11, 13], [-11, 14], [-12, -10], [-12, -11], [-12, 13], [-1, 0], [-1, 1], [-2, -1], [-2, 0],
  [-3.5, -3], [-3, -1], [-3, -2], [-3, 0], [-4, -3], [-4, -3.5], [-5, -3], [-5, -4], [-6, -5],
  [-7, -5], [-7, -6], [-8, -7], [-9.5, -9], [-9, -7], [-9, -8], [-9, 12], [0, 1], [10.5, 11],
  [10, 11], [10, 12], [11, 11.5], [11, 12], [12, 13], [13, 14], [1, 2], [1, 3], [2, 3], [3.5, 4],
  [3.5, 4.5], [3.5, 5], [3, 3.5], [3, 4], [3, 5], [4.5, 5], [4.5, 8], [4, 5], [5.5, 5.75],
  [5.5, 6], [5.5, 6.5], [5.5, 8], [5.75, 8], [5, 5.5], [5, 6], [5, 6.5], [5, 7], [5, 8], [6.5, 7],
  [6.5, 8], [6.5, 9], [6, 6.5], [6, 7], [6, 8], [7, 8], [7, 9], [8.5, 10], [8.5, 9], [8, 10],
  [8, 8.5], [8, 9], [8, 9.5], [9.5, 10], [9, 10], [9, 11], [9, 9.5],
];

// The real vendored asset: the point-in-polygon must agree with it, not only with fixtures.
const BANDS = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../public/data/timezones.geojson"),
    "utf8",
  ),
) as GeoJSON.FeatureCollection;

// ── colour ring ──────────────────────────────────────────────────────────────
describe("tzBandColor", () => {
  it("returns a #rrggbb hex", () => {
    expect(tzBandColor(1, dark)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("is cyclic over 24 hours: UTC-12 and UTC+12 share a clock face and a colour", () => {
    expect(tzBandColor(-12, dark)).toBe(tzBandColor(12, dark));
    expect(tzBandColor(-12, light)).toBe(tzBandColor(12, light));
  });

  it("the next-calendar-day bands (+13, +14) keep the hue of -11 / -10 but part from them across the date line", () => {
    for (const p of [dark, light]) {
      for (const [ahead, behind] of [[13, -11], [14, -10]]) {
        // within 2 deg: 8-bit rounding of a low-saturation hex moves its hue a little
        const dh = Math.abs(hue(tzBandColor(ahead, p)) - hue(tzBandColor(behind, p)));
        expect(dh, `${p.theme} ${ahead}`).toBeLessThan(2);
        const d = dist(tzBandColor(ahead, p), tzBandColor(behind, p));
        expect(d, `${p.theme} ${ahead} vs ${behind}`).toBeGreaterThan(40);
      }
    }
  });

  it("every pair of bands that touch in timezones.geojson clearly differs on both themes", () => {
    for (const p of [dark, light]) {
      for (const [a, b] of REAL_NEIGHBOURS) {
        const d = dist(tzBandColor(a, p), tzBandColor(b, p));
        expect(d, `${p.theme} ${a} vs ${b}`).toBeGreaterThan(40);
      }
    }
  });

  it("neighbouring whole-hour bands clearly differ on both themes", () => {
    for (const p of [dark, light]) {
      for (let k = -12; k < 14; k++) {
        const d = dist(tzBandColor(k, p), tzBandColor(k + 1, p));
        expect(d, `${p.theme} ${k} vs ${k + 1}`).toBeGreaterThan(40);
      }
    }
  });

  it("fractional offsets sit on the hue wheel between their whole-hour neighbours", () => {
    for (const p of [dark, light]) {
      for (const [x, lo, hi] of [[5.5, 5, 6], [5.75, 5, 6], [-9.5, -10, -9], [-3.5, -4, -3]]) {
        expect(hue(tzBandColor(x, p)), `${p.theme} ${x}`).toBeGreaterThan(hue(tzBandColor(lo, p)));
        expect(hue(tzBandColor(x, p)), `${p.theme} ${x}`).toBeLessThan(hue(tzBandColor(hi, p)));
      }
      // a quarter past sits nearer the next hour than the half does
      expect(hue(tzBandColor(5.75, p))).toBeGreaterThan(hue(tzBandColor(5.5, p)));
    }
  });

  it("is deterministic per theme across the hued colour modes and differs between dark and light", () => {
    expect(tzBandColor(3, dark)).toBe(tzBandColor(3, resolvePalette("dark", "rainbow")));
    expect(tzBandColor(3, light)).toBe(tzBandColor(3, resolvePalette("light", "tritanopia")));
    expect(tzBandColor(3, dark)).not.toBe(tzBandColor(3, light));
  });

  it("monochrome mode drops the hue (pure greys) and neighbours still separate by lightness", () => {
    for (const theme of ["dark", "light"] as const) {
      const mono = resolvePalette(theme, "monochrome");
      for (let k = -12; k < 14; k++) {
        const [r, g, b] = hexToRgb01(tzBandColor(k, mono));
        expect(r, `${theme} ${k}`).toBe(g);
        expect(g, `${theme} ${k}`).toBe(b);
        const d = dist(tzBandColor(k, mono), tzBandColor(k + 1, mono));
        expect(d, `${theme} ${k} vs ${k + 1}`).toBeGreaterThan(40);
      }
    }
  });
});

describe("tzBandColorExpr", () => {
  it("interpolates on the numeric band offset with a stop every quarter hour from tzBandColor", () => {
    const expr = tzBandColorExpr(dark) as unknown[];
    expect(expr.slice(0, 3)).toEqual(["interpolate", ["linear"], ["to-number", ["get", "name"]]]);
    const stops = expr.slice(3);
    expect(stops[0]).toBe(-12);
    expect(stops[stops.length - 2]).toBe(14);
    expect(stops.length).toBe(2 * (26 * 4 + 1));
    const at = (x: number) => stops[stops.indexOf(x) + 1];
    expect(at(5.75)).toBe(tzBandColor(5.75, dark));
    expect(at(-6)).toBe(tzBandColor(-6, dark));
  });
});

describe("tzBandOpacity", () => {
  // Zoom 4.2 is GlobeMap's INITIAL_VIEW; zoom 8 is the lowest zoom a navigate() lands at
  // (store/navigation.ts ZOOM_PER_KIND: entity 8, login 10, auth/fraud 12, place 13). There one
  // band covers the whole viewport, so a fill there is a one-colour wash with no neighbour.
  it("holds the full opacity at the globe overview and continent zoom", () => {
    expect(atZoom(tzBandOpacity(0.17), 4.2)).toBeCloseTo(0.17);
    expect(atZoom(tzBandOpacity(0.42), 5)).toBeCloseTo(0.42);
  });
  it("fades to nothing before the zoom a navigate() lands at", () => {
    for (const z of [7, 8, 10, 12, 13]) expect(atZoom(tzBandOpacity(0.42), z), `z${z}`).toBe(0);
    const mid = atZoom(tzBandOpacity(0.42), 6);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.42);
  });
});

// ── labels ───────────────────────────────────────────────────────────────────
describe("tzOffsetLabel", () => {
  it.each([
    [1, "UTC+1"],
    [14, "UTC+14"],
    [-6, "UTC−6"],
    [5.5, "UTC+5:30"],
    [5.75, "UTC+5:45"],
    [-9.5, "UTC−9:30"],
    [-3.5, "UTC−3:30"],
    [0, "UTC±0"],
    [-0, "UTC±0"],
  ])("%s -> %s", (offset, label) => {
    expect(tzOffsetLabel(offset)).toBe(label);
  });

  it("uses the true minus sign U+2212, never a hyphen", () => {
    expect(tzOffsetLabel(-6)).not.toContain("-");
  });
});

describe("withTzLabels", () => {
  it("stamps a label on every band from its standard-offset name, without mutating the input", () => {
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: "-9.5" }, geometry: { type: "Point", coordinates: [0, 0] } },
        { type: "Feature", properties: { name: "+1" }, geometry: { type: "Point", coordinates: [0, 0] } },
      ],
    };
    const out = withTzLabels(fc);
    expect(out.features.map((f) => f.properties?.label)).toEqual(["UTC−9:30", "UTC+1"]);
    expect(out.features[1].properties?.name).toBe("+1");
    expect(fc.features[0].properties?.label).toBeUndefined();
  });
});

// ── point in polygon ─────────────────────────────────────────────────────────
const square = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Position[] => [
  [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0],
];
const fixture: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "+3" },
      geometry: { type: "Polygon", coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)] },
    },
    {
      type: "Feature",
      properties: { name: "-2" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [[square(20, 0, 30, 10)], [square(40, 0, 50, 10)]],
      },
    },
  ],
};

describe("tzBandAt", () => {
  it("finds the polygon that contains the point", () => {
    expect(tzBandAt(fixture, 2, 2)).toBe("+3");
  });
  it("returns null outside every band", () => {
    expect(tzBandAt(fixture, 15, 5)).toBeNull();
  });
  it("respects holes", () => {
    expect(tzBandAt(fixture, 5, 5)).toBeNull();
  });
  it("searches every part of a MultiPolygon", () => {
    expect(tzBandAt(fixture, 45, 5)).toBe("-2");
  });

  it("real bands: Amsterdam is in +1, Branson is in -6", () => {
    expect(tzBandAt(BANDS, 4.9, 52.37)).toBe("+1");
    expect(tzBandAt(BANDS, -93.22, 36.64)).toBe("-6");
  });

  it("real bands: the antimeridian (Fiji in +12, from either side of the wrap)", () => {
    expect(tzBandAt(BANDS, 178.44, -18.14)).toBe("+12");
    expect(tzBandAt(BANDS, 178.44 - 360, -18.14)).toBe("+12");
    const east = tzBandAt(BANDS, 180, -17);
    expect(east).not.toBeNull();
    expect(tzBandAt(BANDS, -180, -17)).toBe(east);
  });
});

// ── selection -> band (platform seam: abstract entity coords) ────────────────
describe("selectedBand", () => {
  const login = {
    id: "l1", timestamp: "2026-06-18T12:00:00Z", ip_lat: 52.37, ip_lng: 4.9,
    device_fp: "fp", outcome: "success", ip_type: "residential",
  } as unknown as LoginEvent;
  const event = {
    id: "e1", timestamp: "2026-06-18T12:00:00Z", kind: "payee_add",
  } as unknown as AccountEvent;
  const generic: Entity = {
    id: "p1", kind: "order", timestamp: 0, coords: { lat: 36.64, lng: -93.22 }, fields: {},
    displayMetadata: { primaryLabel: "", secondaryLabel: "", paletteKind: "order", pivotableFields: [] },
  };

  it("resolves a selected record with coords to its band", () => {
    expect(selectedBand(BANDS, { kind: "login", login })).toBe("+1");
    expect(selectedBand(BANDS, { kind: "entity", entity: generic })).toBe("-6");
  });
  it("no selection, no bands, or a coordless record -> null", () => {
    expect(selectedBand(BANDS, null)).toBeNull();
    expect(selectedBand(null, { kind: "login", login })).toBeNull();
    const coordless: SelectedEntity = { kind: "account_event", event };
    expect(selectedBand(BANDS, coordless)).toBeNull();
  });
});

// ── highlight wiring ─────────────────────────────────────────────────────────
describe("applyTzHighlight", () => {
  function mockMap() {
    return {
      getLayer: vi.fn(() => ({})),
      setFilter: vi.fn(),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
    } as unknown as maplibregl.Map & Record<string, ReturnType<typeof vi.fn>>;
  }

  it("filters the highlight fill to the selected band", () => {
    const map = mockMap();
    applyTzHighlight(map, "+1");
    expect(map.setFilter).toHaveBeenCalledWith(TZ_BAND_HIGHLIGHT_LAYER, ["==", ["get", "name"], "+1"]);
  });

  it("emphasises that band's label (bigger, bolder, placed first)", () => {
    const map = mockMap();
    applyTzHighlight(map, "+1");
    const layout = (map.setLayoutProperty as ReturnType<typeof vi.fn>).mock.calls;
    const props = layout.filter((c) => c[0] === TZ_BAND_LABEL_LAYER).map((c) => c[1]);
    expect(props).toEqual(expect.arrayContaining(["text-size", "text-font", "symbol-sort-key"]));
    const size = layout.find((c) => c[0] === TZ_BAND_LABEL_LAYER && c[1] === "text-size")?.[2];
    expect(size).toEqual(["case", ["==", ["get", "name"], "+1"], 12, 11]);
  });

  it("null clears the highlight (the filter matches no band)", () => {
    const map = mockMap();
    applyTzHighlight(map, null);
    const filter = (map.setFilter as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(filter).toEqual(["==", ["get", "name"], ""]);
    expect(BANDS.features.some((f) => f.properties?.name === "")).toBe(false);
  });

  it("is a no-op before the layers exist", () => {
    const map = mockMap();
    (map.getLayer as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    applyTzHighlight(map, "+1");
    expect(map.setFilter).not.toHaveBeenCalled();
    expect(map.setLayoutProperty).not.toHaveBeenCalled();
  });
});
