import type { Entity } from "./lib/entity";

/**
 * Shared frontend types. Mirror the backend's transaction + login_events
 * row shapes from `backend/schema.sql` - when the schema changes, this
 * updates.
 */

export interface Transaction {
  id: string;
  card_id: string;
  account_id: string;
  timestamp: string;
  amount: number;
  merchant_name: string;
  merchant_lat: number;
  merchant_lng: number;
  merchant_country: string;
  mcc: string;
  category: string;
  is_card_present: number;
  is_fraud: number;
  balance_after: number;
  // Bank-grade enrichment (ISO 8583-ish fields)
  auth_response_code: string;
  pos_entry_mode: string;
  network_ref_number: string;
  terminal_id: string;
  acquirer: string;
  auth_source: string;
  risk_score: number;
  is_3ds: number;
  currency: string;
  // Trained card-fraud scorecard, LEFT-JOINed from ml_scores by /api/transactions.
  // Keys are absent when the pack has no ml_scores table and null when this
  // transaction was never scored. A rank score + percentile, NOT a calibrated
  // probability -- never render it as "% fraud".
  ml_score?: number | null;
  ml_percentile?: number | null;
  ml_model_version?: string | null;
}

/** Login outcome values must match the CHECK constraint in schema.sql. */
export type LoginOutcome =
  | "success"
  | "challenge_required"
  | "challenge_passed"
  | "challenge_failed"
  | "failed";

export interface LoginEvent {
  id: string;
  account_id: string;
  timestamp: string;
  ip: string;
  ip_country: string;
  ip_lat: number;
  ip_lng: number;
  device_fp: string;
  user_agent: string;
  outcome: LoginOutcome;
  two_fa_used: number;
  // Bank-grade enrichment (FingerprintJS / ThreatMetrix tier)
  session_id: string;
  ip_type: string;
  ip_asn: string;
  ip_reputation: number;
  device_first_seen_at: string;
  device_trust: string;
  auth_method: string;
  challenge_reason: string | null;
}

/** Places context POI from the live /api/places endpoint.
 *  Backed by Google Places API (New) Nearby Search results, cached on
 *  the backend for 30 days per ToS. NOT persisted into the txn DB -
 *  these are context, not entity records. */
export interface Place {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
}

/** 2026-06-10 realism program - the behavioral kill-chain layer (account
 *  takeover). These rows have NO geography by design: the globe deliberately
 *  shows nothing for Case B; they live on the timeline only. */
export interface AccountEvent {
  id: string;
  account_id: string;
  timestamp: string;
  kind: "profile_change" | "payee_add";
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  payee_id: string | null;
  session_id: string;
  is_fraud: number;
}

export interface Transfer {
  id: string;
  account_id: string;
  timestamp: string;
  amount: number;
  payee_id: string;
  rail: "tamsinmere" | "wire";
  status: "sent" | "blocked";
  decline_reason: string | null;
  session_id: string;
  is_fraud: number;
}

/** What the right-side Inspector is showing. Discriminated
 *  union by `kind` so each consumer can type-narrow without ad-hoc
 *  is_fraud / has_outcome / has_category sniffing. */
export type SelectedEntity =
  | { kind: "auth"; tx: Transaction }
  | { kind: "fraud"; tx: Transaction }
  | { kind: "login"; login: LoginEvent }
  | { kind: "place"; place: Place }
  | { kind: "account_event"; event: AccountEvent }
  | { kind: "transfer"; transfer: Transfer }
  // Any manifest-declared kind outside the six above (sign-in, key event, usage...).
  | { kind: "entity"; entity: Entity };
