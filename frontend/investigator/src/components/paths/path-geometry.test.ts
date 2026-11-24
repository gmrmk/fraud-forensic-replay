/**
 * The pure geometry of the investigator's paths: which paths are drawn and how strongly, the globe's
 * line and plates, and the Timeline's line, plates and gaps. Stops are built by hand as the model's
 * `PathStopView` (no store, no lookup, no map). Coordinates are asymmetric on purpose (longitude and
 * latitude differ everywhere), so a swapped pair fails a test.
 */
import { describe, expect, it } from "vitest";
import { haversineMiles } from "../../lib/entities";
import { greatCircleDensify } from "../../lib/geo";
import type { PathStopView } from "../../lib/marks/select";
import type { CustomPath } from "../../lib/marks/types";
import { infoOf, makePath } from "../../lib/notes/test-fixtures";
import {
  aheadKey,
  gapDots,
  stopKeysOf,
  timelineGeometry,
  AHEAD_OPACITY,
  COINCIDENT_MILES,
  DRAFT_ID,
  DRAFT_OPACITY,
  LINE,
  LONG_JUMP_MILES,
  PLATE,
  UNCHOSEN_OPACITY,
  drawnPaths,
  globeLine,
  globePlates,
  isAhead,
  joinTimelinePlates,
  lineFeatures,
  plateFeatures,
  timelinePlateWidth,
  type DrawnPath,
  type DrawnStops,
  type LineFeature,
  type TimelinePlate,
} from "./path-geometry";

const HOUSTON = { lng: -95.37, lat: 29.76 };
const KATY = { lng: -95.82, lat: 29.79 };
const DALLAS = { lng: -96.8, lat: 32.78 };
const OKC = { lng: -97.52, lat: 35.47 };
const LA = { lng: -118.24, lat: 34.05 };
const KC = { lng: -94.58, lat: 39.1 };

interface StopOpts {
  at?: { lng: number; lat: number } | null;
  time?: number | null;
  kind?: string;
  shown?: boolean;
  found?: boolean;
}

/** One stop as the model's `pathStops` would give it. */
function stop(n: number, o: StopOpts = {}): PathStopView {
  const { at = HOUSTON, time = 1000 * n, kind = "auth", shown = true, found = true } = o;
  const record = { kind, id: `rec-${n}` };
  if (!found) return { record, n, info: null, shown: false, onGlobe: false, onTimeline: false };
  const info = infoOf({
    kind,
    lngLat: at,
    time,
    draw: { kind, id: record.id, timestamp: time ?? 0, fields: {} },
  });
  return { record, n, info, shown, onGlobe: shown && at !== null, onTimeline: shown && time !== null };
}

const path = (over: Partial<CustomPath> = {}): CustomPath => makePath(over);

describe("drawnPaths", () => {
  const p1 = path({ id: "path-1".padEnd(37, "0"), seq: 1, name: "Path 1" });
  const p2 = path({ id: "path-2".padEnd(37, "0"), seq: 2, name: "Path 2" });
  const p3 = path({ id: "path-3".padEnd(37, "0"), seq: 3, name: "Path 3" });
  const ids = (d: DrawnPath[]) => d.map((x) => x.path.id);

  it("keeps the saved paths in the order given, each at full strength, with nothing chosen", () => {
    const out = drawnPaths([p1, p2, p3], [], null, null, "card-fraud");
    expect(ids(out)).toEqual([p1.id, p2.id, p3.id]);
    expect(out.map((x) => x.op)).toEqual([1, 1, 1]);
  });

  it("drops every hidden id", () => {
    expect(ids(drawnPaths([p1, p2, p3], [p2.id], null, null, "card-fraud"))).toEqual([p1.id, p3.id]);
    expect(drawnPaths([p1], [p1.id], null, null, "card-fraud")).toEqual([]);
  });

  it("draws the chosen path at full and every other saved path at 0.35", () => {
    const out = drawnPaths([p1, p2, p3], [], null, p2.id, "card-fraud");
    expect(out.map((x) => x.op)).toEqual([UNCHOSEN_OPACITY, 1, UNCHOSEN_OPACITY]);
    expect(UNCHOSEN_OPACITY).toBe(0.35);
  });

  it("dims the others even when the chosen path is hidden, and a chosen id no path holds dims all", () => {
    expect(drawnPaths([p1, p2], [p2.id], null, p2.id, "card-fraud").map((x) => x.op)).toEqual([UNCHOSEN_OPACITY]);
    expect(drawnPaths([p1], [], null, "path-gone", "card-fraud").map((x) => x.op)).toEqual([UNCHOSEN_OPACITY]);
  });

  it("appends the draft last, as a path with id draft and seq 0, at 0.6, when it holds a stop", () => {
    const draft = { name: "Path 4", stops: [{ kind: "auth", id: "tx-1" }] };
    const out = drawnPaths([p1, p2], [], draft, null, "card-fraud");
    expect(ids(out)).toEqual([p1.id, p2.id, DRAFT_ID]);
    const last = out[2];
    expect(last.op).toBe(DRAFT_OPACITY);
    expect(DRAFT_OPACITY).toBe(0.6);
    expect(last.path).toEqual({ id: "draft", scenario: "card-fraud", seq: 0, name: "Path 4", stops: draft.stops });
  });

  it("leaves the draft out with no stop, and keeps it at 0.6 whatever is chosen", () => {
    expect(drawnPaths([p1], [], { name: "Path 2", stops: [] }, null, "card-fraud")).toHaveLength(1);
    const draft = { name: "Path 2", stops: [{ kind: "auth", id: "tx-1" }] };
    const out = drawnPaths([p1], [], draft, p1.id, "card-fraud");
    expect(out.map((x) => x.op)).toEqual([1, DRAFT_OPACITY]);
  });

  it("does not share the draft's stops array with the drawn path", () => {
    const stops = [{ kind: "auth", id: "tx-1" }];
    const out = drawnPaths([], [], { name: "Path 1", stops }, null, "card-fraud");
    stops.push({ kind: "auth", id: "tx-2" });
    expect(out[0].path.stops).toHaveLength(1);
  });
});

describe("globeLine", () => {
  const pt = (c: { lng: number; lat: number }): [number, number] => [c.lng, c.lat];

  it("takes only the stops on the globe, in the stops' order: 1, 3, 4 when stop 2 has no place", () => {
    const stops = [stop(1, { at: HOUSTON }), stop(2, { at: null }), stop(3, { at: KATY }), stop(4, { at: DALLAS })];
    expect(globeLine(stops)).toEqual([pt(HOUSTON), pt(KATY), pt(DALLAS)]);
  });

  it("skips a stop that is not shown, or not found, exactly as it skips one with no place", () => {
    const stops = [stop(1, { at: HOUSTON }), stop(2, { at: OKC, shown: false }), stop(3, { at: DALLAS })];
    expect(globeLine(stops)).toEqual([pt(HOUSTON), pt(DALLAS)]);
    expect(globeLine([stop(1, { at: HOUSTON }), stop(2, { found: false }), stop(3, { at: DALLAS })])).toEqual([pt(HOUSTON), pt(DALLAS)]);
  });

  it("follows the order given, not the numbers' order", () => {
    const stops = [stop(1, { at: DALLAS }), stop(2, { at: HOUSTON })];
    expect(globeLine(stops)).toEqual([pt(DALLAS), pt(HOUSTON)]);
  });

  it("draws a gap under 500 miles as one straight step", () => {
    const miles = haversineMiles([HOUSTON.lat, HOUSTON.lng], [OKC.lat, OKC.lng]);
    expect(miles).toBeGreaterThan(300);
    expect(miles).toBeLessThan(LONG_JUMP_MILES);
    expect(globeLine([stop(1, { at: HOUSTON }), stop(2, { at: OKC })])).toEqual([pt(HOUSTON), pt(OKC)]);
  });

  it("densifies a gap of 500 miles or more along the great circle, max(8, round(miles / 1000 * 20)) points between", () => {
    const miles = haversineMiles([HOUSTON.lat, HOUSTON.lng], [LA.lat, LA.lng]);
    expect(miles).toBeGreaterThanOrEqual(LONG_JUMP_MILES);
    const inner = Math.max(8, Math.round((miles / 1000) * 20));
    const line = globeLine([stop(1, { at: HOUSTON }), stop(2, { at: LA })]);
    expect(line).toEqual(greatCircleDensify(pt(HOUSTON), pt(LA), inner));
    expect(line).toHaveLength(inner + 2);
  });

  it("densifies the shortest long gap too (about 640 miles); the floor of 8 never binds above 400 miles, so it is a safeguard only", () => {
    const miles = haversineMiles([HOUSTON.lat, HOUSTON.lng], [KC.lat, KC.lng]);
    expect(miles).toBeGreaterThanOrEqual(LONG_JUMP_MILES);
    const line = globeLine([stop(1, { at: HOUSTON }), stop(2, { at: KC })]);
    expect(line).toEqual(greatCircleDensify(pt(HOUSTON), pt(KC), Math.round((miles / 1000) * 20)));
  });

  it("adds no point for a gap under 1 mile, and keeps the line's two ends", () => {
    const near = { lng: HOUSTON.lng + 0.0005, lat: HOUSTON.lat + 0.0003 };
    expect(haversineMiles([HOUSTON.lat, HOUSTON.lng], [near.lat, near.lng])).toBeLessThan(COINCIDENT_MILES);
    expect(globeLine([stop(1, { at: HOUSTON }), stop(2, { at: near }), stop(3, { at: KATY })])).toEqual([pt(HOUSTON), pt(KATY)]);
    expect(globeLine([stop(1, { at: HOUSTON }), stop(2, { at: near })])).toEqual([pt(HOUSTON)]);
  });

  it("measures a gap from the last stop that is on the globe, across a skipped one", () => {
    const stops = [stop(1, { at: HOUSTON }), stop(2, { at: null }), stop(3, { at: LA })];
    expect(globeLine(stops)).toEqual(globeLine([stop(1, { at: HOUSTON }), stop(2, { at: LA })]));
  });

  it("gives one point for one stop on the globe, and none for none", () => {
    expect(globeLine([stop(1, { at: HOUSTON }), stop(2, { at: null })])).toEqual([pt(HOUSTON)]);
    expect(globeLine([stop(1, { at: null }), stop(2, { shown: false })])).toEqual([]);
    expect(globeLine([])).toEqual([]);
  });

  it("holds the thresholds of the data's path, as constants", () => {
    expect(LONG_JUMP_MILES).toBe(500);
    expect(COINCIDENT_MILES).toBe(1);
    expect(AHEAD_OPACITY).toBe(0.45);
  });
});
/** A drawn path with its stops; the path's own stops list is as long as the views, so `total` is right. */
function item(id: string, name: string, stops: PathStopView[], op = 1): DrawnStops {
  const p = path({ id, name, stops: stops.map((s) => s.record) });
  return { path: p, op, stops };
}
const IDA = "path-a".padEnd(37, "0");
const IDB = "path-b".padEnd(37, "0");

describe("globePlates", () => {
  it("gives one plate per drawn place and keeps the stop numbers: 1, 3, 4 when stop 2 has no place", () => {
    const stops = [stop(1, { at: HOUSTON }), stop(2, { at: null }), stop(3, { at: KATY }), stop(4, { at: DALLAS })];
    const plates = globePlates([item(IDA, "Path 1", stops)], 0, false);
    expect(plates.map((p) => p.nums)).toEqual([[1], [3], [4]]);
    expect(plates.map((p) => p.lngLat)).toEqual([HOUSTON, KATY, DALLAS]);
    expect(plates.every((p) => p.slot === 0 && p.pathId === IDA && p.pathName === "Path 1" && p.total === 4 && p.op === 1)).toBe(true);
    expect(plates.every((p) => p.offset[0] === -12 && p.offset[1] === 0)).toBe(true);
  });

  it("skips a stop that is not shown or not found, and keeps the numbers of the others", () => {
    const stops = [stop(1), stop(2, { at: KATY, shown: false }), stop(3, { found: false }), stop(4, { at: DALLAS })];
    expect(globePlates([item(IDA, "Path 1", stops)], 0, false).map((p) => p.nums)).toEqual([[1], [4]]);
  });

  it("merges two stops of one path at equal coordinates into one plate, numbers 1 and 3", () => {
    const stops = [stop(1, { at: HOUSTON }), stop(2, { at: DALLAS }), stop(3, { at: { ...HOUSTON } }), stop(4, { at: KATY })];
    const plates = globePlates([item(IDA, "Path 1", stops)], 0, false);
    expect(plates.map((p) => p.nums)).toEqual([[1, 3], [2], [4]]);
    expect(plates[0].stops.map((s) => s.n)).toEqual([1, 3]);
    expect(plates[0].lngLat).toEqual(HOUSTON);
  });

  it("does not merge records at close but unequal coordinates", () => {
    const close = { lng: HOUSTON.lng, lat: HOUSTON.lat + 0.0000001 };
    const plates = globePlates([item(IDA, "Path 1", [stop(1, { at: HOUSTON }), stop(2, { at: close })])], 0, false);
    expect(plates.map((p) => p.nums)).toEqual([[1], [2]]);
  });

  it("puts the lens on the plate holding the lowest drawn number of each path, and on no other", () => {
    const a = item(IDA, "Path 1", [stop(1, { at: HOUSTON }), stop(2, { at: DALLAS }), stop(3, { at: { ...HOUSTON } })]);
    const b = item(IDB, "Path 2", [stop(1, { at: null }), stop(2, { at: KATY }), stop(3, { at: OKC })]);
    const plates = globePlates([a, b], 0, false);
    const lensed = plates.filter((p) => p.lens).map((p) => [p.pathId, p.nums]);
    expect(lensed).toEqual([
      [IDA, [1, 3]],
      [IDB, [2]],
    ]);
  });

  it("stacks the plates of one record in two paths by slot, in the order given (the draft last)", () => {
    const first = item(IDA, "Path 1", [stop(1, { at: HOUSTON }), stop(2, { at: DALLAS })]);
    const second = item(IDB, "Path 2", [stop(1, { at: DALLAS }), stop(2, { at: HOUSTON })]);
    const draft = item(DRAFT_ID, "Path 3", [stop(1, { at: HOUSTON })], DRAFT_OPACITY);
    const plates = globePlates([first, second, draft], 0, false);
    const at = (pathId: string, lng: number) => plates.find((p) => p.pathId === pathId && p.lngLat.lng === lng);
    expect([at(IDA, HOUSTON.lng)?.slot, at(IDB, HOUSTON.lng)?.slot, at(DRAFT_ID, HOUSTON.lng)?.slot]).toEqual([0, 1, 2]);
    // Both paths stop at Dallas too, so the second steps down there; a point only one path uses stays at 0.
    expect([at(IDA, DALLAS.lng)?.slot, at(IDB, DALLAS.lng)?.slot]).toEqual([0, 1]);
    const alone = globePlates([item(IDA, "Path 1", [stop(1, { at: KATY })]), item(IDB, "Path 2", [stop(1, { at: OKC })])], 0, false);
    expect(alone.map((p) => p.slot)).toEqual([0, 0]);
    expect(at(IDB, HOUSTON.lng)?.offset).toEqual([-12, 15]);
    expect(at(DRAFT_ID, HOUSTON.lng)?.offset).toEqual([-12, 30]);
    expect(at(DRAFT_ID, HOUSTON.lng)?.op).toBe(DRAFT_OPACITY);
  });

  it("gives a merged plate one slot, not one for each of its stops", () => {
    const first = item(IDA, "Path 1", [stop(1, { at: HOUSTON }), stop(2, { at: { ...HOUSTON } })]);
    const second = item(IDB, "Path 2", [stop(1, { at: HOUSTON })]);
    const plates = globePlates([first, second], 0, false);
    expect(plates.map((p) => [p.pathId, p.slot])).toEqual([
      [IDA, 0],
      [IDB, 1],
    ]);
  });

  it("marks a plate ahead only when every one of its stops is later than the playhead and the bounds are loaded", () => {
    const stops = [stop(1, { at: HOUSTON, time: 1000 }), stop(2, { at: DALLAS, time: 2000 }), stop(3, { at: KATY, time: 3000 })];
    const plates = globePlates([item(IDA, "Path 1", stops)], 1500, true);
    expect(plates.map((p) => p.ahead)).toEqual([false, true, true]);
    expect(globePlates([item(IDA, "Path 1", stops)], 1500, false).map((p) => p.ahead)).toEqual([false, false, false]);
  });

  it("does not mark a plate ahead at the playhead's own time, nor a merged plate with one reached stop, nor an untimed stop", () => {
    const equal = globePlates([item(IDA, "Path 1", [stop(1, { at: HOUSTON, time: 2000 })])], 2000, true);
    expect(equal[0].ahead).toBe(false);
    const merged = [stop(1, { at: HOUSTON, time: 1000 }), stop(2, { at: { ...HOUSTON }, time: 5000 })];
    expect(globePlates([item(IDA, "Path 1", merged)], 2000, true)[0].ahead).toBe(false);
    const untimed = globePlates([item(IDA, "Path 1", [stop(1, { at: HOUSTON, time: null })])], 2000, true);
    expect(untimed[0].ahead).toBe(false);
  });

  it("makes no plate for a path with no stop on the globe", () => {
    expect(globePlates([item(IDA, "Path 1", [stop(1, { at: null }), stop(2, { at: null })])], 0, false)).toEqual([]);
    expect(globePlates([], 0, false)).toEqual([]);
  });
});

describe("isAhead", () => {
  it("is true for a stop strictly later than the playhead, and only once the bounds are loaded", () => {
    expect(isAhead(stop(1, { time: 2001 }), 2000, true)).toBe(true);
    expect(isAhead(stop(1, { time: 2000 }), 2000, true)).toBe(false);
    expect(isAhead(stop(1, { time: 2001 }), 2000, false)).toBe(false);
    expect(isAhead(stop(1, { time: null }), 0, true)).toBe(false);
    expect(isAhead(stop(1, { found: false }), 0, true)).toBe(false);
  });
});

describe("lineFeatures", () => {
  const stops = [stop(1, { at: HOUSTON }), stop(2, { at: null }), stop(3, { at: KATY }), stop(4, { at: DALLAS })];

  it("gives one run feature for each path with two points or more, for the line and its casing", () => {
    const features = lineFeatures([item(IDA, "Path 1", stops, 0.35)]);
    const runs = features.filter((f) => f.properties.role === "run");
    expect(runs).toHaveLength(1);
    expect(runs[0].geometry.coordinates).toEqual(globeLine(stops));
    expect(runs[0].properties).toEqual({ role: "run", pathId: IDA, name: "Path 1", op: 0.35 });
  });

  it("gives one seg feature for each stretch between two stops on the globe, named by the stops it joins", () => {
    const segs = lineFeatures([item(IDA, "Path 1", stops)]).filter((f) => f.properties.role === "seg");
    expect(segs.map((f) => f.properties)).toEqual([
      { role: "seg", pathId: IDA, name: "Path 1", from: 1, to: 3, op: 1 },
      { role: "seg", pathId: IDA, name: "Path 1", from: 3, to: 4, op: 1 },
    ]);
    expect(segs[0].geometry.coordinates).toEqual([
      [HOUSTON.lng, HOUSTON.lat],
      [KATY.lng, KATY.lat],
    ]);
  });

  it("follows the great circle in a seg across a long gap, the same points as the run", () => {
    const pair = [stop(1, { at: HOUSTON }), stop(2, { at: LA })];
    const features = lineFeatures([item(IDA, "Path 1", pair)]);
    const run = features.find((f) => f.properties.role === "run");
    const seg = features.find((f) => f.properties.role === "seg");
    expect(seg?.geometry.coordinates).toEqual(run?.geometry.coordinates);
    expect(run?.geometry.coordinates.length).toBeGreaterThan(20);
  });

  it("makes no feature of fewer than two points: one stop on the globe, or stops under a mile apart", () => {
    expect(lineFeatures([item(IDA, "Path 1", [stop(1, { at: HOUSTON }), stop(2, { at: null })])])).toEqual([]);
    const near = { lng: HOUSTON.lng + 0.0005, lat: HOUSTON.lat + 0.0003 };
    expect(lineFeatures([item(IDA, "Path 1", [stop(1, { at: HOUSTON }), stop(2, { at: near })])])).toEqual([]);
  });

  it("leaves a collapsed stretch out of the segs and keeps the run whole", () => {
    const near = { lng: HOUSTON.lng + 0.0005, lat: HOUSTON.lat + 0.0003 };
    const features = lineFeatures([item(IDA, "Path 1", [stop(1, { at: HOUSTON }), stop(2, { at: near }), stop(3, { at: DALLAS })])]);
    expect(features.filter((f) => f.properties.role === "run")).toHaveLength(1);
    expect(features.filter((f) => f.properties.role === "seg").map((f) => f.properties)).toEqual([
      { role: "seg", pathId: IDA, name: "Path 1", from: 2, to: 3, op: 1 },
    ]);
  });

  it("keeps the paths apart, each with its own run, in the order given", () => {
    const a = item(IDA, "Path 1", [stop(1, { at: HOUSTON }), stop(2, { at: DALLAS })]);
    const b = item(IDB, "Path 2", [stop(1, { at: KATY }), stop(2, { at: OKC })], 0.6);
    const runs = lineFeatures([a, b]).filter((f) => f.properties.role === "run");
    expect(runs.map((f) => [f.properties.pathId, f.properties.op])).toEqual([
      [IDA, 1],
      [IDB, 0.6],
    ]);
  });
});

// Places on either side of the 180 line. Singapore to Portland is 8,135 miles, so its line is densified;
// Suva to Nuku'alofa is 462 miles, one straight step that is never densified.
const SINGAPORE = { lng: 103.8198, lat: 1.3521 };
const PORTLAND = { lng: -122.6784, lat: 45.5152 };
const SUVA = { lng: 178.4419, lat: -18.1416 };
const NUKUALOFA = { lng: -175.2018, lat: -21.1394 };

describe("lineFeatures across the 180 line", () => {
  type At = { lng: number; lat: number };
  const stopsAt = (...places: At[]): PathStopView[] => places.map((at, i) => stop(i + 1, { at }));
  const featuresOf = (...places: At[]): LineFeature[] => lineFeatures([item(IDA, "Path 1", stopsAt(...places))]);
  /** The lines a feature holds: one for a LineString, each piece of a MultiLineString. */
  const piecesOf = (f: LineFeature): number[][][] => (f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates);
  /** The largest difference of longitude between two neighbouring points of one piece. */
  const widestStep = (f: LineFeature): number =>
    Math.max(0, ...piecesOf(f).flatMap((piece) => piece.slice(1).map((p, i) => Math.abs(p[0] - piece[i][0]))));
  /** Web Mercator's y: the map's own vertical scale. */
  const mercatorY = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

  it("cuts Singapore to Portland at the 180 line: the run and the seg are two pieces each, and no piece joins the two sides", () => {
    const features = featuresOf(SINGAPORE, PORTLAND);
    expect(features.map((f) => f.properties.role)).toEqual(["run", "seg"]);
    for (const f of features) {
      expect(widestStep(f), f.properties.role).toBeLessThan(180);
      expect(f.geometry.type, f.properties.role).toBe("MultiLineString");
      const [first, second, ...rest] = piecesOf(f);
      expect(rest).toEqual([]);
      const end = first[first.length - 1];
      expect([end[0], second[0][0]]).toEqual([180, -180]);
      expect(second[0][1]).toBe(end[1]);
      expect(end[1]).toBeCloseTo(54.2745, 4);
      // The points are the builder's own, with the two points on the 180 line added.
      expect([...first.slice(0, -1), ...second.slice(1)]).toEqual(globeLine(stopsAt(SINGAPORE, PORTLAND)));
    }
  });

  it("cuts the other way too: Portland to Singapore leaves at -180 and comes in at 180, at the same latitude", () => {
    for (const f of featuresOf(PORTLAND, SINGAPORE)) {
      expect(widestStep(f), f.properties.role).toBeLessThan(180);
      const [first, second, ...rest] = piecesOf(f);
      expect(rest).toEqual([]);
      const end = first[first.length - 1];
      expect([end[0], second[0][0]]).toEqual([-180, 180]);
      expect(second[0][1]).toBe(end[1]);
      expect(end[1]).toBeCloseTo(54.2745, 4);
      expect([...first.slice(0, -1), ...second.slice(1)]).toEqual(globeLine(stopsAt(PORTLAND, SINGAPORE)));
    }
  });

  it("cuts a hop under 500 miles too, which is never densified, and keeps the two pieces one straight line on the map's scale", () => {
    const stops = stopsAt(SUVA, NUKUALOFA);
    expect(haversineMiles([SUVA.lat, SUVA.lng], [NUKUALOFA.lat, NUKUALOFA.lng])).toBeLessThan(LONG_JUMP_MILES);
    expect(globeLine(stops)).toEqual([
      [SUVA.lng, SUVA.lat],
      [NUKUALOFA.lng, NUKUALOFA.lat],
    ]);
    for (const f of lineFeatures([item(IDA, "Path 1", stops)])) {
      expect(widestStep(f), f.properties.role).toBeLessThan(180);
      const [first, second, ...rest] = piecesOf(f);
      expect(rest).toEqual([]);
      const lat = first[1][1];
      expect(first).toEqual([
        [SUVA.lng, SUVA.lat],
        [180, lat],
      ]);
      expect(second).toEqual([
        [-180, lat],
        [NUKUALOFA.lng, NUKUALOFA.lat],
      ]);
      // On the map's scale, not straight between the two latitudes (that would be -18.876441).
      expect(lat).toBeCloseTo(-18.881565, 5);
      const slopeBefore = (mercatorY(lat) - mercatorY(SUVA.lat)) / (180 - SUVA.lng);
      const slopeAfter = (mercatorY(NUKUALOFA.lat) - mercatorY(lat)) / (NUKUALOFA.lng + 180);
      expect(slopeAfter).toBeCloseTo(slopeBefore, 12);
    }
  });

  it("cuts at every crossing: Singapore, Portland, Singapore gives the run three pieces and each seg two", () => {
    const features = featuresOf(SINGAPORE, PORTLAND, SINGAPORE);
    expect(features.map((f) => [f.properties.role, piecesOf(f).length])).toEqual([
      ["run", 3],
      ["seg", 2],
      ["seg", 2],
    ]);
    for (const f of features) expect(widestStep(f), f.properties.role).toBeLessThan(180);
  });

  it("gives the map numbers only when two stops stand on the 180 line itself, written 180 and -180", () => {
    for (const f of featuresOf({ lng: 180, lat: 10 }, { lng: -180, lat: 12 })) {
      expect(widestStep(f), f.properties.role).toBeLessThan(180);
      const points = piecesOf(f).flat();
      expect(points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
      expect(points[points.length - 1]).toEqual([-180, 12]);
    }
  });

  it("leaves a path that does not cross as it is: each feature one LineString, the run holding the builder's points", () => {
    const far = [stop(1, { at: HOUSTON }), stop(2, { at: LA })];
    const near = [stop(1, { at: HOUSTON }), stop(2, { at: KATY }), stop(3, { at: DALLAS })];
    for (const stops of [far, near]) {
      const features = lineFeatures([item(IDA, "Path 1", stops)]);
      expect(features.map((f) => f.geometry.type)).toEqual(features.map(() => "LineString"));
      expect(features.find((f) => f.properties.role === "run")?.geometry.coordinates).toEqual(globeLine(stops));
    }
  });
});

describe("plateFeatures", () => {
  it("gives the first plate at each point only, as a point with the role plate", () => {
    const a = item(IDA, "Path 1", [stop(1, { at: HOUSTON }), stop(2, { at: DALLAS })]);
    const b = item(IDB, "Path 2", [stop(1, { at: HOUSTON }), stop(2, { at: KATY })]);
    const features = plateFeatures(globePlates([a, b], 0, false));
    expect(features.map((f) => f.geometry.coordinates)).toEqual([
      [HOUSTON.lng, HOUSTON.lat],
      [DALLAS.lng, DALLAS.lat],
      [KATY.lng, KATY.lat],
    ]);
    expect(features.map((f) => f.properties)).toEqual([
      { role: "plate", pathId: IDA, slot: 0 },
      { role: "plate", pathId: IDA, slot: 0 },
      { role: "plate", pathId: IDB, slot: 0 },
    ]);
  });
});
const LANES: Record<string, number> = { auth: 20, login: 80 };
/** The caller's lane rule: a kind's lane, else the track's middle. */
const laneOf = (kind: string): number => LANES[kind === "fraud" ? "auth" : kind] ?? 50;

describe("timelineGeometry", () => {
  const WIN_MIN = 1000;
  const SPAN = 4000;
  const at = (t: number, o: StopOpts = {}) => ({ time: t, ...o });

  it("places a stop at (time - windowMin) / span * 100 across and at its kind's lane down", () => {
    const stops = [stop(1, at(1000)), stop(2, at(3000, { kind: "login" })), stop(3, at(5000))];
    const [tp] = timelineGeometry([item(IDA, "Path 1", stops)], WIN_MIN, SPAN, laneOf);
    expect(tp.points).toEqual([
      { x: 0, y: 20 },
      { x: 50, y: 80 },
      { x: 100, y: 20 },
    ]);
    expect(tp.plates.map((p) => [p.n, p.x, p.y])).toEqual([
      [1, 0, 20],
      [2, 50, 80],
      [3, 100, 20],
    ]);
    expect(tp.pathId).toBe(IDA);
    expect(tp.pathName).toBe("Path 1");
  });

  it("takes the lane of the record's own drawn kind, so a fraud transaction reads the lane the caller gives fraud", () => {
    const [tp] = timelineGeometry([item(IDA, "Path 1", [stop(1, at(2000, { kind: "fraud" })), stop(2, at(3000, { kind: "magnitude_kind" }))])], WIN_MIN, SPAN, laneOf);
    expect(tp.points.map((p) => p.y)).toEqual([20, 50]);
  });

  it("keeps a stop outside the window in the line but gives it no plate (the line is clipped by its box)", () => {
    const stops = [stop(1, at(500)), stop(2, at(3000)), stop(3, at(6000))];
    const [tp] = timelineGeometry([item(IDA, "Path 1", stops)], WIN_MIN, SPAN, laneOf);
    expect(tp.points.map((p) => p.x)).toEqual([-12.5, 50, 125]);
    expect(tp.plates.map((p) => p.n)).toEqual([2]);
  });

  it("leaves out a stop with no time, one not shown and one not found, and keeps the numbers of the others", () => {
    const stops = [stop(1, at(1000)), stop(2, { time: null }), stop(3, at(2000, { shown: false })), stop(4, { found: false }), stop(5, at(3000))];
    const [tp] = timelineGeometry([item(IDA, "Path 1", stops)], WIN_MIN, SPAN, laneOf);
    expect(tp.points).toHaveLength(2);
    expect(tp.plates.map((p) => p.n)).toEqual([1, 5]);
  });

  it("puts the lens on the plate with the lowest drawn number, of each path", () => {
    const a = item(IDA, "Path 1", [stop(1, at(500)), stop(2, at(2000)), stop(3, at(3000))]);
    const b = item(IDB, "Path 2", [stop(1, at(1500)), stop(2, at(2500))]);
    const [pa, pb] = timelineGeometry([a, b], WIN_MIN, SPAN, laneOf);
    expect(pa.plates.map((p) => [p.n, p.lens])).toEqual([
      [2, true],
      [3, false],
    ]);
    expect(pb.plates.map((p) => [p.n, p.lens])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it("stacks the plates of one record in two paths by slot, upward 13 px for each, in the order given", () => {
    const one = item(IDA, "Path 1", [stop(1, at(2000)), stop(2, at(3000))]);
    const two = item(IDB, "Path 2", [stop(1, at(2000)), stop(2, at(2500))]);
    const draft = item(DRAFT_ID, "Path 3", [stop(1, at(2000))], DRAFT_OPACITY);
    const [pa, pb, pd] = timelineGeometry([one, two, draft], WIN_MIN, SPAN, laneOf);
    expect(pa.plates.map((p) => [p.slot, p.offsetY])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(pb.plates.map((p) => [p.slot, p.offsetY])).toEqual([
      [1, -13],
      [0, 0],
    ]);
    expect([pd.plates[0].slot, pd.plates[0].offsetY, pd.op]).toEqual([2, -26, DRAFT_OPACITY]);
  });

  it("carries what a plate's words and press need: the stop, the path's name and size and its strength", () => {
    const stops = [stop(1, at(2000)), stop(2, at(3000))];
    const [tp] = timelineGeometry([item(IDA, "Path 1", stops, 0.35)], WIN_MIN, SPAN, laneOf);
    expect(tp.op).toBe(0.35);
    expect(tp.total).toBe(2);
    expect(tp.plates[0]).toMatchObject({ pathId: IDA, pathName: "Path 1", total: 2, op: 0.35, n: 1, stop: stops[0] });
    expect(new Set(tp.plates.map((p) => p.key)).size).toBe(2);
  });

  it("gives the line's x range, or null with no stop on the Timeline", () => {
    const [tp, empty] = timelineGeometry(
      [item(IDA, "Path 1", [stop(1, at(500)), stop(2, at(3000))]), item(IDB, "Path 2", [stop(1, { time: null })])],
      WIN_MIN,
      SPAN,
      laneOf,
    );
    expect(tp.xRange).toEqual({ min: -12.5, max: 50 });
    expect(empty.xRange).toBeNull();
    expect(empty.points).toEqual([]);
  });

  it("draws nothing before the window has a span", () => {
    const items = [item(IDA, "Path 1", [stop(1, at(2000)), stop(2, at(3000))])];
    expect(timelineGeometry(items, 1000, 0, laneOf)).toEqual([]);
    expect(timelineGeometry(items, 1000, -5, laneOf)).toEqual([]);
    expect(timelineGeometry([], 1000, 4000, laneOf)).toEqual([]);
  });
});

describe("gapDots and stopKeysOf", () => {
  const ticks = [
    { id: "rec-1", kind: "auth", pct: 10 },
    { id: "other-1", kind: "auth", pct: 30 },
    { id: "other-2", kind: "login", pct: 60 },
    { id: "rec-2", kind: "fraud", pct: 50 },
    { id: "other-3", kind: "login", pct: 95 },
    { id: "other-4", kind: "auth", pct: 5 },
  ];
  const keys = stopKeysOf(path({ stops: [{ kind: "auth", id: "rec-1" }, { kind: "auth", id: "rec-2" }] }));

  it("holds one canonical key for each stop of the path", () => {
    expect([...keys].sort()).toEqual(["auth:rec-1", "auth:rec-2"]);
    expect(stopKeysOf(path({ stops: [{ kind: "fraud", id: "x" }] })).has("auth:x")).toBe(true);
  });

  it("gives a point for each tick that is not one of the path's stops and lies between its first and last stop", () => {
    expect(gapDots(ticks, keys, laneOf, 10, 60)).toEqual([
      { x: 30, y: 20 },
      { x: 60, y: 80 },
    ]);
  });

  it("matches a tick of kind fraud to a stop saved as auth, and leaves out the ticks outside the range", () => {
    const dots = gapDots(ticks, keys, laneOf, 0, 100);
    expect(dots.map((d) => d.x).sort((a, b) => a - b)).toEqual([5, 30, 60, 95]);
    expect(gapDots(ticks, keys, laneOf, 70, 90)).toEqual([]);
  });

  it("includes a tick standing at an end of the range that is not a stop", () => {
    expect(gapDots([{ id: "other", kind: "auth", pct: 10 }], keys, laneOf, 10, 20)).toEqual([{ x: 10, y: 20 }]);
  });
});

describe("the Timeline line's casing and the plates' measures", () => {
  it("holds a casing wider than the dashed line, 3.5 px", () => {
    expect(LINE.timeline.casingWidth).toBe(3.5);
    expect(LINE.timeline.casingWidth).toBeGreaterThan(LINE.timeline.width);
  });

  it("estimates a plate's width from the drawn parts: border, padding, the lens and its gap, and the figures", () => {
    expect(timelinePlateWidth([1], false)).toBe(11.5);
    expect(timelinePlateWidth([2], true)).toBe(20.5);
    expect(timelinePlateWidth([1, 2], true)).toBe(31.5);
    expect(timelinePlateWidth([3, 4], false)).toBe(22.5);
    // Never under the plate's own 11 px floor.
    expect(timelinePlateWidth([], false)).toBe(PLATE.timeline.size);
    // The estimate stands at or above the drawn widths of the first sign-in story's frames (11.06 and 20.06).
    expect(timelinePlateWidth([1], false)).toBeGreaterThanOrEqual(11.06);
    expect(timelinePlateWidth([1], true)).toBeGreaterThanOrEqual(20.06);
  });
});

/** One Timeline plate as `timelineGeometry` would give it, built by hand (x in percent, y in percent of the track). */
function tplate(n: number, x: number, o: { y?: number; lens?: boolean; offsetY?: number; pathId?: string } = {}): TimelinePlate {
  const { y = 25, lens = false, offsetY = 0, pathId = IDA } = o;
  return { key: `${pathId}|${n}`, pathId, pathName: "Path 1", total: 4, op: 1, n, stop: stop(n), x, y, slot: 0, offsetY, lens };
}
/** A group's box across, in px from the track's left: the right edge hangs `nudge` left of the first member's point and the box grows right by `grow`. */
const boxOf = (g: { x: number; grow: number; nums: number[]; lens: boolean }, width: number) => {
  const right = (g.x * width) / 100 - PLATE.timeline.nudge + g.grow;
  return { left: right - timelinePlateWidth(g.nums, g.lens), right };
};

describe("joinTimelinePlates", () => {
  const T100 = { width: 100, height: 32 };

  it("joins nothing before the track is measured: one group for each plate, with the plate's own key, number, place and lens", () => {
    const plates = [tplate(1, 0, { lens: true }), tplate(2, 10), tplate(3, 20, { y: 75, offsetY: -13 })];
    for (const track of [{ width: 0, height: 32 }, { width: 100, height: 0 }]) {
      const groups = joinTimelinePlates(plates, track);
      expect(groups.map((g) => g.key)).toEqual(plates.map((p) => p.key));
      expect(groups.map((g) => g.nums)).toEqual([[1], [2], [3]]);
      expect(groups.map((g) => [g.x, g.y, g.offsetY, g.lens, g.grow])).toEqual([
        [0, 25, 0, true, 0],
        [10, 25, 0, false, 0],
        [20, 75, -13, false, 0],
      ]);
      expect(groups.map((g) => g.stops)).toEqual(plates.map((p) => [p.stop]));
    }
  });

  it("joins four plates ten percent apart on a track 100 px wide into one, led by the lens, standing where plate 1 stands", () => {
    const plates = [tplate(1, 0, { lens: true }), tplate(2, 10), tplate(3, 20), tplate(4, 30)];
    const groups = joinTimelinePlates(plates, T100);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.nums).toEqual([1, 2, 3, 4]);
    expect(g.stops.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    expect(g.lens).toBe(true);
    expect(g.key).toBe(`${IDA}|1+2+3+4`);
    expect([g.pathId, g.pathName, g.total, g.op]).toEqual([IDA, "Path 1", 4, 1]);
    // The first member's place: a joined plate never stands further left than plate 1 does alone.
    expect([g.x, g.y, g.offsetY]).toEqual([0, 25, 0]);
    expect(boxOf(g, 100).left).toBe(-3 - timelinePlateWidth([1], true));
  });

  it("keeps the four plates apart on a track 300 px wide", () => {
    const plates = [tplate(1, 0, { lens: true }), tplate(2, 10), tplate(3, 20), tplate(4, 30)];
    const groups = joinTimelinePlates(plates, { width: 300, height: 32 });
    expect(groups.map((g) => g.nums)).toEqual([[1], [2], [3], [4]]);
    expect(groups.map((g) => g.key)).toEqual(plates.map((p) => p.key));
    expect(groups.every((g) => g.grow === 0)).toBe(true);
  });

  it("joins transitively: a plate that touches only a neighbour joins that neighbour's group", () => {
    // Boxes on a 100 px track are 11.5 px wide, right edge x - 3. A left 0, B left 11 (touches A), C left 14 (touches B, not A).
    const a = tplate(1, 14.5);
    const b = tplate(2, 25.5);
    const c = tplate(3, 28.5);
    expect(boxOf({ x: a.x, grow: 0, nums: [1], lens: false }, 100).left).toBe(0);
    expect(joinTimelinePlates([a, b, c], T100).map((g) => g.nums)).toEqual([[1, 2, 3]]);
  });

  it("joins again when a group that has grown to the right comes to touch another plate", () => {
    // A left 0, B left 8 (touches A). The group [1, 2] is 22.5 wide, so it reaches 22.5. C left 24: 1.5 from the group, 4.5 from B alone.
    const a = tplate(1, 14.5);
    const b = tplate(2, 22.5);
    const c = tplate(3, 38.5);
    expect(boxOf({ x: c.x, grow: 0, nums: [3], lens: false }, 100)).toEqual({ left: 24, right: 35.5 });
    expect(joinTimelinePlates([a, b, c], T100).map((g) => g.nums)).toEqual([[1, 2, 3]]);
  });

  it("keeps two plates apart at a gap of exactly 2 px and joins them under it", () => {
    // Two plates without the lens, 11.5 px each: right edges 47 and 60.5, the second's left edge is 49.
    expect(joinTimelinePlates([tplate(1, 50), tplate(2, 63.5)], T100).map((g) => g.nums)).toEqual([[1], [2]]);
    expect(joinTimelinePlates([tplate(1, 50), tplate(2, 63.4)], T100).map((g) => g.nums)).toEqual([[1, 2]]);
  });

  it("measures the vertical gap too: equal x on lanes 25 and 75 percent stay apart on a 32 px track and join on a 12 px one", () => {
    const plates = [tplate(1, 50, { y: 25 }), tplate(2, 50, { y: 75 })];
    expect(joinTimelinePlates(plates, { width: 100, height: 32 }).map((g) => g.nums)).toEqual([[1], [2]]);
    expect(joinTimelinePlates(plates, { width: 100, height: 12 }).map((g) => g.nums)).toEqual([[1, 2]]);
  });

  it("sorts the members by x, then by number, after every merge, whatever order the plates came in", () => {
    // Plates given out of order, and two at equal x: the numbers still read ascending.
    const plates = [tplate(3, 50), tplate(1, 50, { lens: true }), tplate(2, 52)];
    const [g, ...rest] = joinTimelinePlates(plates, T100);
    expect(rest).toEqual([]);
    expect(g.nums).toEqual([1, 2, 3]);
    expect(g.stops.map((s) => s.n)).toEqual([1, 2, 3]);
    // The first member is the leftmost, and on equal x the lowest number: plate 1, with the lens.
    expect([g.x, g.lens]).toEqual([50, true]);
    expect(g.key).toBe(`${IDA}|1+2+3`);
  });

  it("pins F15 of the first verdict: four plates become two, the lens group [1, 2] and the group [3, 4], 14.9 px apart", () => {
    // Right edges of the drawn plates on a track 400 px wide: 181.27, 183.09, 218.67 and 220.51 (x = (right + 3) / 4).
    const W = 400;
    const at = (right: number) => ((right + PLATE.timeline.nudge) * 100) / W;
    const plates = [tplate(1, at(181.27), { lens: true }), tplate(2, at(183.09)), tplate(3, at(218.67)), tplate(4, at(220.51))];
    const groups = joinTimelinePlates(plates, { width: W, height: 32 });
    expect(groups.map((g) => g.nums)).toEqual([[1, 2], [3, 4]]);
    expect(groups.map((g) => g.lens)).toEqual([true, false]);
    const [one, two] = groups.map((g) => boxOf(g, W));
    // Each joined plate keeps the left edge its first plate has alone (plate 1 with the lens 20.5 wide, plate 3 11.5 wide) and grows right.
    expect(one.left).toBeCloseTo(181.27 - 20.5, 6);
    expect(one.right).toBeCloseTo(160.77 + 31.5, 6);
    expect(two.left).toBeCloseTo(218.67 - 11.5, 6);
    expect(two.right).toBeCloseTo(207.17 + 22.5, 6);
    expect(two.left - one.right).toBeCloseTo(14.9, 6);
    expect(groups.map((g) => g.grow)).toEqual([11, 11]);
  });

  it("never joins plates of different paths in the one call's result: it takes one path's plates", () => {
    // The function joins what it is given; the caller gives one path at a time. Two paths at one place stay in two calls.
    const first = joinTimelinePlates([tplate(1, 50, { pathId: IDA }), tplate(2, 50, { pathId: IDA })], T100);
    const second = joinTimelinePlates([tplate(1, 50, { pathId: IDB })], T100);
    expect(first.map((g) => g.pathId)).toEqual([IDA]);
    expect(second.map((g) => g.pathId)).toEqual([IDB]);
  });
});

describe("aheadKey", () => {
  const stops = [stop(1, { time: 1000 }), stop(2, { time: 2000 }), stop(3, { time: null }), stop(4, { time: 3000 }), stop(5, { found: false })];

  it("holds one character for each stop with a time: 1 after the playhead, 0 at or before it", () => {
    expect(aheadKey(stops, 1500, true)).toBe("011");
    expect(aheadKey(stops, 2000, true)).toBe("001");
    expect(aheadKey(stops, 0, true)).toBe("111");
    expect(aheadKey(stops, 5000, true)).toBe("000");
  });

  it("is the same between two crossings and changes when the playhead crosses a stop's time", () => {
    expect(aheadKey(stops, 1100, true)).toBe(aheadKey(stops, 1900, true));
    expect(aheadKey(stops, 1999, true)).not.toBe(aheadKey(stops, 2000, true));
    expect(aheadKey(stops, 999, true)).not.toBe(aheadKey(stops, 1000, true));
  });

  it("is all 0 before the playhead's bounds load", () => {
    expect(aheadKey(stops, 0, false)).toBe("000");
  });

  it("is empty for stops with no time", () => {
    expect(aheadKey([stop(1, { time: null })], 0, true)).toBe("");
    expect(aheadKey([], 0, true)).toBe("");
  });
});
