/**
 * The rows of the Inspector's Shared values section, as pure functions: for a record, one row for each
 * kind that holds other records with the same value in a field the record's kind declares pivotable, and
 * one row for each decision that names the record as one of its events. This file says which rows and how
 * many records each holds; the component (components/inspector/SharedValuesSection.tsx) draws them. It
 * names no field and no kind of any pack: the fields come from the record's node (`pivotable`) and from
 * the decision node's own mapping, the words from the nodes' labels.
 *
 * It does not read a store, draw anything, or keep anything. A row's members are `DrawRecord`s, so the
 * component counts them with the one function (`drawCounts`, lib/marks/draw): the figure follows the
 * Layers switches and the playhead, and this file holds no clock of its own.
 */
import { selectedToEntity } from "./adapters/ffr-seed";
import type { Entity } from "./entity";
import { drawRecordOf, type DrawRecord } from "./marks/draw";
import { labelForField, displayLabel } from "./manifest-fields";
import { relatedEntities, type EntityMatch, type MatchableField, type PivotContext } from "./matches";
import type { ScenarioNode } from "./scenarios";
import { overlaysOf } from "./verdicts";

export interface SharedRow {
  /** `${kind}:${field}` for a pivot row, `${kind}:${field}:${decisionId}` for a decision row. */
  key: string;
  kind: string;
  kindLabel: string;
  palette: string;
  field: string;
  fieldLabel: string;
  value: string;
  /** The records of the row, as the one function reads them (a kind, an id, a time and the fields), so
   *  the Layers switches reach them: the count is `drawCounts(members, drawInputs)`. */
  members: readonly DrawRecord[];
  open: { type: "matches"; field: MatchableField; value: string } | { type: "record"; match: EntityMatch };
}

/** The kind a match belongs to: a manifest entity's own kind, else the seed kind of the match. A flagged
 *  and an ordinary authorisation are two kinds here, each with the label its manifest node gives (the
 *  Layers menu and the record links print them the same way). */
function kindOfMatch(m: EntityMatch): string {
  return m.kind === "entity" ? m.entity.kind : m.kind;
}

/** The rows of `record`, pivot rows first and then one row for each decision that names it.
 *  LIMIT: only string values match, as the Matches press passes the value as a string and compares it
 *  strictly (relatedEntities), so a field holding a list or a number gives no row. */
export function sharedRows(record: Entity, nodes: readonly ScenarioNode[], context: PivotContext): SharedRow[] {
  const own = nodes.find((n) => n.kind === record.kind);
  if (!own) return [];
  const order = (kind: string): number => {
    const i = nodes.findIndex((n) => n.kind === kind);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const rows: SharedRow[] = [];

  for (const field of own.pivotable ?? []) {
    const value = record.fields[field];
    if (typeof value !== "string" || value === "") continue;
    const groups = new Map<string, DrawRecord[]>();
    for (const match of relatedEntities(field, value, context)) {
      const entity = selectedToEntity(match);
      const kind = kindOfMatch(match);
      if (kind === record.kind && entity.id === record.id) continue;
      const members = groups.get(kind) ?? [];
      members.push(drawRecordOf(match));
      groups.set(kind, members);
    }
    const kinds = [...groups.keys()].sort((a, b) => order(a) - order(b) || (a < b ? -1 : a > b ? 1 : 0));
    for (const kind of kinds) {
      const node = nodes.find((n) => n.kind === kind);
      rows.push({
        key: `${kind}:${field}`,
        kind,
        kindLabel: node?.label ?? kind,
        palette: node?.palette ?? "",
        field,
        fieldLabel: displayLabel(labelForField(field)),
        value,
        members: groups.get(kind) ?? [],
        open: { type: "matches", field, value },
      });
    }
  }

  for (const d of overlaysOf(context.entities ?? [], nodes)) {
    if (!d.events.includes(record.id)) continue;
    const node = nodes.find((n) => n.kind === d.entity.kind);
    const field = node?.decision?.event;
    if (!node || !field) continue;
    rows.push({
      key: `${node.kind}:${field}:${d.id}`,
      kind: node.kind,
      kindLabel: node.label,
      palette: node.palette,
      field,
      fieldLabel: displayLabel(labelForField(field)),
      value: record.id,
      members: [{ ...drawRecordOf({ kind: "entity", entity: d.entity }), timestamp: d.at }],
      open: { type: "record", match: { kind: "entity", entity: d.entity } },
    });
  }
  return rows;
}
