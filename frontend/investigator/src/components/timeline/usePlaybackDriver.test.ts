/**
 * Tests for the playback driver - the rAF-based loop that advances
 * `playhead` while `isPlaying` is true, with direction-aware boundary
 * handling. Most of the surface is the pure `computePlaybackTick`
 * function (math); the React hook is a thin orchestration layer.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { computePlaybackTick, usePlaybackDriver } from "./usePlaybackDriver";
import { usePlayhead } from "../../store/playhead";

const PLAYBACK_DURATION_MS = 60_000;

describe("computePlaybackTick - forward motion", () => {
  it("advances playhead in proportion to rate × deltaMs", () => {
    const out = computePlaybackTick({
      playhead: 1_000,
      minTime: 0,
      maxTime: 100_000,
      playbackRate: 1,
      totalPlaybackDurationMs: PLAYBACK_DURATION_MS,
      deltaMs: 16,
    });
    // span=100_000, advance = 16 × 100_000 / 60_000 × 1 ≈ 26.67
    expect(out.nextPlayhead).toBeCloseTo(1_026.67, 1);
    expect(out.hitBoundary).toBe(false);
  });

  it("4× rate advances 4× faster than 1× rate", () => {
    const base = computePlaybackTick({
      playhead: 0, minTime: 0, maxTime: 60_000,
      playbackRate: 1, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 16,
    });
    const fast = computePlaybackTick({
      playhead: 0, minTime: 0, maxTime: 60_000,
      playbackRate: 4, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 16,
    });
    expect(fast.nextPlayhead).toBeCloseTo(base.nextPlayhead * 4, 4);
  });

  it("clamps to maxTime + hitBoundary=true when about to overshoot forward", () => {
    const out = computePlaybackTick({
      playhead: 99_000,
      minTime: 0,
      maxTime: 100_000,
      playbackRate: 16,
      totalPlaybackDurationMs: PLAYBACK_DURATION_MS,
      deltaMs: 100,
    });
    // advance = 100 × 100_000/60_000 × 16 ≈ 26_667, would land at 125_667 → clamp
    expect(out.nextPlayhead).toBe(100_000);
    expect(out.hitBoundary).toBe(true);
  });
});

describe("computePlaybackTick - reverse motion", () => {
  it("rewinds playhead when rate is negative", () => {
    const out = computePlaybackTick({
      playhead: 50_000,
      minTime: 0,
      maxTime: 100_000,
      playbackRate: -1,
      totalPlaybackDurationMs: PLAYBACK_DURATION_MS,
      deltaMs: 16,
    });
    // advance = -26.67, so next playhead < 50_000
    expect(out.nextPlayhead).toBeLessThan(50_000);
    expect(out.nextPlayhead).toBeCloseTo(50_000 - 26.67, 1);
    expect(out.hitBoundary).toBe(false);
  });

  it("clamps to minTime + hitBoundary=true when about to undershoot backward", () => {
    const out = computePlaybackTick({
      playhead: 100,
      minTime: 0,
      maxTime: 100_000,
      playbackRate: -4,
      totalPlaybackDurationMs: PLAYBACK_DURATION_MS,
      deltaMs: 100,
    });
    // would land at 100 + (-100×100_000/60_000×4) ≈ 100 - 6_667 → clamp to 0
    expect(out.nextPlayhead).toBe(0);
    expect(out.hitBoundary).toBe(true);
  });

  it("−4× rewinds 4× faster than −1×", () => {
    const slow = computePlaybackTick({
      playhead: 60_000, minTime: 0, maxTime: 100_000,
      playbackRate: -1, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 16,
    });
    const fast = computePlaybackTick({
      playhead: 60_000, minTime: 0, maxTime: 100_000,
      playbackRate: -4, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 16,
    });
    const slowDelta = 60_000 - slow.nextPlayhead;
    const fastDelta = 60_000 - fast.nextPlayhead;
    expect(fastDelta).toBeCloseTo(slowDelta * 4, 4);
  });
});

describe("computePlaybackTick - zero rate", () => {
  it("rate=0 produces no advancement, no boundary hit", () => {
    const out = computePlaybackTick({
      playhead: 50_000,
      minTime: 0,
      maxTime: 100_000,
      playbackRate: 0,
      totalPlaybackDurationMs: PLAYBACK_DURATION_MS,
      deltaMs: 16,
    });
    expect(out.nextPlayhead).toBe(50_000);
    expect(out.hitBoundary).toBe(false);
  });
});

describe("computePlaybackTick - slowmo (sub-1×, both directions)", () => {
  it("0.5× rate advances at half speed", () => {
    const slow = computePlaybackTick({
      playhead: 0, minTime: 0, maxTime: 60_000,
      playbackRate: 0.5, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 16,
    });
    const normal = computePlaybackTick({
      playhead: 0, minTime: 0, maxTime: 60_000,
      playbackRate: 1, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 16,
    });
    expect(slow.nextPlayhead).toBeCloseTo(normal.nextPlayhead * 0.5, 4);
  });

  it("0.25× rate advances at quarter speed", () => {
    const slow = computePlaybackTick({
      playhead: 0, minTime: 0, maxTime: 60_000,
      playbackRate: 0.25, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 16,
    });
    const normal = computePlaybackTick({
      playhead: 0, minTime: 0, maxTime: 60_000,
      playbackRate: 1, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 16,
    });
    expect(slow.nextPlayhead).toBeCloseTo(normal.nextPlayhead * 0.25, 4);
  });

  it("−0.25× rate rewinds at quarter speed", () => {
    const slow = computePlaybackTick({
      playhead: 60_000, minTime: 0, maxTime: 100_000,
      playbackRate: -0.25, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 16,
    });
    const normal = computePlaybackTick({
      playhead: 60_000, minTime: 0, maxTime: 100_000,
      playbackRate: -1, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 16,
    });
    const slowDelta = 60_000 - slow.nextPlayhead;
    const normalDelta = 60_000 - normal.nextPlayhead;
    expect(slowDelta).toBeCloseTo(normalDelta * 0.25, 4);
  });
});

describe("computePlaybackTick - edge cases", () => {
  it("zero-width window (minTime === maxTime) is a no-op", () => {
    const out = computePlaybackTick({
      playhead: 1_000, minTime: 1_000, maxTime: 1_000,
      playbackRate: 1, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 16,
    });
    expect(out.nextPlayhead).toBe(1_000);
    expect(out.hitBoundary).toBe(false);
  });

  it("deltaMs of 0 produces no advancement", () => {
    const out = computePlaybackTick({
      playhead: 50_000, minTime: 0, maxTime: 100_000,
      playbackRate: 4, totalPlaybackDurationMs: PLAYBACK_DURATION_MS, deltaMs: 0,
    });
    expect(out.nextPlayhead).toBe(50_000);
  });
});

describe("usePlaybackDriver hook - smoke", () => {
  beforeEach(() => {
    // Reset store
    usePlayhead.setState({
      playhead: 0, minTime: 0, maxTime: 100_000,
      isPlaying: false, playbackRate: 1, isScrubbing: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing when not playing", () => {
    const { unmount } = renderHook(() => usePlaybackDriver());
    expect(usePlayhead.getState().playhead).toBe(0);
    unmount();
  });

  it("cleans up rAF on unmount when playing", () => {
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    usePlayhead.setState({ isPlaying: true });
    const { unmount } = renderHook(() => usePlaybackDriver());
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });
});
