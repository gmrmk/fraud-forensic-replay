/**
 * Pure motion math for the maplibre-native globe (Phase 2b, 2026-05-30).
 * Mirrors the prior deck radar-ping + pin-drop math, but emits maplibre paint
 * values (pixel radii + 0..1 opacities) instead of deck layer props. No GL or
 * maplibre dependency here - kept pure so it unit-tests without a context.
 */

/** Number of concurrent radar rings (phase-offset thirds of one cycle). */
export const RADAR_RING_COUNT = 3;
const RING_BASE_PX = 4;
const RING_EXPAND_PX = 60;
const RING_ALPHA_PEAK = 0.85;

export interface RingFrame {
  radiusPx: number;
  strokeOpacity: number;
  strokeWidthPx: number;
}

/**
 * Per-ring paint values for the fraud radar-ping at a given pulse value.
 * @param pulse 0..1 sawtooth (loops). Each ring is offset by 1/RADAR_RING_COUNT.
 */
export function ringFrame(pulse: number): RingFrame[] {
  const frames: RingFrame[] = [];
  for (let i = 0; i < RADAR_RING_COUNT; i++) {
    const phase = (pulse + i / RADAR_RING_COUNT) % 1;
    frames.push({
      radiusPx: RING_BASE_PX + phase * RING_EXPAND_PX,
      // Bell-shaped: 0 at birth and death, peak mid-life (no snap-on).
      strokeOpacity: Math.sin(phase * Math.PI) * RING_ALPHA_PEAK,
      strokeWidthPx: 1.6 + (1 - phase) * 1.4,
    });
  }
  return frames;
}

/**
 * The radar's held phase under reduced motion. ringFrame offsets the three rings by a third,
 * so the rings sit at phases 1/6, 1/2 and 5/6: every ring stays visible (opacity at least
 * 0.42) and nothing expands.
 */
export const RADAR_STILL_PHASE = 1 / 6;

/** The pulse value the rings read: the tween's value, or the still phase when motion is reduced. */
export function ringPhase(v: number, reduced: boolean): number {
  return reduced ? RADAR_STILL_PHASE : v;
}

/** easeOutBack - slight overshoot then settle (pin drop). */
function easeOutBack(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * Pin-drop scale modifier for a marker.
 * @param t normalized elapsed since entry (elapsedMs / 700). 0 → 0, ≥1 → 1.
 */
export function landingScale(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return easeOutBack(t);
}

/**
 * Default fraction of the timeline span over which a fraud marker's pin-drop completes. The
 * landing is keyed to the PLAYHEAD (not wall-clock), so it is data-relative: as the playhead
 * sweeps LANDING_FRAC of (maxTime - minTime) past an event, the pin settles. A feel knob.
 * A wall-clock duration would make the landing non-deterministic + un-scrubbable.
 */
export const LANDING_FRAC = 0.015;

/**
 * Normalized landing progress for a fraud marker, as a PURE function of the playhead and the
 * event timestamp - no wall-clock (Date / performance.now), so it is deterministic and
 * scrubbable (scrub back before the event -> < 0 -> not landed; the playhead is the single
 * source of truth). Feed the result to landingScale (which clamps + eases).
 * @param playhead current playhead (Unix ms)
 * @param eventTs  the marker's timestamp (Unix ms) - it lands as the playhead crosses it
 * @param span     playhead-ms over which the drop completes (e.g. LANDING_FRAC * (max - min))
 */
export function landingFraction(playhead: number, eventTs: number, span: number): number {
  if (!(span > 0)) return 1; // degenerate span (data not loaded / single-instant) -> settled
  return (playhead - eventTs) / span;
}
