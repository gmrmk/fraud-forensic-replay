// frontend/investigator/src/components/record-window/RecordNotes.tsx
// The notes of one record as rows, for the record's own window, and the button that adds one. A row is
// two lines: the note's colour, time and category, then the first line of its text. A press on a row
// opens the note whole in place, read only: line one stays as the row's head and the note's body follows
// it, with "Edit the note." under it, which opens the note's own window (the existing opener). A second
// press folds the row back to its two lines. Each row keeps its own open state, so rows open and fold
// one by one. The tooltip of a row never states the note's own PASS or FAIL and never repeats the link:
// every row here is a note of this record, and the record's own mark sits above the rows.
//
// What this file does not do: it edits no note, writes nothing to the marks store, and reads the
// playhead only to time a new note of a record that has no time of its own (the playhead is the one
// clock). A new note opens right of this window's frame and remembers its button for the focus
// return. Opening a row in place moves no playhead, selects nothing and opens no window; only
// "Edit the note." and "Add a note" open one.
import { useId, useState, type MouseEvent } from "react";
import { NoteBody } from "../notes/NoteBody";
import { noteTimeFor, openSavedNote, placeNoteWindow, windowPlaceNear } from "../notes/open-note";
import type { RecordLookup } from "../notes/record-lookup";
import { tip } from "../ui/Tip";
import { noteLabel } from "../../lib/notes/body";
import { colourCss } from "../../lib/notes/colours";
import type { Note } from "../../lib/notes/types";
import type { RecordRef } from "../../lib/marks/types";
import { ADD_ON_RECORD, BUTTONS, markTip } from "../../lib/tooltip-words/notes";
import { noteOpenedFrom } from "../../lib/window-focus";
import { when, when24 } from "../../lib/time-words";
import { useClockForm } from "../../store/clock-form";
import { useRecordNotes } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePivotStore } from "../../store/pivot";
import { usePlayhead } from "../../store/playhead";
import { MID } from "./record-window";

const FOCUS = "outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent";
const ROW = `flex h-[30px] w-full flex-col justify-center border border-panel-border-strong px-1.5 text-left hover:bg-text/10 ${FOCUS}`;
const ADD = `border border-panel-border-strong px-2 py-1 text-left font-mono text-[10px] text-text hover:bg-text/10 disabled:opacity-40 ${FOCUS}`;
// The same button as the Add and Cancel of the Fail category's typing row (CategoryList.tsx).
const EDIT = `h-[22px] self-start border border-panel-border-strong px-2 font-mono text-[9px] uppercase tracking-[0.12em] text-text hover:bg-text/10 ${FOCUS}`;
// The list and quote looks of the note body, as the Inspector's note rows draw them (components/notes/
// noteInspector.tsx, the body's wrapper): the body element draws no class of its own, so the parent sets
// them. A twin, not an import: that file is another piece's and exports a component only.
const BODY_LOOK =
  "[&_p]:my-0 [&_ul]:my-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_blockquote]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-panel-border-strong [&_blockquote]:pl-2 [&_blockquote]:text-muted";
const REGION = `flex flex-col gap-1 break-words border border-t-0 border-panel-border-strong px-1.5 py-1 font-mono text-[10px] leading-[13px] text-text ${BODY_LOOK}`;
/** A note whose colour is not a slot name draws the neutral grey, as the note window does. */
const FALLBACK = "var(--text-faint-on-panel)";

interface Props {
  record: RecordRef;
  lookup: RecordLookup;
}

interface RowProps {
  note: Note;
  lookup: RecordLookup;
  clock: (t: number) => string;
}

/** One note of the record: the row, and, while it is open, the body and "Edit the note." under it. */
function NoteRow({ note, lookup, clock }: RowProps) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const label = noteLabel(note);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((o) => !o)}
        {...tip(markTip({ category: note.category, label, time: clock(note.time), decision: "none", link: null }))}
        className={ROW}
      >
        <span className="flex items-center gap-1 font-mono text-[9px] leading-[11px] text-muted">
          <span data-swatch className="h-[7px] w-[7px] shrink-0" style={{ background: colourCss(note.colour) ?? FALLBACK }} />
          <span className="truncate">{`${clock(note.time)} ${MID} ${note.category}`}</span>
        </span>
        {open ? null : <span className="truncate font-mono text-[10px] leading-[13px] text-text">{label}</span>}
      </button>
      {open ? (
        <div id={regionId} className={REGION}>
          <div>
            <NoteBody body={note.body} />
          </div>
          <button
            type="button"
            onClick={(e) => openSavedNote(note, lookup, windowPlaceNear(e.clientX))}
            {...tip([BUTTONS.edit])}
            className={EDIT}
          >
            {BUTTONS.edit}
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function RecordNotes({ record, lookup }: Props) {
  const notes = useRecordNotes(record);
  const scenario = useNotesStore((s) => s.scenario);
  const h24 = useClockForm((s) => s.h24);
  const clock = h24 ? when24 : when;

  // A note made here takes the record's own time (the playhead when the record has none) and opens right
  // of the record's window, beside its door; the button is remembered so the window's own close returns focus.
  function add(e: MouseEvent<HTMLButtonElement>): void {
    if (scenario === null) return;
    const button = e.currentTarget;
    const frame = button.closest<HTMLElement>("[data-window-frame]");
    const time = noteTimeFor(lookup(record), usePlayhead.getState().playhead);
    const id = usePivotStore.getState().openNote({ seed: { scenario, time, link: record } }, placeNoteWindow((frame ?? button).getBoundingClientRect(), "right"));
    noteOpenedFrom(id, button);
  }

  return (
    <div className="flex flex-col gap-1">
      {notes.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {notes.map((n) => (
            <NoteRow key={n.id} note={n} lookup={lookup} clock={clock} />
          ))}
        </ul>
      ) : null}
      <button type="button" aria-label={ADD_ON_RECORD.name} disabled={scenario === null} onClick={add} {...tip([ADD_ON_RECORD.name])} className={ADD}>
        {ADD_ON_RECORD.visible}
      </button>
    </div>
  );
}
