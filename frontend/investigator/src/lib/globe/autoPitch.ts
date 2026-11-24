import type { Map as MapLibreMap } from "maplibre-gl";

// Auto-tilt the camera at city zoom so fill-extrusion buildings read as 3D, and return to a flat
// top-down view at globe overview. A fill-extrusion is a flat footprint at pitch 0 - this is what
// makes the dark-mode buildings (setupLayers ml-building-3d-dark) and liberty's own building-3d
// read as architecture instead of scatter. Camera-only, so it benefits BOTH themes and survives a
// destructive setStyle swap (the map instance persists across the swap).
//
// Hysteresis (tilt in at CITY_ZOOM_IN, flatten out below GLOBE_ZOOM_OUT) prevents flicker at the
// boundary; the tilt-in threshold leads the buildings' minzoom (14) by a zoom level so the camera
// is already pitched by the time they appear. A single `eased` flag stops the ease re-firing on
// every zoom event.

export const CITY_ZOOM_IN = 13; // at/above this zoom, ease to the city tilt (buildings appear @14)
export const GLOBE_ZOOM_OUT = 12; // below this zoom, ease back to flat (hysteresis vs CITY_ZOOM_IN)
export const CITY_PITCH = 48; // degrees; chosen with the building-color sweep, under maxPitch 60
const EASE_MS = 900;

/**
 * Wire zoom-driven auto-pitch onto a maplibre map. Returns a disposer that removes the listener.
 * Pure of any app state - takes only the map, so it is trivially testable with a fake map.
 */
export function wireAutoPitch(map: MapLibreMap): () => void {
  let eased = map.getZoom() >= CITY_ZOOM_IN;
  const onZoomEnd = (): void => {
    const z = map.getZoom();
    if (z >= CITY_ZOOM_IN && !eased) {
      eased = true;
      map.easeTo({ pitch: CITY_PITCH, duration: EASE_MS });
    } else if (z <= GLOBE_ZOOM_OUT && eased) {
      eased = false;
      map.easeTo({ pitch: 0, duration: EASE_MS });
    }
  };
  map.on("zoomend", onZoomEnd);
  return () => {
    map.off("zoomend", onZoomEnd);
  };
}
