// frontend/investigator/src/components/useCameraMoves.test.ts
// The globe's own camera moves: the playback follow, the move to a pressed record, and the jump to
// the opening view when Play starts after a press. GlobeMap needs WebGL, so the hook runs against
// a small fake map that records the camera calls it is asked
// for. The pins marked (a) to (e) began as the behaviour the moves had inside GlobeMap before
// they moved to the hook; the other tests pin the picks of 2026-11-23 built since.
import type { MutableRefObject } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type maplibregl from "maplibre-gl";
import hookSource from "./useCameraMoves.ts?raw";
import { useCameraMoves } from "./useCameraMoves";
import type { CapMove } from "../hooks/useLabelCap";
import type { Entity } from "../lib/entity";
import type { EntityMatch } from "../lib/matches";
import { greatCircleMidpoint } from "../lib/playback-follow";
import type { Path } from "../lib/paths";
import { pressMove } from "../lib/press-camera";
import type { ScenarioHome } from "../lib/scenarios";
import { useNavigation } from "../store/navigation";
import { usePlayhead } from "../store/playhead";
import { useSelection } from "../store/selection";
import type { AccountEvent, LoginEvent, Transaction } from "../types";

// The deciding function keeps its real answers; the wrap lets a test read what the hook passed it.
vi.mock("../lib/press-camera", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/press-camera")>();
  return { ...real, pressMove: vi.fn(real.pressMove) };
});

const HOUSTON = { lng: -95.37, lat: 29.76 };
const LAGOS = { lng: 3.4, lat: 6.5 };

/** A fake map at Houston, zoom 4.2, that is not moving. Lagos is about 100 degrees away, past the
 *  60 degree limit of `placeInView`, so it is out of view whatever the fake projects. */
function fakeMap() {
  const fake = {
    getCenter: vi.fn(() => ({ lng: HOUSTON.lng, lat: HOUSTON.lat })),
    getZoom: vi.fn(() => 4.2),
    isMoving: vi.fn(() => false),
    easeTo: vi.fn(),
    flyTo: vi.fn(),
    jumpTo: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    project: vi.fn(() => ({ x: 640, y: 360 })),
    transform: { isLocationOccluded: vi.fn(() => false) },
    getCanvas: vi.fn(() => ({ clientWidth: 1280, clientHeight: 720 })),
    getPadding: vi.fn(() => ({})),
    triggerRepaint: vi.fn(),
  };
  return { fake, map: fake as unknown as maplibregl.Map };
}

/** One path from Houston (at time 1000) to Lagos (at time 2000). */
const PATH = {
  kind: "auth",
  color: [1, 1, 1],
  points: [
    [HOUSTON.lng, HOUSTON.lat],
    [LAGOS.lng, LAGOS.lat],
  ],
  nodes: [
    { ts: 1000, frac: 0 },
    { ts: 2000, frac: 1 },
  ],
  loft: false,
  territory: false,
} as Path;

/** The hook's inputs, made once outside the render callback so that every render sees the same. */
function mount() {
  const { fake, map } = fakeMap();
  const capMove = vi.fn((run: () => unknown) => run()) as unknown as CapMove;
  const deps = {
    map,
    mapRef: { current: map } as MutableRefObject<maplibregl.Map | null>,
    pathsRef: { current: [PATH] } as MutableRefObject<Path[]>,
    scenarioHomeRef: { current: { lng: -40, lat: 20, zoom: 2 } } as MutableRefObject<ScenarioHome | null | undefined>,
    openedOnWholeGlobeRef: { current: false } as MutableRefObject<boolean>,
    isDraggingRef: { current: false } as MutableRefObject<boolean>,
    capMove,
  };
  renderHook(() => useCameraMoves(deps));
  return { fake, deps };
}

const tx = (id: string, lat: number, lng: number): Transaction =>
  ({
    id,
    timestamp: "1970-01-01T00:00:03Z",
    merchant_lat: lat,
    merchant_lng: lng,
    merchant_name: `Shop ${id}`,
    mcc: "5411",
    merchant_country: "NG",
    amount: 12.5,
    is_fraud: false,
  }) as unknown as Transaction;

/** A record of kind account_event: timeline-only evidence, so navigate sets no panTarget for it. */
const accountEvent = (id: string): AccountEvent => ({
  id,
  account_id: "acc-1",
  timestamp: "1970-01-01T00:00:04Z",
  kind: "profile_change",
  field: "email",
  old_value: null,
  new_value: null,
  payee_id: null,
  session_id: "s-1",
  is_fraud: 0,
});

/** A manifest record: `navigate` hands its stored `coords` object to `panTarget` each time. */
const SITE: Entity = {
  id: "site-1",
  kind: "office",
  timestamp: 0,
  coords: { lat: LAGOS.lat, lng: LAGOS.lng },
  fields: {},
  displayMetadata: { primaryLabel: "Office", secondaryLabel: "", paletteKind: "office", pivotableFields: [] },
};

const realMatchMedia = window.matchMedia;

/** happy-dom has no prefers-reduced-motion query, so a test that needs it replaces matchMedia with
 *  a new function each time; `prefersReducedMotion` builds its query again for a new function. */
function stubReducedMotion(): void {
  window.matchMedia = ((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
  // A span of 12,000 ms, so the follow's wait of one twelfth of the span is 1,000 ms of case time.
  usePlayhead.setState({ playhead: 0, minTime: 0, maxTime: 12000, isPlaying: false, playbackRate: 1 });
  useSelection.getState().clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = realMatchMedia;
});

describe("useCameraMoves: the playback follow", () => {
  // The follow at the tip moved only when performance.now() was 900 ms past its last move, which
  // started at 0, so each follow test holds the clock at one value. The stub stays after the follow
  // stopped reading the clock, so that these tests ran in the same text before and after that change.
  beforeEach(() => {
    vi.spyOn(performance, "now").mockReturnValue(1e6);
  });

  it("(a) while playing, an out-of-view target gets one centre-only ease of 1600 ms with essential set", () => {
    const { fake, deps } = mount();
    act(() => usePlayhead.setState({ isPlaying: true, playhead: 2500 }));
    act(() => usePlayhead.setState({ playhead: 3500 })); // a twelfth of the span after Play
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    expect(fake.easeTo.mock.calls[0][0]).toStrictEqual({ center: [LAGOS.lng, LAGOS.lat], duration: 1600, essential: true });
    expect(deps.capMove).toHaveBeenCalledTimes(1);
    expect((deps.capMove as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toStrictEqual({ lng: LAGOS.lng, lat: LAGOS.lat });
  });

  it("(b) paused, the same playhead change makes no move", () => {
    const { fake } = mount();
    act(() => usePlayhead.setState({ playhead: 2500 }));
    expect(fake.easeTo).not.toHaveBeenCalled();
    expect(fake.triggerRepaint).toHaveBeenCalled();
  });

  it("(c) during a drag, the same play makes no move", () => {
    const { fake, deps } = mount();
    deps.isDraggingRef.current = true;
    act(() => usePlayhead.setState({ isPlaying: true, playhead: 2500 }));
    act(() => usePlayhead.setState({ playhead: 3500 })); // the wait is over: only the drag holds it
    expect(fake.easeTo).not.toHaveBeenCalled();
  });

  it("under reduced motion, a play makes no move and the paths are still repainted", () => {
    stubReducedMotion();
    const { fake } = mount();
    act(() => usePlayhead.setState({ isPlaying: true, playhead: 2500 }));
    act(() => usePlayhead.setState({ playhead: 3500 })); // the wait is over: only reduced motion holds it
    expect(fake.easeTo).not.toHaveBeenCalled();
    expect(fake.triggerRepaint).toHaveBeenCalledTimes(3); // once at mount, once at each of the play's two ticks
  });

  it("makes no move while the map is moving, and moves once it has stopped", () => {
    const { fake } = mount();
    fake.isMoving.mockReturnValue(true);
    act(() => usePlayhead.setState({ isPlaying: true, playhead: 2500 }));
    act(() => usePlayhead.setState({ playhead: 3500 }));
    expect(fake.easeTo).not.toHaveBeenCalled();
    fake.isMoving.mockReturnValue(false);
    act(() => usePlayhead.setState({ playhead: 3600 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
  });

  it("makes the first move of a play when the playhead is a twelfth of the span past Play, and not before", () => {
    const { fake } = mount();
    act(() => usePlayhead.setState({ isPlaying: true, playhead: 2500 }));
    act(() => usePlayhead.setState({ playhead: 3499 }));
    expect(fake.easeTo).not.toHaveBeenCalled();
    act(() => usePlayhead.setState({ playhead: 3500 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
  });

  it("makes the next move when the playhead is a twelfth of the span past the last move, and not before", () => {
    const { fake } = mount();
    act(() => usePlayhead.setState({ isPlaying: true, playhead: 2500 }));
    act(() => usePlayhead.setState({ playhead: 3500 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    act(() => usePlayhead.setState({ playhead: 4499 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    act(() => usePlayhead.setState({ playhead: 4500 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(2);
  });

  it("waits the same twelfth in reverse play, before the first move and between moves", () => {
    const { fake } = mount();
    act(() => usePlayhead.setState({ playbackRate: -1, isPlaying: true, playhead: 11000 }));
    act(() => usePlayhead.setState({ playhead: 10001 }));
    expect(fake.easeTo).not.toHaveBeenCalled();
    act(() => usePlayhead.setState({ playhead: 10000 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    act(() => usePlayhead.setState({ playhead: 9001 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    act(() => usePlayhead.setState({ playhead: 9000 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(2);
  });

  it("mounted while a case already plays, waits a twelfth of the span from the playhead at mount", () => {
    usePlayhead.setState({ isPlaying: true, playhead: 2500 });
    const { fake } = mount();
    expect(fake.easeTo).not.toHaveBeenCalled();
    act(() => usePlayhead.setState({ playhead: 3499 }));
    expect(fake.easeTo).not.toHaveBeenCalled();
    act(() => usePlayhead.setState({ playhead: 3500 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
  });

  it("judges the opening zoom on zooms normalised to the equator, so a camera moved south from the home keeps the midpoint rule", () => {
    const { fake, deps } = mount();
    // The home at 42 N and zoom 2 shows the same globe as zoom 2.4283 at the equator.
    deps.scenarioHomeRef.current = { lng: -75, lat: 42, zoom: 2 };
    deps.openedOnWholeGlobeRef.current = true;
    fake.getCenter.mockReturnValue({ lng: -150, lat: 0 });
    fake.getZoom.mockReturnValue(2.4283);
    act(() => usePlayhead.setState({ isPlaying: true, playhead: 2500 }));
    act(() => usePlayhead.setState({ playhead: 3500 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    const mid = greatCircleMidpoint(LAGOS, HOUSTON);
    const [lng, lat] = fake.easeTo.mock.calls[0][0].center as [number, number];
    expect(lng).toBeCloseTo(mid.lng, 6);
    expect(lat).toBeCloseTo(mid.lat, 6);
  });

  it("normalises the camera's zoom too, so a camera at 60 N that shows a larger globe than the home's follows to the target", () => {
    const { fake, deps } = mount();
    // Zoom 2 at 60 N shows the globe of zoom 3 at the equator; the home at 42 N and zoom 2 shows that of 2.4283.
    deps.scenarioHomeRef.current = { lng: -75, lat: 42, zoom: 2 };
    deps.openedOnWholeGlobeRef.current = true;
    fake.getCenter.mockReturnValue({ lng: -150, lat: 60 });
    fake.getZoom.mockReturnValue(2);
    act(() => usePlayhead.setState({ isPlaying: true, playhead: 2500 }));
    act(() => usePlayhead.setState({ playhead: 3500 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    expect(fake.easeTo.mock.calls[0][0].center).toStrictEqual([LAGOS.lng, LAGOS.lat]);
  });

  it("reads no clock during a play", () => {
    const { fake } = mount();
    vi.restoreAllMocks(); // takes the constant clock of this block's setup off
    const dateNow = vi.spyOn(Date, "now");
    const perfNow = vi.spyOn(performance, "now");
    // Driven outside a render: React's scheduler reads the clock on its own.
    usePlayhead.setState({ isPlaying: true, playhead: 2500 });
    usePlayhead.setState({ playhead: 3500 });
    usePlayhead.setState({ playhead: 4500 });
    expect(dateNow).not.toHaveBeenCalled();
    expect(perfNow).not.toHaveBeenCalled();
    expect(fake.easeTo).toHaveBeenCalledTimes(2); // the play did reach two moves
  });
});

/** Puts the fake map's camera at a place and zoom. */
function placeCamera(fake: ReturnType<typeof fakeMap>["fake"], lng: number, lat: number, zoom: number): void {
  fake.getCenter.mockReturnValue({ lng, lat });
  fake.getZoom.mockReturnValue(zoom);
}

/** The card story's opening view: 20 N, 40 W, the whole globe. */
const HOME_VIEW = { lng: -40, lat: 20, zoom: 1.3 };

describe("useCameraMoves: a press on a record", () => {
  it("a first press from the globe view at zoom 1.3 turns the globe: one centre-only ease of 900 ms and no flight", () => {
    const { fake, deps } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    expect(fake.easeTo.mock.calls[0][0]).toStrictEqual({ center: [LAGOS.lng, LAGOS.lat], duration: 900 });
    expect(fake.flyTo).not.toHaveBeenCalled();
    expect((deps.capMove as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toStrictEqual({ lng: LAGOS.lng, lat: LAGOS.lat });
  });

  it("a second press with the camera at the record flies in to the record's zoom at speed 2", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    placeCamera(fake, LAGOS.lng, LAGOS.lat, 1.38); // where the turn leaves the camera
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    expect(fake.flyTo).toHaveBeenCalledTimes(1);
    expect(fake.flyTo.mock.calls[0][0]).toStrictEqual({ center: [LAGOS.lng, LAGOS.lat], zoom: 12, curve: 1.6, speed: 2 });
  });

  it("(d) a press from zoom 12 flies with the record's zoom, curve 1.6 and speed 2, and makes no turn", () => {
    const { fake } = mount();
    placeCamera(fake, HOUSTON.lng, HOUSTON.lat, 12);
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    expect(fake.flyTo).toHaveBeenCalledTimes(1);
    expect(fake.flyTo.mock.calls[0][0]).toStrictEqual({ center: [LAGOS.lng, LAGOS.lat], zoom: 12, curve: 1.6, speed: 2 });
    expect(fake.easeTo).not.toHaveBeenCalled();
  });

  it("a first press on another record within 0.5 degrees of the centre flies in at once", () => {
    const { fake } = mount();
    placeCamera(fake, LAGOS.lng, LAGOS.lat, 1.38);
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t2", LAGOS.lat + 0.2, LAGOS.lng) }));
    expect(fake.flyTo).toHaveBeenCalledTimes(1);
    expect(fake.flyTo.mock.calls[0][0]).toMatchObject({ center: [LAGOS.lng, LAGOS.lat + 0.2], speed: 2 });
    expect(fake.easeTo).not.toHaveBeenCalled();
  });

  it("(e) a second press on a manifest record, which hands the same coords object, reaches the camera", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    act(() => useNavigation.getState().navigate({ kind: "entity", entity: SITE }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    placeCamera(fake, LAGOS.lng, LAGOS.lat, 1.38);
    act(() => useNavigation.getState().navigate({ kind: "entity", entity: SITE }));
    expect(useNavigation.getState().pulseToken).toBe(2);
    expect(fake.flyTo).toHaveBeenCalledTimes(1);
    expect(fake.flyTo.mock.calls[0][0]).toMatchObject({ center: [LAGOS.lng, LAGOS.lat], zoom: 8, speed: 2 });
  });

  it("under reduced motion, a first press makes one ease with no essential key", () => {
    stubReducedMotion();
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    expect(fake.easeTo.mock.calls[0][0]).not.toHaveProperty("essential");
  });

  it("a press's flight carries no essential key, which the library makes a jump under reduced motion", () => {
    stubReducedMotion();
    const { fake } = mount();
    placeCamera(fake, HOUSTON.lng, HOUSTON.lat, 12); // from zoom 12 a press flies
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    expect(fake.flyTo).toHaveBeenCalledTimes(1);
    expect(fake.flyTo.mock.calls[0][0]).not.toHaveProperty("essential");
  });

  it("two quick presses: a second press while the turn is in flight turns again with a second ease of 900 ms and no flight", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    placeCamera(fake, LAGOS.lng - 20, LAGOS.lat, 1.3); // part way through the turn, 20 degrees short of the record
    fake.isMoving.mockReturnValue(true);
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    expect(fake.easeTo).toHaveBeenCalledTimes(2);
    expect(fake.easeTo.mock.calls[1][0]).toStrictEqual({ center: [LAGOS.lng, LAGOS.lat], duration: 900 });
    expect(fake.flyTo).not.toHaveBeenCalled();
  });

  it("a drag between two presses that leaves the centre 2 degrees from the record makes the second press turn again", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    placeCamera(fake, LAGOS.lng, LAGOS.lat + 2, 1.38); // where the drag left the centre after the turn
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    expect(fake.easeTo).toHaveBeenCalledTimes(2);
    expect(fake.easeTo.mock.calls[1][0]).toStrictEqual({ center: [LAGOS.lng, LAGOS.lat], duration: 900 });
    expect(fake.flyTo).not.toHaveBeenCalled();
  });

  it("after a press has moved the camera, a navigate on a record with no place makes no move", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    placeCamera(fake, LAGOS.lng, LAGOS.lat, 1.38); // where the turn leaves the camera
    act(() => useNavigation.getState().navigate({ kind: "account_event", event: accountEvent("ae-1") }));
    expect(useNavigation.getState().pulseToken).toBe(2);
    expect(useNavigation.getState().panTarget).toBeNull();
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    expect(fake.flyTo).not.toHaveBeenCalled();
  });

  it("after a press has moved the camera, a navigate with pan false makes no move", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    placeCamera(fake, LAGOS.lng, LAGOS.lat, 1.38); // where the turn leaves the camera
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t2", HOUSTON.lat, HOUSTON.lng) }, { pan: false }));
    expect(useNavigation.getState().pulseToken).toBe(2);
    expect(useNavigation.getState().panTarget).toBeNull();
    expect(fake.easeTo).toHaveBeenCalledTimes(1);
    expect(fake.flyTo).not.toHaveBeenCalled();
  });
});

describe("useCameraMoves: what the hook tells the deciding function of the record pressed before", () => {
  const sameRecordArgs = () => vi.mocked(pressMove).mock.calls.map((c) => c[2]);
  beforeEach(() => {
    vi.mocked(pressMove).mockClear();
  });

  it("a second press on the same record passes sameRecord true, and a press on another record passes false", () => {
    mount();
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t2", HOUSTON.lat, HOUSTON.lng) }));
    expect(sameRecordArgs()).toStrictEqual([false, true, false]);
  });

  it("reads the same when the bloom clears the pulse in the same act as the press, as it does under reduced motion", () => {
    mount();
    const pressThenClear = (id: string) =>
      act(() => {
        useNavigation.getState().navigate({ kind: "auth", tx: tx(id, LAGOS.lat, LAGOS.lng) });
        useNavigation.getState().clearPulse();
      });
    pressThenClear("t1");
    pressThenClear("t1");
    pressThenClear("t2");
    expect(sameRecordArgs()).toStrictEqual([false, true, false]);
  });

  it("a pan with no press passes sameRecord false, even after two presses on one record", () => {
    mount();
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    act(() => useNavigation.getState().navigate({ kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) }));
    act(() => useNavigation.getState().panTo({ lat: HOUSTON.lat, lng: HOUSTON.lng }));
    expect(sameRecordArgs()).toStrictEqual([false, true, false]);
  });
});

/** Runs every listener the hook put on the fake map for one event type, with the event given. */
function fire(fake: ReturnType<typeof fakeMap>["fake"], type: string, event: object): void {
  for (const [t, listener] of fake.on.mock.calls as [string, (e: object) => void][]) {
    if (t === type) listener(event);
  }
}

/** Two presses on one record from where the camera is: the turn, which the fake ends at the record
 *  at the present zoom, then the flight in, which the fake ends at the record's own zoom. Each move's
 *  `moveend` carries no `originalEvent`, as an app move's does. */
function pressTwice(
  fake: ReturnType<typeof fakeMap>["fake"],
  entity: EntityMatch,
  at: { lng: number; lat: number },
  zoom: number,
): void {
  act(() => useNavigation.getState().navigate(entity));
  placeCamera(fake, at.lng, at.lat, fake.getZoom());
  fire(fake, "moveend", {});
  act(() => useNavigation.getState().navigate(entity));
  placeCamera(fake, at.lng, at.lat, zoom);
  fire(fake, "moveend", {});
}

/** The fake's jump puts its camera where the jump names. */
function jumpMovesCamera(fake: ReturnType<typeof fakeMap>["fake"]): void {
  fake.jumpTo.mockImplementation((o: { center: [number, number]; zoom: number }) =>
    placeCamera(fake, o.center[0], o.center[1], o.zoom));
}

const signIn = (id: string, lat: number, lng: number): LoginEvent =>
  ({ id, ip_lat: lat, ip_lng: lng, timestamp: "1970-01-01T00:00:04Z" }) as unknown as LoginEvent;

/** The opening view of the card story, as the fake's scenario home gives it. */
const HOME_JUMP = [{ center: [-40, 20], zoom: 2, bearing: 0, pitch: 0 }, { ffrHome: true }];

describe("useCameraMoves: Play after a press goes back to the opening view first", () => {
  const LAGOS_AUTH: EntityMatch = { kind: "auth", tx: tx("t1", LAGOS.lat, LAGOS.lng) };

  it("two presses, then Play, make one marked jump to the opening view and no ease", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    pressTwice(fake, LAGOS_AUTH, LAGOS, 12);
    const easesBefore = fake.easeTo.mock.calls.length;
    act(() => usePlayhead.setState({ isPlaying: true }));
    expect(fake.jumpTo).toHaveBeenCalledTimes(1);
    expect(fake.jumpTo.mock.calls[0]).toStrictEqual(HOME_JUMP);
    expect(fake.easeTo).toHaveBeenCalledTimes(easesBefore);
  });

  it("after that jump, the first follow move waits a twelfth of the span from Play", () => {
    const { fake } = mount();
    jumpMovesCamera(fake);
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    pressTwice(fake, LAGOS_AUTH, LAGOS, 12);
    fake.transform.isLocationOccluded.mockReturnValue(true); // every target is out of view, so only the wait holds the follow
    const easesBefore = fake.easeTo.mock.calls.length;
    act(() => usePlayhead.setState({ isPlaying: true })); // the playhead stands at 3000, where the press put it
    expect(fake.jumpTo).toHaveBeenCalledTimes(1);
    expect(fake.jumpTo.mock.calls[0]).toStrictEqual(HOME_JUMP);
    act(() => usePlayhead.setState({ playhead: 3999 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(easesBefore);
    act(() => usePlayhead.setState({ playhead: 4000 }));
    expect(fake.easeTo).toHaveBeenCalledTimes(easesBefore + 1);
    expect(fake.jumpTo.mock.invocationCallOrder[0]).toBeLessThan(fake.easeTo.mock.invocationCallOrder[easesBefore]);
  });

  it("after a turn at a rest at the record's own zoom, Play makes the marked jump", () => {
    const { fake } = mount();
    const A = { lng: 10, lat: 45 };
    const B = { lng: 12, lat: 45 }; // the same latitude, about 1.4 degrees from A
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    pressTwice(fake, { kind: "login", login: signIn("l1", A.lat, A.lng) }, A, 10);
    act(() => useNavigation.getState().navigate({ kind: "login", login: signIn("l2", B.lat, B.lng) }));
    expect(fake.easeTo.mock.calls.at(-1)?.[0]).toStrictEqual({ center: [B.lng, B.lat], duration: 900 });
    placeCamera(fake, B.lng, B.lat, 10); // the turn keeps the zoom of 10
    fire(fake, "moveend", {});
    act(() => usePlayhead.setState({ isPlaying: true }));
    expect(fake.jumpTo).toHaveBeenCalledTimes(1);
    expect(fake.jumpTo.mock.calls[0]).toStrictEqual(HOME_JUMP);
  });

  it("under reduced motion, two presses then Play make the one marked jump and then no ease to the end of the play", () => {
    stubReducedMotion();
    const { fake } = mount();
    jumpMovesCamera(fake);
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    pressTwice(fake, LAGOS_AUTH, LAGOS, 12);
    fake.transform.isLocationOccluded.mockReturnValue(true);
    const easesBefore = fake.easeTo.mock.calls.length;
    act(() => usePlayhead.setState({ isPlaying: true }));
    expect(fake.jumpTo).toHaveBeenCalledTimes(1);
    expect(fake.jumpTo.mock.calls[0]).toStrictEqual(HOME_JUMP);
    for (let t = 4000; t <= 12000; t += 1000) act(() => usePlayhead.setState({ playhead: t }));
    expect(fake.easeTo).toHaveBeenCalledTimes(easesBefore);
  });

  it("Play during a press's flight makes no jump, and a later Play with the camera at the record and its zoom makes one", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    act(() => useNavigation.getState().navigate(LAGOS_AUTH));
    placeCamera(fake, LAGOS.lng, LAGOS.lat, HOME_VIEW.zoom); // where the turn leaves the camera
    fire(fake, "moveend", {});
    act(() => useNavigation.getState().navigate(LAGOS_AUTH));
    expect(fake.flyTo).toHaveBeenCalledTimes(1);
    placeCamera(fake, LAGOS.lng - 5, LAGOS.lat, 6); // the flight in, 5 degrees short of the record at zoom 6
    fake.isMoving.mockReturnValue(true);
    act(() => usePlayhead.setState({ isPlaying: true }));
    expect(fake.jumpTo).not.toHaveBeenCalled();
    placeCamera(fake, LAGOS.lng, LAGOS.lat, 12); // the flight has ended at the record's zoom
    fake.isMoving.mockReturnValue(false);
    fire(fake, "moveend", {});
    act(() => usePlayhead.setState({ isPlaying: false }));
    act(() => usePlayhead.setState({ isPlaying: true }));
    expect(fake.jumpTo).toHaveBeenCalledTimes(1);
    expect(fake.jumpTo.mock.calls[0]).toStrictEqual(HOME_JUMP);
  });

  it("after two presses, a navigate on a record with no place makes no jump by itself, and Play then makes the marked jump", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    pressTwice(fake, LAGOS_AUTH, LAGOS, 12);
    const easesBefore = fake.easeTo.mock.calls.length;
    const flightsBefore = fake.flyTo.mock.calls.length;
    act(() => useNavigation.getState().navigate({ kind: "account_event", event: accountEvent("ae-1") }));
    expect(fake.jumpTo).not.toHaveBeenCalled();
    expect(fake.easeTo).toHaveBeenCalledTimes(easesBefore);
    expect(fake.flyTo).toHaveBeenCalledTimes(flightsBefore);
    act(() => usePlayhead.setState({ isPlaying: true }));
    expect(fake.jumpTo).toHaveBeenCalledTimes(1);
    expect(fake.jumpTo.mock.calls[0]).toStrictEqual(HOME_JUMP);
  });

  // Guards: they pass on a tree where Play never jumps; the tests above show the jump is seen.
  it("a moveend the person made, after the two presses, leaves Play with no jump", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    pressTwice(fake, LAGOS_AUTH, LAGOS, 12);
    fire(fake, "moveend", { originalEvent: {} });
    act(() => usePlayhead.setState({ isPlaying: true }));
    expect(fake.jumpTo).not.toHaveBeenCalled();
  });

  it("a movestart the person made, after the two presses, leaves Play with no jump", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    pressTwice(fake, LAGOS_AUTH, LAGOS, 12);
    fire(fake, "movestart", { originalEvent: {} });
    act(() => usePlayhead.setState({ isPlaying: true }));
    expect(fake.jumpTo).not.toHaveBeenCalled();
  });

  it("a camera 0.3 zoom levels off the press's zoom gets no jump", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    pressTwice(fake, LAGOS_AUTH, LAGOS, 12);
    placeCamera(fake, LAGOS.lng, LAGOS.lat, 12.3);
    act(() => usePlayhead.setState({ isPlaying: true }));
    expect(fake.jumpTo).not.toHaveBeenCalled();
  });

  it("after one press, a turn only from the globe view, Play makes no jump", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    act(() => useNavigation.getState().navigate(LAGOS_AUTH));
    placeCamera(fake, LAGOS.lng, LAGOS.lat, HOME_VIEW.zoom);
    fire(fake, "moveend", {});
    act(() => usePlayhead.setState({ isPlaying: true }));
    expect(fake.jumpTo).not.toHaveBeenCalled();
  });

  it("after two presses, a pan to the record's own place leaves Play with no jump", () => {
    const { fake } = mount();
    placeCamera(fake, HOME_VIEW.lng, HOME_VIEW.lat, HOME_VIEW.zoom);
    pressTwice(fake, LAGOS_AUTH, LAGOS, 12);
    act(() => useNavigation.getState().panTo({ lat: LAGOS.lat, lng: LAGOS.lng })); // the camera stays at the record at zoom 12
    act(() => usePlayhead.setState({ isPlaying: true }));
    expect(fake.jumpTo).not.toHaveBeenCalled();
  });
});

describe("useCameraMoves: its source", () => {
  it("uses no interval timer", () => {
    expect(hookSource).not.toMatch(/setInterval/);
  });

  it("reads no clock and sets no timer", () => {
    expect(hookSource).not.toMatch(/performance\.now|Date\.now|setTimeout|setInterval/);
  });
});
