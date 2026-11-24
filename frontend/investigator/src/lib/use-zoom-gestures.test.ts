/**
 * Tests for useZoomGestures - the buttery scroll/pinch zoom hook.
 *
 * The hook attaches a non-passive wheel listener to the track element, computes
 * a zoom target via zoomedWindow, and eases toward it over rAF frames (EASE=0.28,
 * SNAP_EPS=0.002 → snaps in ~13 frames at 60fps).
 *
 * Test strategy:
 *   - WheelEvent in jsdom does NOT forward MouseEventInit fields (clientX is
 *     undefined after construction). We set clientX via Object.defineProperty
 *     before dispatching, which is the jsdom-safe way to override read-only
 *     event properties.
 *   - getBoundingClientRect is mocked to return a real width (jsdom returns 0).
 *   - rAF queue: we replace window.requestAnimationFrame with a manual queue
 *     before renderHook so the hook's useEffect captures our mock. flushRaf(N)
 *     drains the queue synchronously until snap (SNAP_EPS ≈ 0.002 of span →
 *     ~13 lerp frames; 30 rounds is ample margin).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useZoomGestures } from "./use-zoom-gestures";
import hookSource from "./use-zoom-gestures.ts?raw";
import { usePlayhead } from "../store/playhead";

// ---------------------------------------------------------------------------
// rAF queue - installed on `window` before each test.
// ---------------------------------------------------------------------------
let rafQueue: FrameRequestCallback[] = [];

function installRafMock() {
  rafQueue = [];
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  window.cancelAnimationFrame = (_id: number): void => {};
}

function flushRaf(rounds = 30) {
  for (let i = 0; i < rounds; i++) {
    const pending = rafQueue.splice(0);
    if (pending.length === 0) break;
    for (const cb of pending) cb(performance.now());
  }
}

// ---------------------------------------------------------------------------
// WheelEvent helper - jsdom WheelEvent drops clientX from init; patch it.
// ---------------------------------------------------------------------------
function makeWheelEvent(deltaY: number, clientX: number): WheelEvent {
  const e = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
  Object.defineProperty(e, "clientX", { value: clientX, configurable: true });
  return e;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  installRafMock();
  usePlayhead.setState({
    minTime: 0,
    maxTime: 10_000,
    windowMin: 0,
    windowMax: 10_000,
    playhead: 5_000,
    isPlaying: false,
    playbackRate: 1,
    isScrubbing: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rafQueue = [];
});

// ---------------------------------------------------------------------------
// Helper: build a div with a mocked bounding rect and attach the hook.
// ---------------------------------------------------------------------------
function setup(clientX = 500, rectWidth = 1000, inset?: number) {
  const el = document.createElement("div");
  document.body.appendChild(el);

  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: rectWidth,
      bottom: 100,
      width: rectWidth,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  const { unmount } = renderHook(() => {
    const ref = useRef<HTMLDivElement>(el);
    // With no inset argument the hook is called as it is today, with the ref alone.
    if (inset === undefined) useZoomGestures(ref);
    else useZoomGestures(ref, inset);
  });

  function wheel(deltaY: number) {
    act(() => {
      el.dispatchEvent(makeWheelEvent(deltaY, clientX));
    });
    flushRaf(30);
  }

  function cleanup() {
    unmount();
    el.remove();
  }

  return { el, wheel, cleanup };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useZoomGestures - scroll-in narrows the window", () => {
  it("a single scroll-in tick (deltaY < 0) sets a narrower target and moves the window toward it", () => {
    const { wheel, cleanup } = setup();
    const before = usePlayhead.getState().windowMax - usePlayhead.getState().windowMin;

    wheel(-100);

    const after = usePlayhead.getState().windowMax - usePlayhead.getState().windowMin;
    expect(after).toBeLessThan(before);
    cleanup();
  });
});

describe("useZoomGestures - scroll-out widens the window", () => {
  it("a scroll-out tick (deltaY > 0) when zoomed in widens the window back toward the data bounds", () => {
    usePlayhead.setState({ windowMin: 2_000, windowMax: 8_000 });
    const { wheel, cleanup } = setup();
    const before = usePlayhead.getState().windowMax - usePlayhead.getState().windowMin;

    wheel(100);

    const after = usePlayhead.getState().windowMax - usePlayhead.getState().windowMin;
    expect(after).toBeGreaterThan(before);
    cleanup();
  });
});

describe("useZoomGestures - zero-span guard", () => {
  it("does nothing when maxTime === minTime (no divide-by-zero)", () => {
    usePlayhead.setState({ minTime: 5_000, maxTime: 5_000, windowMin: 5_000, windowMax: 5_000 });
    const { wheel, cleanup } = setup();

    wheel(-100);

    const { windowMin, windowMax } = usePlayhead.getState();
    expect(windowMin).toBe(5_000);
    expect(windowMax).toBe(5_000);
    cleanup();
  });
});

describe("useZoomGestures - cursor anchoring", () => {
  it("scrolling at the left edge (clientX=0) keeps the left boundary near minTime", () => {
    // ratio=0 → centerMs = windowMin; zoom-in shrinks from the right only.
    const { wheel, cleanup } = setup(0, 1000);
    const minBefore = usePlayhead.getState().windowMin;

    wheel(-100);

    const { windowMin } = usePlayhead.getState();
    expect(windowMin).toBeCloseTo(minBefore, 0);
    cleanup();
  });
});

describe("useZoomGestures - the track's edge pixels reach the window's edges", () => {
  it("scrolling on the last pixel (clientX = width - 1) keeps the right boundary at maxTime, so the latest events stay in view", () => {
    // (x - left) / width tops out at (width - 1) / width: at month scale that last pixel is ~31 minutes, which
    // put the final events (a burst in the case's last minutes) out of reach of any wheel gesture.
    const { wheel, cleanup } = setup(999, 1000);

    wheel(-100);

    expect(usePlayhead.getState().windowMax).toBe(10_000);
    cleanup();
  });
});

describe("useZoomGestures - compounds on existing target", () => {
  it("two rapid scroll-in ticks before rAF fires produce a narrower span than one tick", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.getBoundingClientRect = () =>
      ({
        left: 0, top: 0, right: 1000, bottom: 100,
        width: 1000, height: 100, x: 0, y: 0, toJSON: () => ({}),
      }) as DOMRect;

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(el);
      useZoomGestures(ref);
    });

    // Fire two ticks before flushing - second compounds on first's target.
    act(() => {
      el.dispatchEvent(makeWheelEvent(-100, 500));
      el.dispatchEvent(makeWheelEvent(-100, 500));
    });
    flushRaf(30);

    const span = usePlayhead.getState().windowMax - usePlayhead.getState().windowMin;
    // Two ZOOM_IN (0.88) compounds: 10000 * 0.88² ≈ 7744 < 8800 (one tick).
    expect(span).toBeLessThan(10_000 * 0.88);

    unmount();
    el.remove();
  });
});

describe("useZoomGestures - cleanup on unmount", () => {
  it("wheel events after unmount do not mutate the store", () => {
    const { el, cleanup } = setup();
    cleanup();

    const beforeMin = usePlayhead.getState().windowMin;
    const beforeMax = usePlayhead.getState().windowMax;

    act(() => {
      el.dispatchEvent(makeWheelEvent(-100, 500));
    });
    flushRaf(5);

    expect(usePlayhead.getState().windowMin).toBe(beforeMin);
    expect(usePlayhead.getState().windowMax).toBe(beforeMax);
  });
});

// ---------------------------------------------------------------------------
// The inset: the px at the left of the element that the plot does not use (the name column).
// 148 is the name column's width in the design; the hook takes any value.
// ---------------------------------------------------------------------------
const INSET = 148;

// The window one wheel turn gives as the hook stood when this test was written, worked by hand from its formula: deltaY -100, clientX 250
// over a 1000 px element, store window 0 to 10000. Ratio = (250 - 0) / max(1, 1000 - 1) = 250 / 999. The anchor is
// 0 + (250 / 999) * 10000 = 2502.5025. One ZOOM_IN step (0.88) makes the span 8800, and zoomedWindow keeps the anchor's
// fraction of the span, so lo = 2502.5025 - (250 / 999) * 8800 = 300.3003 and hi = lo + 8800 = 9100.3003. Dropping the
// "- 1" (250 / 1000) would give 300 and 9100, 0.3 away, which the two-digit tolerance of toBeCloseTo tells apart.
const TIP_WINDOW = { min: 300.3003, max: 9100.3003 };

function windowAfterWheel(run: () => void): { min: number; max: number } {
  usePlayhead.setState({ windowMin: 0, windowMax: 10_000 });
  run();
  const s = usePlayhead.getState();
  return { min: s.windowMin, max: s.windowMax };
}

describe("useZoomGestures - the inset", () => {
  it("a wheel at x over an element with a 148 px inset gives the window a wheel at x over the plot alone gives", () => {
    const x = 250;
    // Plot alone: 1000 px wide, no column.
    const alone = setup(x, 1000);
    const plain = windowAfterWheel(() => alone.wheel(-100));
    alone.cleanup();
    // The same plot with the column to its left: the element is 148 px wider and the pointer is 148 px further right.
    const inset = setup(INSET + x, 1000 + INSET, INSET);
    const withColumn = windowAfterWheel(() => inset.wheel(-100));
    inset.cleanup();

    expect(withColumn).toEqual(plain);
    // Both are the tip's literal window: the inset-adjusted denominator (1148 - 148 - 1) is pinned by number, not by
    // equality with the other case alone.
    expect(plain.min).toBeCloseTo(TIP_WINDOW.min, 2);
    expect(plain.max).toBeCloseTo(TIP_WINDOW.max, 2);
    expect(withColumn.min).toBeCloseTo(TIP_WINDOW.min, 2);
    expect(withColumn.max).toBeCloseTo(TIP_WINDOW.max, 2);
    // The wheel did anchor off the left edge, so the test is not comparing two unmoved windows.
    expect(plain.max - plain.min).toBeLessThan(10_000);
    expect(plain.min).toBeGreaterThan(0);
  });

  it("the last pixel of the element still reaches the window's right edge when the column is drawn", () => {
    const { wheel, cleanup } = setup(1000 + INSET - 1, 1000 + INSET, INSET);
    wheel(-100);
    expect(usePlayhead.getState().windowMax).toBe(10_000);
    cleanup();
  });

  it("a pointer over the column itself anchors at the window's left edge", () => {
    const { wheel, cleanup } = setup(50, 1000 + INSET, INSET);
    wheel(-100);
    expect(usePlayhead.getState().windowMin).toBe(0);
    expect(usePlayhead.getState().windowMax).toBeLessThan(10_000);
    cleanup();
  });

  it("a changed inset is used by the next wheel without remounting", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.getBoundingClientRect = () =>
      ({
        left: 0, top: 0, right: 1000 + INSET, bottom: 100,
        width: 1000 + INSET, height: 100, x: 0, y: 0, toJSON: () => ({}),
      }) as DOMRect;
    const { rerender, unmount } = renderHook(
      ({ inset }: { inset: number }) => {
        const ref = useRef<HTMLDivElement>(el);
        useZoomGestures(ref, inset);
      },
      { initialProps: { inset: 0 } },
    );
    rerender({ inset: INSET });

    const withColumn = windowAfterWheel(() => {
      act(() => {
        el.dispatchEvent(makeWheelEvent(-100, INSET + 250));
      });
      flushRaf(30);
    });
    unmount();
    el.remove();

    const alone = setup(250, 1000);
    const plain = windowAfterWheel(() => alone.wheel(-100));
    alone.cleanup();
    expect(withColumn).toEqual(plain);
  });

  // Pin: holds today and stays green. The literal is the tip's window (TIP_WINDOW), so a change to today's
  // window cannot hide behind both calls moving together.
  it("no inset gives the window it gives today, and an inset of 0 is the same", () => {
    const none = setup(250, 1000);
    const a = windowAfterWheel(() => none.wheel(-100));
    none.cleanup();
    const zero = setup(250, 1000, 0);
    const b = windowAfterWheel(() => zero.wheel(-100));
    zero.cleanup();
    expect(a.min).toBeCloseTo(TIP_WINDOW.min, 2);
    expect(a.max).toBeCloseTo(TIP_WINDOW.max, 2);
    expect(b).toEqual(a);
  });

  // Pin: holds today and stays green. The column's width reaches the hook as an argument and is not read from the DOM.
  it("the hook's source reads no dataset", () => {
    expect(hookSource).not.toMatch(/dataset/);
  });
});
