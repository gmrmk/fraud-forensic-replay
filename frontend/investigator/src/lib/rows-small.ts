/**
 * The folded rows' small version, its pure parts: how many
 * of the named rows are active in each hour, or in each day where the story has no hour; the scale
 * of that count (0 to the largest count of the whole case); the number at the line; and the words
 * the name cell prints. Each is a function of the rows model and the events it is given. No clock,
 * no storage, no DOM, no word of a pack, and the playhead is an argument, never read here.
 *
 * A row is active in a step when it has an event, or a bar over zero, in it. While a row is alone the count is that row's own events
 * in the step, with its own scale.
 */
import { SMALL_PLOT_PX } from "./bar-metrics-small";
import { houstonDayKey } from "./houston-day";
import type { RowTick } from "./row-ticks";
import { formatStep } from "./timeline-lanes";
import type { TrackSet } from "./tracks";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A Houston day is 23, 24 or 25 hours long, so 26 hours before an instant is always on an earlier
 *  day, and 26 hours after a midnight is always on a later one. */
const SEARCH_MS = 26 * HOUR;

/**
 * The start of the Houston day that holds `ms`: the first instant whose Houston date is the same.
 * Found by bisection on the zone's own calendar, so it is right across a clock change.
 */
export function houstonDayStart(ms: number): number {
  if (!Number.isFinite(ms)) return ms;
  const key = houstonDayKey(ms);
  let lo = ms - SEARCH_MS;
  let hi = ms;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (houstonDayKey(mid) === key) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The end of the Houston day that starts at `start`: the next local midnight. */
export function houstonDayEnd(start: number): number {
  if (!Number.isFinite(start)) return start;
  const key = houstonDayKey(start);
  let lo = start;
  let hi = start + SEARCH_MS;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (houstonDayKey(mid) === key) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** One bar of the count: the cell `t` to `end` (an hour, or a Houston day of its own length) and
 *  its count. */
export interface CountCell {
  t: number;
  end: number;
  n: number;
}

export interface CountModel {
  /** The cells that hold something, in time order. */
  cells: readonly CountCell[];
  /** The largest count over the whole case: what a full plot stands for. 0 when nothing counts. */
  top: number;
  /** The step in ms: the bars' step, or a day for a story with no step. */
  step: number;
  /** Where the bars' grid starts; null for a story with no step, whose cells are Houston days. */
  origin: number | null;
  /** How many named rows there are. The number at the line counts out of all of them. */
  named: number;
  /** True while the count is one soloed row's own events. */
  soloed: boolean;
  /** The count of each cell, by the cell's start. */
  byStart: ReadonlyMap<number, number>;
}

export interface CountInput {
  set: TrackSet;
  /** Every dot event of the case. */
  ticks: readonly RowTick[];
  /** The key of the row that is alone, or null. A key that names no named row narrows nothing. */
  soloKey: string | null;
}

interface Acc {
  end: number;
  rows: Set<number>;
  events: number;
}

export function buildCountModel({ set, ticks, soloKey }: CountInput): CountModel {
  const named = set.tracks.filter((t) => !t.rest).length;
  const soloIndex = soloKey === null ? -1 : set.tracks.findIndex((t) => t.key === soloKey && !t.rest);
  const soloed = soloIndex >= 0;

  const first = set.tracks.find((t) => t.bars.length > 0)?.bars[0].t;
  const gridded = set.step > 0 && first !== undefined;
  const step = gridded ? set.step : DAY;
  const origin = gridded ? first : null;

  // A story with no step takes each cell from the Houston day the event falls in, found once for
  // each day: bisection on the zone's own calendar, never a read of the clock.
  const days = new Map<string, { start: number; end: number }>();
  const cellOf = (t: number): { start: number; end: number } => {
    if (origin !== null) {
      const start = origin + Math.floor((t - origin) / step) * step;
      return { start, end: start + step };
    }
    const key = houstonDayKey(t);
    let day = days.get(key);
    if (!day) {
      const start = houstonDayStart(t);
      day = { start, end: houstonDayEnd(start) };
      days.set(key, day);
    }
    return day;
  };

  const acc = new Map<number, Acc>();
  const touch = (t: number): Acc => {
    const { start, end } = cellOf(t);
    let cell = acc.get(start);
    if (!cell) acc.set(start, (cell = { end, rows: new Set(), events: 0 }));
    return cell;
  };

  if (!soloed) {
    set.tracks.forEach((track, i) => {
      if (track.rest) return;
      for (const bar of track.bars) if (bar.value > 0) touch(bar.t).rows.add(i);
    });
  }
  for (const tick of ticks) {
    const i = set.trackOf.get(tick.id);
    if (i === undefined || set.tracks[i].rest) continue;
    if (soloed) {
      if (i === soloIndex) touch(tick.t).events += 1;
    } else {
      touch(tick.t).rows.add(i);
    }
  }

  const cells: CountCell[] = [...acc]
    .map(([t, a]) => ({ t, end: a.end, n: soloed ? a.events : a.rows.size }))
    .filter((c) => c.n > 0)
    .sort((a, b) => a.t - b.t);
  return {
    cells,
    top: cells.reduce((most, c) => Math.max(most, c.n), 0),
    step,
    origin,
    named,
    soloed,
    byStart: new Map(cells.map((c) => [c.t, c.n])),
  };
}

/** The cell that holds `at`, with its count; a cell with nothing in it has a count of 0. */
export function cellAt(model: CountModel, at: number): CountCell {
  if (model.origin !== null) {
    const t = model.origin + Math.floor((at - model.origin) / model.step) * model.step;
    return { t, end: t + model.step, n: model.byStart.get(t) ?? 0 };
  }
  // A day cell that holds something is found by search among the cells, so a tick of playback
  // costs no calendar work; only a day with nothing in it is worked out from the zone.
  const { cells } = model;
  let lo = 0;
  let hi = cells.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (at < cells[mid].t) hi = mid - 1;
    else if (at >= cells[mid].end) lo = mid + 1;
    else return cells[mid];
  }
  const t = houstonDayStart(at);
  return { t, end: houstonDayEnd(t), n: 0 };
}

/** A bar's height in px on the 24 px plot: its share of the whole case's largest count. Not rounded
 *  to whole px, so two different counts never draw one height. */
export function barHeightPx(n: number, top: number): number {
  return n > 0 && top > 0 ? (n * SMALL_PLOT_PX) / top : 0;
}

/** The number at the line: out of all the named rows, or the soloed row's own count alone. */
export function countFigureText(n: number, named: number, soloed: boolean): string {
  return soloed ? String(n) : `${n} of ${named}`;
}

/** The name cell's range, "Active / 1H · 0 to 24"; the page draws it in capitals. The step is left
 *  out when it is not a whole unit. */
export function countLabelText(step: number, top: number, soloed: boolean): string {
  const unit = formatStep(step);
  return `${soloed ? "Events" : "Active"}${unit ? ` / ${unit}` : ""} · 0 to ${top}`;
}
