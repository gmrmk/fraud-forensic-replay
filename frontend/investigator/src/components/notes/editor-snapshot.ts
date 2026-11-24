/**
 * What the editor tells the window after each change: a snapshot of the state, and the handle the
 * window uses for the format buttons. Kept apart from the component so that the component file
 * exports components only.
 */
import type { EditorState } from "prosemirror-state";
import { bodySignature, flattenDoc } from "./editor";
import { activeFormats, enabledFormats, type FormatKind } from "./editor-commands";
import { holdsClosedNumber } from "./editor-guard";

export interface EditorSnapshot {
  /** The same string for two documents that hold the same body. */
  signature: string;
  /** The text holds nothing at all. */
  blank: boolean;
  /** A refused number stands in the text and the caret is not at its end (the live status). */
  holdsNumber: boolean;
  /** Blur and Save judge every run closed. */
  holdsNumberClosed: boolean;
  active: Record<FormatKind, boolean>;
  enabled: Record<FormatKind, boolean>;
}

export interface EditorHandle {
  run(kind: FormatKind): void;
  focus(): void;
  getState(): EditorState;
}

export function snapshotOf(state: EditorState): EditorSnapshot {
  return {
    signature: bodySignature(state.doc),
    blank: flattenDoc(state.doc) === "",
    holdsNumber: holdsClosedNumber(state, true),
    holdsNumberClosed: holdsClosedNumber(state, false),
    active: activeFormats(state),
    enabled: enabledFormats(state),
  };
}
