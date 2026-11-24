/**
 * The two runtime corrections to the OpenFreeMap liberty style. Dark recolours it; light keeps
 * it as shipped and takes the green outline off the area fills.
 */
import { describe, it, expect, vi } from "vitest";
import { applyDarkLiberty, applyLightLiberty } from "./darkenLiberty";
import type { Map as MapLibreMap } from "maplibre-gl";

// Layers as liberty ships them (ids, types, source-layers and paint copied from the style).
const LIBERTY = [
  { id: "background", type: "background", paint: { "background-color": "#f8f4f0" } },
  { id: "park", type: "fill", "source-layer": "park", paint: { "fill-color": "#d8e8c8", "fill-opacity": 0.7, "fill-outline-color": "rgba(95, 208, 100, 1)" } },
  { id: "landcover_wood", type: "fill", "source-layer": "landcover", paint: { "fill-antialias": false, "fill-color": "hsla(98,61%,72%,0.7)", "fill-opacity": 0.4 } },
  { id: "landuse_school", type: "fill", "source-layer": "landuse", paint: { "fill-color": "rgb(236,238,204)" } },
  { id: "water", type: "fill", "source-layer": "water", paint: { "fill-color": "rgb(158,189,255)" } },
  { id: "building", type: "fill", "source-layer": "building", paint: { "fill-color": "hsl(35,8%,85%)", "fill-outline-color": "hsla(35,6%,79%,0.32)" } },
  { id: "ml-ocean-base", type: "fill", paint: { "fill-color": "#f8f4f0", "fill-outline-color": "#00ff00" } },
];

function fakeMap(layers: unknown[] = LIBERTY) {
  const setPaintProperty = vi.fn();
  const map = { getStyle: () => ({ layers }), setPaintProperty, setLight: vi.fn() } as unknown as MapLibreMap;
  /** The last value set for one paint property of one layer. */
  const painted = (id: string, prop: string): unknown =>
    setPaintProperty.mock.calls.filter(([layer, name]) => layer === id && name === prop).at(-1)?.[2];
  return { map, setPaintProperty, painted };
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channel = (i: number): number => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("applyLightLiberty", () => {
  it("takes the green outline off the park areas, and touches nothing else", () => {
    // Liberty outlines every park polygon in a saturated green. At continental zoom that is
    // thousands of small rings: a green wireframe over the land. Unset, the outline takes the
    // fill's own colour (the style spec's default).
    const { map, setPaintProperty } = fakeMap();
    applyLightLiberty(map);
    expect(setPaintProperty.mock.calls).toEqual([["park", "fill-outline-color", null]]);
  });

  it("does the same for any landcover or landuse fill that carries an outline of its own", () => {
    const { map, setPaintProperty } = fakeMap([
      { id: "landcover_new", type: "fill", "source-layer": "landcover", paint: { "fill-color": "#cde", "fill-outline-color": "#0a0" } },
      { id: "landuse_new", type: "fill", "source-layer": "landuse", paint: { "fill-color": "#edc", "fill-outline-color": "#0a0" } },
      { id: "landuse_line", type: "line", "source-layer": "landuse", paint: { "line-color": "#0a0" } },
    ]);
    applyLightLiberty(map);
    expect(setPaintProperty.mock.calls).toEqual([
      ["landcover_new", "fill-outline-color", null],
      ["landuse_new", "fill-outline-color", null],
    ]);
  });
});

describe("applyDarkLiberty", () => {
  it("tells water from land: the two tones stand at least a tenth apart in contrast", () => {
    // Land has no polygons of its own in this style (it is the base colour and the area fills),
    // so with water at the same tone the coastlines vanish and the labels float on black.
    const { map, painted } = fakeMap();
    applyDarkLiberty(map);
    const water = painted("water", "fill-color") as string;
    const land = painted("park", "fill-color") as string;
    const base = painted("background", "background-color") as string;
    expect(contrast(water, land)).toBeGreaterThanOrEqual(1.1);
    expect(contrast(water, base)).toBeGreaterThanOrEqual(1.1);
    // Water is the lighter and the bluer of the two, and still a dark tone.
    expect(luminance(water)).toBeGreaterThan(luminance(land));
    expect(luminance(water)).toBeLessThan(0.03);
  });

  it("leaves no outline of another colour on an area or on water", () => {
    const { map, painted } = fakeMap();
    applyDarkLiberty(map);
    expect(painted("park", "fill-outline-color")).toBe(painted("park", "fill-color"));
    expect(painted("water", "fill-outline-color")).toBe(painted("water", "fill-color"));
  });

  it("leaves the app's own layers alone", () => {
    const { map, setPaintProperty } = fakeMap();
    applyDarkLiberty(map);
    expect(setPaintProperty.mock.calls.filter(([layer]) => String(layer).startsWith("ml-"))).toEqual([]);
  });
});
