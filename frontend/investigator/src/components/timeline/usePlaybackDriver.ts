/**
 * Playback driver - direction-aware rAF loop that advances `playhead`
 * while `isPlaying` is true. Replaces the prior Timer setup in
 * Timeline.tsx (Spec 3 timeline polish, 2026-05-28). A Timer's
 * progress-based mechanism doesn't compose with negative rates
 * cleanly; explicit `playhead += rate × dt` is simpler and supports
 * rewind + slowmo natively.
 *
 * Math lives in `computePlaybackTick` (pure, easy to test); the React
 * hook is a thin wrapper that wires the math to rAF + the playhead
 * store. Direction-aware boundary handling: forward auto-pauses at
 * `maxTime`, reverse auto-pauses at `minTime`.
 */
import { useEffect } from "react";
import { usePlayhead } from "../../store/playhead";

/** Wall-clock duration of one full scrub at 1× playbackRate. Picked so
 *  the full window plays in a leisurely minute at 1×, 15s at 4×, ~4s
 *  at 16×. Keeps the math intuitive across span sizes. */
export const PLAYBACK_DURATION_MS = 60_000;

export interface PlaybackTickInput {
  playhead: number;
  minTime: number;
  maxTime: number;
  playbackRate: number;
  totalPlaybackDurationMs: number;
  deltaMs: number;
}

export interface PlaybackTickOutput {
  nextPlayhead: number;
  /** True when the tick hit a window boundary - caller should pause. */
  hitBoundary: boolean;
}

/**
 * Pure function - compute the next playhead given current state + a
 * wall-clock delta. Direction-aware: rate > 0 advances toward maxTime,
 * rate < 0 advances toward minTime, rate === 0 is a no-op. Clamps
 * cleanly at boundaries.
 */
export function computePlaybackTick(input: PlaybackTickInput): PlaybackTickOutput {
  const { playhead, minTime, maxTime, playbackRate, totalPlaybackDurationMs, deltaMs } = input;
  const span = maxTime - minTime;
  if (span <= 0 || playbackRate === 0 || deltaMs <= 0) {
    return { nextPlayhead: playhead, hitBoundary: false };
  }
  // wall-clock-ms × simulated-ms-per-wall-ms × rate-sign
  const advance = (deltaMs * span / totalPlaybackDurationMs) * playbackRate;
  const next = playhead + advance;
  if (next >= maxTime && playbackRate > 0) {
    return { nextPlayhead: maxTime, hitBoundary: true };
  }
  if (next <= minTime && playbackRate < 0) {
    return { nextPlayhead: minTime, hitBoundary: true };
  }
  return { nextPlayhead: next, hitBoundary: false };
}

/**
 * React hook - drives playhead advancement when `isPlaying` is true.
 * Subscribes to store directly so the consuming component doesn't have
 * to pass state in. Cleanly cancels the rAF on unmount or when
 * `isPlaying` flips to false.
 *
 * The effect depends on `isPlaying`, `playbackRate`, `minTime`, and
 * `maxTime` - when any of those change, the loop restarts with fresh
 * state. `playhead` is intentionally NOT a dep: it's an output of the
 * loop, not an input.
 */
export function usePlaybackDriver(): void {
  const isPlaying = usePlayhead((s) => s.isPlaying);
  const playbackRate = usePlayhead((s) => s.playbackRate);
  const minTime = usePlayhead((s) => s.minTime);
  const maxTime = usePlayhead((s) => s.maxTime);

  useEffect(() => {
    if (!isPlaying) return;
    if (playbackRate === 0) return;
    let lastTs = performance.now();
    let rafId = 0;

    const tick = (ts: number): void => {
      const deltaMs = ts - lastTs;
      lastTs = ts;
      // Always read the latest playhead - avoids staleness if other
      // code (scrubbing, navigate(), tick clicks) mutates it mid-loop.
      const current = usePlayhead.getState().playhead;
      const out = computePlaybackTick({
        playhead: current,
        minTime,
        maxTime,
        playbackRate,
        totalPlaybackDurationMs: PLAYBACK_DURATION_MS,
        deltaMs,
      });
      usePlayhead.setState({ playhead: out.nextPlayhead });
      if (out.hitBoundary) {
        usePlayhead.setState({ isPlaying: false });
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, playbackRate, minTime, maxTime]);
}
