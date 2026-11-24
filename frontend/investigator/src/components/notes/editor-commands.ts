/**
 * The editor's commands and keys. Marks and blocks come from the closed schema only. A list item
 * holds exactly one paragraph, so the library's wrapInList (which puts several paragraphs in one
 * item) is not used: `toggleList` makes one item for each selected top-level paragraph.
 */
import { baseKeymap, chainCommands, lift, toggleMark, wrapIn } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Fragment, type MarkType, type Node as PMNode, type NodeType } from "prosemirror-model";
import { splitListItem } from "prosemirror-schema-list";
import { TextSelection, type Command, type EditorState, type Plugin } from "prosemirror-state";
import { noteSchema } from "./editor";

const { bold, italic, underline, strike } = noteSchema.marks;
const { bullet_list, ordered_list, list_item, quote, paragraph, hard_break } = noteSchema.nodes;

export type FormatKind = "bold" | "italic" | "underline" | "strike" | "bullet_list" | "ordered_list" | "quote";

function toggleList(listType: NodeType): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d);
      if (n.type === bullet_list || n.type === ordered_list) {
        if (n.type === listType) {
          // Toggle off: the whole list becomes paragraphs again. (The library's liftListItem first
          // merges items into one, which an item of exactly one paragraph cannot hold.)
          if (dispatch) {
            const at = $from.before(d);
            const paragraphs = Fragment.from(Array.from({ length: n.childCount }, (_, i) => n.child(i).child(0)));
            const tr = state.tr.replaceWith(at, at + n.nodeSize, paragraphs);
            const sel = TextSelection.between(tr.doc.resolve(at + 1), tr.doc.resolve(at + paragraphs.size - 1));
            dispatch(tr.setSelection(sel).scrollIntoView());
          }
          return true;
        }
        if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(d), listType));
        return true;
      }
      if (n.type === quote) return false; // no list inside a quote
    }
    const range = $from.blockRange($to);
    if (!range || range.parent.type !== noteSchema.nodes.doc) return false;
    const blocks: PMNode[] = [];
    for (let i = range.startIndex; i < range.endIndex; i++) blocks.push(range.parent.child(i));
    if (!blocks.every((b) => b.type === paragraph)) return false;
    if (dispatch) {
      const list = listType.create(null, blocks.map((b) => list_item.create(null, b)));
      const tr = state.tr.replaceWith(range.start, range.end, list);
      // The old selection collapses to the edge of what was replaced: select the new items' text.
      const sel = TextSelection.between(tr.doc.resolve(range.start + 1), tr.doc.resolve(range.start + list.nodeSize - 1));
      dispatch(tr.setSelection(sel).scrollIntoView());
    }
    return true;
  };
}

const toggleQuote: Command = (state, dispatch) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === quote) return lift(state, dispatch);
  return wrapIn(quote)(state, dispatch);
};

export const COMMANDS: Record<FormatKind, Command> = {
  bold: toggleMark(bold),
  italic: toggleMark(italic),
  underline: toggleMark(underline),
  strike: toggleMark(strike),
  bullet_list: toggleList(bullet_list),
  ordered_list: toggleList(ordered_list),
  quote: toggleQuote,
};

export function markActive(state: EditorState, type: MarkType): boolean {
  const { from, to, empty, $from } = state.selection;
  if (empty) return type.isInSet(state.storedMarks || $from.marks()) !== undefined;
  return state.doc.rangeHasMark(from, to, type);
}

function ancestorIs(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === type) return true;
  return false;
}

/** Which format buttons are pressed at the selection. */
export function activeFormats(state: EditorState): Record<FormatKind, boolean> {
  return {
    bold: markActive(state, bold),
    italic: markActive(state, italic),
    underline: markActive(state, underline),
    strike: markActive(state, strike),
    bullet_list: ancestorIs(state, bullet_list),
    ordered_list: ancestorIs(state, ordered_list),
    quote: ancestorIs(state, quote),
  };
}

/** Which format buttons can act at the selection (a dry run of each command). */
export function enabledFormats(state: EditorState): Record<FormatKind, boolean> {
  const out = {} as Record<FormatKind, boolean>;
  for (const k of Object.keys(COMMANDS) as FormatKind[]) out[k] = COMMANDS[k](state);
  return out;
}

const insertBreak: Command = (state, dispatch) => {
  if (dispatch) dispatch(state.tr.replaceSelectionWith(hard_break.create()).scrollIntoView());
  return true;
};

/**
 * The keys: Ctrl or Cmd with B, I and U format; Ctrl or Cmd with Z, Y and Shift-Z undo and redo;
 * Shift-Enter is a hard break; Ctrl or Cmd with Enter saves (the window's callback). Enter in a
 * list starts a new item. Tab is not bound: it leaves the editor.
 */
export function noteKeymaps(onSave?: () => void): Plugin[] {
  return [
    keymap({
      "Mod-b": COMMANDS.bold,
      "Mod-i": COMMANDS.italic,
      "Mod-u": COMMANDS.underline,
      "Mod-z": undo,
      "Mod-y": redo,
      "Shift-Mod-z": redo,
      "Shift-Enter": insertBreak,
      "Mod-Enter": () => {
        onSave?.();
        return true;
      },
      Enter: chainCommands(splitListItem(list_item), baseKeymap["Enter"]),
    }),
    keymap(baseKeymap),
  ];
}
