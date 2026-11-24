/**
 * The closed checks for a node, a custom path and the marks part of a notes file. Whatever comes from
 * a backing's reply, a file or memory is checked here before it is stored or drawn; the backend has
 * twin checks (`backend/marks_schema.py`) on the same tables of cases.
 *
 *  - Each object has exactly the keys named: any other key at any depth is refused, an own
 *    `__proto__` key included. Every checker builds a fresh object and never spreads its input.
 *  - A refusal is a code and a path of fixed names and indices. It never holds a value.
 *  - The card number guard runs on every string: record kind and id, category, Fail category, path
 *    name and id. A name or category takes the note category rules (NFC, trimmed, 1 to 24 code
 *    points, no control or format character).
 *
 * What this file does not do: it reads no store and no backing, and holds no wall clock or random
 * source of its own (`makePathId` takes its draws from the note id maker, or from a source it is given).
 */
import { categoryExists, checkCategoryName } from "../notes/categories";
import { refusesText } from "../notes/guard";
import { makeNoteId } from "../notes/id";
import { checkLink, checkScenario, exactShape } from "../notes/schema";
import { LIMITS, fail, ok, type Check, type NoteError } from "../notes/types";
import {
  DISPOSITIONS,
  MARK_LIMITS,
  canonicalKind,
  recordKey,
  type CustomPath,
  type Disposition,
  type NodeFields,
  type PathFields,
  type RecordNode,
  type RecordRef,
} from "./types";

type Obj = Record<string, unknown>;
type Failed = { ok: false } & NoteError;

const at = (path: string, name: string): string => (path ? `${path}.${name}` : name);
const idx = (path: string, i: number): string => `${path}[${i}]`;

// ---------------------------------------------------------------------------- a record

/** A record reference: today's link check, null refused, the kind written canonical. */
export function checkRecord(raw: unknown, path = "record"): Check<RecordRef> {
  const link = checkLink(raw, path);
  if (!link.ok) return link;
  if (link.value === null) return fail("bad_request", path);
  return ok({ kind: canonicalKind(link.value.kind), id: link.value.id });
}

/** Record key order: the joined `kind:id` string, compared by code unit (never by locale). */
export function compareRecords(a: RecordRef, b: RecordRef): number {
  const x = recordKey(a);
  const y = recordKey(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

// ---------------------------------------------------------------------------- a node

function checkDisposition(raw: unknown, path: string): Check<Disposition> {
  const d = DISPOSITIONS.find((x) => x === raw);
  return d === undefined ? fail("bad_request", path) : ok(d);
}

const NODE_FIELD_KEYS = ["pinned", "disposition", "category"] as const;

/** Reads the three fields from an object `exactShape` has approved. */
function readNodeFields(o: Obj, path: string): Check<NodeFields> {
  if (typeof o.pinned !== "boolean") return fail("bad_request", at(path, "pinned"));
  const disposition = checkDisposition(o.disposition, at(path, "disposition"));
  if (!disposition.ok) return disposition;
  let category: string | null = null;
  if (o.category !== null) {
    const c = checkCategoryName(o.category, at(path, "category"));
    if (!c.ok) return c;
    // A category belongs to a FAIL and to nothing else.
    if (disposition.value !== "fail") return fail("bad_request", at(path, "category"));
    category = c.value;
  }
  return ok({ pinned: o.pinned, disposition: disposition.value, category });
}

/** Exactly `pinned`, `disposition` and `category`. */
export function checkNodeFields(raw: unknown, path = ""): Check<NodeFields> {
  const o = exactShape(raw, NODE_FIELD_KEYS);
  return o ? readNodeFields(o, path) : fail("bad_request", path);
}

/** Exactly `scenario`, `record`, `pinned`, `disposition`, `category` and `settled`. */
export function checkNode(raw: unknown, path = ""): Check<RecordNode> {
  const o = exactShape(raw, ["scenario", "record", ...NODE_FIELD_KEYS, "settled"]);
  if (!o) return fail("bad_request", path);
  const scenario = checkScenario(o.scenario, at(path, "scenario"));
  if (!scenario.ok) return scenario;
  const record = checkRecord(o.record, at(path, "record"));
  if (!record.ok) return record;
  const fields = readNodeFields(o, path);
  if (!fields.ok) return fields;
  if (typeof o.settled !== "boolean") return fail("bad_request", at(path, "settled"));
  return ok({
    scenario: scenario.value,
    record: record.value,
    pinned: fields.value.pinned,
    disposition: fields.value.disposition,
    category: fields.value.category,
    settled: o.settled,
  });
}

// ---------------------------------------------------------------------------- a path

const PATH_ID = /^path-[0-9a-f]{32}$/;

export function isPathId(s: unknown): boolean {
  return typeof s === "string" && PATH_ID.test(s);
}

/**
 * A path id: `path-` and 32 lowercase hex from a uuid. About 1 id in 450 holds a run the card number
 * guard refuses, so the maker draws again until the guard passes the id; the draws are the note id
 * maker's (`makeNoteId`, which keeps the default source of the notes), and a `uuid` given here is
 * used instead (so a test feeds it fixed draws). Throws after `maxDraws` draws that gave no usable
 * id; the error names no id.
 */
export function makePathId(uuid?: () => string, maxDraws = 16): string {
  const id = "path-" + makeNoteId(uuid, maxDraws).slice("note-".length);
  if (!isPathId(id) || refusesText(id)) throw new Error("path id: no usable draw");
  return id;
}

/** A path's name takes the note category rules; `where` names the place it was typed. */
export function checkPathName(raw: unknown, where = "name"): Check<string> {
  return checkCategoryName(raw, where);
}

/** A path's seq: a safe integer from 1 to the note bound (`lib/notes/schema.ts` keeps its own, unexported). */
function checkSeq(raw: unknown, path: string): Check<number> {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 1 || raw > LIMITS.maxSeq) return fail("bad_request", path);
  return ok(raw);
}

/** 2 to 50 records, each checked, none twice (by record key). Returns canonical, fresh records. */
function checkStops(raw: unknown, path: string): Check<RecordRef[]> {
  if (!Array.isArray(raw) || raw.length < MARK_LIMITS.stopsMin || raw.length > MARK_LIMITS.stopsMax) return fail("bad_request", path);
  const out: RecordRef[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const stop = checkRecord(raw[i], idx(path, i));
    if (!stop.ok) return stop;
    const key = recordKey(stop.value);
    if (seen.has(key)) return fail("bad_request", idx(path, i));
    seen.add(key);
    out.push(stop.value);
  }
  return ok(out);
}

function readPathFields(o: Obj, path: string): Check<PathFields> {
  const name = checkPathName(o.name, at(path, "name"));
  if (!name.ok) return name;
  const stops = checkStops(o.stops, at(path, "stops"));
  if (!stops.ok) return stops;
  return ok({ name: name.value, stops: stops.value });
}

/** Exactly `name` and `stops`. */
export function checkPathFields(raw: unknown, path = ""): Check<PathFields> {
  const o = exactShape(raw, ["name", "stops"]);
  return o ? readPathFields(o, path) : fail("bad_request", path);
}

/** Exactly `scenario`, `name` and `stops`: a path before the store gives it an id and a seq. */
export function checkPathDraft(raw: unknown, path = ""): Check<{ scenario: string } & PathFields> {
  const o = exactShape(raw, ["scenario", "name", "stops"]);
  if (!o) return fail("bad_request", path);
  const scenario = checkScenario(o.scenario, at(path, "scenario"));
  if (!scenario.ok) return scenario;
  const fields = readPathFields(o, path);
  if (!fields.ok) return fields;
  return ok({ scenario: scenario.value, name: fields.value.name, stops: fields.value.stops });
}

/** Exactly `id`, `scenario`, `seq`, `name` and `stops`. */
export function checkPath(raw: unknown, path = ""): Check<CustomPath> {
  const o = exactShape(raw, ["id", "scenario", "seq", "name", "stops"]);
  if (!o) return fail("bad_request", path);
  if (!isPathId(o.id)) return fail("bad_request", at(path, "id"));
  if (refusesText(o.id as string)) return fail("card_number", at(path, "id"));
  const scenario = checkScenario(o.scenario, at(path, "scenario"));
  if (!scenario.ok) return scenario;
  const seq = checkSeq(o.seq, at(path, "seq"));
  if (!seq.ok) return seq;
  const fields = readPathFields(o, path);
  if (!fields.ok) return fields;
  return ok({ id: o.id as string, scenario: scenario.value, seq: seq.value, name: fields.value.name, stops: fields.value.stops });
}

// ---------------------------------------------------------------------------- the marks of a file

export interface FileMarks {
  nodes: Omit<RecordNode, "scenario">[];
  paths: Omit<CustomPath, "scenario">[];
  failCategories: string[];
}

/**
 * A file refusal speaks in the file's few codes (card number, too large, scenario, or not a notes
 * file), as `lib/notes/file.ts` does for the notes; running a refusal through it twice changes nothing.
 */
function asFileError(e: NoteError): Failed {
  const keep = e.code === "card_number" || e.code === "too_large" || e.code === "bad_scenario";
  return fail(keep ? e.code : "bad_file", e.where);
}

/**
 * The marks part of a version 2 file: `nodes`, `paths` and `failCategories` of `o` (an object whose
 * keys the file check has already approved), for the file's scenario. All or nothing. Counts are
 * checked before any entry; every node record and path id is unique; Fail categories are unique
 * ignoring case. Refusals come back in the file's codes.
 */
export function checkFileMarks(o: Obj, scenario: string): Check<FileMarks> {
  if (!Array.isArray(o.nodes)) return fail("bad_file", "nodes");
  if (!Array.isArray(o.paths)) return fail("bad_file", "paths");
  if (!Array.isArray(o.failCategories)) return fail("bad_file", "failCategories");
  if (o.nodes.length > MARK_LIMITS.nodesPerScenario) return fail("too_large", "nodes");
  if (o.paths.length > MARK_LIMITS.pathsPerScenario) return fail("too_large", "paths");
  if (o.failCategories.length > MARK_LIMITS.failCategories) return fail("too_large", "failCategories");

  const nodes: FileMarks["nodes"] = [];
  const records = new Set<string>();
  for (let i = 0; i < o.nodes.length; i++) {
    const where = idx("nodes", i);
    const e = exactShape(o.nodes[i], ["record", ...NODE_FIELD_KEYS, "settled"]);
    if (!e) return fail("bad_file", where);
    const n = checkNode(
      { scenario, record: e.record, pinned: e.pinned, disposition: e.disposition, category: e.category, settled: e.settled },
      where,
    );
    if (!n.ok) return asFileError(n);
    const key = recordKey(n.value.record);
    if (records.has(key)) return fail("bad_file", at(where, "record"));
    records.add(key);
    const { scenario: _scenario, ...rest } = n.value;
    nodes.push(rest);
  }

  const paths: FileMarks["paths"] = [];
  const ids = new Set<string>();
  for (let i = 0; i < o.paths.length; i++) {
    const where = idx("paths", i);
    const e = exactShape(o.paths[i], ["id", "seq", "name", "stops"]);
    if (!e) return fail("bad_file", where);
    const p = checkPath({ id: e.id, scenario, seq: e.seq, name: e.name, stops: e.stops }, where);
    if (!p.ok) return asFileError(p);
    if (ids.has(p.value.id)) return fail("bad_file", at(where, "id"));
    ids.add(p.value.id);
    const { scenario: _scenario, ...rest } = p.value;
    paths.push(rest);
  }

  const failCategories: string[] = [];
  for (let i = 0; i < o.failCategories.length; i++) {
    const where = idx("failCategories", i);
    const c = checkCategoryName(o.failCategories[i], where);
    if (!c.ok) return asFileError(c);
    if (categoryExists(failCategories, c.value)) return fail("bad_file", where);
    failCategories.push(c.value);
  }
  return ok({ nodes, paths, failCategories });
}
