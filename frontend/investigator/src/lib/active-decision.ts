import type { Decision } from "./decisions";
import type { Entity } from "./entity";

export interface ActiveDecision {
  decision: Decision;
  triggerLngLat: { lat: number; lng: number };
}

/**
 * The decision whose trigger node the playhead has reached, for the rule-badge
 * to tether to. Picks the first decision whose LAST trigger entity (the landing
 * event) has timestamp <= playhead, returning that entity's coords. Returns null
 * before any trigger is reached, so the badge stays hidden and retracts on rewind.
 */
export function activeDecision(
  decisions: Decision[],
  playheadMs: number,
  entitiesByKind: Record<string, Entity[]>,
): ActiveDecision | null {
  const byId = new Map<string, Entity>();
  for (const list of Object.values(entitiesByKind)) {
    for (const e of list) byId.set(e.id, e);
  }
  for (const d of decisions) {
    const triggerId = d.triggerEntityIds[d.triggerEntityIds.length - 1];
    const entity = triggerId ? byId.get(triggerId) : undefined;
    // A coordless (behavioral) trigger has no globe anchor for the badge tether.
    if (!entity || entity.coords === null) continue;
    if (playheadMs >= entity.timestamp) {
      return { decision: d, triggerLngLat: { lat: entity.coords.lat, lng: entity.coords.lng } };
    }
  }
  return null;
}

/**
 * ALL decisions whose landing trigger the playhead has reached - the case's
 * findings so far, highest-severity first. Unlike activeDecision (the single
 * globe-tethered badge), this drives the decision rail: when more than one
 * detector fires on a case (e.g. the impossible-travel RULE and the ml-anomaly
 * MODEL both flag Marcus's Lagos cash-out), every finding is reachable, not just
 * the one the badge happens to pin. Coordless behavioral triggers count - they
 * have no globe anchor but are real findings.
 */
export function reachedDecisions(
  decisions: Decision[],
  playheadMs: number,
  entitiesByKind: Record<string, Entity[]>,
): Decision[] {
  const byId = new Map<string, Entity>();
  for (const list of Object.values(entitiesByKind)) {
    for (const e of list) byId.set(e.id, e);
  }
  const reached = decisions.filter((d) => {
    const triggerId = d.triggerEntityIds[d.triggerEntityIds.length - 1];
    const entity = triggerId ? byId.get(triggerId) : undefined;
    return !!entity && playheadMs >= entity.timestamp;
  });
  return reached.sort((a, b) => b.severity - a.severity);
}
