/**
 * The note window: the existing WindowFrame (draggable, foldable, pinnable, closed by its x only),
 * and inside it, top to bottom: six colour swatches; the category list and "Add a category";
 * the PASS or FAIL group; the format buttons; the text; the card data hint; the link line; Save
 * and Delete; the status line. Every sentence is from tooltip-words/notes.ts.
 *
 * A draft is not stored and has no mark until Save. The window keeps what the person has set in
 * its own state, and reads the text back from the editor only through `saveVerdict`, which judges
 * every run as closed. It reports `dirty` to the workspace store, and closes through it: a close
 * pressed while dirty is kept, and the status line asks Save, Discard or Cancel.
 *
 * Every new note closes on its first good Save, linked to a record or not; a saved note stays open
 * after Save. A Save that fails closes nothing and moves no focus. Every close of the window's own (that
 * Save, Discard, the question's Save, Delete) gives focus back to the control that opened it
 * (`returnNoteFocus`).
 *
 * A note's colour is a slot name. It becomes a style only through the fixed table (`colourCss`),
 * and a value the table does not know draws the neutral grey.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WindowFrame } from "../pivot/WindowFrame";
import { NoteEditor } from "./NoteEditor";
import { ColourSwatches, DecisionGroup, FormatBar } from "./NoteControls";
import type { EditorHandle, EditorSnapshot } from "./editor-snapshot";
import { bodySignature } from "./editor";
import { saveVerdict, type RefusalCode } from "./editor-guard";
import { lookupFromContext } from "./record-lookup";
import { kindLabelOf } from "../record-window/record-window";
import { tip } from "../ui/Tip";
import { usePivotStore, type NoteWindowState } from "../../store/pivot";
import { useNotesStore } from "../../store/notes";
import { useClockForm } from "../../store/clock-form";
import { useSchema } from "../../store/schema";
import { canonicalKind } from "../../lib/marks/types";
import { returnNoteFocus } from "../../lib/window-focus";
import { IS_STATIC_BUILD } from "../../lib/build-flags";
import { when, when24 } from "../../lib/time-words";
import type { PivotContext } from "../../lib/matches";
import { charCount, emptyBody } from "../../lib/notes/body";
import { categoryExists, categoryList, normalizeCategoryName } from "../../lib/notes/categories";
import { colourCss } from "../../lib/notes/colours";
import { refusesText } from "../../lib/notes/guard";
import { LIMITS, type ColourSlot, type Decision, type Note, type NoteErrorCode, type NoteLink } from "../../lib/notes/types";
import { BUTTONS, CATEGORY, CATEGORY_ADD, CATEGORY_FIELD_BUTTONS, CLOSE, DELETE, HINT, LINK, SAVE_TIP, STATUS, noteWindowName } from "../../lib/tooltip-words/notes";

const FALLBACK = "var(--text-faint-on-panel)";
const FOCUS = "outline-none focus-visible:ring-1 focus-visible:ring-signal";
const BUTTON = `h-6 rounded-sm border border-panel-border-strong px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-text hover:bg-text/10 ${FOCUS}`;

interface Props {
  window: NoteWindowState;
  context: PivotContext;
  screenPos?: { x: number; y: number };
  dimmed?: boolean;
  /** Unused: a note window is never flagged to a node. Given by the layer with the others. */
  onToggleFlag?: () => void;
  onDragTo?: (x: number, y: number) => void;
}

type Message = keyof typeof STATUS | null;

const sameLink = (a: NoteLink | null, b: NoteLink | null): boolean => (a === null || b === null ? a === b : a.kind === b.kind && a.id === b.id);

/** The status sentence for a refusal code from the store or the guard. */
function messageFor(code: NoteErrorCode): keyof typeof STATUS {
  switch (code) {
    case "card_number":
      return "card";
    case "too_long":
      return "tooLong";
    case "backing_failed":
      return "noAnswer";
    case "limit_reached":
      return "limit";
    default:
      return "refused";
  }
}

interface Fields {
  colour: string;
  category: string;
  decision: Decision;
  link: NoteLink | null;
}

const fieldsOf = (note: Note | null, seedLink: NoteLink | null): Fields => ({
  colour: note?.colour ?? "r1",
  category: note?.category ?? "Note",
  decision: note?.decision ?? "none",
  link: note ? note.link : seedLink,
});

export function NoteWindow({ window: w, context, screenPos, dimmed, onDragTo }: Props) {
  const note = useNotesStore((s) => (w.noteId ? (s.notes.find((n) => n.id === w.noteId) ?? null) : null));
  const customCategories = useNotesStore((s) => s.customCategories);
  const allNotes = useNotesStore((s) => s.notes);
  const create = useNotesStore((s) => s.create);
  const update = useNotesStore((s) => s.update);
  const remove = useNotesStore((s) => s.remove);
  const addCategory = useNotesStore((s) => s.addCategory);
  const setNoteDirty = usePivotStore((s) => s.setNoteDirty);
  const cancelNoteClose = usePivotStore((s) => s.cancelNoteClose);
  const discardNote = usePivotStore((s) => s.discardNote);
  const bindNote = usePivotStore((s) => s.bindNote);
  const h24 = useClockForm((s) => s.h24);
  const nodes = useSchema((s) => s.nodes);

  // Every new note closes on its first good Save, linked to a record or not. A saved note keeps Save as it
  // was and stays open. Read at the press: the store's answer binds the window to the new note.
  const closesOnSave = note === null;

  // What the person has set. The body lives in the editor's own state. `from` is the store's note the
  // window last took its copy from or wrote; `copy` counts the copies taken, and the editor starts
  // again on each.
  const [initial, setInitial] = useState<{ from: Note | null; copy: number; fields: Fields; body: unknown }>(() => ({
    from: note,
    copy: 0,
    fields: fieldsOf(note, w.seed?.link ?? null),
    body: note?.body ?? emptyBody(),
  }));
  const [colour, setColour] = useState<string>(initial.fields.colour);
  const [category, setCategory] = useState(initial.fields.category);
  const [decision, setDecision] = useState<Decision>(initial.fields.decision);
  const [link, setLink] = useState<NoteLink | null>(initial.fields.link);
  const [base, setBase] = useState<Fields>(initial.fields);
  const [baseSig, setBaseSig] = useState<string | null>(null);
  const [snap, setSnap] = useState<EditorSnapshot | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [blurNumber, setBlurNumber] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const [catName, setCatName] = useState("");
  const [catError, setCatError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const handle = useRef<EditorHandle | null>(null);
  const promptSave = useRef<HTMLButtonElement | null>(null);

  const fieldsDirty = colour !== base.colour || category !== base.category || decision !== base.decision || !sameLink(link, base.link);
  const dirty = fieldsDirty || (snap !== null && baseSig !== null && snap.signature !== baseSig);

  // A loaded notes file puts a new copy of the note in the store. While the window holds no change of
  // its own and no Save of its own is in flight, it takes that copy, so its Save cannot write the old
  // text back over the loaded one.
  if (note && note !== initial.from && !dirty && !saving) {
    const fields = fieldsOf(note, null);
    setInitial({ from: note, copy: initial.copy + 1, fields, body: note.body });
    setColour(fields.colour);
    setCategory(fields.category);
    setDecision(fields.decision);
    setLink(fields.link);
    setBase(fields);
    setBaseSig(null);
    setSnap(null);
    setMessage(null);
    setBlurNumber(false);
  }
  useEffect(() => {
    setNoteDirty(w.id, dirty);
  }, [dirty, w.id, setNoteDirty]);

  // A note deleted elsewhere closes its window.
  useEffect(() => {
    if (w.noteId && !note) discardNote(w.id);
  }, [w.noteId, note, w.id, discardNote]);

  // The close was pressed with changes: the window keeps focus, in the question.
  useEffect(() => {
    if (w.closeAsked) promptSave.current?.focus();
  }, [w.closeAsked]);

  const lookup = useMemo(() => lookupFromContext(context), [context]);
  const info = link ? lookup(link) : null;
  const categories = useMemo(() => {
    const list = categoryList(customCategories, allNotes);
    return categoryExists(list, category) ? list : [...list, category];
  }, [customCategories, allNotes, category]);

  const time = (h24 ? when24 : when)(note?.time ?? w.seed?.time ?? 0);
  const accent = colourCss(colour) ?? FALLBACK;
  const pos = screenPos ?? { x: w.anchor.x, y: w.anchor.y };

  const onChange = useCallback((s: EditorSnapshot) => {
    setSnap(s);
    setBaseSig((prev) => prev ?? s.signature);
    setMessage(null);
    setBlurNumber(false);
  }, []);
  const onRefuse = useCallback((code: RefusalCode) => {
    if (code === "card_number") setMessage("card");
    else if (code === "too_long") setMessage("tooLong");
  }, []);
  const onBlur = useCallback((s: EditorSnapshot) => setBlurNumber(s.holdsNumberClosed), []);

  // True when the store took the note and the editor still holds the text that was sent, so a caller
  // may close the window. A Save pressed while one of this window's is in flight does nothing.
  const save = useCallback(async (): Promise<boolean> => {
    const h = handle.current;
    if (!h || saving) return false;
    const verdict = saveVerdict(h.getState());
    if (!verdict.ok) {
      setMessage(messageFor(verdict.code));
      return false;
    }
    const fields = { link, colour, category, decision, body: verdict.body };
    let pending;
    if (note) pending = update(note.id, fields);
    else if (w.seed) pending = create({ scenario: w.seed.scenario, time: w.seed.time, ...fields });
    else return false;
    const sent = bodySignature(h.getState().doc);
    setSaving(true);
    const r = await pending;
    setSaving(false);
    if (!r.ok) {
      setMessage(messageFor(r.code));
      return false;
    }
    if (!note) bindNote(w.id, r.value.id);
    setInitial((i) => ({ ...i, from: r.value }));
    setBase({ colour, category, decision, link });
    setBaseSig(sent);
    setBlurNumber(false);
    const unchanged = bodySignature(h.getState().doc) === sent;
    setMessage(unchanged ? (IS_STATIC_BUILD ? "savedVisit" : "saved") : null);
    return unchanged;
  }, [saving, link, colour, category, decision, note, w.seed, w.id, update, create, bindNote]);

  // The Save button and Ctrl+Enter. Whether this press closes the window is read when it is pressed,
  // before the store answers; a refused Save closes nothing and moves no focus.
  const saveFromButton = useCallback(async (): Promise<void> => {
    const closes = closesOnSave;
    if ((await save()) && closes) {
      discardNote(w.id);
      returnNoteFocus(w.id);
    }
  }, [save, closesOnSave, discardNote, w.id]);

  async function onDelete() {
    if (!note) return;
    const r = await remove(note.id);
    if (r.ok) {
      discardNote(w.id);
      returnNoteFocus(w.id);
    } else {
      setConfirmingDelete(false);
      setMessage(messageFor(r.code));
    }
  }

  const normalizedName = normalizeCategoryName(catName);
  const catLiveError =
    normalizedName === ""
      ? null
      : charCount(normalizedName) > LIMITS.categoryChars
        ? CATEGORY_ADD.tooLong
        : refusesText(normalizedName)
          ? CATEGORY_ADD.card
          : categoryExists(categories, normalizedName)
            ? CATEGORY_ADD.exists
            : null;

  async function onAddCategory() {
    if (normalizedName === "" || catLiveError) return;
    const r = await addCategory(catName);
    if (r.ok) {
      setCategory(r.value);
      setAdding(false);
      setCatName("");
      setCatError(null);
    } else {
      setCatError(r.code === "category_exists" ? CATEGORY_ADD.exists : r.code === "card_number" ? CATEGORY_ADD.card : r.code === "too_long" ? CATEGORY_ADD.tooLong : STATUS[messageFor(r.code)]);
    }
  }

  const statusText = message
    ? STATUS[message]
    : snap?.holdsNumber || blurNumber
      ? STATUS.card
      : dirty
        ? STATUS.unsaved
        : "";

  return (
    <WindowFrame
      id={w.id}
      title={noteWindowName(time)}
      anchorScreen={pos}
      z={w.z}
      accent={accent}
      pinned={w.pinned}
      collapsed={w.collapsed}
      flagged={false}
      canFlag={false}
      dimmed={dimmed}
      onDragTo={onDragTo}
      wide
    >
      <div className="flex w-[274px] max-w-full flex-col gap-2 pt-1.5 font-mono text-[10px] text-text">
        <ColourSwatches
          value={colour}
          onChange={(c: ColourSlot) => {
            setColour(c);
            setMessage(null);
          }}
        />

        <div className="flex items-center gap-1.5">
          <label htmlFor={`note-category-${w.id}`} className="text-[9px] uppercase tracking-[0.14em] text-muted">
            {CATEGORY.name}
          </label>
          <select
            id={`note-category-${w.id}`}
            value={category}
            {...tip(CATEGORY.tip)}
            onChange={(e) => {
              setCategory(e.target.value);
              setMessage(null);
            }}
            className={`h-6 min-w-0 flex-1 rounded-sm border border-panel-border-strong bg-[rgb(var(--panel-floor)/0.6)] px-1 font-mono text-[10px] text-text ${FOCUS}`}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={CATEGORY_ADD.name}
            onClick={() => setAdding(true)}
            className={`flex h-6 w-6 items-center justify-center rounded-sm border border-panel-border-strong text-text hover:bg-text/10 ${FOCUS}`}
          >
            <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>

        {adding ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              {/* Outside any form. No form history, no spell check: a typed name goes nowhere else. */}
              <input
                type="text"
                aria-label={CATEGORY_ADD.field}
                value={catName}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setCatName(e.target.value);
                  setCatError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onAddCategory();
                  }
                }}
                className={`h-6 min-w-0 flex-1 rounded-sm border border-panel-border-strong bg-[rgb(var(--panel-floor)/0.6)] px-1 font-mono text-[10px] text-text ${FOCUS}`}
              />
              <button type="button" onClick={() => void onAddCategory()} className={BUTTON}>
                {CATEGORY_FIELD_BUTTONS.add}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setCatName("");
                  setCatError(null);
                }}
                className={BUTTON}
              >
                {CATEGORY_FIELD_BUTTONS.cancel}
              </button>
            </div>
            {catLiveError || catError ? (
              <div role="status" aria-live="polite" className="text-[9px] text-[color:var(--alarm-on-panel)]">
                {catLiveError ?? catError}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* D6: a note linked to a record shares that record's mark, so it has no PASS or FAIL of its own.
            The row follows the window's live link (Remove the link brings it back), and a linked note's
            stored decision is sent unchanged when it is saved. */}
        {link === null ? (
          <DecisionGroup
            value={decision}
            colour={accent}
            onChange={(d) => {
              setDecision(d);
              setMessage(null);
            }}
          />
        ) : null}

        <FormatBar active={snap?.active ?? null} enabled={snap?.enabled ?? null} onRun={(k) => handle.current?.run(k)} />
        <NoteEditor key={initial.copy} initialBody={initial.body} autoFocus={initial.copy === 0} handleRef={handle} onChange={onChange} onRefuse={onRefuse} onSave={() => void saveFromButton()} onBlur={onBlur} />

        <div {...tip(HINT.tip)} className="flex flex-col text-[9px] leading-[13px] text-muted">
          {HINT.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>

        {link ? (
          <div className="flex items-center gap-1 text-[9px]">
            <span className="min-w-0 flex-1 break-words">{info ? LINK.line(kindLabelOf(canonicalKind(info.kind), nodes), info.headline) : LINK.missing}</span>
            <button
              type="button"
              aria-label={LINK.remove.name}
              {...tip(LINK.remove.tip)}
              onClick={() => {
                setLink(null);
                setMessage(null);
              }}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted hover:text-text ${FOCUS}`}
            >
              <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
        ) : null}

        {confirmingDelete ? (
          <div role="group" aria-label={DELETE.ask} className="flex flex-col gap-1">
            <span className="text-[9px]">{DELETE.ask}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => void onDelete()} className={BUTTON}>
                {DELETE.confirm}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className={BUTTON}>
                {DELETE.keep}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1">
            <button type="button" onClick={() => void saveFromButton()} {...tip([closesOnSave ? SAVE_TIP.draft : SAVE_TIP.saved])} className={BUTTON}>
              {BUTTONS.save}
            </button>
            {note ? (
              <button type="button" onClick={() => setConfirmingDelete(true)} className={BUTTON}>
                {BUTTONS.delete}
              </button>
            ) : null}
          </div>
        )}

        {w.closeAsked ? (
          <div role="group" aria-label={CLOSE.ask} className="flex flex-col gap-1 border-t border-panel-border pt-1.5">
            <span className="text-[9px]">{CLOSE.ask}</span>
            <div className="flex gap-1">
              <button
                ref={promptSave}
                type="button"
                onClick={async () => {
                  if (await save()) {
                    discardNote(w.id);
                    returnNoteFocus(w.id);
                  }
                }}
                className={BUTTON}
              >
                {CLOSE.save}
              </button>
              <button
                type="button"
                onClick={() => {
                  discardNote(w.id);
                  returnNoteFocus(w.id);
                }}
                className={BUTTON}
              >
                {CLOSE.discard}
              </button>
              <button
                type="button"
                onClick={() => {
                  cancelNoteClose(w.id);
                  handle.current?.focus();
                }}
                className={BUTTON}
              >
                {CLOSE.cancel}
              </button>
            </div>
          </div>
        ) : null}

        <div role="status" aria-live="polite" data-note-status className="min-h-[13px] text-[9px] leading-[13px] text-muted">
          {statusText}
        </div>
      </div>
    </WindowFrame>
  );
}
