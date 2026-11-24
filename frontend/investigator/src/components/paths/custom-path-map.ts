/**
 * The map side of the investigator's paths: one geojson source, four layers added on top of the stack
 * and one transparent image, the colour repaint after a theme change, and the line's tooltip. A narrow
 * map type (`CustomPathMap`) names only the calls made, so a fake can stand in for the real map.
 *
 *   casing  a solid 4 px line in the theme's ground ink under the dashes, so they read over any basemap
 *   line    the dashed neutral line: 2 px, dashes 4 and 1.5 (8 px on, 3 px off), the theme's text ink
 *   hit     an invisible 10 px line over each stretch between two stops, for the hover's words
 *   clear   a symbol layer: an invisible 24 by 13 icon at each plate's box that keeps its place against
 *           basemap labels (maplibre places from the top layer down), so a label that would sit under
 *           a plate is not drawn
 *
 * What this file does not do: it draws no plate (the markers do), computes no geometry (path-geometry
 * does), reads no store, and never calls the map without a loaded style. A destructive style swap
 * wipes the source, the layers and the image; `ensureCustomPathLayers` puts back whatever is missing,
 * and the caller decides when to call it (the map's next `idle`).
 *
 * LIMIT: the clearance only holds against label layers that take part in collision; a label layer whose
 * style sets text-allow-overlap true would still draw under a plate (PLAN-path U-P1, settled by frame).
 */
import type { LayerSpecification, SourceSpecification } from "maplibre-gl";
import { showTipAt } from "../ui/Tip";
import { LINE, PLATE, type LineFeature, type PlateFeature } from "./path-geometry";

/** The ids of the one source, the four layers and the image. */
export const CPATH = {
  source: "ffr-custom-paths",
  casing: "ffr-custom-paths-casing",
  line: "ffr-custom-paths-line",
  hit: "ffr-custom-paths-hit",
  clear: "ffr-custom-paths-clear",
  image: "ffr-custom-paths-clear",
} as const;

/** The two inks the line paints in: the theme's text ink and its background ink. */
export interface PathInk {
  text: string;
  bg: string;
}

/** The clearance image: invisible, 24 px wide and as high as a plate. */
const CLEAR = { width: 24, height: PLATE.globe.height } as const;

/** The calls made on the map. The real maplibre Map satisfies it; a test's fake does too. */
export interface CustomPathMap {
  isStyleLoaded(): boolean;
  getSource(id: string): unknown;
  addSource(id: string, spec: SourceSpecification): unknown;
  getLayer(id: string): unknown;
  addLayer(spec: LayerSpecification): unknown;
  setPaintProperty(layer: string, name: string, value: unknown): unknown;
  hasImage(id: string): boolean;
  addImage(id: string, image: { width: number; height: number; data: Uint8Array }): unknown;
}

/** The one source's data: the lines' features, then the plates'. */
export function pathData(lines: readonly LineFeature[], plates: readonly PlateFeature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [...lines, ...plates] };
}

const role = (r: "run" | "seg" | "plate"): ["==", ["get", string], string] => ["==", ["get", "role"], r];

const layers = (ink: PathInk): LayerSpecification[] => [
  {
    id: CPATH.casing,
    type: "line",
    source: CPATH.source,
    filter: role("run"),
    layout: { "line-cap": "butt", "line-join": "miter" },
    paint: {
      "line-width": LINE.globe.casingWidth,
      "line-color": ink.bg,
      "line-opacity": ["*", LINE.globe.casingOpacity, ["get", "op"]],
    },
  },
  {
    id: CPATH.line,
    type: "line",
    source: CPATH.source,
    filter: role("run"),
    layout: { "line-cap": "butt", "line-join": "miter" },
    paint: {
      "line-width": LINE.globe.width,
      "line-dasharray": [...LINE.globe.dash],
      "line-color": ink.text,
      "line-opacity": ["*", LINE.globe.opacity, ["get", "op"]],
    },
  },
  {
    id: CPATH.hit,
    type: "line",
    source: CPATH.source,
    filter: role("seg"),
    // A line at opacity 0 is still found by a query: maplibre's `isHidden` does not read opacity.
    paint: { "line-width": LINE.globe.hitWidth, "line-color": ink.text, "line-opacity": 0 },
  },
  {
    id: CPATH.clear,
    type: "symbol",
    source: CPATH.source,
    filter: role("plate"),
    layout: {
      "icon-image": CPATH.image,
      "icon-anchor": "right",
      "icon-offset": [PLATE.globe.offsetX, 0],
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
    },
  },
];

/** True with the source and all four layers in the style. */
export function hasCustomPathLayers(map: Pick<CustomPathMap, "getSource" | "getLayer">): boolean {
  return map.getSource(CPATH.source) !== undefined && [CPATH.casing, CPATH.line, CPATH.hit, CPATH.clear].every((id) => map.getLayer(id) !== undefined);
}

/**
 * Makes the source, the image and the four layers exist (each only when missing, layers on top of the
 * stack) and sets the data; true when all of it is in place.
 *
 * `isStyleLoaded` is false not only while a style loads but whenever any source's tiles are loading or an
 * update is pending, as during a camera fly. So it gates the ADDS only: a source that is already there
 * takes its data at any time (a change dropped while the map is busy would stay dropped, since the next
 * `idle` finds the layers in place and does nothing). With the source gone (a style swap wiped it) and
 * the style not loaded, nothing is asked of the map and the answer is false.
 */
export function ensureCustomPathLayers(map: CustomPathMap, data: GeoJSON.FeatureCollection, ink: PathInk): boolean {
  const source = map.getSource(CPATH.source) as { setData(d: GeoJSON.FeatureCollection): unknown } | undefined;
  if (source) {
    source.setData(data);
    if (map.hasImage(CPATH.image) && hasCustomPathLayers(map)) return true;
  }
  if (!map.isStyleLoaded()) return false;
  if (!source) map.addSource(CPATH.source, { type: "geojson", data });
  if (!map.hasImage(CPATH.image)) {
    map.addImage(CPATH.image, { width: CLEAR.width, height: CLEAR.height, data: new Uint8Array(CLEAR.width * CLEAR.height * 4) });
  }
  for (const spec of layers(ink)) if (!map.getLayer(spec.id)) map.addLayer(spec);
  return true;
}

/**
 * Repaints the casing and the line for a new theme or colour. A layer that is in place takes its paint at
 * any time (not gated by `isStyleLoaded`, which is false whenever tiles load); one that is gone (a style
 * swap wiped it) is skipped, and the layers come back with the new ink on the next idle.
 */
export function paintCustomPath(map: Pick<CustomPathMap, "getLayer" | "setPaintProperty">, ink: PathInk): void {
  if (map.getLayer(CPATH.casing)) map.setPaintProperty(CPATH.casing, "line-color", ink.bg);
  if (map.getLayer(CPATH.line)) map.setPaintProperty(CPATH.line, "line-color", ink.text);
}

/** The calls the line's tooltip makes: a delegated hover on the hit layer, the map's move, the canvas box. */
export interface LineTipMap {
  on(type: "mousemove", layer: string, listener: (e: LineHover) => void): unknown;
  on(type: "mouseleave", layer: string, listener: () => void): unknown;
  on(type: "movestart", listener: () => void): unknown;
  off(type: "mousemove", layer: string, listener: (e: LineHover) => void): unknown;
  off(type: "mouseleave", layer: string, listener: () => void): unknown;
  off(type: "movestart", listener: () => void): unknown;
  getCanvas(): { getBoundingClientRect(): { left: number; top: number } };
}

/** The part of a delegated hover event read here: where the pointer is and the stretches under it. */
export interface LineHover {
  point: { x: number; y: number };
  features?: readonly { properties?: { [name: string]: unknown } | null }[];
}

/**
 * Binds the line's tooltip: the words of the stretch under the pointer (`wordsOf(path name, from, to)`),
 * placed beside the pointer. It hides only a tooltip it showed itself, as the globe's own tooltip does,
 * so a tooltip that keyboard focus holds on a plate stays. Returns the function that unbinds all three
 * and hides. Binding to a layer that does not exist is harmless (the map's delegated listeners filter to
 * existing layers), so it can be bound before the layers are added and stays bound across a style swap.
 */
export function bindLineTip(map: LineTipMap, wordsOf: (name: string, from: number, to: number) => string[]): () => void {
  let shown = false;
  const hide = (): void => {
    if (!shown) return;
    shown = false;
    showTipAt(null);
  };
  const onMove = (e: LineHover): void => {
    const props = e.features?.[0]?.properties;
    if (!props || typeof props.name !== "string") return hide();
    const box = map.getCanvas().getBoundingClientRect();
    shown = true;
    showTipAt({ x: box.left + e.point.x, y: box.top + e.point.y }, wordsOf(props.name, Number(props.from), Number(props.to)));
  };
  map.on("mousemove", CPATH.hit, onMove);
  map.on("mouseleave", CPATH.hit, hide);
  map.on("movestart", hide);
  return () => {
    map.off("mousemove", CPATH.hit, onMove);
    map.off("mouseleave", CPATH.hit, hide);
    map.off("movestart", hide);
    hide();
  };
}
