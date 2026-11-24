/**
 * The globe's label cap.
 *
 * At the overview zooms a basemap label whose anchor is on the visible side of the globe is kept
 * even when its text reaches past the limb (viewport-aligned labels are tested at their anchor
 * alone), so names run off the sphere. The style has no "distance from the centre of the view"
 * expression; a `within` filter on a polygon is the means it offers. This module builds that
 * polygon (a spherical cap), finds the label layers from the style, and combines the cap with
 * each layer's own filter. Pure: the camera's centre and zoom are the only inputs, no clock.
 */
import type { FilterSpecification, StyleSpecification } from "maplibre-gl";

/** Labels more than this many degrees of arc from the centre of the view are hidden. A fixed
 *  angle, not scaled to the camera's altitude: this is the one constant to change. */
export const LABEL_CAP_DEG = 62;

/** Below this zoom the cap is in force; at and above it a layer's filter is as shipped. */
export const LABEL_CAP_ZOOM = 6;

/** The basemap schema's source layers whose point labels are capped. */
export const LABEL_SOURCE_LAYERS: readonly string[] = ["place", "water_name"];

export type CapLayer = { id: string; filter: FilterSpecification | undefined };

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

// The polygon is closed a hair short of the poles: a vertex at exactly 90 is degenerate in a
// longitude and latitude plane.
const LAT_LIMIT = 89.999;
// Bearing step of the ring, in degrees. A chord of this size stays well inside the 1 degree of
// slack the tests allow either side of the edge.
const STEP = 5;

/** The spherical cap of angular radius `rDeg` around (lng0, lat0), as a MultiPolygon in
 *  longitude and latitude, in three copies (-360, 0, +360) so the antimeridian needs no special
 *  case. A cap that encloses a pole is the region on the pole's side of the boundary's latitude
 *  at each longitude, closed along the pole. */
export function capPolygon(lng0: number, lat0: number, rDeg: number = LABEL_CAP_DEG): GeoJSON.MultiPolygon {
  // A camera carried past 180 reports an unwrapped longitude; the three copies assume [-180, 180].
  const lng = ((((lng0 + 180) % 360) + 360) % 360) - 180;
  const r = rad(rDeg);
  const phi0 = rad(lat0);
  let ring: [number, number][] = [];
  const north = lat0 + rDeg >= 90;
  const south = lat0 - rDeg <= -90;
  if (!north && !south) {
    for (let b = 0; b <= 360; b += STEP) {
      const th = rad(b);
      const phi = Math.asin(Math.sin(phi0) * Math.cos(r) + Math.cos(phi0) * Math.sin(r) * Math.cos(th));
      const dl = Math.atan2(
        Math.sin(th) * Math.sin(r) * Math.cos(phi0),
        Math.cos(r) - Math.sin(phi0) * Math.sin(phi),
      );
      ring.push([lng + deg(dl), deg(phi)]);
    }
  } else {
    // The boundary latitude at each longitude offset d solves A sin(phi) + B cos(phi) = cos(r),
    // worked in the northern frame and mirrored for a southern cap.
    const sign = north ? 1 : -1;
    const p0 = sign * phi0;
    for (let d = -180; d <= 180; d += STEP) {
      const A = Math.sin(p0);
      const B = Math.cos(p0) * Math.cos(rad(d));
      const x = Math.cos(r) / Math.hypot(A, B);
      const delta = Math.atan2(B, A);
      const phi =
        x >= 1 ? Math.PI / 2 : x <= -1 ? -Math.PI / 2 : Math.max(-Math.PI / 2, Math.asin(x) - delta);
      ring.push([lng + d, sign * deg(phi)]);
    }
    const poleLat = sign * 90;
    ring.push([lng + 180, poleLat], [lng - 180, poleLat]);
    ring.push(ring[0]);
  }
  ring = ring.map(([x, y]) => [x, Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, y))]);
  const copies = [-360, 0, 360].map((s) => [ring.map(([x, y]) => [x + s, y])]);
  return { type: "MultiPolygon", coordinates: copies };
}

type StyleLayer = {
  id: string;
  type?: string;
  "source-layer"?: string;
  layout?: Record<string, unknown>;
  filter?: unknown;
};

/** The layers to cap, taken from the style and not named here: symbol layers whose placement is
 *  a point (the default), that draw text, and whose source layer is a place or water_name layer.
 *  A layer's filter is the one in the document. */
export function labelCapLayers(style: StyleSpecification): CapLayer[] {
  const out: CapLayer[] = [];
  for (const l of style.layers as unknown as StyleLayer[]) {
    if (l.type !== "symbol") continue;
    if (!LABEL_SOURCE_LAYERS.includes(l["source-layer"] ?? "")) continue;
    const layout = l.layout ?? {};
    if ((layout["symbol-placement"] ?? "point") !== "point") continue;
    if (layout["text-field"] === undefined) continue;
    out.push({ id: l.id, filter: l.filter as FilterSpecification | undefined });
  }
  return out;
}

/** A layer's filter for the camera at (lng, lat) and `zoom`: its shipped filter at zoom 6 and
 *  above, otherwise the shipped filter and the cap, or the cap alone when it has none. Built
 *  from the shipped filter each time, so a cap is never wrapped in another. */
export function capFilter(
  shipped: FilterSpecification | undefined,
  lng: number,
  lat: number,
  zoom: number,
): FilterSpecification | undefined {
  if (zoom >= LABEL_CAP_ZOOM) return shipped;
  const within = ["within", capPolygon(lng, lat, LABEL_CAP_DEG)];
  return (shipped ? ["all", shipped, within] : within) as FilterSpecification;
}

/** The options each `setFilter` call carries. Without them MapLibre serialises the whole style and
 *  validates the filter on every call (`Style._validate`; 10 to 13 ms for the ten calls of one pass,
 *  profiled in the played swing's first camera tick). The filters here are the shipped style's own
 *  or the shipped filter with a polygon `capPolygon` builds, and labelCap.test.ts runs MapLibre's
 *  validator over every shape `capFilter` can return, so the per-call check is a repeat. */
export const CAP_SET_OPTIONS: { readonly validate: false } = { validate: false };

/** A cap is not set again while the centre stays within this many degrees of arc of the centre it
 *  was last set round, on the same side of zoom 6. */
export const CAP_RESET_DEG = 1;

/** The camera state a cap was set for. */
export type CapState = { lng: number; lat: number; zoom: number };

/** Great-circle distance in degrees between two points (haversine). A longitude the camera has
 *  carried past 180 gives the same distance as its wrapped value. */
export function arcDeg(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return deg(2 * Math.asin(Math.min(1, Math.sqrt(a))));
}

/** Whether the filters must be set again for `next`: nothing is known yet, the two states sit on
 *  different sides of zoom 6, or both are below it and their centres are more than CAP_RESET_DEG
 *  apart. `prev` is the state last set, not the last move, so small moves cannot add up to a drift. */
export function capStateChanged(prev: CapState | null, next: CapState): boolean {
  if (prev === null) return true;
  const prevCapped = prev.zoom < LABEL_CAP_ZOOM;
  if (prevCapped !== next.zoom < LABEL_CAP_ZOOM) return true;
  if (!prevCapped) return false;
  return arcDeg(prev.lng, prev.lat, next.lng, next.lat) > CAP_RESET_DEG;
}

/** The zoom a cap is set for when a move is called: the lesser of the camera's zoom and the zoom
 *  the call names (the camera's when it names none). */
export function moveCapZoom(current: number, named: number | undefined): number {
  return named === undefined ? current : Math.min(current, named);
}
