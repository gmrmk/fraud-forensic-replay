/**
 * The closed schema: what it accepts, and every way a document or a note can be refused.
 * Inputs that must carry an own `__proto__` key are built with JSON.parse, because an object
 * literal would set the prototype and the test would pass for the wrong reason.
 */
import { describe, it, expect } from "vitest";
import { LIMITS, type Body } from "./types";
import { checkBody, checkDraft, checkLink, checkNote, checkNoteFields, checkScenario, isNoteId } from "./schema";
import { VECTORS, VISA, bodyOf, clone, doc, makeNote, para, text } from "./test-fixtures";

const cp = (n: number) => String.fromCodePoint(n);
const fullDoc = (): Body =>
  doc(
    para(text("Plain "), text("bold", "bold"), text(" all", "bold", "italic", "underline", "strike"), { type: "hard_break" }, text("next")),
    { type: "bullet_list", content: [{ type: "list_item", content: [para(text("one"))] }, { type: "list_item", content: [para()] }] },
    { type: "ordered_list", content: [{ type: "list_item", content: [para(text("first"))] }] },
    { type: "quote", content: [para(text("said")), para(text("more"))] },
    para(),
  );
const bad = (raw: unknown, code?: string) => {
  const r = checkBody(raw);
  expect(r.ok).toBe(false);
  if (!r.ok && code) expect(r.code).toBe(code);
  return r;
};

describe("checkBody accepts", () => {
  it("every node and mark of the closed document, as a fresh object", () => {
    const input = fullDoc();
    const r = checkBody(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual(input);
    expect(r.value).not.toBe(input);
    expect(r.value.content[0]).not.toBe(input.content[0]);
  });
  it("an empty document", () => {
    expect(checkBody(doc()).ok).toBe(true);
  });
  it("exactly 4,000 characters, counting code points", () => {
    expect(checkBody(bodyOf("a".repeat(LIMITS.textChars))).ok).toBe(true);
    // 4,000 astral characters are 8,000 UTF-16 units but 4,000 characters
    expect(checkBody(bodyOf(cp(0x1f600).repeat(LIMITS.textChars))).ok).toBe(true);
  });
  it("the allowed counts at their limits", () => {
    expect(checkBody(doc(...Array.from({ length: LIMITS.blocks }, () => para()))).ok).toBe(true);
    const items = Array.from({ length: LIMITS.listItems }, () => ({ type: "list_item" as const, content: [para()] as [ReturnType<typeof para>] }));
    expect(checkBody(doc({ type: "bullet_list", content: items })).ok).toBe(true);
    expect(checkBody(doc({ type: "quote", content: Array.from({ length: LIMITS.quoteParagraphs }, () => para()) })).ok).toBe(true);
  });
  it("reads a document that arrived as JSON text", () => {
    expect(checkBody(JSON.parse(JSON.stringify(fullDoc()))).ok).toBe(true);
  });
});

describe("checkBody refuses", () => {
  it("anything that is not an object with v 1 and a content array", () => {
    for (const raw of [null, undefined, 1, "x", [], [fullDoc()], { content: [] }, { v: 2, content: [] }, { v: 1 }, { v: 1, content: {} }, { v: "1", content: [] }]) {
      bad(raw, "body_schema");
    }
  });
  it("an extra key at every depth", () => {
    const at = (mutate: (d: Body) => void) => {
      const d = clone(fullDoc());
      mutate(d);
      return bad(d, "body_schema");
    };
    at((d) => Object.assign(d, { extra: 1 }));
    at((d) => Object.assign(d.content[0], { extra: 1 }));
    at((d) => Object.assign((d.content[0] as { content: object[] }).content[0], { extra: 1 }));
    at((d) => Object.assign((d.content[0] as { content: { marks: object[] }[] }).content[1].marks[0], { extra: 1 }));
    at((d) => Object.assign((d.content[0] as { content: object[] }).content[3], { extra: 1 })); // the hard break
    at((d) => Object.assign((d.content[1] as { content: object[] }).content[0], { extra: 1 })); // list item
    at((d) => Object.assign(((d.content[1] as { content: { content: object[] }[] }).content[0]).content[0], { extra: 1 })); // paragraph in an item
    at((d) => Object.assign(d.content[3], { extra: 1 })); // quote
  });
  it("a style, class, href or attrs key that would carry markup or CSS", () => {
    for (const key of ["style", "class", "className", "href", "attrs", "attributes", "html", "src"]) {
      const d = clone(fullDoc());
      Object.assign((d.content[0] as { content: object[] }).content[0], { [key]: "x" });
      bad(d, "body_schema");
      const m = clone(fullDoc());
      Object.assign((m.content[0] as { content: { marks: object[] }[] }).content[1].marks[0], { [key]: "x" });
      bad(m, "body_schema");
    }
  });
  it("a __proto__ or constructor key, and pollutes nothing", () => {
    const withKey = (json: string) => bad(JSON.parse(json), "body_schema");
    withKey('{"v":1,"content":[],"__proto__":{"polluted":1}}');
    withKey('{"v":1,"content":[{"type":"paragraph","__proto__":{"polluted":1}}]}');
    withKey('{"v":1,"content":[{"type":"paragraph","content":[{"type":"text","text":"a","__proto__":{"polluted":1}}]}]}');
    withKey('{"v":1,"content":[{"type":"paragraph","content":[{"type":"text","text":"a","marks":[{"type":"bold","__proto__":{"polluted":1}}]}]}]}');
    withKey('{"v":1,"content":[],"constructor":{"prototype":{"polluted":1}}}');
    withKey('{"v":1,"content":[{"type":"paragraph","constructor":1}]}');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // a clean result has no own __proto__ or constructor key
    const r = checkBody(fullDoc());
    expect(r.ok && Reflect.ownKeys(r.value)).toEqual(["v", "content"]);
  });
  it("a node in the wrong place", () => {
    const item = { type: "list_item", content: [para(text("x"))] };
    bad({ v: 1, content: [text("loose text")] }, "body_schema"); // text at the top
    bad({ v: 1, content: [{ type: "hard_break" }] }, "body_schema");
    bad({ v: 1, content: [item] }, "body_schema"); // a list item outside a list
    bad({ v: 1, content: [{ type: "bullet_list", content: [para(text("x"))] }] }, "body_schema"); // paragraph straight in a list
    bad({ v: 1, content: [{ type: "bullet_list", content: [{ type: "list_item", content: [para(), para()] }] }] }, "body_schema"); // two paragraphs in an item
    bad({ v: 1, content: [{ type: "bullet_list", content: [{ type: "list_item", content: [] }] }] }, "body_schema");
    bad({ v: 1, content: [{ type: "bullet_list", content: [{ type: "list_item", content: [{ type: "bullet_list", content: [item] }] }] }] }, "body_schema"); // nesting
    bad({ v: 1, content: [{ type: "quote", content: [{ type: "bullet_list", content: [item] }] }] }, "body_schema"); // a list in a quote
    bad({ v: 1, content: [{ type: "quote", content: [{ type: "quote", content: [para()] }] }] }, "body_schema");
    bad({ v: 1, content: [{ type: "paragraph", content: [para()] }] }, "body_schema"); // a block inside a paragraph
    bad({ v: 1, content: [{ type: "paragraph", content: [{ type: "image", src: "x" }] }] }, "body_schema");
    bad({ v: 1, content: [{ type: "heading", content: [] }] }, "body_schema");
    bad({ v: 1, content: [{ type: "code_block", content: [] }] }, "body_schema");
    bad({ v: 1, content: [{ type: "ordered_list", start: 3, content: [item] }] }, "body_schema"); // no start value
  });
  it("a quote with no paragraph, a list with no item", () => {
    bad({ v: 1, content: [{ type: "quote", content: [] }] }, "body_schema");
    bad({ v: 1, content: [{ type: "ordered_list", content: [] }] }, "body_schema");
  });
  it("counts over the limits", () => {
    bad(doc(...Array.from({ length: LIMITS.blocks + 1 }, () => para())), "body_schema");
    const items = (n: number) => Array.from({ length: n }, () => ({ type: "list_item", content: [para()] }));
    bad({ v: 1, content: [{ type: "bullet_list", content: items(LIMITS.listItems + 1) }] }, "body_schema");
    bad({ v: 1, content: [{ type: "quote", content: Array.from({ length: LIMITS.quoteParagraphs + 1 }, () => para()) }] }, "body_schema");
  });
  it("marks: more than four, a repeat, an unknown type, a mark with an attribute, marks that are not an array", () => {
    const withMarks = (marks: unknown) => ({ v: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "a", marks }] }] });
    bad(withMarks([{ type: "bold" }, { type: "bold" }]), "body_schema");
    bad(withMarks([{ type: "link" }]), "body_schema");
    bad(withMarks([{ type: "code" }]), "body_schema");
    bad(withMarks([{ type: "bold", attrs: { href: "x" } }]), "body_schema");
    bad(withMarks({ type: "bold" }), "body_schema");
    bad(withMarks(["bold"]), "body_schema");
    bad(withMarks([{ type: "bold" }, { type: "italic" }, { type: "underline" }, { type: "strike" }, { type: "strike" }]), "body_schema");
  });
  it("text of 4,001 characters, and a document whose texts add up past 4,000", () => {
    bad(bodyOf("a".repeat(LIMITS.textChars + 1)), "too_long");
    bad(bodyOf(cp(0x1f600).repeat(LIMITS.textChars + 1)), "too_long");
    bad(doc(para(text("a".repeat(2500))), para(text("b".repeat(1501)))), "too_long");
  });
  it("empty text, text that is not a string", () => {
    bad(bodyOf(""), "body_schema");
    bad({ v: 1, content: [{ type: "paragraph", content: [{ type: "text", text: 5 }] }] }, "body_schema");
    bad({ v: 1, content: [{ type: "paragraph", content: [{ type: "text" }] }] }, "body_schema");
  });
  it("a control character, a bidi override, and text that is not NFC", () => {
    for (const c of [0x00, 0x01, 0x09, 0x0a, 0x0d, 0x1f, 0x7f, 0x85, 0x9f]) bad(bodyOf("a" + cp(c) + "b"), "body_schema");
    for (const c of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) bad(bodyOf("a" + cp(c) + "b"), "body_schema");
    bad(bodyOf("e" + cp(0x0301)), "body_schema"); // e + combining acute is not NFC
    expect(checkBody(bodyOf(cp(0x00e9))).ok).toBe(true); // the composed form is
  });
  it("a document over 64 KB of JSON", () => {
    const breaks = Array.from({ length: 3300 }, () => ({ type: "hard_break" as const }));
    bad(doc({ type: "paragraph", content: breaks }), "too_long");
  });
  it("a card number, in text, across marks, blocks and list items", () => {
    expect(bad(bodyOf(VISA), "card_number")).toMatchObject({ where: "body" });
    bad(doc(para(text("4111 11", "bold"), text("11 1111 1111"))), "card_number");
    bad(doc(para(text("4111 1111 1111")), para(text("1111"))), "card_number");
    for (const v of VECTORS.body_vectors.filter((x) => x.expect === "refused")) bad(v.body, "card_number");
    for (const v of VECTORS.body_vectors.filter((x) => x.expect === "allowed")) expect(checkBody(v.body).ok).toBe(true);
  });
  it("a refusal never carries the value, and its path never names a key", () => {
    const r = checkBody(bodyOf(VISA));
    expect(JSON.stringify(r)).not.toContain("4111");
    const key = "k" + VISA;
    const d = { v: 1, content: [], [key]: 1 };
    const r2 = checkBody(d);
    expect(r2.ok).toBe(false);
    expect(JSON.stringify(r2)).not.toContain("4111");
  });
  it("a class instance or an array where an object belongs", () => {
    class Doc {
      v = 1;
      content: unknown[] = [];
    }
    bad(new Doc(), "body_schema");
    bad(Object.create({ v: 1, content: [] }), "body_schema");
  });
});

describe("checkLink and checkScenario", () => {
  it("null, or both kind and id", () => {
    expect(checkLink(null)).toEqual({ ok: true, value: null });
    expect(checkLink({ kind: "transaction", id: "tx-0001042" })).toEqual({ ok: true, value: { kind: "transaction", id: "tx-0001042" } });
  });
  it.each([
    [undefined], [{}], [{ kind: "tx" }], [{ id: "tx-1" }], [{ kind: "tx", id: "tx-1", extra: 1 }], [{ kind: "1tx", id: "tx-1" }],
    [{ kind: "t x", id: "tx-1" }], [{ kind: "tx", id: "-tx" }], [{ kind: "tx", id: "a b" }], [{ kind: "x".repeat(65), id: "tx-1" }],
    [{ kind: "tx", id: "a".repeat(129) }], [{ kind: "tx", id: 5 }], ["tx:1"], [[]],
  ])("refuses %j", (raw) => {
    expect(checkLink(raw).ok).toBe(false);
  });
  it("refuses a link holding a card number, as kind and as id", () => {
    const a = checkLink({ kind: "tx", id: "tx-" + VISA });
    expect(a).toMatchObject({ ok: false, code: "card_number", where: "link.id" });
    const b = checkLink({ kind: "k" + VISA, id: "tx-1" });
    expect(b).toMatchObject({ ok: false, code: "card_number", where: "link.kind" });
  });
  it("the scenario pattern, and a scenario that holds a card number", () => {
    expect(checkScenario("card-fraud")).toEqual({ ok: true, value: "card-fraud" });
    expect(checkScenario("priya-ato").ok).toBe(true);
    for (const s of ["", "-x", "_x", "a b", "a/b", "x".repeat(65), 5, null]) expect(checkScenario(s).ok).toBe(false);
    expect(checkScenario("4111-1111-1111-1111")).toMatchObject({ ok: false, code: "card_number" });
  });
});

describe("checkNote", () => {
  it("accepts a valid note and returns a fresh object", () => {
    const n = makeNote({ link: { kind: "transaction", id: "tx-0001042" }, body: fullDoc(), decision: "pass", colour: "muted", seq: 7 });
    const r = checkNote(n);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual(n);
    expect(r.value).not.toBe(n);
    expect(r.value.body).not.toBe(n.body);
    expect(r.value.link).not.toBe(n.link);
  });
  it("accepts every colour slot and every decision", () => {
    for (const colour of ["r0", "r1", "r2", "r3", "r4", "muted"]) expect(checkNote(makeNote({ colour: colour as never })).ok).toBe(true);
    for (const decision of ["none", "pass", "fail"]) expect(checkNote(makeNote({ decision: decision as never })).ok).toBe(true);
  });
  it("refuses a colour that is not one of the six slot names", () => {
    for (const colour of ["url(https://x.test/a.png)", "#ff0000", "red", "R1", "r5", "", "constructor", "__proto__", "toString", "hasOwnProperty", 5, null]) {
      expect(checkNote(makeNote({ colour: colour as never })).ok).toBe(false);
    }
  });
  it("refuses an unknown decision", () => {
    for (const d of ["PASS", "yes", "", "constructor", 1, null]) expect(checkNote(makeNote({ decision: d as never })).ok).toBe(false);
  });
  it("refuses an extra key, a missing key, and a clock field", () => {
    expect(checkNote({ ...makeNote(), extra: 1 }).ok).toBe(false);
    expect(checkNote({ ...makeNote(), createdAt: 1763556003600 }).ok).toBe(false);
    expect(checkNote({ ...makeNote(), updatedAt: "2026-11-19" }).ok).toBe(false);
    for (const key of Object.keys(makeNote())) {
      const n: Record<string, unknown> = { ...makeNote() };
      delete n[key];
      expect(checkNote(n).ok).toBe(false);
    }
  });
  it("refuses a note with a __proto__ key and pollutes nothing", () => {
    const raw = JSON.parse(JSON.stringify(makeNote()).replace("{", '{"__proto__":{"polluted":1},'));
    expect(Object.keys(raw)).toContain("__proto__");
    expect(checkNote(raw).ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("time: an integer from 0 to 4102444800000", () => {
    for (const t of [0, 1, 1763556003600, LIMITS.maxTime]) expect(checkNote(makeNote({ time: t })).ok).toBe(true);
    for (const t of [-1, 1.5, LIMITS.maxTime + 1, NaN, Infinity, "1763556003600", null, 2 ** 60]) expect(checkNote(makeNote({ time: t as never })).ok).toBe(false);
  });
  it("seq: an integer from 1", () => {
    for (const s of [0, -1, 1.5, "1", null, NaN]) expect(checkNote(makeNote({ seq: s as never })).ok).toBe(false);
  });
  it("seq: at most 12 digits, far above the note limit (seq is never reused), so it cannot hold a card run", () => {
    expect(LIMITS.maxSeq).toBe(999_999_999_999);
    expect(LIMITS.maxSeq).toBeGreaterThanOrEqual(LIMITS.notesPerScenario * 1000);
    for (const s of [1, 1000, 999_999_999_999]) expect(checkNote(makeNote({ seq: s })).ok).toBe(true);
    for (const s of [1e12, 4111111111111111, 2 ** 53 - 1]) {
      const r = checkNote(makeNote({ seq: s }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.where).toBe("seq");
    }
  });
  it("id: note- and 32 lowercase hex", () => {
    expect(isNoteId("note-0123456789abcdef0123456789abcdef")).toBe(true);
    for (const id of ["", "note-", "note-0123456789abcdef0123456789abcde", "note-0123456789abcdef0123456789abcdef0", "NOTE-0123456789abcdef0123456789abcdef", "note-0123456789ABCDEF0123456789ABCDEF", "x-0123456789abcdef0123456789abcdef", 5, null]) {
      expect(isNoteId(id)).toBe(false);
      expect(checkNote(makeNote({ id: id as never })).ok).toBe(false);
    }
  });
  it("id: an id that holds a valid card number is refused (the id is a channel too)", () => {
    const id = "note-" + VISA + "abcdefabcdefabcd";
    expect(isNoteId(id)).toBe(true); // it fits the pattern
    expect(checkNote(makeNote({ id }))).toMatchObject({ ok: false, code: "card_number", where: "id" });
  });
  it("category: 1 to 24 characters, NFC, trimmed, no control or format character", () => {
    for (const c of ["Note", "Follow up", "a", "x".repeat(24), cp(0x1f600).repeat(24)]) expect(checkNote(makeNote({ category: c })).ok).toBe(true);
    for (const c of ["", " Note", "Note ", "x".repeat(25), cp(0x1f600).repeat(25), "a" + cp(0) + "b", "a" + cp(0x0a) + "b", "a" + cp(0x200b) + "b", "a" + cp(0x202e) + "b", "e" + cp(0x0301), 5, null]) {
      expect(checkNote(makeNote({ category: c as never })).ok).toBe(false);
    }
    expect(checkNote(makeNote({ category: "x".repeat(25) }))).toMatchObject({ code: "too_long", where: "category" });
  });
  it("a card number in the category, the scenario, the link or the body is refused with a path and no value", () => {
    const cases: [Partial<ReturnType<typeof makeNote>>, string][] = [
      [{ category: "4111 1111 1111 1111" }, "category"],
      [{ scenario: "4111-1111-1111-1111" }, "scenario"],
      [{ link: { kind: "tx", id: "tx-" + VISA } }, "link.id"],
      [{ body: bodyOf("see " + VISA) }, "body"],
    ];
    for (const [over, where] of cases) {
      const r = checkNote(makeNote(over));
      expect(r).toMatchObject({ ok: false, code: "card_number", where });
      expect(JSON.stringify(r)).not.toContain("4111");
    }
  });
  it("a body that fails reports a path inside the note", () => {
    const r = checkNote(makeNote({ body: bodyOf("x".repeat(4001)) }));
    expect(r).toMatchObject({ ok: false, code: "too_long" });
    expect(!r.ok && r.where.startsWith("body")).toBe(true);
  });
  it("not an object", () => {
    for (const raw of [null, undefined, 1, "note", [], [makeNote()]]) expect(checkNote(raw).ok).toBe(false);
  });
});

describe("checkDraft and checkNoteFields", () => {
  const draft = () => {
    const { id: _id, seq: _seq, ...rest } = makeNote();
    return rest;
  };
  it("a draft has no id and no seq", () => {
    expect(checkDraft(draft()).ok).toBe(true);
    expect(checkDraft(makeNote()).ok).toBe(false); // the backing gives id and seq
  });
  it("a draft with a bad field is refused", () => {
    expect(checkDraft({ ...draft(), colour: "url(x)" }).ok).toBe(false);
    expect(checkDraft({ ...draft(), body: bodyOf(VISA) })).toMatchObject({ ok: false, code: "card_number" });
  });
  it("update fields are link, colour, category, decision and body only", () => {
    const { link, colour, category, decision, body } = makeNote();
    expect(checkNoteFields({ link, colour, category, decision, body }).ok).toBe(true);
    expect(checkNoteFields({ link, colour, category, decision, body, time: 5 }).ok).toBe(false);
    expect(checkNoteFields({ link, colour, category, decision }).ok).toBe(false);
  });
});
