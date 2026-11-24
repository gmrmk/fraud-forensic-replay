/**
 * GlobeMap - MapLibre globe basemap with maplibre-native markers, radar rings
 * and arc layers.
 *
 * Architecture (Phase 2a, 2026-05-30 - globe-weld fix):
 *  - MapLibre GL renders the cartographic basemap (CartoDB Dark Matter) AND the
 *    entity markers, as native circle layers (the N10 halo+dot, two circle
 *    layers per kind: auth/fraud/login/place). Markers therefore ride
 *    MapLibre's OWN globe camera and stay welded to the sphere under full
 *    rotation/pitch - one renderer, one camera, impossible to desync.
 *  - WHY NOT a separate overlay renderer for markers: its globe view has no
 *    bearing/pitch term in its view matrix, so its markers counter-rotate under
 *    right-drag ("contra-rotating spheres"). No flag fixes a missing matrix
 *    term.
 *  - The bundled style names the globe projection; setupLayers sets it again on every
 *    style load, so a theme swap keeps it.
 *
 * Marker palette / glyph (ratified N10, 2026-05-28): auth cyan, fraud red,
 * login magenta, place grey; each a small full-alpha dot inside a large
 * low-alpha halo. Click → useNavigation.navigate (pan + selection + cascade).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { diskAcross, HOME_MOVE, useBarPadding } from "../hooks/useBarPadding";
import { useGlobeTips } from "../hooks/useGlobeTips";
import { buildGlobeTipIndex } from "../lib/globe-tip";
import { loginToEntity, transactionToEntity } from "../lib/adapters/ffr-seed";
import { kindOnPanelVar } from "../lib/entity-palette";
import { entityLngLat } from "../lib/node-anchor";
import { ringFacts } from "../lib/time-words";
import { KIND_SLOT } from "../theme/entity-mapping";
import { useOnMenu } from "./LayerRow";
import { routeBasemapRequest } from "../lib/globe/basemap";
import { cameraKnown, openingCamera } from "../lib/globe/openingCamera";
import { openingLink } from "../hooks/useShareLink";
import type { ScenarioHome } from "../lib/scenarios";
import { type Path } from "../store/paths";
import { useLayers } from "../store/layers";
import { useNavigation } from "../store/navigation";
import { usePlayhead } from "../store/playhead";
import { useSelection } from "../store/selection";
import { useSchema } from "../store/schema";
import {
  setupLayers,
  repopulateGlobeSources,
  styleFor,
  txFC,
  loginFC,
  placeFC,
  type GlobeSourceData,
} from "../lib/globe/setupLayers";
import { useTimezoneOverlay } from "./useTimezoneOverlay";
import { useGlobeSourceSnapshot } from "./useGlobeSourceSnapshot";
import { useBloomPulse, type MarkerHandlers } from "./useBloomPulse";
import { useRadarPulse } from "./useRadarPulse";
import { useStableList } from "../hooks/useStableList";
import { useCameraMoves } from "./useCameraMoves";
import { bindGenericMarkers, genericFC, recolourGenericFC } from "../lib/globe/generic-markers";
import { storyInkNow, useStoryInk } from "../store/kind-ink";
import { magnitudeMaxima } from "../lib/magnitude";
import { usePivotData } from "../store/pivot-data";
import type { Entity } from "../lib/entity";
import { repaintGlobeColors } from "../lib/globe/repaint";
import { wireAutoPitch } from "../lib/globe/autoPitch";
import { wireEyesHarness } from "../lib/globe/eyesHarness";
import { resolvePalette } from "../theme/resolve";
import { useTheme } from "../store/theme";
import { useLabelCap } from "../hooks/useLabelCap";
import type { LoginEvent, Place, Transaction } from "../types";
import { GlobeBadgeLayer } from "./verdict/GlobeBadgeLayer";
import { CustomPathGlobeLayer } from "./paths/CustomPathGlobeLayer";

// Houston anchor (Memorial / Energy Corridor) - Customer A.
const INITIAL_VIEW = {
  center: [-95.3698, 29.7604] as [number, number],
  zoom: 4.2,
  pitch: 0,
  bearing: 0,
};

// N10 marker geometry + palette now live as maplibre paint constants
// (ML_HALO_RADIUS / ML_DOT_RADIUS / ML_*_COLOR, below the helpers) since the
// halo+dot markers moved to maplibre-native circle layers (Phase 2a,
// 2026-05-30). The radar ping, the bloom and the arcs are maplibre layers too,
// painted by useRadarPulse, useBloomPulse and setupLayers.

// styleFor (the per-theme basemap resolver behind the destructive dark<->light
// swap) lives in lib/globe/setupLayers - co-located with the source/layer setup
// it feeds, and exported from a non-component module so it stays unit-testable
// without tripping react-refresh. Imported above.

interface Props {
  transactions: Transaction[];
  logins: LoginEvent[];
  places: Place[];
  /** Playhead-visible manifest-declared entities (a non-bank pack's sign-ins, usage ...). */
  genericEntities?: Entity[];
  paths: Path[];
  onTransactionClick?: (t: Transaction) => void;
  onLoginClick?: (l: LoginEvent) => void;
  onPlaceClick?: (p: Place) => void;
  onMapReady?: (map: maplibregl.Map) => void;
  /** The active scenario's home camera: `null` none, `undefined` not known yet (the map waits). */
  scenarioHome: ScenarioHome | null | undefined;
}

// ── Phase 2a (2026-05-30): maplibre-native marker rendering ──
// Markers render as maplibre circle layers so they ride maplibre's OWN globe
// camera and weld to the sphere under full rotation/pitch; a marker layer with
// its own separate camera counter-rotated under right-drag. Glyph = the
// ratified N10 halo+dot (2026-05-28): a large low-alpha
// filled disc under a small full-alpha center dot - two circle layers per kind.
// Auth + fraud share one source; colour is data-driven on is_fraud.
// The marker geometry/palette constants + the load-time source/layer setup now
// live in lib/globe/ (constants.ts + setupLayers.ts) - extracted to keep this
// file under the 800-line cap (Task 0, Fraud Manager Console Phase 1).

/** Resolve the selected entity (useSelection) to the marker source + id whose
 *  `sel` feature-state must be restored after a destructive swap. null for kinds
 *  with no globe marker (account_event / transfer) or when nothing is selected. */
function selectedSelTarget(): { source: "ml-auths" | "ml-logins" | "ml-places" | "ml-generic"; id: string } | null {
  const sel = useSelection.getState().selected;
  if (!sel) return null;
  switch (sel.kind) {
    case "auth":
    case "fraud":
      return { source: "ml-auths", id: sel.tx.id };
    case "login":
      return { source: "ml-logins", id: sel.login.id };
    case "place":
      return { source: "ml-places", id: sel.place.id };
    case "entity":
      return sel.entity.coords ? { source: "ml-generic", id: sel.entity.id } : null;
    case "account_event":
    case "transfer":
      return null;
    default: {
      const _exhaustive: never = sel;
      return _exhaustive;
    }
  }
}

// pointFeatures + txFC/loginFC/placeFC moved to lib/globe/setupLayers (the
// GeoJSON source-shaping layer, co-located with the sources they fill and
// reused by repopulateGlobeSources after a basemap swap) - imported above.

const NO_GENERIC: Entity[] = [];

/** The map sources whose marks the tooltip names (places have no record to word). */
const TIP_SOURCES = ["ml-auths", "ml-logins", "ml-generic"] as const;

/** True when the map opens on the whole globe: the disk, at the opening zoom, is no taller than the
 *  canvas. The camera's room above the bar zooms out only for such a story. */
function opensOnWholeGlobe(map: maplibregl.Map): boolean {
  const zoom = map.getZoom();
  const { worldSize, cameraToCenterDistance: cameraDistance } = map.transform;
  const disk = diskAcross({ zoom, worldSize, cameraDistance, latitude: map.getCenter().lat }, zoom);
  return disk <= map.getCanvas().clientHeight;
}

export function GlobeMap({
  transactions: transactionsIn,
  logins: loginsIn,
  places: placesIn,
  genericEntities: genericEntitiesIn = NO_GENERIC,
  paths,
  onTransactionClick,
  onLoginClick,
  onPlaceClick,
  onMapReady,
  scenarioHome,
}: Props) {
  // The playhead hands down a fresh array at every tick. Each map source is re-sent to the
  // map's worker when its array changes identity, so the lists keep their identity while their
  // members are the same: a source is sent when the playhead crosses an event.
  const transactions = useStableList(transactionsIn);
  const logins = useStableList(loginsIn);
  const places = useStableList(placesIn);
  const genericEntities = useStableList(genericEntitiesIn);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // The loaded map, as state: the decision badge layer mounts its markers once the map exists.
  const [badgeMap, setBadgeMap] = useState<maplibregl.Map | null>(null);
  // True when the camera opened on the whole globe (read at the first style load and again at each
  // home move): the camera may then zoom out for the open bar.
  const [fitToBar, setFitToBar] = useState(false);
  // True once the basemap style + globe projection are loaded, so the marker
  // source-refresh / visibility effects know the sources + layers exist.
  const mapLoadedRef = useRef(false);
  // True once the initial setup has run. Gates the first `style.load` body so
  // the first style sets up EXACTLY ONCE; a post-init basemap swap rebuilds via
  // the theme-swap effect's `map.once("style.load")`, never this handler.
  const didInitialSetupRef = useRef(false);
  // The teardown-contract rebuild (setupLayers + arc + repopulate + sel restore),
  // assigned by the mount effect, called by the theme-swap effect after setStyle.
  const rebuildRef = useRef<(() => void) | null>(null);
  // setupLayers' listener teardown from the LAST run. setStyle({diff:false}) wipes
  // sources/layers but NOT map._delegatedListeners, so the marker click +
  // cursor binds would stack on every theme swap. runSetup calls
  // this before each re-run to unsubscribe the prior run's binds first.
  const teardownLayersRef = useRef<(() => void) | null>(null);
  // Live snapshot the rebuild re-pushes after a destructive swap (the reactive
  // data effects don't re-fire on a theme flip, so they won't re-fill the wiped
  // sources). runSetup feeds this to repopulateGlobeSources.
  const sourceDataRef = useRef<GlobeSourceData | null>(null);
  // Paths from props, mirrored into a ref so the arc custom layer's GL render
  // callback reads the latest without re-adding the layer.
  const pathsRef = useRef<Path[]>([]);
  useEffect(() => { pathsRef.current = paths; }, [paths]);
  // onMapReady callback - mirrored into a ref so the once-bound style handler
  // always calls the current value without a stale closure.
  const onMapReadyRef = useRef(onMapReady);
  useEffect(() => { onMapReadyRef.current = onMapReady; }, [onMapReady]);
  // The map is built once, at its opening camera, as soon as that is known. The mirror sits above
  // the mount effect so the mount reads the value that made `known` true.
  const scenarioHomeRef = useRef(scenarioHome);
  useEffect(() => { scenarioHomeRef.current = scenarioHome; }, [scenarioHome]);
  const known = cameraKnown(openingLink, scenarioHome);

  // Live props + callbacks for the maplibre marker click handlers, which are
  // bound once in the mount effect but must see current data on every click.
  const markerHandlersRef = useRef<MarkerHandlers | null>(null);

  const showAuths = useLayers((s) => s.showAuths);
  const showLogins = useLayers((s) => s.showLogins);
  const showPlaces = useLayers((s) => s.showPlaces);
  const showTimezone = useLayers((s) => s.showTimezone);

  // Lazy-fetched UTC-offset bands, cached so the ~1MB asset is fetched exactly
  // once (first toggle-on) and re-pushed (not re-fetched) after a basemap swap.
  const tzBandsRef = useRef<GeoJSON.FeatureCollection | null>(null);
  // Timezone overlay wiring (lazy-fetch bands + playhead-driven night/terminator
  // + visibility) lives in its own hook so GlobeMap stays under the line cap.
  // Band holding the selected record (the hook keeps it current) for the post-swap rebuild.
  const tzHighlightRef = useRef<string | null>(null);
  useTimezoneOverlay({ mapRef, mapLoadedRef, tzBandsRef, tzHighlightRef, showTimezone });

  // Inspector selection now happens via useNavigation.navigate()'s
  // selection echo (refactor 2026-05-28). GlobeMap no longer subscribes
  // to useSelection directly - every map marker click flows through
  // the unified navigate primitive, which fires the BLOOM cascade +
  // pan/zoom + playhead seek + selection echo atomically.

  // Fraud subset of currently-visible transactions - drives the pulse
  // layer separately so the main auth layer doesn't rebuild GPU buffers
  // every 80ms.
  // Memoised: unmemoised it was a new array at every render and re-ran the source-sending effect.
  const fraudTransactions = useMemo(() => transactions.filter((t) => t.is_fraud), [transactions]);
  const schemaNodes = useSchema((s) => s.nodes);
  // Marker size is measured against the whole pack (the store's full list), not the entities
  // the playhead has reached, so a marker keeps its size as time moves.
  const packEntities = usePivotData((s) => s.entities);
  const magnitudeMax = useMemo(() => magnitudeMaxima(packEntities, schemaNodes), [packEntities, schemaNodes]);
  const ink = useStoryInk();
  const genericData = useMemo(
    () => genericFC(genericEntities, schemaNodes, magnitudeMax, ink),
    [genericEntities, schemaNodes, magnitudeMax, ink],
  );

  // Per-marker landing: mirror the visible fraud markers (id + event timestamp ms) into a
  // ref so the []-effect pulse driver reads the current set each tick without re-rendering. The
  // drop is derived from the playhead vs each event's ts (landingFraction) - no recorded entry
  // time, no wall-clock; scrubbing back before an event un-lands it automatically.
  const fraudMarkersRef = useRef<{ id: string; ts: number }[]>([]);
  // The at-rest pulse driver (radar rings + pin-drop landing); called here because it reads the ref above.
  useRadarPulse({ mapRef, mapLoadedRef, fraudMarkersRef });
  useEffect(() => {
    // Intentional ref mirror: the radar hook (useRadarPulse) reads .current each tick,
    // so it only needs the latest fraud set. Mirroring here avoids re-subscribing
    // that effect on every fraud change.
    fraudMarkersRef.current = fraudTransactions.map((t) => ({
      id: t.id,
      ts: Date.parse(t.timestamp),
    }));
  }, [fraudTransactions]);

  // Pin-drop easing now lives in lib/globe-motion (landingScale, pure +
  // unit-tested). The maplibre landing driver reads landingTimesRef directly
  // and feeds normalized elapsed/700 into landingScale (Phase 2b.3).

  const navigate = useNavigation((s) => s.navigate);

  // Keep the marker click handlers' view of props/callbacks current, so the
  // once-bound maplibre click listeners resolve clicks against the latest
  // data. Written in an effect (not during render) per react-hooks/refs.
  useEffect(() => {
    markerHandlersRef.current = {
      transactions,
      logins,
      places,
      onTransactionClick,
      onLoginClick,
      onPlaceClick,
      genericEntities,
      navigate,
    };
  }, [
    transactions,
    logins,
    places,
    genericEntities,
    onTransactionClick,
    onLoginClick,
    onPlaceClick,
    navigate,
  ]);

  // Theme repaint + basemap swap. A dark↔light crossing (basemap URL changes)
  // does a DESTRUCTIVE swap; any same-theme change repaints palette colors onto
  // the live layers. Subscribe-only: setupLayers already paints the initial
  // palette, so neither branch needs to fire on mount.
  useEffect(() => {
    const repaint = (theme: string, color: string) => {
      const map = mapRef.current;
      if (!map || !mapLoadedRef.current) return;
      // theme/color are validated string subtypes from the store → safe cast.
      repaintGlobeColors(
        map,
        resolvePalette(
          theme as Parameters<typeof resolvePalette>[0],
          color as Parameters<typeof resolvePalette>[1],
        ),
      );
    };

    // DESTRUCTIVE basemap swap. setStyle({diff:false}) wipes every source/layer/
    // custom-layer (verified vs maplibre-gl 5.24 _updateStyle → style._remove →
    // loadURL, which re-fires `style.load`). diff:false is REQUIRED: the default
    // diff path does NOT re-fire style.load and won't carry our custom arc layer
    // across a base-style change. mapLoadedRef gates the reactive effects' map
    // writes shut during teardown (a write to the dead style throws), reopened
    // after the rebuild. The rebuild repaints the new palette from scratch.
    const swapBasemap = (nextTheme: string) => {
      const map = mapRef.current;
      // Before the first setup there is nothing to swap: that setup reads the live theme.
      if (!map || !didInitialSetupRef.current) return;
      mapLoadedRef.current = false;
      map.once("style.load", () => {
        rebuildRef.current?.();        // setupLayers + arc + repopulate + sel restore
        mapLoadedRef.current = true;
      });
      map.setStyle(styleFor(nextTheme), { diff: false });
    };

    const unsub = useTheme.subscribe((s, prev) => {
      // styleFor returns a fresh object now -> swap on theme, repaint on color.
      if (s.theme !== prev.theme) swapBasemap(s.theme);
      else if (s.color !== prev.color) repaint(s.theme, s.color);
    });
    return () => { unsub(); };
  }, []);

  // TARGET-click pulse/bloom (extracted to useBloomPulse for the 800-line cap):
  // the hook owns the click-ack marker-scale + welded bloom-cascade animation,
  // reading entity arrays from the live markerHandlersRef.
  useBloomPulse({ mapRef, mapLoadedRef, markerHandlersRef });
  const capMove = useLabelCap(badgeMap);

  // The camera's room above the open bar. A folded
  // bar clears the padding. The hook reads `--bottom-stack-h`, which App alone writes.
  const barSize = useLayers((s) => s.barSize);
  useBarPadding(badgeMap, { open: barSize !== "line", fit: fitToBar });
  // A move with the home mark (the app's home jump, Reset view) opens the camera again: the fit is read
  // again from where it leaves the camera, so a map built at a zoomed-in address fits its whole globe.
  useEffect(() => {
    if (!badgeMap) return;
    const onHome = (e: object | undefined): void => {
      if ((e as Record<string, unknown> | undefined)?.[HOME_MOVE] === true) setFitToBar(opensOnWholeGlobe(badgeMap));
    };
    badgeMap.on("moveend", onHome);
    return () => { badgeMap.off("moveend", onHome); };
  }, [badgeMap]);

  // The globe's tooltip: the records the map can show, by id, worded as their nodes on the Timeline.
  const onMenu = useOnMenu();
  const tipIndex = useMemo(
    () =>
      buildGlobeTipIndex(
        [...transactions.map(transactionToEntity), ...logins.map(loginToEntity), ...genericEntities],
        schemaNodes,
        (e) => {
          if (e.kind !== "login") return [];
          const l = e.fields as unknown as LoginEvent;
          return ringFacts({ deviceTrust: l.device_trust, outcome: l.outcome });
        },
      ),
    [transactions, logins, genericEntities, schemaNodes],
  );
  const accentFor = useCallback(
    (kind: string): string => {
      const hex = ink.get(kind)?.mark ?? schemaNodes.find((n) => n.kind === kind)?.palette;
      return kind in KIND_SLOT || !hex ? `var(${kindOnPanelVar(kind)})` : onMenu(hex);
    },
    [schemaNodes, onMenu, ink],
  );
  const tipInput = useMemo(() => ({ index: tipIndex, accentFor, sources: TIP_SOURCES }), [tipIndex, accentFor]);
  useGlobeTips(badgeMap, tipInput);

  // The selected record's place on the screen, in viewport pixels, on the map's container: the
  // crawl's check that the bar covers no mark reads it. Written whenever the selection changes and
  // after each `moveend` (a padding change, a zoom and a resize all end in one); removed when
  // nothing is selected or the record has no place.
  useEffect(() => {
    const el = containerRef.current;
    if (!badgeMap || !el) return;
    const write = () => {
      const sel = useSelection.getState().selected;
      const at = sel && entityLngLat(sel);
      if (!at) return el.removeAttribute("data-selected-point");
      const p = badgeMap.project([at.lng, at.lat]);
      const box = el.getBoundingClientRect();
      el.setAttribute("data-selected-point", `${Math.round(box.left + p.x)},${Math.round(box.top + p.y)}`);
    };
    write();
    badgeMap.on("moveend", write);
    const unsub = useSelection.subscribe(write);
    return () => {
      badgeMap.off("moveend", write);
      unsub();
      el.removeAttribute("data-selected-point");
    };
  }, [badgeMap]);

  // Construct the map once the opening camera is known. Clean up on unmount.
  useEffect(() => {
    if (!containerRef.current || !known) return;
    const cam = openingCamera(INITIAL_VIEW, openingLink, scenarioHomeRef.current ?? null);

    const map = new maplibregl.Map({
      container: containerRef.current,
      // Init with the CURRENT theme's basemap so first paint matches the theme
      // (no dark→light flash on a light-first load).
      style: styleFor(useTheme.getState().theme),
      center: cam.center,
      zoom: cam.zoom,
      pitch: cam.pitch,
      bearing: cam.bearing,
      attributionControl: false,
      // Transparent canvas → the off-globe void shows the .globe-space starfield behind
      // it; paired with setupLayers zeroing the basemap `background` (setSky is inert
      // under globe, #5230). maplibre-gl v5 WebGL ctx attrs. (light-void fix)
      canvasContextAttributes: { alpha: true },
      transformRequest: routeBasemapRequest,
    });
    mapRef.current = map;

    // Auto-tilt the camera at city zoom so the fill-extrusion buildings (setupLayers /
    // liberty's building-3d) read as 3D instead of flat footprints, and flatten back at the
    // globe overview. Camera-only, so it persists across the destructive setStyle theme swap.
    const disposeAutoPitch = wireAutoPitch(map);

    // Drag-suppression for camera-follow. Set the flag on interaction
    // start so the follow easeTo doesn't fight an active user drag. Cleared on
    // end. Both mouse (dragstart/dragend) and touch (touchstart/touchend) events
    // are covered. touchstart/touchend fire on the canvas; drag* are maplibre
    // events that map to mouse drag gesture.
    const onDragStart = () => { isDraggingRef.current = true; };
    const onDragEnd   = () => { isDraggingRef.current = false; };
    map.on("dragstart", onDragStart);
    map.on("dragend",   onDragEnd);
    // Touch events fire on the DOM canvas element directly (maplibre does not
    // expose touchstart/touchend as map events in v5).
    const canvas = map.getCanvas();
    canvas.addEventListener("touchstart", onDragStart, { passive: true });
    canvas.addEventListener("touchend",   onDragEnd,   { passive: true });

    // The single re-setup entry point (teardown contract). setStyle({diff:false})
    // WIPES every user-added source/layer/custom-layer (verified vs maplibre-gl
    // 5.24 _updateStyle → style._remove), so all of setupLayers' output - globe
    // projection, sky, sources, circle layers, marker click
    // binds, AND the welded arc custom layer (setupLayers owns createArcLayer) -
    // is rebuilt here. setupLayers does NOT restore transient feature-state: we
    // re-apply the click-ack `sel` on the selected entity; the pin-drop `land`
    // is intentionally left to re-derive from the landing driver.
    const runSetup = (): void => {
      const { theme, color } = useTheme.getState();
      // Unsubscribe the PRIOR run's delegated marker binds
      // before re-running. setStyle({diff:false}) wiped the sources/layers but not
      // map._delegatedListeners, so without this the click/cursor listeners stack
      // on every theme swap (a marker click would fire navigate N+1 times after N
      // flips). null on the initial load - nothing to tear down yet.
      teardownLayersRef.current?.();
      const teardownSetup = setupLayers(
        map,
        { markerHandlersRef, pathsRef },
        resolvePalette(theme, color),
      );
      // The generic-marker click bind lives beside setupLayers (its listener count
      // is pinned by the lifecycle test) and is torn down with it on every swap.
      const unbindGeneric = bindGenericMarkers(map, markerHandlersRef);
      teardownLayersRef.current = () => {
        teardownSetup();
        unbindGeneric();
      };
      // Re-hydrate the freshly-recreated (EMPTY_FC) sources + re-apply visibility
      // from the live snapshot - the reactive data effects won't re-fire on a
      // theme flip, so without this the swapped basemap would show no markers.
      // Refresh the playhead-derived tz fields from LIVE state first: the snapshot
      // only re-fires on data-effect deps, so its playhead would be stale after a
      // scrub-then-swap - recompute the terminator at the current scrub position.
      if (sourceDataRef.current) {
        sourceDataRef.current.playhead = usePlayhead.getState().playhead;
        sourceDataRef.current.tzBands = tzBandsRef.current;
        sourceDataRef.current.tzHighlight = tzHighlightRef.current;
        // A theme switch rebuilds the sources from this snapshot: recolour the generic markers from live state.
        if (sourceDataRef.current.genericData) sourceDataRef.current.genericData = recolourGenericFC(sourceDataRef.current.genericData, storyInkNow());
        repopulateGlobeSources(map, sourceDataRef.current);
      }
      // Restore the selection echo on the marker whose `sel` survived the swap
      // conceptually (the inspector still shows it) but was wiped from GL state.
      const selTarget = selectedSelTarget();
      if (selTarget) {
        map.setFeatureState({ source: selTarget.source, id: selTarget.id }, { sel: 1 });
      }
    };
    // Expose the rebuild to the theme-swap effect, which calls it on style.load
    // after a destructive setStyle. Mirrored into a ref so that effect (a
    // separate closure) always reaches the current setup against this map.
    rebuildRef.current = runSetup;

    map.once("style.load", () => {
      // GUARD: the INITIAL style runs setup EXACTLY ONCE. A post-init basemap swap
      // registers its own one-time `style.load` listener when it starts, NOT this
      // one. didInitialSetupRef belt-and-suspenders against any re-fire.
      if (didInitialSetupRef.current) return;
      didInitialSetupRef.current = true;
      runSetup();

      // Map-ready signals stay in the caller: mapLoadedRef gates the reactive
      // marker-sync / visibility effects, so it MUST flip true
      // immediately after setupLayers returns (the sources + layers now exist).
      mapLoadedRef.current = true;
      onMapReadyRef.current?.(map);
      setFitToBar(opensOnWholeGlobe(map));
      setBadgeMap(map);
      // Dev-only debug handle for eyes-on capture (jumpTo/flyTo to frame a region).
      // Stripped from production builds by the import.meta.env.DEV guard.
      if (import.meta.env.DEV) {
        (window as unknown as { __ffrMap?: maplibregl.Map }).__ffrMap = map;
        // Eyes harness (U1a): window.__ffrMapIdle settled-signal + a camera/playhead
        // deep-link for eyes-smoke/diff/motion. DEV-only, dormant without URL params.
        wireEyesHarness(map, cam);
      }
    });

    return () => {
      disposeAutoPitch();
      map.off("dragstart", onDragStart);
      map.off("dragend",   onDragEnd);
      canvas.removeEventListener("touchstart", onDragStart);
      canvas.removeEventListener("touchend",   onDragEnd);
      // Unsubscribe setupLayers' delegated binds before removing the
      // map (map.remove() also disposes them, but honoring the teardown contract
      // keeps the lifecycle explicit and the ref clean).
      teardownLayersRef.current?.();
      teardownLayersRef.current = null;
      setBadgeMap(null);
      map.remove();
      mapRef.current = null;
      rebuildRef.current = null;
    };
  }, [known]);

  // Track whether the user is actively dragging the map. When true the
  // playback camera-follow skips its easeTo so the follow doesn't fight the user.
  // Set on dragstart/touchstart, cleared on dragend/touchend. Bound in the
  // mount effect (after the map is constructed) so they share the same map ref.
  const isDraggingRef = useRef(false);

  // Whether the case opened on the whole globe (the reading the bar fit uses, read again at each
  // home move). The midpoint of a far
  // pair frames both places only then: from a home at zoom 4 the view reaches 9 to 27 degrees from
  // its centre, and the midpoint would show neither place.
  const openedOnWholeGlobeRef = useRef(fitToBar);
  useEffect(() => { openedOnWholeGlobeRef.current = fitToBar; }, [fitToBar]);
  // The playback follow, the move to a pressed record and the jump home on Play live in useCameraMoves.
  useCameraMoves({ map: badgeMap, mapRef, pathsRef, scenarioHomeRef, openedOnWholeGlobeRef, isDraggingRef, capMove });

  // Reactive marker data (Phase 2a, 2026-05-30): push current entity arrays into
  // the maplibre GeoJSON sources on every data change (playhead scrub). Before
  // the first setup nothing is written: setup repopulates from the live snapshot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = (id: string) => map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    const apply = () => {
      src("ml-auths")?.setData(txFC(transactions));
      src("ml-logins")?.setData(loginFC(logins));
      src("ml-places")?.setData(placeFC(places));
      src("ml-fraud")?.setData(txFC(fraudTransactions));
      src("ml-generic")?.setData(genericData);
    };
    if (mapLoadedRef.current) apply();
  }, [transactions, logins, places, fraudTransactions, genericData]);

  // Reactive layer visibility.
  // The Authorizations and Logins switches act on the data (App narrows it by the one function, lib/marks/draw),
  // so a selected record of a switched-off kind stays drawn; no switch hides these layers. Only the
  // Places switch hides its layers here.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const set = (ids: string[], show: boolean) => {
        for (const id of ids) {
          if (map.getLayer(id)) {
            map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
          }
        }
      };
      set(["ml-places-halo", "ml-places-dot"], showPlaces);
    };
    if (mapLoadedRef.current) apply();
  }, [showPlaces]);

  // Keep the post-swap snapshot current (extracted to a hook for the line cap).
  // A destructive setStyle recreates every source EMPTY and the reactive
  // data/visibility effects above won't re-fire on a theme flip, so runSetup
  // feeds this snapshot to repopulateGlobeSources to restore the pre-swap state.
  useGlobeSourceSnapshot({
    sourceDataRef,
    tzBandsRef,
    transactions,
    logins,
    places,
    fraudTransactions,
    genericData,
    showAuths,
    showLogins,
    showPlaces,
    showTimezone,
  });

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0"
        data-testid="globe-map"
      />
      <GlobeBadgeLayer map={badgeMap} />
      <CustomPathGlobeLayer map={badgeMap} />
    </>
  );
}
