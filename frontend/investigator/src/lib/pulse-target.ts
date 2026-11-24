// frontend/investigator/src/lib/pulse-target.ts
/**
 * Resolve a clicked entity id to its domain identity in a SINGLE pass: its
 * globe position and its kind. GlobeMap maps that kind to render details (the
 * bloom tint and the maplibre marker source). Replaces three separate scans of
 * transactions/logins/places the effect used to do (findPulsePosition + an
 * inline kindColor lookup + an inline selSource lookup). Precedence is
 * transaction → login → place, matching the prior code.
 *
 * Normalizing to { lng, lat } here avoids the Transaction | LoginEvent | Place
 * union pain at the call site. The concrete seed types mirror the lookups being
 * replaced - this is a consolidation of existing concrete-typed lookups, NOT a
 * new platform-seam abstraction (the project's rule against narrow drift).
 */
import type { Entity } from "./entity";
import type { LoginEvent, Place, Transaction } from "../types";

/** The MAP-pulse union: only kinds with a globe position can pulse. The
 *  behavioral kinds (account_event, transfer) carry no geography by design -
 *  their ids resolve to null here, and GlobeMap's kind→render maps stay
 *  exhaustive over exactly the kinds that can reach the map. */
export type PulseKind = "auth" | "fraud" | "login" | "place" | "generic";

export interface PulseTarget {
  pos: { lng: number; lat: number };
  kind: PulseKind;
  /** The manifest kind, for a `generic` target (its palette tints the bloom). */
  entityKind?: string;
}

export function resolvePulseTarget(
  id: string | null,
  transactions: Transaction[],
  logins: LoginEvent[],
  places: Place[],
  entities: Entity[] = [],
): PulseTarget | null {
  if (!id) return null;
  const tx = transactions.find((t) => t.id === id);
  if (tx) {
    return { pos: { lng: tx.merchant_lng, lat: tx.merchant_lat }, kind: tx.is_fraud ? "fraud" : "auth" };
  }
  const login = logins.find((l) => l.id === id);
  if (login) {
    return { pos: { lng: login.ip_lng, lat: login.ip_lat }, kind: "login" };
  }
  const place = places.find((p) => p.id === id);
  if (place) {
    return { pos: { lng: place.lng, lat: place.lat }, kind: "place" };
  }
  const entity = entities.find((e) => e.id === id);
  if (entity?.coords) {
    return { pos: { lng: entity.coords.lng, lat: entity.coords.lat }, kind: "generic", entityKind: entity.kind };
  }
  return null;
}
