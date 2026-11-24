/**
 * Tests for lib/tween.ts - the small frame-timestamp tween that replaced the
 * investigator's three anime.js calls (the ack, the bloom, the radar).
 *
 * Parity: ACK_SAMPLES below were captured once on 2026-11-14 from anime.js 4.4.1
 * with seek() at fixed elapsed times (values 1, 1.9, 1; 600 ms; outBack). They are
 * frozen literals; this test never imports the library.
 *
 * Frames are driven by a manual scheduler that records callbacks and fires them
 * with chosen timestamps, so no test reads a real clock and no loop can hang.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  linear,
  outBack,
  prefersReducedMotion,
  tween,
  type FrameScheduler,
} from "./tween";

/** [elapsed ms, value] from anime.js 4.4.1 seek(), captured 2026-11-14. */
const ACK_SAMPLES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [10, 1.13469], [20, 1.25712], [30, 1.36783], [40, 1.46736], [50, 1.55625],
  [60, 1.63504], [70, 1.70427], [80, 1.76448], [90, 1.81621], [100, 1.86],
  [110, 1.89639], [120, 1.92592], [130, 1.94913], [140, 1.96656], [150, 1.97875],
  [160, 1.98624], [170, 1.98957], [180, 1.98928], [190, 1.98591], [200, 1.98],
  [210, 1.97209], [220, 1.96272], [230, 1.95243], [240, 1.94176], [250, 1.93125],
  [260, 1.92144], [270, 1.91287], [280, 1.90608], [290, 1.90161], [300, 1.9],
  [310, 1.76531], [320, 1.64288], [330, 1.53217], [340, 1.43264], [350, 1.34375],
  [360, 1.26496], [370, 1.19573], [380, 1.13552], [390, 1.08379], [400, 1.04],
  [410, 1.00361], [420, 0.97408], [430, 0.95087], [440, 0.93344], [450, 0.92125],
  [460, 0.91376], [470, 0.91043], [480, 0.91072], [490, 0.91409], [500, 0.92],
  [510, 0.92791], [520, 0.93728], [530, 0.94757], [540, 0.95824], [550, 0.96875],
  [560, 0.97856], [570, 0.98713], [580, 0.99392], [590, 0.99839], [600, 1],
];

const BLOOM_SAMPLES: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [650, 0.5], [1300, 1],
];

/** Looping 0 to 1 over 2400 ms, linear. */
const RADAR_SAMPLES: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1200, 0.5], [2300, 0.95833], [2400, 0], [2500, 0.04167], [3600, 0.5], [4800, 0],
];

const T0 = 1000;

/** Records frame callbacks; the test fires them with chosen timestamps. */
class ManualScheduler implements FrameScheduler {
  private next = 1;
  private pending = new Map<number, (ts: number) => void>();
  requested = 0;
  cancelled: number[] = [];

  request(cb: (ts: number) => void): number {
    const id = this.next++;
    this.requested += 1;
    this.pending.set(id, cb);
    return id;
  }

  cancel(id: number): void {
    this.cancelled.push(id);
    this.pending.delete(id);
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Callbacks currently queued, so a test can fire one after a cancel. */
  snapshot(): Array<(ts: number) => void> {
    return [...this.pending.values()];
  }

  /** Fire every queued callback once with this timestamp. */
  fire(ts: number): void {
    const batch = [...this.pending.entries()];
    this.pending.clear();
    for (const [, cb] of batch) cb(ts);
  }
}

describe("easing", () => {
  it("linear is the identity", () => {
    expect(linear(0)).toBe(0);
    expect(linear(0.25)).toBe(0.25);
    expect(linear(1)).toBe(1);
  });

  it("outBack starts at 0, ends at 1 and overshoots past 1 with overshoot 1.7", () => {
    expect(outBack(0)).toBeCloseTo(0, 12);
    expect(outBack(1)).toBeCloseTo(1, 12);
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => outBack((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1.09);
    expect(peak).toBeLessThan(1.11);
  });
});

describe("tween parity with the frozen anime.js 4.4.1 samples", () => {
  // The samples carry 5 decimals, so an exact formula is within about 5e-6 of each. 5e-5 is tight
  // enough to tell the overshoot 1.7 from the textbook 1.70158.
  it("the ack (1, 1.9, 1; 600 ms; outBack) matches every sample within 5e-5", () => {
    expect(ACK_SAMPLES).toHaveLength(61);
    for (const [elapsed, expected] of ACK_SAMPLES) {
      const sched = new ManualScheduler();
      const seen: number[] = [];
      tween(
        { values: [1, 1.9, 1], duration: 600, ease: outBack, onUpdate: (v) => seen.push(v) },
        sched,
      );
      sched.fire(T0); // the first frame fixes the start
      if (elapsed > 0) sched.fire(T0 + elapsed);
      const got = seen[seen.length - 1];
      expect(Math.abs(got - expected), `elapsed ${elapsed}: got ${got}, want ${expected}`).toBeLessThanOrEqual(5e-5);
    }
  });

  it("the ack peaks at 170 ms and dips at 470 ms as the reference does", () => {
    const sched = new ManualScheduler();
    const seen = new Map<number, number>();
    let now = 0;
    tween(
      { values: [1, 1.9, 1], duration: 600, ease: outBack, onUpdate: (v) => seen.set(now, v) },
      sched,
    );
    for (now = 0; now <= 600; now += 10) sched.fire(T0 + now);
    const entries = [...seen.entries()];
    const peak = entries.filter(([e]) => e <= 300).reduce((a, b) => (b[1] > a[1] ? b : a));
    const dip = entries.filter(([e]) => e >= 300).reduce((a, b) => (b[1] < a[1] ? b : a));
    expect(peak[0]).toBe(170);
    expect(dip[0]).toBe(470);
  });

  it("the bloom (0, 1; 1300 ms; linear) matches its linear values", () => {
    for (const [elapsed, expected] of BLOOM_SAMPLES) {
      const sched = new ManualScheduler();
      const seen: number[] = [];
      tween({ values: [0, 1], duration: 1300, ease: linear, onUpdate: (v) => seen.push(v) }, sched);
      sched.fire(T0);
      if (elapsed > 0) sched.fire(T0 + elapsed);
      expect(Math.abs(seen[seen.length - 1] - expected)).toBeLessThanOrEqual(0.001);
    }
  });

  it("the radar (0, 1; 2400 ms; linear; loop) matches its sawtooth values", () => {
    for (const [elapsed, expected] of RADAR_SAMPLES) {
      const sched = new ManualScheduler();
      const seen: number[] = [];
      tween(
        { values: [0, 1], duration: 2400, ease: linear, loop: true, onUpdate: (v) => seen.push(v) },
        sched,
      );
      sched.fire(T0);
      if (elapsed > 0) sched.fire(T0 + elapsed);
      expect(Math.abs(seen[seen.length - 1] - expected), `elapsed ${elapsed}`).toBeLessThanOrEqual(0.001);
    }
  });
});

describe("tween lifecycle", () => {
  it("requests a frame at once but writes nothing until the first frame fires", () => {
    const sched = new ManualScheduler();
    const onUpdate = vi.fn();
    tween({ values: [0, 1], duration: 100, ease: linear, onUpdate }, sched);
    expect(sched.pendingCount).toBe(1);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("the first frame renders the first value whatever its timestamp", () => {
    const sched = new ManualScheduler();
    const onUpdate = vi.fn();
    tween({ values: [3, 9], duration: 100, ease: linear, onUpdate }, sched);
    sched.fire(987_654);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(3);
  });

  it("onComplete fires once, after the last onUpdate, which carries the last value", () => {
    const sched = new ManualScheduler();
    const log: string[] = [];
    tween(
      {
        values: [0, 1],
        duration: 1300,
        ease: linear,
        onUpdate: (v) => log.push(`u${v}`),
        onComplete: () => log.push("done"),
      },
      sched,
    );
    sched.fire(T0);
    sched.fire(T0 + 650);
    sched.fire(T0 + 1300);
    // A late frame after completion has nothing queued to run.
    sched.fire(T0 + 1400);
    expect(log).toEqual(["u0", "u0.5", "u1", "done"]);
  });

  it("a frame far past the end still ends on the last value, once", () => {
    const sched = new ManualScheduler();
    const onUpdate = vi.fn();
    const onComplete = vi.fn();
    tween({ values: [1, 1.9, 1], duration: 600, ease: outBack, onUpdate, onComplete }, sched);
    sched.fire(T0);
    sched.fire(T0 + 60_000);
    expect(onUpdate).toHaveBeenLastCalledWith(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("requests no frame after completion", () => {
    const sched = new ManualScheduler();
    tween({ values: [0, 1], duration: 100, ease: linear, onUpdate: () => {} }, sched);
    sched.fire(T0);
    sched.fire(T0 + 100);
    expect(sched.pendingCount).toBe(0);
    expect(sched.requested).toBe(2);
  });

  it("works without an onComplete", () => {
    const sched = new ManualScheduler();
    const onUpdate = vi.fn();
    tween({ values: [0, 1], duration: 100, ease: linear, onUpdate }, sched);
    sched.fire(T0);
    expect(() => sched.fire(T0 + 100)).not.toThrow();
    expect(onUpdate).toHaveBeenLastCalledWith(1);
  });

  it("cancel stops every callback and cancels the pending frame", () => {
    const sched = new ManualScheduler();
    const onUpdate = vi.fn();
    const onComplete = vi.fn();
    const cancel = tween({ values: [0, 1], duration: 100, ease: linear, onUpdate, onComplete }, sched);
    sched.fire(T0);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const stale = sched.snapshot();
    cancel();
    expect(sched.pendingCount).toBe(0);
    expect(sched.cancelled).toHaveLength(1);
    // Even a frame callback that escaped the scheduler does nothing.
    for (const cb of stale) cb(T0 + 100);
    sched.fire(T0 + 200);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("cancel twice is harmless", () => {
    const sched = new ManualScheduler();
    const cancel = tween({ values: [0, 1], duration: 100, ease: linear, onUpdate: () => {} }, sched);
    cancel();
    expect(() => cancel()).not.toThrow();
    expect(sched.cancelled).toHaveLength(1);
  });

  it("cancel before the first frame means no callback ever", () => {
    const sched = new ManualScheduler();
    const onUpdate = vi.fn();
    const onComplete = vi.fn();
    const stale: Array<(ts: number) => void> = [];
    const cancel = tween({ values: [0, 1], duration: 100, ease: linear, onUpdate, onComplete }, sched);
    stale.push(...sched.snapshot());
    cancel();
    for (const cb of stale) cb(T0);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("a cancel called from inside onUpdate stops the tween before onComplete or another frame", () => {
    const sched = new ManualScheduler();
    const onComplete = vi.fn();
    let cancel: () => void = () => {};
    cancel = tween(
      { values: [0, 1], duration: 100, ease: linear, onUpdate: () => cancel(), onComplete },
      sched,
    );
    sched.fire(T0);
    // Straight after the first frame: no further frame was requested (one request in all, now consumed).
    expect(sched.requested).toBe(1);
    expect(sched.pendingCount).toBe(0);
    sched.fire(T0 + 100);
    expect(onComplete).not.toHaveBeenCalled();
    expect(sched.pendingCount).toBe(0);
  });

  it("a cancel called from the last onUpdate stops the tween before onComplete", () => {
    const sched = new ManualScheduler();
    const onComplete = vi.fn();
    let cancel: () => void = () => {};
    cancel = tween(
      {
        values: [0, 1],
        duration: 100,
        ease: linear,
        onUpdate: (v) => {
          if (v === 1) cancel();
        },
        onComplete,
      },
      sched,
    );
    sched.fire(T0);
    sched.fire(T0 + 100);
    expect(onComplete).not.toHaveBeenCalled();
    expect(sched.pendingCount).toBe(0);
  });

  it("a frame stamped earlier than the start holds the first value, finite", () => {
    const sched = new ManualScheduler();
    const seen: number[] = [];
    tween({ values: [3, 9], duration: 100, ease: linear, onUpdate: (v) => seen.push(v) }, sched);
    sched.fire(T0);
    sched.fire(T0 - 50);
    expect(seen).toHaveLength(2);
    expect(Number.isFinite(seen[1])).toBe(true);
    expect(seen[1]).toBe(3);
  });

  it("a single value holds that value on every frame and completes once at the duration", () => {
    const sched = new ManualScheduler();
    const seen: number[] = [];
    const onComplete = vi.fn();
    tween({ values: [5], duration: 100, ease: linear, onUpdate: (v) => seen.push(v), onComplete }, sched);
    sched.fire(T0);
    sched.fire(T0 + 50);
    expect(seen).toEqual([5, 5]);
    expect(onComplete).not.toHaveBeenCalled();
    sched.fire(T0 + 100);
    expect(seen).toEqual([5, 5, 5]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(sched.pendingCount).toBe(0);
  });

  it("the loop wraps at 2400 ms and never completes", () => {
    const sched = new ManualScheduler();
    const seen: number[] = [];
    const onComplete = vi.fn();
    tween(
      {
        values: [0, 1],
        duration: 2400,
        ease: linear,
        loop: true,
        onUpdate: (v) => seen.push(v),
        onComplete,
      },
      sched,
    );
    sched.fire(T0);
    sched.fire(T0 + 2300);
    sched.fire(T0 + 2400);
    sched.fire(T0 + 4800);
    sched.fire(T0 + 4900);
    expect(seen[1]).toBeGreaterThan(0.95);
    expect(seen[2]).toBeCloseTo(0, 9);
    expect(seen[3]).toBeCloseTo(0, 9);
    expect(seen[4]).toBeCloseTo(100 / 2400, 9);
    expect(onComplete).not.toHaveBeenCalled();
    expect(sched.pendingCount).toBe(1);
  });
});

describe("the default scheduler", () => {
  const realRaf = window.requestAnimationFrame;
  const realCaf = window.cancelAnimationFrame;
  afterEach(() => {
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCaf;
  });

  it("reads window.requestAnimationFrame and cancelAnimationFrame at call time", () => {
    const queue = new Map<number, FrameRequestCallback>();
    let id = 0;
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      id += 1;
      queue.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = (n: number): void => {
      queue.delete(n);
    };
    const onUpdate = vi.fn();
    const cancel = tween({ values: [0, 1], duration: 100, ease: linear, onUpdate });
    expect(queue.size).toBe(1);
    const [first] = [...queue.values()];
    queue.clear();
    first(500);
    expect(onUpdate).toHaveBeenCalledWith(0);
    expect(queue.size).toBe(1);
    cancel();
    expect(queue.size).toBe(0);
  });
});

describe("prefersReducedMotion", () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  function stub(reduce: boolean): void {
    const fn = vi.fn((query: string) => ({
      matches: reduce && query === "(prefers-reduced-motion: reduce)",
      media: query,
    }));
    window.matchMedia = fn as unknown as typeof window.matchMedia;
  }

  it("is true when the query reports reduce", () => {
    stub(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it("is false when the query does not report reduce", () => {
    stub(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("honours a new stub (the cache is rebuilt when matchMedia is a different function)", () => {
    stub(true);
    expect(prefersReducedMotion()).toBe(true);
    stub(false);
    expect(prefersReducedMotion()).toBe(false);
    stub(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it("reuses the MediaQueryList and reads its live matches", () => {
    const mql = { matches: false, media: "" };
    const fn = vi.fn(() => mql);
    window.matchMedia = fn as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
    mql.matches = true;
    expect(prefersReducedMotion()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("is false when window.matchMedia is missing", () => {
    (window as unknown as { matchMedia?: unknown }).matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(false);
  });
});
