/**
 * Navigate-time radar-cascade (the bloom variant).
 *
 * Two concurrent rings (inner + outer) + soft radial glow underlay.
 * Rings fire simultaneously and sweep outward; the glow provides
 * atmospheric emphasis at the click point and fades faster than the
 * rings (the rings carry the late frames).
 *
 * Sizes are in PIXELS - the maplibre circle layers take pixel radii and
 * widths. No geographic-meters
 * conversion at runtime.
 *
 * Used by useBloomPulse.ts - when `useNavigation.pulseEntityId` fires, the
 * marker ack tween (scale 1 → 1.9 → 1, outBack 600 ms) and the bloom tween
 * (0 → 1 linear PULSE_DURATION_MS) start in parallel. Three maplibre circle
 * layers take each frame (glow + inner ring + outer ring).
 */

/** Total animation duration (ms). The bloom tween in useBloomPulse.ts
 *  runs from 0→1 over this duration. */
export const PULSE_DURATION_MS = 1300;

const INNER_RADIUS_BASE_PX = 10;
const INNER_RADIUS_EXPAND_PX = 50;
const INNER_ALPHA_PEAK = 0.95;
const INNER_ALPHA_POWER = 1.3;
const INNER_LINE_WIDTH_MIN_PX = 1.5;
const INNER_LINE_WIDTH_TAPER_PX = 1.0;

const OUTER_RADIUS_BASE_PX = 20;
const OUTER_RADIUS_EXPAND_PX = 80;
const OUTER_ALPHA_PEAK = 0.7;
const OUTER_ALPHA_POWER = 1.5;
const OUTER_LINE_WIDTH_MIN_PX = 1.0;
const OUTER_LINE_WIDTH_TAPER_PX = 1.0;

/** Glow underlay - soft radial gradient sized to sit under both rings.
 *  Fades faster (power 2) so the rings carry the late frames. */
export const GLOW_RADIUS_PX = 65;
const GLOW_ALPHA_PEAK = 0.45;
const GLOW_ALPHA_POWER = 2;

/** Cubic ease-out - the radius easing per the variant. Fast start,
 *  slow finish - feels like a bloom expanding outward then settling. */
function outCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

export interface CascadeFrame {
  /** Glow disc - soft radial-gradient underlay. */
  glow: { radius: number; alpha: number };
  /** Inner ring - closer to marker, brighter, longer alpha tail. */
  inner: { radius: number; alpha: number; lineWidthMinPixels: number };
  /** Outer ring - further out, softer, snappier alpha decay. */
  outer: { radius: number; alpha: number; lineWidthMinPixels: number };
}

/**
 * Compute per-frame rendering parameters for the V4 BLOOM cascade.
 *
 * @param navPulse value in [0, 1] from the PULSE_DURATION_MS driver
 *                 (auto-clamped to bounds - values outside [0,1] yield
 *                 alpha 0 on all layers).
 */
export function cascadeFrame(navPulse: number): CascadeFrame {
  const p = Math.max(0, Math.min(1, navPulse));
  const eased = outCubic(p);

  return {
    glow: {
      radius: GLOW_RADIUS_PX,
      alpha: Math.pow(1 - p, GLOW_ALPHA_POWER) * GLOW_ALPHA_PEAK,
    },
    inner: {
      radius: INNER_RADIUS_BASE_PX + eased * INNER_RADIUS_EXPAND_PX,
      alpha: Math.pow(1 - p, INNER_ALPHA_POWER) * INNER_ALPHA_PEAK,
      lineWidthMinPixels:
        INNER_LINE_WIDTH_MIN_PX + (1 - p) * INNER_LINE_WIDTH_TAPER_PX,
    },
    outer: {
      radius: OUTER_RADIUS_BASE_PX + eased * OUTER_RADIUS_EXPAND_PX,
      alpha: Math.pow(1 - p, OUTER_ALPHA_POWER) * OUTER_ALPHA_PEAK,
      lineWidthMinPixels:
        OUTER_LINE_WIDTH_MIN_PX + (1 - p) * OUTER_LINE_WIDTH_TAPER_PX,
    },
  };
}
