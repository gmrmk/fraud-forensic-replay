/**
 * Your paths: the block of the Paths menu that lists the investigator's saved paths. A heading made of
 * the lens and "Your paths", then one row for each path in seq order: a switch (the path drawn or not,
 * for this visit only, kept by the path session), its name, its stop count and a chevron that opens its
 * details. The details list the stops one line each, then Rename and Remove. Rename turns the name into
 * a field with Save and Cancel; Remove asks once, with Remove and Keep.
 *
 * The rows read the saved paths from the marks store and the stops through the case lookup, so a stop
 * reads as its record's words. Every write goes through the marks store (`updatePath`, `removePath`);
 * nothing here keeps a path of its own, a clock, or browser storage. While the pointer or the focus is
 * on a row, the path session marks that path as the chosen one (the surfaces draw the others dimmer);
 * the menu renders its children only while open, so closing it clears the choice on unmount.
 *
 * What this file does not do: draw a path on the globe or the Timeline, start a draft, or join the
 * pinned records (those are the surfaces' and the buttons'). A disabled Save is `aria-disabled` and
 * coloured faint, never faded and never natively disabled, so its tooltip still shows the reason, and
 * that tooltip follows the field at once while the pointer rests on Save (it stands where Rename stood).
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { MarkGlyph } from "../marks/glyphs";
import { Swatch, LayerSwitch } from "../LayerRow";
import { Eyebrow } from "../ui";
import { showTipOn, tip } from "../ui/Tip";
import { stopWords } from "./path-lookup";
import { usePathSession } from "./path-session";
import { pathStops, type PathStopView } from "../../lib/marks/select";
import { normalizeCategoryName, sameCategory } from "../../lib/notes/categories";
import type { RecordLookup } from "../notes/record-lookup";
import type { CustomPath } from "../../lib/marks/types";
import type { ShowInputs } from "../../lib/marks/draw";
import type { ScenarioNode } from "../../lib/scenarios";
import type { NoteErrorCode } from "../../lib/notes/types";
import {
  PATH_WORDS,
  moreStops,
  rowName,
  rowTip,
  stopLine,
  stopsCount,
  type Drawn,
} from "../../lib/tooltip-words/paths";
import { useCaseLookup, useMarksStore, useShowInputs } from "../../store/marks";
import { useSchema } from "../../store/schema";

/** The details region's padding: the 9 px square and its 8 px gap on the left, the count and chevron columns on the right, space below. Written out as the Layers menu's is. */
const DETAILS_INDENT = "pb-2.5 pl-[17px] pr-8";
/** How many stops a row's details list before they are counted. */
const LISTED_STOPS = 8;

const FOCUS = "outline-none focus-visible:ring-1 focus-visible:ring-signal";
const BUTTON = `h-[22px] px-2 font-mono text-[9px] uppercase tracking-[0.12em] hover:bg-text/10 ${FOCUS}`;
const HAIRLINE = "1px solid var(--hairline)";
const FIELD = `h-[22px] min-w-0 flex-1 px-1 font-mono text-[10px] text-text ${FOCUS}`;

/** The tooltip that names why a rename was refused. */
function renameReason(code: NoteErrorCode): string {
  if (code === "card_number") return PATH_WORDS.tips.cardNumber;
  if (code === "too_long") return PATH_WORDS.tips.nameTooLong;
  return PATH_WORDS.tips.nameOther;
}

/** Where a path is drawn, read from its stops as the surfaces draw them; null for a path switched off or with no drawn stop. */
function drawnOf(views: readonly PathStopView[], off: boolean): Drawn {
  if (off) return null;
  if (views.some((v) => v.onGlobe)) return "globe";
  if (views.some((v) => v.onTimeline)) return "timeline";
  return null;
}

type Mode = "idle" | "rename" | "ask";

interface RowProps {
  path: CustomPath;
  /** The case lookup, the switches and the manifest's kinds: read once by the block, shared by every row. */
  lookup: RecordLookup;
  show: ShowInputs;
  nodes: readonly ScenarioNode[];
}

function PathRow({ path, lookup, show, nodes }: RowProps): ReactElement {
  const paths = useMarksStore((s) => s.paths);
  const off = usePathSession((s) => s.hidden.includes(path.id));
  const toggleHidden = usePathSession((s) => s.toggleHidden);
  const choose = usePathSession((s) => s.choose);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [name, setName] = useState(path.name);
  /** The last refusal of Save or Remove, shown as "Not saved" or "Not removed". */
  const [refused, setRefused] = useState<NoteErrorCode | null>(null);
  const busy = useRef(false);
  const field = useRef<HTMLInputElement | null>(null);
  const details = useRef<HTMLDivElement | null>(null);
  const renameButton = useRef<HTMLButtonElement | null>(null);
  const removeButton = useRef<HTMLButtonElement | null>(null);
  /** The button the focus goes back to when the mode returns to idle. */
  const returnTo = useRef<"rename" | "remove" | null>(null);

  const views = useMemo(() => pathStops(path, lookup, show), [path, lookup, show]);
  const detailsId = `path-details-${path.id}`;

  useEffect(() => {
    if (mode === "rename") field.current?.focus();
    if (mode === "idle") {
      if (returnTo.current === "rename") renameButton.current?.focus();
      if (returnTo.current === "remove") removeButton.current?.focus();
      returnTo.current = null;
    }
  }, [mode]);

  const normalized = normalizeCategoryName(name);
  const taken = paths.some((p) => p.id !== path.id && sameCategory(p.name, normalized));
  const blockedTip = normalized === "" ? PATH_WORDS.tips.nameEmpty : taken ? PATH_WORDS.tips.nameTaken : null;

  const saveButton = useRef<HTMLButtonElement | null>(null);
  /** The pointer is on Save: set by its pointer over and out, and cleared when the field opens or closes. */
  const pointerOnSave = useRef(false);
  const saveTip = blockedTip ?? PATH_WORDS.tips.save;
  // The tooltip layer reads a control's words only when it shows them, so words that change under a
  // resting pointer stay stale. After the commit, while the pointer is on Save, show its words again.
  useEffect(() => {
    const el = saveButton.current;
    if (el !== null && pointerOnSave.current && el.getAttribute("data-tip") === saveTip) showTipOn(el);
  }, [saveTip]);

  function startRename(): void {
    pointerOnSave.current = false;
    setName(path.name);
    setRefused(null);
    setMode("rename");
  }

  function leave(back: "rename" | "remove"): void {
    pointerOnSave.current = false;
    returnTo.current = back;
    setRefused(null);
    setMode("idle");
    // The field or button that held the focus goes away without a blur the row would hear, so the choice is cleared here.
    choose(null);
  }

  async function save(): Promise<void> {
    if (blockedTip !== null || busy.current) return;
    busy.current = true;
    const answer = await useMarksStore.getState().updatePath(path.id, { name: normalized, stops: path.stops });
    busy.current = false;
    if (answer.ok) leave("rename");
    else setRefused(answer.code);
  }

  async function confirmRemove(): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    // The button that was pressed leaves with its row: the menu's dialog (it takes script focus) holds the focus after.
    const dialog = details.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    const answer = await useMarksStore.getState().removePath(path.id);
    busy.current = false;
    if (answer.ok) {
      usePathSession.getState().forget(path.id);
      dialog?.focus();
    } else setRefused(answer.code);
  }

  const shownStops = views.slice(0, LISTED_STOPS);

  return (
    <div className="flex flex-col">
      <div
        {...tip(rowTip(path.stops.length, drawnOf(views, off)))}
        onPointerEnter={() => choose(path.id)}
        onPointerLeave={() => choose(null)}
        onFocus={() => choose(path.id)}
        onBlur={(e) => {
          if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) choose(null);
        }}
      >
        {mode === "rename" ? (
          <div className="flex h-[26px] items-center gap-2">
            <Swatch on={!off} color="var(--text)" />
            <input
              ref={field}
              type="text"
              aria-label={PATH_WORDS.labels.pathName}
              value={name}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setName(e.target.value);
                setRefused(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
              {...tip([PATH_WORDS.tips.pathName])}
              className={FIELD}
              style={{ border: "1px solid var(--text)", background: "rgb(var(--panel-floor) / 0.6)", borderRadius: 0 }}
            />
          </div>
        ) : (
          <LayerSwitch
            label={path.name}
            name={rowName(path.name)}
            on={!off}
            onToggle={() => toggleHidden(path.id)}
            color="var(--text)"
            count={String(path.stops.length)}
            countSpoken={stopsCount(path.stops.length)}
            details={{ open, onToggle: () => setOpen((o) => !o), id: detailsId }}
          />
        )}
      </div>

      {open || mode !== "idle" ? (
        <div id={detailsId} ref={details} className={DETAILS_INDENT}>
          <ul className="m-0 flex list-none flex-col p-0 font-mono text-[10px] leading-[16px]">
            {shownStops.map((v) => {
              const words = stopWords(v, nodes);
              const missing = v.info === null;
              return (
                <li key={v.n} className="flex items-baseline gap-1.5">
                  <span className="shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {v.n}
                  </span>
                  <span
                    title={stopLine(v.n, words)}
                    className="min-w-0 truncate"
                    style={{ color: missing ? "var(--text-faint)" : "var(--text-muted)" }}
                  >
                    {words}
                  </span>
                </li>
              );
            })}
          </ul>
          {views.length > LISTED_STOPS ? (
            <div className="font-mono text-[10px] leading-[16px]" style={{ color: "var(--text-muted)" }}>
              {moreStops(views.length - LISTED_STOPS)}
            </div>
          ) : null}

          {mode === "ask" ? (
            <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--text)" }}>
              {PATH_WORDS.labels.removeAsk}
            </div>
          ) : null}
          <div className="mt-1.5 flex items-center gap-1.5">
            {mode === "idle" ? (
              <>
                <button
                  ref={renameButton}
                  type="button"
                  onClick={startRename}
                  {...tip([PATH_WORDS.tips.rename])}
                  className={BUTTON}
                  style={{ border: HAIRLINE, color: "var(--text)" }}
                >
                  {PATH_WORDS.labels.rename}
                </button>
                <button
                  ref={removeButton}
                  type="button"
                  onClick={() => {
                    setRefused(null);
                    setMode("ask");
                  }}
                  {...tip([PATH_WORDS.tips.remove])}
                  className={BUTTON}
                  style={{ border: HAIRLINE, color: "var(--text)" }}
                >
                  {PATH_WORDS.labels.remove}
                </button>
              </>
            ) : null}

            {mode === "rename" ? (
              <>
                <button
                  ref={saveButton}
                  type="button"
                  aria-disabled={blockedTip !== null}
                  onClick={() => void save()}
                  onPointerOver={() => {
                    pointerOnSave.current = true;
                  }}
                  onPointerOut={() => {
                    pointerOnSave.current = false;
                  }}
                  {...tip([saveTip])}
                  className={BUTTON}
                  style={{ border: HAIRLINE, color: blockedTip !== null ? "var(--text-faint)" : "var(--text)" }}
                >
                  {PATH_WORDS.labels.save}
                </button>
                <button
                  type="button"
                  onClick={() => leave("rename")}
                  {...tip([PATH_WORDS.tips.renameCancel])}
                  className={BUTTON}
                  style={{ border: HAIRLINE, color: "var(--text)" }}
                >
                  {PATH_WORDS.labels.renameCancel}
                </button>
                {refused !== null ? (
                  <span role="status" {...tip([renameReason(refused)])} className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    {PATH_WORDS.labels.notSaved}
                  </span>
                ) : null}
              </>
            ) : null}

            {mode === "ask" ? (
              <>
                <button
                  type="button"
                  onClick={() => void confirmRemove()}
                  {...tip([PATH_WORDS.tips.removeConfirm])}
                  className={BUTTON}
                  style={{ border: HAIRLINE, color: "var(--text)" }}
                >
                  {PATH_WORDS.labels.removeConfirm}
                </button>
                <button
                  type="button"
                  onClick={() => leave("remove")}
                  {...tip([PATH_WORDS.tips.keep])}
                  className={BUTTON}
                  style={{ border: HAIRLINE, color: "var(--text)" }}
                >
                  {PATH_WORDS.labels.keep}
                </button>
              </>
            ) : null}
          </div>
          {mode === "ask" && refused !== null ? (
            <div role="status" {...tip([PATH_WORDS.tips.notRemoved])} className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
              {PATH_WORDS.labels.notRemoved}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function YourPaths(): ReactElement | null {
  const paths = useMarksStore((s) => s.paths);
  const nodes = useSchema((s) => s.nodes);
  const lookup = useCaseLookup();
  const show = useShowInputs();
  const choose = usePathSession((s) => s.choose);
  // The Paths menu renders its children only while open, so it never sends a pointer leave on closing.
  useEffect(() => () => choose(null), [choose]);
  if (paths.length === 0) return null;
  return (
    <div className="flex flex-col">
      <div {...tip([PATH_WORDS.tips.heading])} className="flex h-[26px] items-center gap-2">
        <span aria-hidden="true" className="inline-flex shrink-0" style={{ color: "var(--text)" }}>
          <MarkGlyph name="lens" />
        </span>
        <Eyebrow as="h3" tone="muted">
          {PATH_WORDS.labels.heading}
        </Eyebrow>
      </div>
      {paths.map((p) => (
        <PathRow key={p.id} path={p} lookup={lookup} show={show} nodes={nodes} />
      ))}
    </div>
  );
}
