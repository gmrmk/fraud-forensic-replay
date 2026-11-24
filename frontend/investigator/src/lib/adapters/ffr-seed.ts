/**
 * First adapter: FFR seed schema → generic Entity shape.
 * Bridges Transaction | LoginEvent | Place to Entity. Future
 * adapters (Websocket-ingested schemas) follow the same shape.
 */
import type { Entity } from "../entity";
import type {
  AccountEvent,
  LoginEvent,
  Place,
  SelectedEntity,
  Transaction,
  Transfer,
} from "../../types";

const TX_PIVOTABLE_FIELDS = [
  "acquirer", "pos_entry_mode", "merchant_country",
  "mcc", "merchant_name", "card_id", "auth_source",
] as const;

// session_id keeps the ATO session thread unbroken across all three
// behavioral lanes (login -> account_event -> transfer).
const LOGIN_PIVOTABLE_FIELDS = ["ip_asn", "device_fp", "session_id"] as const;

export function transactionToEntity(tx: Transaction): Entity {
  return {
    id: tx.id,
    kind: tx.is_fraud ? "fraud" : "auth",
    timestamp: Date.parse(tx.timestamp),
    coords: { lat: tx.merchant_lat, lng: tx.merchant_lng },
    fields: tx as unknown as Record<string, unknown>,
    displayMetadata: {
      primaryLabel: `$${tx.amount.toFixed(2)} · ${tx.merchant_name}`,
      secondaryLabel: `${tx.mcc} · ${tx.merchant_country}`,
      paletteKind: tx.is_fraud ? "fraud" : "auth",
      pivotableFields: TX_PIVOTABLE_FIELDS,
    },
  };
}

export function loginToEntity(login: LoginEvent): Entity {
  return {
    id: login.id,
    kind: "login",
    timestamp: Date.parse(login.timestamp),
    coords: { lat: login.ip_lat, lng: login.ip_lng },
    fields: login as unknown as Record<string, unknown>,
    displayMetadata: {
      primaryLabel: login.device_fp,
      secondaryLabel: `${login.outcome} · ${login.ip_type}`,
      paletteKind: "login",
      pivotableFields: LOGIN_PIVOTABLE_FIELDS,
    },
  };
}

export function placeToEntity(place: Place): Entity {
  return {
    id: place.id,
    kind: "place",
    // Places are static reference geometry - no temporal anchor.
    // Sentinel 0 means "always-on overlay, not timeline-positioned."
    timestamp: 0,
    coords: { lat: place.lat, lng: place.lng },
    fields: place as unknown as Record<string, unknown>,
    displayMetadata: {
      primaryLabel: place.name,
      secondaryLabel: place.category,
      paletteKind: "place",
      pivotableFields: [],
    },
  };
}

/** Behavioral kill-chain event (email change, payee add): timeline-only,
 *  coords null - the globe deliberately shows nothing for an ATO. */
export function accountEventToEntity(ev: AccountEvent): Entity {
  const delta =
    ev.kind === "profile_change" ? `${ev.field}: ${ev.old_value} → ${ev.new_value}` : "new payee";
  return {
    id: ev.id,
    kind: "account_event",
    timestamp: Date.parse(ev.timestamp),
    coords: null,
    fields: ev as unknown as Record<string, unknown>,
    displayMetadata: {
      primaryLabel: ev.kind === "profile_change" ? `${ev.field} changed` : "payee added",
      secondaryLabel: delta,
      paletteKind: "account_event",
      pivotableFields: ["session_id"],
    },
  };
}

/** Money movement (Tamsinmere/wire): timeline-only, coords null. A blocked wire
 *  carries its decline_reason as the secondary label - the system visibly
 *  catching wire #2 is the story's climax. */
export function transferToEntity(tr: Transfer): Entity {
  return {
    id: tr.id,
    kind: "transfer",
    timestamp: Date.parse(tr.timestamp),
    coords: null,
    fields: tr as unknown as Record<string, unknown>,
    displayMetadata: {
      primaryLabel: `$${tr.amount.toFixed(2)} · ${tr.rail}`,
      secondaryLabel:
        tr.status === "blocked" ? `BLOCKED · ${tr.decline_reason ?? "declined"}` : tr.status,
      paletteKind: "transfer",
      pivotableFields: ["session_id"],
    },
  };
}

export function selectedToEntity(sel: SelectedEntity): Entity {
  if (sel.kind === "auth" || sel.kind === "fraud") return transactionToEntity(sel.tx);
  if (sel.kind === "login") return loginToEntity(sel.login);
  if (sel.kind === "place") return placeToEntity(sel.place);
  if (sel.kind === "account_event") return accountEventToEntity(sel.event);
  if (sel.kind === "transfer") return transferToEntity(sel.transfer);
  if (sel.kind === "entity") return sel.entity;
  // Exhaustiveness guard: if SelectedEntity gains a new variant, this line errors at compile time.
  const _exhaustive: never = sel;
  throw new Error(`Unknown SelectedEntity kind: ${JSON.stringify(_exhaustive)}`);
}
