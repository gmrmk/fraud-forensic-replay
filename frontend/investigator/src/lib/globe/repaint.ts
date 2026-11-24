/**
 * Globe repaint helpers - pure functions that derive maplibre paint values
 * from a ThemePalette and apply them to a live map instance.
 *
 * Exported individually so:
 *   - setupLayers.ts can use them for the initial paint (no flash-to-old-color)
 *   - GlobeMap.tsx's theme-change effect can call repaintGlobeColors on subscribe
 *   - tests can verify derived expressions without a real map
 */
import type maplibregl from "maplibre-gl";
import type { ThemePalette } from "../../theme/tokens";
import { resolveEntityColorHex } from "../../theme/resolve";
import { repaintTzBands } from "./tzBands";

/** Hex colors per globe entity role, derived from the active palette. */
export function mlColors(p: ThemePalette): {
  auth: string;
  fraud: string;
  login: string;
  place: string;
} {
  return {
    auth: resolveEntityColorHex("auth", p.theme, p.color),
    fraud: p.alarm,
    login: resolveEntityColorHex("login", p.theme, p.color),
    place: p.neutral.textFaint,
  };
}

/**
 * Data-driven maplibre expression that colours auth/fraud markers on is_fraud.
 * Replaces the hardcoded ML_AUTH_COLOR constant.
 */
export function mlAuthColorExpr(
  p: ThemePalette,
): maplibregl.ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "is_fraud"], 1],
    p.alarm,
    resolveEntityColorHex("auth", p.theme, p.color),
  ] as maplibregl.ExpressionSpecification;
}

/**
 * Colour of the ring on every ml-auths-dot dot: the palette's neutral text colour, and the alarm
 * colour for a fraud dot (the same is_fraud test as the fill). MapLibre paint cannot read a CSS
 * variable, so the text colour is resolved here from the palette, as `alarm` is for the rings.
 */
export function mlAuthRingColorExpr(
  p: ThemePalette,
): maplibregl.ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "is_fraud"], 1],
    p.alarm,
    p.neutral.text,
  ] as maplibregl.ExpressionSpecification;
}

/**
 * Timezone-overlay colours per role, derived from neutral palette tokens so the
 * day/night + UTC-band overlay recolours on a within-theme colour flip and lands
 * correctly after a dark<->light swap (no hardcoded constants). The night fill is
 * the darkest ink so it reads as a dim wash on both themes; the band line is the
 * faintest text so the offset boundaries stay context (markers read through); the
 * terminator is muted text so it is the sharpest of the three without shouting.
 */
export function tzColors(p: ThemePalette): {
  night: string;
  band: string;
  terminator: string;
} {
  return {
    night: p.neutral.ink900,
    band: p.neutral.textFaint,
    terminator: p.neutral.textMuted,
  };
}

/**
 * Push all theme-derived colors onto a live maplibre map.
 * Pure side-effect on `map`; reads nothing from stores.
 * Each setPaintProperty call is guarded by getLayer() so partial-load states
 * don't throw.
 */
export function repaintGlobeColors(
  map: maplibregl.Map,
  p: ThemePalette,
): void {
  const c = mlColors(p);
  const authExpr = mlAuthColorExpr(p);

  // Places halo + dot
  if (map.getLayer("ml-places-halo")) {
    map.setPaintProperty("ml-places-halo", "circle-color", c.place);
  }
  if (map.getLayer("ml-places-dot")) {
    map.setPaintProperty("ml-places-dot", "circle-color", c.place);
  }

  // Logins halo + dot
  if (map.getLayer("ml-logins-halo")) {
    map.setPaintProperty("ml-logins-halo", "circle-color", c.login);
  }
  if (map.getLayer("ml-logins-dot")) {
    map.setPaintProperty("ml-logins-dot", "circle-color", c.login);
  }

  // Auth/fraud halo + dot (data-driven expression keyed on is_fraud)
  if (map.getLayer("ml-auths-halo")) {
    map.setPaintProperty("ml-auths-halo", "circle-color", authExpr);
  }
  if (map.getLayer("ml-auths-dot")) {
    map.setPaintProperty("ml-auths-dot", "circle-color", authExpr);
    // The ring follows the palette too (a theme or colour mode switch); its width never changes.
    map.setPaintProperty("ml-auths-dot", "circle-stroke-color", mlAuthRingColorExpr(p));
  }

  // Fraud radar-ping rings (circle-stroke-color)
  for (let i = 0; i < 3; i++) {
    const id = `ml-fraud-ping-${i}`;
    if (map.getLayer(id)) {
      map.setPaintProperty(id, "circle-stroke-color", p.alarm);
    }
  }

  // Timezone overlay (night fill + UTC-band line + terminator line, then the
  // band fill/highlight/labels) - recolour on a palette change so the overlay
  // tracks the palette like markers.
  const tz = tzColors(p);
  if (map.getLayer("ml-tz-night-layer")) {
    map.setPaintProperty("ml-tz-night-layer", "fill-color", tz.night);
  }
  if (map.getLayer("ml-tz-band-layer")) {
    map.setPaintProperty("ml-tz-band-layer", "line-color", tz.band);
  }
  if (map.getLayer("ml-tz-terminator-layer")) {
    map.setPaintProperty("ml-tz-terminator-layer", "line-color", tz.terminator);
  }
  repaintTzBands(map, p);

  // Sky / atmosphere
  try {
    map.setSky({
      "sky-color": p.globe.sky,
      "horizon-color": p.globe.horizon,
      "fog-color": p.globe.fog,
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.7,
      "fog-ground-blend": 0.9,
      "atmosphere-blend": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0, 1,
        5, 0.55,
        12, 0,
      ],
    });
  } catch {
    // Older MapLibre minor may not support setSky - gracefully degrade.
  }
}
