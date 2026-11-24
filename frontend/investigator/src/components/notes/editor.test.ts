/**
 * The editor's closed schema, the converters between it and P1's body document, and the flattened
 * text the card guard reads. State level only: happy-dom has no real selection or input events.
 */
import { describe, it, expect } from "vitest";
import { DOMSerializer, Node as PMNode } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { CLOSED_MARKS, CLOSED_NODES, bodyFromDoc, caretOffset, docFromBody, flattenDoc, noteSchema } from "./editor";
import { COMMANDS } from "./editor-commands";
import { createNoteState } from "./editor-state";
import { flattenBody } from "../../lib/notes/body";
import { emptyBody } from "../../lib/notes/body";
import { checkBody } from "../../lib/notes/schema";
import { clone, doc, para, text } from "../../lib/notes/test-fixtures";
import type { Body } from "../../lib/notes/types";

const rich: Body = doc(
  para(text("Plain "), text("bold", "bold"), text(" both", "bold", "italic"), text(" u", "underline"), text(" s", "strike")),
  { type: "bullet_list", content: [{ type: "list_item", content: [para(text("one"))] }, { type: "list_item", content: [para(text("two"))] }] },
  { type: "ordered_list", content: [{ type: "list_item", content: [para(text("first"))] }] },
  { type: "quote", content: [para(text("quoted")), para()] },
  para(text("a"), { type: "hard_break" }, text("b")),
  para(),
);

describe("the closed schema", () => {
  it("declares exactly the eight nodes and four marks, with P1's names", () => {
    expect(Object.keys(noteSchema.nodes).sort()).toEqual([...CLOSED_NODES].sort());
    expect([...CLOSED_NODES].sort()).toEqual(["bullet_list", "doc", "hard_break", "list_item", "ordered_list", "paragraph", "quote", "text"]);
    expect(Object.keys(noteSchema.marks).sort()).toEqual([...CLOSED_MARKS].sort());
    expect([...CLOSED_MARKS].sort()).toEqual(["bold", "italic", "strike", "underline"]);
  });

  it("refuses every node type and mark type outside the set", () => {
    for (const type of ["heading", "code_block", "image", "horizontal_rule", "table", "blockquote", "script", "list"]) {
      expect(() => PMNode.fromJSON(noteSchema, { type: "doc", content: [{ type }] }), type).toThrow();
    }
    for (const type of ["link", "code", "highlight", "color", "font", "anchor"]) {
      const json = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type }] }] }] };
      expect(() => PMNode.fromJSON(noteSchema, json), type).toThrow();
    }
  });

  it("declares no attribute on any node or mark, and no parse rule reads one", () => {
    for (const t of [...Object.values(noteSchema.nodes), ...Object.values(noteSchema.marks)]) {
      expect(Object.keys(t.spec.attrs ?? {}), t.name).toEqual([]);
      for (const rule of t.spec.parseDOM ?? []) {
        expect(rule.getAttrs, `${t.name} parse rule`).toBeUndefined();
        expect((rule as { getContent?: unknown }).getContent, `${t.name} parse rule`).toBeUndefined();
      }
    }
  });

  it("serialises to the allowed ten tags and writes no attribute", () => {
    const d = docFromBody(rich);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const box = document.createElement("div");
    box.appendChild(DOMSerializer.fromSchema(noteSchema).serializeFragment(d.value.content));
    const tags = new Set([...box.querySelectorAll("*")].map((e) => e.tagName.toLowerCase()));
    for (const tag of tags) expect(["p", "ul", "ol", "li", "blockquote", "br", "strong", "em", "u", "s"]).toContain(tag);
    for (const el of box.querySelectorAll("*")) expect(el.attributes.length, el.tagName).toBe(0);
  });
});

describe("docFromBody: checkBody first, then the library, then node.check()", () => {
  it("builds a document from a good body and keeps every node", () => {
    const d = docFromBody(rich);
    expect(d.ok).toBe(true);
    if (d.ok) {
      d.value.check();
      expect(d.value.childCount).toBe(rich.content.length);
    }
  });

  it("refuses what checkBody refuses, each with a fixed code", () => {
    const hostile: unknown[] = [
      { v: 1, content: [{ type: "script", content: [] }] },
      { v: 1, content: [{ type: "paragraph", attrs: { onclick: "x" } }] },
      { v: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", href: "http://x" }] }] }] },
      { v: 1, content: [{ type: "bullet_list", content: [{ type: "list_item", content: [para(text("a")), para(text("b"))] }] }] },
      { v: 1, content: [{ type: "quote", content: [{ type: "bullet_list", content: [] }] }] },
      { v: 2, content: [] },
      "text",
      null,
    ];
    for (const h of hostile) {
      const r = docFromBody(h);
      expect(r.ok, JSON.stringify(h)).toBe(false);
    }
  });

  it("an empty body becomes one empty paragraph, and back to an empty body", () => {
    const d = docFromBody(emptyBody());
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.value.childCount).toBe(1);
    expect(d.value.firstChild?.type.name).toBe("paragraph");
    const b = bodyFromDoc(d.value);
    expect(b).toEqual({ ok: true, value: emptyBody() });
  });
});

describe("bodyFromDoc: the editor's document back to a checked body", () => {
  it("round trips a rich body exactly", () => {
    const d = docFromBody(rich);
    if (!d.ok) throw new Error("fixture");
    const b = bodyFromDoc(d.value);
    expect(b.ok).toBe(true);
    if (b.ok) {
      // A trailing empty paragraph is real content: it stays.
      expect(b.value).toEqual(clone(rich));
      expect(checkBody(b.value).ok).toBe(true);
    }
  });

  it("makes the text NFC (typed combining sequences would otherwise dead-end)", () => {
    const e = "e" + String.fromCodePoint(0x301);
    const composed = String.fromCodePoint(0xe9);
    const d = PMNode.fromJSON(noteSchema, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: e }] }] });
    const b = bodyFromDoc(d);
    expect(b.ok).toBe(true);
    if (b.ok) expect(flattenBody(b.value)).toBe(composed);
  });

  it("refuses a card number (the Save rule judges every run closed)", () => {
    const d = PMNode.fromJSON(noteSchema, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "4111111111111111" }] }] });
    const b = bodyFromDoc(d);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.code).toBe("card_number");
  });
});

describe("flattenDoc and caretOffset agree with the guard's text", () => {
  const shapes: Record<string, Body> = {
    rich,
    "empty paragraphs between": doc(para(text("a")), para(), para(), para(), para(text("b"))),
    "list and quote": doc(
      { type: "bullet_list", content: [{ type: "list_item", content: [para(text("x"))] }, { type: "list_item", content: [para()] }] },
      { type: "quote", content: [para(text("q1")), para(text("q2"))] },
    ),
    "hard breaks": doc(para(text("a"), { type: "hard_break" }, { type: "hard_break" }, text("b"))),
    "one empty paragraph": doc(para()),
  };

  it.each(Object.entries(shapes))("flattenDoc equals flattenBody: %s", (_name, body) => {
    const d = docFromBody(body);
    if (!d.ok) throw new Error("fixture");
    expect(flattenDoc(d.value)).toBe(flattenBody(body));
  });

  it.each(Object.entries(shapes))("caretOffset is the length of the flattened text before the caret: %s", (_name, body) => {
    const d = docFromBody(body);
    if (!d.ok) throw new Error("fixture");
    const flat = flattenDoc(d.value);
    let checked = 0;
    for (let pos = 0; pos <= d.value.content.size; pos++) {
      const $p = d.value.resolve(pos);
      if (!$p.parent.isTextblock) continue;
      const before = flattenDoc(
        PMNode.fromJSON(noteSchema, truncatedJSON(d.value, pos)),
      );
      expect(caretOffset(d.value, pos), `pos ${pos}`).toBe(before.length);
      expect(flat.startsWith(before) || before.length <= flat.length).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("gives the hand-checked offsets", () => {
    // para "ab", para "cd" hard_break "e": text "ab\ncd\ne".
    const d = docFromBody(doc(para(text("ab")), para(text("cd"), { type: "hard_break" }, text("e"))));
    if (!d.ok) throw new Error("fixture");
    expect(flattenDoc(d.value)).toBe("ab\ncd\ne");
    expect(caretOffset(d.value, 1)).toBe(0);
    expect(caretOffset(d.value, 3)).toBe(2);
    expect(caretOffset(d.value, 5)).toBe(3);
    expect(caretOffset(d.value, 7)).toBe(5);
    expect(caretOffset(d.value, 9)).toBe(7);
  });
});

describe("a line break made by the editor's own commands can be saved", () => {
  const mount = (body: Body) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new EditorView(host, {
      state: createNoteState({ body }),
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr));
      },
    });
    return view;
  };
  const shiftEnter = (view: EditorView) =>
    view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
  const breakOf = (body: Body) => (body.content[0].content ?? []).filter((n) => n.type === "hard_break");

  it("bold text, the break key, more text: the body passes the check, the break has no marks, the bold stays", () => {
    const view = mount(doc(para(text("bold", "bold"))));
    shiftEnter(view);
    view.dispatch(view.state.tr.insertText(" more"));
    // The break command did inherit the mark here: the document itself holds a marked break.
    expect(view.state.doc.firstChild?.child(1).type.name).toBe("hard_break");
    expect(view.state.doc.firstChild?.child(1).marks.length).toBeGreaterThan(0);
    const b = bodyFromDoc(view.state.doc);
    expect(b.ok).toBe(true);
    if (b.ok) {
      const [brk] = breakOf(b.value);
      expect(brk).toEqual({ type: "hard_break" });
      expect("marks" in brk).toBe(false);
      expect(b.value.content[0].content?.[0]).toEqual(text("bold", "bold"));
    }
    view.destroy();
  });

  it.each(["bold", "italic", "underline", "strike"] as const)("a selection that holds a break, made %s, can be saved", (kind) => {
    const view = mount(doc(para(text("a"), { type: "hard_break" }, text("b"))));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));
    COMMANDS[kind](view.state, view.dispatch);
    expect(view.state.doc.firstChild?.child(1).marks.length).toBeGreaterThan(0);
    const b = bodyFromDoc(view.state.doc);
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(breakOf(b.value)).toEqual([{ type: "hard_break" }]);
      expect(b.value.content[0].content?.[0]).toEqual(text("a", kind));
      expect(b.value.content[0].content?.[2]).toEqual(text("b", kind));
    }
    view.destroy();
  });
});

/** The document cut at `pos`: everything before the caret, as a document, built independently. */
function truncatedJSON(d: PMNode, pos: number): unknown {
  const cut = d.cut(0, pos);
  return cut.toJSON();
}
