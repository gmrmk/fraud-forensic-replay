/**
 * The ring on every dot of ml-auths-dot.
 *
 * Every transaction dot gets a 3 px stroke: the palette's neutral text colour, and the alarm colour
 * for a fraud dot (the same is_fraud test the layer's fill uses). MapLibre paint cannot read a CSS
 * variable, so the colour is resolved from the palette at layer creation and again on every repaint.
 *
 * The expected colours are literals, not read from the module under test: the text colours are the
 * palette's neutral text (#10151C light, #E6EAF0 dark; tokens.ts NEUTRAL_LIGHT and NEUTRAL_DARK) and the
 * alarm colours are the values the layer's fill already carries in each cell
 * (MARKER-FRAMES.md section 1, and repaint.test.ts for dark neon).
 *
 * Scope: only ml-auths-dot. The token story's dots (ml-generic-dot) and the login dots sit on other
 * layers and keep no stroke; a test pins that they stay as drawn.
 */
import { describe, it, expect, vi } from "vitest";
import { Color, createPropertyExpression, latest } from "@maplibre/maplibre-gl-style-spec";
import { setupLayers } from "./setupLayers";
import { repaintGlobeColors } from "./repaint";
import { resolvePalette } from "../../theme/resolve";
import type maplibregl from "maplibre-gl";

// No test here may fetch the world file: the world layer is a spy.
vi.mock("./worldBase", () => ({ attachWorldBase: vi.fn(() => vi.fn()) }));

const TEXT = { light: "#10151c", dark: "#e6eaf0" } as const;
// The fraud branch of the fill expression in each cell tested here.
const ALARM = {
  "light neon": "#c9221a",
  "dark neon": "#ff3d2e",
  "dark deuteranopia": "#ff6b35",
} as const;

type Paint = Record<string, unknown>;

function orderedMap() {
  const order: { id: string; type: string; paint?: Paint }[] = [];
  const map = {
    setProjection: vi.fn(),
    setSky: vi.fn(),
    getLayer: vi.fn((id: string) => order.find((l) => l.id === id)),
    getStyle: vi.fn(() => ({ layers: [] })),
    getSource: vi.fn(() => undefined),
    addSource: vi.fn(),
    addLayer: vi.fn((l: { id: string; type: string; paint?: Paint }, before?: string) => {
      const i = before ? order.findIndex((x) => x.id === before) : -1;
      if (i >= 0) order.splice(i, 0, l);
      else order.push(l);
    }),
    getCanvas: vi.fn(() => ({ style: {} })),
    on: vi.fn(() => ({ unsubscribe: () => {} })),
  } as unknown as maplibregl.Map;
  return { map, order };
}

const deps = {
  markerHandlersRef: { current: null },
  pathsRef: { current: [] },
} as unknown as Parameters<typeof setupLayers>[1];

const toRgb = (c: Color): string =>
  `rgb(${[c.r, c.g, c.b].map((v) => Math.round((v / (c.a || 1)) * 255)).join(",")})`;
const rgb = (hex: string): string => toRgb(Color.parse(hex) as Color);

/** The ring colour as the style spec's own evaluator reads it for a dot with this is_fraud value. */
function ringColour(expr: unknown, isFraud: 0 | 1): string {
  const compiled = createPropertyExpression(expr, latest.paint_circle["circle-stroke-color"]);
  if (compiled.result !== "success") throw new Error(JSON.stringify(compiled.value));
  const c = compiled.value.evaluate({ zoom: 2 }, { type: 1, properties: { is_fraud: isFraud } } as never, {}) as Color;
  return toRgb(c);
}

/** A paint property as the style spec's own evaluator reads it for a dot with this feature state. */
function evalPaint(
  expr: unknown,
  spec: unknown,
  state: Record<string, number>,
  isFraud: 0 | 1 = 0,
): unknown {
  const compiled = createPropertyExpression(expr, spec as never);
  if (compiled.result !== "success") throw new Error(JSON.stringify(compiled.value));
  return compiled.value.evaluate({ zoom: 2 }, { type: 1, properties: { is_fraud: isFraud } } as never, state);
}
const ringWidth = (expr: unknown, state: Record<string, number>): number =>
  evalPaint(expr, latest.paint_circle["circle-stroke-width"], state) as number;
const fillColour = (expr: unknown, isFraud: 0 | 1): string =>
  toRgb(evalPaint(expr, latest.paint_circle["circle-color"], {}, isFraud) as Color);

const norm = (v: unknown): unknown =>
  typeof v === "string" ? v.toLowerCase() : Array.isArray(v) ? v.map(norm) : v;

const expected = (alarm: string, text: string) => [
  "case",
  ["==", ["get", "is_fraud"], 1],
  alarm,
  text,
];

describe("ml-auths-dot ring as the layer is created", () => {
  const cells: [("light" | "dark"), "neon" | "deuteranopia", keyof typeof ALARM][] = [
    ["light", "neon", "light neon"],
    ["dark", "neon", "dark neon"],
    ["dark", "deuteranopia", "dark deuteranopia"],
  ];

  it.each(cells)("%s %s: stroke width 3, opacity 1, text colour for a plain dot and the alarm colour for fraud", (theme, color, key) => {
    const { map, order } = orderedMap();
    setupLayers(map, deps, resolvePalette(theme, color));
    const paint = order.find((l) => l.id === "ml-auths-dot")!.paint as Paint;
    // A dot with no feature state keeps the 3 px ring (the width's full evaluation is pinned below).
    expect(ringWidth(paint["circle-stroke-width"], {})).toBe(3);
    expect(paint["circle-stroke-opacity"]).toBe(1);
    // The fill's fraud branch, as the evaluator reads its output colour (not only its condition).
    expect(fillColour(paint["circle-color"], 1)).toBe(rgb(ALARM[key]));
    expect(norm(paint["circle-stroke-color"])).toEqual(expected(ALARM[key], TEXT[theme]));
    // Run through MapLibre's own evaluator: the expression is legal for this property and picks the branch on is_fraud.
    expect(ringColour(paint["circle-stroke-color"], 0)).toBe(rgb(TEXT[theme]));
    expect(ringColour(paint["circle-stroke-color"], 1)).toBe(rgb(ALARM[key]));
  });

  it("the ring's fraud test is the fill's fraud test", () => {
    const { map, order } = orderedMap();
    setupLayers(map, deps, resolvePalette("dark", "neon"));
    const paint = order.find((l) => l.id === "ml-auths-dot")!.paint as Paint;
    const fill = paint["circle-color"] as unknown[];
    const ring = paint["circle-stroke-color"] as unknown[];
    expect(ring[0]).toBe(fill[0]);
    expect(ring[1]).toEqual(fill[1]);
  });

  // The ring comes with the dot. The dot's radius is
  // 3 * land * sel; land is 0 for a fraud dot at or before its event time (landingScale), so the ring
  // follows the same land term, with the same default of 1 for a feature with no land state.
  describe("the ring's width follows the dot's land state", () => {
    const width = (state: Record<string, number>) => {
      const { map, order } = orderedMap();
      setupLayers(map, deps, resolvePalette("light", "neon"));
      return ringWidth((order.find((l) => l.id === "ml-auths-dot")!.paint as Paint)["circle-stroke-width"], state);
    };
    it("land 0 (the dot is not drawn): no ring", () => expect(width({ land: 0 })).toBe(0));
    it("land 0 with sel above 1: still no ring", () => expect(width({ land: 0, sel: 1.4 })).toBe(0));
    it("land 1: the 3 px ring", () => expect(width({ land: 1 })).toBe(3));
    it("a dot with no feature state: the 3 px ring", () => expect(width({})).toBe(3));
    it("a selected dot (sel above 1): keeps the 3 px ring, not scaled", () => {
      expect(width({ sel: 1.4 })).toBe(3);
      expect(width({ land: 1, sel: 1.4 })).toBe(3);
    });
    it("mid landing (0 < land < 1) and the overshoot (land above 1): 3 px, a step at land 0 and not a scale", () => {
      expect(width({ land: 0.5 })).toBe(3);
      expect(width({ land: 1.1 })).toBe(3);
    });
  });

  it("the layers the pick does not name keep no stroke", () => {
    const { map, order } = orderedMap();
    setupLayers(map, deps, resolvePalette("light", "neon"));
    for (const id of ["ml-auths-halo", "ml-logins-dot", "ml-logins-halo", "ml-generic-dot", "ml-generic-halo", "ml-places-dot"]) {
      const paint = order.find((l) => l.id === id)!.paint as Paint;
      expect(paint["circle-stroke-width"], id).toBeUndefined();
      expect(paint["circle-stroke-color"], id).toBeUndefined();
    }
  });
});

describe("ml-auths-dot ring on a repaint", () => {
  function recordingMap() {
    return {
      getLayer: vi.fn(() => ({})),
      setPaintProperty: vi.fn(),
      setSky: vi.fn(),
    } as unknown as maplibregl.Map;
  }
  const ringCalls = (map: maplibregl.Map) =>
    (map.setPaintProperty as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === "ml-auths-dot" && c[1] === "circle-stroke-color",
    );

  it("a theme switch from light to dark changes the ring's text colour and keeps the case on is_fraud", () => {
    const map = recordingMap();
    repaintGlobeColors(map, resolvePalette("light", "neon"));
    repaintGlobeColors(map, resolvePalette("dark", "neon"));
    const calls = ringCalls(map);
    expect(calls).toHaveLength(2);
    expect(norm(calls[0][2])).toEqual(expected(ALARM["light neon"], TEXT.light));
    expect(norm(calls[1][2])).toEqual(expected(ALARM["dark neon"], TEXT.dark));
    expect(ringColour(calls[0][2], 0)).not.toBe(ringColour(calls[1][2], 0));
  });

  it("a colour mode switch inside one theme changes the fraud branch and keeps the text colour", () => {
    const map = recordingMap();
    repaintGlobeColors(map, resolvePalette("dark", "neon"));
    repaintGlobeColors(map, resolvePalette("dark", "deuteranopia"));
    const calls = ringCalls(map);
    expect(norm(calls[0][2])).toEqual(expected(ALARM["dark neon"], TEXT.dark));
    expect(norm(calls[1][2])).toEqual(expected(ALARM["dark deuteranopia"], TEXT.dark));
  });

  it("a repaint writes only the ring's colour on this layer's stroke, never its width, so the 3 px holds", () => {
    const map = recordingMap();
    repaintGlobeColors(map, resolvePalette("light", "neon"));
    const props = (map.setPaintProperty as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => c[0] === "ml-auths-dot")
      .map((c: unknown[]) => c[1]);
    expect(props).toContain("circle-color");
    expect(props).toContain("circle-stroke-color");
    expect(props).not.toContain("circle-stroke-width");
  });
});
