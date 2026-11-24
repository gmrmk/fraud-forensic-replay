/**
 * The notes' pure parts under the Timeline: the diamond's size, the words of a note's mark, and which
 * notes draw a diamond. No clock, no store, no element. (The investigator's mark of a record, on the
 * globe and under the track, is in `components/marks`.)
 *
 * WHERE THE SQUARE SITS. The track is 32 px high and its event lanes sit at 18 to 82 percent of
 * it (`lanePositions`), so with two or more lanes the lowest lane's dots are centred 26.24 px
 * down. A 9 px square flush inside the bottom edge would span 23 to 32 px and cover those dots'
 * centres, and flush inside the top edge would cover the highest lane's the same way. The square
 * is therefore centred ON the bottom edge line (it spans 27.5 to 36.5 px): it covers no lane
 * centre for any number of lanes, and `markPlacement` computes that for the lane count. The
 * edge it names is "bottom".
 */
import { lanePositions } from "../../lib/timeline-lanes";
import { noteLabel } from "../../lib/notes/body";
import { markName, markTip } from "../../lib/tooltip-words/notes";
import type { Note } from "../../lib/notes/types";
import type { RecordInfo, RecordLookup } from "./record-lookup";

/** The square, its hit button, and the track's height, in px. */
export const MARK_PX = 9;
export const HIT_PX = 14;
export const TRACK_PX = 32;

export interface MarkPlacement {
  edge: "bottom";
  /** CSS for the hit button: its top, and the vertical part of its transform. */
  top: string;
  translateY: string;
  /** True when the square would cover the centre of one of the event lanes. */
  coversLaneCentre: boolean;
}

export function markPlacement(laneCount: number): MarkPlacement {
  const names = Array.from({ length: Math.max(0, laneCount) }, (_, i) => `lane${i}`);
  const centres = Object.values(lanePositions(names)).map((pct) => (pct / 100) * TRACK_PX);
  const from = TRACK_PX - MARK_PX / 2;
  const to = TRACK_PX + MARK_PX / 2;
  return {
    edge: "bottom",
    top: "100%",
    translateY: "-50%",
    coversLaneCentre: centres.some((c) => c >= from && c <= to),
  };
}

/** The accessible name and the tooltip lines of a Timeline mark (T1). `time` is the clock's text. */
export function timelineMarkWords(note: Note, time: string, info: RecordInfo | null) {
  const label = noteLabel(note);
  return {
    name: markName(note.category, label, time),
    lines: markTip({
      category: note.category,
      label,
      time,
      decision: note.decision,
      link: note.link ? { kind: note.link.kind, headline: info?.headline ?? note.link.id } : null,
    }),
  };
}

/**
 * The notes with no record (`link` null): the Timeline draws each as today's diamond with its own
 * check or cross cut out, and the globe draws none. `_lookup` is in the signature the marks plan
 * fixed for both helpers and is not read: whether a link's record is found makes a note plain, not free.
 */
export function freeNotes(notes: readonly Note[], _lookup: RecordLookup | null): Note[] {
  return notes.filter((n) => n.link === null);
}

/**
 * The linked notes the Timeline draws as a plain diamond at the note's own time, with no check or
 * cross: those whose record the lookup does not find, whose record has no time, or that link a place
 * (a place has no time). A linked note whose record has a time is carried by that record's mark
 * and draws no diamond. With no lookup every linked note is plain.
 */
export function plainNotes(notes: readonly Note[], lookup: RecordLookup | null): Note[] {
  return notes.filter((n) => {
    if (n.link === null) return false;
    const info = lookup === null ? null : lookup(n.link);
    return info === null || info.time === null;
  });
}
