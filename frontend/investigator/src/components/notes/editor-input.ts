/**
 * Paste is plain text only and drop is refused, by named handlers (the safety review, change 5).
 *
 * The library's own paste reads the clipboard's rich-text type, parses it, and only then asks the
 * `handlePaste` prop. So the same named handler is also registered as a DOM event handler, which
 * the library runs before its own: the rich-text type is never read and never parsed.
 * `transformPastedHTML` returns an empty string as a third wall.
 *
 *  - paste: the clipboard's plain-text type only; line breaks become paragraphs, control and bidi
 *    override characters are dropped, text is made NFC (P1's `bodyFromPlainText`); the result is
 *    one transaction marked as a paste, which the choke point judges with every run closed.
 *  - drop, dragover, dragenter, dragstart: refused. Nothing is dropped into the editor, and
 *    nothing is dragged out of it.
 * A paste during an input method composition is the browser's own; what it writes into the page
 * is read back through the same closed schema and the same choke point.
 */
import { Fragment, Slice } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorProps, EditorView } from "prosemirror-view";
import { noteSchema } from "./editor";
import { PLAIN_PASTE_META } from "./editor-guard";
import { bodyFromPlainText } from "../../lib/notes/body";

/** The one method of a clipboard this module uses. */
export interface ClipboardLike {
  getData(type: string): string;
}

/** The plain text of a clipboard. It asks for the plain-text type and for nothing else. */
export function plainTextOf(cb: ClipboardLike | null | undefined): string {
  if (!cb) return "";
  try {
    return cb.getData("text/plain") || "";
  } catch {
    return "";
  }
}

/** The transaction that pastes `plain` at the selection, or null when there is nothing to paste. */
export function pasteTransaction(state: EditorState, plain: string): Transaction | null {
  const trimmed = plain.replace(/(?:\r\n|\r|\n)+$/, "");
  const body = bodyFromPlainText(trimmed);
  const lines = body.content.map((p) => (p.type === "paragraph" && p.content ? p.content.map((n) => (n.type === "text" ? n.text : "")).join("") : ""));
  if (lines.every((l) => l === "")) return null;
  let tr: Transaction;
  if (lines.length === 1) {
    tr = state.tr.insertText(lines[0]);
  } else {
    const paragraphs = lines.map((l) => noteSchema.nodes.paragraph.create(null, l ? noteSchema.text(l) : undefined));
    tr = state.tr.replaceSelection(new Slice(Fragment.from(paragraphs), 1, 1));
  }
  return tr.setMeta("paste", true).setMeta(PLAIN_PASTE_META, true).setMeta("uiEvent", "paste").scrollIntoView();
}

/** Takes over paste. Always returns true: the library never sees the event. */
export function handlePaste(view: EditorView, event: ClipboardEvent): boolean {
  event.preventDefault();
  const tr = pasteTransaction(view.state, plainTextOf(event.clipboardData));
  if (tr) view.dispatch(tr);
  return true;
}

/** Refuses a drop. The library's own would insert whatever was dropped. */
export function handleDrop(_view: EditorView, _event: DragEvent, _slice: Slice, _moved: boolean): boolean {
  return true;
}

function refuseDrag(_view: EditorView, event: Event): boolean {
  event.preventDefault();
  return true;
}

/** The dragover and dragenter handlers do not cancel the event, so the browser shows no drop
 *  cursor. An editable region still receives a drop natively: the refusal rests on the drop
 *  handler (`refuseDrag`), which cancels it before anything is inserted. */
function leaveUncancelled(): boolean {
  return true;
}

export function inputProps(): EditorProps {
  return {
    handlePaste,
    handleDrop,
    handleDOMEvents: {
      paste: handlePaste,
      drop: refuseDrag,
      dragstart: refuseDrag,
      dragover: leaveUncancelled,
      dragenter: leaveUncancelled,
    },
    transformPastedHTML: () => "",
  };
}
