/**
 * Spec 1 foundation - entity-pivot types and the pivotable-field
 * registry. Companion runtime function `relatedEntities()` lands in
 * the same file via Task 2 (kept in one file so the registry and
 * the matching logic stay co-located).
 */
import type { AccountEvent, LoginEvent, Place, Transaction, Transfer } from "../types";
import type { Entity } from "./entity";

/** The seed schema's pivotable fields - see the spec for the yes/no rationale. */
export type KnownMatchableField =
  | "acquirer"
  | "pos_entry_mode"
  | "merchant_country"
  | "mcc"
  | "merchant_name"
  | "card_id"
  | "ip_asn"
  | "device_fp"
  | "auth_source"
  | "session_id"
  | "terminal_id";

/** A field on an entity that supports the "find related" pivot reflex: one of
 *  the seed fields above, or any field a manifest node declares `pivotable`
 *  (unsealed, spec section 6; the `& {}` keeps the known names autocompleting). */
export type MatchableField = KnownMatchableField | (string & {});

/** Discriminated union - every "thing the user is looking at" in the
 *  app collapses to one of these. Selection store uses the same
 *  shape. */
export type EntityMatch =
  | { kind: "auth"; tx: Transaction }
  | { kind: "fraud"; tx: Transaction }
  | { kind: "login"; login: LoginEvent }
  | { kind: "place"; place: Place }
  | { kind: "account_event"; event: AccountEvent }
  | { kind: "transfer"; transfer: Transfer }
  | { kind: "entity"; entity: Entity };

/** What the pure functions need to walk the dataset. Provided by
 *  whoever is calling - Inspector / NarrativeLog / pivot store. */
export interface PivotContext {
  transactions: Transaction[];
  logins: LoginEvent[];
  /** Present for downstream consumers (PivotPopover / DetailWindow
   *  rendering); not used by relatedEntities matching - no pivotable
   *  field maps to the place side per FIELD_SOURCES. */
  places: Place[];
  /** Behavioral kinds - optional so lean single-kind contexts (inspector
   *  badge counts, tests) stay literal. The walker treats absent as []. */
  accountEvents?: AccountEvent[];
  transfers?: Transfer[];
  /** Manifest-declared kinds (sign-ins / key events / usage ...), flattened. */
  entities?: Entity[];
}

/** Which entity kinds carry each pivotable field. Drives
 *  relatedEntities() - without this map we'd walk the whole dataset
 *  for every pivot. */
export const FIELD_SOURCES: Record<
  KnownMatchableField,
  ("transaction" | "login" | "account_event" | "transfer")[]
> = {
  acquirer: ["transaction"],
  pos_entry_mode: ["transaction"],
  merchant_country: ["transaction"],
  mcc: ["transaction"],
  merchant_name: ["transaction"],
  card_id: ["transaction"],
  auth_source: ["transaction"],
  ip_asn: ["login"],
  device_fp: ["login"],
  session_id: ["login", "account_event", "transfer"],
  terminal_id: ["transaction"],
};

/** The seed row kinds that carry `field`, or undefined for a field that is not
 *  a seed field. Own-key test, so inherited names don't pass. */
export function fieldSources(field: string): (typeof FIELD_SOURCES)[KnownMatchableField] | undefined {
  return Object.hasOwn(FIELD_SOURCES, field) ? FIELD_SOURCES[field as KnownMatchableField] : undefined;
}

/** The loaded manifest-declared entities that treat `field` as pivotable. */
function genericWith(field: string, context: PivotContext): Entity[] {
  return (context.entities ?? []).filter((e) => e.displayMetadata.pivotableFields.includes(field));
}

/** Narrow an untrusted string (e.g. a backend-supplied `field` tag) to a
 *  matchable field: a seed field, or one a loaded entity declares pivotable. */
export function isMatchableField(field: unknown, context?: PivotContext): field is MatchableField {
  if (typeof field !== "string") return false;
  return fieldSources(field) !== undefined || (context !== undefined && genericWith(field, context).length > 0);
}

/** `context` plus `extra` transactions not already in it (by id; the base row
 *  wins). Lets a cross-card read - rows outside the focal case - feed the same
 *  relatedEntities() walk without being loaded into the case. */
export function withExtraTransactions(context: PivotContext, extra: Transaction[]): PivotContext {
  const have = new Set(context.transactions.map((t) => t.id));
  return { ...context, transactions: [...context.transactions, ...extra.filter((t) => !have.has(t.id))] };
}

/** Walk the dataset; return all entities whose value at `field`
 *  exactly equals `value`, in chronological order. Pure function -
 *  no side effects, no state. Used by MatchBadge (count) and
 *  MatchesTable (list).
 *
 *  Match rule is **strict equality** (===). No semantic similarity,
 *  no range queries - those would have surprising results given how
 *  fraud-investigation workflows rely on exactness.
 */
export function relatedEntities(
  field: MatchableField,
  value: string,
  context: PivotContext
): EntityMatch[] {
  // A field cast from an unknown string might not be registered: no seed
  // sources, but a manifest-declared entity can still carry it.
  const sources = fieldSources(field) ?? [];
  const out: EntityMatch[] = [];

  if (sources.includes("transaction")) {
    for (const t of context.transactions) {
      // Access by key; MatchableField values are all valid Transaction keys
      // for the fields registered as 'transaction' in FIELD_SOURCES.
      if ((t as unknown as Record<string, unknown>)[field] === value) {
        out.push(t.is_fraud ? { kind: "fraud", tx: t } : { kind: "auth", tx: t });
      }
    }
  }

  if (sources.includes("login")) {
    for (const l of context.logins) {
      if ((l as unknown as Record<string, unknown>)[field] === value) {
        out.push({ kind: "login", login: l });
      }
    }
  }

  if (sources.includes("account_event")) {
    for (const e of context.accountEvents ?? []) {
      if ((e as unknown as Record<string, unknown>)[field] === value) {
        out.push({ kind: "account_event", event: e });
      }
    }
  }

  if (sources.includes("transfer")) {
    for (const t of context.transfers ?? []) {
      if ((t as unknown as Record<string, unknown>)[field] === value) {
        out.push({ kind: "transfer", transfer: t });
      }
    }
  }

  for (const e of genericWith(field, context)) {
    // Strict equality; an absent/null field is not a group (value "" matches nothing).
    if (e.fields[field] === value && value !== "") out.push({ kind: "entity", entity: e });
  }

  // Chronological - every returnable kind carries a timestamp (places are
  // never returned per FIELD_SOURCES). For session threads this order IS
  // the kill-chain narrative.
  return out.sort((a, b) => matchTimestamp(a).localeCompare(matchTimestamp(b)));
}

function matchTimestamp(m: EntityMatch): string {
  switch (m.kind) {
    case "login": return m.login.timestamp;
    case "account_event": return m.event.timestamp;
    case "transfer": return m.transfer.timestamp;
    case "place": return "";
    case "entity": return m.entity.timestamp > 0 ? new Date(m.entity.timestamp).toISOString() : "";
    default: return m.tx.timestamp;
  }
}

/** Median match-count across every OTHER distinct value of `field` in
 *  `context` - the "typical size of a peer group" that MatchBadge's tone rule
 *  compares a count against (baseline 0 = no established norm). Empty and
 *  missing values are not groups (a card-not-present row has no terminal). */
export function matchBaseline(field: MatchableField, ownValue: string, context: PivotContext): number {
  const sources = fieldSources(field) ?? [];
  const pools: (readonly object[])[] = [];
  if (sources.includes("transaction")) pools.push(context.transactions);
  if (sources.includes("login")) pools.push(context.logins);
  if (sources.includes("account_event")) pools.push(context.accountEvents ?? []);
  if (sources.includes("transfer")) pools.push(context.transfers ?? []);
  pools.push(genericWith(field, context).map((e) => e.fields));
  const counts = new Map<string, number>();
  for (const row of pools.flat()) {
    const v = (row as Record<string, unknown>)[field];
    if (typeof v === "string" && v !== "") counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const others = [...counts.entries()]
    .filter(([v]) => v !== ownValue)
    .map(([, n]) => n)
    .sort((a, b) => a - b);
  return others.length === 0 ? 0 : others[Math.floor(others.length / 2)];
}

/** Badge inputs for a session thread. count = events in THIS session
 *  (inspected entity included - consistent with every other badge).
 *  baseline = median size of the OTHER sessions in the dataset, so
 *  MatchBadge's existing tone rule (ratio >= 3 -> red) flags a
 *  multi-stage session against login-only baseline sessions with no
 *  new thresholds. Pure; data-derived; deterministic. */
export function sessionMatchStats(
  sessionId: string,
  data: { logins: LoginEvent[]; accountEvents: AccountEvent[]; transfers: Transfer[] },
): { count: number; baseline: number } {
  const sizes = new Map<string, number>();
  const bump = (sid: string | null | undefined) => {
    if (!sid) return;
    sizes.set(sid, (sizes.get(sid) ?? 0) + 1);
  };
  for (const l of data.logins) bump(l.session_id);
  for (const e of data.accountEvents) bump(e.session_id);
  for (const t of data.transfers) bump(t.session_id);

  const count = sizes.get(sessionId) ?? 0;
  const others = [...sizes.entries()]
    .filter(([id]) => id !== sessionId)
    .map(([, n]) => n)
    .sort((a, b) => a - b);
  const baseline = others.length === 0 ? 0 : others[Math.floor(others.length / 2)];
  return { count, baseline };
}
