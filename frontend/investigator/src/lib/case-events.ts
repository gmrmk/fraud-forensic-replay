/**
 * The case's steppable events: every record the timeline draws as a dot, in time order, each
 * with the target navigate() takes. The step keys walk this list, so a pack with only
 * file-backed kinds steps like any other.
 *
 * Not steps: a kind that draws as bars (it declares a magnitude), a kind that draws as capsules
 * (it declares a decision mapping, and the manifest places it), and a record with no time. A
 * manifest in which no node declares coords cannot place a decision, so there its rows are steps
 * like any other timed kind.
 */
import { isGenericNode } from "./adapters/manifest-row";
import { isOverlayNode } from "./verdicts";
import type { Entity } from "./entity";
import type { EntityMatch } from "./matches";
import type { StepEvent } from "./playhead-tools";
import type { ScenarioNode } from "./scenarios";
import type { AccountEvent, LoginEvent, SelectedEntity, Transaction, Transfer } from "../types";

export interface CaseStepEvent extends StepEvent {
  match: EntityMatch;
}

export interface CaseRows {
  transactions: readonly Transaction[];
  logins: readonly LoginEvent[];
  accountEvents: readonly AccountEvent[];
  transfers: readonly Transfer[];
  entities: readonly Entity[];
}

/** Whether the manifest can place a decision: some node of it, of any kind, declares coords. */
export const manifestPlaces = (nodes: readonly ScenarioNode[]): boolean => nodes.some((n) => Boolean(n.coords));

/** The generic nodes the track draws: every one but a decision kind the manifest can place (its
 *  rows draw as capsules on the globe). With no node placing anything, a decision draws as a node
 *  like any other timed kind. */
export function trackNodes(nodes: readonly ScenarioNode[]): ScenarioNode[] {
  const placed = manifestPlaces(nodes);
  return nodes.filter((n) => isGenericNode(n) && !(placed && isOverlayNode(n)));
}

/** The manifest kinds the track draws as dots: the track's kinds less those that draw as bars. The
 *  step keys, the day band and the ticker read the same set. */
export const dotKinds = (nodes: readonly ScenarioNode[]): Set<string> =>
  new Set(trackNodes(nodes).filter((n) => !n.magnitude).map((n) => n.kind));

export function caseStepEvents(rows: CaseRows, nodes: readonly ScenarioNode[]): CaseStepEvent[] {
  const dots = dotKinds(nodes);
  const at = (iso: string): number => Date.parse(iso);
  const events: CaseStepEvent[] = [
    ...rows.transactions.map((tx): CaseStepEvent => ({ id: tx.id, t: at(tx.timestamp), match: { kind: tx.is_fraud ? "fraud" : "auth", tx } })),
    ...rows.logins.map((login): CaseStepEvent => ({ id: login.id, t: at(login.timestamp), match: { kind: "login", login } })),
    ...rows.accountEvents.map((event): CaseStepEvent => ({ id: event.id, t: at(event.timestamp), match: { kind: "account_event", event } })),
    ...rows.transfers.map((transfer): CaseStepEvent => ({ id: transfer.id, t: at(transfer.timestamp), match: { kind: "transfer", transfer } })),
    ...rows.entities
      .filter((entity) => dots.has(entity.kind) && entity.timestamp > 0)
      .map((entity): CaseStepEvent => ({ id: entity.id, t: entity.timestamp, match: { kind: "entity", entity } })),
  ];
  return events
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

/** The selected record's id, whatever its kind; null when nothing is selected. */
export function selectionId(selected: SelectedEntity | null): string | null {
  if (!selected) return null;
  switch (selected.kind) {
    case "login": return selected.login.id;
    case "place": return selected.place.id;
    case "account_event": return selected.event.id;
    case "transfer": return selected.transfer.id;
    case "entity": return selected.entity.id;
    default: return selected.tx.id;
  }
}
