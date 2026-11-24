// frontend/investigator/src/lib/arc-geometry.ts
/**
 * Pure arc-lift geometry. Given a path's [lng,lat] points, returns each point's
 * lift (meters) - a half-sine arch parameterized by CUMULATIVE GREAT-CIRCLE
 * DISTANCE (not index), so the peak sits at the spatial midpoint (inside the
 * dominant jump) regardless of how the polyline is densified. Peak height scales
 * with TOTAL path length. Kept pure (no GL) so it unit-tests without a context.
 */
import { haversineMiles } from "./entities";

/** Calibrated so a ~6500 mi path (Houston→Lagos) arches to ~564 km - the height
 *  the currently-shipped (frozen) Fraud arc renders at (severity ~0.12),
 *  preserving the approved Lagos look. Scales with TOTAL path length (NOT the
 *  longest densified segment, which collapses under densification), with no
 *  floor - so short local clusters stay near-flat scribbles, not needle spikes.
 *  Capped at MAX_LIFT_M. */
const LIFT_M_PER_MI = 86.8;
const MAX_LIFT_M = 700_000;

export function liftHeights(points: [number, number][]): number[] {
  const n = points.length;
  if (n <= 0) return [];
  if (n === 1) return [0];
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) {
    const [lng1, lat1] = points[i - 1];
    const [lng2, lat2] = points[i];
    cum.push(cum[i - 1] + haversineMiles([lat1, lng1], [lat2, lng2]));
  }
  const total = cum[n - 1] || 1;
  const peak = Math.min(total * LIFT_M_PER_MI, MAX_LIFT_M);
  return cum.map((c) => Math.sin((c / total) * Math.PI) * peak);
}
