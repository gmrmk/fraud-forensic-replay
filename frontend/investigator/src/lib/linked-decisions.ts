/**
 * Linked-attribute risk: the decisions carried by the records that share a value with the
 * selected record. A record carries decision d when its d.keyField equals d.key. Counts, not
 * probabilities; only decisions the playhead has reached.
 */
import type { Entity } from "./entity";
import { TONE_ORDER, type DecisionView, type VerdictTone } from "./verdicts";

export interface WordCount { word: string; tone: VerdictTone; n: number }
export interface LinkedBadge { decision: DecisionView; record: Entity }

const keyOf = (field: string, value: string) => `${field}\u0000${value}`;
const sameValue = (v: unknown, value: string) => v != null && v !== "" && String(v) === value;

function index(decisions: readonly DecisionView[], playhead: number): Map<string, DecisionView[]> {
  const by = new Map<string, DecisionView[]>();
  for (const d of decisions) {
    if (d.at > playhead || d.key === "") continue;
    const k = keyOf(d.keyField, d.key);
    by.set(k, [...(by.get(k) ?? []), d]);
  }
  return by;
}

function carried(record: Entity, by: Map<string, DecisionView[]>, keyFields: ReadonlySet<string>): DecisionView[] {
  const out: DecisionView[] = [];
  for (const f of keyFields) {
    const v = record.fields[f];
    if (v != null && v !== "") out.push(...(by.get(keyOf(f, String(v))) ?? []));
  }
  return out;
}

/** Decisions on the records whose `field` equals `value`, counted once each, by word. The pack's
 *  PASS word shows at zero once any PASS exists, so "12 ATO · 0 PASSED" reads as a comparison. */
export function linkedDecisionCounts(
  field: string, value: string, entities: readonly Entity[], decisions: readonly DecisionView[], playhead: number,
): WordCount[] {
  if (value === "") return [];
  const by = index(decisions, playhead);
  const keyFields = new Set(decisions.map((d) => d.keyField));
  const linked = new Map<string, DecisionView>();
  for (const e of entities) {
    if (!sameValue(e.fields[field], value)) continue;
    for (const d of carried(e, by, keyFields)) linked.set(d.id, d);
  }
  if (linked.size === 0) return [];
  const counts = new Map<string, WordCount>();
  for (const d of linked.values()) {
    const c = counts.get(d.word) ?? { word: d.word, tone: d.tone, n: 0 };
    counts.set(d.word, { ...c, n: c.n + 1 });
  }
  const passWord = decisions.find((d) => d.tone === "pass")?.word;
  if (passWord && !counts.has(passWord)) counts.set(passWord, { word: passWord, tone: "pass", n: 0 });
  return [...counts.values()].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.word.localeCompare(b.word));
}

/** Every (decision, record) pair where a placed record the playhead has reached shares one of the
 *  selected record's pivotable values and carries a reached decision. */
export function linkedBadges(
  selected: Entity, pivotable: readonly string[], entities: readonly Entity[], decisions: readonly DecisionView[], playhead: number,
): LinkedBadge[] {
  const by = index(decisions, playhead);
  const keyFields = new Set(decisions.map((d) => d.keyField));
  const seen = new Set<string>();
  const out: LinkedBadge[] = [];
  for (const field of pivotable) {
    const value = selected.fields[field];
    if (value == null || value === "") continue;
    for (const record of entities) {
      if (!sameValue(record.fields[field], String(value)) || !record.coords || record.timestamp > playhead) continue;
      for (const decision of carried(record, by, keyFields)) {
        const pair = `${decision.id}@${record.id}`;
        if (seen.has(pair)) continue;
        seen.add(pair);
        out.push({ decision, record });
      }
    }
  }
  return out;
}
