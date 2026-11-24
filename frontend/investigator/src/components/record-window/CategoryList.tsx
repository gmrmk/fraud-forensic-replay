// frontend/investigator/src/components/record-window/CategoryList.tsx
// The Fail category of the record's own window, shown while the record's mark is FAIL: a row with a
// label and a trigger that holds the chosen category, and under it, when unfolded, ONE list: the story's
// own failing words (the outcome of each FAIL decision in the data), then the categories the
// investigator typed, then a last row "Type a category". A press on a row sets the category, a press on
// the chosen row clears it. "Type a category" turns the list into a field with Add and Cancel.
//
// The list unfolds in the window's own flow, never as an overlay: the window clips its body, and
// growing is how it holds more. Escape does nothing here (the app's law); Tab and Shift Tab move
// between the rows, Enter and Space press one.
//
// What this file does not do: it keeps no copy of the list or of the category (the marks store holds
// them), reads no clock and no browser storage, and names no field of any story (the words come from
// the decisions the manifest maps). Limit: the typed names are shared by every story and none can be
// removed (no route removes one, as for note categories).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MarkGlyph, BUTTON_GLYPH_PX } from "../marks/glyphs";
import { tip } from "../ui/Tip";
import { charCount } from "../../lib/notes/body";
import { categoryExists, normalizeCategoryName, sameCategory } from "../../lib/notes/categories";
import { refusesText } from "../../lib/notes/guard";
import { LIMITS, type NoteErrorCode } from "../../lib/notes/types";
import { failWords } from "../../lib/marks/select";
import type { RecordRef } from "../../lib/marks/types";
import { overlaysOf } from "../../lib/verdicts";
import { CATEGORY_ADD, CATEGORY_FIELD_BUTTONS } from "../../lib/tooltip-words/notes";
import {
  ADD_TIP,
  CANCEL_TIP,
  CHOSEN_TIP,
  FAIL_CATEGORY,
  FIELD_TIP,
  NONE_CHOSEN,
  STATUS,
  STORY_WORD_TIP,
  TYPED_TIP,
  TYPE_ROW,
} from "../../lib/tooltip-words/record-window";
import { useFailCategories, useMarksStore } from "../../store/marks";
import { usePivotData } from "../../store/pivot-data";
import { useSchema } from "../../store/schema";
import { statusWord } from "./record-window";

const FOCUS = "outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent";
const ROW = `flex h-[22px] w-full items-center gap-1 border border-panel-border-strong px-1.5 text-left font-mono text-[10px] text-text hover:bg-text/10 disabled:opacity-40 ${FOCUS}`;
const BUTTON = `h-[22px] border border-panel-border-strong px-2 font-mono text-[9px] uppercase tracking-[0.12em] text-text hover:bg-text/10 disabled:opacity-40 ${FOCUS}`;
const FIELD = `h-[22px] min-w-0 flex-1 border border-panel-border-strong bg-[rgb(var(--panel-floor)/0.6)] px-1 font-mono text-[10px] text-text ${FOCUS}`;
/** The width of a check, kept empty on the rows that are not chosen so the words line up. */
const GLYPH_BOX = { width: BUTTON_GLYPH_PX, height: BUTTON_GLYPH_PX };

interface Props {
  record: RecordRef;
  /** The record's chosen category: the node's, or null. */
  value: string | null;
}

/** The line a refused store call shows: the field's own words where they exist, else the status words. */
function refusalLine(code: NoteErrorCode): string {
  if (code === "category_exists") return CATEGORY_ADD.exists;
  if (code === "card_number") return CATEGORY_ADD.card;
  if (code === "too_long") return CATEGORY_ADD.tooLong;
  if (code === "limit_reached") return STATUS.categoryLimit;
  return statusWord(code);
}

export function CategoryList({ record, value }: Props) {
  const items = useFailCategories();
  const entities = usePivotData((s) => s.entities);
  const schemaNodes = useSchema((s) => s.nodes);
  const scenario = useMarksStore((s) => s.scenario);
  const setCategory = useMarksStore((s) => s.setCategory);
  const addFailCategory = useMarksStore((s) => s.addFailCategory);

  // Where each row came from. The hook returns the merged list (the story's words win a name both
  // hold), so the story's words are read again here, from the same two sources, to tell the rows apart.
  const story = useMemo(() => failWords(overlaysOf(entities, schemaNodes)), [entities, schemaNodes]);

  const uid = useId();
  const labelId = `${uid}-label`;
  const triggerId = `${uid}-trigger`;
  const listId = `${uid}-list`;
  const trigger = useRef<HTMLButtonElement | null>(null);

  const field = useRef<HTMLInputElement | null>(null);
  const sending = useRef(false);

  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");
  const [line, setLine] = useState<string | null>(null);

  // The field takes focus when it opens: the press that opened it was on a row that is gone.
  useEffect(() => {
    if (typing) field.current?.focus();
  }, [typing]);

  // The refusals the page knows before it sends anything, against the list as shown (the story's words
  // and the typed ones), so "fraud" is refused beside the story's "FRAUD".
  const normalized = normalizeCategoryName(name);
  const liveError =
    normalized === ""
      ? null
      : charCount(normalized) > LIMITS.categoryChars
        ? CATEGORY_ADD.tooLong
        : refusesText(normalized)
          ? CATEGORY_ADD.card
          : categoryExists(items, normalized)
            ? CATEGORY_ADD.exists
            : null;
  const blocked = normalized === "" || liveError !== null;
  const shownLine = liveError ?? line;

  function fold(): void {
    setOpen(false);
    setTyping(false);
    setName("");
    setLine(null);
    trigger.current?.focus();
  }

  function closeField(): void {
    setTyping(false);
    setName("");
    setLine(null);
    trigger.current?.focus();
  }

  async function add(): Promise<void> {
    // One Add in flight: a second Enter before the answer would send the name twice, and the second
    // refusal would read as a dead backend although the name was kept.
    if (blocked || sending.current) return;
    sending.current = true;
    const named = await addFailCategory(name);
    if (!named.ok) {
      sending.current = false;
      setLine(refusalLine(named.code));
      return;
    }
    const chosen = await setCategory(record, named.value);
    sending.current = false;
    // The name is kept on the list even when choosing it was refused; the line says why.
    if (chosen.ok) fold();
    else {
      setTyping(false);
      setName("");
      setLine(statusWord(chosen.code));
    }
  }

  async function choose(name: string): Promise<void> {
    const chosen = value !== null && sameCategory(value, name);
    const r = await setCategory(record, chosen ? null : name);
    if (r.ok) fold();
    else setLine(statusWord(r.code));
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span id={labelId} className="text-[9px] uppercase tracking-[0.14em] text-muted">
          {FAIL_CATEGORY.name}
        </span>
        <button
          ref={trigger}
          id={triggerId}
          type="button"
          aria-expanded={open}
          aria-controls={open && !typing ? listId : undefined}
          aria-labelledby={`${labelId} ${triggerId}`}
          onClick={() => {
            setOpen(!open);
            setTyping(false);
            setName("");
            setLine(null);
          }}
          {...tip([FAIL_CATEGORY.tip])}
          className={`flex h-[22px] min-w-0 flex-1 items-center justify-between gap-1 border border-panel-border-strong px-1.5 font-mono text-[10px] text-text hover:bg-text/10 ${FOCUS}`}
        >
          <span className="truncate">{value ?? NONE_CHOSEN}</span>
          <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 shrink-0">
            <path d={open ? "M2.5 7.5L6 4l3.5 3.5" : "M2.5 4.5L6 8l3.5-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>

      {open && !typing ? (
        <ul
          id={listId}
          aria-label={FAIL_CATEGORY.name}
          className="m-0 flex max-h-[176px] list-none flex-col overflow-y-auto p-0 [&>li+li]:-mt-px"
        >
          {items.map((name) => {
            const chosen = value !== null && sameCategory(value, name);
            const fromStory = categoryExists(story, name);
            return (
              <li key={name}>
                <button
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => void choose(name)}
                  {...tip([chosen ? CHOSEN_TIP : fromStory ? STORY_WORD_TIP : TYPED_TIP])}
                  className={ROW}
                >
                  {chosen ? <MarkGlyph name="check" size={BUTTON_GLYPH_PX} /> : <span aria-hidden="true" className="shrink-0" style={GLYPH_BOX} />}
                  <span className="truncate">{name}</span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              disabled={scenario === null}
              onClick={() => {
                setTyping(true);
                setLine(null);
              }}
              {...tip([TYPE_ROW.tip])}
              className={ROW}
            >
              <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 shrink-0">
                <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              <span className="truncate">{TYPE_ROW.name}</span>
            </button>
          </li>
        </ul>
      ) : null}

      {open && typing ? (
        <div className="flex items-center gap-1">
          {/* Outside any form. No form history, no spell check: a typed name goes nowhere else. */}
          <input
            ref={field}
            type="text"
            aria-label={CATEGORY_ADD.field}
            value={name}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setName(e.target.value);
              setLine(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            {...tip([FIELD_TIP])}
            className={FIELD}
          />
          <button type="button" disabled={blocked} onClick={() => void add()} {...tip([ADD_TIP])} className={BUTTON}>
            {CATEGORY_FIELD_BUTTONS.add}
          </button>
          <button type="button" onClick={closeField} {...tip([CANCEL_TIP])} className={BUTTON}>
            {CATEGORY_FIELD_BUTTONS.cancel}
          </button>
        </div>
      ) : null}

      {shownLine ? (
        <div role="status" aria-live="polite" className="text-[9px] leading-[13px] text-[color:var(--alarm-on-panel)]">
          {shownLine}
        </div>
      ) : null}
    </div>
  );
}
