/**
 * The hooks both layers of the investigator's marks share: the views to draw (the model's marks read
 * through the one function), and which records have their window open. Each selects raw slices and
 * derives with `useMemo`, so a value keeps its identity until a slice it reads changes. The views
 * change with the playhead (the one function reads it); nothing else here does.
 *
 * What this file does not do: it holds no rule of whether a record is drawn (`markViews` reads
 * `drawState`), builds no lookup, reads no clock but the playhead through `useDrawInputs`, and draws
 * nothing.
 */
import { useMemo } from "react";
import type { RecordLookup } from "../notes/record-lookup";
import { useDrawInputs, useYourMarks } from "../../store/marks";
import { usePivotStore } from "../../store/pivot";
import { useSchema } from "../../store/schema";
import { isOverlayNode } from "../../lib/verdicts";
import { canonicalKind, recordKey } from "../../lib/marks/types";
import type { YourMark } from "../../lib/marks/select";
import { kindLabelOf, markViews, type MarkView } from "./mark-views";

export interface MarkViewsOf {
  /** The model's marked records of the story, pinned first (the halo of a globe ring reads their matches). */
  marks: YourMark[];
  /** What to draw: one view for each mark that either surface draws now. */
  views: MarkView[];
}

/** The views of the investigator's marks over `lookup`, for the playhead and the switches as they stand. */
export function useMarkViews(lookup: RecordLookup): MarkViewsOf {
  const marks = useYourMarks(lookup);
  const d = useDrawInputs();
  const nodes = useSchema((s) => s.nodes);
  const views = useMemo(() => {
    // A decision kind draws as a capsule, not a dot: its mark takes the plate alone.
    const decisionKinds = new Set(nodes.filter(isOverlayNode).map((n) => n.kind));
    return markViews(
      marks,
      d,
      (kind) => decisionKinds.has(canonicalKind(kind)),
      (kind) => kindLabelOf(kind, nodes),
    );
  }, [marks, d, nodes]);
  return useMemo(() => ({ marks, views }), [marks, views]);
}

/** The `recordKey` of every record whose own window is open. */
export function useOpenRecordKeys(): ReadonlySet<string> {
  const windows = usePivotStore((s) => s.windows);
  return useMemo(() => {
    const keys = new Set<string>();
    for (const w of windows) if (w.kind === "record") keys.add(recordKey(w.record));
    return keys;
  }, [windows]);
}
