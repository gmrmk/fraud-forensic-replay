/**
 * Paste is plain text only and drop is refused, by named handlers (the safety review's change 5).
 * Checked on a fake clipboard at state level, and through the real view's event dispatch in
 * happy-dom. The browser's own paste (typed into a real editor) is not exercised here.
 */
import { describe, it, expect, vi } from "vitest";
import { EditorView } from "prosemirror-view";
import { createNoteState } from "./editor-state";
import { flattenDoc, bodyFromDoc } from "./editor";
import { handleDrop, handlePaste, inputProps, pasteTransaction, plainTextOf } from "./editor-input";
import { emptyBody } from "../../lib/notes/body";
import { VISA } from "../../lib/notes/test-fixtures";

const HTML = '<p>click <a href="https://example.test/x">here</a><img src="x" onerror="boom()"><b>bold</b></p>';

function clipboard(plain: string, html = HTML) {
  const getData = vi.fn((type: string) => (type === "text/html" ? html : type === "text/plain" ? plain : ""));
  return { getData, types: ["text/html", "text/plain"] };
}

describe("plainTextOf", () => {
  it("reads text/plain and never asks for text/html", () => {
    const cb = clipboard("line one\nline two");
    expect(plainTextOf(cb)).toBe("line one\nline two");
    expect(cb.getData.mock.calls.map((c) => c[0])).toEqual(["text/plain"]);
  });

  it("gives an empty string when the clipboard has no plain text", () => {
    expect(plainTextOf({ getData: () => "" })).toBe("");
    expect(plainTextOf(null)).toBe("");
  });
});

describe("pasteTransaction", () => {
  it("takes the plain text only: line breaks become paragraphs, no mark, no link, no image", () => {
    const state = createNoteState({ body: emptyBody() });
    const cb = clipboard("line one\nline two");
    const tr = pasteTransaction(state, plainTextOf(cb));
    expect(tr).not.toBeNull();
    const r = state.applyTransaction(tr!);
    expect(r.transactions.length).toBe(1);
    expect(flattenDoc(r.state.doc)).toBe("line one\nline two");
    r.state.doc.descendants((n) => {
      expect(["doc", "paragraph", "text"]).toContain(n.type.name);
      expect(n.marks.length).toBe(0);
    });
    expect(cb.getData.mock.calls.every((c) => c[0] === "text/plain")).toBe(true);
    expect(flattenDoc(r.state.doc)).not.toMatch(/example\.test|onerror|boom/);
  });

  it("drops control characters from the pasted text", () => {
    const state = createNoteState({ body: emptyBody() });
    const raw = "a" + String.fromCodePoint(7) + "b" + String.fromCodePoint(0x202e) + "c";
    const tr = pasteTransaction(state, raw);
    const r = state.applyTransaction(tr!);
    expect(flattenDoc(r.state.doc)).toBe("abc");
  });

  it("makes nothing from an empty paste", () => {
    expect(pasteTransaction(createNoteState({ body: emptyBody() }), "")).toBeNull();
  });

  it("a pasted card number is refused by the choke point, and the document is unchanged", () => {
    const refused: string[] = [];
    const state = createNoteState({ body: emptyBody(), onRefuse: (c) => refused.push(c) });
    const tr = pasteTransaction(state, VISA);
    const r = state.applyTransaction(tr!);
    expect(r.state).toBe(state);
    expect(refused).toEqual(["card_number"]);
  });

  it("a multi-line paste into a list item leaves a valid document", () => {
    const state0 = createNoteState({
      body: { v: 1, content: [{ type: "bullet_list", content: [{ type: "list_item", content: [{ type: "paragraph" }] }] }] },
    });
    const tr = pasteTransaction(state0, "one\ntwo\nthree");
    const r = state0.applyTransaction(tr!);
    r.state.doc.check();
    expect(flattenDoc(r.state.doc)).toContain("one");
    expect(bodyFromDoc(r.state.doc).ok).toBe(true);
  });
});

describe("the named handlers", () => {
  it("exposes handlePaste, handleDrop and the DOM event handlers that run before the library's own", () => {
    const props = inputProps();
    expect(props.handlePaste).toBe(handlePaste);
    expect(props.handleDrop).toBe(handleDrop);
    for (const name of ["paste", "drop", "dragover", "dragenter", "dragstart"]) {
      expect(typeof props.handleDOMEvents?.[name], name).toBe("function");
    }
    expect(props.transformPastedHTML?.(HTML, null as never)).toBe("");
  });

  it("drop is refused: handleDrop returns true and the DOM drop handler stops the default", () => {
    const state = createNoteState({ body: emptyBody() });
    const view = { state, dispatch: vi.fn() } as unknown as EditorView;
    expect(handleDrop(view, {} as DragEvent, null as never, false)).toBe(true);
    expect((view as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch).not.toHaveBeenCalled();
    const ev = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent;
    expect(inputProps().handleDOMEvents!.drop!.call({} as never, view, ev)).toBe(true);
    expect(ev.preventDefault).toHaveBeenCalled();
  });
});

describe("through the real view in happy-dom", () => {
  function mount() {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new EditorView(host, {
      state: createNoteState({ body: emptyBody() }),
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr));
      },
    });
    return { view, host };
  }

  function fire(view: EditorView, type: string, data: unknown) {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", { value: data });
    Object.defineProperty(ev, "dataTransfer", { value: data });
    view.dom.dispatchEvent(ev);
    return ev;
  }

  it("a paste event that offers HTML puts the plain text in and never reads the HTML", () => {
    const { view } = mount();
    const cb = clipboard("from the clipboard");
    const ev = fire(view, "paste", cb);
    expect(flattenDoc(view.state.doc)).toBe("from the clipboard");
    expect(cb.getData.mock.calls.every((c) => c[0] === "text/plain")).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    expect(view.dom.querySelector("a, img, strong, b")).toBeNull();
    view.destroy();
  });

  it("a drop event leaves the document unchanged and is cancelled", () => {
    const { view } = mount();
    const before = view.state.doc;
    const ev = fire(view, "drop", clipboard("dropped text"));
    expect(view.state.doc.eq(before)).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    view.destroy();
  });

  it("a pasted card number through the view leaves the document unchanged", () => {
    const { view } = mount();
    fire(view, "paste", clipboard(VISA));
    expect(flattenDoc(view.state.doc)).toBe("");
    view.destroy();
  });
});
