/**
 * The one choke point for every transaction of the note editor: typing, paste, drop (refused
 * before it gets here), undo and redo all pass `filterTransaction`, which asks `judgeTransaction`.
 *
 *  - A transaction that does not change the document (a caret or selection move) is always
 *    accepted, so the caret is never trapped. A pure deletion is always accepted, so a refused
 *    number can always be taken out.
 *  - Otherwise it is refused when it adds text past 4,000 characters, when the text it adds holds
 *    a control or bidi override character, or when `acceptEdit` (P1's typing rule: the number of
 *    refused closed runs must not rise) says no. A paste counts as an insert of 2 or more
 *    characters, so every run in it is judged closed.
 *  - `saveVerdict` is the Save rule, built from `checkBody`: every run is judged closed. It never
 *    carries the text or the number.
 *  - A refusal is a fixed code. The refused value is never stored, logged or echoed.
 *
 * What happens to an open number when the caret moves away or the editor loses focus: the move is
 * accepted, the run it leaves is then closed, `holdsClosedNumber` is true, the window shows the
 * card message, and Save is refused. The window stays open. A draft is not stored.
 */
import { Plugin, PluginKey, TextSelection, type EditorState, type Selection, type Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { bodyFromDoc, caretOffset, flattenDoc } from "./editor";
import { charCount } from "../../lib/notes/body";
import { isBidiOverrideCp, isControlCp } from "../../lib/notes/digits";
import { acceptEdit, refusedClosedCount } from "../../lib/notes/guard";
import { LIMITS, type Body, type NoteErrorCode } from "../../lib/notes/types";

export type RefusalCode = Extract<NoteErrorCode, "card_number" | "too_long" | "body_schema">;
export type Verdict = { ok: true } | { ok: false; code: RefusalCode };

/** A transaction made by the plain-text paste carries this meta (the library's own is "paste"). */
export const PLAIN_PASTE_META = "notes-plain-paste";

/** The caret's offset in the flattened text, or null when the selection is not a text caret. */
export function caretOf(selection: Selection, doc: PMNode): number | null {
  return selection instanceof TextSelection ? caretOffset(doc, selection.head) : null;
}

/** The number of code points that `b` holds and `a` does not, by common prefix and suffix. */
export function insertedCount(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let p = 0;
  while (p < max && a[p] === b[p]) p += 1;
  let s = 0;
  while (s < max - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s += 1;
  return charCount(b.slice(p, b.length - s));
}

function textChars(doc: PMNode): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.isText) n += charCount(node.text as string);
    return true;
  });
  return n;
}

function holdsBadCharacter(doc: PMNode): boolean {
  let bad = false;
  doc.descendants((node) => {
    if (bad || !node.isText) return !bad;
    for (const ch of node.text as string) {
      const cp = ch.codePointAt(0) as number;
      if (isControlCp(cp) || isBidiOverrideCp(cp)) {
        bad = true;
        break;
      }
    }
    return !bad;
  });
  return bad;
}

/** True when the document is past a structure limit of the closed body: 100 blocks, 50 items in a
 *  list, 20 paragraphs in a quote. Save would refuse it, so growth past it is refused here. */
function exceedsStructure(doc: PMNode): boolean {
  if (doc.childCount > LIMITS.blocks) return true;
  let over = false;
  doc.forEach((block) => {
    if (block.type.name === "quote" && block.childCount > LIMITS.quoteParagraphs) over = true;
    if ((block.type.name === "bullet_list" || block.type.name === "ordered_list") && block.childCount > LIMITS.listItems) over = true;
  });
  return over;
}

export function judgeTransaction(tr: Transaction, before: EditorState): Verdict {
  if (!tr.docChanged) return { ok: true };
  // Growth past a structure limit is refused (the design has no sentence for it, so the refusal is
  // silent); a change that leaves the document as far over as it was, or less, is accepted.
  if (exceedsStructure(tr.doc) && !exceedsStructure(before.doc)) return { ok: false, code: "body_schema" };
  const textBefore = flattenDoc(before.doc);
  const textAfter = flattenDoc(tr.doc);
  let inserted = insertedCount(textBefore, textAfter);
  if (inserted === 0) return { ok: true }; // a deletion, or a change of form with the text as it was
  if (tr.getMeta("paste") === true || tr.getMeta(PLAIN_PASTE_META) === true) inserted = Math.max(inserted, 2);

  const charsAfter = textChars(tr.doc);
  if (charsAfter > LIMITS.textChars && charsAfter > textChars(before.doc)) return { ok: false, code: "too_long" };
  if (holdsBadCharacter(tr.doc)) return { ok: false, code: "body_schema" };

  const ok = acceptEdit(
    { text: textBefore, caret: caretOf(before.selection, before.doc) },
    { text: textAfter, caret: caretOf(tr.selection, tr.doc) },
    inserted,
  );
  return ok ? { ok: true } : { ok: false, code: "card_number" };
}

/** True when the document holds a refused number. With `withCaret`, a run that ends at the caret
 *  is open and does not count (the live status); without it every run is closed (blur, Save). */
export function holdsClosedNumber(state: EditorState, withCaret: boolean): boolean {
  const caret = withCaret ? caretOf(state.selection, state.doc) : null;
  return refusedClosedCount(flattenDoc(state.doc), caret) > 0;
}

/** The Save rule. On success the checked body; on refusal a fixed code and nothing else. */
export function saveVerdict(state: EditorState): { ok: true; body: Body } | { ok: false; code: NoteErrorCode } {
  const b = bodyFromDoc(state.doc);
  return b.ok ? { ok: true, body: b.value } : { ok: false, code: b.code };
}

const KEY = new PluginKey("note-guard");

export function guardPlugin(onRefuse?: (code: RefusalCode) => void): Plugin {
  return new Plugin({
    key: KEY,
    filterTransaction(tr, state) {
      const v = judgeTransaction(tr, state);
      if (!v.ok) onRefuse?.(v.code);
      return v.ok;
    },
  });
}
