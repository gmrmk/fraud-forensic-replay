/**
 * Arc detector - finds geographically anomalous transaction pairs to draw as
 * deck.gl arcs. Two kinds:
 *   - impossible: two card-present txns genuinely FAR apart (>= a minimum
 *     distance) AND implied to be travelled too fast (> a jet-cruise speed).
 *     Distance AND speed together - a high speed over a tiny distance is a data
 *     artifact, not impossible travel. The single most-severe one is the hero
 *     (the Houston->Lagos marquee).
 *   - velocity: consecutive card-present txns within a short time window at
 *     distinct locations, but ONLY inside a fraud cluster - the neighborhood of
 *     an impossible-travel landing (the rapid Lagos carding spree). Baseline
 *     rapid errands elsewhere do not connect.
 *
 * Pure + schema-agnostic. Reuses the impossible-travel math in entities.ts.
 * Mirrors the pure-module pattern of lib/marker-cascade.ts.
 */
import { haversineMiles, timeDeltaMs, impossibleTravelSpeedMph } from "./entities";
import type { Transaction } from "../types";

/** Implied speed (mph) above which a pair is impossible travel (~jet cruise). */
export const SPEED_THRESHOLD_MPH = 600;
/** Speeds at threshold + span map to severity 1.0. */
export const SEVERITY_SPAN_MPH = 600;
/** Consecutive CP txns within this many minutes draw a velocity connector. */
export const VELOCITY_WINDOW_MIN = 5;
/** Velocity connectors require at least this distance (mi) - excludes same-merchant rapid charges. */
export const VELOCITY_MIN_DISTANCE_MI = 0.05;
/** Impossible travel requires real distance: two points genuinely far apart, too
 *  fast. Below this, a high implied speed is a data artifact (near-simultaneous
 *  same-city txns), not impossible travel - this guard keeps the hero true. */
export const MIN_IMPOSSIBLE_DISTANCE_MI = 500;
/** Velocity connectors fire only inside a "fraud cluster": the geographic
 *  neighborhood (metro scale) of an impossible-travel landing. Derived
 *  structurally from the impossible detection - NOT from any is_fraud flag - so
 *  the detector stays schema-agnostic. */
export const FRAUD_CLUSTER_RADIUS_MI = 50;

export type ArcKind = "impossible" | "velocity";

export interface Arc {
  id: string;
  source: [number, number]; // [lng, lat] - deck.gl order
  target: [number, number];
  sourceTs: string;
  targetTs: string;
  kind: ArcKind;
  impliedSpeedMph: number;
  gapMinutes: number;
  severity: number; // 0..1
  isHero: boolean;  // most-severe impossible arc
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function arcDrawFraction(elapsedMs: number, durationMs = 800): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= durationMs) return 1;
  const t = elapsedMs / durationMs;
  const c1 = 1.70158, c3 = c1 + 1; // easeOutBack - matches GlobeMap's landingScale
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function interpolateTarget(
  source: [number, number], target: [number, number], frac: number,
): [number, number] {
  return [source[0] + (target[0] - source[0]) * frac,
          source[1] + (target[1] - source[1]) * frac];
}

interface Pair {
  prev: Transaction;
  curr: Transaction;
  speed: number;
  gapMinutes: number;
  distance: number;
}

export function detectArcs(transactions: Transaction[]): Arc[] {
  const cp = transactions
    .filter((t) => t.is_card_present === 1)
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Metrics for each consecutive card-present pair, computed once.
  const pairs: Pair[] = [];
  for (let i = 1; i < cp.length; i++) {
    const prev = cp[i - 1];
    const curr = cp[i];
    pairs.push({
      prev,
      curr,
      speed: impossibleTravelSpeedMph(
        [prev.merchant_lat, prev.merchant_lng], prev.timestamp,
        [curr.merchant_lat, curr.merchant_lng], curr.timestamp,
      ),
      gapMinutes: Math.abs(timeDeltaMs(prev.timestamp, curr.timestamp)) / 60_000,
      distance: haversineMiles(
        [prev.merchant_lat, prev.merchant_lng],
        [curr.merchant_lat, curr.merchant_lng],
      ),
    });
  }

  const baseOf = (p: Pair) => ({
    id: `${p.prev.id}->${p.curr.id}`,
    source: [p.prev.merchant_lng, p.prev.merchant_lat] as [number, number],
    target: [p.curr.merchant_lng, p.curr.merchant_lat] as [number, number],
    sourceTs: p.prev.timestamp,
    targetTs: p.curr.timestamp,
    impliedSpeedMph: p.speed,
    gapMinutes: p.gapMinutes,
    isHero: false,
  });

  const isImpossible = (p: Pair) =>
    p.speed > SPEED_THRESHOLD_MPH && p.distance >= MIN_IMPOSSIBLE_DISTANCE_MI;

  // Pass 1 - impossible-travel arcs: genuinely far apart AND too fast. The
  // distance guard rejects near-simultaneous same-city pairs whose implied speed
  // is absurd but whose travel is not actually impossible.
  const arcs: Arc[] = [];
  const impossibleTargets: Array<[number, number]> = []; // [lat, lng] landings
  for (const p of pairs) {
    if (!isImpossible(p)) continue;
    arcs.push({
      ...baseOf(p),
      kind: "impossible",
      severity: clamp01((p.speed - SPEED_THRESHOLD_MPH) / SEVERITY_SPAN_MPH),
    });
    impossibleTargets.push([p.curr.merchant_lat, p.curr.merchant_lng]);
  }

  // Pass 2 - velocity connectors: rapid, cross-location pairs, but ONLY inside a
  // fraud cluster (the neighborhood of an impossible-travel landing). This is the
  // "these belong together" primitive - the carding spree at the destination -
  // and it stops unrelated baseline rapid errands from drawing spurious arcs.
  const inFraudCluster = (lat: number, lng: number) =>
    impossibleTargets.some(
      ([tLat, tLng]) => haversineMiles([lat, lng], [tLat, tLng]) <= FRAUD_CLUSTER_RADIUS_MI,
    );
  for (const p of pairs) {
    if (isImpossible(p)) continue;
    if (p.gapMinutes > VELOCITY_WINDOW_MIN || p.distance < VELOCITY_MIN_DISTANCE_MI) continue;
    if (!inFraudCluster(p.prev.merchant_lat, p.prev.merchant_lng)) continue;
    if (!inFraudCluster(p.curr.merchant_lat, p.curr.merchant_lng)) continue;
    arcs.push({
      ...baseOf(p),
      kind: "velocity",
      severity: clamp01(1 - p.gapMinutes / VELOCITY_WINDOW_MIN),
    });
  }

  // Hero - the single most-severe impossible arc (the marquee).
  const impossible = arcs.filter((a) => a.kind === "impossible");
  if (impossible.length === 0) return arcs;
  const heroId = impossible.reduce((best, a) =>
    a.impliedSpeedMph > best.impliedSpeedMph ? a : best,
  ).id;
  return arcs.map((a) => (a.id === heroId ? { ...a, isHero: true } : a));
}
