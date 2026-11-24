// Camera + playhead deep-link for the eyes harness (U1a, drivable sight). eyes-smoke /
// eyes-diff / eyes-motion frame a view and pin the scrub position by URL so captures are
// deterministic:
//   ?lng & ?lat & ?zoom & ?pitch & ?bearing  -> override the initial camera on mount
//   ?playhead=<ms>                            -> set the scrub position (deterministic motion/diff)
// Pure parse over a query string (no window access) so it unit-tests without a DOM mock; the
// caller falls back to INITIAL_VIEW for any absent camera axis.

export interface DeepLinkParams {
  center?: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  playhead?: number;
}

export function parseDeepLink(search: string): DeepLinkParams {
  const out: DeepLinkParams = {};
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search || "");
  } catch {
    return out; // malformed query -> no override
  }
  const num = (k: string): number | undefined => {
    const v = q.get(k);
    if (v === null || v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const lng = num("lng");
  const lat = num("lat");
  // Both or neither; and the map throws on a latitude off the globe, so such a center is dropped.
  if (lng !== undefined && lat !== undefined && Math.abs(lat) <= 90) out.center = [lng, lat];
  const zoom = num("zoom");
  if (zoom !== undefined) out.zoom = zoom;
  const pitch = num("pitch");
  if (pitch !== undefined) out.pitch = pitch;
  const bearing = num("bearing");
  if (bearing !== undefined) out.bearing = bearing;
  const playhead = num("playhead");
  if (playhead !== undefined) out.playhead = playhead;
  return out;
}

/** True if any camera axis is present (a lone ?playhead pins the scrub but does NOT move the camera). */
export function hasCameraOverride(p: DeepLinkParams): boolean {
  return (
    p.center !== undefined ||
    p.zoom !== undefined ||
    p.pitch !== undefined ||
    p.bearing !== undefined
  );
}
