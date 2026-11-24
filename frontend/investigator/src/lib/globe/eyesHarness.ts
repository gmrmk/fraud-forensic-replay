import type { Map as MapLibreMap } from "maplibre-gl";
import { usePlayhead } from "../../store/playhead";
import { useNavigation } from "../../store/navigation";
import { useLayers } from "../../store/layers";
import { parseDeepLink, hasCameraOverride } from "./deepLink";

interface InitialView {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

// DEV-only eyes-harness wiring (U1a, drivable sight). Exposes window.__ffrMapIdle - the
// deterministic "settled" signal eyes --wait-idle polls (true once the map reaches idle,
// false while it is moving or loading tiles), and applies a camera deep-link from the URL so
// eyes-smoke / eyes-diff / eyes-motion can frame any view (the scrub position in the same
// link is pinned by hooks/useShareLink). Dormant unless URL params are present, so default app behavior (and the
// structural self-check) is unchanged. Pure-parse logic lives in deepLink.ts (unit-tested);
// this is the thin imperative glue, verified end-to-end by eyes-smoke (U1b).
export function wireEyesHarness(map: MapLibreMap, initialView: InitialView): void {
  // Expose the playhead store so eyes-motion can read bounds + setPlayhead for keyframe capture.
  (window as unknown as { __ffrPlayhead?: typeof usePlayhead }).__ffrPlayhead = usePlayhead;
  // The film's capture harness selects a record by id through navigate() (the same cascade a
  // click runs), so a shot never depends on hitting a 12 px timeline dot under the virtual clock.
  (window as unknown as { __ffrNavigation?: typeof useNavigation }).__ffrNavigation = useNavigation;
  // The film switches layers off-screen before a beat records, so only what the line names is drawn.
  (window as unknown as { __ffrLayers?: typeof useLayers }).__ffrLayers = useLayers;
  const w = window as unknown as { __ffrMapIdle?: boolean };
  const markBusy = (): void => {
    w.__ffrMapIdle = false;
  };
  // "Settled" = camera stopped AND the current view's tiles are in. Keyed on moveend +
  // areTilesLoaded, NOT just maplibre "idle": a persistent animation (the radar ping)
  // keeps the map rendering, so "idle" may never fire. `data` re-checks as tiles arrive;
  // "idle" (when it does fire) is a fast path.
  const markSettled = (): void => {
    const tilesIn = typeof map.areTilesLoaded === "function" ? map.areTilesLoaded() : true;
    if (tilesIn) w.__ffrMapIdle = true;
  };
  map.on("movestart", markBusy);
  map.on("dataloading", markBusy);
  map.on("moveend", markSettled);
  map.on("data", markSettled);
  map.on("idle", () => {
    w.__ffrMapIdle = true;
  });

  // The link's time is not set here: hooks/useShareLink opens the playhead on it, clamped to
  // the data and held through every bounds arrival. A raw write here raced those arrivals and
  // could leave the playhead outside the data (?playhead=0 read as the year 1969).
  const dl = parseDeepLink(window.location.search);
  if (hasCameraOverride(dl)) {
    // Lock the camera so App's scenario-home establishing shot yields to this explicit
    // deep-link framing (else eyes-smoke/diff/motion can't hold a pinned view).
    (window as unknown as { __ffrCameraLock?: boolean }).__ffrCameraLock = true;
    w.__ffrMapIdle = false;
    map.jumpTo({
      center: dl.center ?? initialView.center,
      zoom: dl.zoom ?? initialView.zoom,
      pitch: dl.pitch ?? initialView.pitch,
      bearing: dl.bearing ?? initialView.bearing,
    });
  }
}
