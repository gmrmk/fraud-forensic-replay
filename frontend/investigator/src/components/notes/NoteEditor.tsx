/**
 * The editor view in the note window: the library's view mounted on a closed-schema state. It
 * reports a snapshot to the window after each change of the document or the selection, and hands
 * the window a handle for the format buttons. It holds no note data of its own: the body goes in
 * once (checked), and the window reads it back only through `saveVerdict`.
 *
 * Every transaction passes the choke point in editor-guard.ts (the state's own filter), and paste
 * and drop are taken over by the named handlers in editor-input.ts. The view's DOM is the only
 * place where the person's text lives until Save.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import { EditorView } from "prosemirror-view";
import { COMMANDS } from "./editor-commands";
import type { RefusalCode } from "./editor-guard";
import { snapshotOf, type EditorHandle, type EditorSnapshot } from "./editor-snapshot";
import { createNoteState } from "./editor-state";
import { TEXT_NAME } from "../../lib/tooltip-words/notes";

interface Props {
  /** The body to start from, checked on the way in. */
  initialBody: unknown;
  handleRef: MutableRefObject<EditorHandle | null>;
  onChange: (s: EditorSnapshot) => void;
  onRefuse: (code: RefusalCode) => void;
  onSave: () => void;
  /** The editor lost focus: every run is now closed. */
  onBlur: (s: EditorSnapshot) => void;
}

const HOST =
  "rounded-sm border border-panel-border-strong bg-[rgb(var(--panel-floor)/0.6)] px-1.5 py-1 font-mono text-[10px] leading-[14px] text-text " +
  "focus-within:ring-1 focus-within:ring-signal max-h-[180px] min-h-[84px] overflow-y-auto " +
  "[&_.ProseMirror]:min-h-[76px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:whitespace-pre-wrap [&_.ProseMirror]:break-words " +
  "[&_p]:my-0 [&_ul]:my-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-4 " +
  "[&_blockquote]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-panel-border-strong [&_blockquote]:pl-2 [&_blockquote]:text-muted";

export function NoteEditor({ initialBody, handleRef, onChange, onRefuse, onSave, onBlur }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  // The latest callbacks, read by the view's long-lived handlers (set after each render).
  const cb = useRef({ onChange, onRefuse, onSave, onBlur });
  useEffect(() => {
    cb.current = { onChange, onRefuse, onSave, onBlur };
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const view: EditorView = new EditorView(el, {
      state: createNoteState({
        body: initialBody,
        onRefuse: (code) => cb.current.onRefuse(code),
        onSave: () => cb.current.onSave(),
      }),
      // spellcheck off: a browser may send the text of a spell-checked field to a spell service,
      // and the text here has not yet been judged by the card number guard.
      attributes: { role: "textbox", "aria-multiline": "true", "aria-label": TEXT_NAME, spellcheck: "false" },
      dispatchTransaction(tr) {
        const prev = view.state;
        const next = prev.apply(tr);
        // The choke point refused it: the state is the one we had, and nothing changed to tell of.
        if (next === prev) return;
        view.updateState(next);
        cb.current.onChange(snapshotOf(next));
      },
      handleDOMEvents: {
        blur: () => {
          cb.current.onBlur(snapshotOf(view.state));
          return false;
        },
      },
    });
    handleRef.current = {
      run: (kind) => {
        COMMANDS[kind](view.state, view.dispatch);
        view.focus();
      },
      focus: () => view.focus(),
      getState: () => view.state,
    };
    cb.current.onChange(snapshotOf(view.state));
    view.focus();
    return () => {
      handleRef.current = null;
      view.destroy();
    };
    // The body goes in once, at mount: the window holds the person's text from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} data-note-editor className={HOST} />;
}
