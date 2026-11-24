/**
 * The editor's state: the closed schema, history, the keys, the input handlers and the choke
 * point, in the order that makes the choke point the last word. A body reaches it only through
 * `docFromBody`; a body that fails the checks becomes an empty document.
 */
import { history } from "prosemirror-history";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { docFromBody, emptyDoc } from "./editor";
import { noteKeymaps } from "./editor-commands";
import { guardPlugin, type RefusalCode } from "./editor-guard";
import { inputProps } from "./editor-input";

export interface NoteStateOptions {
  /** The body to start from: any value, checked on the way in. Absent: an empty document. */
  body?: unknown;
  /** Told the fixed code of each refused transaction. Never told the value. */
  onRefuse?: (code: RefusalCode) => void;
  /** Ctrl or Cmd with Enter. */
  onSave?: () => void;
}

export function createNoteState(o: NoteStateOptions = {}): EditorState {
  const d = o.body === undefined ? null : docFromBody(o.body);
  const doc = d && d.ok ? d.value : emptyDoc();
  return EditorState.create({
    doc,
    selection: TextSelection.atEnd(doc),
    plugins: [history(), ...noteKeymaps(o.onSave), new Plugin({ props: inputProps() }), guardPlugin(o.onRefuse)],
  });
}
