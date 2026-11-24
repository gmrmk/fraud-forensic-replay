/**
 * The format commands on the closed schema. State level. A list item holds one paragraph, so the
 * library's wrapInList is replaced by `toggleList`; these tests pin the cases that matter: two
 * paragraphs become two items, a toggle off restores paragraphs, Enter in a list starts an item,
 * a quote wraps and lifts, and no command ever leaves a document the schema refuses.
 */
import { describe, it, expect } from "vitest";
import { TextSelection, type EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { COMMANDS, activeFormats, enabledFormats } from "./editor-commands";
import { createNoteState } from "./editor-state";
import { bodyFromDoc, flattenDoc } from "./editor";
import { doc, para, text } from "../../lib/notes/test-fixtures";
import type { Body } from "../../lib/notes/types";

function run(state: EditorState, kind: keyof typeof COMMANDS): EditorState {
  let next = state;
  COMMANDS[kind](state, (tr) => {
    next = state.applyTransaction(tr).state;
  });
  return next;
}
const select = (s: EditorState, from: number, to: number) => s.apply(s.tr.setSelection(TextSelection.create(s.doc, from, to)));
const typesOf = (s: EditorState) => s.doc.content.content.map((n) => n.type.name);
const checked = (s: EditorState) => {
  s.doc.check();
  expect(bodyFromDoc(s.doc).ok).toBe(true);
};

const two: Body = doc(para(text("one")), para(text("two")), para(text("three")));

describe("lists", () => {
  it("two selected paragraphs become two items of one list; the third stays", () => {
    let s = createNoteState({ body: two });
    s = select(s, 2, 10); // from inside "one" to inside "two"
    s = run(s, "bullet_list");
    expect(typesOf(s)).toEqual(["bullet_list", "paragraph"]);
    expect(s.doc.firstChild?.childCount).toBe(2);
    expect(flattenDoc(s.doc)).toBe("one\ntwo\nthree");
    checked(s);
  });

  it("the same command again lifts the items back into paragraphs", () => {
    let s = createNoteState({ body: two });
    s = select(s, 2, 10);
    s = run(s, "bullet_list");
    expect(activeFormats(s).bullet_list).toBe(true);
    s = run(s, "bullet_list");
    expect(typesOf(s)).toEqual(["paragraph", "paragraph", "paragraph"]);
    checked(s);
  });

  it("a numbered list turns a bulleted one into a numbered one", () => {
    let s = createNoteState({ body: two });
    s = select(s, 2, 2);
    s = run(s, "bullet_list");
    s = run(s, "ordered_list");
    expect(typesOf(s)[0]).toBe("ordered_list");
    expect(activeFormats(s).ordered_list).toBe(true);
    checked(s);
  });

  it("every item holds exactly one paragraph, whatever is done", () => {
    let s = createNoteState({ body: two });
    s = select(s, 2, 14);
    s = run(s, "ordered_list");
    s.doc.descendants((n) => {
      if (n.type.name === "list_item") expect(n.childCount).toBe(1);
    });
    checked(s);
  });
});

describe("quote", () => {
  it("wraps the paragraph and lifts it again", () => {
    let s = createNoteState({ body: two });
    s = select(s, 2, 2);
    s = run(s, "quote");
    expect(typesOf(s)[0]).toBe("quote");
    expect(activeFormats(s).quote).toBe(true);
    checked(s);
    s = run(s, "quote");
    expect(typesOf(s)).toEqual(["paragraph", "paragraph", "paragraph"]);
  });

  it("is not offered inside a list (no list inside a quote, no quote inside an item)", () => {
    let s = createNoteState({ body: two });
    s = select(s, 2, 2);
    s = run(s, "bullet_list");
    expect(enabledFormats(s).quote).toBe(false);
  });
});

describe("keys, through the real view", () => {
  function mount(body: Body, onSave?: () => void) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new EditorView(host, {
      state: createNoteState({ body, onSave }),
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr));
      },
    });
    const key = (k: string, mods: KeyboardEventInit = {}) => {
      const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods });
      view.dom.dispatchEvent(ev);
      return ev;
    };
    return { view, key };
  }

  it("Enter in a list starts a new item; Enter on that empty item leaves the list", () => {
    const { view, key } = mount(doc(para(text("one"))));
    view.updateState(view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2))));
    COMMANDS.bullet_list(view.state, view.dispatch);
    view.updateState(view.state.apply(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc))));
    key("Enter");
    expect(view.state.doc.firstChild?.childCount).toBe(2);
    key("Enter");
    expect(typesOf(view.state)).toEqual(["bullet_list", "paragraph"]);
    view.state.doc.check();
    view.destroy();
  });

  it("Ctrl+Enter saves; Ctrl+B formats; Tab is left to the browser (it leaves the editor)", () => {
    let saved = 0;
    const { view, key } = mount(doc(para(text("abcd"))), () => (saved += 1));
    key("Enter", { ctrlKey: true });
    expect(saved).toBe(1);
    view.updateState(view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 4))));
    key("b", { ctrlKey: true });
    expect(activeFormats(view.state).bold).toBe(true);
    const tab = key("Tab");
    expect(tab.defaultPrevented).toBe(false);
    view.destroy();
  });
});

describe("marks", () => {
  it("bold on a selection marks the text, and the body keeps the mark", () => {
    let s = createNoteState({ body: doc(para(text("abcd"))) });
    s = select(s, 2, 4);
    s = run(s, "bold");
    expect(activeFormats(s).bold).toBe(true);
    const b = bodyFromDoc(s.doc);
    expect(b.ok && JSON.stringify(b.value)).toContain('"marks":[{"type":"bold"}]');
    s = run(s, "bold");
    expect(activeFormats(s).bold).toBe(false);
  });
});
