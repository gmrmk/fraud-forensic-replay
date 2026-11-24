/**
 * The behavioral-fraud storytelling layer (2026-06-10 realism program).
 *
 * In an account takeover the TIMING is the signature: a clean month, ~48h of
 * silence after the phish, then five account-touching events in one session
 * inside an hour. These pure functions turn generic ticks into that story -
 * the severity session's elapsed-time chips ("+7m", Palantir's gap-tooltip
 * pattern), the bracketed dwell gap ("48H QUIET"), and a per-day density band
 * (Sift's day-summary navigation pattern). Schema-agnostic: any scenario whose
 * events carry session ids and severity flags gets the same treatment.
 */
import { houstonDayKey } from "./houston-day";

export interface StoryTick {
  id: string;
  kind: string;
  ts: number; // unix ms
  session: string | null;
  /** A severity-bearing event: a never-seen-device login, a blocked transfer,
   *  or a fraud-kind transaction. */
  severe: boolean;
}

export interface ElapsedChip {
  pct: number; // midpoint between the two events, 0..100
  label: string; // "+7m"
}

export interface QuietGapSpan {
  fromPct: number;
  toPct: number;
  label: string; // "48H QUIET"
}

export interface DayCell {
  leftPct: number;
  widthPct: number;
  count: number;
  severe: boolean;
}

const QUIET_FLOOR_MS = 12 * 3_600_000; // dwell under 12h is not a story beat

/** The one session that carries the attack: shared by 2+ events and containing
 *  at least one severe tick. Null when the data has no such thread. */
export function severitySession(ticks: StoryTick[]): string | null {
  const bySession = new Map<string, StoryTick[]>();
  for (const t of ticks) {
    if (!t.session) continue;
    const list = bySession.get(t.session) ?? [];
    list.push(t);
    bySession.set(t.session, list);
  }
  for (const [sid, list] of bySession) {
    if (list.length >= 2 && list.some((t) => t.severe)) return sid;
  }
  return null;
}

function fmtElapsed(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 100) return `+${mins}m`;
  return `+${Math.round(mins / 60)}h`;
}

/** One chip per consecutive pair of same-session events - the inter-event
 *  duration rendered as evidence. */
export function elapsedChips(
  ticks: StoryTick[],
  sessionId: string | null,
  minTime: number,
  span: number,
): ElapsedChip[] {
  if (!sessionId || span <= 0) return [];
  const thread = ticks
    .filter((t) => t.session === sessionId)
    .slice()
    .sort((a, b) => a.ts - b.ts);
  const chips: ElapsedChip[] = [];
  for (let i = 1; i < thread.length; i++) {
    const a = thread[i - 1].ts;
    const b = thread[i].ts;
    chips.push({
      pct: (((a + b) / 2 - minTime) / span) * 100,
      label: fmtElapsed(b - a),
    });
  }
  return chips;
}

/** The dwell: the bracketed silence between the last event BEFORE the severity
 *  session and the session's first event. Null under the 12h floor - an
 *  ordinary same-day pause is not negative space worth labeling. */
export function quietGap(
  ticks: StoryTick[],
  sessionId: string | null,
  minTime: number,
  span: number,
): QuietGapSpan | null {
  if (!sessionId || span <= 0) return null;
  const thread = ticks.filter((t) => t.session === sessionId);
  if (thread.length === 0) return null;
  const start = Math.min(...thread.map((t) => t.ts));
  let lastBefore = -Infinity;
  for (const t of ticks) {
    if (t.session !== sessionId && t.ts < start && t.ts > lastBefore) lastBefore = t.ts;
  }
  if (!Number.isFinite(lastBefore)) return null;
  const gapMs = start - lastBefore;
  if (gapMs < QUIET_FLOOR_MS) return null;
  return {
    fromPct: ((lastBefore - minTime) / span) * 100,
    toPct: ((start - minTime) / span) * 100,
    label: `${Math.round(gapMs / 3_600_000)}H QUIET`,
  };
}

export interface PathSegment {
  fromPct: number;
  toPct: number;
  /** Severity follows the segment's RIGHT endpoint: the line lights up as it
   *  approaches the severe event, reading as the path INTO the anomaly. */
  severe: boolean;
}

/** Connective tissue for one kind's lane: a segment per consecutive pair of
 *  events, positioned on the 0..100 time scale. Built for the transfer path
 *  (money movement lives in the time dimension; transfers are coordless by
 *  design) but kind-agnostic: any lane's events fit the {ts, severe} shape. */
export function kindPathSegments(
  events: { ts: number; severe: boolean }[],
  minTime: number,
  span: number,
): PathSegment[] {
  if (span <= 0 || events.length < 2) return [];
  const ordered = events.slice().sort((a, b) => a.ts - b.ts);
  const segs: PathSegment[] = [];
  for (let i = 1; i < ordered.length; i++) {
    segs.push({
      fromPct: ((ordered[i - 1].ts - minTime) / span) * 100,
      toPct: ((ordered[i].ts - minTime) / span) * 100,
      severe: ordered[i].severe,
    });
  }
  return segs;
}

/** One cell per day across the window: event count + whether a severe event
 *  landed that day. The anomalous day lights up against the quiet baseline.
 *
 *  Days are bucketed by the America/Chicago (Houston) calendar day - not by a
 *  fixed 86 400 000 ms offset - so DST transitions (where a Houston day is 23h
 *  or 25h long) don't mis-bin events at the boundary. Each cell's width is
 *  proportional to the actual ms width of that Houston day within the span. */
export function dayCells(ticks: StoryTick[], minTime: number, maxTime: number): DayCell[] {
  const span = maxTime - minTime;
  if (span <= 0) return [];

  // Enumerate the distinct Houston calendar days that overlap (minTime, maxTime).
  // Walk forward in ~23h steps (safe to catch every Houston midnight even on a
  // 23h DST day) and collect unique day keys via houstonDayKey.
  // Probe up to (maxTime - 1): maxTime is an exclusive boundary - if it happens
  // to fall exactly on a Houston midnight we do NOT want to open a new cell for
  // a day with no events inside the window.
  const DAY_STEP_MS = 23 * 3_600_000; // safe step - always < shortest DST day
  const dayKeys: string[] = [];
  const seen = new Set<string>();
  for (let probe = minTime; probe < maxTime; probe += DAY_STEP_MS) {
    const key = houstonDayKey(probe);
    if (!seen.has(key)) {
      seen.add(key);
      dayKeys.push(key);
    }
  }
  // The probes can step over the window's last part-day (a window ending
  // mid-day may end between two probes of one day), so key the day that holds
  // the last moment inside the window if the probes did not reach it.
  const lastKey = houstonDayKey(maxTime - 1);
  if (!seen.has(lastKey)) {
    seen.add(lastKey);
    dayKeys.push(lastKey);
  }

  // For each day key, find the Houston midnight that starts it so we can
  // compute ms-accurate leftPct / widthPct from the real day boundaries.
  // Binary-search for the first ms whose houstonDayKey === key, which is the
  // Houston midnight of that calendar day expressed in UTC ms.
  function houstonMidnightMs(key: string): number {
    // Houston is UTC-5 (CDT) or UTC-6 (CST) - i.e. BEHIND UTC. Local midnight
    // for a given calendar date therefore falls 5-6h AFTER that date's UTC
    // midnight, not before it. Bracket [utcMidnight, utcMidnight + 6h]: the
    // lower bound is always still the previous Houston day (or exactly the
    // boundary), the upper bound is always past the latest possible offset.
    const utcMidnight = Date.parse(key + "T00:00:00Z");
    let lo = utcMidnight;                     // never yet the target day
    let hi = utcMidnight + 6 * 3_600_000;      // always past the true midnight
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (houstonDayKey(mid) === key) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  // Build cells: one per Houston calendar day, with ms-accurate boundaries.
  // dayEnd is the midnight that opens the NEXT day (or maxTime for the last
  // cell). visEnd is clamped to maxTime so widthPct sums to 100 across cells.
  const cells: DayCell[] = [];
  for (let i = 0; i < dayKeys.length; i++) {
    const dayStart = houstonMidnightMs(dayKeys[i]);
    const dayEnd = i + 1 < dayKeys.length
      ? houstonMidnightMs(dayKeys[i + 1])
      : maxTime; // last cell's right edge is maxTime exactly
    // Clip cell to [minTime, maxTime].
    const visStart = Math.max(dayStart, minTime);
    const visEnd = Math.min(dayEnd, maxTime);
    if (visEnd <= visStart) continue;
    cells.push({
      leftPct: ((visStart - minTime) / span) * 100,
      widthPct: ((visEnd - visStart) / span) * 100,
      count: 0,
      severe: false,
    });
  }

  // Assign each tick to its Houston calendar day cell.
  for (const t of ticks) {
    const key = houstonDayKey(t.ts);
    const idx = dayKeys.indexOf(key);
    if (idx >= 0 && idx < cells.length) {
      cells[idx].count += 1;
      if (t.severe || t.kind === "fraud") cells[idx].severe = true;
    }
  }

  return cells;
}
