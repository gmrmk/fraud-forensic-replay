/**
 * The closed schema for a note and its body document, in one place. Whatever comes from the
 * editor, a backing's reply, a file or memory is checked here before it is stored or drawn.
 *
 *  - Each object has exactly the keys named: any other key at any depth is refused, a
 *    `__proto__` or `constructor` key included. Keys are read with Reflect.ownKeys, so an own
 *    `__proto__` key made by JSON.parse is seen.
 *  - The checker builds a fresh object from the fields it accepts. It never spreads its input.
 *  - A refusal is a fixed code and a path of fixed names and indices. It never holds a value,
 *    and it never names a key the input supplied.
 *  - The card number guard runs on every string a note holds: id, scenario, category, link
 *    kind and id, and the body.
 *  - Characters are counted as code points, as Python's len does.
 */
import { charCount } from "./body";
import { checkCategoryName } from "./categories";
import { colourSlot } from "./colours";
import { isBidiOverrideCp, isControlCp } from "./digits";
import { refusesBody, refusesText } from "./guard";
import {
  LIMITS,
  MARK_TYPES,
  fail,
  ok,
  type Block,
  type Body,
  type Check,
  type Decision,
  type Inline,
  type ListItem,
  type Mark,
  type Note,
  type NoteDraft,
  type NoteFields,
  type NoteLink,
  type Paragraph,
} from "./types";

type Obj = Record<string, unknown>;

const NOTE_ID = /^note-[0-9a-f]{32}$/;
const SCENARIO = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const LINK_KIND = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const LINK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const at = (path: string, name: string): string => (path ? `${path}.${name}` : name);
const idx = (path: string, i: number): string => `${path}[${i}]`;

/** The object when it is a plain object with exactly these keys (all of `required`, any of `optional`). */
function shape(raw: unknown, required: readonly string[], optional: readonly string[] = []): Obj | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) return null;
  for (const k of Reflect.ownKeys(raw)) {
    if (typeof k !== "string" || (!required.includes(k) && !optional.includes(k))) return null;
  }
  for (const k of required) if (!Object.hasOwn(raw, k)) return null;
  return raw as Obj;
}

/** `shape`, for the file check: a plain object with exactly these keys. */
export const exactShape = shape;

// ---------------------------------------------------------------------------- body document

interface Count {
  chars: number;
}

function checkMarks(raw: unknown, path: string): Check<Mark[]> {
  if (!Array.isArray(raw) || raw.length > LIMITS.marksPerText) return fail("body_schema", path);
  const out: Mark[] = [];
  for (let i = 0; i < raw.length; i++) {
    const m = shape(raw[i], ["type"]);
    const t = m?.type;
    if (typeof t !== "string" || !MARK_TYPES.some((x) => x === t)) return fail("body_schema", idx(path, i));
    if (out.some((x) => x.type === t)) return fail("body_schema", idx(path, i));
    out.push({ type: t as Mark["type"] });
  }
  return ok(out);
}

function checkInline(raw: unknown, path: string, count: Count): Check<Inline> {
  if (typeof raw !== "object" || raw === null) return fail("body_schema", path);
  const type = (raw as Obj).type;
  if (type === "hard_break") {
    return shape(raw, ["type"]) ? ok({ type: "hard_break" }) : fail("body_schema", path);
  }
  const o = shape(raw, ["type", "text"], ["marks"]);
  if (!o || type !== "text" || typeof o.text !== "string") return fail("body_schema", path);
  const s = o.text;
  const n = charCount(s);
  if (n < 1) return fail("body_schema", at(path, "text"));
  count.chars += n;
  if (n > LIMITS.textChars || count.chars > LIMITS.textChars) return fail("too_long", at(path, "text"));
  if (s !== s.normalize("NFC")) return fail("body_schema", at(path, "text"));
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (isControlCp(cp) || isBidiOverrideCp(cp)) return fail("body_schema", at(path, "text"));
  }
  if (Object.hasOwn(o, "marks")) {
    const marks = checkMarks(o.marks, at(path, "marks"));
    if (!marks.ok) return marks;
    return ok({ type: "text", text: s, marks: marks.value });
  }
  return ok({ type: "text", text: s });
}

function checkParagraph(raw: unknown, path: string, count: Count): Check<Paragraph> {
  const o = shape(raw, ["type"], ["content"]);
  if (!o || o.type !== "paragraph") return fail("body_schema", path);
  if (!Object.hasOwn(o, "content")) return ok({ type: "paragraph" });
  if (!Array.isArray(o.content)) return fail("body_schema", at(path, "content"));
  const content: Inline[] = [];
  for (let i = 0; i < o.content.length; i++) {
    const n = checkInline(o.content[i], idx(at(path, "content"), i), count);
    if (!n.ok) return n;
    content.push(n.value);
  }
  return ok({ type: "paragraph", content });
}

function checkListItems(raw: unknown, path: string, count: Count): Check<ListItem[]> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > LIMITS.listItems) return fail("body_schema", path);
  const items: ListItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = idx(path, i);
    const item = shape(raw[i], ["type", "content"]);
    if (!item || item.type !== "list_item" || !Array.isArray(item.content) || item.content.length !== 1) {
      return fail("body_schema", p);
    }
    const para = checkParagraph(item.content[0], idx(at(p, "content"), 0), count);
    if (!para.ok) return para;
    items.push({ type: "list_item", content: [para.value] });
  }
  return ok(items);
}

function checkBlock(raw: unknown, path: string, count: Count): Check<Block> {
  if (typeof raw !== "object" || raw === null) return fail("body_schema", path);
  switch ((raw as Obj).type) {
    case "paragraph":
      return checkParagraph(raw, path, count);
    case "bullet_list":
    case "ordered_list": {
      const o = shape(raw, ["type", "content"]);
      if (!o) return fail("body_schema", path);
      const items = checkListItems(o.content, at(path, "content"), count);
      if (!items.ok) return items;
      return ok({ type: o.type as "bullet_list" | "ordered_list", content: items.value });
    }
    case "quote": {
      const o = shape(raw, ["type", "content"]);
      if (!o || !Array.isArray(o.content) || o.content.length < 1 || o.content.length > LIMITS.quoteParagraphs) {
        return fail("body_schema", path);
      }
      const content: Paragraph[] = [];
      for (let i = 0; i < o.content.length; i++) {
        const p = checkParagraph(o.content[i], idx(at(path, "content"), i), count);
        if (!p.ok) return p;
        content.push(p.value);
      }
      return ok({ type: "quote", content });
    }
    default:
      return fail("body_schema", path);
  }
}

const encoder = new TextEncoder();

/** The closed body document. `path` names it in a refusal (default `body`). */
export function checkBody(raw: unknown, path = "body"): Check<Body> {
  const o = shape(raw, ["v", "content"]);
  if (!o || o.v !== 1 || !Array.isArray(o.content) || o.content.length > LIMITS.blocks) return fail("body_schema", path);
  const count: Count = { chars: 0 };
  const content: Block[] = [];
  for (let i = 0; i < o.content.length; i++) {
    const b = checkBlock(o.content[i], idx(at(path, "content"), i), count);
    if (!b.ok) return b;
    content.push(b.value);
  }
  const body: Body = { v: 1, content };
  if (encoder.encode(JSON.stringify(body)).length > LIMITS.bodyBytes) return fail("too_long", path);
  if (refusesBody(body)) return fail("card_number", path);
  return ok(body);
}

// ---------------------------------------------------------------------------- note fields

export function isNoteId(s: unknown): boolean {
  return typeof s === "string" && NOTE_ID.test(s);
}

function checkId(raw: unknown, path: string): Check<string> {
  if (!isNoteId(raw)) return fail("bad_request", path);
  if (refusesText(raw as string)) return fail("card_number", path);
  return ok(raw as string);
}

export function checkScenario(raw: unknown, path = "scenario"): Check<string> {
  if (typeof raw !== "string" || !SCENARIO.test(raw)) return fail("bad_scenario", path);
  if (refusesText(raw)) return fail("card_number", path);
  return ok(raw);
}

function checkTime(raw: unknown, path: string): Check<number> {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw > LIMITS.maxTime) return fail("bad_request", path);
  return ok(raw);
}

function checkSeq(raw: unknown, path: string): Check<number> {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 1 || raw > LIMITS.maxSeq) return fail("bad_request", path);
  return ok(raw);
}

/** A link is null, or exactly a kind and an id. Both strings take the guard. */
export function checkLink(raw: unknown, path = "link"): Check<NoteLink | null> {
  if (raw === null) return ok(null);
  const o = shape(raw, ["kind", "id"]);
  if (!o || typeof o.kind !== "string" || typeof o.id !== "string") return fail("bad_request", path);
  if (!LINK_KIND.test(o.kind)) return fail("bad_request", at(path, "kind"));
  if (!LINK_ID.test(o.id)) return fail("bad_request", at(path, "id"));
  if (refusesText(o.kind)) return fail("card_number", at(path, "kind"));
  if (refusesText(o.id)) return fail("card_number", at(path, "id"));
  return ok({ kind: o.kind, id: o.id });
}

function checkColour(raw: unknown, path: string): Check<NoteFields["colour"]> {
  const slot = colourSlot(raw);
  return slot === null ? fail("bad_request", path) : ok(slot);
}

function checkDecision(raw: unknown, path: string): Check<Decision> {
  switch (raw) {
    case "none":
    case "pass":
    case "fail":
      return ok(raw);
    default:
      return fail("bad_request", path);
  }
}

/** The fields the person sets: link, colour, category, decision, body. */
function readFields(o: Obj, path: string): Check<NoteFields> {
  const link = checkLink(o.link, at(path, "link"));
  if (!link.ok) return link;
  const colour = checkColour(o.colour, at(path, "colour"));
  if (!colour.ok) return colour;
  const category = checkCategoryName(o.category, at(path, "category"));
  if (!category.ok) return category;
  const decision = checkDecision(o.decision, at(path, "decision"));
  if (!decision.ok) return decision;
  const body = checkBody(o.body, at(path, "body"));
  if (!body.ok) return body;
  return ok({ link: link.value, colour: colour.value, category: category.value, decision: decision.value, body: body.value });
}

const FIELD_KEYS = ["link", "colour", "category", "decision", "body"] as const;

export function checkNoteFields(raw: unknown, path = ""): Check<NoteFields> {
  const o = shape(raw, FIELD_KEYS);
  return o ? readFields(o, path) : fail("bad_request", path);
}

export function checkDraft(raw: unknown, path = ""): Check<NoteDraft> {
  const o = shape(raw, ["scenario", "time", ...FIELD_KEYS]);
  if (!o) return fail("bad_request", path);
  const scenario = checkScenario(o.scenario, at(path, "scenario"));
  if (!scenario.ok) return scenario;
  const time = checkTime(o.time, at(path, "time"));
  if (!time.ok) return time;
  const f = readFields(o, path);
  if (!f.ok) return f;
  return ok({ scenario: scenario.value, time: time.value, ...f.value });
}

export function checkNote(raw: unknown, path = ""): Check<Note> {
  const o = shape(raw, ["id", "scenario", "time", "seq", ...FIELD_KEYS]);
  if (!o) return fail("bad_request", path);
  const id = checkId(o.id, at(path, "id"));
  if (!id.ok) return id;
  const seq = checkSeq(o.seq, at(path, "seq"));
  if (!seq.ok) return seq;
  const d = checkDraft(draftKeys(o), path);
  if (!d.ok) return d;
  return ok({ id: id.value, seq: seq.value, ...d.value });
}

/** A file's note: the same fields as a note, without the scenario (the file holds it). */
export function checkFileNote(raw: unknown, scenario: string, path: string): Check<Omit<Note, "scenario">> {
  const o = shape(raw, ["id", "time", "seq", ...FIELD_KEYS]);
  if (!o) return fail("bad_file", path);
  const n = checkNote({ ...draftKeys(o), id: o.id, seq: o.seq, scenario }, path);
  if (!n.ok) return n;
  const { scenario: _scenario, ...rest } = n.value;
  return ok(rest);
}

/** The draft's keys, copied one by one from an object `shape` has already approved. */
function draftKeys(o: Obj): Obj {
  return { scenario: o.scenario, time: o.time, link: o.link, colour: o.colour, category: o.category, decision: o.decision, body: o.body };
}
