/**
 * One investigator's mark under the Timeline's track: a button that hangs below the track's bottom
 * edge at the record's time and holds the plate (lens, count, disposition glyph, pin). The lens is
 * centred on the record's time; the plate is held whole inside both ends of the track (`timelineLeft`).
 * The layer builds every prop once for a view, so a playhead tick re-renders only a mark whose own
 * state changed (the comparator reads the tooltip lines by their text and the callback by identity;
 * the layer keeps the callback stable).
 *
 * The Timeline plate always leads with the lens, so there is no `lens` prop and the plate's left edge
 * sits `GLYPH_ORIGIN_PX` before the anchor. A press opens the record's window and is not a press on
 * the track: it starts no scrub.
 *
 * What this file does not do: it holds no words (the layer passes the name and the lines), no store
 * and no clock, and it draws the globe's plate nowhere (that is `GlobeMarks`). It exports a component
 * only (the refresh rule).
 */
import { memo } from "react";
import { tip } from "../ui/Tip";
import { GLYPH_ORIGIN_PX, PLATE_PAD_PX, plateWidth, timelineLeft } from "./geometry";
import { MarkPlate } from "./MarkPlate";
import type { Disposition } from "../../lib/marks/types";

/** The hit box's least side, in px (the note diamond's 14 px). */
const HIT_PX = 14;

interface Props {
  /** `recordKey` of the record; handed back to `onOpen` so one stable callback serves every mark. */
  recordKey: string;
  /** The record's place on the track, in percent. */
  pct: number;
  /** The accessible name. */
  name: string;
  /** The tooltip lines. */
  lines: readonly string[];
  notes: number;
  disposition: Disposition;
  pinned: boolean;
  /** The record is ahead of the playhead: contents dim, the pin does not. */
  dim: boolean;
  /** The record's window is open: the plate inverts. */
  open: boolean;
  /**
   * How far below the first row the button hangs, in px: 0 or absent is the first row (top 100%),
   * and a member of an unfolded pile takes a step for each place in its column.
   */
  rowPx?: number;
  /** A member of an unfolded column: it stacks above the first row's plates and the page's labels. */
  lifted?: boolean;
  onOpen: (recordKey: string, clientX: number) => void;
}

const sameLines = (a: readonly string[], b: readonly string[]): boolean => a === b || a.join("\n") === b.join("\n");

function same(a: Props, b: Props): boolean {
  return (
    a.recordKey === b.recordKey &&
    a.pct === b.pct &&
    a.name === b.name &&
    sameLines(a.lines, b.lines) &&
    a.notes === b.notes &&
    a.disposition === b.disposition &&
    a.pinned === b.pinned &&
    a.dim === b.dim &&
    a.open === b.open &&
    (a.rowPx ?? 0) === (b.rowPx ?? 0) &&
    !!a.lifted === !!b.lifted &&
    a.onOpen === b.onOpen
  );
}

export const TimelineMark = memo(function TimelineMark({ recordKey, pct, name, lines, notes, disposition, pinned, dim, open, rowPx, lifted, onOpen }: Props) {
  const width = plateWidth({ lens: true, notes, disposition, pinned });
  return (
    <button
      type="button"
      data-mark={recordKey}
      data-open={open}
      aria-label={name}
      {...tip(lines)}
      // A press on a mark is not a press on the track: it must not seek or start a scrub.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(recordKey, e.clientX);
      }}
      // z 8 is above the lines and figures of the rows under the track (z 5 to 7), as the note diamond;
      // hover lifts it to 10. Both are classes: an inline z-index would beat the hover class.
      // A flex container, so the plate's top is the button's content top (a block's line box would
      // set the plate a few pixels off its edge); the host layer takes no pointer events, so the button takes its own.
      // A member of an unfolded pile is lifted to z 10, above the first row's plates (z 8) and the labels.
      className={`pointer-events-auto absolute ${lifted ? "z-10" : "z-[8]"} flex items-start cursor-pointer border-none bg-transparent p-0 outline-none hover:z-10 focus-visible:ring-1 focus-visible:ring-signal`}
      style={{
        // The clamp is carried in a custom property: the DOM the tests run in drops a clamp() written
        // straight to `left`, so the test could not read it back.
        ["--mark-x" as string]: timelineLeft(pct, width),
        left: "var(--mark-x)",
        // The button starts at the track's bottom edge; the plate hangs PLATE_PAD_PX below it.
        top: rowPx ? `calc(100% + ${rowPx}px)` : "100%",
        paddingTop: PLATE_PAD_PX,
        minWidth: HIT_PX,
        minHeight: HIT_PX,
        transform: `translateX(-${GLYPH_ORIGIN_PX}px)`,
      }}
    >
      <MarkPlate lens notes={notes} disposition={disposition} pinned={pinned} dim={dim} open={open} />
    </button>
  );
}, same);
