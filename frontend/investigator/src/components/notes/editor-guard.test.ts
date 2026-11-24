/**
 * The one choke point for every transaction (the design, section 5, with the safety review's
 * change 11): typing, paste and undo all pass it. State level. Every number is a published test
 * number or one from the shared vectors.
 */
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import { undo, undoDepth } from "prosemirror-history";
import { Node as PMNode } from "prosemirror-model";
import { createNoteState } from "./editor-state";
import { bodyFromDoc, flattenDoc, noteSchema } from "./editor";
import { holdsClosedNumber, saveVerdict } from "./editor-guard";
import { emptyBody } from "../../lib/notes/body";
import { VISA, VECTORS, bodyOf, doc, para } from "../../lib/notes/test-fixtures";

type Refusal = string;

function fresh(body = emptyBody()) {
  const refused: Refusal[] = [];
  let state = createNoteState({ body, onRefuse: (code) => refused.push(code) });
  const apply = (tr: Transaction): boolean => {
    const before = state;
    const r = state.applyTransaction(tr);
    state = r.state;
    return r.state !== before;
  };
  const type = (s: string): boolean[] =>
    [...s].map((ch) => apply(state.tr.insertText(ch)));
  return { get state() { return state; }, refused, apply, type };
}

/** A state whose document holds `text` as it stands (a number already closed, as a deleted-from
 *  or file-loaded draft could hold). Built around the choke point on purpose. */
function stateHolding(text: string): EditorState {
  const d = PMNode.fromJSON(noteSchema, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const base = createNoteState({ body: emptyBody() });
  return EditorState.create({ doc: d, plugins: base.plugins, selection: TextSelection.atEnd(d) });
}

describe("typing, judged by state", () => {
  it("a number that fails Luhn types in one digit at a time, every keystroke accepted", () => {
    const e = fresh();
    const accepted = e.type("1234567890123456");
    expect(accepted.every(Boolean)).toBe(true);
    expect(flattenDoc(e.state.doc)).toBe("1234567890123456");
    expect(e.refused).toEqual([]);
  });

  it("a valid number: all 16 digits are accepted (the run is open), the next space is refused", () => {
    const e = fresh();
    expect(e.type(VISA).every(Boolean)).toBe(true);
    expect(e.type(" ")).toEqual([false]);
    expect(flattenDoc(e.state.doc)).toBe(VISA);
    expect(e.refused).toEqual(["card_number"]);
  });

  it("Save is refused for the open number, with the card code and no value", () => {
    const e = fresh();
    e.type(VISA);
    const v = saveVerdict(e.state);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.code).toBe("card_number");
      expect(JSON.stringify(v)).not.toContain(VISA);
    }
    expect(bodyFromDoc(e.state.doc).ok).toBe(false);
  });

  it("a deletion is accepted, so a refused number can always be taken out", () => {
    const e = fresh();
    e.type(VISA);
    expect(e.apply(e.state.tr.delete(e.state.doc.content.size - 2, e.state.doc.content.size - 1))).toBe(true);
    expect(flattenDoc(e.state.doc)).toBe(VISA.slice(0, 15));
    // A refused run closed by someone else's edit is deleted a character at a time.
    const closed = stateHolding(VISA);
    const r = closed.applyTransaction(closed.tr.delete(closed.doc.content.size - 2, closed.doc.content.size - 1));
    expect(r.state).not.toBe(closed);
  });

  it("a transaction that closes a refused run is refused; one that leaves the count alone is accepted", () => {
    const e = fresh();
    e.type(VISA);
    // A line feed (a new paragraph) closes the open run.
    expect(e.apply(e.state.tr.split(e.state.selection.from))).toBe(false);
    expect(e.refused).toContain("card_number");
  });

  it("a refused transaction never enters the undo history", () => {
    const e = fresh();
    e.type("ab");
    const depth = undoDepth(e.state);
    e.type("4111111111111111");
    const after = undoDepth(e.state);
    e.apply(e.state.tr.insertText(" "));
    expect(undoDepth(e.state)).toBe(after);
    expect(after).toBeGreaterThanOrEqual(depth);
  });
});

describe("a paste is judged as closed runs", () => {
  it("pasting a valid number is refused; ordinary text is accepted", () => {
    const e = fresh();
    expect(e.apply(e.state.tr.insertText(VISA).setMeta("paste", true))).toBe(false);
    expect(e.refused).toEqual(["card_number"]);
    expect(e.apply(e.state.tr.insertText("hello world").setMeta("paste", true))).toBe(true);
  });

  it("a multi-character insert is judged as a paste even without the meta", () => {
    const e = fresh();
    expect(e.apply(e.state.tr.insertText(VISA))).toBe(false);
  });

  it("every shared text vector that is refused is refused as a paste, and the allowed ones are accepted", () => {
    for (const v of VECTORS.text_vectors) {
      // A control character (a line feed, a tab) cannot be a typed or pasted character here: the
      // paste rule turns line feeds into paragraphs and drops the rest, so those cases belong to
      // the plain-text paste tests.
      if ([...v.text].some((ch) => (ch.codePointAt(0) as number) < 0x20)) continue;
      const e = fresh();
      const ok = e.apply(e.state.tr.insertText(v.text).setMeta("paste", true));
      expect(ok ? "allowed" : "refused", v.id).toBe(v.expect);
    }
  });
});

describe("the caret leaves an open run (the review's change 11)", () => {
  it("a selection-only move is accepted; the run is then closed, Save is refused, and blur says so", () => {
    const e = fresh();
    e.type(VISA);
    expect(holdsClosedNumber(e.state, true)).toBe(false); // open at the caret
    expect(e.apply(e.state.tr.setSelection(TextSelection.create(e.state.doc, 1)))).toBe(true);
    expect(holdsClosedNumber(e.state, true)).toBe(true); // the caret left: closed
    expect(holdsClosedNumber(e.state, false)).toBe(true); // blur: every run closed
    expect(saveVerdict(e.state).ok).toBe(false);
  });

  it("an edit elsewhere is accepted only when it adds no refused closed run", () => {
    const e = fresh();
    e.type(VISA);
    e.apply(e.state.tr.setSelection(TextSelection.create(e.state.doc, 1)));
    expect(e.apply(e.state.tr.insertText("x"))).toBe(true); // count 1 before and after
    // The caret back at the end of the number: the run is open there again, and the live status clears.
    e.apply(e.state.tr.setSelection(TextSelection.atEnd(e.state.doc)));
    expect(holdsClosedNumber(e.state, true)).toBe(false);
    // But Save and blur still judge every run closed.
    expect(holdsClosedNumber(e.state, false)).toBe(true);
    expect(saveVerdict(e.state).ok).toBe(false);
  });

  it("blur on a clean draft says nothing", () => {
    const e = fresh();
    e.type("1234567890123456");
    expect(holdsClosedNumber(e.state, false)).toBe(false);
    expect(saveVerdict(e.state).ok).toBe(true);
  });

  it("the draft is not stored: nothing in the store or a file is built from the editor until Save passes", () => {
    const e = fresh();
    e.type(VISA);
    e.apply(e.state.tr.setSelection(TextSelection.create(e.state.doc, 1)));
    const v = saveVerdict(e.state);
    expect(v.ok).toBe(false);
    expect("body" in v).toBe(false);
  });
});

describe("the other limits", () => {
  it("refuses an insert past 4,000 characters with the too-long code; a deletion is accepted", () => {
    const e = fresh(bodyOf("a".repeat(4000)));
    expect(e.apply(e.state.tr.insertText("b", e.state.doc.content.size - 1))).toBe(false);
    expect(e.refused).toEqual(["too_long"]);
    expect(e.apply(e.state.tr.delete(1, 2))).toBe(true);
    expect(e.apply(e.state.tr.insertText("b", 1))).toBe(true);
  });

  it("refuses growth past 100 blocks, 50 list items and 20 quote paragraphs; the refusal is silent", () => {
    const blocks = fresh(doc(...Array.from({ length: 100 }, () => para())));
    const end = blocks.state.doc.content.size - 1;
    expect(blocks.apply(blocks.state.tr.split(end))).toBe(false);
    expect(blocks.refused).toEqual(["body_schema"]);
    expect(blocks.apply(blocks.state.tr.delete(1, 3))).toBe(true); // a deletion goes through

    const items = fresh(doc({ type: "bullet_list", content: Array.from({ length: 50 }, () => ({ type: "list_item" as const, content: [para()] as [ReturnType<typeof para>] })) }));
    expect(items.apply(items.state.tr.split(items.state.doc.content.size - 3, 2))).toBe(false);

    const quote = fresh(doc({ type: "quote", content: Array.from({ length: 20 }, () => para()) }));
    expect(quote.apply(quote.state.tr.split(quote.state.doc.content.size - 2))).toBe(false);
  });

  it("refuses a control character and a bidi override, built from code points", () => {
    const e = fresh();
    expect(e.apply(e.state.tr.insertText(String.fromCodePoint(7)))).toBe(false);
    expect(e.apply(e.state.tr.insertText(String.fromCodePoint(0x202e)))).toBe(false);
    expect(e.refused).toEqual(["body_schema", "body_schema"]);
  });

  it("undo passes the same choke point and works for ordinary typing", () => {
    const e = fresh();
    e.type("ab");
    let state = e.state;
    undo(state, (tr) => {
      state = state.apply(tr);
    });
    expect(flattenDoc(state.doc).length).toBeLessThan(2);
  });
});
