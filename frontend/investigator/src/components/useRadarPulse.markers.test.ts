/**
 * useRadarPulse reads mapRef, mapLoadedRef and fraudMarkersRef on every tick, because GlobeMap
 * creates the map after the hook mounts and replaces the marker array on each fraud change.
 * useRadarPulse.test.ts always mounts with a ready map and one fixed marker; here the refs start
 * empty and are filled after the hook is mounted, with several markers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { useRadarPulse } from "./useRadarPulse";
import { usePlayhead } from "../store/playhead";
import { landingFraction, landingScale, LANDING_FRAC } from "../lib/globe-motion";

const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
const realMatchMedia = window.matchMedia;
const realPlayhead = usePlayhead.getState();

let frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
let clock = 0;

function fireFrame(): void {
  clock += 16;
  act(() => {
    const batch = [...frames.values()];
    frames.clear();
    for (const cb of batch) cb(clock);
  });
}

function makeMap() {
  return {
    style: {},
    getSource: vi.fn(() => ({ id: "src" })),
    getLayer: vi.fn((id: string) => ({ id })),
    setFeatureState: vi.fn(),
    setPaintProperty: vi.fn(),
  };
}

type Marker = { id: string; ts: number };

beforeEach(() => {
  frames = new Map();
  frameId = 0;
  clock = 10_000;
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    frameId += 1;
    frames.set(frameId, cb);
    return frameId;
  };
  window.cancelAnimationFrame = (id: number): void => {
    frames.delete(id);
  };
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia;
  usePlayhead.setState({ playhead: 5_000, minTime: 0, maxTime: 100_000 });
});

afterEach(() => {
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCaf;
  window.matchMedia = realMatchMedia;
  usePlayhead.setState({ playhead: realPlayhead.playhead, minTime: realPlayhead.minTime, maxTime: realPlayhead.maxTime });
});

describe("useRadarPulse reads its refs on every tick", () => {
  // Guards against the landing loop stopping after the first marker.
  it("writes a landing for every marker, from a map and an array set after mount", () => {
    const mapRef: MutableRefObject<ReturnType<typeof makeMap> | null> = { current: null };
    const mapLoadedRef = { current: false };
    const fraudMarkersRef: MutableRefObject<Marker[]> = { current: [] };
    const view = renderHook(() =>
      useRadarPulse({ mapRef: mapRef as never, mapLoadedRef, fraudMarkersRef }),
    );

    // GlobeMap's first render: no map yet. Ticks run and write nothing.
    fireFrame();
    fireFrame();
    expect(frames.size).toBe(1);

    // The map is created and loads; the fraud set arrives as a replaced array of three markers
    // with different event times, so each landing value is its own.
    const map = makeMap();
    mapRef.current = map;
    mapLoadedRef.current = true;
    const markers: Marker[] = [
      { id: "f1", ts: 4_990 },
      { id: "f2", ts: 4_000 },
      { id: "f3", ts: 9_000 },
    ];
    fraudMarkersRef.current = markers;
    fireFrame();

    const span = (100_000 - 0) * LANDING_FRAC;
    const wants = markers.map((m) => ({ id: m.id, land: landingScale(landingFraction(5_000, m.ts, span)) }));
    // The three markers must not all land alike, or the check could not tell them apart.
    expect(new Set(wants.map((w) => w.land)).size).toBeGreaterThan(1);
    expect(map.setFeatureState).toHaveBeenCalledTimes(3);
    for (const w of wants) {
      expect(map.setFeatureState).toHaveBeenCalledWith({ source: "ml-auths", id: w.id }, { land: w.land });
    }

    // The array is replaced again (a fraud change in GlobeMap): the next tick follows the new one.
    map.setFeatureState.mockClear();
    fraudMarkersRef.current = [{ id: "f9", ts: 0 }, { id: "f8", ts: 1 }];
    fireFrame();
    expect(map.setFeatureState.mock.calls.map(([t]) => (t as { id: string }).id)).toEqual(["f9", "f8"]);

    // And an emptied set writes no landing at all.
    map.setFeatureState.mockClear();
    fraudMarkersRef.current = [];
    fireFrame();
    expect(map.setFeatureState).not.toHaveBeenCalled();
    view.unmount();
  });
});
