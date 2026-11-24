/**
 * useGlobeSourceSnapshot - keeps the post-swap re-hydration snapshot current,
 * extracted from GlobeMap to hold that file under the 800-line cap (one file,
 * one reason to change: this hook owns the GlobeSourceData snapshot).
 *
 * A destructive setStyle (dark<->light basemap swap) recreates every globe
 * source EMPTY, and GlobeMap's reactive data/visibility effects do NOT re-fire
 * on a theme flip (their deps are unchanged), so runSetup feeds THIS snapshot to
 * repopulateGlobeSources to land the swapped style in the exact pre-swap state.
 *
 * The timezone bands FC + the playhead are read LIVE (from the ref / the store)
 * at snapshot-build time; runSetup additionally refreshes the playhead-derived
 * fields just before the rebuild, so the post-swap terminator matches the current
 * scrub position rather than the position at the last data-effect fire.
 */
import { useEffect, type MutableRefObject } from "react";
import { usePlayhead } from "../store/playhead";
import type { GlobeSourceData } from "../lib/globe/setupLayers";
import type { LoginEvent, Place, Transaction } from "../types";

interface SnapshotInputs {
  sourceDataRef: MutableRefObject<GlobeSourceData | null>;
  tzBandsRef: MutableRefObject<GeoJSON.FeatureCollection | null>;
  transactions: Transaction[];
  logins: LoginEvent[];
  places: Place[];
  fraudTransactions: Transaction[];
  genericData: GeoJSON.FeatureCollection;
  showAuths: boolean;
  showLogins: boolean;
  showPlaces: boolean;
  showTimezone: boolean;
}

export function useGlobeSourceSnapshot({
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
}: SnapshotInputs): void {
  useEffect(() => {
    sourceDataRef.current = {
      transactions,
      logins,
      places,
      fraudTransactions,
      genericData,
      showAuths,
      showLogins,
      showPlaces,
      showTimezone,
      // The bands FC is the lazy-fetch cache; the night/terminator GEOMETRY is
      // playhead-derived and is recomputed (not snapshotted) in runSetup from the
      // live playhead, so the rebuild lands the current solar position post-swap.
      tzBands: tzBandsRef.current,
      playhead: usePlayhead.getState().playhead,
    };
  }, [
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
  ]);
}
