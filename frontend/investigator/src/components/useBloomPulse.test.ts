/**
 * The bloom/marker pulse animation callbacks must not throw when they
 * fire against a map whose style swapped. A theme flip does a destructive
 * `setStyle({diff:false})` (wipes sources/layers) and reloads the style; an
 * in-flight tween callback (~600ms marker / PULSE_DURATION_MS cascade) then
 * hits a removed source/layer, throwing:
 *   - "The source 'ml-auths' does not exist in the map's style" (setFeatureState)
 *   - "Style is not done loading." (setData / setPaintProperty)
 *
 * The contract: a late pulse throws nothing and writes only to a source or layer
 * that exists. The guards check the specific `getSource`/`getLayer` existence and
 * return early when `map.style` is missing (a removed map). They do NOT ask
 * `isStyleLoaded()`: it is false whenever tiles or data are loading, which is
 * every click (the camera flies and the guard's own `setData` reloads the bloom
 * source), so it skipped the bloom and the marker ack. A source or layer that
 * exists implies a loaded style document.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  setFeatureStateGuarded,
  setSourceDataGuarded,
  setPaintPropertyGuarded,
  useBloomPulse,
  type MarkerHandlers,
} from "./useBloomPulse";
import { useNavigation } from "../store/navigation";
import { cascadeFrame } from "../lib/marker-cascade";
import type { LoginEvent, Transaction } from "../types";

/** Minimal mock map exposing only the methods the guards touch, each a spy.
 *  `styleLoaded` is what isStyleLoaded() reports (a loading map reports false). */
function makeMockMap(opts: {
  styleLoaded: boolean;
  hasSource: boolean;
  hasLayer: boolean;
}) {
  return {
    style: {},
    isStyleLoaded: vi.fn(() => opts.styleLoaded),
    getSource: vi.fn(() => (opts.hasSource ? { setData: vi.fn() } : undefined)),
    getLayer: vi.fn(() => (opts.hasLayer ? { id: "layer" } : undefined)),
    setFeatureState: vi.fn(),
    setData: vi.fn(),
    setPaintProperty: vi.fn(),
  };
}

/** A removed map: map.style is gone, so getSource/getLayer would dereference it
 *  and throw. Every method that must not be reached throws, and isStyleLoaded is
 *  a spy so a test can assert the guard never consulted it. */
function makeRemovedMap() {
  const boom = () => {
    throw new TypeError("Cannot read properties of undefined (reading 'getSource')");
  };
  return {
    style: undefined,
    isStyleLoaded: vi.fn(() => false),
    getSource: vi.fn(boom),
    getLayer: vi.fn(boom),
    setFeatureState: vi.fn(),
    setPaintProperty: vi.fn(),
  };
}

describe("setFeatureStateGuarded - the 'source does not exist' throw", () => {
  it("DOES call setFeatureState while tiles load (isStyleLoaded false) when the source exists", () => {
    const map = makeMockMap({ styleLoaded: false, hasSource: true, hasLayer: true });
    expect(() =>
      setFeatureStateGuarded(map as never, "ml-auths", "tx-1", { sel: 1.5 }),
    ).not.toThrow();
    expect(map.setFeatureState).toHaveBeenCalledWith(
      { source: "ml-auths", id: "tx-1" },
      { sel: 1.5 },
    );
  });

  it("does NOT call setFeatureState when the source is missing", () => {
    const map = makeMockMap({ styleLoaded: true, hasSource: false, hasLayer: true });
    setFeatureStateGuarded(map as never, "ml-auths", "tx-1", { sel: 1 });
    expect(map.setFeatureState).not.toHaveBeenCalled();
  });

  it("does NOT call setFeatureState when the source is missing and the style is loading", () => {
    const map = makeMockMap({ styleLoaded: false, hasSource: false, hasLayer: true });
    setFeatureStateGuarded(map as never, "ml-auths", "tx-1", { sel: 1 });
    expect(map.setFeatureState).not.toHaveBeenCalled();
  });

  it("DOES call setFeatureState when the source exists", () => {
    const map = makeMockMap({ styleLoaded: true, hasSource: true, hasLayer: true });
    setFeatureStateGuarded(map as never, "ml-auths", "tx-1", { sel: 1.9 });
    expect(map.getSource).toHaveBeenCalledWith("ml-auths");
    expect(map.setFeatureState).toHaveBeenCalledWith(
      { source: "ml-auths", id: "tx-1" },
      { sel: 1.9 },
    );
  });

  it("returns without throwing or writing when map.style is missing (removed map)", () => {
    const map = makeRemovedMap();
    expect(() =>
      setFeatureStateGuarded(map as never, "ml-auths", "tx-1", { sel: 1 }),
    ).not.toThrow();
    expect(map.isStyleLoaded).not.toHaveBeenCalled();
    expect(map.getSource).not.toHaveBeenCalled();
    expect(map.setFeatureState).not.toHaveBeenCalled();
  });
});

describe("setSourceDataGuarded - the 'Style is not done loading' throw (setData)", () => {
  const fc = { type: "FeatureCollection", features: [] } as never;

  it("DOES call setData while tiles load (isStyleLoaded false) when the source exists", () => {
    const setData = vi.fn();
    const map = {
      style: {},
      isStyleLoaded: vi.fn(() => false),
      getSource: vi.fn(() => ({ setData })),
    };
    expect(() => setSourceDataGuarded(map as never, "ml-bloom", fc)).not.toThrow();
    expect(map.getSource).toHaveBeenCalledWith("ml-bloom");
    expect(setData).toHaveBeenCalledWith(fc);
  });

  it("does NOT throw when the source is missing", () => {
    const map = {
      style: {},
      isStyleLoaded: vi.fn(() => true),
      getSource: vi.fn(() => undefined),
    };
    expect(() => setSourceDataGuarded(map as never, "ml-bloom", fc)).not.toThrow();
  });

  it("does NOT throw when the source is missing and the style is loading", () => {
    const map = {
      style: {},
      isStyleLoaded: vi.fn(() => false),
      getSource: vi.fn(() => undefined),
    };
    expect(() => setSourceDataGuarded(map as never, "ml-bloom", fc)).not.toThrow();
  });

  it("DOES call setData on the source when it exists", () => {
    const setData = vi.fn();
    const map = {
      style: {},
      isStyleLoaded: vi.fn(() => true),
      getSource: vi.fn(() => ({ setData })),
    };
    setSourceDataGuarded(map as never, "ml-bloom", fc);
    expect(map.getSource).toHaveBeenCalledWith("ml-bloom");
    expect(setData).toHaveBeenCalledWith(fc);
  });

  it("returns without throwing when map.style is missing (removed map)", () => {
    const map = makeRemovedMap();
    expect(() => setSourceDataGuarded(map as never, "ml-bloom", fc)).not.toThrow();
    expect(map.isStyleLoaded).not.toHaveBeenCalled();
    expect(map.getSource).not.toHaveBeenCalled();
  });
});

describe("setPaintPropertyGuarded - the 'Style is not done loading' throw (paint)", () => {
  it("DOES call setPaintProperty while tiles load (isStyleLoaded false) when the layer exists", () => {
    const map = makeMockMap({ styleLoaded: false, hasSource: true, hasLayer: true });
    setPaintPropertyGuarded(map as never, "ml-bloom-glow", "circle-radius", 40);
    expect(map.setPaintProperty).toHaveBeenCalledWith("ml-bloom-glow", "circle-radius", 40);
  });

  it("does NOT call setPaintProperty when the layer is missing", () => {
    const map = makeMockMap({ styleLoaded: true, hasSource: true, hasLayer: false });
    setPaintPropertyGuarded(map as never, "ml-bloom-glow", "circle-opacity", 0.5);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
  });

  it("does NOT call setPaintProperty when the layer is missing and the style is loading", () => {
    const map = makeMockMap({ styleLoaded: false, hasSource: true, hasLayer: false });
    setPaintPropertyGuarded(map as never, "ml-bloom-glow", "circle-opacity", 0.5);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
  });

  it("DOES call setPaintProperty when the layer exists", () => {
    const map = makeMockMap({ styleLoaded: true, hasSource: true, hasLayer: true });
    setPaintPropertyGuarded(map as never, "ml-bloom-glow", "circle-radius", 40);
    expect(map.getLayer).toHaveBeenCalledWith("ml-bloom-glow");
    expect(map.setPaintProperty).toHaveBeenCalledWith("ml-bloom-glow", "circle-radius", 40);
  });

  it("returns without throwing or writing when map.style is missing (removed map)", () => {
    const map = makeRemovedMap();
    expect(() =>
      setPaintPropertyGuarded(map as never, "ml-bloom-glow", "circle-radius", 40),
    ).not.toThrow();
    expect(map.isStyleLoaded).not.toHaveBeenCalled();
    expect(map.getLayer).not.toHaveBeenCalled();
    expect(map.setPaintProperty).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The hook itself: the ack and the bloom run on lib/tween, driven here by a
// manual frame queue. Every frame loop is capped, so no test can hang.
// ---------------------------------------------------------------------------

const MAX_FRAMES = 200;
const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
const realMatchMedia = window.matchMedia;

let frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
let framesRequested = 0;
let clock = 0;

function installFrameQueue(): void {
  frames = new Map();
  frameId = 0;
  framesRequested = 0;
  clock = 5_000;
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    frameId += 1;
    framesRequested += 1;
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

/** One 16 ms frame later. The first frame after a pulse starts fixes the tween start (elapsed 0). */
function fireFrame(): void {
  fireAt(clock + 16);
}

/** Fire frames until the condition holds; fail (never hang) after MAX_FRAMES. */
function runUntil(label: string, cond: () => boolean): void {
  for (let i = 0; i < MAX_FRAMES && !cond(); i++) fireFrame();
  if (!cond()) throw new Error(`${label}: not reached within ${MAX_FRAMES} frames`);
}

function makeTx(id: string, lng: number, lat: number): Transaction {
  return { id, merchant_lng: lng, merchant_lat: lat, is_fraud: 0 } as unknown as Transaction;
}

function makeHookMap() {
  const setData = vi.fn();
  return {
    style: {},
    getSource: vi.fn(() => ({ setData })),
    getLayer: vi.fn(() => ({ id: "layer" })),
    setFeatureState: vi.fn(),
    setPaintProperty: vi.fn(),
    setData,
  };
}

type HookMap = ReturnType<typeof makeHookMap>;

function selWrites(map: HookMap, id: string): number[] {
  return map.setFeatureState.mock.calls
    .filter(([target]) => (target as { id: string }).id === id)
    .map(([, state]) => (state as { sel: number }).sel);
}

function makeLogin(id: string, lng: number, lat: number): LoginEvent {
  return { id, ip_lng: lng, ip_lat: lat } as unknown as LoginEvent;
}

function mountPulseHook(map: HookMap) {
  const handlers: MarkerHandlers = {
    transactions: [makeTx("tx-a", 10, 20), makeTx("tx-b", 30, 40)],
    logins: [makeLogin("lg-1", 50, 60)],
    places: [],
    navigate: vi.fn(),
  };
  return renderHook(() =>
    useBloomPulse({
      mapRef: { current: map as never },
      mapLoadedRef: { current: true },
      markerHandlersRef: { current: handlers },
    }),
  );
}

function pulse(id: string): void {
  act(() => {
    useNavigation.setState((s) => ({ pulseEntityId: id, pulseToken: s.pulseToken + 1 }));
  });
}

describe("useBloomPulse - the ack and the bloom on the tween", () => {
  beforeEach(() => {
    installFrameQueue();
    stubReducedMotion(false);
    useNavigation.setState({ pulseEntityId: null, pulseToken: 0 });
  });
  afterEach(() => {
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCaf;
    window.matchMedia = realMatchMedia;
    useNavigation.setState({ pulseEntityId: null, pulseToken: 0 });
  });

  it("a click on a second marker mid-ack leaves the first marker at scale 1", () => {
    const map = makeHookMap();
    const view = mountPulseHook(map);
    pulse("tx-a");
    runUntil("first marker sel above 1.5", () => selWrites(map, "tx-a").some((v) => v > 1.5));

    pulse("tx-b");
    // More frames after the switch: a leaked callback from the first run would
    // write a scaled value again after the reset.
    for (let i = 0; i < 10; i++) fireFrame();

    const first = selWrites(map, "tx-a");
    expect(first[first.length - 1]).toBe(1);
    expect(selWrites(map, "tx-b").length).toBeGreaterThan(0);
    // Both transactions are plain auths, so every sel write goes to the auth source.
    expect(map.setFeatureState.mock.calls.length).toBeGreaterThan(0);
    for (const [target] of map.setFeatureState.mock.calls) {
      const t = target as { source: string; id: string };
      expect(t.source).toBe("ml-auths");
      expect(["tx-a", "tx-b"]).toContain(t.id);
    }
    view.unmount();
  });

  it("a login marker's ack goes to the login source", () => {
    const map = makeHookMap();
    const view = mountPulseHook(map);
    pulse("lg-1");
    runUntil("login sel above 1.5", () => selWrites(map, "lg-1").some((v) => v > 1.5));
    expect(map.setFeatureState.mock.calls.length).toBeGreaterThan(0);
    for (const [target] of map.setFeatureState.mock.calls) {
      expect(target).toEqual({ source: "ml-logins", id: "lg-1" });
    }
    view.unmount();
  });

  it("a click on a second marker mid-bloom leaves exactly one bloom running and the pulse set until its own end", () => {
    const map = makeHookMap();
    const view = mountPulseHook(map);
    pulse("tx-a");
    for (let i = 0; i < 5; i++) fireFrame();
    pulse("tx-b");
    for (let i = 1; i <= 82; i++) {
      map.setPaintProperty.mockClear();
      fireFrame();
      // Eight bloom writes a frame: a first bloom left running would make sixteen.
      expect(map.setPaintProperty, `frame ${i} after the switch`).toHaveBeenCalledTimes(8);
      expect(useNavigation.getState().pulseEntityId, `frame ${i} after the switch`).toBe("tx-b");
    }
    // The 83rd frame after the switch is at elapsed 1,312 ms: the bloom ends and clears the pulse.
    fireFrame();
    expect(useNavigation.getState().pulseEntityId).toBeNull();
    view.unmount();
  });

  it("the ack follows the owner's curve: 1.98624 at 160 ms, still pulsing at 1,296 ms, cleared at 1,300 ms", () => {
    const map = makeHookMap();
    const view = mountPulseHook(map);
    pulse("tx-a");
    // Frame 1 starts both tweens (elapsed 0); frame 11 is elapsed 160 ms.
    for (let i = 0; i < 11; i++) fireFrame();
    const writes = selWrites(map, "tx-a");
    expect(writes[10]).toBeGreaterThan(1.98624 - 1e-4);
    expect(writes[10]).toBeLessThan(1.98624 + 1e-4);
    // Frame 82 is elapsed 1,296 ms.
    for (let i = 11; i < 82; i++) fireFrame();
    expect(useNavigation.getState().pulseEntityId).toBe("tx-a");
    // Frame 83 is elapsed 1,312 ms, the first frame at or after 1,300 ms.
    fireFrame();
    expect(useNavigation.getState().pulseEntityId).toBeNull();
    view.unmount();
  });

  it("at 650 ms the eight bloom writes are the cascade's values for half way", () => {
    const map = makeHookMap();
    const view = mountPulseHook(map);
    pulse("tx-a");
    const start = clock + 16;
    fireAt(start);
    map.setPaintProperty.mockClear();
    fireAt(start + 650);
    const f = cascadeFrame(0.5);
    const expected: Array<[string, string, number]> = [
      ["ml-bloom-glow", "circle-radius", f.glow.radius],
      ["ml-bloom-glow", "circle-opacity", f.glow.alpha],
      ["ml-bloom-inner", "circle-radius", f.inner.radius],
      ["ml-bloom-inner", "circle-stroke-opacity", f.inner.alpha],
      ["ml-bloom-inner", "circle-stroke-width", f.inner.lineWidthMinPixels],
      ["ml-bloom-outer", "circle-radius", f.outer.radius],
      ["ml-bloom-outer", "circle-stroke-opacity", f.outer.alpha],
      ["ml-bloom-outer", "circle-stroke-width", f.outer.lineWidthMinPixels],
    ];
    const calls = map.setPaintProperty.mock.calls;
    expect(calls).toHaveLength(8);
    expected.forEach(([layer, prop, value], i) => {
      expect(calls[i][0]).toBe(layer);
      expect(calls[i][1]).toBe(prop);
      expect(calls[i][2]).toBeCloseTo(value, 9);
    });
    view.unmount();
  });

  it("a same-entity re-click (a new token) restarts the ack from 1", () => {
    const map = makeHookMap();
    const view = mountPulseHook(map);
    pulse("tx-a");
    for (let i = 0; i < 10; i++) fireFrame();
    expect(Math.max(...selWrites(map, "tx-a"))).toBeGreaterThan(1.5);
    const before = selWrites(map, "tx-a").length;
    act(() => {
      useNavigation.setState((s) => ({ pulseToken: s.pulseToken + 1 }));
    });
    for (let i = 0; i < 3; i++) fireFrame();
    const after = selWrites(map, "tx-a").slice(before);
    // The cleanup resets the marker, the new run's first frame is elapsed 0, the next one rises again.
    expect(after[0]).toBe(1);
    expect(after[1]).toBeCloseTo(1, 9); // elapsed 0 of the ease, up to float noise
    expect(after[2]).toBeGreaterThan(1);
    expect(after[2]).toBeLessThan(1.5);
    view.unmount();
  });

  it("an unmount mid-bloom writes exactly the three opacity resets", () => {
    const map = makeHookMap();
    const view = mountPulseHook(map);
    pulse("tx-a");
    for (let i = 0; i < 6; i++) fireFrame();
    map.setPaintProperty.mockClear();
    view.unmount();
    const written = map.setPaintProperty.mock.calls.map(([layer, prop, value]) => [layer, prop, value]);
    expect(written).toEqual([
      ["ml-bloom-glow", "circle-opacity", 0],
      ["ml-bloom-inner", "circle-stroke-opacity", 0],
      ["ml-bloom-outer", "circle-stroke-opacity", 0],
    ]);
  });

  it("the cancel also zeroes the three bloom opacities", () => {
    const map = makeHookMap();
    const view = mountPulseHook(map);
    pulse("tx-a");
    runUntil("first marker sel above 1.5", () => selWrites(map, "tx-a").some((v) => v > 1.5));
    map.setPaintProperty.mockClear();
    view.unmount();
    const zeroed = map.setPaintProperty.mock.calls
      .filter(([, prop, value]) => /opacity$/.test(prop as string) && value === 0)
      .map(([layer]) => layer);
    expect(new Set(zeroed)).toEqual(new Set(["ml-bloom-glow", "ml-bloom-inner", "ml-bloom-outer"]));
  });

  it("a pulse that runs to the end settles the marker at 1, clears the pulse and zeroes the bloom", () => {
    const map = makeHookMap();
    const view = mountPulseHook(map);
    pulse("tx-a");
    runUntil("pulse cleared", () => useNavigation.getState().pulseEntityId === null);
    const writes = selWrites(map, "tx-a");
    expect(Math.max(...writes)).toBeGreaterThan(1.5);
    expect(writes[writes.length - 1]).toBe(1);
    const lastGlow = map.setPaintProperty.mock.calls
      .filter(([layer, prop]) => layer === "ml-bloom-glow" && prop === "circle-opacity")
      .pop();
    expect(lastGlow?.[2]).toBe(0);
    view.unmount();
  });

  it("under reduced motion the ack and the bloom do not play and the pulse clears at once", () => {
    stubReducedMotion(true);
    const map = makeHookMap();
    const view = mountPulseHook(map);
    pulse("tx-a");

    expect(framesRequested).toBe(0);
    expect(useNavigation.getState().pulseEntityId).toBeNull();
    // The reduced-motion branch returns before any ack write, so there are none: the count is
    // pinned (the old loop over the writes ran zero times and asserted nothing).
    expect(selWrites(map, "tx-a")).toHaveLength(0);
    expect(map.setFeatureState).not.toHaveBeenCalled();
    for (const v of selWrites(map, "tx-a")) expect(v).toBe(1);
    // The bloom is still positioned and tinted, then left at zero opacity.
    expect(map.setData).toHaveBeenCalledTimes(1);
    const radiusWrites = map.setPaintProperty.mock.calls.filter(([, prop]) => prop === "circle-radius");
    expect(radiusWrites).toHaveLength(0);
    const opacityWrites = map.setPaintProperty.mock.calls.filter(([, prop]) =>
      /opacity$/.test(prop as string),
    );
    expect(opacityWrites.length).toBeGreaterThan(0);
    for (const call of opacityWrites) expect(call[2]).toBe(0);
    view.unmount();
  });
});
