/**
 * setupLayers - the globe's `map.on("load")` body, extracted verbatim from
 * GlobeMap.tsx (Task 0, Fraud Manager Console Phase 1). Behaviour-preserving:
 * the sky setup, all GeoJSON sources, all circle
 * layers (in add order, which is draw order), the marker click binds, and the
 * lifted-3D welded arc custom layer move here unchanged.
 *
 * The caller (GlobeMap mount effect) still owns the map-ready signals that
 * gate the reactive effects - `mapLoadedRef.current = true`,
 * `onMapReadyRef.current?.(map)`, and the DEV debug handle - so they fire
 * immediately after this returns. The two React-instance values the body
 * needs (the marker click handlers and the live Paths) arrive via `deps` as
 * refs, so the once-bound listeners + the arc draw closure always read the
 * current value.
 */
import type maplibregl from "maplibre-gl";
import { applyDarkLiberty, applyLightLiberty } from "./darkenLiberty";
import { basemapStyle } from "./basemap";
import type { MapMode } from "../../store/map-mode";
import { attachWorldBase } from "./worldBase";
import { GLOW_RADIUS_PX } from "../marker-cascade";
import { createArcLayer } from "../../components/arc-layer-3d";
import { createTerritoryLayer } from "../../components/territory-layer";
import { cascadeDrawFrac } from "../arc-cascade";
import { usePlayhead } from "../../store/playhead";
import { type Path } from "../../store/paths";
import type { LoginEvent, Place, Transaction } from "../../types";
import type { Entity } from "../entity";
import { useNavigation } from "../../store/navigation";
import {
  ML_AUTH_RING_WIDTH,
  ML_DOT_RADIUS,
  ML_HALO_OPACITY,
  ML_HALO_RADIUS,
  ML_MAGNITUDE_MAX_RADIUS,
  EMPTY_FC,
  TZ_BAND_LINE_WIDTH_PX,
  TZ_BAND_LINE_OPACITY,
  TZ_NIGHT_FILL_OPACITY,
  TZ_TERMINATOR_WIDTH_PX,
  TZ_TERMINATOR_OPACITY,
  TZ_TERMINATOR_DENSIFY,
} from "./constants";
import type { ThemePalette } from "../../theme/tokens";
import { mlColors, mlAuthColorExpr, mlAuthRingColorExpr, tzColors } from "./repaint";
import { computeTerminator } from "../terminator";
import { greatCircleDensify } from "../geo";
import { addTzBandLayers, applyTzHighlight, withTzLabels, TZ_LAYER_IDS } from "./tzBands";

// ── Basemap: OpenFreeMap Liberty, OpenMapTiles schema ──
// The style document, the sprites and the Latin glyph ranges are served by the site
// (lib/globe/basemap.ts); vector tiles and the relief raster come from the tile host.
// Both themes use the same style: dark is Liberty recoloured at run time by
// applyDarkLiberty. styleFor stays a function so GlobeMap's theme-swap effect still
// fires; setStyle({diff:false}) forces the reload with the same style. The style is built
// for the map's shape, which carries the projection.
export function styleFor(_theme: string, shape: MapMode): maplibregl.StyleSpecification {
  return basemapStyle(undefined, shape);
}

/** The `land` pin-drop term of ml-auths-dot, 1 for a feature with no land state. The dot's radius
 *  and its ring's width both read it, so the ring is drawn only where the dot is. */
const authDotLand = (): ["coalesce", ["feature-state", "land"], 1] => ["coalesce", ["feature-state", "land"], 1];

// ── GeoJSON source shaping ──
// Builders that turn entity arrays into the FeatureCollections the marker
// sources consume. Co-located with the source setup (the sources they fill are
// added in setupLayers), and reused by repopulateGlobeSources after a
// destructive basemap swap. `id` is promoted to feature-id (promoteId:"id" on
// the sources) so feature-state (land/sel) keys by entity id.
function pointFeatures<T>(
  items: T[],
  getLngLat: (d: T) => [number, number],
  getProps: (d: T) => Record<string, string | number | boolean>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map((d) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: getLngLat(d) },
      properties: getProps(d),
    })),
  };
}

export const txFC = (t: Transaction[]): GeoJSON.FeatureCollection =>
  pointFeatures(
    t,
    (d) => [d.merchant_lng, d.merchant_lat],
    (d) => ({ id: d.id, is_fraud: d.is_fraud ? 1 : 0 }),
  );
export const loginFC = (l: LoginEvent[]): GeoJSON.FeatureCollection =>
  pointFeatures(l, (d) => [d.ip_lng, d.ip_lat], (d) => ({ id: d.id }));
export const placeFC = (p: Place[]): GeoJSON.FeatureCollection =>
  pointFeatures(p, (d) => [d.lng, d.lat], (d) => ({ id: d.id }));

// ── Timezone offset-band asset (lazy, runtime-fetched) ──
/** Runtime path of the vendored UTC-offset-band FeatureCollection. Served from
 *  public/data - fetched lazily (never statically imported) so the ~1MB asset
 *  stays out of the initial JS bundle. License: public/data/timezones.LICENSE.txt. */
// Relative to the build's base path, so the app also works under a sub-path. Vite
// replaces import.meta.env.BASE_URL at build time ("/" in dev, "./" in a static build).
export const TZ_BANDS_URL = `${import.meta.env.BASE_URL}data/timezones.geojson`;

/**
 * Fetch + parse the UTC-offset-band FeatureCollection. Pure I/O wrapper, kept in
 * this (non-component) module so GlobeMap stays thin. Throws on a non-OK response
 * so the caller can leave the overlay un-hydrated rather than push garbage.
 */
export async function fetchTzBands(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(TZ_BANDS_URL);
  if (!res.ok) throw new Error(`timezones.geojson ${res.status}`);
  return withTzLabels((await res.json()) as GeoJSON.FeatureCollection);
}

// ── Timezone day/night geometry (playhead-derived) ──
/**
 * Build the night-fill + terminator-line FCs for a UTC instant (the playhead
 * epoch-ms - playhead-as-truth, never Date.now()). The pure solar geometry comes
 * from lib/terminator.computeTerminator; here we only wrap it into the two
 * source payloads and densify the terminator polyline into a smooth great-circle
 * wave (the raw line is sampled at 1-deg lng steps; densify slerps the interior
 * so it reads clean at globe scale). Shared by the reactive playhead effect AND
 * the post-swap rebuild so both push identical geometry.
 */
export function terminatorFCs(playheadMs: number): {
  night: GeoJSON.Feature<GeoJSON.Polygon>;
  line: GeoJSON.Feature<GeoJSON.LineString>;
} {
  const { nightPolygon, terminatorLine } = computeTerminator(playheadMs);
  const raw = terminatorLine.geometry.coordinates as [number, number][];
  const smooth: [number, number][] = raw.length === 0 ? [] : [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    // densify returns [a, ...interior, b]; drop the leading `a` (== prior `b`).
    const seg = greatCircleDensify(raw[i - 1], raw[i], TZ_TERMINATOR_DENSIFY);
    for (let j = 1; j < seg.length; j++) smooth.push(seg[j]);
  }
  return {
    night: nightPolygon,
    line: {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: smooth },
    },
  };
}

/** Everything the post-swap re-hydration needs: the current entity data + the
 *  current layer-visibility inputs. setStyle({diff:false}) recreates every
 *  source EMPTY and the reactive data/visibility effects don't re-fire on a
 *  theme flip, so the swap rebuild re-pushes from this snapshot. */
export interface GlobeSourceData {
  transactions: Transaction[];
  logins: LoginEvent[];
  places: Place[];
  fraudTransactions: Transaction[];
  /** The ml-generic FeatureCollection (manifest-declared kinds), already built. */
  genericData?: GeoJSON.FeatureCollection;
  /** Carried in the snapshot but not read: these two switches act on the data, not on layer visibility. */
  showAuths: boolean;
  showLogins: boolean;
  showPlaces: boolean;
  /** Timezone overlay show flag - survives the swap so the rebuild re-applies it. */
  showTimezone: boolean;
  /** The lazy-fetched UTC-offset-band FeatureCollection, or null until fetched.
   *  Stored here (not refetched) so the post-swap rebuild re-pushes the bands
   *  without a second network round-trip. */
  tzBands: GeoJSON.FeatureCollection | null;
  /** Current playhead epoch-ms - the rebuild recomputes the night/terminator
   *  geometry from this (it is playhead-derived, not a static snapshot). */
  playhead: number;
  /** Name of the band holding the selected record (null = no highlight). Read
   *  live from useTimezoneOverlay's ref by runSetup just before the rebuild. */
  tzHighlight?: string | null;
}

/**
 * Re-push current data into the freshly-recreated globe sources and re-apply
 * layer visibility - the post-destructive-swap re-hydration. Uses the SAME FC
 * builders + the SAME visibility logic as GlobeMap's reactive effects, so the
 * swapped basemap lands in exactly the pre-swap data + visibility state.
 */
export function repopulateGlobeSources(map: maplibregl.Map, d: GlobeSourceData): void {
  (map.getSource("ml-auths") as maplibregl.GeoJSONSource | undefined)?.setData(txFC(d.transactions));
  (map.getSource("ml-logins") as maplibregl.GeoJSONSource | undefined)?.setData(loginFC(d.logins));
  (map.getSource("ml-places") as maplibregl.GeoJSONSource | undefined)?.setData(placeFC(d.places));
  (map.getSource("ml-fraud") as maplibregl.GeoJSONSource | undefined)?.setData(txFC(d.fraudTransactions));
  if (d.genericData) {
    (map.getSource("ml-generic") as maplibregl.GeoJSONSource | undefined)?.setData(d.genericData);
  }
  // Timezone overlay re-hydration: the offset bands (from the cached fetch), and
  // the night/terminator geometry recomputed from the live playhead - the swap
  // wiped all three sources and the reactive effects won't re-fire on a theme
  // flip, so this re-pushes both data + visibility (mirrors the marker path).
  if (d.tzBands) {
    (map.getSource("ml-tz-bands") as maplibregl.GeoJSONSource | undefined)?.setData(d.tzBands);
  }
  const { night, line } = terminatorFCs(d.playhead);
  (map.getSource("ml-tz-night") as maplibregl.GeoJSONSource | undefined)?.setData(night);
  (map.getSource("ml-tz-terminator") as maplibregl.GeoJSONSource | undefined)?.setData(line);
  const set = (ids: string[], show: boolean) => {
    for (const id of ids) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
    }
  };
  set(["ml-places-halo", "ml-places-dot"], d.showPlaces);
  // Timezone overlays gate on showTimezone (same gate as the overlay hook).
  set([...TZ_LAYER_IDS], d.showTimezone);
  applyTzHighlight(map, d.tzHighlight ?? null);
}

interface SetupLayersDeps {
  markerHandlersRef: React.MutableRefObject<{
    transactions: Transaction[];
    logins: LoginEvent[];
    places: Place[];
    onTransactionClick?: (t: Transaction) => void;
    onLoginClick?: (l: LoginEvent) => void;
    onPlaceClick?: (p: Place) => void;
    genericEntities?: Entity[];
    navigate: ReturnType<typeof useNavigation.getState>["navigate"];
  } | null>;
  pathsRef: React.MutableRefObject<Path[]>;
}

/**
 * Run the globe's `map.on("load")` body: sky, sources, layers,
 * custom layers, and the marker click + cursor binds. The style carries the projection.
 *
 * RETURNS a teardown fn that removes every map-level listener this call
 * registered. It MUST be invoked before re-running setupLayers on a destructive
 * theme swap. Why: the marker binds use
 * `map.on(type, layerId, fn)`, which - verified against the installed
 * maplibre-gl@5.24 source - registers a DELEGATED
 * listener as a MAP-LEVEL (Evented base) handler stored in
 * `map._delegatedListeners` on the Map object, NOT on the style.
 * `setStyle({diff:false})` -> `_updateStyle` rebuilds only `map.style`; it never
 * clears `_delegatedListeners`, so both the layer-scoped click binds AND the
 * mouseenter/mouseleave cursor binds SURVIVE the swap and stack a duplicate set
 * on every flip (after N flips a marker click fires N+1 times). The
 * sources/layers/custom-layers are correctly wiped by setStyle, so teardown
 * removes ONLY the leaking listeners. `map.on(...)` returns a `{ unsubscribe }`
 * subscription in maplibre 5; we collect them and unsubscribe on teardown.
 */
/** Owner rule: every business on screen is fictional. Liberty's POI layers (icons + names from z15)
 *  label real banks and restaurants, so they are hidden on every style load; transit stops stay. */
export function hideBusinessPois(map: Pick<maplibregl.Map, "getStyle" | "setLayoutProperty">): void {
  for (const l of map.getStyle().layers ?? []) {
    const sourceLayer = (l as { "source-layer"?: string })["source-layer"];
    if (sourceLayer === "poi" && l.id !== "poi_transit") map.setLayoutProperty(l.id, "visibility", "none");
  }
}

export function setupLayers(
  map: maplibregl.Map,
  { markerHandlersRef, pathsRef }: SetupLayersDeps,
  /** Initial resolved palette - drives first-paint colors so there is no
   *  flash-to-hardcoded-color before the theme effect fires. */
  initialPalette: ThemePalette,
): () => void {
  // Subscriptions from every map.on(...) bind below - the teardown contract for
  // the destructive theme swap (see the JSDoc above). map.on returns a
  // { unsubscribe } in maplibre 5; collecting them keeps teardown exhaustive
  // even as binds are added.
  const subscriptions: { unsubscribe: () => void }[] = [];
  hideBusinessPois(map);

  // M2 re-base (2026-06-20): dark loads liberty too, recolored dark at runtime. Run BEFORE the void
  // fix below so the ocean-base captures the now-dark background. Light is liberty as shipped,
  // less the green outline on its area fills.
  if (document.documentElement.getAttribute("data-theme") === "dark") {
    applyDarkLiberty(map);
  } else {
    applyLightLiberty(map);
  }

  try {
    map.setSky({
      "sky-color": initialPalette.globe.sky,
      "horizon-color": initialPalette.globe.horizon,
      "fog-color": initialPalette.globe.fog,
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

  // ── Light-void fix (decoupled, 2026-06-19) ──
  // The basemap `background` layer paints BOTH the off-globe void AND the sphere's ocean base
  // (the vector `water` layer is sparse at globe-overview zoom; the natural_earth raster is
  // land-only). So zeroing `background` ALONE transparent-ifies the oceans -> an inverted globe
  // (starfield bleeds through the water). Decouple: lay a WORLD-covering ocean-base fill in the
  // style's OWN background color (so the oceans look unchanged) just above the background, THEN
  // zero the background. The world polygon covers the SPHERE but not the off-globe void, so the
  // void goes transparent and the .globe-space starfield shows through (canvas is alpha:true,
  // GlobeMap.tsx). setSky is inert under globe (#5230). Re-runs on every destructive setStyle
  // swap (this fn IS the swap rebuild), so it survives the dark<->light flip.
  if (map.getLayer("background")) {
    const oceanColor = (map.getPaintProperty("background", "background-color") as string) || "#0a0f1a";
    const firstContentId = (map.getStyle().layers ?? []).find((l) => l.id !== "background")?.id;
    if (!map.getSource("ml-ocean-base")) {
      map.addSource("ml-ocean-base", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]],
          },
        },
      });
    }
    if (!map.getLayer("ml-ocean-base")) {
      map.addLayer(
        { id: "ml-ocean-base", type: "fill", source: "ml-ocean-base", paint: { "fill-color": oceanColor } },
        firstContentId,
      );
    }
    map.setPaintProperty("background", "background-color", "rgba(0,0,0,0)");
  }

  // World layer (oceans, borders, country names): drawn while tiles load, hidden once a tile arrives.
  const detachWorldBase = attachWorldBase(map);

  // (Dark-style tuning now lives in applyDarkLiberty(), called near the top of this function so
  //  the void fix captures the dark background. The old OpenFreeMap-`dark` building/road/legibility
  //  block was removed with the M2 re-base onto darkened liberty - 2026-06-20.)

  // ── Phase 2a (2026-05-30): maplibre-native marker layers ──
  // Three GeoJSON sources (start empty; refreshed reactively below), each
  // feeding an N10 halo+dot circle-layer pair. Added AFTER addControl so
  // they sit above the deck-interleaved pass. Draw order: places (context,
  // bottom) → auths → logins (top), mirroring the prior deck stack so
  // entity markers read over context. Markers ride maplibre's own globe
  // camera → welded under full rotation/pitch (the whole point).
  // promoteId:"id" keys feature-state by entity id (used by the pin-drop
  // `land` state and the click-ack `sel` state, Phase 2b.3 / 2b.5).
  // ── Timezone overlay (opt-in day/night + UTC-offset bands) ──
  // Added FIRST so they seat at the BOTTOM of the overlay stack
  // - context that markers and the arc must read THROUGH. All three start EMPTY and
  // hidden (visibility:"none"); GlobeMap lazy-fetches the bands + recomputes the
  // playhead-derived night/terminator and toggles visibility. Z-order within tz:
  // night fill (bottom) -> band line -> terminator line (sharpest, on top of its
  // own fill). Colours derive from the palette (tzColors) so they recolour on a
  // within-theme colour flip (repaint.ts) and survive a dark<->light swap.
  const tz = tzColors(initialPalette);
  map.addSource("ml-tz-night", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "ml-tz-night-layer",
    type: "fill",
    source: "ml-tz-night",
    layout: { visibility: "none" },
    paint: {
      "fill-color": tz.night,
      "fill-opacity": TZ_NIGHT_FILL_OPACITY,
      "fill-antialias": true,
    },
  });
  map.addSource("ml-tz-bands", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "ml-tz-band-layer",
    type: "line",
    source: "ml-tz-bands",
    layout: { visibility: "none", "line-join": "round" },
    paint: {
      "line-color": tz.band,
      "line-width": TZ_BAND_LINE_WIDTH_PX,
      "line-opacity": TZ_BAND_LINE_OPACITY,
    },
  });
  map.addSource("ml-tz-terminator", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "ml-tz-terminator-layer",
    type: "line",
    source: "ml-tz-terminator",
    layout: { visibility: "none", "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": tz.terminator,
      "line-width": TZ_TERMINATOR_WIDTH_PX,
      "line-opacity": TZ_TERMINATOR_OPACITY,
    },
  });
  // Multicolour band fill + selected-band highlight (seated under the night fill
  // via beforeId) and the "UTC+1" labels (top of the tz stack).
  addTzBandLayers(map, initialPalette);

  // Walking-territory fill: a maplibre custom layer that
  // welds the convex hull of each Path's walked nodes (ts <= playhead) flat onto
  // the sphere via projectTileWithElevation(merc, 0) - the SAME proven weld +
  // limb-clip path the arc uses, so it stays glued under full rotate/tilt and
  // clips at the limb. Playhead-true: the hull is a pure function of the walked
  // nodes, so it grows as the playhead crosses each fraud charge and retracts on
  // rewind with no animation state. Drape-flat (elevation 0) keeps it honest -
  // it asserts only the region the path has claimed, no invented altitude (the
  // ratified drape-over-loft encoding, INSIGHT-2026-06-03). Added BEFORE the
  // markers so the faint territory tint reads as ground context UNDER the entity
  // dots and the arc (maplibre draw order = add order). Reads pathsRef each frame
  // (only enabled-kind Paths - fraud by default) + the live playhead.
  map.addLayer(
    createTerritoryLayer(
      () => pathsRef.current,
      () => usePlayhead.getState().playhead,
      () => usePlayhead.getState(),
    ),
  );

  map.addSource("ml-places", { type: "geojson", data: EMPTY_FC, promoteId: "id" });
  map.addSource("ml-auths", { type: "geojson", data: EMPTY_FC, promoteId: "id" });
  map.addSource("ml-logins", { type: "geojson", data: EMPTY_FC, promoteId: "id" });
  // Manifest-declared kinds (sign-ins / key events / usage ...): one source, colour per
  // feature from the node palette, so a new kind needs no new layer.
  map.addSource("ml-generic", { type: "geojson", data: EMPTY_FC, promoteId: "id" });

  map.addLayer({
    id: "ml-places-halo",
    type: "circle",
    source: "ml-places",
    paint: {
      "circle-radius": ML_HALO_RADIUS,
      "circle-color": mlColors(initialPalette).place,
      "circle-opacity": ML_HALO_OPACITY,
    },
  });
  map.addLayer({
    id: "ml-places-dot",
    type: "circle",
    source: "ml-places",
    paint: {
      "circle-radius": [
        "*",
        ML_DOT_RADIUS,
        ["coalesce", ["feature-state", "sel"], 1],
      ],
      "circle-color": mlColors(initialPalette).place,
      "circle-opacity": 1,
    },
  });
  map.addLayer({
    id: "ml-auths-halo",
    type: "circle",
    source: "ml-auths",
    paint: {
      "circle-radius": ML_HALO_RADIUS,
      "circle-color": mlAuthColorExpr(initialPalette),
      "circle-opacity": ML_HALO_OPACITY,
    },
  });
  map.addLayer({
    id: "ml-auths-dot",
    type: "circle",
    source: "ml-auths",
    paint: {
      // Radius scales by the `land` pin-drop state (2b.3) AND the `sel`
      // click-ack state (2b.5); both coalesce to 1 when unset.
      "circle-radius": [
        "*",
        ML_DOT_RADIUS,
        authDotLand(),
        ["coalesce", ["feature-state", "sel"], 1],
      ],
      "circle-color": mlAuthColorExpr(initialPalette),
      "circle-opacity": 1,
      // The ring on every dot (C2 third part): neutral text, alarm for fraud; repaint.ts keeps its
      // colour on a theme or colour mode switch. The ring comes with the dot: the radius's own land
      // term (same default) gates it, so at land 0 (a fraud dot at or before its event time) there is
      // no ring, and otherwise it is ML_AUTH_RING_WIDTH, not scaled by land or sel.
      "circle-stroke-width": ["case", [">", authDotLand(), 0], ML_AUTH_RING_WIDTH, 0],
      "circle-stroke-color": mlAuthRingColorExpr(initialPalette),
      "circle-stroke-opacity": 1,
    },
  });
  map.addLayer({
    id: "ml-logins-halo",
    type: "circle",
    source: "ml-logins",
    paint: {
      "circle-radius": ML_HALO_RADIUS,
      "circle-color": mlColors(initialPalette).login,
      "circle-opacity": ML_HALO_OPACITY,
    },
  });
  map.addLayer({
    id: "ml-logins-dot",
    type: "circle",
    source: "ml-logins",
    paint: {
      "circle-radius": [
        "*",
        ML_DOT_RADIUS,
        ["coalesce", ["feature-state", "sel"], 1],
      ],
      "circle-color": mlColors(initialPalette).login,
      "circle-opacity": 1,
    },
  });

  // A magnitude kind's features carry `scale` (0..1, the square root of value over the
  // pack's largest), so area follows value. A feature with no scale, or a small one, draws
  // at the plain dot radius; the halo keeps its margin around the dot (it is the click target).
  const genericDotRadius: maplibregl.ExpressionSpecification = [
    "max",
    ML_DOT_RADIUS,
    ["*", ML_MAGNITUDE_MAX_RADIUS, ["coalesce", ["get", "scale"], 0]],
  ];
  map.addLayer({
    id: "ml-generic-halo",
    type: "circle",
    source: "ml-generic",
    paint: {
      "circle-radius": ["+", ML_HALO_RADIUS - ML_DOT_RADIUS, genericDotRadius],
      "circle-color": ["get", "color"],
      "circle-opacity": ML_HALO_OPACITY,
    },
  });
  map.addLayer({
    id: "ml-generic-dot",
    type: "circle",
    source: "ml-generic",
    paint: {
      "circle-radius": ["*", genericDotRadius, ["coalesce", ["feature-state", "sel"], 1]],
      "circle-color": ["get", "color"],
      "circle-opacity": 1,
    },
  });

  // Fraud radar-ping (Phase 2b): 3 stroked circle layers on the fraud
  // subset, radii/opacity driven by the radar tween in GlobeMap. Centers
  // welded to the globe; rings sweep outward in screen space. Replaces the
  // old overlay radar-ping that counter-rotated under right-drag.
  map.addSource("ml-fraud", { type: "geojson", data: EMPTY_FC });
  for (let i = 0; i < 3; i++) {
    map.addLayer({
      id: `ml-fraud-ping-${i}`,
      type: "circle",
      source: "ml-fraud",
      paint: {
        "circle-radius": 4,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": initialPalette.alarm,
        "circle-stroke-width": 1.6,
        "circle-stroke-opacity": 0,
      },
    });
  }

  // Click BLOOM cascade (Phase 2b.4): glow + inner + outer rings on the
  // clicked point, welded to the globe. cascadeFrame() (lib/marker-cascade)
  // supplies radius/alpha each frame; colour is set per click to the entity
  // kind. Single-point ml-bloom source positioned at click time.
  map.addSource("ml-bloom", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "ml-bloom-glow",
    type: "circle",
    source: "ml-bloom",
    paint: {
      "circle-radius": GLOW_RADIUS_PX,
      "circle-color": mlColors(initialPalette).auth,
      "circle-opacity": 0,
      "circle-blur": 1,
    },
  });
  map.addLayer({
    id: "ml-bloom-inner",
    type: "circle",
    source: "ml-bloom",
    paint: {
      "circle-radius": 10,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": mlColors(initialPalette).auth,
      "circle-stroke-width": 1.5,
      "circle-stroke-opacity": 0,
    },
  });
  map.addLayer({
    id: "ml-bloom-outer",
    type: "circle",
    source: "ml-bloom",
    paint: {
      "circle-radius": 20,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": mlColors(initialPalette).auth,
      "circle-stroke-width": 1,
      "circle-stroke-opacity": 0,
    },
  });

  // Click → navigate, bound to the halo (larger hit target, mirrors the
  // prior deck pickable halo). Handlers read markerHandlersRef so a
  // once-bound listener always resolves against current props/callbacks.
  const bindMarker = (
    layerId: string,
    onPick: (id: string) => void,
  ): void => {
    subscriptions.push(
      map.on("click", layerId, (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) onPick(id);
      }),
      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
      }),
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      }),
    );
  };
  bindMarker("ml-auths-halo", (id) => {
    const h = markerHandlersRef.current;
    if (!h) return;
    const t = h.transactions.find((x) => x.id === id);
    if (!t) return;
    if (h.onTransactionClick) h.onTransactionClick(t);
    else h.navigate({ kind: t.is_fraud ? "fraud" : "auth", tx: t });
  });
  bindMarker("ml-logins-halo", (id) => {
    const h = markerHandlersRef.current;
    if (!h) return;
    const l = h.logins.find((x) => x.id === id);
    if (!l) return;
    if (h.onLoginClick) h.onLoginClick(l);
    else h.navigate({ kind: "login", login: l });
  });
  bindMarker("ml-places-halo", (id) => {
    const h = markerHandlersRef.current;
    if (!h) return;
    const p = h.places.find((x) => x.id === id);
    if (!p) return;
    if (h.onPlaceClick) h.onPlaceClick(p);
    else h.navigate({ kind: "place", place: p });
  });

  // Lifted-3D welded arc (Phase 2c): a maplibre custom layer that shares the
  // globe camera, fed Paths from pathsRef. Draw fraction is computed per-Path
  // each frame via cascadeDrawFrac against the current playhead. Added last so it
  // composites over the markers. This is the LAST renderer on the globe -
  // deck.gl is fully gone.
  map.addLayer(
    createArcLayer(
      () => pathsRef.current,
      (path) => cascadeDrawFrac(usePlayhead.getState().playhead, path.nodes),
    ),
  );

  // Teardown contract: unsubscribe every delegated map-level
  // listener registered above. setStyle({diff:false}) wipes sources/layers/
  // custom-layers but NOT map._delegatedListeners, so the caller MUST call this
  // before re-running setupLayers on a theme swap or the binds stack (duplicate
  // navigate/select on every click after N flips). Idempotent: unsubscribe is
  // safe to call once per subscription; a re-run gets a fresh subscriptions[].
  return () => {
    detachWorldBase();
    for (const sub of subscriptions) sub.unsubscribe();
    subscriptions.length = 0;
  };
}
