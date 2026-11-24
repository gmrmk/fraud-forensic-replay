/**
 * useRadarPulse - the at-rest pulse driver (radar rings + pin-drop landing) on lib/tween,
 * driven here by a manual frame queue. Every frame loop is capped, so no test can hang.
 * happy-dom has no prefers-reduced-motion query, so each test stubs window.matchMedia.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRadarPulse } from "./useRadarPulse";
import { usePlayhead } from "../store/playhead";
import { landingFraction, landingScale, LANDING_FRAC, ringFrame, RADAR_STILL_PHASE } from "../lib/globe-motion";

const MAX_FRAMES = 200;
const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
const realMatchMedia = window.matchMedia;
const realPlayhead = usePlayhead.getState();

let frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
let clock = 0;

function installFrameQueue(): void {
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
}

function stubReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
    media: query,
  })) as unknown as typeof window.matchMedia;
}

/** Fire every queued frame once at an explicit timestamp. */
function fireAt(ts: number): void {
  clock = ts;
  act(() => {
    const batch = [...frames.values()];
    frames.clear();
    for (const cb of batch) cb(clock);
  });
}

/** Fire n frames, 16 ms apart; n is capped so a test can never loop long. */
function fireFrames(n: number): void {
  if (n > MAX_FRAMES) throw new Error(`asked for ${n} frames, the cap is ${MAX_FRAMES}`);
  for (let i = 0; i < n; i++) fireAt(clock + 16);
}

function makeMap(opts: { hasSource?: boolean; hasLayers?: boolean } = {}) {
  const { hasSource = true, hasLayers = true } = opts;
  return {
    style: {},
    getSource: vi.fn(() => (hasSource ? { id: "src" } : undefined)),
    getLayer: vi.fn((id: string) => (hasLayers ? { id } : undefined)),
    setFeatureState: vi.fn(),
    setPaintProperty: vi.fn(),
  };
}

type FakeMap = ReturnType<typeof makeMap>;

function mount(map: FakeMap, opts: { loaded?: boolean; fraud?: { id: string; ts: number }[] } = {}) {
  const { loaded = true, fraud = [{ id: "f1", ts: 0 }] } = opts;
  return renderHook(() =>
    useRadarPulse({
      mapRef: { current: map as never },
      mapLoadedRef: { current: loaded },
      fraudMarkersRef: { current: fraud },
    }),
  );
}

/** The ring paint writes ([layer, prop, value]) so far, in call order. */
function ringWrites(map: FakeMap): Array<[string, string, number]> {
  return map.setPaintProperty.mock.calls
    .filter(([layer]) => String(layer).startsWith("ml-fraud-ping-"))
    .map(([layer, prop, value]) => [layer as string, prop as string, value as number]);
}

describe("useRadarPulse", () => {
  beforeEach(() => {
    installFrameQueue();
    stubReducedMotion(false);
    usePlayhead.setState({ playhead: 1_500, minTime: 0, maxTime: 100_000 });
  });
  afterEach(() => {
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCaf;
    window.matchMedia = realMatchMedia;
    usePlayhead.setState({
      playhead: realPlayhead.playhead,
      minTime: realPlayhead.minTime,
      maxTime: realPlayhead.maxTime,
    });
  });

  it("the first frame writes the rings at phase 0 and the landing through the guard", () => {
    const map = makeMap();
    const view = mount(map);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
    fireAt(clock + 16);
    const want = ringFrame(0);
    const writes = ringWrites(map);
    expect(writes).toHaveLength(9);
    want.forEach((f, i) => {
      expect(writes[i * 3]).toEqual([`ml-fraud-ping-${i}`, "circle-radius", f.radiusPx]);
      expect(writes[i * 3 + 1]).toEqual([`ml-fraud-ping-${i}`, "circle-stroke-opacity", f.strokeOpacity]);
      expect(writes[i * 3 + 2]).toEqual([`ml-fraud-ping-${i}`, "circle-stroke-width", f.strokeWidthPx]);
    });
    // Playhead 1,500 is one full landing span (0.015 of 100,000) past the event: landed, scale 1.
    expect(map.setFeatureState).toHaveBeenCalledTimes(1);
    expect(map.setFeatureState).toHaveBeenCalledWith(
      { source: "ml-auths", id: "f1" },
      { land: landingScale(landingFraction(1_500, 0, 100_000 * LANDING_FRAC)) },
    );
    view.unmount();
  });

  it("writes nothing while the map is not loaded", () => {
    const map = makeMap();
    const view = mount(map, { loaded: false });
    fireFrames(3);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
    expect(map.setFeatureState).not.toHaveBeenCalled();
    view.unmount();
  });

  it("skips a ring layer that does not exist", () => {
    const map = makeMap({ hasLayers: false });
    const view = mount(map);
    fireFrames(2);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
    view.unmount();
  });

  // M12: the cleanup cancels the tween.
  it("an unmount cancels the pending frame, and a stale callback writes nothing", () => {
    const map = makeMap();
    const view = mount(map);
    fireFrames(2);
    expect(frames.size).toBe(1);
    const stale = [...frames.values()];
    map.setPaintProperty.mockClear();
    map.setFeatureState.mockClear();
    view.unmount();
    expect(frames.size).toBe(0);
    for (const cb of stale) cb(clock + 16);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
    expect(map.setFeatureState).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  // M13: the radar loops.
  it("keeps writing rings and landing past 2,400 ms and wraps to phase 0", () => {
    const map = makeMap();
    const view = mount(map);
    // Frame 1 is elapsed 0; frame 151 is elapsed 2,400 ms, where the sawtooth wraps to 0.
    fireFrames(151);
    expect(frames.size).toBe(1);
    const wrapRadius = ringFrame(0)[0].radiusPx;
    const lastRing0 = ringWrites(map)
      .filter(([layer, prop]) => layer === "ml-fraud-ping-0" && prop === "circle-radius")
      .pop();
    expect(lastRing0?.[2]).toBeCloseTo(wrapRadius, 9);
    for (let i = 0; i < 3; i++) {
      map.setPaintProperty.mockClear();
      map.setFeatureState.mockClear();
      fireFrames(1);
      expect(map.setPaintProperty).toHaveBeenCalledTimes(9);
      expect(map.setFeatureState).toHaveBeenCalledTimes(1);
      expect(frames.size).toBe(1);
    }
    view.unmount();
  });

  // M14: under reduced motion the rings hold the still phase.
  it("under reduced motion the ring writes are identical at two times and every ring is visible", () => {
    stubReducedMotion(true);
    const map = makeMap();
    const view = mount(map);
    const start = clock + 16;
    fireAt(start);
    const first = ringWrites(map);
    map.setPaintProperty.mockClear();
    fireAt(start + 800);
    const second = ringWrites(map);
    expect(first).toHaveLength(9);
    expect(second).toEqual(first);
    map.setPaintProperty.mockClear();
    fireAt(start + 1_700);
    expect(ringWrites(map)).toEqual(first);
    const still = ringFrame(RADAR_STILL_PHASE);
    still.forEach((f, i) => expect(first[i * 3 + 1][2]).toBeCloseTo(f.strokeOpacity, 9));
    for (let i = 0; i < 3; i++) expect(first[i * 3 + 1][2]).toBeGreaterThan(0.2);
    view.unmount();
  });

  it("with motion allowed the ring writes differ between two times", () => {
    const map = makeMap();
    const view = mount(map);
    const start = clock + 16;
    fireAt(start);
    const first = ringWrites(map);
    map.setPaintProperty.mockClear();
    fireAt(start + 800);
    expect(ringWrites(map)).not.toEqual(first);
    view.unmount();
  });

  it("under reduced motion the landing keeps writing from the playhead", () => {
    stubReducedMotion(true);
    const map = makeMap();
    const view = mount(map);
    fireFrames(2);
    expect(map.setFeatureState).toHaveBeenCalledTimes(2);
    act(() => {
      usePlayhead.setState({ playhead: -10_000 });
    });
    map.setFeatureState.mockClear();
    fireFrames(1);
    // Before the event: not landed yet, scale 0.
    expect(map.setFeatureState).toHaveBeenCalledWith({ source: "ml-auths", id: "f1" }, { land: 0 });
    view.unmount();
  });

  // The landing write goes through the guard.
  it("a map whose marker source is gone is left alone: no throw, no setFeatureState", () => {
    const map = makeMap({ hasSource: false });
    // A raw setFeatureState on a missing source throws in maplibre; mirror that here.
    map.setFeatureState.mockImplementation(() => {
      throw new Error("The source 'ml-auths' does not exist in the map's style");
    });
    const view = mount(map, { fraud: [{ id: "f1", ts: 0 }, { id: "f2", ts: 5 }] });
    expect(() => fireFrames(3)).not.toThrow();
    expect(map.setFeatureState).not.toHaveBeenCalled();
    view.unmount();
  });

  // FIX-2026-11-15 (lost WebGL context): maplibre drops its style when the context is lost,
  // and getLayer then throws. A throw inside the frame ended the loop for the life of the page.
  it("a map without a style is left alone, and the loop writes again when the style is back", () => {
    const map = makeMap();
    const view = mount(map);
    fireFrames(1);
    expect(ringWrites(map)).toHaveLength(9);

    (map as { style: unknown }).style = null;
    map.getLayer.mockImplementation(() => {
      throw new TypeError("Cannot read properties of null (reading 'getLayer')");
    });
    map.getSource.mockImplementation(() => {
      throw new TypeError("Cannot read properties of null (reading 'getSource')");
    });
    expect(() => fireFrames(3)).not.toThrow();
    expect(ringWrites(map)).toHaveLength(9);
    expect(map.setFeatureState).toHaveBeenCalledTimes(1);

    // The context returns: the same loop writes again, so it did not die on the frames above.
    (map as { style: unknown }).style = {};
    map.getLayer.mockImplementation((id: string) => ({ id }));
    map.getSource.mockImplementation(() => ({ id: "src" }));
    fireFrames(1);
    expect(ringWrites(map)).toHaveLength(18);
    expect(map.setFeatureState).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
