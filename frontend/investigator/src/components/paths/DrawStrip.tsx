/**
 * The drawing strip: the one control of drawing mode. A square box under the menu group, placed by the rule
 * `stripLayout`, in the menus' material, that shows while a path is being drawn (the draft of the path
 * session). Left to right: the lens, the path's name, the stops as chips, then Add stop, Done and Cancel.
 * Past four stops the strip shows "+N" for the first stops and the last three chips. Cancel with stops asks
 * Discard or Keep drawing.
 *
 * The strip reads the band of index.css `.path-strip-band` and the title card when a size changes, never on
 * a frame. It stays between them, centred under the menu group where it fits. A chip that cannot show 8
 * characters of its words shows its number and cross, its words staying in its tooltip. When the chips as
 * numbers do not fit, the name gives way (it stays in the strip's tooltip and its accessible name). Then
 * the strip's right edge stays 8 px clear of the Inspector and it reaches left: to the Narrative panel,
 * then over its top edge.
 *
 * A stop is added from the SELECTED record: the strip reads the selection and the case lookup and never
 * moves the playhead, the camera or the selection. It refuses a record with no time (or one the data
 * does not hold), one already in the draft and the 51st, and says which in the button's tooltip. A button
 * that is not available is `aria-disabled` and coloured faint, never faded and never natively disabled, so
 * its tooltip still shows the reason; the press is ignored in code. While the save runs all three buttons
 * are unavailable. A refused save keeps the strip and shows "Not saved" with its reason.
 *
 * The strip is mounted whether or not a draft is open and draws nothing without one. When a draft opens
 * the strip's group takes the focus (which closes the Paths menu the New path button sat in); when a path
 * is saved or the draft is dropped, `returnFocus` puts the focus back on the Paths button.
 *
 * What this file does not do: draw the draft on the globe or the Timeline (the surfaces do), hold the
 * draft (the path session does) or save it (the marks store does). No key ends the draft.
 *
 * LIMIT (the group wrapper): `Panel` forwards no ref and takes no width, so the group role, the name, the
 * focus target and the placement sit on a wrapper div and the Panel sits inside it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { MarkGlyph } from "../marks/glyphs";
import { Eyebrow, Panel } from "../ui";
import { tip } from "../ui/Tip";
import { linkFromSelected } from "../notes/record-lookup";
import { kindLabelOf } from "./path-lookup";
import { usePathSession } from "./path-session";
import { MARK_LIMITS, canonicalKind, recordKey, type RecordRef } from "../../lib/marks/types";
import {
  PATH_WORDS,
  chipTip,
  drawingName,
  hiddenChips,
  hiddenLabel,
  recordWords,
  removeStopName,
} from "../../lib/tooltip-words/paths";
import { useCaseLookup } from "../../store/marks";
import { useSchema } from "../../store/schema";
import { useSelection } from "../../store/selection";

/** The multiplication sign on a chip's remove button, from its code point (this file holds plain ASCII). */
const TIMES_SIGN = String.fromCodePoint(0xd7);
/** More stops than this show "+N" for the first ones and then the last three chips. */
const CHIPS_SHOWN_WHOLE = 4;
const CHIPS_SHOWN_PAST = 3;

const FOCUS = "outline-none focus-visible:ring-1 focus-visible:ring-signal";
const HAIRLINE = "1px solid var(--hairline)";
const BUTTON = `h-[22px] shrink-0 whitespace-nowrap px-2 font-mono text-[9px] uppercase tracking-[0.12em] ${FOCUS}`;
const STRIP_BOX = "absolute top-full z-40 mt-2 w-max max-w-[560px] outline-none";
const CENTRED = "left-1/2 -translate-x-1/2";

/** One character of a chip's words in the app's mono face: 6.325 px. */
const WORD_CHAR_PX = 6.325;
/** One figure of a chip's number in the app's mono face: 5.6925 px, rounded up. */
const NUMBER_CHAR_PX = 5.7;
/** A chip without its number or words: two 1px borders, 6px of left padding, 2px of right padding, the 4px gap before the cross and the 14px cross. */
const CHIP_FLOOR_PX = 28;
/** The 4px gap: between two chips, before a chip's words, and after the folded count. */
const CHIP_GAP_PX = 4;
/** The widest words a chip draws: 96px. */
const WORDS_MAX_PX = 96;
/** The room that counts as at least 8 characters of words: the ceiling of 8 characters at 6.325 px, which is 51 px. */
const WORDS_MIN_PX = Math.ceil(8 * WORD_CHAR_PX);
/** The widest the strip is: 560px. */
const STRIP_MAX_PX = 560;
/** The 8px gap after the name. */
const NAME_GAP_PX = 8;
/** The widest the name is: 120px. */
const NAME_MAX_PX = 120;
/** The strip's clearance from the title card: 8px (the band keeps its own from the panels). */
const CLEAR_PX = 8;
/** One px for readings that come in whole px (the title card's offsets, the name's scroll width). */
const ROUNDING_PX = 1;
/** The name's box once the name has given way: it stays in the page so its scroll width still gives the name's width, and the negative margin takes back the gap after it. */
const NAME_GIVES_WAY: CSSProperties = { maxWidth: "0px", marginRight: -NAME_GAP_PX, visibility: "hidden" };

/** What the strip reads from the page, in the menu group's own px (0 is the group's left edge). */
export interface StripRoom {
  /** The band's edges (index.css .path-strip-band): 8px clear of the Narrative panel, and of the Inspector while it is open. */
  left: number;
  right: number;
  /** The menu group's centre. */
  centre: number;
  /** The title card's right edge, with ROUNDING_PX added; null when there is none. */
  titleRight: number | null;
  /** The strip without its chips row, its name and the name's gap: padding, lens, gaps, the status and the buttons. */
  parts: number;
  /** The name's own width, at most NAME_MAX_PX. */
  name: number;
}
/** A chip as the rule sees it. */
export interface ChipIn {
  /** The stop's number, from 1. */
  n: number;
  /** How many characters its words hold (code points). */
  chars: number;
}
/** A chip's words: "whole" (drawn as today), a width in whole px (cut to it), or null (its number and cross alone). */
export type ChipWords = "whole" | number | null;
/** Where the strip stands: centred under the menu group, or its left or right edge at a CSS offset in px. */
export type StripPlace = { side: "centre" } | { side: "left"; left: number } | { side: "right"; right: number };
export interface StripLayout {
  /** The path's name shows. */
  name: boolean;
  /** One entry for each chip, in the order given. */
  words: ChipWords[];
  place: StripPlace;
}

const natural = (c: ChipIn): number => Math.min(WORDS_MAX_PX, c.chars * WORD_CHAR_PX);
/** A chip of 8 or more characters needs 51 px of words; a shorter one needs all of its words. */
const need = (c: ChipIn): number => Math.min(natural(c), WORDS_MIN_PX);
const chipFloor = (c: ChipIn): number => CHIP_FLOOR_PX + String(c.n).length * NUMBER_CHAR_PX;
const round = (v: number): number => Math.round(v * 100) / 100;

/** The level L at which the chips' words share `space`: each takes the lesser of its natural width and L. */
function level(naturals: readonly number[], space: number): number {
  if (space <= 0) return 0;
  const sorted = [...naturals].sort((a, b) => a - b);
  if (sorted.reduce((sum, v) => sum + v, 0) <= space) return Infinity;
  let rest = space;
  for (let i = 0; i < sorted.length; i++) {
    const share = rest / (sorted.length - i);
    if (sorted[i] > share) return share;
    rest -= sorted[i];
  }
  return Infinity;
}

/** The words each chip gets from `room` (its words and the gaps before them), the earliest chips dropping to a number first. */
function chipWords(room: number, chips: readonly ChipIn[]): ChipWords[] {
  let shown = chips.filter((c) => c.chars > 0);
  for (;;) {
    const l = level(shown.map(natural), room - shown.length * CHIP_GAP_PX);
    const given = (c: ChipIn): number => Math.min(natural(c), l);
    const short = shown.filter((c) => given(c) < need(c));
    if (short.length === 0) {
      return chips.map((c) => (!shown.includes(c) ? null : given(c) >= natural(c) ? "whole" : Math.floor(given(c))));
    }
    const lowest = short.reduce((a, b) => (b.n < a.n ? b : a));
    shown = shown.filter((c) => c !== lowest);
  }
}

/**
 * Where the strip stands and what it shows, from the page's reading: it stays inside the band, centred under
 * the menu group where it fits there. First the chips' words shrink (a chip shows words from 8 characters,
 * else its number and cross); then the name gives way, the chips taking the room that is left; then the strip
 * is anchored at the Inspector's clearance and reaches left, closer than 8 px to the Narrative panel and the
 * title card, and last over the Narrative panel's top edge. The buttons never shrink or wrap. `lead` is the
 * folded count's width with its gap, or 0. Pure: no state, store, clock or element.
 */
// eslint-disable-next-line react-refresh/only-export-components -- a pure rule kept beside the one strip that renders its result
export function stripLayout(room: StripRoom, chips: readonly ChipIn[], lead: number): StripLayout {
  const left = room.titleRight === null ? room.left : Math.max(room.left, room.titleRight + CLEAR_PX);
  const right = room.right;
  // The rounding px is charged against the band only, never against the 560 cap.
  const limit = Math.min(STRIP_MAX_PX, right - left - ROUNDING_PX);
  const floors = lead + chips.reduce((sum, c) => sum + chipFloor(c), 0) + Math.max(0, chips.length - 1) * CHIP_GAP_PX;
  const nameSlot = room.name + NAME_GAP_PX;
  const place = (width: number): StripPlace =>
    room.centre - width / 2 >= left && room.centre + width / 2 <= right
      ? { side: "centre" }
      : room.centre + width / 2 > right
        ? { side: "right", right: round(2 * room.centre - right) }
        : { side: "left", left: round(left) };
  const spent = (words: readonly ChipWords[]): number =>
    chips.reduce((sum, c, k) => {
      const w = words[k];
      return sum + (w === null ? 0 : CHIP_GAP_PX + (w === "whole" ? natural(c) : w));
    }, 0);

  // Step 1: the name shows and the chips' words shrink.
  const cap = limit - room.parts - nameSlot - floors;
  if (cap >= 0) {
    const words = chipWords(cap, chips);
    return { name: true, words, place: place(room.parts + nameSlot + floors + spent(words) + ROUNDING_PX) };
  }
  // Step 2: the name gives way, and the chips take the room that is left with it gone.
  const cap2 = limit - room.parts - floors;
  if (cap2 >= 0) {
    const words = chipWords(cap2, chips);
    return { name: false, words, place: place(room.parts + floors + spent(words) + ROUNDING_PX) };
  }
  // Step 3: closer than 8 px to the panels, then over the Narrative panel's top edge. The right edge stays at
  // the band's right bound, 8 px clear of the Inspector, and the strip reaches left as far as its width takes it.
  return { name: false, words: chips.map(() => null), place: { side: "right", right: round(2 * room.centre - right) } };
}

const px = (el: Element, prop: "width" | "left" | "right"): number => parseFloat(getComputedStyle(el)[prop]);
const hundredth = (v: number): number => Math.round(v * 100) / 100;
/** The strip's reading of the page, in the chrome's own px (computed styles and offsets, never a rect); null before layout. */
function readRoom(band: HTMLElement, menu: HTMLElement, title: HTMLElement | null, group: HTMLElement, row: HTMLElement, nameBox: HTMLElement): StripRoom | null {
  const menuWidth = px(menu, "width");
  const groupWidth = px(group, "width");
  const bandLeft = px(band, "left");
  const bandRight = px(band, "right");
  if (![menuWidth, groupWidth, bandLeft, bandRight].every(Number.isFinite) || menuWidth <= 0 || groupWidth <= 0) return null;
  const nameWidth = px(nameBox, "width") || 0;
  // The name's width: as drawn while it shows (a fraction), its scroll width only once it has given way.
  return {
    left: hundredth(bandLeft),
    right: hundredth(menuWidth - bandRight),
    centre: hundredth(menuWidth / 2),
    titleRight: title === null ? null : title.offsetLeft + title.offsetWidth - menu.offsetLeft + ROUNDING_PX,
    parts: hundredth(groupWidth - px(row, "width") - (nameWidth > 0 ? nameWidth + NAME_GAP_PX : 0)),
    name: hundredth(nameWidth > 0 ? nameWidth : Math.min(NAME_MAX_PX, nameBox.scrollWidth)),
  };
}
function sameRoom(a: StripRoom | null, b: StripRoom | null): boolean {
  if (a === null || b === null) return a === b;
  return a.left === b.left && a.right === b.right && a.centre === b.centre && a.titleRight === b.titleRight && a.parts === b.parts && a.name === b.name;
}

export function DrawStrip({ returnFocus, room }: { returnFocus: () => void; room?: StripRoom }): ReactElement | null {
  const draft = usePathSession((s) => s.draft);
  const addStop = usePathSession((s) => s.addStop);
  const removeStop = usePathSession((s) => s.removeStop);
  const ask = usePathSession((s) => s.ask);
  const keep = usePathSession((s) => s.keep);
  const discard = usePathSession((s) => s.discard);
  const finish = usePathSession((s) => s.finish);
  const selected = useSelection((s) => s.selected);
  const nodes = useSchema((s) => s.nodes);
  const lookup = useCaseLookup();

  const group = useRef<HTMLDivElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);
  const keepButton = useRef<HTMLButtonElement | null>(null);
  const wasAsking = useRef(false);

  const open = draft !== null;
  const asking = draft?.asking ?? false;

  // A draft opening moves the focus into the strip, out of the menu button that started it.
  useEffect(() => {
    if (open) group.current?.focus();
  }, [open]);

  // The buttons swap when Cancel asks; the pressed one is gone, so the focus follows to the safe answer
  // (Keep drawing), and comes back to Cancel when the drawing goes on.
  useEffect(() => {
    if (asking) keepButton.current?.focus();
    else if (wasAsking.current) cancelButton.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  const band = useRef<HTMLDivElement | null>(null);
  const row = useRef<HTMLDivElement | null>(null);
  const nameBox = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<StripRoom | null>(null);
  // The page is read when the strip opens and again only when a watched box changes size, never on a frame.
  useLayoutEffect(() => {
    const b = band.current;
    const g = group.current;
    const r = row.current;
    const n = nameBox.current;
    const menu = b?.parentElement ?? null;
    if (room !== undefined || !open || !b || !g || !r || !n || !menu || typeof ResizeObserver === "undefined") return;
    const title = menu.parentElement?.querySelector<HTMLElement>(":scope > .col-start-1") ?? null;
    const read = (): void => {
      const next = readRoom(b, menu, title, g, r, n);
      setMeasured((was) => (sameRoom(was, next) ? was : next));
    };
    read();
    const observer = new ResizeObserver(read);
    for (const el of title === null ? [b, menu, g] : [b, menu, g, title]) observer.observe(el);
    return () => observer.disconnect();
  }, [room, open]);

  if (draft === null) return null;

  const stops = draft.stops;
  const words = (r: RecordRef): string => {
    const info = lookup(r);
    return info === null ? PATH_WORDS.labels.recordNotFound : recordWords(kindLabelOf(nodes, info.draw.kind), info.headline);
  };

  // The selected record as a stop would hold it, and why it cannot be added, in the order the words list them.
  const link = linkFromSelected(selected);
  const record: RecordRef | null = link === null ? null : { kind: canonicalKind(link.kind), id: link.id };
  const info = record === null ? null : lookup(record);
  const addWhy =
    record === null
      ? PATH_WORDS.tips.noSelection
      : info === null || info.time === null
        ? PATH_WORDS.tips.noTime
        : stops.some((s) => recordKey(s) === recordKey(record))
          ? PATH_WORDS.tips.alreadyStop
          : stops.length >= MARK_LIMITS.stopsMax
            ? PATH_WORDS.tips.fullPath
            : null;
  const addTip = addWhy === null && record !== null ? [PATH_WORDS.tips.addStop, words(record)] : [addWhy];

  const hiddenCount = stops.length > CHIPS_SHOWN_WHOLE ? stops.length - CHIPS_SHOWN_PAST : 0;
  const chipStops = stops.map((s, i) => ({ s, i })).slice(hiddenCount);
  const headline = (r: RecordRef): string => lookup(r)?.headline ?? PATH_WORDS.labels.recordNotFound;
  const lead = hiddenCount > 0 ? hiddenLabel(hiddenCount).length * WORD_CHAR_PX + CHIP_GAP_PX : 0;
  const reading = room ?? measured;
  const layout =
    reading === null
      ? null
      : stripLayout(
          reading,
          chipStops.map(({ s, i }) => ({ n: i + 1, chars: [...headline(s)].length })),
          lead,
        );
  const place: StripPlace = layout === null ? { side: "centre" } : layout.place;
  const doneWhy = stops.length < MARK_LIMITS.stopsMin ? PATH_WORDS.tips.needsTwo : null;
  const busy = draft.saving;

  function press(): void {
    if (addWhy !== null || busy || record === null) return;
    addStop(record);
  }

  async function done(): Promise<void> {
    if (doneWhy !== null || busy) return;
    const answer = await finish();
    if (answer.ok) returnFocus();
  }

  function cancel(): void {
    if (busy) return;
    if (stops.length === 0) {
      discard();
      returnFocus();
    } else ask();
  }

  function drop(): void {
    discard();
    returnFocus();
  }

  const plain = (why: string | null): { color: string } => ({ color: why !== null || busy ? "var(--text-faint)" : "var(--text)" });

  return (
    <>
    <div ref={band} aria-hidden="true" data-path-strip-band className="path-strip-band" />
    <div
      ref={group}
      role="group"
      aria-label={drawingName(draft.name)}
      tabIndex={-1}
      className={place.side === "centre" ? `${STRIP_BOX} ${CENTRED}` : STRIP_BOX}
      style={place.side === "left" ? { left: place.left } : place.side === "right" ? { right: place.right } : undefined}
    >
      <Panel material="instrument" className="!rounded-none">
        <div className="flex h-[34px] items-center gap-2 px-2.5" {...tip([drawingName(draft.name)])}>
          <span aria-hidden="true" className="inline-flex shrink-0" style={{ color: "var(--text)" }}>
            <MarkGlyph name="lens" />
          </span>
          <div ref={nameBox} className="max-w-[120px] shrink-0 truncate" style={layout === null || layout.name ? undefined : NAME_GIVES_WAY}>
            <Eyebrow tone="text">{draft.name}</Eyebrow>
          </div>

          <div ref={row} className="flex min-w-0 items-center gap-1">
            {hiddenCount > 0 ? (
              <span
                {...tip(hiddenChips(stops.slice(0, hiddenCount).map(words)))}
                className="shrink-0 font-mono text-[10px] tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {hiddenLabel(hiddenCount)}
              </span>
            ) : null}
            {chipStops.map(({ s, i }, k) => {
              const shown: ChipWords = layout === null ? "whole" : layout.words[k];
              return (
              <div
                key={recordKey(s)}
                data-chip={i + 1}
                {...tip(chipTip(i + 1, words(s)))}
                className="flex h-[20px] min-w-0 shrink items-center gap-1 pl-1.5 pr-0.5"
                style={{ border: HAIRLINE }}
              >
                <span className="shrink-0 font-mono text-[9px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                  {i + 1}
                </span>
                {shown === null ? null : (
                <span
                  className="min-w-0 max-w-[96px] truncate font-mono text-[10px]"
                  style={shown === "whole" ? { color: "var(--text-muted)" } : { color: "var(--text-muted)", maxWidth: shown }}
                >
                  {headline(s)}
                </span>
                )}
                <button
                  type="button"
                  aria-label={removeStopName(i + 1)}
                  onClick={() => removeStop(i)}
                  {...tip([PATH_WORDS.tips.removeStop])}
                  className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center font-mono text-[10px] hover:text-text ${FOCUS}`}
                  style={{ color: "var(--text-faint)" }}
                >
                  {TIMES_SIGN}
                </button>
              </div>
              );
            })}
          </div>

          {draft.refused !== null ? (
            <span
              role="status"
              {...tip([draft.refused === "limit_reached" ? PATH_WORDS.tips.limit : PATH_WORDS.tips.notSavedPath])}
              className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em]"
              style={{ color: "var(--text-muted)" }}
            >
              {PATH_WORDS.labels.notSaved}
            </span>
          ) : null}

          {asking ? (
            <>
              <button
                type="button"
                onClick={drop}
                {...tip([PATH_WORDS.tips.discard])}
                className={`${BUTTON} hover:bg-text/10`}
                style={{ border: HAIRLINE, color: "var(--text)" }}
              >
                {PATH_WORDS.labels.discard}
              </button>
              <button
                ref={keepButton}
                type="button"
                onClick={keep}
                {...tip([PATH_WORDS.tips.keepDrawing])}
                className={`${BUTTON} hover:bg-text/10`}
                style={{ border: HAIRLINE, color: "var(--text)" }}
              >
                {PATH_WORDS.labels.keepDrawing}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                aria-disabled={addWhy !== null || busy}
                onClick={press}
                {...tip(addTip)}
                className={BUTTON}
                style={{ border: HAIRLINE, ...plain(addWhy) }}
              >
                {PATH_WORDS.labels.addStop}
              </button>
              <button
                type="button"
                aria-disabled={doneWhy !== null || busy}
                onClick={() => void done()}
                {...tip([doneWhy ?? PATH_WORDS.tips.done])}
                className={BUTTON}
                style={{ border: HAIRLINE, ...plain(doneWhy) }}
              >
                {PATH_WORDS.labels.done}
              </button>
              <button
                ref={cancelButton}
                type="button"
                aria-disabled={busy}
                onClick={cancel}
                {...tip([PATH_WORDS.tips.cancel])}
                className={BUTTON}
                style={{ border: HAIRLINE, ...plain(null) }}
              >
                {PATH_WORDS.labels.cancel}
              </button>
            </>
          )}
        </div>
      </Panel>
    </div>
    </>
  );
}
