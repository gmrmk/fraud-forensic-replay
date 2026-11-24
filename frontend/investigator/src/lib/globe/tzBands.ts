/**
 * Timezone offset bands: the multicolour fill, the "UTC+1" labels and the
 * selected-record band highlight on top of the existing tz overlay.
 *
 * Colour: the 24 standard-offset hours read as ONE colour wheel around the globe
 * (15 deg of hue per hour, so UTC-12 and UTC+12 share a clock face and a colour),
 * with whole hours alternating a lighter and a deeper tone so neighbouring bands
 * separate clearly; a :30 or :45 offset's hue sits on the wheel between its two
 * neighbours, with its own tone (see TONE). Tone depends on the theme; monochrome
 * mode drops the hue and keeps the lightness steps. It recolours on a theme or
 * colour-mode flip (repaint.ts + the setupLayers rebuild). Both fills fade out
 * by city zoom (tzBandOpacity).
 *
 * Highlight: the band that contains the selected record's coords (abstract
 * Entity coords, any kind) gets a stronger fill and an emphasised label, the
 * account-takeover read: a login from a band the account never lives in.
 */
import type maplibregl from "maplibre-gl";
import type { ThemePalette } from "../../theme/tokens";
import type { Theme } from "../../theme/axes";
import type { SelectedEntity } from "../../types";
import { selectedToEntity } from "../adapters/ffr-seed";
import {
  TZ_BAND_FILL_OPACITY,
  TZ_BAND_HIGHLIGHT_OPACITY,
  TZ_LABEL_SIZE_PX,
  TZ_LABEL_HALO_WIDTH_PX,
  TZ_LABEL_REST_OPACITY,
  TZ_LABEL_MAXZOOM,
  TZ_BAND_FADE_START_ZOOM,
  TZ_BAND_FADE_END_ZOOM,
} from "./constants";

export const TZ_BANDS_SOURCE = "ml-tz-bands";
export const TZ_BAND_FILL_LAYER = "ml-tz-band-fill-layer";
export const TZ_BAND_HIGHLIGHT_LAYER = "ml-tz-band-highlight-layer";
export const TZ_BAND_LABEL_LAYER = "ml-tz-band-label-layer";
/** Every tz layer, bottom to top. One list for both visibility gates (the
 *  useTimezoneOverlay effect and repopulateGlobeSources after a swap). */
export const TZ_LAYER_IDS = [
  TZ_BAND_FILL_LAYER,
  TZ_BAND_HIGHLIGHT_LAYER,
  "ml-tz-night-layer",
  "ml-tz-band-layer",
  "ml-tz-terminator-layer",
  TZ_BAND_LABEL_LAYER,
] as const;

/** The glyph stacks OpenFreeMap liberty itself declares (its place/road labels),
 *  so the label glyphs load from the style's own font server. Both stacks carry
 *  U+2212 and U+00B1 (checked against the served 0-255 and 8704-8959 ranges). */
const FONT_REGULAR = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];

/** UTC+0 sits at a sea blue; each hour east turns the wheel 15 deg. */
const ZERO_HUE_DEG = 200;
const HUE_PER_HOUR_DEG = 15;
/** Saturation and lightness steps, %. Whole hours alternate `even` / `odd`. A :30
 *  band steps outside that pair (`deep` after an even hour, `pale` after an odd
 *  one) so it parts from both whole-hour neighbours and from the :30 band next
 *  door (India +5:30 | Myanmar +6:30); a :45 band (Nepal) sits at the mid tone,
 *  apart from its :30 neighbour. Dark ground wants lighter tones to glow
 *  through; light ground deeper ones. Values chosen so every pair of touching
 *  bands in timezones.geojson is > 40 RGB apart (tzBands.test.ts). */
const TONE: Record<Theme, { s: number; even: number; odd: number; deep: number; pale: number }> = {
  dark: { s: 72, even: 62, odd: 46, deep: 36, pale: 72 },
  light: { s: 68, even: 50, odd: 34, deep: 22, pale: 62 },
};
/** Past UTC+12 a band is already on the next calendar day: +13 and +14 keep the
 *  hue of the -11 and -10 bands across the date line but at this fraction of the
 *  saturation, so the 24-hours-apart pairs (Samoa | American Samoa) differ. */
const NEXT_DAY_SATURATION = 0.4;

function hslHex(h: number, sPct: number, lPct: number): string {
  const s = sPct / 100;
  const l = lPct / 100;
  const a = s * Math.min(l, 1 - l);
  const ch = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${ch(0)}${ch(8)}${ch(4)}`;
}

/** Colour of the band at a standard UTC offset (hours, fractional allowed).
 *  Monochrome mode keeps only the lightness alternation (pure greys). */
export function tzBandColor(offsetHours: number, p: ThemePalette): string {
  const t = TONE[p.theme];
  const hue = (((ZERO_HUE_DEG + offsetHours * HUE_PER_HOUR_DEG) % 360) + 360) % 360;
  const base = Math.floor(offsetHours);
  const even = ((base % 2) + 2) % 2 === 0;
  const f = offsetHours - base;
  const light =
    f === 0 ? (even ? t.even : t.odd) : f === 0.5 ? (even ? t.deep : t.pale) : (t.even + t.odd) / 2;
  const sat = p.color === "monochrome" ? 0 : t.s * (offsetHours > 12 ? NEXT_DAY_SATURATION : 1);
  return hslHex(hue, sat, light);
}

/** maplibre fill-color for the band source: interpolate on the numeric offset in
 *  the feature's "name" ("+1", "-9.5"), with a stop every quarter hour from
 *  UTC-12 to UTC+14 so every real offset (:00, :30, :45) lands exactly on a stop. */
export function tzBandColorExpr(p: ThemePalette): maplibregl.ExpressionSpecification {
  const stops: (number | string)[] = [];
  for (let q = -12 * 4; q <= 14 * 4; q++) stops.push(q / 4, tzBandColor(q / 4, p));
  return [
    "interpolate",
    ["linear"],
    ["to-number", ["get", "name"]],
    ...stops,
  ] as maplibregl.ExpressionSpecification;
}

/** Band fill opacity that holds `opacity` to continent zoom and fades to 0 before
 *  city zoom: a navigate() lands at zoom 8-13, where one band covers the whole
 *  viewport and a fill would only wash the screen (and its street labels) in one
 *  colour with no neighbour to contrast. */
export function tzBandOpacity(opacity: number): maplibregl.ExpressionSpecification {
  return [
    "interpolate", ["linear"], ["zoom"],
    TZ_BAND_FADE_START_ZOOM, opacity,
    TZ_BAND_FADE_END_ZOOM, 0,
  ];
}

/** "UTC+1", "UTC−6" (true minus), "UTC+5:45", "UTC±0" for zero. */
export function tzOffsetLabel(offsetHours: number): string {
  if (offsetHours === 0) return "UTC±0";
  const abs = Math.abs(offsetHours);
  const hours = Math.floor(abs);
  const mins = Math.round((abs - hours) * 60);
  const sign = offsetHours < 0 ? "−" : "+";
  return `UTC${sign}${hours}${mins ? `:${String(mins).padStart(2, "0")}` : ""}`;
}

/** Copy of the band FC with a `label` property per band (the symbol layer's
 *  text-field). A band whose name is not a number is left unlabelled. */
export function withTzLabels(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    ...fc,
    features: fc.features.map((f) => {
      const offset = Number(f.properties?.name);
      if (!Number.isFinite(offset)) return f;
      return { ...f, properties: { ...f.properties, label: tzOffsetLabel(offset) } };
    }),
  };
}

// ── point in polygon ─────────────────────────────────────────────────────────
function inRing(ring: GeoJSON.Position[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(rings: GeoJSON.Position[][], x: number, y: number): boolean {
  return inRing(rings[0], x, y) && !rings.slice(1).some((hole) => inRing(hole, x, y));
}

/**
 * Name of the band whose polygon contains (lng, lat), or null. Longitude is
 * wrapped into [-180, 180) first: the vendored bands are split at the
 * antimeridian, so a wrapped point (e.g. 181.5) lands in the right part.
 */
export function tzBandAt(fc: GeoJSON.FeatureCollection, lng: number, lat: number): string | null {
  const x = ((((lng + 180) % 360) + 360) % 360) - 180;
  for (const f of fc.features) {
    const g = f.geometry;
    const polys =
      g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
    if (polys.some((rings) => inPolygon(rings, x, lat))) return String(f.properties?.name);
  }
  return null;
}

/** Band of the selected record, from its abstract Entity coords (any kind). */
export function selectedBand(
  bands: GeoJSON.FeatureCollection | null,
  selected: SelectedEntity | null,
): string | null {
  if (!bands || !selected) return null;
  const c = selectedToEntity(selected).coords;
  return c ? tzBandAt(bands, c.lng, c.lat) : null;
}

// ── layers ───────────────────────────────────────────────────────────────────
/**
 * Add the band fill + highlight (seated under the night fill, so night darkens
 * them) and the band labels (top of the tz stack). Call after the night,
 * band-line and terminator layers exist and before heat/markers, so every tz
 * layer stays under the data. All start hidden; the highlight matches nothing.
 */
export function addTzBandLayers(map: maplibregl.Map, p: ThemePalette): void {
  const color = tzBandColorExpr(p);
  map.addLayer(
    {
      id: TZ_BAND_FILL_LAYER,
      type: "fill",
      source: TZ_BANDS_SOURCE,
      layout: { visibility: "none" },
      paint: { "fill-color": color, "fill-opacity": tzBandOpacity(TZ_BAND_FILL_OPACITY[p.theme]) },
    },
    "ml-tz-night-layer",
  );
  map.addLayer(
    {
      id: TZ_BAND_HIGHLIGHT_LAYER,
      type: "fill",
      source: TZ_BANDS_SOURCE,
      filter: bandIs(null),
      layout: { visibility: "none" },
      paint: { "fill-color": color, "fill-opacity": tzBandOpacity(TZ_BAND_HIGHLIGHT_OPACITY[p.theme]) },
    },
    "ml-tz-night-layer",
  );
  map.addLayer({
    id: TZ_BAND_LABEL_LAYER,
    type: "symbol",
    source: TZ_BANDS_SOURCE,
    maxzoom: TZ_LABEL_MAXZOOM,
    layout: {
      visibility: "none",
      "symbol-placement": "point",
      "text-field": ["get", "label"],
      "text-font": FONT_REGULAR,
      "text-size": TZ_LABEL_SIZE_PX,
    },
    paint: {
      "text-color": p.neutral.textMuted,
      "text-halo-color": p.neutral.ink900,
      "text-halo-width": TZ_LABEL_HALO_WIDTH_PX,
    },
  });
}

/** Palette-derived paint for the band layers (theme flip, repaint.ts). */
export function repaintTzBands(map: maplibregl.Map, p: ThemePalette): void {
  const color = tzBandColorExpr(p);
  for (const [id, opacity] of [
    [TZ_BAND_FILL_LAYER, TZ_BAND_FILL_OPACITY[p.theme]],
    [TZ_BAND_HIGHLIGHT_LAYER, TZ_BAND_HIGHLIGHT_OPACITY[p.theme]],
  ] as const) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, "fill-color", color);
    map.setPaintProperty(id, "fill-opacity", tzBandOpacity(opacity));
  }
  if (map.getLayer(TZ_BAND_LABEL_LAYER)) {
    map.setPaintProperty(TZ_BAND_LABEL_LAYER, "text-color", p.neutral.textMuted);
    map.setPaintProperty(TZ_BAND_LABEL_LAYER, "text-halo-color", p.neutral.ink900);
  }
}

/** Matches the named band; null matches nothing (no band is named ""). */
function bandIs(band: string | null): maplibregl.ExpressionSpecification {
  return ["==", ["get", "name"], band ?? ""];
}

/**
 * Point the highlight at `band` (null clears it): filter the highlight fill to
 * that band and emphasise its label (one step larger, bold, placed first so
 * collisions never hide it). Called on selection change, band arrival and the
 * post-swap rebuild, never per frame.
 */
export function applyTzHighlight(map: maplibregl.Map, band: string | null): void {
  const is = bandIs(band);
  if (map.getLayer(TZ_BAND_HIGHLIGHT_LAYER)) map.setFilter(TZ_BAND_HIGHLIGHT_LAYER, is);
  if (!map.getLayer(TZ_BAND_LABEL_LAYER)) return;
  map.setLayoutProperty(TZ_BAND_LABEL_LAYER, "text-size", [
    "case", is, TZ_LABEL_SIZE_PX + 1, TZ_LABEL_SIZE_PX,
  ]);
  map.setLayoutProperty(TZ_BAND_LABEL_LAYER, "text-font", [
    "case", is, ["literal", FONT_BOLD], ["literal", FONT_REGULAR],
  ]);
  map.setLayoutProperty(TZ_BAND_LABEL_LAYER, "symbol-sort-key", ["case", is, 0, 1]);
  map.setPaintProperty(TZ_BAND_LABEL_LAYER, "text-opacity", ["case", is, 1, TZ_LABEL_REST_OPACITY]);
}
