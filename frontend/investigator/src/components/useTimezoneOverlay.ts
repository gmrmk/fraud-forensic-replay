/**
 * useTimezoneOverlay - all wiring for the opt-in day/night + UTC-offset-band
 * globe overlay, extracted from GlobeMap to keep that file under the 800-line
 * cap (one file, one reason to change: this hook owns the timezone surface).
 *
 * Three concerns, mirroring the existing GlobeMap globe effects:
 *  1. LAZY-FETCH the ~1MB offset-band geojson the FIRST time the overlay turns
 *     on (cached in tzBandsRef so it is fetched once and re-pushed, never
 *     re-fetched, after a basemap swap), then setData the ml-tz-bands source.
 *  2. PLAYHEAD-DRIVEN night/terminator: subscribe to usePlayhead and, while the
 *     overlay is on, recompute computeTerminator(playhead) (via terminatorFCs)
 *     and setData the night-fill + terminator-line sources - throttled
 *     (125ms leading+trailing) since it recomputes geometry per scrub.
 *     Playhead-as-truth: the ONLY input is the playhead epoch-ms (no Date.now()).
 *  3. VISIBILITY: gate every tz-* layer (TZ_LAYER_IDS) on showTimezone,
 *     mirroring GlobeMap's marker visibility effect.
 *  4. SELECTED-BAND HIGHLIGHT: on a selection change (and on band-data arrival)
 *     find the band holding the selected record's coords (lib/globe/tzBands) and
 *     point the highlight fill + label emphasis at it. Never per frame. The band
 *     name is kept in tzHighlightRef so the post-swap rebuild re-applies it.
 *
 * The layers/sources themselves are created (hidden, EMPTY) in setupLayers
 * and re-created on a destructive setStyle swap; this hook only feeds + toggles
 * them. The post-swap re-hydration of tz data+visibility is owned by
 * repopulateGlobeSources (driven by GlobeMap's snapshot ref), not this hook.
 */
import { useEffect, type MutableRefObject } from "react";
import type maplibregl from "maplibre-gl";
import { usePlayhead } from "../store/playhead";
import { useSelection } from "../store/selection";
import { terminatorFCs, fetchTzBands } from "../lib/globe/setupLayers";
import { applyTzHighlight, selectedBand, TZ_LAYER_IDS } from "../lib/globe/tzBands";

/** Throttle window for the playhead-driven terminator recompute (ms), so a
 *  scrub does not thrash geometry rebuilds. */
const TZ_TERMINATOR_THROTTLE_MS = 125;

interface TimezoneOverlayDeps {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapLoadedRef: MutableRefObject<boolean>;
  /** Cached offset-band FC - fetched once, re-pushed after a swap. */
  tzBandsRef: MutableRefObject<GeoJSON.FeatureCollection | null>;
  /** Band holding the selected record, kept current here; GlobeMap's post-swap
   *  rebuild hands it to repopulateGlobeSources. */
  tzHighlightRef: MutableRefObject<string | null>;
  showTimezone: boolean;
}

/** Recompute the selected record's band and point the highlight at it. */
function syncTzHighlight(
  map: maplibregl.Map | null,
  bands: GeoJSON.FeatureCollection | null,
  highlightRef: MutableRefObject<string | null>,
): void {
  highlightRef.current = selectedBand(bands, useSelection.getState().selected);
  // map.style is gone while a WebGL context is lost; getLayer then throws, and one caller is a
  // store subscriber, outside React, so nothing would catch it. The ref is set above either way,
  // and the rebuilt map reads it.
  if (map?.style) applyTzHighlight(map, highlightRef.current);
}

export function useTimezoneOverlay({
  mapRef,
  mapLoadedRef,
  tzBandsRef,
  tzHighlightRef,
  showTimezone,
}: TimezoneOverlayDeps): void {
  const visible = showTimezone;

  // 1. Lazy-fetch the offset bands on first toggle-on; push to ml-tz-bands.
  //    Cached in tzBandsRef → fetched exactly once. A cancelled flag guards
  //    against a setData after unmount.
  useEffect(() => {
    if (!showTimezone) return;
    let cancelled = false;
    const pushBands = (fc: GeoJSON.FeatureCollection) => {
      const map = mapRef.current;
      if (!map || cancelled) return;
      // Set the ref before the loaded check: bands can land mid-swap, when
      // once("load") never fires again and the rebuild reads this ref instead.
      tzHighlightRef.current = selectedBand(fc, useSelection.getState().selected);
      const apply = () => {
        (map.getSource("ml-tz-bands") as maplibregl.GeoJSONSource | undefined)?.setData(fc);
        syncTzHighlight(map, fc, tzHighlightRef);
      };
      if (mapLoadedRef.current) apply();
    };
    if (tzBandsRef.current) {
      pushBands(tzBandsRef.current);
    } else {
      void fetchTzBands()
        .then((fc) => {
          if (cancelled) return;
          tzBandsRef.current = fc;
          pushBands(fc);
        })
        .catch(() => {
          // Leave the overlay un-hydrated on fetch failure rather than push
          // garbage; the night/terminator (playhead-derived) still render.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [showTimezone, mapRef, mapLoadedRef, tzBandsRef, tzHighlightRef]);

  // 2. Playhead-driven night + terminator. Subscribe to usePlayhead and, while
  //    the overlay is visible, recompute the terminator from the playhead ms and
  //    setData the two sources - throttled (leading + trailing) so a fast scrub
  //    settles on the final playhead without rebuilding geometry every tick.
  useEffect(() => {
    if (!visible) return;
    let throttleAt = 0;
    let trail: ReturnType<typeof setTimeout> | null = null;
    const pushTerminator = (playheadMs: number) => {
      const map = mapRef.current;
      // map.style is gone while a WebGL context is lost; getSource then throws, and this runs
      // from a store subscriber and a timer, outside React, so nothing would catch it.
      if (!map || !mapLoadedRef.current || !map.style) return;
      throttleAt = performance.now();
      const { night, line } = terminatorFCs(playheadMs);
      (map.getSource("ml-tz-night") as maplibregl.GeoJSONSource | undefined)?.setData(night);
      (map.getSource("ml-tz-terminator") as maplibregl.GeoJSONSource | undefined)?.setData(line);
    };
    const schedule = (playheadMs: number) => {
      const wait = TZ_TERMINATOR_THROTTLE_MS - (performance.now() - throttleAt);
      if (trail) clearTimeout(trail);
      if (wait <= 0) pushTerminator(playheadMs);
      else trail = setTimeout(() => pushTerminator(playheadMs), wait);
    };
    // Initial push for the current playhead (immediate, no throttle wait).
    pushTerminator(usePlayhead.getState().playhead);
    const unsub = usePlayhead.subscribe((s, p) => {
      if (s.playhead !== p.playhead) schedule(s.playhead);
    });
    return () => {
      unsub();
      if (trail) clearTimeout(trail);
    };
  }, [visible, mapRef, mapLoadedRef]);

  // 3. Visibility - gate the three tz layers on showTimezone,
  //    mirroring GlobeMap's marker visibility effect (getLayer-guarded; a map that is
  //    not ready yet gets its state from the setup rebuild).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      for (const id of TZ_LAYER_IDS) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
        }
      }
    };
    if (mapLoadedRef.current) apply();
  }, [visible, mapRef, mapLoadedRef]);

  // 4. Selected-band highlight: recompute only when the selection changes (band
  //    arrival is handled in effect 1). Before load the layers do not exist yet;
  //    the ref still updates so the first rebuild lands the right band.
  useEffect(() => {
    const sync = () =>
      syncTzHighlight(mapLoadedRef.current ? mapRef.current : null, tzBandsRef.current, tzHighlightRef);
    sync();
    return useSelection.subscribe((s, p) => {
      if (s.selected !== p.selected) sync();
    });
  }, [mapRef, mapLoadedRef, tzBandsRef, tzHighlightRef]);
}
