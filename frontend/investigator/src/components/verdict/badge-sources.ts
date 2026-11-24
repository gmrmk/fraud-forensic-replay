/**
 * What the badge layers draw: each reached decision at its own place, each linked (decision,
 * record) pair at the record's place (lit), and a flag on each event a reached rule decision queued
 * until a reached decision works that event. Pure; the layers add screen positions and pile the result.
 */
import { linkedBadges } from "../../lib/linked-decisions";
import type { DecisionView } from "../../lib/verdicts";
import { formatHoustonDateTime } from "../../lib/houston-day";
import type { Pile, PileItem } from "../../lib/verdict-piles";
import type { Entity } from "../../lib/entity";
import type { Decision } from "../../lib/decisions";
import type { ScenarioNode } from "../../lib/scenarios";

export type BadgeSource = Omit<PileItem, "x" | "y">;

export const decisionSource = (d: DecisionView, lngLat: { lng: number; lat: number }, lit: boolean, id = `d:${d.id}`): BadgeSource => ({
  id, family: "decision", at: d.at, countKey: d.id, word: d.word, tone: d.tone, lit, entity: d.entity, lngLat,
});

/** The event a rule decision queued: its landing (last) trigger, the same convention as reachedDecisions. */
export const queuedEventId = (r: Decision): string | undefined => r.triggerEntityIds[r.triggerEntityIds.length - 1];

/** The latest overlay or record time at or before the playhead: badge membership changes only
 *  when the playhead crosses one, so memos keyed on this hold still between crossings. */
export function lastCrossing(entities: readonly Entity[], playhead: number): number {
  let step = -Infinity;
  for (const e of entities) if (e.timestamp <= playhead && e.timestamp > step) step = e.timestamp;
  return step;
}

export function badgeSources(
  decisions: readonly DecisionView[], queued: readonly Decision[], selected: Entity | null,
  entities: readonly Entity[], at: number,
): BadgeSource[] {
  const reached = decisions.filter((d) => d.at <= at);
  const links = selected
    ? linkedBadges(selected, selected.displayMetadata.pivotableFields, entities, reached, at)
    : [];
  const litIds = new Set(links.map((l) => l.decision.id));
  const out: BadgeSource[] = [];
  for (const d of reached) if (d.entity.coords) out.push(decisionSource(d, d.entity.coords, litIds.has(d.id)));
  for (const { decision, record } of links) {
    if (record.coords) out.push(decisionSource(decision, record.coords, true, `l:${decision.id}:${record.id}`));
  }
  // ponytail: events resolve among the manifest-node entities only, so a rule whose landing trigger
  // is a built-in kind (a card transaction or login) draws no flag; resolve through every kind to lift it.
  const byId = new Map(entities.map((e) => [e.id, e]));
  const worked = new Set(reached.flatMap((d) => d.events));
  const flagged = new Set<string>();
  for (const r of queued) {
    const id = queuedEventId(r);
    const e = id === undefined ? undefined : byId.get(id);
    if (!e?.coords || e.timestamp > at || worked.has(e.id) || flagged.has(e.id)) continue;
    flagged.add(e.id);
    out.push({ id: `q:${e.id}`, family: "queue", at: e.timestamp, countKey: e.id, word: r.rule.label, tone: "queue", lit: false, entity: e, lngLat: e.coords });
  }
  return out;
}

const nodeOf = (e: Entity, nodes: readonly ScenarioNode[]) => nodes.find((n) => n.kind === e.kind);

/** The accessible name of a badge: what it is and what activating it opens. */
export function badgeName(pile: Pile, nodes: readonly ScenarioNode[]): string {
  if (pile.members.length > 1) {
    return `${pile.segments.map((s) => `${s.count} ${s.word}`).join(", ")} at this place. Open the list.`;
  }
  const m = pile.members[0];
  if (pile.family === "queue") return `${m.word} queued ${m.entity.displayMetadata.primaryLabel}. Open the rule.`;
  const node = nodeOf(m.entity, nodes);
  const target = node?.decision ? String(m.entity.fields[node.decision.target] ?? "") : m.entity.displayMetadata.primaryLabel;
  const raw = node?.timestamp ? String(m.entity.fields[node.timestamp] ?? "") : "";
  return `${m.word} decision for ${target}, decided ${formatHoustonDateTime(raw)}. Open notes.`;
}

export const pileLabel = (pile: Pile): string =>
  pile.family === "decision" ? `${pile.members.length} decisions here` : `${pile.members.length} queued events here`;
