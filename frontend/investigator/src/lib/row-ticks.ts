/**
 * The rows' pure parts. A node's description, the list's
 * height, the cut of a name, a row's short number, and the keys under the list's one Tab stop.
 * Each is a function of what it is given: no clock, no storage, no DOM, and no word of a pack.
 */
import type { CaseStepEvent } from "./case-events";
import { FIGURE_ADVANCE_EM } from "./head-edge";
import { HEAD_RAIL, LIST_FLOOR_ROWS, OPEN_BAR_SHARE, ROW } from "./bar-metrics";
import { ringFacts } from "./time-words";
import { entityOfEvent, type Track, type TrackBar } from "./tracks";

/** One event as a row draws it: the track's own rules for the dot and its rings. */
export interface RowTick {
  id: string;
  kind: string;
  label: string;
  /** The record's second line, as the manifest words it. */
  secondary: string;
  /** Field lines that explain a ring on the node: the field and its value, no adjective. */
  facts: string[];
  t: number;
  session: string | null;
  challengeVar: "r3" | "alarm" | null;
  newDevice: boolean;
  blocked: boolean;
}

/** Every dot event as the track describes it (the same rules as CaseTimelineLayer's ticks). */
export function rowTicks(events: readonly CaseStepEvent[]): RowTick[] {
  const out: RowTick[] = [];
  for (const e of events) {
    const ent = entityOfEvent(e);
    if (!ent) continue;
    const m = e.match;
    let challengeVar: RowTick["challengeVar"] = null;
    let newDevice = false;
    let blocked = false;
    let facts: string[] = [];
    if (m.kind === "login") {
      if (m.login.outcome === "challenge_passed" || m.login.outcome === "challenge_required") challengeVar = "r3";
      else if (m.login.outcome === "challenge_failed") challengeVar = "alarm";
      newDevice = m.login.device_trust === "new";
      facts = ringFacts({ deviceTrust: m.login.device_trust, outcome: m.login.outcome });
    }
    if (m.kind === "transfer") {
      blocked = m.transfer.status === "blocked";
      facts = ringFacts({ status: m.transfer.status });
    }
    out.push({
      id: e.id,
      kind: ent.kind,
      label: ent.displayMetadata.primaryLabel,
      secondary: ent.displayMetadata.secondaryLabel ?? "",
      facts,
      t: e.t,
      session: (ent.fields as { session_id?: string }).session_id ?? null,
      challengeVar,
      newDevice,
      blocked,
    });
  }
  return out;
}

/** The rest of the open bar, in px: the top row, the day band, the track, the lane, the dates and
 *  the padding. Kept here as the
 *  one place the list's height reads it. The head's rail adds to it, less the 8 px of margin the
 *  top row gives up. */
const OTHER_CONTENT_PX = 176;
const TOP_ROW_MARGIN_PX = 8;

export interface ListHeightInput {
  innerHeight: number;
  /** How many named rows the list holds. */
  named: number;
  /** How many rest rows stand under it. They count against the share. */
  rest: number;
  /** The px that the open depth lines take. The list gives that room back; 0 gives the same list. */
  depthPx: number;
}

/**
 * The rows' list height in px: the larger of three rows and a half and what the window's share
 * leaves after the other content, the rest rows and the depth lines, in whole rows plus half a
 * row so that a list that goes on visibly goes on. A list whose rows all fit takes its rows.
 */
export function rowListHeight({ innerHeight, named, rest, depthPx }: ListHeightInput): number {
  const chrome = OTHER_CONTENT_PX + (HEAD_RAIL - TOP_ROW_MARGIN_PX) + depthPx;
  const whole = Math.max(Math.floor(LIST_FLOOR_ROWS), Math.floor((innerHeight * OPEN_BAR_SHARE - chrome - rest * ROW) / ROW));
  return named > whole ? whole * ROW + Math.round(ROW / 2) : named * ROW;
}

/** How many characters of a name fit a cell `widthPx` wide at the measured advance of the face. */
export function nameChars(widthPx: number, fontPx = 10): number {
  return Math.floor(widthPx / (FIGURE_ADVANCE_EM * fontPx));
}

/** A name cut to `chars` characters, with an ellipsis in the last place; a name that fits is whole. */
export function cutName(name: string, chars: number): string {
  if (name.length <= chars) return name;
  return chars > 0 ? `${name.slice(0, chars - 1)}…` : "";
}

/** The fold button's accessible name: the heading and the count as words, "Squad: 30 rows". */
export function rowsCountName(heading: string, named: number): string {
  const count = `${named} ${named === 1 ? "row" : "rows"}`;
  return heading ? `${heading}: ${count}` : count;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** A row's number, short: "5.6", "216", "1.01K". The full amount is in its tooltip. */
export function shortNumber(value: number): string {
  return value >= 1000 ? compact.format(value) : value >= 10 ? whole.format(value) : oneDecimal.format(value);
}

/** The bar whose bucket holds `at` (`t <= at < t + step`); bars are in time order. */
export function barAt(bars: readonly TrackBar[], step: number, at: number): TrackBar | null {
  if (!(step > 0) || bars.length === 0) return null;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].t <= at) lo = mid;
    else hi = mid - 1;
  }
  const bar = bars[lo];
  return bar.t <= at && at < bar.t + step ? bar : null;
}

/** A line that can carry a number at the playhead: a row, or an open row's line of bars on the
 *  shared scale. `top` and `h` are its place and height in px inside the block that holds it. */
export interface FigureLine {
  key: string;
  name: string;
  bars: readonly TrackBar[];
  top: number;
  h: number;
}

/** The key of a member line's stop, which joins its row's key and its own. */
export const lineStopKey = (trackKey: string, lineKey: string): string => `${trackKey}/${lineKey}`;

/** Where the figures of a block of rows stand: each row, and each member line of an open row that
 *  has bars, one ROW apart, and the block's whole height. */
export function figureLines(tracks: readonly Track[], open: ReadonlySet<string>): { lines: FigureLine[]; height: number } {
  const lines: FigureLine[] = [];
  let y = 0;
  for (const track of tracks) {
    lines.push({ key: track.key, name: track.name, bars: track.bars, top: y, h: ROW });
    y += ROW;
    if (!open.has(track.key)) continue;
    for (const line of track.lines) {
      if (line.bars.length > 0) lines.push({ key: lineStopKey(track.key, line.key), name: `${track.name} · ${line.name}`, bars: line.bars, top: y, h: ROW });
      y += ROW;
    }
  }
  return { lines, height: y };
}

/** The stops of a block of rows in reading order: each row, then the lines of an open row. */
export function rowStops(tracks: readonly Track[], open: ReadonlySet<string>): Stop[] {
  const stops: Stop[] = [];
  for (const track of tracks) {
    const opens = track.lines.length > 0;
    stops.push({ key: track.key, parent: null, open: opens ? open.has(track.key) : null });
    if (opens && open.has(track.key)) {
      for (const line of track.lines) stops.push({ key: lineStopKey(track.key, line.key), parent: track.key, open: null });
    }
  }
  return stops;
}

/** One place the list's one Tab stop can stand: a row or an open row's line, in reading order. */
export interface Stop {
  key: string;
  /** The key of the row a line belongs to; null for a row. */
  parent: string | null;
  /** True open, false closed, null for a stop with nothing to open. */
  open: boolean | null;
}

export interface StopAction {
  /** The key the focus moves to. */
  focus?: string;
  /** A row to open or fold; the focus stays where it is. */
  open?: { key: string; open: boolean };
}

/**
 * What a key does on the stop `from`, after the keyboard pattern of a tree view: the down and up
 * keys, Home and End move between stops and change no row; the right key opens a closed row, and
 * on an open row moves to its first line; the left key folds an open row, and on a line moves to
 * its row. Anything else, and a stop the list does not hold, is null.
 */
export function stopAction(stops: readonly Stop[], from: string, key: string): StopAction | null {
  const i = stops.findIndex((s) => s.key === from);
  if (i < 0) return null;
  const here = stops[i];
  const go = (j: number): StopAction | null => (j >= 0 && j < stops.length && j !== i ? { focus: stops[j].key } : null);
  switch (key) {
    case "ArrowDown": return go(i + 1);
    case "ArrowUp": return go(i - 1);
    case "Home": return go(0);
    case "End": return go(stops.length - 1);
    case "ArrowRight":
      if (here.open === false) return { open: { key: here.key, open: true } };
      return here.open === true && stops[i + 1]?.parent === here.key ? go(i + 1) : null;
    case "ArrowLeft":
      if (here.open === true) return { open: { key: here.key, open: false } };
      return here.parent !== null ? { focus: here.parent } : null;
    default:
      return null;
  }
}
