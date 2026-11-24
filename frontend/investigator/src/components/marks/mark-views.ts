/**
 * What each layer draws for the investigator's marks. `markViews` turns the model's `YourMark` list
 * and the one function's inputs into one view for each mark that is drawn on the Timeline or the
 * globe: the record, the words' parts, the counts, and what `drawState` says (lit, dim or none on each
 * surface, and whether the record's own dot is drawn). The layers draw views and decide nothing.
 *
 * The one function is the only judge of whether a record is drawn; this file adds no rule of its own.
 * A mark whose record is not in the data has no view. A view is kept while either surface draws it.
 *
 * What this file does not do: it reads no store (callers pass `DrawInputs`, built by `useDrawInputs`),
 * draws nothing, holds no clock, and reads no field name of a record.
 */
import type { YourMark } from "../../lib/marks/select";
import { drawState, type DrawInputs } from "../../lib/marks/draw";
import { canonicalKind, recordKey, type Disposition, type RecordRef } from "../../lib/marks/types";
import type { ScenarioNode } from "../../lib/scenarios";

export type MarkLevel = "none" | "lit" | "dim";

export interface MarkView {
  /** `recordKey` of the record: one view, one key. */
  key: string;
  record: RecordRef;
  /** The kind's manifest label, else the canonical kind (the words' `{kind}`). */
  kindLabel: string;
  headline: string;
  /** Null for a record with no time: it has no place on the Timeline. */
  time: number | null;
  lngLat: { lng: number; lat: number } | null;
  /** How many notes link the record. */
  notes: number;
  pinned: boolean;
  disposition: Disposition;
  category: string | null;
  /** What the Timeline draws: reads `DrawState.timelineMark`. A record with no time draws nothing there whatever this reads. */
  timeline: MarkLevel;
  /** What the globe draws: reads `DrawState.globeMark`. */
  globe: MarkLevel;
  /** The record's own dot is drawn now (ring form); false takes the plate alone. */
  dot: boolean;
  /** A decision kind draws as a capsule, not a dot, so its mark takes the plate alone. */
  decision: boolean;
}

/**
 * The kind's manifest label, else the canonical kind. A twin of the record window's `kindLabelOf`
 * (two builders, no shared file): the same rule, so one kind has one name across the app.
 */
export function kindLabelOf(kind: string, nodes: readonly ScenarioNode[]): string {
  const canonical = canonicalKind(kind);
  return nodes.find((n) => n.kind === canonical)?.label ?? canonical;
}

/**
 * The views to draw, in the input's order (the model's `yourMarks` order). One `drawState` call for
 * each mark; a view whose Timeline and globe levels are both "none" is dropped.
 */
export function markViews(
  marks: readonly YourMark[],
  d: DrawInputs,
  kindIsDecision: (kind: string) => boolean,
  kindLabel: (kind: string) => string,
): MarkView[] {
  const out: MarkView[] = [];
  for (const m of marks) {
    const info = m.info;
    if (info === null) continue;
    const s = drawState(info.draw, d);
    if (s.timelineMark === "none" && s.globeMark === "none") continue;
    out.push({
      key: recordKey(m.record),
      record: m.record,
      kindLabel: kindLabel(info.kind),
      headline: info.headline,
      time: info.time,
      lngLat: info.lngLat,
      notes: m.notes.length,
      pinned: m.node?.pinned ?? false,
      disposition: m.node?.disposition ?? "none",
      category: m.node?.category ?? null,
      timeline: s.timelineMark,
      globe: s.globeMark,
      dot: s.dot,
      decision: kindIsDecision(info.kind),
    });
  }
  return out;
}
