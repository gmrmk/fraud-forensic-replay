/**
 * Magnitude: one numeric field a manifest node may name (`magnitude`), shown as marker
 * size on the globe and as a bar lane on the timeline. Pure helpers; nothing here knows a
 * pack's field names.
 *
 * Encoding is honest by construction: a marker's AREA follows the value (so its radius
 * follows the square root), and a bar's height is linear from zero to a stated top. A marker's
 * size and a bar's top are both measured on the whole pack, never on what is on screen, so a
 * mark keeps its size as the playhead and the zoom move; a bar above the top is drawn cut.
 * The rule for the top, and the lane model built on these helpers, are in
 * lib/timeline-lanes.ts.
 */
import type { Entity } from "./entity";
import type { ScenarioNode } from "./scenarios";

/** The entity's value of one field: a finite positive number, or null for anything else (a value
 *  at or under zero counts in no bucket). */
export function fieldValue(entity: Entity, field: string): number | null {
  const value = entity.fields[field];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** The entity's magnitude: a finite positive number, or null for anything else. */
export function magnitudeOf(entity: Entity, node: ScenarioNode | undefined): number | null {
  return node?.magnitude ? fieldValue(entity, node.magnitude) : null;
}

/** What a lane reads, in place of a node: the kinds whose rows it takes, the field, and how the
 *  values are bucketed and combined. Left out, `bucket` gives one bar for each instant and
 *  `aggregate` gives a sum, which is what a node's own lane has always been. */
export interface LaneReading {
  kinds: readonly string[];
  field: string;
  bucket?: "hour";
  aggregate?: "sum" | "max";
}

const BUCKET_STEP_MS: Record<"hour", number> = { hour: 3_600_000 };

/** The width of a declared bucket in ms; undefined when there is no bucket. */
export function bucketStep(bucket: "hour" | undefined): number | undefined {
  return bucket === undefined ? undefined : BUCKET_STEP_MS[bucket];
}

/** The largest magnitude among the entities of `node`'s kind; 0 when none has one. */
export function maxMagnitude(entities: readonly Entity[], node: ScenarioNode): number {
  let max = 0;
  for (const e of entities) if (e.kind === node.kind) max = Math.max(max, magnitudeOf(e, node) ?? 0);
  return max;
}

/** The largest value of each kind that declares a magnitude, by kind. */
export function magnitudeMaxima(entities: readonly Entity[], nodes: readonly ScenarioNode[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const node of nodes) if (node.magnitude) out[node.kind] = maxMagnitude(entities, node);
  return out;
}

/** 0..1 radius scale for a value against the largest: sqrt, so area follows the value. */
export function markerScale(value: number | null, max: number): number {
  if (value === null || max <= 0) return 0;
  return Math.min(1, Math.sqrt(value / max));
}

/** One bar height in px per value, linear against `max`. A positive value never rounds
 *  down to nothing: it keeps one pixel. */
export function barHeights(
  values: readonly (number | null)[],
  max: number,
  heightPx: number,
): number[] {
  return values.map((v) => {
    if (v === null || v <= 0 || max <= 0) return 0;
    return Math.max(1, Math.round((v / max) * heightPx));
  });
}

/** One bar of a magnitude lane: an instant and the kind's values summed at it. */
export interface MagnitudeBar {
  t: number;
  value: number;
}

/** The lane's bars, in time order. Given a node: the kind's values summed at each instant. Rows
 *  of one instant are one bucket (many keys in one hour), so the lane shows the pack's total.
 *  Given a lane reading: the values of its kinds in each declared bucket, at the bucket's start,
 *  summed or taken as the largest (a row with no usable value, or a time that is not a number,
 *  counts in no bucket); with no bucket, one bar for each instant, as for a node. */
export function magnitudeBars(entities: readonly Entity[], source: ScenarioNode | LaneReading): MagnitudeBar[] {
  const reading: LaneReading =
    "kinds" in source ? source : { kinds: [source.kind], field: source.magnitude ?? "" };
  const isNode = !("kinds" in source);
  const step = bucketStep(reading.bucket);
  const largest = reading.aggregate === "max";
  const acc = new Map<number, number>();
  for (const e of entities) {
    if (!reading.kinds.includes(e.kind) || (!isNode && !Number.isFinite(e.timestamp))) continue;
    const value = reading.field ? fieldValue(e, reading.field) : null;
    if (value === null) continue;
    const t = step === undefined ? e.timestamp : Math.floor(e.timestamp / step) * step;
    const seen = acc.get(t);
    acc.set(t, seen === undefined ? value : largest ? Math.max(seen, value) : seen + value);
  }
  return [...acc].map(([t, value]) => ({ t, value })).sort((a, b) => a.t - b.t);
}

/** The bucket width the rows imply: the smallest gap between two instants (0 for fewer than
 *  two). ponytail: inferred from the data; a declared step (`bucketStep`) passed as the second
 *  parameter replaces it, and is the one a lane with a bucket should pass. */
export function barStep(bars: readonly MagnitudeBar[], declared?: number): number {
  if (declared !== undefined && Number.isFinite(declared) && declared > 0) return declared;
  let step = Infinity;
  for (let i = 1; i < bars.length; i++) step = Math.min(step, bars[i].t - bars[i - 1].t);
  return Number.isFinite(step) ? step : 0;
}

/** The value of the bar whose bucket holds `at` (t <= at < t + step), or null when `at`
 *  falls outside every bucket. `bars` are in time order. */
export function magnitudeAt(bars: readonly MagnitudeBar[], step: number, at: number): number | null {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].t <= at) lo = mid;
    else hi = mid - 1;
  }
  const bar = bars[lo];
  return bar !== undefined && bar.t <= at && at < bar.t + step ? bar.value : null;
}
