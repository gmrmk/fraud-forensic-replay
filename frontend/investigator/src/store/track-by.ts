/**
 * The grouping the rows are built by, when it is not the manifest's own. Held in memory only: whether
 * a grouping is also saved is not ruled, and the share link carries it, so nothing here touches
 * storage. null means the manifest's declared grouping.
 *
 * Beside the store sit the two things the grouping control needs and no component should own: the
 * list of fields it may offer (`groupingOptions`, a pure function of the manifest and the loaded
 * rows) and the choice itself (`chooseGrouping`, which also clears a solo made under another
 * grouping, since a solo carries a value and no field).
 */
import { create } from "zustand";
import { caseStepEvents, type CaseRows } from "../lib/case-events";
import type { ScenarioFieldWords, ScenarioNode, ScenarioRows } from "../lib/scenarios";
import { displayText } from "../lib/timeline-lanes";
import { buildTracks, FIELD_LABEL_MOST, groupingOf, isFieldName } from "../lib/tracks";
import { isOverlayNode } from "../lib/verdicts";
import { useSolo } from "./solo";

interface TrackByState {
  by: string | null;
  /** Set the grouping, or null for the manifest's own. A value that is not a field name is refused
   *  and the grouping stays as it was. */
  setBy: (by: string | null) => void;
}

export const useTrackBy = create<TrackByState>((set) => ({
  by: null,
  setBy: (by) => {
    if (by === null || isFieldName(by)) set({ by });
  },
}));

/** The rows the case holds, as the rows of the bar read them. */
export type GroupingData = CaseRows;

/** A field the rows may be grouped by, and the manifest's word for it. */
export interface GroupingOption {
  field: string;
  label: string;
}

export interface GroupingInput {
  nodes: readonly ScenarioNode[];
  /** The manifest's root `rows`; not trusted. */
  rows: ScenarioRows | undefined;
  /** The manifest's root `fields`; not trusted. */
  fields: Record<string, ScenarioFieldWords> | undefined;
  data: GroupingData;
}

const own = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

/**
 * The fields the rows may be grouped by: the union, in the nodes' order, of the `pivotable` fields of
 * every timed kind that the manifest gives a label (1 to `FIELD_LABEL_MOST` characters after
 * trimming), and that give at least one named row on the loaded data. The last test is the rows' own
 * (`buildTracks`), so a field is offered only when choosing it draws a named row. A decision kind is
 * an overlay and draws no row, so it adds nothing. Depends on data and the manifest, never on the
 * playhead.
 */
export function groupingOptions({ nodes, rows, fields, data }: GroupingInput): GroupingOption[] {
  if (typeof fields !== "object" || fields === null) return [];
  const candidates = new Map<string, string>();
  for (const node of nodes) {
    if (typeof node.timestamp !== "string" || node.timestamp === "" || isOverlayNode(node)) continue;
    for (const field of node.pivotable ?? []) {
      if (!isFieldName(field) || candidates.has(field) || !own(fields, field)) continue;
      const words = fields[field] as unknown;
      const label = typeof words === "object" && words !== null ? displayText((words as { label?: unknown }).label, FIELD_LABEL_MOST) : "";
      if (label) candidates.set(field, label);
    }
  }
  if (candidates.size === 0) return [];
  const events = caseStepEvents(data, nodes);
  const offered: GroupingOption[] = [];
  for (const [field, label] of candidates) {
    const set = buildTracks({ events, entities: data.entities, nodes, rows, fields, by: field });
    if (set && set.named > 0) offered.push({ field, label });
  }
  return offered;
}

/**
 * The control's choice. The manifest's own grouping is stored as null, so the link writes no `by` for
 * it. A solo made under another grouping is cleared; choosing the grouping already in force keeps it.
 * A value that is not a field name changes nothing.
 */
export function chooseGrouping(field: string, rows: ScenarioRows | undefined): void {
  if (!isFieldName(field)) return;
  const before = groupingOf(rows, useTrackBy.getState().by);
  useTrackBy.getState().setBy(field === groupingOf(rows, null) ? null : field);
  if (before !== field) useSolo.getState().clear();
}
