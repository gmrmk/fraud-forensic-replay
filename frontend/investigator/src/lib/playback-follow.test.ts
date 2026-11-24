import { describe, it, expect } from "vitest";
import {
  FAR_PAIR_DEG,
  FOLLOW_WAIT_PART,
  HOLD_DEG,
  IN_VIEW_MAX_DEG,
  activeFollowTarget,
  atOpeningZoom,
  equatorZoom,
  flatMidpoint,
  followMove,
  followPlaceBefore,
  followWaitOver,
  greatCircleDeg,
  greatCircleMidpoint,
  placeInView,
  type FollowEvent,
  type FollowViewMap,
  type LngLat,
} from "./playback-follow";

const EV: FollowEvent[] = [
  { ts: 100, lng: -95.40, lat: 29.80 }, // Houston
  { ts: 200, lng: -95.55, lat: 29.70 }, // Houston (nearby)
  { ts: 900, lng: 3.40, lat: 6.50 },    // Lagos (the leap)
];

describe("activeFollowTarget", () => {
  it("returns null when there are no events", () => {
    expect(activeFollowTarget([], 500)).toBeNull();
  });
  it("returns null before the first event's time", () => {
    expect(activeFollowTarget(EV, 50)).toBeNull();
  });
  it("returns the latest event at or before t", () => {
    expect(activeFollowTarget(EV, 250)?.ts).toBe(200);
  });
  it("ignores future events", () => {
    expect(activeFollowTarget(EV, 899)?.ts).toBe(200);
  });
  it("includes an event whose ts equals t exactly", () => {
    expect(activeFollowTarget(EV, 900)?.ts).toBe(900);
  });
  it("does not assume the input is sorted", () => {
    const shuffled: FollowEvent[] = [EV[2], EV[0], EV[1]];
    expect(activeFollowTarget(shuffled, 250)?.ts).toBe(200);
  });
});

// ---- The calmer follow: frame the places and hold ----

const HOU: LngLat = { lng: -95.4, lat: 29.8 };
const LAG: LngLat = { lng: 3.4, lat: 6.5 };
const HOME: LngLat = { lng: -40, lat: 20 };

describe("greatCircleDeg", () => {
  it("is 90 for a quarter of the equator, and from the equator to a pole", () => {
    expect(greatCircleDeg({ lng: 0, lat: 0 }, { lng: 90, lat: 0 })).toBeCloseTo(90, 6);
    expect(greatCircleDeg({ lng: 12, lat: 0 }, { lng: 40, lat: 90 })).toBeCloseTo(90, 6);
  });
  it("is 150 for 150 degrees of longitude on the equator", () => {
    expect(greatCircleDeg({ lng: 0, lat: 0 }, { lng: 150, lat: 0 })).toBeCloseTo(150, 6);
  });
  it("is 180 for two places on opposite sides of the globe", () => {
    expect(greatCircleDeg({ lng: 0, lat: 0 }, { lng: 180, lat: 0 })).toBeCloseTo(180, 6);
  });
  it("takes the short way across the antimeridian", () => {
    expect(greatCircleDeg({ lng: 179, lat: 0 }, { lng: -179, lat: 0 })).toBeCloseTo(2, 6);
  });
  it("is zero for the same place and symmetric", () => {
    expect(greatCircleDeg(HOU, HOU)).toBe(0);
    expect(greatCircleDeg(HOU, LAG)).toBeCloseTo(greatCircleDeg(LAG, HOU), 9);
  });
});

describe("greatCircleMidpoint", () => {
  it("is 45 E for 0 and 90 E on the equator", () => {
    const m = greatCircleMidpoint({ lng: 0, lat: 0 }, { lng: 90, lat: 0 });
    expect(m.lng).toBeCloseTo(45, 6);
    expect(m.lat).toBeCloseTo(0, 6);
  });
  it("is 30 N for 60 N and 0 on one meridian", () => {
    const m = greatCircleMidpoint({ lng: 10, lat: 60 }, { lng: 10, lat: 0 });
    expect(m.lng).toBeCloseTo(10, 6);
    expect(m.lat).toBeCloseTo(30, 6);
  });
  it("bows to the pole: (0, 45) and (90, 45) meet at 45 E and asin(sqrt(2/3)) = 54.7356 N", () => {
    // Unit vectors (0, .7071, .7071) and (.7071, .7071, 0) sum to (.7071, 1.4142, .7071), length sqrt 3.
    const m = greatCircleMidpoint({ lng: 0, lat: 45 }, { lng: 90, lat: 45 });
    expect(m.lng).toBeCloseTo(45, 6);
    expect(m.lat).toBeCloseTo(54.7356, 3);
  });
  it("crosses the antimeridian the short way", () => {
    const m = greatCircleMidpoint({ lng: 170, lat: 0 }, { lng: -170, lat: 0 });
    expect(Math.abs(m.lng)).toBeCloseTo(180, 6);
  });
  it("lies as far from Houston as from Lagos, half the way between them", () => {
    const m = greatCircleMidpoint(HOU, LAG);
    expect(greatCircleDeg(HOU, m)).toBeCloseTo(greatCircleDeg(HOU, LAG) / 2, 6);
    expect(greatCircleDeg(LAG, m)).toBeCloseTo(greatCircleDeg(HOU, LAG) / 2, 6);
  });
});

describe("flatMidpoint: the middle of two places on the flat map", () => {
  it("is 0, 0 for two places set evenly about it", () => {
    const m = flatMidpoint({ lng: -10, lat: -30 }, { lng: 10, lat: 30 });
    expect(m.lng).toBeCloseTo(0, 9);
    expect(m.lat).toBeCloseTo(0, 9);
  });
  it("takes the latitude halfway up the flat map: atan(1 / sqrt 2) = 35.2644 N for 0 and 60 N", () => {
    // Mercator y of 60 N is ln(2 + sqrt 3); the latitude whose tangent is sinh of half of it is atan(1 / sqrt 2).
    const m = flatMidpoint({ lng: 10, lat: 0 }, { lng: 10, lat: 60 });
    expect(m.lng).toBeCloseTo(10, 9);
    expect(m.lat).toBeCloseTo(35.2644, 4);
  });
  it("lies between Houston and Lagos on the flat map, not on the great circle", () => {
    const m = flatMidpoint(HOU, LAG);
    expect(m.lng).toBeCloseTo((HOU.lng + LAG.lng) / 2, 9);
    expect(m.lat).toBeGreaterThan(LAG.lat);
    expect(m.lat).toBeLessThan(HOU.lat);
    expect(greatCircleDeg(m, greatCircleMidpoint(HOU, LAG))).toBeGreaterThan(HOLD_DEG);
  });
  it("does not cross the seam: 170 E and 170 W meet at 0, in the one world", () => {
    const m = flatMidpoint({ lng: 170, lat: 0 }, { lng: -170, lat: 0 });
    expect(m.lng).toBeCloseTo(0, 9);
    expect(m.lat).toBeCloseTo(0, 9);
  });
});

describe("followPlaceBefore", () => {
  const ev = (ts: number, p: LngLat): FollowEvent => ({ ts, lng: p.lng, lat: p.lat });
  it("is the latest earlier event at another place", () => {
    const events = [ev(1, HOU), ev(2, { lng: -95.5, lat: 29.7 }), ev(3, LAG)];
    expect(followPlaceBefore(events, events[2])).toEqual(events[1]);
  });
  it("skips earlier events at the target's own place: a second Lagos event looks back to Houston", () => {
    const events = [ev(1, HOU), ev(2, LAG), ev(3, { lng: 3.5, lat: 6.4 })];
    expect(followPlaceBefore(events, events[2])).toEqual(events[0]);
  });
  it("is null when the story has been nowhere else", () => {
    const events = [ev(1, HOU), ev(2, { lng: -95.5, lat: 29.7 })];
    expect(followPlaceBefore(events, events[1])).toBeNull();
  });
  it("does not assume the input is sorted and ignores later events", () => {
    const events = [ev(3, LAG), ev(1, HOU), ev(5, HOME)];
    expect(followPlaceBefore(events, events[0])).toEqual(events[1]);
  });
});

describe("atOpeningZoom", () => {
  it("is true at the home zoom, a little above it and below it", () => {
    expect(atOpeningZoom(2, 2)).toBe(true);
    expect(atOpeningZoom(2.2, 2)).toBe(true);
    expect(atOpeningZoom(1.1, 2)).toBe(true);
  });
  it("is false once the person has zoomed in", () => {
    expect(atOpeningZoom(2.6, 2)).toBe(false);
    expect(atOpeningZoom(6, 2)).toBe(false);
  });
  it("is false when no home is known: the follow then moves to the target, as it did before", () => {
    expect(atOpeningZoom(2, null)).toBe(false);
    expect(atOpeningZoom(2, undefined)).toBe(false);
  });
});

describe("equatorZoom: the zoom normalised to the equator", () => {
  it("gives the same globe on screen the same number at two latitudes (the follow's first move on the platform access story)", () => {
    expect(Math.abs(equatorZoom(1.3546, 42) - equatorZoom(1.7624, 9.621))).toBeLessThan(0.001);
  });
  it("keeps a camera moved from a home at 42 N to the equator at the opening zoom, where the raw zoom does not", () => {
    expect(atOpeningZoom(equatorZoom(2.4283, 0), equatorZoom(2, 42))).toBe(true);
    expect(atOpeningZoom(2.4283, 2)).toBe(false);
    expect(atOpeningZoom(equatorZoom(2, 60), equatorZoom(2, 42))).toBe(false);
    expect(atOpeningZoom(2, 2)).toBe(true);
  });
});

describe("followWaitOver: the follow's wait of one twelfth of the case's span", () => {
  // A span of 12,000 ms, so one twelfth is 1,000 ms of case time.
  it("is a twelfth", () => {
    expect(FOLLOW_WAIT_PART).toBe(12);
  });
  it("waits forward until the playhead has moved a twelfth from the anchor", () => {
    expect(followWaitOver(3_999, 3_000, 0, 12_000)).toBe(false);
    expect(followWaitOver(4_000, 3_000, 0, 12_000)).toBe(true);
    expect(followWaitOver(9_000, 3_000, 0, 12_000)).toBe(true);
  });
  it("waits the same in reverse play", () => {
    expect(followWaitOver(8_001, 9_000, 0, 12_000)).toBe(false);
    expect(followWaitOver(8_000, 9_000, 0, 12_000)).toBe(true);
  });
  it("measures the twelfth on the span, not on where the span starts", () => {
    expect(followWaitOver(51_999, 51_000, 50_000, 62_000)).toBe(false);
    expect(followWaitOver(52_000, 51_000, 50_000, 62_000)).toBe(true);
  });
});

describe("followMove", () => {
  const base = { target: LAG, before: HOU, targetInView: false, atOpeningZoom: true, camera: HOME };

  it("states its two limits: 120 degrees apart and one degree from the camera", () => {
    expect(FAR_PAIR_DEG).toBe(120);
    expect(HOLD_DEG).toBe(1);
  });

  it("makes no move for a target that is in view", () => {
    expect(followMove({ ...base, targetInView: true })).toBeNull();
    expect(followMove({ ...base, targetInView: true, atOpeningZoom: false })).toBeNull();
  });

  it("moves once to the midpoint of the target and the place before it, at the opening zoom", () => {
    const to = followMove(base);
    const mid = greatCircleMidpoint(LAG, HOU);
    expect(to).not.toBeNull();
    expect(to?.lng).toBeCloseTo(mid.lng, 9);
    expect(to?.lat).toBeCloseTo(mid.lat, 9);
  });

  it("moves to the target when the two places are 150 degrees apart", () => {
    const a = { lng: 0, lat: 0 }, b = { lng: 150, lat: 0 };
    expect(followMove({ ...base, target: b, before: a })).toEqual(b);
  });

  it("takes the midpoint just under 120 degrees and the target just over it", () => {
    const a = { lng: 0, lat: 0 };
    const under = { lng: 119.5, lat: 0 };
    const over = { lng: 120.5, lat: 0 };
    expect(followMove({ ...base, target: over, before: a })).toEqual(over);
    const to = followMove({ ...base, target: under, before: a });
    expect(to?.lng).toBeCloseTo(59.75, 6);
    expect(to?.lat).toBeCloseTo(0, 6);
  });

  it("takes the flat map's midpoint when flat is set, and the great circle's when it is false or left out", () => {
    const flat = flatMidpoint(LAG, HOU);
    const to = followMove({ ...base, flat: true });
    expect(to?.lng).toBeCloseTo(flat.lng, 9);
    expect(to?.lat).toBeCloseTo(flat.lat, 9);
    const globe = greatCircleMidpoint(LAG, HOU);
    for (const input of [{ ...base, flat: false }, base]) {
      expect(followMove(input)?.lng).toBeCloseTo(globe.lng, 9);
      expect(followMove(input)?.lat).toBeCloseTo(globe.lat, 9);
    }
  });

  it("moves to the target when the person has zoomed in and the target is out of view", () => {
    expect(followMove({ ...base, atOpeningZoom: false })).toEqual(LAG);
  });

  it("moves to the target when the story has no place before it", () => {
    expect(followMove({ ...base, before: null })).toEqual(LAG);
  });

  it("is no move when the centre it would ask for is within one degree of the camera", () => {
    const mid = greatCircleMidpoint(LAG, HOU);
    expect(followMove({ ...base, camera: { lng: mid.lng + 0.5, lat: mid.lat } })).toBeNull();
    expect(followMove({ ...base, atOpeningZoom: false, camera: { lng: LAG.lng - 0.4, lat: LAG.lat } })).toBeNull();
    // Just outside the limit it moves.
    expect(followMove({ ...base, camera: { lng: mid.lng + 1.5, lat: mid.lat } })).not.toBeNull();
  });

  // The alternation of the late card story: Houston, Lagos, Houston, Lagos. The stand-in for "in
  // view" is a disc round the camera. A radius of 40 puts both cities OUT of view from their
  // midpoint (each is 47 degrees from it), the strict case the one-degree rule exists for; a radius
  // of 60 puts both in view.
  for (const radius of [40, 60]) {
    it(`makes one move for Houston and Lagos, then holds through six more events (view radius ${radius})`, () => {
      let camera: LngLat = HOU;
      let moves = 0;
      const events: [LngLat, LngLat][] = [
        [LAG, HOU], [HOU, LAG], [LAG, HOU], [HOU, LAG], [LAG, HOU], [HOU, LAG], [LAG, HOU],
      ];
      for (const [target, before] of events) {
        const to = followMove({
          target,
          before,
          targetInView: greatCircleDeg(target, camera) <= radius,
          atOpeningZoom: true,
          camera,
        });
        if (to) {
          moves += 1;
          camera = to;
        }
      }
      expect(moves).toBe(1);
      expect(greatCircleDeg(camera, greatCircleMidpoint(HOU, LAG))).toBeLessThan(HOLD_DEG);
    });
  }
});

describe("placeInView", () => {
  /** A map of 1280 by 720 with a bar of 173 px under it, as the case view opens. */
  function fakeMap(
    at: { x: number; y: number },
    over: { occluded?: boolean; padding?: number; w?: number; h?: number; center?: LngLat; flat?: boolean } = {},
  ): FollowViewMap {
    const map: FollowViewMap = {
      project: () => at,
      transform: { isLocationOccluded: () => over.occluded ?? false },
      getCenter: () => over.center ?? HOU, // the view is centred on Houston unless a test says otherwise
      getCanvas: () => ({ clientWidth: over.w ?? 1280, clientHeight: over.h ?? 720 }),
      getPadding: () => ({ top: 0, left: 0, right: 0, bottom: over.padding ?? 173 }),
    };
    // A stand-in with no read of its projection is a globe; the flat one reports the flat projection.
    return over.flat ? { ...map, getProjection: () => ({ type: "mercator" }) } : map;
  }

  it("is true for a place well inside the part of the map above the bar", () => {
    expect(placeInView(fakeMap({ x: 640, y: 270 }), HOU)).toBe(true);
  });
  it("is false for a place on the far side of the globe, wherever it projects", () => {
    expect(placeInView(fakeMap({ x: 640, y: 270 }, { occluded: true }), HOU)).toBe(false);
  });
  it("is false for a place off the canvas or inside the margin at its edge", () => {
    expect(placeInView(fakeMap({ x: -5, y: 270 }), HOU)).toBe(false);
    expect(placeInView(fakeMap({ x: 1300, y: 270 }), HOU)).toBe(false);
    // The open part is 547 px tall, so the margin is 8 percent of it, 44 px.
    expect(placeInView(fakeMap({ x: 40, y: 270 }), HOU)).toBe(false);
    expect(placeInView(fakeMap({ x: 50, y: 270 }), HOU)).toBe(true);
  });
  it("is false for a place under the bar, which the map's bottom padding marks off", () => {
    expect(placeInView(fakeMap({ x: 640, y: 600 }), HOU)).toBe(false);
    expect(placeInView(fakeMap({ x: 640, y: 500 }), HOU)).toBe(true);
    expect(placeInView(fakeMap({ x: 640, y: 600 }, { padding: 0 }), HOU)).toBe(true);
  });
  it("is false for a place whose projection is not a number", () => {
    expect(placeInView(fakeMap({ x: Number.NaN, y: 270 }), HOU)).toBe(false);
  });
  it("reads both cities as in view from their midpoint at the opening zoom (hand model of the globe)", () => {
    // Positions from the same pinhole model useBarPadding.diskAcross uses: the disk fitted to the open
    // part (547 px at 1280 by 720, 173 px bar), the globe a little larger at 26.7 N than at the 20 N it
    // was fitted at. Houston and Lagos are 47 degrees from their midpoint. Not read from a real map.
    const mid = greatCircleMidpoint(HOU, LAG);
    const at = { Houston: { x: 409, y: 203 }, Lagos: { x: 871, y: 344 } };
    expect(placeInView(fakeMap(at.Houston, { center: mid }), HOU)).toBe(true);
    expect(placeInView(fakeMap(at.Lagos, { center: mid }), LAG)).toBe(true);
    // The same on a window of 1024 by 700.
    const small = { w: 1024, h: 700, center: mid };
    expect(placeInView(fakeMap({ x: 287, y: 195 }, small), HOU)).toBe(true);
    expect(placeInView(fakeMap({ x: 737, y: 332 }, small), LAG)).toBe(true);
  });
  it("is false for a place more than 60 degrees from the centre of the view, though it is on screen and on the near side", () => {
    // The limb of the whole-globe view: on screen, not hidden, and a few pixels from the edge of the disk.
    expect(IN_VIEW_MAX_DEG).toBe(60);
    const onScreen = { x: 640, y: 270 };
    const place = { lng: 0, lat: 0 };
    expect(placeInView(fakeMap(onScreen, { center: { lng: 70, lat: 0 } }), place)).toBe(false);
    expect(placeInView(fakeMap(onScreen, { center: { lng: 55, lat: 0 } }), place)).toBe(true);
  });
  it("on the flat map holds a place 70 degrees from the centre in view when it is on screen, since the screen decides there", () => {
    const place = { lng: 0, lat: 0 };
    const center = { lng: 70, lat: 0 };
    expect(placeInView(fakeMap({ x: 640, y: 270 }, { center, flat: true }), place)).toBe(true);
    expect(placeInView(fakeMap({ x: -5, y: 270 }, { center, flat: true }), place)).toBe(false);
    expect(placeInView(fakeMap({ x: 640, y: 270 }, { center }), place)).toBe(false);
  });
  it("holds a pair less than 120 degrees apart in view from its midpoint, on the angle limit", () => {
    const a = { lng: 0, lat: 0 }, b = { lng: 119, lat: 0 };
    const mid = greatCircleMidpoint(a, b);
    const onScreen = { x: 640, y: 270 };
    expect(placeInView(fakeMap(onScreen, { center: mid }), a)).toBe(true);
    expect(placeInView(fakeMap(onScreen, { center: mid }), b)).toBe(true);
  });
});
