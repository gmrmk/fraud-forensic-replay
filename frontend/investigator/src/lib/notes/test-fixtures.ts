/**
 * Shared test support for the notes pieces: the shared vectors file, and small builders.
 * Every digit run here is a published test card number or a number made for a test.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RecordInfo } from "../../components/notes/record-lookup";
import type { Entity } from "../entity";
import type { CustomPath, RecordNode } from "../marks/types";
import type { Block, Body, Inline, MarkType, Note, Paragraph } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS = resolve(HERE, "../../../../../backend/tests");

export interface TextVector {
  id: string;
  label: string;
  text: string;
  expect: "refused" | "allowed";
  limit?: true;
}
export interface MultiVector {
  id: string;
  label: string;
  texts: string[];
  expect: "allowed";
  limit?: true;
}
export interface BodyVector {
  id: string;
  label: string;
  body: Body;
  expect: "refused" | "allowed";
  limit?: true;
}
export interface IdVector {
  id: string;
  label: string;
  value: string;
  expect: "refused" | "allowed";
}
export interface VectorFile {
  _about: string;
  text_vectors: TextVector[];
  multi_vectors: MultiVector[];
  body_vectors: BodyVector[];
  id_vectors: IdVector[];
}

export const VECTORS: VectorFile = JSON.parse(readFileSync(resolve(TESTS, "note_vectors.json"), "utf8"));

/** The published Visa test number, valid under Luhn. */
export const VISA = "4111111111111111";
/** VISA in groups of four, with spaces and with dashes: the forms the card guard also refuses. Built
 *  from VISA, so no test types a card number of its own. */
export const VISA_GROUPED = VISA.replace(/(\d{4})(?=\d)/g, "$1 ");
export const VISA_DASHED = VISA.replace(/(\d{4})(?=\d)/g, "$1-");
/** A uuid whose first sixteen hex digits are VISA (the rest are letters): the id made from it holds the
 *  card number, so a maker that checks its ids draws again. */
export const VISA_UUID = `${VISA.slice(0, 8)}-${VISA.slice(8, 12)}-${VISA.slice(12, 16)}-aaaa-aaaaaaaaaaaa`;

export function text(s: string, ...marks: MarkType[]): Inline {
  return marks.length ? { type: "text", text: s, marks: marks.map((type) => ({ type })) } : { type: "text", text: s };
}
export function para(...content: Inline[]): Paragraph {
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}
export function doc(...content: Block[]): Body {
  return { v: 1, content };
}
export function bodyOf(s: string): Body {
  return doc(para(text(s)));
}

/** A valid note; override any field. */
export function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: "note-0123456789abcdef0123456789abcdef",
    scenario: "card-fraud",
    time: 1763556003600,
    link: null,
    colour: "r1",
    category: "Note",
    decision: "none",
    body: bodyOf("Seen at the terminal."),
    seq: 1,
    ...over,
  };
}

/** A valid, unpressed node of the card-fraud story; override any field. A new field of the node
 *  is added here, so no later test has to name it. */
export function makeNode(over: Partial<RecordNode> = {}): RecordNode {
  return {
    scenario: "card-fraud",
    record: { kind: "stop", id: "rec-1" },
    pinned: false,
    disposition: "none",
    category: null,
    settled: false,
    ...over,
  };
}

/** A valid custom path of the card-fraud story with two stops; override any field. */
export function makePath(over: Partial<CustomPath> = {}): CustomPath {
  return {
    id: "path-0123456789abcdef0123456789abcdef",
    scenario: "card-fraud",
    seq: 1,
    name: "Path 1",
    stops: [
      { kind: "stop", id: "rec-1" },
      { kind: "stop", id: "rec-2" },
    ],
    ...over,
  };
}

/**
 * A valid record info for the fixture record `{ kind: "stop", id: "rec-1" }` (no time, so no Timeline
 * mark); override any field. A new field of the info is added here, so no later test has to name it.
 */
export function infoOf(over: Partial<RecordInfo> = {}): RecordInfo {
  const entity: Entity = {
    id: "rec-1",
    kind: "stop",
    timestamp: 0,
    coords: { lat: 29.76, lng: -95.37 },
    fields: {},
    displayMetadata: { primaryLabel: "Corner Store", secondaryLabel: "", paletteKind: "stop", pivotableFields: [] },
  };
  return {
    kind: "stop",
    headline: "Corner Store",
    lngLat: { lng: -95.37, lat: 29.76 },
    time: null,
    draw: { kind: "stop", id: "rec-1", timestamp: 0, fields: {} },
    match: { kind: "entity", entity },
    ...over,
  };
}

/**
 * The wire texts both suites (the backend's and the page's) assert against, keys in this order. The
 * path id comes from the uuid 01234567-89ab-cdef-0123-456789abcdef (the memory backing's `uuid`
 * argument). A node text holds `settled`; the PUT body adds `ifUnsettled` last.
 */
export const NODE_WIRE =
  '{"scenario":"card-fraud","record":{"kind":"auth","id":"tx-0001"},"pinned":true,"disposition":"fail","category":"Shared key","settled":true}';
export const NODE_PUT_WIRE = NODE_WIRE.slice(0, -1) + ',"ifUnsettled":false}';
export const PATH_WIRE =
  '{"id":"path-0123456789abcdef0123456789abcdef","scenario":"card-fraud","seq":1,"name":"Path 1","stops":[{"kind":"auth","id":"tx-0001"},{"kind":"login","id":"lg-0002"}]}';
export const LIST_WIRE = `{"nodes":[${NODE_WIRE}],"paths":[${PATH_WIRE}],"failCategories":["Shared key"],"skipped":0}`;
export const FILE_V2_WIRE =
  '{"format":"ffr-notes","version":2,"scenario":"card-fraud","categories":[],"notes":[],' +
  '"nodes":[{"record":{"kind":"auth","id":"tx-0001"},"pinned":true,"disposition":"fail","category":"Shared key","settled":true}],' +
  '"paths":[{"id":"path-0123456789abcdef0123456789abcdef","seq":1,"name":"Path 1","stops":[{"kind":"auth","id":"tx-0001"},{"kind":"login","id":"lg-0002"}]}],' +
  '"failCategories":["Shared key"]}';
/** The uuid the wire path id comes from, for a memory backing's `uuid` argument. */
export const WIRE_UUID = "01234567-89ab-cdef-0123-456789abcdef";

/**
 * A uuid source for a memory backing in a test: one fixed, letter-heavy uuid whose last group holds a
 * hex counter, so every draw is different, valid, and never holds a card number. Nothing is random,
 * and each call of `fixedUuids()` starts again at the same first draw.
 */
export function fixedUuids(): () => string {
  let n = 0;
  return () => `abcdefab-cdef-abcd-efab-${(n++).toString(16).padStart(12, "a")}`;
}

/** A fresh deep copy, so a test can break one field without touching a shared fixture. */
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
