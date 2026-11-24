/**
 * The Timeline layer of marks. Under the track's bottom edge it hangs, in one list in time order:
 *
 *   - the investigator's mark of each marked record that has a time (`TimelineMark`: a plate with the
 *     lens, the count of the record's notes, the disposition glyph and the pin), drawn from the one
 *     function (`drawState`, through `useMarkViews`), so a record that is switched off, or ahead of the
 *     playhead and not pinned, follows the same rule as every other reader;
 *   - one filled diamond for a note with no record (a free note), with a 1 px panel-base outline, PASS
 *     with a check cut out of it, FAIL with a cross (M5 a);
 *   - one plain diamond, with no check or cross and no PASS or FAIL in its words, for a linked note
 *     whose record has no mark here: the record is not in the data, has no time, or is a place. A
 *     linked note whose record has a time is carried by that record's mark and draws no diamond.
 *
 * Marks whose plates would touch join one plate, a pile (`TimelinePile`): `trackLayout` sweeps them in
 * time order against the track's measured width, and a diamond that a plate of the first row would
 * touch hangs one row lower. Whether a pile is unfolded is this layer's state, one key, never stored.
 * Until the track has a width (no measure yet, or none possible) nothing piles.
 *
 * Mounted by Timeline.tsx beside the case layer. It reads the notes and marks stores and the playhead
 * through the model's hooks, so notes and marks stay out of eventTicks, counts, prominence, step keys,
 * rows, solo and day density. A press on a record's mark opens that record's window (beside the click
 * when the record has no place) and moves neither the playhead nor the selection; a press on a diamond
 * opens the note, as before.
 *
 * WHY UNDER THE EDGE. A note is made at the playhead and the playhead comes back to it, so the
 * mark stands where the playhead's line stands. Inside the track, or centred on its edge, it sat
 * on the foot of that line and read as a handle of the playhead. Under the edge, with a gap, it
 * shares no pixel with the track's line, its dots or its lanes, which all lie inside the track's
 * 32 px. The diamond's shape and place are one block of constants below (SIDE_PX, GAP_PX, GLYPH_PX) and
 * two in `geometry.ts` (DIAMOND_PX, NOTE_EDGE_PX, shared with the pile's rule for where a diamond hangs):
 * change them there; the record marks' are in `geometry.ts` too.
 *
 * Marks already taken on the track: circle (event), hollow dashed diamond (annotation), full-height
 * lettered line (the A and B marks), capsule (decision). A note is a filled, outlined diamond that
 * hangs below the track; the annotation's diamond is hollow, dashed and inside the track.
 *
 * The diamond's fill is the fixed table's value for the note's slot (`colourCss`); a value the table
 * does not know draws the neutral grey. The same table value is the tooltip's accent.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { tip } from "../ui/Tip";
import { GLYPH_PATHS } from "../marks/glyph-paths";
import { DIAMOND_PX, NOTE_EDGE_PX, ROW_STEP_PX } from "../marks/geometry";
import { memberOrder, trackLayout, type TrackMark, type TrackNote, type TrackPlate } from "../marks/mark-piles";
import type { MarkView } from "../marks/mark-views";
import { TimelineMark } from "../marks/TimelineMark";
import { TimelinePile } from "../marks/TimelinePile";
import { useMarkViews, useOpenRecordKeys } from "../marks/useMarkViews";
import { HIT_PX, freeNotes, plainNotes, timelineMarkWords } from "./note-marks";
import { openSavedNote, windowPlaceNear } from "./open-note";
import type { RecordLookup } from "./record-lookup";
import { openRecordWindow } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { useClockForm } from "../../store/clock-form";
import { colourCss } from "../../lib/notes/colours";
import { sortNotes } from "../../lib/notes/order";
import { markName, markTip, pileName, pileTip } from "../../lib/tooltip-words/marks";
import { when, when24 } from "../../lib/time-words";
import type { TimelineProjector } from "../../lib/timeline-projector";
import type { Note } from "../../lib/notes/types";

const FALLBACK = "var(--text-faint-on-panel)";
/** The lookup of a layer given none: no record is found. */
const NO_LOOKUP: RecordLookup = () => null;

/* The diamond's turned extent (DIAMOND_PX, 11 px: the old 9 px square's box plus 2 px, no more) and how far its
 * centre is held inside both ends of the track (NOTE_EDGE_PX, half the hit box) are in geometry.ts, so the
 * rule that hangs a diamond one row lower where a plate would touch it reads the drawn size. */
/** The turned square's side: the extent over the root of two, rounded down (7.7 x 1.414 = 10.89 px). */
const SIDE_PX = 7.7;
/** The clear gap between the track's bottom edge and the diamond's top point. */
const GAP_PX = 2;
/** The glyph's box inside the diamond (the check and the cross stay upright, not turned with it).
 *  9 px, the size it had in the square: its strokes reach 1.9 px from the centre on each axis, 3.9 px
 *  along a diamond's half-diagonal of 5.5, so they stay inside the fill. */
const GLYPH_PX = 9;

/** The cut-out: a check or a cross in the panel's own colour, so it reads as a hole in the square. */
export function Glyph({ decision, size }: { decision: "pass" | "fail"; size: number }) {
  return (
    <svg aria-hidden="true" data-decision-glyph={decision} viewBox="0 0 9 9" width={size} height={size} className="absolute inset-0">
      <path
        d={decision === "pass" ? GLYPH_PATHS.check : GLYPH_PATHS.cross}
        fill="none"
        stroke="rgb(var(--panel-base))"
        strokeWidth="1.3"
      />
    </svg>
  );
}

interface DiamondProps {
  note: Note;
  pct: number;
  lookup: RecordLookup | null;
  h24: boolean;
  /** A linked note carried by no record mark: a plain diamond, with none of the note's own PASS or FAIL. */
  plain: boolean;
  /** 1 when a plate of the first row would touch the diamond: it hangs one row (`ROW_STEP_PX`) lower. */
  row: 0 | 1;
}

const Diamond = memo(function Diamond({ note, pct, lookup, h24, plain, row }: DiamondProps) {
  const fill = colourCss(note.colour) ?? FALLBACK;
  // A linked note shows no PASS or FAIL of its own, in its drawing or in its words.
  const shown = plain ? { ...note, decision: "none" as const } : note;
  const words = timelineMarkWords(shown, (h24 ? when24 : when)(note.time), note.link && lookup ? lookup(note.link) : null);
  return (
    <button
      type="button"
      data-note-mark={note.id}
      aria-label={words.name}
      {...tip(words.lines, fill)}
      // A press on a mark is not a press on the track: it must not seek or start a scrub.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        openSavedNote(note, lookup, windowPlaceNear(e.clientX));
      }}
      className="pointer-events-auto absolute cursor-pointer border-none bg-transparent p-0 outline-none focus-visible:ring-1 focus-visible:ring-signal"
      style={{
        // The centre is the note's time, held EDGE_PX inside both ends so a note at the very start
        // or end of the case is drawn whole, inside the track's width.
        // The clamp is carried in a custom property: the jsdom the tests run in drops a clamp() written
        // straight to `left`, so the test could not read it back.
        ["--note-x" as string]: `clamp(${NOTE_EDGE_PX}px, ${pct}%, calc(100% - ${NOTE_EDGE_PX}px))`,
        left: "var(--note-x)",
        // The button starts at the track's bottom edge; the diamond hangs GAP_PX below that, one row
        // lower where a plate of the first row would touch it.
        top: row === 1 ? `calc(100% + ${ROW_STEP_PX}px)` : "100%",
        width: HIT_PX,
        height: HIT_PX,
        transform: "translateX(-50%)",
        // Above the lines and figures of the rows under the track (z 5 to 7).
        zIndex: 8,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute block"
        style={{ left: (HIT_PX - DIAMOND_PX) / 2, top: GAP_PX, width: DIAMOND_PX, height: DIAMOND_PX }}
      >
        {/* The same square, turned 45 degrees about its centre; its outline turns with it. */}
        <span
          data-note-square
          data-note-shape="diamond"
          className="absolute left-1/2 top-1/2 block"
          style={{
            width: SIDE_PX,
            height: SIDE_PX,
            background: fill,
            boxShadow: "0 0 0 1px rgb(var(--panel-base))",
            transform: "translate(-50%, -50%) rotate(45deg)",
          }}
        />
        {!plain && (note.decision === "pass" || note.decision === "fail") ? (
          <span className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2" style={{ width: GLYPH_PX, height: GLYPH_PX }}>
            <Glyph decision={note.decision} size={GLYPH_PX} />
          </span>
        ) : null}
      </span>
    </button>
  );
});

interface Props {
  project: TimelineProjector;
  /** Kept for the caller (Timeline passes it). The marks hang under the track, so their place no longer depends on the lanes. */
  laneCount?: number;
  lookup?: RecordLookup | null;
  /**
   * The track's width in chrome px, when the caller knows it (a test). Left out, the layer measures its
   * own host, as `RowFigures` measures its plot. Marks pile only once a width is known.
   */
  trackPx?: number;
}

/** A mark as the layout takes it, with the view it draws. */
interface LaidMark extends TrackMark {
  view: MarkView;
}

/** One thing under the track, with the time it hangs at and the order it takes at that time. */
type Item =
  | { kind: "mark"; time: number; key: string; view: MarkView; pct: number }
  | { kind: "pile"; time: number; key: string; plate: PilePlate }
  | { kind: "note"; time: number; key: string; pct: number; note: Note; plain: boolean; row: 0 | 1 };
type PilePlate = Extract<TrackPlate<LaidMark>, { type: "pile" }>;

export function NotesLayer({ project, lookup = null, trackPx }: Props) {
  const notes = useNotesStore((s) => s.notes);
  const h24 = useClockForm((s) => s.h24);
  const found = lookup ?? NO_LOOKUP;
  const { views } = useMarkViews(found);
  const open = useOpenRecordKeys();
  const host = useRef<HTMLDivElement | null>(null);

  // The track's width in chrome px (`clientWidth`, never a rect: the page zooms its text step). It is
  // read once before paint, so a mount never draws the overlapped singles for a frame, then follows the
  // host's size. Until a width is known no mark piles.
  const [measured, setMeasured] = useState(0);
  useLayoutEffect(() => {
    const el = host.current;
    if (trackPx !== undefined || !el || typeof ResizeObserver === "undefined") return;
    setMeasured(el.clientWidth);
    const observer = new ResizeObserver(() => setMeasured(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [trackPx]);
  const track = trackPx ?? measured;

  // Which pile is unfolded: one key, never stored. A pile that leaves the layout takes its open column
  // with it (the key is cleared below, so a pile that forms again comes folded).
  const [unfolded, setUnfolded] = useState<string | null>(null);

  // One stable callback for every mark: the layer's latest views and lookup are read at the press.
  const latest = useRef({ views, lookup: found });
  useEffect(() => {
    latest.current = { views, lookup: found };
  });
  /** Opens the record's window beside the click; the window's id, or null when none opened. */
  const openRecord = useCallback((key: string, clientX: number): string | null => {
    const cur = latest.current;
    const view = cur.views.find((v) => v.key === key);
    return view ? openRecordWindow(view.record, cur.lookup, windowPlaceNear(clientX)) : null;
  }, []);
  const onOpen = useCallback(
    (key: string, clientX: number) => {
      openRecord(key, clientX);
    },
    [openRecord],
  );
  /** When focus sits inside the pile's group (on a member of its column) it goes to the pile button, so a fold never drops it to the page. */
  const focusPile = useCallback((key: string) => {
    const groups = host.current?.querySelectorAll<HTMLElement>("[data-mark-pile-group]") ?? [];
    const group = Array.from(groups).find((g) => g.getAttribute("data-mark-pile-group") === key);
    const active = document.activeElement;
    if (group && active && group.contains(active)) group.querySelector<HTMLElement>("[data-mark-pile]")?.focus();
  }, []);
  // Every fold, a second press included, moves focus first and then closes the column.
  const onToggle = useCallback(
    (key: string) => {
      focusPile(key);
      setUnfolded((cur) => (cur === key ? null : key));
    },
    [focusPile],
  );
  const onFold = useCallback(
    (key: string) => {
      focusPile(key);
      setUnfolded((cur) => (cur === key ? null : cur));
    },
    [focusPile],
  );

  // The diamonds change with the notes and the lookup only: `plainNotes` asks the lookup, which must
  // not run on a playhead tick (the views, below, change with every tick).
  const diamonds = useMemo(
    () => [
      ...sortNotes(freeNotes(notes, found)).map((note) => ({ note, plain: false })),
      ...sortNotes(plainNotes(notes, found)).map((note) => ({ note, plain: true })),
    ],
    [notes, found],
  );
  // Each diamond's place on the track: from the diamonds and the projector only, never the views.
  const places = useMemo(() => {
    const out: { note: Note; plain: boolean; pct: number }[] = [];
    for (const { note, plain } of diamonds) {
      const pct = project.pct(note.time);
      if (pct >= 0 && pct <= 100) out.push({ note, plain, pct });
    }
    return out;
  }, [diamonds, project]);
  const trackNotes = useMemo<TrackNote[]>(() => places.map((d) => ({ key: d.note.id, pct: d.pct })), [places]);

  // The marks the one function draws here: a record with no time has no place on the track.
  const laid = useMemo(() => {
    const out: LaidMark[] = [];
    for (const view of views) {
      if (view.time === null || view.timeline === "none") continue;
      const pct = project.pct(view.time);
      if (pct < 0 || pct > 100) continue;
      out.push({
        key: view.key,
        time: view.time,
        pct,
        notes: view.notes,
        pinned: view.pinned,
        disposition: view.disposition,
        dim: view.timeline === "dim",
        open: open.has(view.key),
        view,
      });
    }
    return out;
  }, [views, open, project]);

  // Which plates touch and join one pile, and which diamonds hang one row lower. O(n) a tick.
  const layout = useMemo(() => trackLayout(laid, trackNotes, track), [laid, trackNotes, track]);

  // The shown key is derived, never cleared in an effect: a key that no pile of the layout holds is
  // dropped during this render, so a pile that leaves and forms again comes folded.
  const shown = layout.plates.some((p) => p.type === "pile" && p.key === unfolded) ? unfolded : null;
  if (unfolded !== null && shown === null) setUnfolded(null);
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const plate of layout.plates) {
      if (plate.type === "single") out.push({ kind: "mark", time: plate.mark.time, key: plate.mark.key, view: plate.mark.view, pct: plate.mark.pct });
      // A pile hangs at, and is ordered by, its first mark's time.
      else out.push({ kind: "pile", time: plate.members[0].time, key: plate.key, plate });
    }
    for (const d of places) out.push({ kind: "note", time: d.note.time, pct: d.pct, key: d.note.id, note: d.note, plain: d.plain, row: layout.diamondRow.get(d.note.id) ?? 0 });
    // Time order; at one time a mark or pile comes before a diamond, then by key.
    const rank = (i: Item) => (i.kind === "note" ? 1 : 0);
    return out.sort((a, b) => a.time - b.time || rank(a) - rank(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }, [layout, places]);

  const clock = h24 ? when24 : when;
  /** A member's words, as a single mark carries them. */
  const wordsOf = (v: MarkView, time: number) => ({
    name: markName(v.kindLabel, v.headline),
    lines: markTip({ kindLabel: v.kindLabel, headline: v.headline, time: clock(time), notes: v.notes, disposition: v.disposition, category: v.category, pinned: v.pinned }),
  });

  return (
    // The host fills the track and takes no pointer events itself, so the track under it keeps its
    // scrub; every button inside takes its own. No z-index and no transform: the buttons' z 8 still
    // competes in the track's own stack.
    <div ref={host} data-marks-host className="pointer-events-none absolute inset-0">
      {items.map((it) => {
        if (it.kind === "note") {
          return <Diamond key={it.key} note={it.note} pct={it.pct} lookup={lookup} h24={h24} plain={it.plain} row={it.row} />;
        }
        if (it.kind === "pile") {
          const p = it.plate;
          const isOpen = shown === p.key;
          // The members are in time order, so the first and the last of them bound the span.
          const first = p.members[0].time;
          const last = p.members[p.members.length - 1].time;
          return (
            <TimelinePile
              key={p.key}
              pileKey={p.key}
              pct={p.pct}
              width={p.width}
              face={p.face}
              name={pileName(p.face.records, isOpen)}
              lines={pileTip({ records: p.face.records, first: clock(first), last: clock(last), counts: p.face.counts, pinned: p.face.pinnedCount, unfolded: isOpen })}
              members={memberOrder(p.members).map((m) => ({
                recordKey: m.key,
                ...wordsOf(m.view, m.time),
                notes: m.notes,
                disposition: m.disposition,
                pinned: m.pinned,
                dim: m.dim,
                open: m.open,
              }))}
              unfolded={isOpen}
              onToggle={onToggle}
              onFold={onFold}
              onMemberOpen={openRecord}
            />
          );
        }
        const v = it.view;
        const words = wordsOf(v, it.time);
        return (
          <TimelineMark
            key={it.key}
            recordKey={v.key}
            pct={it.pct}
            name={words.name}
            lines={words.lines}
            notes={v.notes}
            disposition={v.disposition}
            pinned={v.pinned}
            dim={v.timeline === "dim"}
            open={open.has(v.key)}
            onOpen={onOpen}
          />
        );
      })}
    </div>
  );
}
