/**
 * Globe marker paint constants - extracted verbatim from GlobeMap.tsx
 * (Task 0, Fraud Manager Console Phase 1). These are the N10 marker
 * geometry + palette that drive the maplibre-native circle layers
 * (Phase 2a, 2026-05-30). Behaviour-preserving move; values unchanged.
 *
 * Marker palette / glyph (ratified N10, 2026-05-28): auth cyan, fraud red,
 * login magenta, place grey; each a small full-alpha dot inside a large
 * low-alpha halo. Auth + fraud share one source; colour is data-driven on
 * is_fraud (ML_AUTH_COLOR).
 */
import type maplibregl from "maplibre-gl";
import type { Theme } from "../../theme/axes";

export const ML_AUTH = "#00e5ff";
export const ML_FRAUD = "#ff3d2e";
export const ML_LOGIN = "#ff5ce8";
export const ML_PLACE = "#7a7a7a";

export const ML_HALO_RADIUS = 9;
export const ML_DOT_RADIUS = 3;
/** Width of the ring on every ml-auths-dot dot (px). MapLibre draws a circle's stroke outside its
 *  radius, so a 6 px dot reads as a 12 px mark. */
export const ML_AUTH_RING_WIDTH = 3;
/** Dot radius of a magnitude kind's largest value (px). Smaller values scale by square root, so
 *  a marker's area follows its value; none draws smaller than ML_DOT_RADIUS. */
export const ML_MAGNITUDE_MAX_RADIUS = 22;
export const ML_HALO_OPACITY = 0.22; // matches N10 HALO_ALPHA (56/255 ≈ 0.2196)

export const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

// Data-driven auth/fraud colour for the shared transaction source.
export const ML_AUTH_COLOR = [
  "case",
  ["==", ["get", "is_fraud"], 1],
  ML_FRAUD,
  ML_AUTH,
] as maplibregl.ExpressionSpecification;

// ── Timezone overlay geometry/opacity (opt-in day/night + UTC bands) ──
// Subtle by design: markers + arcs must read THROUGH the overlay (HARD RULE).
// Colours are NOT hardcoded here - they derive from the ThemePalette in
// setupLayers/repaint so the overlay recolours on a within-theme colour flip.
export const TZ_BAND_LINE_WIDTH_PX = 0.6; // hairline UTC-offset boundaries
export const TZ_BAND_LINE_OPACITY = 0.18; // faint - context, never foreground
export const TZ_NIGHT_FILL_OPACITY = 0.26; // dark wash over the night hemisphere
export const TZ_TERMINATOR_WIDTH_PX = 1.1; // soft, the sharpest of the three
export const TZ_TERMINATOR_OPACITY = 0.5;
// Multicolour offset-band fill (lib/globe/tzBands): translucent so the basemap
// and markers read through it; the night fill sits ABOVE it and dims the night
// side. The light ground shows a tint more strongly, so light runs a touch lower.
export const TZ_BAND_FILL_OPACITY: Record<Theme, number> = { dark: 0.26, light: 0.18 };
/** The selected record's band: clearly lifted over its neighbours, still translucent. */
export const TZ_BAND_HIGHLIGHT_OPACITY: Record<Theme, number> = { dark: 0.42, light: 0.34 };
/** Both band fills hold their opacity to continent zoom and fade to 0 by city
 *  zoom (tzBands.tzBandOpacity): navigate() lands at zoom 8-13, inside one band. */
export const TZ_BAND_FADE_START_ZOOM = 5;
export const TZ_BAND_FADE_END_ZOOM = 7;
/** Band labels are MAP labels (11px, like the basemap's own), not UI chrome. */
export const TZ_LABEL_SIZE_PX = 11;
export const TZ_LABEL_HALO_WIDTH_PX = 1.2;
/** Unselected labels recede a step so the selected band's label leads. */
export const TZ_LABEL_REST_OPACITY = 0.8;
/** Labels show at globe/continent zoom only (hidden at zoom >= this). The tiled
 *  band source places one label per tile-clipped part, so at city zoom every tile
 *  would repeat "UTC−6" over the basemap's street and place names. */
export const TZ_LABEL_MAXZOOM = 5;
/** Interior densification per terminator segment - smooths the 1-deg polyline
 *  into a clean great-circle wave at globe scale (lib/geo.greatCircleDensify). */
export const TZ_TERMINATOR_DENSIFY = 2;
