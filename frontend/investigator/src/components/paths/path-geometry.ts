/**
 * The pure geometry of the investigator's paths: which saved paths (and the draft) are drawn and how
 * strongly, the globe's dashed line and numbered plates, and the Timeline's line, plates and gaps.
 * Everything here is a function of values passed in: stops come as the model's `PathStopView` (the
 * record lookup and the switches already applied), times come from the record's own `RecordInfo.time`,
 * and the playhead is a plain argument (the playhead is the only clock; nothing here reads a store, a
 * map or a wall clock, and no state is kept).
 *
 * What this file does not do: it draws nothing (the plates' markup, the map layers and the Timeline's
 * svg are the globe and Timeline parts), sets no type size, and merges no globe plates by screen distance
 * (a deliberate shortcut: only stops at exactly equal coordinates of one path share a plate). Timeline
 * plates of one path that would come within `TOUCH_PX` of each other, measured on a track whose size the
 * caller gives, join into one (`joinTimelinePlates`); plates of two paths never join.
 */
import { haversineMiles } from "../../lib/entities";
import { greatCircleDensify } from "../../lib/geo";
import type { PathStopView } from "../../lib/marks/select";
import { recordKey, type CustomPath, type RecordRef } from "../../lib/marks/types";
import { plateLabel } from "../../lib/tooltip-words/paths";
import { TOUCH_PX } from "../marks/geometry";

/** A saved path or the draft's id: the draft is never sent to the store (it has no id of its own). */
export const DRAFT_ID = "draft";

/** A path switched to the foreground draws at 1; the others dim while the pointer is on one row. */
export const UNCHOSEN_OPACITY = 0.35;
/** The draft, until it is saved. */
export const DRAFT_OPACITY = 0.6;
/** A plate whose every stop lies after the playhead (the app's ahead-of-the-playhead dim); the line stays whole. */
export const AHEAD_OPACITY = 0.45;

// The thresholds of the data's path (`lib/paths.ts`, where they are private), copied: the globe's line
// bends like the data's ribbon does. A gap of LONG_JUMP_MILES or more follows the great circle with
// PTS_PER_1000_MILES points to a thousand miles (at least MIN_ARC_POINTS between the ends); a gap under
// COINCIDENT_MILES adds no point.
export const LONG_JUMP_MILES = 500;
export const COINCIDENT_MILES = 1;
const PTS_PER_1000_MILES = 20;
const MIN_ARC_POINTS = 8;

/**
 * The boxes and strokes of the drawing, in px (no type size: the plates' text is the plate's own).
 * Globe: the plate is anchored `right` at `offsetX`, so it stands left of the record's point, clear of the
 * dot's halo and the investigator's ring; a second path's plate for the same point steps down by `slotStep`.
 * Timeline: the plate's bottom-right corner sits `nudge` up and left of the dot's centre; a second path's
 * plate steps up by `slotStep`.
 */
export const PLATE = {
  globe: { height: 13, minWidth: 13, padX: 3, offsetX: -12, slotStep: 15, lens: 9 },
  // `border` and `gap` are StopPlate's `borderWidth: 1` and `gap-[2px]`. `figure` is one mono 8 px figure or
  // middle dot, an estimate held above the drawn width: the drawn plates measure 11.06 px for one figure and
  // 20.06 px with the lens, so a figure draws at about 5.06 px. An estimate over the truth makes plates join a
  // fraction early, never late. The paths piece keeps its own plate measures beside the marks' (components/marks):
  // the two pieces draw different plates, so neither reads the other's boxes (only the touch distance is shared).
  timeline: { size: 11, padX: 2, nudge: 3, slotStep: 13, lens: 7, border: 1, gap: 2, figure: 5.5 },
} as const;

/** Line widths, dashes and the gap a data dot keeps from the Timeline's line. */
export const LINE = {
  globe: { width: 2, casingWidth: 4, dash: [4, 1.5], hitWidth: 10, opacity: 0.9, casingOpacity: 0.55 },
  // `casingWidth` is the unbroken line in the Timeline panel's own tint that the dashes ride on, so a dash
  // reads against the tint and not against the lane line or a dot's glow under it.
  timeline: { width: 1.5, dash: "6 2", opacity: 0.85, gapRadius: 4, casingWidth: 3.5 },
} as const;

/** A path to draw: the saved path (or the draft as a `CustomPath`-shaped value) and its strength, 0 to 1. */
export interface DrawnPath {
  path: CustomPath;
  op: number;
}

/** A drawn path with its stops as the model's `pathStops` gives them (the caller resolves them). */
export interface DrawnStops extends DrawnPath {
  stops: PathStopView[];
}

/** The part of the session's draft the drawing reads. */
export interface DraftLike {
  name: string;
  stops: readonly RecordRef[];
}

/**
 * The paths to draw, in order: the saved paths as given (seq order), without the hidden ones, then the
 * draft when it holds a stop. A saved path draws at 1, or at 0.35 while another saved path is chosen (the
 * pointer is on its row); the draft draws at 0.6 whatever is chosen. The draft becomes a `CustomPath`-shaped
 * value with id "draft" and seq 0, used for drawing only. Saved paths are not filtered by scenario: the
 * marks store holds the open scenario's paths only.
 */
export function drawnPaths(
  saved: readonly CustomPath[],
  hidden: readonly string[],
  draft: DraftLike | null,
  chosen: string | null,
  scenario: string,
): DrawnPath[] {
  const out: DrawnPath[] = [];
  for (const path of saved) {
    if (hidden.includes(path.id)) continue;
    out.push({ path, op: chosen === null || chosen === path.id ? 1 : UNCHOSEN_OPACITY });
  }
  if (draft !== null && draft.stops.length > 0) {
    out.push({ path: { id: DRAFT_ID, scenario, seq: 0, name: draft.name, stops: [...draft.stops] }, op: DRAFT_OPACITY });
  }
  return out;
}

type LngLat = [number, number];

const lngLatOf = (s: PathStopView): LngLat | null => (s.onGlobe && s.info !== null && s.info.lngLat !== null ? [s.info.lngLat.lng, s.info.lngLat.lat] : null);

/** The stops on the globe, in the order given. Each keeps its own point and number. */
function placed(stops: readonly PathStopView[]): { stop: PathStopView; at: LngLat }[] {
  const out: { stop: PathStopView; at: LngLat }[] = [];
  for (const stop of stops) {
    const at = lngLatOf(stop);
    if (at !== null) out.push({ stop, at });
  }
  return out;
}

/**
 * The points after `a` on the way to `b`: the great circle (without `a`) for a gap of 500 miles or more,
 * `b` alone for a gap of a mile or more, nothing for a gap under a mile (the two stops stand together).
 */
function stepTo(a: LngLat, b: LngLat): LngLat[] {
  // haversineMiles takes [lat, lng]; the map's points are [lng, lat].
  const miles = haversineMiles([a[1], a[0]], [b[1], b[0]]);
  if (miles >= LONG_JUMP_MILES) {
    const between = Math.max(MIN_ARC_POINTS, Math.round((miles / 1000) * PTS_PER_1000_MILES));
    return greatCircleDensify(a, b, between).slice(1);
  }
  return miles >= COINCIDENT_MILES ? [b] : [];
}

/**
 * The globe's line for one path: the points of the stops on the globe (shown and placed), in the stops'
 * order, so a stop with no place or one switched off is skipped and the line runs from the stop before it to
 * the stop after it. A long gap follows the great circle. A line needs two points; one stop gives one point
 * and none gives none, so the caller draws a line only from two. Every longitude is within -180 to 180, so
 * two neighbouring points may lie on either side of the 180 line: `lineFeatures` cuts the line there.
 */
export function globeLine(stops: readonly PathStopView[]): LngLat[] {
  const stopsOnGlobe = placed(stops);
  if (stopsOnGlobe.length === 0) return [];
  const out: LngLat[] = [stopsOnGlobe[0].at];
  for (let i = 1; i < stopsOnGlobe.length; i++) out.push(...stepTo(stopsOnGlobe[i - 1].at, stopsOnGlobe[i].at));
  return out;
}

/** Web Mercator's y for a latitude in degrees, and the latitude for a y: the map draws the step between two points straight on this scale. */
const mercatorY = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latitudeOf = (y: number): number => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;

/**
 * A line as the pieces the map can draw. Two neighbouring points whose longitudes differ by more than 180
 * degrees lie on either side of the 180 line, and the map would join them the long way, round the world:
 * it places a longitude at lng / 360 + 0.5 of the world's width and does not wrap. There the line is cut.
 * The piece ends on the 180 line on its own side, and the next piece starts on the 180 line on the other
 * side, at one latitude: the latitude where the straight step between the two points meets the 180 line
 * on the map's own vertical scale, so the two pieces are one straight line on the map, between 85.0511
 * degrees south and north, the range the map draws; beyond that the map flattens every latitude to that
 * edge. A line that never crosses comes back as one piece holding the points given. Every longitude stays
 * within -180 to 180.
 */
// shortcut: a stop at exactly 180 or -180 can yield a piece of one place, which the map does not draw; drop such pieces if a story ever holds one.
function cutAt180(points: readonly LngLat[]): LngLat[][] {
  const pieces: LngLat[][] = [[]];
  for (const p of points) {
    const piece = pieces[pieces.length - 1];
    const prev = piece[piece.length - 1];
    if (prev === undefined || Math.abs(p[0] - prev[0]) <= 180) {
      piece.push(p);
      continue;
    }
    const edge = prev[0] < 0 ? -180 : 180; // the 180 line on the side the line leaves from
    const t = (edge - prev[0]) / (p[0] + 2 * edge - prev[0]); // how far along the step the 180 line lies
    const y = mercatorY(prev[1]) + t * (mercatorY(p[1]) - mercatorY(prev[1]));
    // With no one crossing (both points on the 180 line itself, or one at a pole) the cut keeps the latitude it leaves from.
    const lat = Number.isFinite(y) ? latitudeOf(y) : prev[1];
    piece.push([edge, lat]);
    pieces.push([[-edge, lat], p]);
  }
  return pieces;
}

/**
 * Whether a stop lies after the playhead: its record has a time, the playhead's bounds have loaded
 * (`windowed`), and the time is strictly later (a stop at the playhead's own time is reached). A stop with
 * no time, or no record, is never ahead.
 */
export function isAhead(stop: PathStopView, playhead: number, windowed: boolean): boolean {
  const time = stop.info === null ? null : stop.info.time;
  return windowed && time !== null && time > playhead;
}

/** One numbered plate on the globe: one point of one path, with the stops that stand there. */
export interface GlobePlate {
  /** Unique among the plates drawn: the path and the point. */
  key: string;
  pathId: string;
  pathName: string;
  /** The number of stops the path holds (shown or not), for the plate's words. */
  total: number;
  /** The path's strength, 0 to 1. */
  op: number;
  /** The numbers of the stops at this point, ascending (more than one for stops at equal coordinates). */
  nums: number[];
  /** Those stops, in the same order: a press navigates with the first one's `info.match`. */
  stops: PathStopView[];
  lngLat: { lng: number; lat: number };
  /** 0 for the first path with a plate at this point, then 1, 2 and so on, in the order the paths came. */
  slot: number;
  /** The marker's offset from the point, in px: left of it, stepping down by a slot. */
  offset: [number, number];
  /** The plate with the path's lowest drawn number carries the lens, so every path drawn carries the mark once. */
  lens: boolean;
  /** Every stop here is later than the playhead (see `isAhead`). */
  ahead: boolean;
}

/**
 * The globe's plates for the paths to draw, in the order given and, within a path, by the first stop's
 * number. A stop not drawn (no place, not shown, not found) makes no plate and keeps its number out of the
 * way: the others keep theirs. Stops of one path at exactly equal coordinates share a plate (a deliberate
 * limit: places close but not equal are not merged, so their plates may overlap at a far zoom and spread
 * when the map is zoomed). Plates of different paths at one point step down by a slot, so each stays
 * readable and pressable.
 */
export function globePlates(items: readonly DrawnStops[], playhead: number, windowed: boolean): GlobePlate[] {
  const out: GlobePlate[] = [];
  const taken = new Map<string, number>(); // point -> how many earlier paths drew a plate there
  for (const { path, op, stops } of items) {
    const here = placed(stops);
    if (here.length === 0) continue;
    const groups = new Map<string, { at: LngLat; stops: PathStopView[] }>();
    for (const { stop, at } of here) {
      const point = `${at[0]},${at[1]}`;
      const group = groups.get(point);
      if (group) group.stops.push(stop);
      else groups.set(point, { at, stops: [stop] });
    }
    const lowest = Math.min(...here.map((h) => h.stop.n));
    for (const [point, group] of groups) {
      const slot = taken.get(point) ?? 0;
      const nums = group.stops.map((s) => s.n).sort((a, b) => a - b);
      out.push({
        key: `${path.id}|${point}`,
        pathId: path.id,
        pathName: path.name,
        total: path.stops.length,
        op,
        nums,
        stops: group.stops,
        lngLat: { lng: group.at[0], lat: group.at[1] },
        slot,
        offset: [PLATE.globe.offsetX, PLATE.globe.slotStep * slot],
        lens: nums[0] === lowest,
        ahead: group.stops.every((s) => isAhead(s, playhead, windowed)),
      });
    }
    for (const point of groups.keys()) taken.set(point, (taken.get(point) ?? 0) + 1);
  }
  return out;
}

export interface RunProps {
  role: "run";
  pathId: string;
  name: string;
  op: number;
}
export interface SegProps {
  role: "seg";
  pathId: string;
  name: string;
  /** The numbers of the two stops the stretch joins (across a skipped stop, 1 and 3). */
  from: number;
  to: number;
  op: number;
}
export type LineFeature = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString, RunProps | SegProps>;
export interface PlateProps {
  role: "plate";
  pathId: string;
  slot: number;
}
export type PlateFeature = GeoJSON.Feature<GeoJSON.Point, PlateProps>;

/** One feature for a line: a LineString, or the MultiLineString of its pieces when it crosses the 180 line. */
const line = (points: LngLat[], properties: RunProps | SegProps): LineFeature => {
  const pieces = cutAt180(points);
  return {
    type: "Feature",
    geometry: pieces.length === 1 ? { type: "LineString", coordinates: pieces[0] } : { type: "MultiLineString", coordinates: pieces },
    properties,
  };
};

/**
 * The line's features, for one source: for each path with two points or more on the globe, one `run`
 * (the whole line: the line layer and its casing read it) and one `seg` for each stretch between two
 * stops on the globe (the hover's invisible layer reads them, so a hover can name the two stops). A stretch
 * of under a mile has no points to draw and makes no `seg`. Properties are primitives only. A line that
 * crosses the 180 line is cut there (`cutAt180`) and comes as the MultiLineString of its pieces; any other
 * comes as a LineString.
 */
export function lineFeatures(items: readonly DrawnStops[]): LineFeature[] {
  const out: LineFeature[] = [];
  for (const { path, op, stops } of items) {
    const whole = globeLine(stops);
    if (whole.length < 2) continue;
    out.push(line(whole, { role: "run", pathId: path.id, name: path.name, op }));
    const here = placed(stops);
    for (let i = 1; i < here.length; i++) {
      const points: LngLat[] = [here[i - 1].at, ...stepTo(here[i - 1].at, here[i].at)];
      if (points.length < 2) continue;
      out.push(line(points, { role: "seg", pathId: path.id, name: path.name, from: here[i - 1].stop.n, to: here[i].stop.n, op }));
    }
  }
  return out;
}

/**
 * The clearance layer's features: a point at each plate that is first at its point (slot 0), so a basemap
 * label that would sit under a plate gives way to it. A plate stacked below another needs no clearance of
 * its own, and none would be found there.
 */
export function plateFeatures(plates: readonly GlobePlate[]): PlateFeature[] {
  return plates
    .filter((p) => p.slot === 0)
    .map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lngLat.lng, p.lngLat.lat] },
      properties: { role: "plate", pathId: p.pathId, slot: p.slot },
    }));
}
/** A point of the Timeline's track, in percent of its box: x across the window, y down the lanes. */
export interface TrackPoint {
  x: number;
  y: number;
}

/** One numbered plate on the Timeline's track: one stop (stops are not merged here). */
export interface TimelinePlate {
  /** Unique among the plates drawn: the path and the stop's number. */
  key: string;
  pathId: string;
  pathName: string;
  total: number;
  op: number;
  n: number;
  /** The stop, for the plate's words and a press (`info.match`) and for `isAhead`. */
  stop: PathStopView;
  x: number;
  y: number;
  /** 0 for the first path with a plate at this point of the track, then 1, 2, in the order the paths came. */
  slot: number;
  /** The plate's lift in px, from the dot: negative, a step up for each slot. */
  offsetY: number;
  lens: boolean;
}

/** One path on the track: its line's points (every stop with a time) and the plates inside the window. */
export interface TimelinePath {
  pathId: string;
  pathName: string;
  total: number;
  op: number;
  /** Every shown stop with a time, in the stops' order; x may lie outside 0 to 100 (the line is clipped by its box). */
  points: TrackPoint[];
  /** The lowest and highest x of `points`, or null with none. */
  xRange: { min: number; max: number } | null;
  plates: TimelinePlate[];
}

/**
 * The Timeline's geometry for the paths to draw. A shown stop with a time is a point of the line at
 * x = (time - windowMin) / span * 100 and y = the lane of its drawn kind (`laneOf`, the dot's own rule: a
 * kind with no lane takes the track's middle). A plate is drawn only for a stop whose x lies in the window,
 * 0 to 100. The plate with the path's lowest drawn number carries the lens. A plate of another path at the
 * same point of the track steps up by a slot (a deliberate limit: a plate hides the dot of a record that
 * stands exactly beneath another path's plate). Each stop keeps its own plate here; the caller joins the
 * ones that touch (`joinTimelinePlates`), since that needs the track's size in px. With no span (the
 * playhead's window has not loaded) nothing is drawn.
 */
export function timelineGeometry(
  items: readonly DrawnStops[],
  windowMin: number,
  span: number,
  laneOf: (kind: string) => number,
): TimelinePath[] {
  if (!(span > 0)) return [];
  const out: TimelinePath[] = [];
  const taken = new Map<string, number>(); // point -> how many earlier paths drew a plate there
  for (const { path, op, stops } of items) {
    const points: TrackPoint[] = [];
    const drawn: { stop: PathStopView; x: number; y: number }[] = [];
    for (const stop of stops) {
      if (!stop.onTimeline || stop.info === null || stop.info.time === null) continue;
      const x = ((stop.info.time - windowMin) / span) * 100;
      const y = laneOf(stop.info.draw.kind);
      points.push({ x, y });
      if (x >= 0 && x <= 100) drawn.push({ stop, x, y });
    }
    const lowest = drawn.length === 0 ? 0 : Math.min(...drawn.map((d) => d.stop.n));
    const plates: TimelinePlate[] = drawn.map(({ stop, x, y }) => {
      const slot = taken.get(`${x},${y}`) ?? 0;
      return {
        key: `${path.id}|${stop.n}`,
        pathId: path.id,
        pathName: path.name,
        total: path.stops.length,
        op,
        n: stop.n,
        stop,
        x,
        y,
        slot,
        offsetY: slot === 0 ? 0 : -PLATE.timeline.slotStep * slot,
        lens: stop.n === lowest,
      };
    });
    for (const point of new Set(drawn.map((d) => `${d.x},${d.y}`))) taken.set(point, (taken.get(point) ?? 0) + 1);
    const xs = points.map((p) => p.x);
    out.push({
      pathId: path.id,
      pathName: path.name,
      total: path.stops.length,
      op,
      points,
      xRange: xs.length === 0 ? null : { min: Math.min(...xs), max: Math.max(...xs) },
      plates,
    });
  }
  return out;
}

/**
 * The width of a Timeline plate in px, estimated from its parts: the border on both sides, the padding on
 * both sides, the lens and the gap after it when it has one, and one figure's width for each character of
 * its label (a figure or the middle dot), never under the plate's own 11 px floor.
 */
export function timelinePlateWidth(nums: readonly number[], lens: boolean): number {
  const t = PLATE.timeline;
  return Math.max(t.size, 2 * t.border + 2 * t.padX + (lens ? t.lens + t.gap : 0) + plateLabel(nums).length * t.figure);
}

/** One plate on the track after the join: one or more plates of one path that would touch. */
export interface TimelineGroup {
  /** The plate's own key for a single plate, else `<pathId>|<the numbers joined by "+">`. */
  key: string;
  pathId: string;
  pathName: string;
  total: number;
  op: number;
  /** The stop numbers it reads, ascending. */
  nums: number[];
  /** Those stops, in the same order (a press goes to the first, the lowest number). */
  stops: PathStopView[];
  /** Where it stands: the place of its first member, the leftmost (on equal x the lowest number), where a single plate stands alone. */
  x: number;
  y: number;
  offsetY: number;
  /** How far the joined plate reaches to the right of that first member's own plate, in px (0 for a single plate). */
  grow: number;
  /** One of its plates carried the lens. */
  lens: boolean;
}

/** A group's box in px from the track's top left. */
interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The members of a group in join order: by x, then by number. */
const byPlace = (a: TimelinePlate, b: TimelinePlate): number => a.x - b.x || a.n - b.n;

/**
 * What a group of plates is: its numbers (ascending), whether it carries the lens, how far it grows to the
 * right of its first member's own plate, and its box. The box keeps the left edge its first member has on
 * its own (the right edge hangs `nudge` left of the member's point, as a single plate's does) and reaches
 * right as far as the group's estimated width, so a joined plate never stands further left than a single
 * plate does. The vertical place is the first member's (a deliberate limit: members on other lanes are
 * judged by the first member's lane).
 */
function shapeOf(members: readonly TimelinePlate[], track: { width: number; height: number }) {
  const first = members[0];
  const nums = members.map((m) => m.n).sort((a, b) => a - b);
  const lens = members.some((m) => m.lens);
  const width = timelinePlateWidth(nums, lens);
  const grow = width - timelinePlateWidth([first.n], first.lens);
  const right = (first.x * track.width) / 100 - PLATE.timeline.nudge + grow;
  const bottom = (first.y * track.height) / 100 - PLATE.timeline.nudge + first.offsetY;
  const box: Box = { left: right - width, right, top: bottom - PLATE.timeline.size, bottom };
  return { nums, lens, grow, box };
}

/** Whether two boxes come within `TOUCH_PX` of each other on both axes (a gap of exactly `TOUCH_PX` is apart). */
const touch = (a: Box, b: Box): boolean =>
  a.left < b.right + TOUCH_PX && b.left < a.right + TOUCH_PX && a.top < b.bottom + TOUCH_PX && b.top < a.bottom + TOUCH_PX;

/**
 * Joins the plates of ONE path that touch on a track of the given size in px (the caller gives one path's
 * plates at a time, so plates of two paths never join). Each plate starts as a group of its own, in the order
 * given. Until the track has a width and a height (it is not measured yet) that is the result. After that the
 * first pair of groups, in the groups' order, whose boxes touch is merged (the later group into the earlier,
 * the members sorted again by x, then by number) and the search starts again from the start, so a group that
 * has grown and now touches another merges again. A plate of one stop comes out with its own key, place and
 * lens. Quadratic in the number of plates, which a path caps (`MARK_LIMITS`): a deliberate limit.
 */
export function joinTimelinePlates(plates: readonly TimelinePlate[], track: { width: number; height: number }): TimelineGroup[] {
  const groups: TimelinePlate[][] = plates.map((p) => [p]);
  if (track.width > 0 && track.height > 0) {
    for (let again = true; again; ) {
      again = false;
      const boxes = groups.map((g) => shapeOf(g, track).box);
      for (let i = 0; i < groups.length && !again; i++) {
        for (let j = i + 1; j < groups.length && !again; j++) {
          if (!touch(boxes[i], boxes[j])) continue;
          groups[i] = [...groups[i], ...groups[j]].sort(byPlace);
          groups.splice(j, 1);
          again = true;
        }
      }
    }
  }
  return groups.map((members) => {
    const first = members[0];
    const { nums, lens, grow } = shapeOf(members, track);
    const byNumber = [...members].sort((a, b) => a.n - b.n);
    return {
      key: members.length === 1 ? first.key : `${first.pathId}|${nums.join("+")}`,
      pathId: first.pathId,
      pathName: first.pathName,
      total: first.total,
      op: first.op,
      nums,
      stops: byNumber.map((m) => m.stop),
      x: first.x,
      y: first.y,
      offsetY: first.offsetY,
      grow,
      lens,
    };
  });
}

/** The canonical record keys of a path's stops: what `gapDots` leaves out. */
export function stopKeysOf(path: CustomPath): Set<string> {
  return new Set(path.stops.map(recordKey));
}

/**
 * The data dots a path's line should leave a gap round: each tick that is not one of the path's stops and
 * lies between the path's first and last stop (`xMin` to `xMax`, ends included). A tick's kind may be
 * "fraud" where the stop is saved as "auth": both compare by `recordKey`. The gap itself is a circle of
 * `LINE.timeline.gapRadius` px, drawn by the Timeline part.
 */
export function gapDots(
  ticks: readonly { id: string; kind: string; pct: number }[],
  stopKeys: ReadonlySet<string>,
  laneOf: (kind: string) => number,
  xMin: number,
  xMax: number,
): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const t of ticks) {
    if (t.pct < xMin || t.pct > xMax || stopKeys.has(recordKey({ kind: t.kind, id: t.id }))) continue;
    out.push({ x: t.pct, y: laneOf(t.kind) });
  }
  return out;
}

/**
 * One character for each stop with a time: "1" when the stop is after the playhead, else "0" ("0" for all
 * before the bounds load). The drawing reads the playhead only through this string, so it redraws when the
 * playhead crosses a stop's time and not between two crossings.
 */
export function aheadKey(stops: readonly PathStopView[], playhead: number, windowed: boolean): string {
  let key = "";
  for (const stop of stops) {
    if (stop.info === null || stop.info.time === null) continue;
    key += isAhead(stop, playhead, windowed) ? "1" : "0";
  }
  return key;
}
