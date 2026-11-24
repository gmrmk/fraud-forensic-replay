/**
 * Resolve a Decision evidence/input `entityRef` (a raw entity id, same id scheme
 * as the seed: tx.id / login.id) to the `EntityMatch` the navigate() primitive
 * consumes for the console's evidence↔globe cross-highlight.
 *
 * Honest-encoding degrade (spec §9): an absent ref or an id that no longer
 * resolves returns null - the row renders, but the click is inert (no navigate).
 */
import type { EntityMatch, PivotContext } from "./matches";

export function resolveEntityRef(
  entityRef: string | undefined,
  context: PivotContext,
): EntityMatch | null {
  if (!entityRef) return null;
  const tx = context.transactions.find((t) => t.id === entityRef);
  if (tx) return tx.is_fraud ? { kind: "fraud", tx } : { kind: "auth", tx };
  const login = context.logins.find((l) => l.id === entityRef);
  if (login) return { kind: "login", login };
  const event = (context.accountEvents ?? []).find((e) => e.id === entityRef);
  if (event) return { kind: "account_event", event };
  const transfer = (context.transfers ?? []).find((t) => t.id === entityRef);
  if (transfer) return { kind: "transfer", transfer };
  const entity = (context.entities ?? []).find((e) => e.id === entityRef);
  if (entity) return { kind: "entity", entity };
  return null;
}
