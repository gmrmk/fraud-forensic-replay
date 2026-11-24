/**
 * Several marks that touch under the Timeline's track, as one plate: a button that hangs at the first
 * mark's time and holds the pile's face (the lens, the multiplication sign with the number of records,
 * one glyph for each decision the marks carry, the pin). A press unfolds the marks as a column of full
 * single plates under it, one row each, and a second press, or Escape, folds them again. A press on a
 * member opens that record's window, folds the pile and leaves keyboard focus on the pile button; the
 * window returns focus there when it closes.
 *
 * The layer decides which marks make a pile (`trackLayout`) and builds every word; this file draws what
 * it is given. Whether the pile is unfolded is the layer's state, handed in as `unfolded` with the
 * callbacks that change it: nothing is stored here and no clock is read.
 *
 * What this file does not do: it holds no words, no store, no rule of which marks join, and no
 * right-click behaviour (a pile holds several records, so it has no door of its own). The button's
 * placement and classes are a twin of `TimelineMark`'s (a `.tsx` exports components only, so the two
 * cannot share the constants). It exports a component only (the refresh rule).
 */
import { memo, useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { tip } from "../ui/Tip";
import { popoutOpened } from "../../lib/window-focus";
import { GLYPH_ORIGIN_PX, PLATE_PAD_PX, ROW_STEP_PX, timelineLeft } from "./geometry";
import type { PileFace } from "./mark-piles";
import { MarkPlate } from "./MarkPlate";
import { TimelineMark } from "./TimelineMark";
import type { Disposition } from "../../lib/marks/types";

/** The hit box's least side, in px: the twin of `TimelineMark`'s (and the note diamond's 14 px). */
const HIT_PX = 14;

interface TimelinePileMember {
  recordKey: string;
  name: string;
  lines: readonly string[];
  notes: number;
  disposition: Disposition;
  pinned: boolean;
  dim: boolean;
  open: boolean;
}

export interface TimelinePileProps {
  /** `pile:` and the first mark's key. */
  pileKey: string;
  /** The first mark's place on the track, in percent. */
  pct: number;
  /** The pile plate's width in px (`pileWidth`): where the track holds it whole. */
  width: number;
  face: PileFace;
  /** The accessible name (`pileName`). */
  name: string;
  /** The tooltip lines (`pileTip`). */
  lines: readonly string[];
  /** The column's members in `memberOrder`. */
  members: readonly TimelinePileMember[];
  unfolded: boolean;
  onToggle: (pileKey: string) => void;
  /** Fold the pile (a member press, Escape). */
  onFold: (pileKey: string) => void;
  /** Open the member's record window; the id of the window, or null when none could be opened. */
  onMemberOpen: (recordKey: string, clientX: number) => string | null;
}

const sameLines = (a: readonly string[], b: readonly string[]): boolean => a === b || a.join("\n") === b.join("\n");

function sameFace(a: PileFace, b: PileFace): boolean {
  return (
    a.records === b.records &&
    a.pinned === b.pinned &&
    a.dim === b.dim &&
    a.open === b.open &&
    a.glyphs.length === b.glyphs.length &&
    a.glyphs.every((g, i) => g.disposition === b.glyphs[i].disposition && g.dim === b.glyphs[i].dim)
  );
}

function sameMembers(a: TimelinePileProps["members"], b: TimelinePileProps["members"]): boolean {
  return (
    a === b ||
    (a.length === b.length &&
      a.every((m, i) => {
        const n = b[i];
        return (
          m.recordKey === n.recordKey &&
          m.name === n.name &&
          sameLines(m.lines, n.lines) &&
          m.notes === n.notes &&
          m.disposition === n.disposition &&
          m.pinned === n.pinned &&
          m.dim === n.dim &&
          m.open === n.open
        );
      }))
  );
}

/** The layer rebuilds the face, the members and the lines every tick: compare them by value. */
function same(a: TimelinePileProps, b: TimelinePileProps): boolean {
  return (
    a.pileKey === b.pileKey &&
    a.pct === b.pct &&
    a.width === b.width &&
    a.name === b.name &&
    a.unfolded === b.unfolded &&
    sameLines(a.lines, b.lines) &&
    sameFace(a.face, b.face) &&
    sameMembers(a.members, b.members) &&
    a.onToggle === b.onToggle &&
    a.onFold === b.onFold &&
    a.onMemberOpen === b.onMemberOpen
  );
}

export const TimelinePile = memo(function TimelinePile(props: TimelinePileProps) {
  const { pileKey, pct, width, face, name, lines, members, unfolded, onToggle, onFold } = props;
  const pile = useRef<HTMLButtonElement | null>(null);
  // One stable callback serves every member, so a tick re-renders only a member whose own state changed.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const openMember = useCallback((recordKey: string, clientX: number) => {
    const cur = latest.current;
    const button = pile.current;
    const id = cur.onMemberOpen(recordKey, clientX);
    // Focus goes to the pile before the fold takes the member's button off the page.
    button?.focus();
    cur.onFold(cur.pileKey);
    // A window that was already open is only raised: a focus request filed for it would be taken on its next mount.
    const wasOpen = cur.members.find((m) => m.recordKey === recordKey)?.open ?? false;
    if (id !== null && !wasOpen && button) popoutOpened(id, button);
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    // Escape and no other key; the key is not held back, so the tooltip layer and a menu still hear it.
    if (e.key !== "Escape" || !unfolded) return;
    onFold(pileKey);
    pile.current?.focus();
  };
  return (
    <div data-mark-pile-group={pileKey} className="contents" onKeyDown={onKeyDown}>
      <button
        ref={pile}
        type="button"
        data-mark-pile={pileKey}
        data-open={face.open || undefined}
        aria-expanded={unfolded}
        aria-label={name}
        {...tip(lines)}
        // A press on a pile is not a press on the track: it must not seek or start a scrub.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(pileKey);
        }}
        // The same placement and classes as `TimelineMark`'s button (see the header).
        className="pointer-events-auto absolute z-[8] flex items-start cursor-pointer border-none bg-transparent p-0 outline-none hover:z-10 focus-visible:ring-1 focus-visible:ring-signal"
        style={{
          ["--mark-x" as string]: timelineLeft(pct, width),
          left: "var(--mark-x)",
          top: "100%",
          paddingTop: PLATE_PAD_PX,
          minWidth: HIT_PX,
          minHeight: HIT_PX,
          transform: `translateX(-${GLYPH_ORIGIN_PX}px)`,
        }}
      >
        <MarkPlate lens notes={0} disposition="none" pinned={face.pinned} dim={face.dim} open={face.open} pile={{ records: face.records, glyphs: face.glyphs }} />
      </button>
      {unfolded &&
        members.map((m, i) => (
          <TimelineMark
            key={m.recordKey}
            recordKey={m.recordKey}
            pct={pct}
            name={m.name}
            lines={m.lines}
            notes={m.notes}
            disposition={m.disposition}
            pinned={m.pinned}
            dim={m.dim}
            open={m.open}
            rowPx={ROW_STEP_PX * (i + 1)}
            lifted
            onOpen={openMember}
          />
        ))}
    </div>
  );
}, same);
