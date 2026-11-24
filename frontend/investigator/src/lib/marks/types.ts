/**
 * The investigator's node model: the shapes and the small pure helpers every part of it shares.
 * A node is the investigator's state for one record of one story (a pin, a disposition and a Fail
 * category), kept by `(scenario, record.kind, record.id)`. A custom path is an ordered list of
 * records. Types, constants and tiny pure helpers only.
 *
 * A node never names a time: its time is its record's time, read when it is drawn. The record is
 * today's note link, `{ kind, id }`, and `fraud` is written and compared as `auth` (the lookup treats
 * them as one record), so every comparison goes through `canonicalKind`.
 *
 * What this file does not do: it checks nothing (that is `schema.ts`), reads no store and no
 * backing, and holds no wall clock.
 */
import type { NoteLink } from "../notes/types";
import type { VerdictTone } from "../verdicts";

export type RecordRef = NoteLink;

/** The one kind a transaction is stored as: a fraud transaction is the same record as an auth one. */
export const canonicalKind = (kind: string): string => (kind === "fraud" ? "auth" : kind);
export const recordKey = (r: RecordRef): string => `${canonicalKind(r.kind)}:${r.id}`;
export const sameRecord = (a: RecordRef, b: RecordRef): boolean => recordKey(a) === recordKey(b);

/** "wait" shows as WAITING. */
export const DISPOSITIONS = ["none", "pass", "fail", "wait"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];
export type SetDisposition = Exclude<Disposition, "none">;
/** The three set dispositions are verdict tones of the same name. */
export const toneOf = (d: SetDisposition): VerdictTone => d;

export interface NodeFields {
  pinned: boolean;
  disposition: Disposition;
  /** A string only while the disposition is "fail". */
  category: string | null;
}
export interface RecordNode extends NodeFields {
  scenario: string;
  /** Canonical kind. */
  record: RecordRef;
  /**
   * True once the record's disposition was set or cleared by a press, written by the move, or read
   * true from a notes file. It never goes back to false. The move writes only where it is false.
   */
  settled: boolean;
}
export interface PathFields {
  /** 1 to 24 code points, the note category rules. */
  name: string;
  /** 2 to 50 records, the investigator's order, no record twice. */
  stops: RecordRef[];
}
export interface CustomPath extends PathFields {
  /** "path-" and 32 lowercase hex. */
  id: string;
  scenario: string;
  /** The highest seq of the scenario plus one (a removed top seq can come back; nothing uses seq as an identity). */
  seq: number;
}

/**
 * `nameChars` is the note category's own length (`LIMITS.categoryChars`). `failCategories` is the count of
 * typed Fail categories in all: they are shared by every story, as note categories are.
 */
export const MARK_LIMITS = {
  nodesPerScenario: 1000,
  pathsPerScenario: 20,
  stopsMin: 2,
  stopsMax: 50,
  nameChars: 24,
  failCategories: 100,
} as const;

export type YoursFacet = "pinned" | "pass" | "fail" | "wait" | "noted" | "inPath";
export const YOURS_FACETS: readonly YoursFacet[] = ["pinned", "pass", "fail", "wait", "noted", "inPath"];

/** What the investigator has done to one record: the facts the one function and Yours read. */
export interface RecordFacts {
  pinned: boolean;
  disposition: Disposition;
  noted: boolean;
  inPath: boolean;
}
