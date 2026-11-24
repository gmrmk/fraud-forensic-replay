/**
 * Playhead store - single source of truth for the scrubbable timeline.
 *
 * Playback model:
 *  - `playhead` is a Unix-ms timestamp between `minTime` and `maxTime`.
 *  - `minTime` / `maxTime` come from the transactions dataset (set once at load).
 *  - `isPlaying` and `playbackRate` drive the rAF playback loop in
 *    `usePlaybackDriver`. `playbackRate`
 *    accepts negative values (rewind), fractional values (slowmo), and
 *    zero (paused / no motion). The new rate-set is owned by the
 *    `SpeedMenu` component, not this store.
 *  - `isScrubbing` is true while the user is mid-drag on the track. It
 *    suppresses driver writes so the playhead doesn't fight the drag.
 *
 * Zoom model (Phase 1, 2026-06-22):
 *  - `windowMin` / `windowMax` are the VISIBLE time window (the zoom). They
 *    default to the data bounds via `setBounds` and are narrowed by the zoom
 *    transport (`setWindow` / `zoomAt` / `panWindow` / `zoomToFit`).
 *  - The window is a VIEW concern only. `playhead` and the rAF driver advance
 *    against `minTime`/`maxTime`, NOT the window - so playback stays
 *    deterministic at every zoom level, and zoom never moves the playhead.
 *
 * Strict-stop-at-boundary DURING playback (user direction 2026-05-28):
 * the rAF driver auto-pauses at maxTime/minTime and never wraps mid-play.
 * But an explicit Play/toggle press AT the far boundary REPLAYS from the
 * opposite end (user direction 2026-06-01: "playhead should start at the
 * beginning") - so pressing Play when the timeline sits at the end (its
 * load-time default) starts a fresh run from minTime instead of refusing.
 */
import { create } from "zustand";
import { nextMarks } from "../lib/playhead-tools";

/** The deepest zoom: the visible window never narrows below 5 seconds (or the
 *  full data span, whichever is smaller). 5s lets an investigator drill into a
 *  rapid card-testing burst and read the axis down to per-second ticks, while
 *  still guarding against a degenerate (sub-second) window. */
export const MIN_WINDOW_MS = 5 * 1000;

/** Normalize a requested [lo, hi] window: enforce the minimum width, then clamp
 *  into [minTime, maxTime] preserving width where possible. Pure (no store access). */
function clampWindow(
  lo: number,
  hi: number,
  minTime: number,
  maxTime: number,
): { windowMin: number; windowMax: number } {
  const fullSpan = maxTime - minTime;
  const minW = Math.min(MIN_WINDOW_MS, fullSpan);
  let width = hi - lo;
  if (width < minW) {
    const center = (lo + hi) / 2;
    lo = center - minW / 2;
    hi = center + minW / 2;
    width = minW;
  }
  if (lo < minTime) {
    lo = minTime;
    hi = minTime + width;
  }
  if (hi > maxTime) {
    hi = maxTime;
    lo = maxTime - width;
  }
  // A window wider than the full span clamps to the span exactly.
  if (lo < minTime) lo = minTime;
  if (hi > maxTime) hi = maxTime;
  return { windowMin: lo, windowMax: hi };
}

/** The window after zooming around a center timestamp by a factor (<1 zooms in,
 *  >1 out), keeping the center at the same screen fraction, clamped. Pure -
 *  shared by the store's zoomAt (instant) and the buttery rAF ease in
 *  useZoomGestures, so both compute the identical target. */
export function zoomedWindow(
  s: { windowMin: number; windowMax: number; minTime: number; maxTime: number },
  centerMs: number,
  factor: number,
): { windowMin: number; windowMax: number } {
  const span = s.windowMax - s.windowMin;
  const frac = span > 0 ? (centerMs - s.windowMin) / span : 0.5;
  const newSpan = span * factor;
  const lo = centerMs - frac * newSpan;
  return clampWindow(lo, lo + newSpan, s.minTime, s.maxTime);
}

/** An opening position: any of a playhead time, the two marks and a zoom window. */
export interface Opening {
  playhead?: number;
  a?: number;
  b?: number;
  window?: [number, number];
}

/** The playhead, marks and window an opening gives inside [min, max]; without one, the end of
 *  the data, no marks and the full span. Pure. */
function landing(opening: Opening | null, min: number, max: number) {
  const clamp = (t: number): number => Math.min(max, Math.max(min, t));
  const window = opening?.window
    ? clampWindow(opening.window[0], opening.window[1], min, max)
    : { windowMin: min, windowMax: max };
  return {
    playhead: opening?.playhead !== undefined ? clamp(opening.playhead) : max,
    markA: opening?.a !== undefined ? clamp(opening.a) : null,
    markB: opening?.b !== undefined ? clamp(opening.b) : null,
    ...window,
  };
}

export interface PlayheadState {
  playhead: number;
  minTime: number;
  maxTime: number;
  /** Visible zoom window. Defaults to the data bounds; narrowed by the zoom
   *  transport. View-only - playback advances against minTime/maxTime. */
  windowMin: number;
  windowMax: number;
  isPlaying: boolean;
  /** Signed rate. Negative = rewind, 0 = paused, positive = forward.
   *  Supports fractions (e.g., 0.5 for slowmo). The discrete chip set
   *  is in SpeedMenu; the store accepts any number. */
  playbackRate: number;
  isScrubbing: boolean;
  /** The two marks the investigator dropped (A before B), or null. Session state: they
   *  travel in the share link and are never stored. A new dataset clears them. */
  markA: number | null;
  markB: number | null;
  /** Where a share link asked the case to open. While it stands, new bounds land here
   *  instead of at the end (the data arrives in more than one step); it stands down the
   *  first time the playhead is moved. */
  opening: Opening | null;

  setBounds: (min: number, max: number) => void;
  /** The bounds grew because more of the same data arrived. With no bounds known yet, or an
   *  opening standing, it lands exactly as `setBounds` does. Otherwise it moves nothing that has
   *  been placed: the playhead and the marks stay (clamped into the new bounds), a window that
   *  showed the whole old span shows the whole new span, a zoomed window stays. */
  widenBounds: (min: number, max: number) => void;
  /** Set the visible window, clamped to [minTime, maxTime] + a minimum width. */
  setWindow: (windowMin: number, windowMax: number) => void;
  /** Zoom around a center timestamp by a factor (<1 zooms in, >1 out), keeping
   *  the center at the same screen fraction. */
  zoomAt: (centerMs: number, factor: number) => void;
  /** Shift the window by deltaMs, preserving its width, pinned at the bounds. */
  panWindow: (deltaMs: number) => void;
  /** Reset the window to the full data span. */
  zoomToFit: () => void;
  setPlayhead: (t: number) => void;
  play: () => void;
  pause: () => void;
  /** Combined: pause AND zero the rate. Used by the `0` chip - keeps
   *  the invariant that the lit chip matches the actual rate even when
   *  isPlaying flips to false. */
  pauseAndZeroRate: () => void;
  toggle: () => void;
  setRate: (rate: number) => void;
  snapToStart: () => void;
  setScrubbing: (scrubbing: boolean) => void;
  /** Drop a mark at the playhead, or lift the one it sits on (lib/playhead-tools nextMarks). */
  toggleMark: () => void;
  setMarks: (a: number | null, b: number | null) => void;
  /** Open at a position (a share link's). Applied now if the data is known, and again each
   *  time bounds arrive, until the playhead is moved. */
  openAt: (opening: Opening) => void;
}

export const usePlayhead = create<PlayheadState>((set) => ({
  playhead: 0,
  minTime: 0,
  maxTime: 0,
  windowMin: 0,
  windowMax: 0,
  isPlaying: false,
  playbackRate: 1,
  isScrubbing: false,
  markA: null,
  markB: null,
  opening: null,

  // setBounds also resets the zoom window to the full span - a new dataset
  // always loads zoomed-out. A standing opening (a share link's) lands instead.
  setBounds: (min, max) => set((s) => ({ minTime: min, maxTime: max, ...landing(s.opening, min, max) })),

  // The landing branch repeats setBounds's expression on purpose, so setBounds itself stays unchanged.
  widenBounds: (min, max) =>
    set((s) => {
      if (s.maxTime <= s.minTime || s.opening !== null) {
        return { minTime: min, maxTime: max, ...landing(s.opening, min, max) };
      }
      const clamp = (t: number): number => Math.min(max, Math.max(min, t));
      const wholeSpan = s.windowMin === s.minTime && s.windowMax === s.maxTime;
      return {
        minTime: min,
        maxTime: max,
        playhead: clamp(s.playhead),
        markA: s.markA === null ? null : clamp(s.markA),
        markB: s.markB === null ? null : clamp(s.markB),
        ...(wholeSpan
          ? { windowMin: min, windowMax: max }
          : clampWindow(s.windowMin, s.windowMax, min, max)),
      };
    }),

  setWindow: (windowMin, windowMax) =>
    set((s) => clampWindow(windowMin, windowMax, s.minTime, s.maxTime)),

  zoomAt: (centerMs, factor) => set((s) => zoomedWindow(s, centerMs, factor)),

  panWindow: (deltaMs) =>
    set((s) => clampWindow(s.windowMin + deltaMs, s.windowMax + deltaMs, s.minTime, s.maxTime)),

  zoomToFit: () => set((s) => ({ windowMin: s.minTime, windowMax: s.maxTime })),

  // Any move of the playhead (a scrub, a step, a playback tick) ends a standing opening.
  setPlayhead: (t) => set({ playhead: t, opening: null }),

  play: () =>
    set((s) => {
      // Direction-aware boundary guard. If rate is 0 (was paused with
      // the 0 chip), default to 1× forward so Play has a direction.
      const rate = s.playbackRate === 0 ? 1 : s.playbackRate;
      const stateWithRate = s.playbackRate === 0 ? { playbackRate: 1 } : {};
      // Replay-from-start: an explicit Play press AT the far boundary jumps to
      // the opposite end and plays (user direction 2026-06-01 - "playhead should
      // start at the beginning"). The rAF driver still strict-stops at the
      // boundary DURING playback (no mid-play wrap); this only re-arms a press.
      if (rate > 0 && s.playhead >= s.maxTime) return { ...stateWithRate, playhead: s.minTime, isPlaying: true };
      if (rate < 0 && s.playhead <= s.minTime) return { ...stateWithRate, playhead: s.maxTime, isPlaying: true };
      return { ...stateWithRate, isPlaying: true };
    }),

  pause: () => set({ isPlaying: false }),

  pauseAndZeroRate: () => set({ isPlaying: false, playbackRate: 0 }),

  toggle: () =>
    set((s) => {
      if (s.isPlaying) return { isPlaying: false };
      const rate = s.playbackRate === 0 ? 1 : s.playbackRate;
      const stateWithRate = s.playbackRate === 0 ? { playbackRate: 1 } : {};
      // Same replay-from-start behavior as play() at the far boundary.
      if (rate > 0 && s.playhead >= s.maxTime) return { ...stateWithRate, playhead: s.minTime, isPlaying: true };
      if (rate < 0 && s.playhead <= s.minTime) return { ...stateWithRate, playhead: s.maxTime, isPlaying: true };
      return { ...stateWithRate, isPlaying: true };
    }),

  setRate: (rate) => set({ playbackRate: rate }),

  // Snap to the VISIBLE window start, not the data start - the control reads
  // "start of window", and at a zoom the data start sits off the visible track
  // (the handle would vanish). At full zoom windowMin === minTime, so unchanged.
  snapToStart: () => set((s) => ({ playhead: s.windowMin, isPlaying: false, opening: null })),

  setScrubbing: (scrubbing) => set({ isScrubbing: scrubbing }),

  toggleMark: () =>
    set((s) => {
      const { a, b } = nextMarks({ a: s.markA, b: s.markB }, s.playhead);
      return { markA: a, markB: b };
    }),

  setMarks: (a, b) => set({ markA: a, markB: b }),

  openAt: (opening) =>
    set((s) => (s.maxTime > s.minTime ? { opening, ...landing(opening, s.minTime, s.maxTime) } : { opening })),
}));
