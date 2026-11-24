/**
 * Custom notes: the shapes and the limits. Types and constants only, plus the two small helpers
 * every checker uses to answer. Design: custom-notes DESIGN-NOTES.md sections 2, 5 and 6, with
 * the safety review's changes.
 *
 * No value of a note comes from a wall clock: time is the playhead's millisecond, and order is
 * time, then seq.
 */
import type { CustomPath, RecordNode } from "../marks/types";

/** Six colour slots of the active palette. A slot name, never a hex or a CSS value. */
export const COLOUR_SLOTS = ["r0", "r1", "r2", "r3", "r4", "muted"] as const;
export type ColourSlot = (typeof COLOUR_SLOTS)[number];

/** The person's own mark. "none" until they choose. */
export const DECISIONS = ["none", "pass", "fail"] as const;
export type Decision = (typeof DECISIONS)[number];

export const MARK_TYPES = ["bold", "italic", "underline", "strike"] as const;
export type MarkType = (typeof MARK_TYPES)[number];
export interface Mark {
  type: MarkType;
}

/** Closed body document, version 1. Each object has exactly the keys named here. */
export interface TextNode {
  type: "text";
  text: string;
  marks?: Mark[];
}
export interface HardBreak {
  type: "hard_break";
}
export type Inline = TextNode | HardBreak;
export interface Paragraph {
  type: "paragraph";
  content?: Inline[];
}
export interface ListItem {
  type: "list_item";
  content: [Paragraph];
}
export interface BulletList {
  type: "bullet_list";
  content: ListItem[];
}
export interface OrderedList {
  type: "ordered_list";
  content: ListItem[];
}
export interface Quote {
  type: "quote";
  content: Paragraph[];
}
export type Block = Paragraph | BulletList | OrderedList | Quote;
export interface Body {
  v: 1;
  content: Block[];
}

export interface NoteLink {
  kind: string;
  id: string;
}

/** What the person sets, apart from the identity the backing gives. `time` is fixed at make. */
export interface NoteFields {
  link: NoteLink | null;
  colour: ColourSlot;
  category: string;
  decision: Decision;
  body: Body;
}
/** A note before the backing gives it an id and a seq. */
export interface NoteDraft extends NoteFields {
  scenario: string;
  time: number;
}
export interface Note extends NoteDraft {
  id: string;
  seq: number;
}

/**
 * The notes file (design section 6), version 2: the notes and, beside them, what the investigator did
 * to records (nodes), their custom paths and the typed Fail categories. A version 1 file (the first
 * five keys) is read and lifted to this shape with empty marks. No clock field.
 */
export interface NotesFile {
  format: "ffr-notes";
  version: 2;
  scenario: string;
  categories: string[];
  notes: Omit<Note, "scenario">[];
  /** `{ record, pinned, disposition, category, settled }`. */
  nodes: Omit<RecordNode, "scenario">[];
  /** `{ id, seq, name, stops }`. */
  paths: Omit<CustomPath, "scenario">[];
  failCategories: string[];
}

export const LIMITS = {
  textChars: 4000,
  blocks: 100,
  listItems: 50,
  quoteParagraphs: 20,
  marksPerText: 4,
  bodyBytes: 64 * 1024,
  categoryChars: 24,
  labelChars: 60,
  idHex: 32,
  maxTime: 4102444800000,
  /** seq is the highest seq of the scenario plus one and is never reused, so the bound sits far
   *  above the note limit; 12 digits can never hold a run of 13 digits (safety review, 2026-11-19). */
  maxSeq: 999_999_999_999,
  notesPerScenario: 1000,
  fileNotes: 500,
  fileBytes: 2 * 1024 * 1024,
} as const;

/** Fixed codes. A refusal carries a code and a path of fixed names, never a value. */
export type NoteErrorCode =
  | "bad_request"
  | "body_schema"
  | "too_long"
  | "card_number"
  | "bad_json"
  | "too_large"
  | "bad_file"
  | "bad_scenario"
  | "category_exists"
  | "limit_reached"
  | "not_found"
  | "bad_reply"
  | "backing_failed";

export interface NoteError {
  code: NoteErrorCode;
  /** A path such as `body.content[2].text`. Built from fixed names and indices only. */
  where: string;
}

export type Check<T> = { ok: true; value: T } | ({ ok: false } & NoteError);

export function ok<T>(value: T): Check<T> {
  return { ok: true, value };
}
export function fail(code: NoteErrorCode, where: string): { ok: false } & NoteError {
  return { ok: false, code, where };
}
