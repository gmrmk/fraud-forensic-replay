/**
 * The move of saved note marks (D6, one mark per node): the PASS or FAIL that notes saved before now
 * belongs to their record's node. This file says which node rows the move writes; the store writes
 * them (`moveSavedMarks` in store/marks.ts), always with `ifUnsettled`.
 *
 * A record is moved when its node row is absent or not yet settled, and its linked notes carry at least
 * one PASS or FAIL. One decided value becomes the record's disposition; a PASS and a FAIL together leave
 * the record unmarked (and settled, so the move never returns to it). A node already settled by a press,
 * an earlier move or a notes file is never written. A note with no record keeps its own mark.
 *
 * What this file does not do: it reads no store and no backing, writes nothing, never changes a note or
 * a node it is given, and never deletes anything. A note's own decision stays in its row.
 */
import { compareRecords } from "./schema";
import { canonicalKind, recordKey, type RecordNode, type RecordRef } from "./types";
import type { Decision, Note } from "../notes/types";

/**
 * The node rows the move writes: one for each record of `scenario` whose node row is absent or has
 * `settled` false, and whose linked notes carry at least one PASS or FAIL. A written row keeps the held
 * pin (false with no row), has category null and settled true, and names its record canonically.
 */
export function movedMarks(scenario: string, notes: readonly Note[], nodes: readonly RecordNode[]): RecordNode[] {
  const decided = new Map<string, { record: RecordRef; set: Set<Exclude<Decision, "none">> }>();
  for (const note of notes) {
    if (note.scenario !== scenario || note.link === null || note.decision === "none") continue;
    const key = recordKey(note.link);
    const held = decided.get(key) ?? { record: { kind: canonicalKind(note.link.kind), id: note.link.id }, set: new Set() };
    held.set.add(note.decision);
    decided.set(key, held);
  }

  const heldNodes = new Map<string, RecordNode>();
  for (const node of nodes) if (node.scenario === scenario) heldNodes.set(recordKey(node.record), node);

  const rows: RecordNode[] = [];
  for (const [key, { record, set }] of decided) {
    const held = heldNodes.get(key);
    if (held?.settled) continue;
    rows.push({
      scenario,
      record,
      pinned: held?.pinned ?? false,
      // One decided value is the record's mark; both values disagree, so the record stays unmarked.
      disposition: set.size === 1 ? [...set][0] : "none",
      category: null,
      settled: true,
    });
  }
  return rows.sort((a, b) => compareRecords(a.record, b.record));
}
