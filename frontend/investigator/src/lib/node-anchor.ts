/**
 * Flag-to-node helpers: which map point an entity anchors to, and whether
 * that point is on the camera-facing hemisphere of the globe.
 *
 * Docs verification: confirmed against the
 * installed `maplibre-gl@5` package's own type declarations
 * (`node_modules/maplibre-gl/dist/maplibre-gl.d.ts`), cross-checked
 * against https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/ and
 * the globe rendering guide at
 * https://github.com/maplibre/maplibre-gl-js/blob/main/developer-guides/globe.md.
 *
 * (a) `Map.project(lnglat: LngLatLike): Point` returns ONLY a screen-space
 *     `{x, y}` Point - no occlusion or clipping flag is exposed on it, and
 *     its doc comment says nothing about horizon behavior. Internally,
 *     globe rendering clips far-side geometry via a horizon plane baked
 *     into the vertex shader's `gl_Position.z` (a GPU clip-space trick,
 *     not something `project()` surfaces to callers) - so `project()`
 *     will still happily return a screen coordinate for a far-side point;
 *     it does not tell you the point was clipped or is "through the
 *     planet." Callers must determine visibility themselves.
 * (b) A supported-looking type, `PointProjection` (with fields `point`,
 *     `signedDistanceFromCamera`, `isOccluded`), exists in the bundled
 *     `.d.ts` - used internally by the symbol/label placement pipeline,
 *     not returned by any public Map method. The actual point-in,
 *     boolean-out check, `Transform.isLocationOccluded(lngLat): boolean`
 *     ("Returns whether the supplied location is occluded in this
 *     projection. For example during globe rendering a location on the
 *     backfacing side of the globe is occluded."), is explicitly marked
 *     `@internal` in the type declarations - not part of the public API,
 *     no stability guarantee. The one PUBLIC, documented occlusion
 *     surface is on `Marker`: it toggles the CSS class
 *     `maplibregl-marker-covered` when "hidden behind 3D terrain or on
 *     the back of a globe," plus a `setOpacity(opacity, opacityWhenCovered)`
 *     knob - but that's DOM-marker-specific behavior, not a queryable
 *     function callers can run against arbitrary lng/lat pairs (which is
 *     what a deck.gl-rendered node/flag needs).
 *
 * Upgrade path: if `Transform.isLocationOccluded` (or an equivalent)
 * graduates to public API in a future maplibre-gl release, Task 6's layer
 * can call `map.transform.isLocationOccluded(lngLat)` directly against
 * the live camera instead of this fallback. Until then, this great-circle
 * fallback is the implementation: a globe point is visible iff its
 * angular distance from the camera-center point is < 90° (hemisphere
 * test). This is an over-approximation of the true visible cap (which is
 * arccos(R/(R+h)) for camera altitude h, always < 90°): permissive at the
 * limb, where the only failure mode is a flag window lingering briefly
 * past the rendered horizon - a transient edge-only artifact for a
 * hide/show tether. Tighten to the altitude-aware bound when the windows
 * layer supplies camera altitude from map.transform.
 */
import type { EntityMatch } from "./matches";

export interface LngLat {
  lng: number;
  lat: number;
}

/** Where an entity lives on the map - null for geography-less kinds
 *  (AccountEvent/Transfer have no coords by design; see types.ts). */
export function entityLngLat(e: EntityMatch): LngLat | null {
  switch (e.kind) {
    case "auth":
    case "fraud":
      return { lng: e.tx.merchant_lng, lat: e.tx.merchant_lat };
    case "login":
      return { lng: e.login.ip_lng, lat: e.login.ip_lat };
    case "place":
      return { lng: e.place.lng, lat: e.place.lat };
    case "entity":
      return e.entity.coords && { lng: e.entity.coords.lng, lat: e.entity.coords.lat };
    case "account_event":
    case "transfer":
      return null;
  }
}

const DEG = Math.PI / 180;

/** Central angle between two lng/lat points, in degrees. */
export function angularDistanceDeg(a: LngLat, b: LngLat): number {
  const φ1 = a.lat * DEG, φ2 = b.lat * DEG;
  const Δλ = (b.lng - a.lng) * DEG;
  const cosc =
    Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.acos(Math.min(1, Math.max(-1, cosc))) / DEG;
}

/** Hemisphere test: is `point` behind the globe relative to a camera
 *  looking at `center`? */
export function isOccludedByGlobe(center: LngLat, point: LngLat): boolean {
  return angularDistanceDeg(center, point) >= 90;
}
