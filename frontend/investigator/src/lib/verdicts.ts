/**
 * Overlay readers: a manifest node that declares a `decision` mapping holds records that draw as
 * capsules, not as dots. Every field is read through the mapping, so no pack field name appears here.
 */
import type { Entity } from "./entity";
import type { ScenarioNode } from "./scenarios";

export type VerdictTone = "fail" | "pass" | "wait" | "unknown";
const STATUS_TONE: Record<string, VerdictTone> = { FAIL: "fail", PASS: "pass", WAITING: "wait" };
/** Pile and count order: findings, then the held, then anything unrecognised, then the cleared. */
export const TONE_ORDER: Record<VerdictTone, number> = { fail: 0, wait: 1, unknown: 2, pass: 3 };

export const isOverlayNode = (node: ScenarioNode): boolean => node.decision !== undefined;

const str = (v: unknown): string => (v == null ? "" : String(v));
/** The event ids a mapped field holds: one id, a list of ids (one decision can close several
 *  queued events), or none. */
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map(str).filter((id) => id !== "");
/** A record's raw timestamp string as its node names it ("" when the node has none). */
export const rawTime = (e: Entity, node: ScenarioNode): string => (node.timestamp ? str(e.fields[node.timestamp]) : "");

export interface DecisionView {
  id: string; entity: Entity; tone: VerdictTone; status: string; word: string; note: string;
  actor: string; target: string; keyField: string; key: string; events: string[]; at: number; atRaw: string;
}

export function decisionOf(entity: Entity, node: ScenarioNode): DecisionView | null {
  const m = node.decision;
  if (!m) return null;
  const f = entity.fields;
  const status = str(f[m.status]).toUpperCase();
  return {
    id: entity.id, entity, status, tone: STATUS_TONE[status] ?? "unknown",
    word: str(f[m.outcome]) || status, note: str(f[m.note]), actor: str(f[m.actor]),
    target: str(f[m.target]), keyField: m.key, key: str(f[m.key]), events: ids(f[m.event]),
    at: entity.timestamp, atRaw: rawTime(entity, node),
  };
}

/** Whether a decision's status says anything its word does not. Compared trimmed and case-insensitive:
 *  an empty status adds nothing, and neither does one the word begins with (PASS beside PASSED,
 *  WAITING beside WAITING); FAIL beside ATO, FRAUD or KEY TAKEOVER does. */
export function statusAddsInformation(word: string, status: string): boolean {
  const s = status.trim().toUpperCase();
  return s !== "" && !word.trim().toUpperCase().startsWith(s);
}

/** A pack's decisions, in time order. */
export function overlaysOf(entities: readonly Entity[], nodes: readonly ScenarioNode[]): DecisionView[] {
  const byKind = new Map(nodes.filter(isOverlayNode).map((n) => [n.kind, n]));
  const decisions: DecisionView[] = [];
  for (const e of entities) {
    const node = byKind.get(e.kind);
    const d = node ? decisionOf(e, node) : null;
    if (d) decisions.push(d);
  }
  return decisions.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
