/**
 * axis-ticks - granularity-adaptive timeline axis. As the zoom window narrows,
 * the tick step shrinks and the label format sharpens: months across a year →
 * days across a month → hh:mm across hours → hh:mm:ss down in the seconds. So
 * drilling into a 90-second fraud burst shows real clock time, not a repeated date.
 *
 * All labels are Houston time (America/Chicago) - a fixed timezone,
 * so the axis reads the same on any machine (mirrors Timeline.tsx).
 */
const HOU_TZ = "America/Chicago";
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Candidate steps, smallest → largest. The first whose interval count fits under
// the label budget wins.
const TICK_STEPS = [
  SEC, 5 * SEC, 15 * SEC, 30 * SEC,
  MIN, 5 * MIN, 15 * MIN, 30 * MIN,
  HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
  DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY, 180 * DAY, 365 * DAY,
];

/** The tick step (ms) for a span: the smallest candidate giving ≤ ~7 intervals,
 *  so the axis grows finer as you zoom in. */
export function tickStep(span: number): number {
  for (const step of TICK_STEPS) if (span / step <= 7) return step;
  return TICK_STEPS[TICK_STEPS.length - 1];
}

/** A tick's label, granularity-matched to its step: hh:mm:ss by seconds, hh:mm by
 *  minutes/hours, a Mon-DD date by days/weeks, Mon-'YY at month+ scale. */
export function tickLabel(ms: number, step: number, h12 = false): string {
  const d = new Date(ms);
  // The clock's 12 hour form for the hour, minute and second steps: "4:00p", "4:00:15p".
  // Day and month steps carry no clock time, so both forms read the same there. The form
  // arrives as an argument; the default keeps the 24 hour marks every caller has today.
  if (h12 && step < DAY) {
    return d
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        ...(step < MIN ? { second: "2-digit" as const } : {}),
        hour12: true,
        timeZone: HOU_TZ,
      })
      .replace(/\s*([AP])M$/, (_all, ap: string) => ap.toLowerCase());
  }
  if (step < MIN) {
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: HOU_TZ,
    });
  }
  if (step < DAY) {
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: HOU_TZ,
    });
  }
  if (step < 30 * DAY) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: HOU_TZ });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: HOU_TZ });
}

/** Evenly-spaced, granularity-adaptive ticks across [min, max], aligned to the
 *  step boundary so they land on round seconds/minutes/hours, each with a label. */
export function axisTicks(
  min: number,
  max: number,
  h12 = false,
): { ms: number; label: string }[] {
  const span = max - min;
  if (span <= 0) return [];
  const step = tickStep(span);
  const ticks: { ms: number; label: string }[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) {
    ticks.push({ ms: t, label: tickLabel(t, step, h12) });
  }
  return ticks;
}
