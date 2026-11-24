/**
 * Boot-focus - pick the entity the case should open on.
 *
 * On scenario load the playhead pins to maxTime, so the ticker's
 * default entity is an ordinary trailing auth, and the case's marquee finding
 * (e.g. Priya's ACCOUNT TAKEOVER, whose trigger login sits well before maxTime)
 * shows no decision pill - DecisionsSection's relevance gate hides it because the
 * selected auth is neither the trigger nor session-linked, and nothing is
 * auto-selected on boot. Net: the top finding is reachable only by blind ticker
 * stepping or clicking one specific dot.
 *
 * The fix: on load, auto-navigate to the HIGHEST-SEVERITY reached decision's
 * landing trigger. Selecting that trigger both mounts the Inspector and makes the
 * decision relevant (it IS in triggerEntityIds), so the finding's pill is the
 * opening frame. This module is the PURE half: given the loaded seed rows +
 * decisions, resolve which EntityMatch to hand to useNavigation.navigate(). App
 * owns the effect (fire-once guard, respect-later-user-nav); this stays testable
 * with no store or React.
 *
 * NO-OP contract (population packs): a pack with no reached
 * decisions returns null - the caller navigates nowhere. Reachedness is evaluated
 * at the data's end (maxTime), so the "top finding" is deterministic and
 * independent of where the live playhead happens to sit when the effect runs.
 */
import type { Decision } from "./decisions";
import type { Entity } from "./entity";
import type { EntityMatch } from "./matches";
import { reachedDecisions } from "./active-decision";
import { caseStepEvents } from "./case-events";
import type { ScenarioNode } from "./scenarios";
import { overlaysOf, TONE_ORDER } from "./verdicts";
import type {
  AccountEvent,
  LoginEvent,
  Transaction,
  Transfer,
} from "../types";

/** The seed rows the case-boot effect has in hand. Places are excluded: they
 *  carry no timestamp and are never a decision trigger, so they can never be the
 *  boot-focus target. */
export interface BootFocusRows {
  transactions: Transaction[];
  logins: LoginEvent[];
  accountEvents: AccountEvent[];
  transfers: Transfer[];
  /** Manifest-declared kinds (a non-bank pack's sign-ins / key events ...). */
  entities?: Entity[];
}

/** Build a raw id -> EntityMatch index over every temporal seed row, so a
 *  decision's trigger id resolves to the navigate()-shaped union. Transactions
 *  split fraud/auth on is_fraud, matching every other kind-split in the app. */
export function indexRows(rows: BootFocusRows): Map<string, EntityMatch> {
  const byId = new Map<string, EntityMatch>();
  for (const tx of rows.transactions) {
    byId.set(tx.id, tx.is_fraud ? { kind: "fraud", tx } : { kind: "auth", tx });
  }
  for (const login of rows.logins) byId.set(login.id, { kind: "login", login });
  for (const event of rows.accountEvents) byId.set(event.id, { kind: "account_event", event });
  for (const transfer of rows.transfers) byId.set(transfer.id, { kind: "transfer", transfer });
  for (const entity of rows.entities ?? []) byId.set(entity.id, { kind: "entity", entity });
  return byId;
}

/**
 * The EntityMatch the case should open on, or null when there is nothing to focus
 * (no reached decisions, or the top decision's trigger row is absent).
 *
 * @param decisions       the case's decisions (App's useDecisions()).
 * @param rows            the loaded seed rows for this case.
 * @param entitiesByKind  the same per-kind Entity map App feeds reachedDecisions,
 *                        used to evaluate reachedness (a decision's landing
 *                        trigger must exist and be temporally present).
 * @param maxTime         the data's end timestamp; reachedness is evaluated here
 *                        so the top finding is playhead-independent.
 */
export function bootFocusEntity(
  decisions: Decision[],
  rows: BootFocusRows,
  entitiesByKind: Record<string, Entity[]>,
  maxTime: number,
): EntityMatch | null {
  // Highest-severity first (reachedDecisions sorts by severity desc). Evaluate at
  // maxTime = "every finding reached by the end of the data".
  const reached = reachedDecisions(decisions, maxTime, entitiesByKind);
  const byId = indexRows(rows);
  for (const d of reached) {
    // The LAST trigger id is the landing event (same convention as
    // activeDecision / reachedDecisions).
    const triggerId = d.triggerEntityIds[d.triggerEntityIds.length - 1];
    const match = triggerId ? byId.get(triggerId) : undefined;
    if (match) return match;
  }
  return null;
}

/**
 * The opening of a pack whose case is a manifest decision node and not a rule's decision (the
 * story packs: `rules: []`, so /api/decisions is empty and bootFocusEntity finds nothing). The
 * node's own mapping says which field names the events the decision closed (`decision.event`), so no
 * pack field name appears here.
 *
 * The rule is the one the rule decisions follow, read from what the manifest declares. Take the
 * pack's top decision (a finding before a held one, before a cleared one, as the capsule pile
 * orders them). Its landing record is the latest event it names that the step keys can stand on, so
 * the step keys have a record on both sides of it; a named bar (a day's total) is not a step and
 * is passed over. The decision record itself sits at or after the end of the data, so it is never
 * the landing: it opens only for a decision that names no event.
 *
 * Null (the caller neither navigates nor latches, and a later arrival can retry) when the pack has
 * no decision node, or when any event the decision names has not loaded: a landing chosen from
 * the part that has arrived would skip a later row.
 *
 * Playhead-independent, like bootFocusEntity: nothing here reads a clock or the playhead.
 */
export function overlayFocusEntity(nodes: readonly ScenarioNode[], rows: BootFocusRows): EntityMatch | null {
  const entities = rows.entities ?? [];
  const [top] = overlaysOf(entities, nodes).sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  if (!top) return null;
  const byId = indexRows(rows);
  if (top.events.length === 0) return byId.get(top.id) ?? null;
  if (top.events.some((id) => !byId.has(id))) return null;
  const named = new Set(top.events);
  const steps = caseStepEvents({ ...rows, entities }, nodes).filter((e) => named.has(e.id));
  // A pack whose named events are all bars has no step to stand on: the last one named lands.
  const landing = steps.length > 0 ? steps[steps.length - 1].id : top.events[top.events.length - 1];
  return byId.get(landing) ?? null;
}
