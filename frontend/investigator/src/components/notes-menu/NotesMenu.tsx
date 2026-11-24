/**
 * The Notes menu (design section 3): a button in the top row beside Layers and Paths, and a
 * dialog with "Add a note", Your marks (the records the investigator marked, when there are any),
 * the list of this scenario's notes, "Save notes to a file." and "Load notes from a file.". Every
 * sentence is from tooltip-words/notes.ts (M1 to M8) or, for Your marks, tooltip-words/your-marks.ts.
 * The menu's scroller shows the foot shade while more lies below (`footCue`). Each
 * control's visible text is part of its accessible name (WCAG 2.5.3).
 *
 * The menu holds no note data of its own: the list is the notes store, a row opens a saved note
 * through the same `navigate` path as its marks, and "Add a note" opens a draft window under its
 * button, at the playhead's time, linked to the selected record when there is one (a selected note is
 * never a link target). The file buttons call lib/notes-io/file.ts; their answers are the design's sentences.
 */
import { useRef, useState, type ChangeEvent, type MouseEvent, type ReactElement } from "react";
import { TopMenu } from "../TopMenu";
import { YourMarks } from "../record-window/YourMarks";
import { openSavedNote, placeNoteWindow, windowPlaceNear } from "../notes/open-note";
import { noteOpenedFrom } from "../../lib/window-focus";
import { linkFromSelected, type RecordLookup } from "../notes/record-lookup";
import { tip } from "../ui/Tip";
import { currentTransport } from "../../lib/notes-io/session";
import { loadNotesFile, saveNotesFile, type FileOutcome } from "../../lib/notes-io/file";
import { IS_STATIC_BUILD } from "../../lib/build-flags";
import { noteLabel } from "../../lib/notes/body";
import { when, when24 } from "../../lib/time-words";
import {
  ADD_ROW,
  EMPTY_LINES,
  LIST_NAME,
  LOAD_FILE,
  MENU_BUTTON,
  SAVE_FILE,
  STATIC_LINES,
  STATUS,
  addRowValueLines,
  markTip,
} from "../../lib/tooltip-words/notes";
import { useClockForm } from "../../store/clock-form";
import { useNotesStore } from "../../store/notes";
import { usePivotStore } from "../../store/pivot";
import { usePlayhead } from "../../store/playhead";
import { useSelection } from "../../store/selection";

const FOCUS = "outline-none focus-visible:ring-1 focus-visible:ring-signal";
const BUTTON = `rounded-sm border border-panel-border-strong px-2 py-1 text-left font-mono text-[10px] text-text hover:bg-text/10 disabled:opacity-40 ${FOCUS}`;

function NotesMenuBody({ lookup }: { lookup: RecordLookup }): ReactElement {
  const notes = useNotesStore((s) => s.notes);
  const scenario = useNotesStore((s) => s.scenario);
  const playhead = usePlayhead((s) => s.playhead);
  const selected = useSelection((s) => s.selected);
  const h24 = useClockForm((s) => s.h24);
  const [result, setResult] = useState<FileOutcome | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const clock = h24 ? when24 : when;
  const link = linkFromSelected(selected);
  const info = link ? lookup(link) : null;
  const linkLine = link ? { kind: link.kind, headline: info?.headline ?? link.id } : null;

  // The draft opens under the Add button, clamped on screen, at the playhead's time (the Notes menu keeps
  // the playhead; the record's own time is for a note made from a record). The opener kept is the
  // top-row trigger: the dialog closes when focus moves into the new window's editor, so the button
  // pressed here would be gone when the window gives focus back.
  function add(e: MouseEvent<HTMLButtonElement>): void {
    const s = useNotesStore.getState().scenario;
    if (s === null) return;
    const button = e.currentTarget;
    const at = linkFromSelected(useSelection.getState().selected);
    const id = usePivotStore
      .getState()
      .openNote({ seed: { scenario: s, time: Math.round(usePlayhead.getState().playhead), link: at } }, placeNoteWindow(button.getBoundingClientRect(), "below"));
    noteOpenedFrom(id, button.closest('[role="dialog"]')?.parentElement?.querySelector<HTMLElement>('[aria-haspopup="dialog"]') ?? null);
  }

  function deps() {
    const transport = currentTransport();
    const s = useNotesStore.getState().scenario;
    return transport && s ? { transport, scenario: s, store: useNotesStore } : null;
  }

  async function save(): Promise<void> {
    const d = deps();
    setResult(d ? await saveNotesFile(d) : { ok: false, message: STATUS.noAnswer });
  }

  async function load(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again
    if (!file) return;
    const d = deps();
    setResult(d ? await loadNotesFile(file, d) : { ok: false, message: STATUS.noAnswer });
  }

  return (
    <div className="flex flex-col gap-2 font-mono text-[10px] text-text">
      <div className="flex flex-col gap-1">
        <button type="button" aria-label={ADD_ROW.name} disabled={scenario === null} onClick={add} {...tip([ADD_ROW.name])} className={BUTTON}>
          {ADD_ROW.visible}
        </button>
        <div className="flex flex-col text-[9px] leading-[13px] text-muted">
          {addRowValueLines(clock(Math.round(playhead)), linkLine).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </div>

      <YourMarks lookup={lookup} />

      {notes.length === 0 ? (
        <div className="flex flex-col text-[9px] leading-[13px] text-muted">
          {EMPTY_LINES.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : (
        <ul aria-label={LIST_NAME} className="m-0 flex list-none flex-col gap-0.5 p-0">
          {notes.map((n) => {
            const label = noteLabel(n);
            const record = n.link ? lookup(n.link) : null;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={(e) => openSavedNote(n, lookup, windowPlaceNear(e.clientX))}
                  // D6: a linked note shares its record's mark, so its tooltip carries no PASS or FAIL of its own.
                  {...tip(
                    markTip({
                      category: n.category,
                      label,
                      time: clock(n.time),
                      decision: n.link === null ? n.decision : "none",
                      link: record ? { kind: record.kind, headline: record.headline } : null,
                    }),
                  )}
                  className={`${BUTTON} block w-full truncate`}
                >
                  {`${clock(n.time)} · ${n.category} · ${label}`}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {IS_STATIC_BUILD ? (
        <div className="flex flex-col text-[9px] leading-[13px] text-muted">
          {STATIC_LINES.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <button type="button" onClick={() => void save()} {...tip([SAVE_FILE.tip])} className={BUTTON}>
          {SAVE_FILE.name}
        </button>
        <button type="button" onClick={() => input.current?.click()} {...tip([LOAD_FILE.tip])} className={BUTTON}>
          {LOAD_FILE.name}
        </button>
        <input ref={input} type="file" accept=".json,application/json" tabIndex={-1} aria-hidden="true" className="hidden" onChange={(e) => void load(e)} />
      </div>

      <div role="status" aria-live="polite" className={`min-h-[13px] text-[9px] leading-[13px] ${result && !result.ok ? "text-[color:var(--alarm-on-panel)]" : "text-muted"}`}>
        {result?.message ?? ""}
      </div>
    </div>
  );
}

export function NotesMenu({ lookup }: { lookup: RecordLookup }): ReactElement {
  return (
    <TopMenu label={MENU_BUTTON} width="wide" footCue>
      <NotesMenuBody lookup={lookup} />
    </TopMenu>
  );
}
