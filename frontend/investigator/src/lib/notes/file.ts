/**
 * The notes file (design section 6): one format for both builds, checked all or nothing. A file
 * either passes every check, the card number guard included, or it loads nothing: the result
 * of a refusal holds no value. The caller sends the checked file on (to the backend's import
 * or into memory); this module does not read a file and does not store anything.
 *
 * A file's `seq` is checked and kept here, and the apply step discards it: a note whose id is
 * held replaces it and keeps its seq, a new id takes the next seq in file order.
 */
import { checkCategoryName, categoryExists } from "./categories";
import { checkFileNote, checkScenario, exactShape } from "./schema";
import { sortNotes } from "./order";
import { LIMITS, fail, ok, type Check, type Note, type NoteError, type NotesFile } from "./types";
import { checkFileMarks, compareRecords, type FileMarks } from "../marks/schema";
import type { CustomPath, RecordNode } from "../marks/types";

/** The marks `buildNotesFile` writes: the held lists (any story; this story's are kept) and the typed Fail categories, which every story shares. */
export interface BuiltMarks {
  nodes: readonly RecordNode[];
  paths: readonly CustomPath[];
  failCategories: readonly string[];
}

export interface CheckFileOptions {
  /** The scenarios this page has. When given, a file for another scenario is refused. */
  scenarios?: readonly string[];
  /**
   * The scenario's own span of time, as the page holds it (the playhead's bounds). When given, a
   * note whose time lies outside it, ends included, refuses the whole file: opening a note puts
   * its time in the address, and the time field is not guarded (a 13 digit time can pass Luhn).
   * An empty span (min above max) refuses every note. Without it the design's range alone applies.
   */
  timeSpan?: { min: number; max: number };
}

const FILE_KEYS = ["format", "version", "scenario", "categories", "notes"] as const;
/** Version 2 holds the marks beside the notes. */
const FILE_KEYS_V2 = [...FILE_KEYS, "nodes", "paths", "failCategories"] as const;

/** A file refusal speaks in the file's few codes: card number, too large, scenario, or not a notes file. */
function asFileError(e: NoteError): { ok: false } & NoteError {
  const keep = e.code === "card_number" || e.code === "too_large" || e.code === "bad_scenario";
  return fail(keep ? e.code : "bad_file", e.where);
}

export function checkFile(raw: unknown, opts: CheckFileOptions = {}): Check<NotesFile> {
  // Exactly the eight keys with version 2, or exactly the five with version 1 (lifted below). Any
  // other mix, such as version 2 with five keys, is not a notes file.
  const eight = exactShape(raw, FILE_KEYS_V2);
  const five = eight ? null : exactShape(raw, FILE_KEYS);
  const o = eight && eight.version === 2 ? eight : five && five.version === 1 ? five : null;
  if (!o || o.format !== "ffr-notes") return fail("bad_file", "");
  const version = eight ? 2 : 1;

  const scenario = checkScenario(o.scenario, "scenario");
  if (!scenario.ok) return asFileError(scenario);
  if (opts.scenarios && !opts.scenarios.includes(scenario.value)) return fail("bad_scenario", "scenario");

  if (!Array.isArray(o.categories)) return fail("bad_file", "categories");
  if (!Array.isArray(o.notes)) return fail("bad_file", "notes");
  if (o.notes.length > LIMITS.fileNotes) return fail("too_large", "notes");

  const categories: string[] = [];
  for (let i = 0; i < o.categories.length; i++) {
    const where = `categories[${i}]`;
    const c = checkCategoryName(o.categories[i], where);
    if (!c.ok) return asFileError(c);
    if (categoryExists(categories, c.value)) return fail("bad_file", where);
    categories.push(c.value);
  }

  const notes: NotesFile["notes"] = [];
  const seen = new Set<string>();
  for (let i = 0; i < o.notes.length; i++) {
    const where = `notes[${i}]`;
    const n = checkFileNote(o.notes[i], scenario.value, where);
    if (!n.ok) return asFileError(n);
    if (seen.has(n.value.id)) return fail("bad_file", `${where}.id`);
    seen.add(n.value.id);
    const v = n.value;
    const span = opts.timeSpan;
    if (span && !(v.time >= span.min && v.time <= span.max)) return fail("bad_file", `${where}.time`);
    notes.push({ id: v.id, time: v.time, link: v.link, colour: v.colour, category: v.category, decision: v.decision, seq: v.seq, body: v.body });
  }
  // A version 1 file is lifted with empty marks; the timeSpan above judged the notes only.
  let marks: FileMarks = { nodes: [], paths: [], failCategories: [] };
  if (version === 2) {
    const m = checkFileMarks(o, scenario.value);
    if (!m.ok) return asFileError(m);
    marks = m.value;
  }
  return ok({ format: "ffr-notes", version: 2, scenario: scenario.value, categories, notes, ...marks });
}

const encoder = new TextEncoder();

/** File text to a checked file. The size is checked before the text is parsed. */
export function parseNotesFile(text: string, opts: CheckFileOptions = {}): Check<NotesFile> {
  if (encoder.encode(text).length > LIMITS.fileBytes) return fail("too_large", "");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("bad_json", "");
  }
  return checkFile(raw, opts);
}

/**
 * The document to save: this scenario's notes in order, without the scenario on each note.
 * It holds no clock field. The caller checks it with `checkFile` if it came from outside.
 */
export function buildNotesFile(
  scenario: string,
  categories: readonly string[],
  notes: readonly Note[],
  marks: BuiltMarks = { nodes: [], paths: [], failCategories: [] },
): NotesFile {
  const mine = sortNotes(notes.filter((n) => n.scenario === scenario));
  return {
    format: "ffr-notes",
    version: 2,
    scenario,
    categories: [...categories],
    notes: mine.map((n) => ({
      id: n.id,
      time: n.time,
      link: n.link === null ? null : { kind: n.link.kind, id: n.link.id },
      colour: n.colour,
      category: n.category,
      decision: n.decision,
      seq: n.seq,
      body: JSON.parse(JSON.stringify(n.body)),
    })),
    nodes: marks.nodes
      .filter((n) => n.scenario === scenario)
      .sort((a, b) => compareRecords(a.record, b.record))
      .map((n) => ({
        record: { kind: n.record.kind, id: n.record.id },
        pinned: n.pinned,
        disposition: n.disposition,
        category: n.category,
        settled: n.settled,
      })),
    paths: marks.paths
      .filter((p) => p.scenario === scenario)
      .sort((a, b) => a.seq - b.seq)
      .map((p) => ({ id: p.id, seq: p.seq, name: p.name, stops: p.stops.map((s) => ({ kind: s.kind, id: s.id })) })),
    failCategories: [...marks.failCategories],
  };
}
