/**
 * A small frame-timestamp tween for the globe's three decorative motions (the
 * marker ack, the bloom, the radar). It keeps the timing of the anime.js calls it
 * replaced: n keyframe values make n - 1 segments of equal duration with the ease
 * applied to each segment; a loop is a forward sawtooth.
 *
 * The clock is the frame timestamp the scheduler hands back and nothing else: the
 * first frame's timestamp is the start and renders the first value; later frames
 * render elapsed = ts - start. No Date.now(), no performance.now(). This drives
 * decoration only (the playhead stays the one clock for state). A tween running in
 * a hidden tab ends at once when the tab returns, because the frames stop and the
 * next timestamp is far past the end.
 */

export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;

/** Overshoot of the back ease, matching anime.js's default for outBack. */
const BACK_OVERSHOOT = 1.7;

const inBack: Ease = (t) => (BACK_OVERSHOOT + 1) * t * t * t - BACK_OVERSHOOT * t * t;

export const outBack: Ease = (t) => 1 - inBack(1 - t);

export interface FrameScheduler {
  request(cb: (ts: number) => void): number;
  cancel(id: number): void;
}

export interface TweenOptions {
  values: readonly number[];
  duration: number;
  ease: Ease;
  loop?: boolean;
  onUpdate: (v: number) => void;
  onComplete?: () => void;
}

/** Reads window.requestAnimationFrame at call time so a test that replaces it is honoured. */
const windowScheduler: FrameScheduler = {
  request: (cb) => window.requestAnimationFrame(cb),
  cancel: (id) => window.cancelAnimationFrame(id),
};

/** The value at `elapsed` ms into the run (0 <= elapsed <= duration). */
function sample(values: readonly number[], duration: number, ease: Ease, elapsed: number): number {
  const segments = values.length - 1;
  if (segments < 1) return values[0];
  const segmentMs = duration / segments;
  const i = Math.min(Math.floor(elapsed / segmentMs), segments - 1);
  const t = Math.min(Math.max((elapsed - i * segmentMs) / segmentMs, 0), 1);
  return values[i] + (values[i + 1] - values[i]) * ease(t);
}

/** Starts a tween and returns its cancel. After cancel no callback of any kind fires. */
export function tween(options: TweenOptions, scheduler: FrameScheduler = windowScheduler): () => void {
  const { values, duration, ease, loop = false, onUpdate, onComplete } = options;
  let cancelled = false;
  let start: number | null = null;
  let frameId = 0;

  const frame = (ts: number): void => {
    if (cancelled) return;
    if (start === null) start = ts;
    const elapsed = Math.max(ts - start, 0);
    if (!loop && elapsed >= duration) {
      onUpdate(values[values.length - 1]);
      if (cancelled) return;
      onComplete?.();
      return;
    }
    onUpdate(sample(values, duration, ease, loop ? elapsed % duration : elapsed));
    // onUpdate may have cancelled this tween.
    if (!cancelled) frameId = scheduler.request(frame);
  };

  frameId = scheduler.request(frame);

  return () => {
    if (cancelled) return;
    cancelled = true;
    scheduler.cancel(frameId);
  };
}

let reducedQuery: { source: typeof window.matchMedia; mql: MediaQueryList } | null = null;

/**
 * True when the visitor asked for reduced motion. The MediaQueryList is built once and its
 * live `matches` is read each call; it is rebuilt when window.matchMedia is a different
 * function than the one that built it, so a test that stubs matchMedia is honoured.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (reducedQuery === null || reducedQuery.source !== window.matchMedia) {
    reducedQuery = {
      source: window.matchMedia,
      mql: window.matchMedia("(prefers-reduced-motion: reduce)"),
    };
  }
  return reducedQuery.mql.matches;
}
