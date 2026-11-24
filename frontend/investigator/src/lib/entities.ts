/**
 * Pure entity-computation helpers used across the Inspector panels.
 *
 * No React, no Zustand - these are stateless math functions. Unit-
 * tested via vitest (src/lib/entities.test.ts) covering Houston→Dallas
 * (~225 mi), Houston→Lagos (~6700 mi at ~693 mph), zero/inf edge cases,
 * and the four formatTimeDelta granularities.
 */
import { HOU_TZ } from "./houston-day";

/** Haversine great-circle distance in MILES between two [lat, lng]
 *  pairs. Math.PI/180 conversions inlined; uses Earth's mean radius
 *  3958.8 mi. */
export function haversineMiles(
  [lat1, lng1]: [number, number],
  [lat2, lng2]: [number, number]
): number {
  if (lat1 === lat2 && lng1 === lng2) return 0;
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** ms between two ISO timestamp strings. Positive when `later` is
 *  after `earlier`; negative otherwise. Uses Date.parse which honors
 *  the embedded -05:00 offsets in our seed data. */
export function timeDeltaMs(earlier: string, later: string): number {
  return Date.parse(later) - Date.parse(earlier);
}

/** Speed an entity would need to travel from `from` at `fromTs` to
 *  `to` at `toTs`. Returns mph. Returns Infinity when the time delta
 *  is zero (used by impossible-travel detection). */
export function impossibleTravelSpeedMph(
  from: [number, number],
  fromTs: string,
  to: [number, number],
  toTs: string
): number {
  const miles = haversineMiles(from, to);
  const ms = Math.abs(timeDeltaMs(fromTs, toTs));
  if (ms === 0) return Infinity;
  const hours = ms / 3_600_000;
  return miles / hours;
}

/** Human-readable time delta. Picks the right granularity:
 *    < 60s   → "Ns"
 *    < 60m   → "Nm"
 *    < 24h   → "Hh Mm"
 *    >= 24h  → "Dd Hh"
 */
export function formatTimeDelta(ms: number): string {
  const total = Math.abs(Math.round(ms / 1000));
  if (total === 0) return "0s";
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMin = minutes - hours * 60;
  if (hours < 24) return `${hours}h ${restMin}m`;
  const days = Math.floor(hours / 24);
  const restHr = hours - days * 24;
  return `${days}d ${restHr}h`;
}

/** The one format an Inspector row prints a timestamp in: a weekday, a month and day, a middle dot, a
 *  time with a or p, CDT (for example Tue May 26, dot, 9:23p CDT), in Houston time. Shared by the Posted
 *  row and the From Date row. The dot is built from its code point so that no non-ASCII is typed here. */
export function formatTs(iso: string): string {
  const d = new Date(iso);
  const wkday = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: HOU_TZ,
  });
  const month = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: HOU_TZ,
  });
  const time = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: HOU_TZ,
    })
    .replace(" AM", "a")
    .replace(" PM", "p");
  return `${wkday} ${month} ${String.fromCharCode(0xb7)} ${time} CDT`;
}

// Type import is deferred to bottom to avoid forcing every importer of
// the simple math helpers above to also pull in Transaction.
import type { Transaction } from "../types";

export interface Baseline {
  /** Avg $ spent per day across the prior 30 days (clean txns only). */
  avgDailySpend: number;
  /** Avg auth count per day across the prior 30 days. */
  avgDailyAuths: number;
  /** Top 3 merchants by transaction count. */
  topMerchants: { name: string; count: number }[];
  /** Top 3 categories by transaction count. */
  topCategories: { category: string; count: number }[];
}

/** Compute a 30-day rolling baseline for the given card, ending at
 *  `endTs`. Excludes fraud transactions - baseline represents normal
 *  behavior, not the anomaly being investigated. Used by AuthInspector
 *  "Baseline (30d)" section to show analysts what's typical for this
 *  card before the current event. */
export function computeBaseline(
  transactions: Transaction[],
  cardId: string,
  endTs: string
): Baseline {
  const end = Date.parse(endTs);
  const start = end - 30 * 86_400_000;
  const window = transactions.filter((t) => {
    if (t.card_id !== cardId) return false;
    if (t.is_fraud) return false;
    const ts = Date.parse(t.timestamp);
    return ts >= start && ts <= end;
  });

  if (window.length === 0) {
    return {
      avgDailySpend: 0,
      avgDailyAuths: 0,
      topMerchants: [],
      topCategories: [],
    };
  }

  const totalSpend = window.reduce((s, t) => s + t.amount, 0);
  const avgDailySpend = totalSpend / 30;
  const avgDailyAuths = window.length / 30;

  const merchantCounts = new Map<string, number>();
  for (const t of window) {
    merchantCounts.set(
      t.merchant_name,
      (merchantCounts.get(t.merchant_name) ?? 0) + 1
    );
  }
  const topMerchants = Array.from(merchantCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const categoryCounts = new Map<string, number>();
  for (const t of window) {
    categoryCounts.set(
      t.category,
      (categoryCounts.get(t.category) ?? 0) + 1
    );
  }
  const topCategories = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { avgDailySpend, avgDailyAuths, topMerchants, topCategories };
}
