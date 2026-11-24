/**
 * Playback camera-follow helpers (pure). During playback the globe should keep
 * the *currently-active* event framed without the analyst hand-spinning it -
 * and without jittering on every event inside a dense cluster. These pure
 * functions decide WHAT to look at and WHERE the one eased move goes; the actual
 * `map.easeTo` lives in components/useCameraMoves.ts (the GPU/camera side is
 * eyes-on-gated, this logic is unit-tested).
 */
import type { ProjectionSpecification } from "maplibre-gl";
import { mapIsFlat } from "./globe/projection";

export interface FollowEvent {
  ts: number;
  lng: number;
  lat: number;
}

export interface LngLat {
  lng: number;
  lat: number;
}

/** The active event during playback: the latest event at or before time `t`.
 *  Returns null if no event has occurred yet. Input order-independent. */
export function activeFollowTarget(
  events: readonly FollowEvent[],
  t: number,
): FollowEvent | null {
  let best: FollowEvent | null = null;
  for (const e of events) {
    if (e.ts <= t && (best === null || e.ts > best.ts)) best = e;
  }
  return best;
}

// ---- The calmer follow: frame the places and hold ----
//
// Late in the card story the events alternate between Houston and Lagos, and the old rule crossed
// the Atlantic for each one. The rule now is: a target that is in view makes no move; a target out
// of view, while the camera is still at the zoom the case opened on, gets ONE move to the midpoint
// of the target and the place the story was at before it, so both are in view and the alternation
// makes no further move; a person who has zoomed in gets the move to the target, as before.

/** Two places this far apart or more are not framed together: the move goes to the target. */
export const FAR_PAIR_DEG = 120;
/** A move whose centre is within this many degrees of the camera is no move: the hold. */
export const HOLD_DEG = 1;
/** The camera is "at its opening zoom" up to this many zoom levels above the home's zoom. */
export const HOME_ZOOM_TOLERANCE = 0.25;
/** A place is in view when it is this fraction of the open part's shorter side inside every edge. */
export const IN_VIEW_MARGIN = 0.08;

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;
const unit = (p: LngLat): [number, number, number] => [
  Math.cos(rad(p.lat)) * Math.sin(rad(p.lng)),
  Math.sin(rad(p.lat)),
  Math.cos(rad(p.lat)) * Math.cos(rad(p.lng)),
];

/** The angle at the globe's centre between two places, in degrees (0 to 180): a true great-circle
 *  distance, right across the antimeridian and for places far apart. */
export function greatCircleDeg(a: LngLat, b: LngLat): number {
  const [ax, ay, az] = unit(a);
  const [bx, by, bz] = unit(b);
  const cross = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  return deg(Math.atan2(cross, ax * bx + ay * by + az * bz));
}

/** The point midway between two places on the great circle through them. Two places on opposite
 *  sides of the globe have no one midpoint; the first place is returned. */
export function greatCircleMidpoint(a: LngLat, b: LngLat): LngLat {
  const [ax, ay, az] = unit(a);
  const [bx, by, bz] = unit(b);
  const x = ax + bx;
  const y = ay + by;
  const z = az + bz;
  const n = Math.hypot(x, y, z);
  if (n < 1e-9) return { lng: a.lng, lat: a.lat };
  return { lng: deg(Math.atan2(x, z)), lat: deg(Math.asin(y / n)) };
}

/** The point midway between two places on the flat map: the mean of their longitudes, in the one
 *  world shown, with no wrap across the 180 line, and the latitude whose Mercator y is the mean of
 *  the two places' Mercator y. */
export function flatMidpoint(a: LngLat, b: LngLat): LngLat {
  const mercatorY = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
  const y = (mercatorY(a.lat) + mercatorY(b.lat)) / 2;
  return { lng: (a.lng + b.lng) / 2, lat: deg(2 * Math.atan(Math.exp(y)) - Math.PI / 2) };
}

/** The place the story was at before `target`: the latest event earlier than it and not at its own
 *  place (more than `HOLD_DEG` away). So two Lagos events in a row both look back to Houston. Null
 *  when the story has been nowhere else. Input order-independent. */
export function followPlaceBefore(
  events: readonly FollowEvent[],
  target: FollowEvent,
): FollowEvent | null {
  let best: FollowEvent | null = null;
  for (const e of events) {
    if (e.ts >= target.ts || greatCircleDeg(e, target) <= HOLD_DEG) continue;
    if (best === null || e.ts > best.ts) best = e;
  }
  return best;
}

/** True when the camera is still at the zoom the case opened on: at or below the home's zoom plus a
 *  small tolerance (the fit above the bar sets it lower). False when no home is known, so a case
 *  with no known opening view follows as it did before, to the target. */
export function atOpeningZoom(zoom: number, homeZoom: number | null | undefined): boolean {
  return typeof homeZoom === "number" && zoom <= homeZoom + HOME_ZOOM_TOLERANCE;
}

/** A globe zoom normalised to the equator. For the same globe on screen the library's zoom number
 *  falls by log2(1 / cos(latitude)) away from the equator (maplibre-gl 5.24.1, getZoomAdjustment), so adding that term gives the zoom the same globe has at the
 *  equator. A centre-only ease keeps the globe's size, so the follow compares zooms in this form.
 *  On a flat map the zoom number does not move with latitude. */
export function equatorZoom(zoom: number, lat: number): number {
  return zoom + Math.log2(1 / Math.cos((lat * Math.PI) / 180));
}

/** The follow waits this part of the case's span between its moves and before the first of a play. */
export const FOLLOW_WAIT_PART = 12;

/** True when the playhead has moved at least `1 / FOLLOW_WAIT_PART` of the span from the anchor,
 *  either way, so that reverse play waits the same. */
export function followWaitOver(playhead: number, anchor: number, minTime: number, maxTime: number): boolean {
  return Math.abs(playhead - anchor) >= (maxTime - minTime) / FOLLOW_WAIT_PART;
}

export interface FollowMoveInput {
  /** The event the story is at. */
  target: LngLat;
  /** The place the story was at before it; null when there is none. */
  before: LngLat | null;
  /** Whether the target is in view. */
  targetInView: boolean;
  /** Whether the camera is still at the zoom the case opened on. */
  atOpeningZoom: boolean;
  /** Where the camera is. */
  camera: LngLat;
  /** Whether the map is flat; left out, it is the globe. */
  flat?: boolean;
}

/** The centre of the one move the follow makes, or null for no move. (a) A target in view: none.
 *  (b) Out of view at the opening zoom: the midpoint of the target and the place before it when
 *  they are less than `FAR_PAIR_DEG` apart, else the target. (c) Out of view with the person
 *  zoomed in: the target. (f) A move whose centre is within `HOLD_DEG` of the camera is none, so
 *  two places near the edge of the view, each judged out of view from their own midpoint, do not
 *  ask for the same centre again and again. The midpoint is the great circle's on the globe and
 *  `flatMidpoint` on the flat map. */
export function followMove(input: FollowMoveInput): LngLat | null {
  if (input.targetInView) return null;
  let to: LngLat = { lng: input.target.lng, lat: input.target.lat };
  if (input.atOpeningZoom && input.before && greatCircleDeg(input.target, input.before) < FAR_PAIR_DEG) {
    to = (input.flat ? flatMidpoint : greatCircleMidpoint)(input.target, input.before);
  }
  return greatCircleDeg(to, input.camera) <= HOLD_DEG ? null : to;
}

/** The calls `placeInView` makes on the map (a MapLibre `Map` satisfies it; a test passes a fake).
 *  maplibre-gl 5.24.1: `Map.project` is `transform.locationToScreenPoint` (a pixel in the container);
 *  `transform.isLocationOccluded` is the globe's horizon test, true for a
 *  place on the far side (the call a Marker makes) and false under Mercator;
 *  `Map.getPadding` is the transform's padding, whose bottom is the bar's height;
 *  `Map.getProjection` tells the flat map from the globe. */
export interface FollowViewMap {
  project(lngLat: LngLat): { x: number; y: number };
  transform: { isLocationOccluded(lngLat: LngLat): boolean };
  getCanvas(): { clientWidth: number; clientHeight: number };
  getCenter(): LngLat;
  /** MapLibre's `PaddingOptions`: a side it does not name is 0. */
  getPadding(): { top?: number; bottom?: number; left?: number; right?: number };
  getProjection?(): ProjectionSpecification;
}

/** A place farther than this from the centre of the view is not in view, though it is on the near
 *  side: at the whole-globe view the disk lies inside the canvas, so the screen margin never bites
 *  east and west, and a place 70 degrees out sits on the limb. 60 is half of `FAR_PAIR_DEG`, so two
 *  places less than 120 apart are each within it from their midpoint. On the flat map the window is
 *  wider than the world's middle, so the limit is skipped and the test on screen decides alone. */
export const IN_VIEW_MAX_DEG = 60;

/** True when the place is on the near side of the globe, within `IN_VIEW_MAX_DEG` of the centre of
 *  the view (on the globe only), and on screen inside the part of the map that is not under the bar
 *  (the map's padding), with a margin of `IN_VIEW_MARGIN` of that part's shorter side. */
export function placeInView(map: FollowViewMap, place: LngLat): boolean {
  if (map.transform.isLocationOccluded(place)) return false;
  if (!mapIsFlat(map) && greatCircleDeg(place, map.getCenter()) > IN_VIEW_MAX_DEG) return false;
  const { x, y } = map.project(place);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const { clientWidth: w, clientHeight: h } = map.getCanvas();
  const pad = map.getPadding();
  const left = pad.left ?? 0;
  const right = w - (pad.right ?? 0);
  const top = pad.top ?? 0;
  const bottom = h - (pad.bottom ?? 0);
  const margin = Math.round(IN_VIEW_MARGIN * Math.min(right - left, bottom - top));
  return x >= left + margin && x <= right - margin && y >= top + margin && y <= bottom - margin;
}
