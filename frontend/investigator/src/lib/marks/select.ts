/**
 * The pure selectors over the investigator's nodes, notes and paths: the facts of one record, the
 * records Your marks lists, the pinned records in time order (what a pinned path joins), a path's
 * stops as the surfaces draw them, and the Fail category list. The stores' hooks (`store/marks.ts`)
 * call these over raw slices; nothing here reads a store.
 *
 * A record's notes are the story's notes whose `link` is that record; no field is added to a note.
 * Every comparison of records goes through `sameRecord` and `recordKey` (fraud is auth).
 *
 * What this file does not do: it draws nothing, decides nothing about whether a record is shown (that
 * is `draw.ts`), and holds no wall clock. The three Yours names are re-exported from `facts.ts`.
 */
import type { RecordInfo, RecordLookup } from "../../components/notes/record-lookup";
import { categoryExists, checkCategoryName, normalizeCategoryName } from "../notes/categories";
import { sortNotes } from "../notes/order";
import type { Note } from "../notes/types";
import type { DecisionView } from "../verdicts";
import { isShown, type ShowInputs } from "./draw";
import { isMarked } from "./facts";
import { compareRecords } from "./schema";
import { MARK_LIMITS, canonicalKind, recordKey, sameRecord, type CustomPath, type RecordFacts, type RecordNode, type RecordRef } from "./types";

export { isMarked, YOURS_PREDICATES, yoursMatch } from "./facts";

/** The node of a record, compared canonically, or null. */
export function nodeOf(nodes: readonly RecordNode[], r: RecordRef): RecordNode | null {
  return nodes.find((n) => sameRecord(n.record, r)) ?? null;
}

/** The story's notes linked to a record, in time then seq order. */
export function notesOf(notes: readonly Note[], scenario: string, r: RecordRef): Note[] {
  return sortNotes(notes.filter((n) => n.scenario === scenario && n.link !== null && sameRecord(n.link, r)));
}

/**
 * One function from a record to what the investigator has done to it, built once from the story's
 * nodes, notes and paths (another story's rows are ignored). An unknown record has no fact.
 */
export function factsIndex(
  scenario: string,
  nodes: readonly RecordNode[],
  notes: readonly Note[],
  paths: readonly CustomPath[],
): (r: RecordRef) => RecordFacts {
  const held = new Map<string, { pinned: boolean; disposition: RecordNode["disposition"] }>();
  for (const n of nodes) if (n.scenario === scenario) held.set(recordKey(n.record), { pinned: n.pinned, disposition: n.disposition });
  const noted = new Set<string>();
  for (const n of notes) if (n.scenario === scenario && n.link !== null) noted.add(recordKey(n.link));
  const inPath = new Set<string>();
  for (const p of paths) if (p.scenario === scenario) for (const stop of p.stops) inPath.add(recordKey(stop));
  return (r) => {
    const key = recordKey(r);
    const node = held.get(key);
    return { pinned: node?.pinned ?? false, disposition: node?.disposition ?? "none", noted: noted.has(key), inPath: inPath.has(key) };
  };
}

export interface YourMark {
  record: RecordRef;
  /** Null when the record is not in the data. */
  info: RecordInfo | null;
  node: RecordNode | null;
  notes: Note[];
}

/** 0 for a record with a time, 1 for one found with none, 2 for one not in the data. */
const rank = (m: YourMark): number => (m.info === null ? 2 : m.info.time === null ? 1 : 0);

/**
 * The records the investigator marked (pinned, with a disposition, or noted), pinned first, then by
 * the record's time, a record with no time after those with one, a record not in the data last, ties
 * by record key. A cleared node with no note is not marked and is left out.
 */
export function yourMarks(scenario: string, nodes: readonly RecordNode[], notes: readonly Note[], lookup: RecordLookup): YourMark[] {
  const held = new Map<string, RecordNode>();
  for (const n of nodes) if (n.scenario === scenario) held.set(recordKey(n.record), n);
  const records = new Map<string, RecordRef>();
  for (const [key, n] of held) records.set(key, n.record);
  for (const n of notes) {
    if (n.scenario === scenario && n.link !== null && !records.has(recordKey(n.link))) {
      records.set(recordKey(n.link), { kind: canonicalKind(n.link.kind), id: n.link.id });
    }
  }
  const out: YourMark[] = [];
  for (const [key, record] of records) {
    const node = held.get(key) ?? null;
    const mine = notesOf(notes, scenario, record);
    const f: RecordFacts = { pinned: node?.pinned ?? false, disposition: node?.disposition ?? "none", noted: mine.length > 0, inPath: false };
    if (isMarked(f)) out.push({ record, info: lookup(record), node, notes: mine });
  }
  return out.sort((a, b) => {
    const pin = Number(b.node?.pinned ?? false) - Number(a.node?.pinned ?? false);
    if (pin !== 0) return pin;
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const byTime = (a.info?.time ?? 0) - (b.info?.time ?? 0);
    return byTime !== 0 ? byTime : compareRecords(a.record, b.record);
  });
}

/** The pinned records that are in the data and have a time, in time order, then record key. */
export function pinnedInTimeOrder(nodes: readonly RecordNode[], lookup: RecordLookup): RecordRef[] {
  const timed: { record: RecordRef; time: number }[] = [];
  for (const n of nodes) {
    if (!n.pinned) continue;
    const info = lookup(n.record);
    if (info !== null && info.time !== null) timed.push({ record: n.record, time: info.time });
  }
  timed.sort((a, b) => a.time - b.time || compareRecords(a.record, b.record));
  return timed.map((t) => t.record);
}

/** What "Join pinned" makes a path of: the pinned records in time order, cut to 50; null under 2. */
export function joinPinned(nodes: readonly RecordNode[], lookup: RecordLookup): RecordRef[] | null {
  const pinned = pinnedInTimeOrder(nodes, lookup);
  return pinned.length < MARK_LIMITS.stopsMin ? null : pinned.slice(0, MARK_LIMITS.stopsMax);
}

/**
 * The default name of a new path: "Path N", N one more than the highest N of the names "Path <digits>"
 * (so "Path 07" counts as 7), else one more than the number of paths. LIMIT: a number of more than 9
 * digits is not counted, which keeps N a safe integer.
 */
export function nextPathName(paths: readonly CustomPath[]): string {
  let highest: number | null = null;
  for (const p of paths) {
    const m = /^Path (\d{1,9})$/.exec(p.name);
    if (m) highest = Math.max(highest ?? 0, Number(m[1]));
  }
  return `Path ${highest === null ? paths.length + 1 : highest + 1}`;
}

/**
 * The words of the story's failed decisions, in the order of their time, each once ignoring case,
 * normalised and then checked as a category name (a word that fails the check is left out).
 */
export function failWords(decisions: readonly DecisionView[]): string[] {
  const out: string[] = [];
  for (const d of [...decisions].sort((a, b) => a.at - b.at)) {
    if (d.tone !== "fail") continue;
    const word = normalizeCategoryName(d.word);
    if (checkCategoryName(word).ok && !categoryExists(out, word)) out.push(word);
  }
  return out;
}

/** The Fail category list: the story's words, then the typed ones no story word equals ignoring case. */
export function failCategoryList(storyWords: readonly string[], typed: readonly string[]): string[] {
  const out = [...storyWords];
  for (const name of typed) if (!categoryExists(out, name)) out.push(name);
  return out;
}

export interface PathStopView {
  record: RecordRef;
  /** The stop's place in the path, from 1; it keeps its number when a stop is not drawn. */
  n: number;
  info: RecordInfo | null;
  shown: boolean;
  onGlobe: boolean;
  onTimeline: boolean;
}

/**
 * A path's stops as the surfaces draw them. A stop is shown when its record is in the data and passes
 * the switches; it is on the globe when shown with a place, and on the Timeline when shown with a time.
 */
export function pathStops(path: CustomPath, lookup: RecordLookup, s: ShowInputs): PathStopView[] {
  return path.stops.map((record, i) => {
    const info = lookup(record);
    const shown = info !== null && isShown(info.draw, s);
    return { record, n: i + 1, info, shown, onGlobe: shown && info.lngLat !== null, onTimeline: shown && info.time !== null };
  });
}
