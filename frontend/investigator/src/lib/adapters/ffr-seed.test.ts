import { describe, it, expect } from "vitest";
import { transactionToEntity, loginToEntity, placeToEntity, accountEventToEntity, transferToEntity, selectedToEntity } from "./ffr-seed";
import type { AccountEvent, LoginEvent, Place, Transaction, Transfer } from "../../types";

function fakeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1", card_id: "c", account_id: "a",
    amount: 100, merchant_name: "Test", merchant_lat: 30, merchant_lng: -95,
    merchant_country: "US", mcc: "5411", category: "g",
    timestamp: "2026-05-26T20:00:00Z", is_card_present: 1, is_fraud: 0,
    balance_after: 100, auth_response_code: "00", pos_entry_mode: "chip",
    network_ref_number: "N", terminal_id: "T", acquirer: "A",
    auth_source: "issuer", risk_score: 100, is_3ds: 0, currency: "USD",
    ...overrides,
  };
}

function fakeLogin(overrides: Partial<LoginEvent> = {}): LoginEvent {
  return {
    id: "l-1", account_id: "a",
    timestamp: "2026-05-26T20:00:00Z",
    ip: "192.0.2.4", ip_country: "US", ip_lat: 40, ip_lng: -74,
    ip_type: "residential", ip_asn: "AS64500", ip_reputation: 90,
    device_fp: "test-device", user_agent: "ua", outcome: "success",
    session_id: "s", two_fa_used: 0,
    device_first_seen_at: "2026-01-01T00:00:00Z",
    device_trust: "known", auth_method: "password", challenge_reason: null,
    ...overrides,
  };
}

describe("transactionToEntity", () => {
  it("auth transaction -> kind 'auth'", () => {
    const e = transactionToEntity(fakeTx({ is_fraud: 0 }));
    expect(e.kind).toBe("auth");
    expect(e.displayMetadata.paletteKind).toBe("auth");
  });
  it("fraud transaction -> kind 'fraud'", () => {
    const e = transactionToEntity(fakeTx({ is_fraud: 1 }));
    expect(e.kind).toBe("fraud");
    expect(e.displayMetadata.paletteKind).toBe("fraud");
  });
  it("populates coords from merchant_lat/merchant_lng", () => {
    const e = transactionToEntity(fakeTx({ merchant_lat: 6.5, merchant_lng: 3.4 }));
    expect(e.coords).toEqual({ lat: 6.5, lng: 3.4 });
  });
  it("primaryLabel formats as '$amount · merchant_name'", () => {
    const e = transactionToEntity(fakeTx({ amount: 890.5, merchant_name: "Heskford Lekki" }));
    expect(e.displayMetadata.primaryLabel).toBe("$890.50 · Heskford Lekki");
  });
  it("secondaryLabel formats as 'mcc · country'", () => {
    const e = transactionToEntity(fakeTx({ mcc: "5411", merchant_country: "NG" }));
    expect(e.displayMetadata.secondaryLabel).toBe("5411 · NG");
  });
  it("timestamp converted to unix ms", () => {
    const e = transactionToEntity(fakeTx({ timestamp: "2026-05-26T20:00:00Z" }));
    expect(e.timestamp).toBe(Date.parse("2026-05-26T20:00:00Z"));
  });
  it("pivotableFields includes acquirer + pos_entry_mode + mcc", () => {
    const e = transactionToEntity(fakeTx());
    expect(e.displayMetadata.pivotableFields).toContain("acquirer");
    expect(e.displayMetadata.pivotableFields).toContain("pos_entry_mode");
    expect(e.displayMetadata.pivotableFields).toContain("mcc");
  });
});

describe("loginToEntity", () => {
  it("maps login -> kind 'login'", () => {
    const e = loginToEntity(fakeLogin());
    expect(e.kind).toBe("login");
    expect(e.displayMetadata.paletteKind).toBe("login");
  });
  it("coords from ip_lat/ip_lng", () => {
    const e = loginToEntity(fakeLogin({ ip_lat: 40.7, ip_lng: -74 }));
    expect(e.coords).toEqual({ lat: 40.7, lng: -74 });
  });
  it("primaryLabel is device_fp", () => {
    const e = loginToEntity(fakeLogin({ device_fp: "Handset-X" }));
    expect(e.displayMetadata.primaryLabel).toBe("Handset-X");
  });
  it("pivotableFields = ip_asn + device_fp + session_id", () => {
    const e = loginToEntity(fakeLogin());
    expect(e.displayMetadata.pivotableFields).toEqual(["ip_asn", "device_fp", "session_id"]);
  });
});

describe("session_id pivotability", () => {
  const fakeAccountEvent: AccountEvent = {
    id: "ae-1", account_id: "a", timestamp: "2026-05-26T20:00:00Z",
    kind: "profile_change", field: "email", old_value: "x@y.example",
    new_value: "z@y.example", payee_id: null, session_id: "s", is_fraud: 1,
  };
  const fakeTransfer: Transfer = {
    id: "tr-1", account_id: "a", timestamp: "2026-05-26T20:00:00Z",
    amount: 500, payee_id: "p", rail: "tamsinmere", status: "sent",
    decline_reason: null, session_id: "s", is_fraud: 1,
  };

  // The session thread is the ATO drill-down spine: every behavioral
  // adapter must expose session_id, or the thread breaks at the login lane.
  it("all three behavioral adapters list session_id as pivotable", () => {
    expect(loginToEntity(fakeLogin()).displayMetadata.pivotableFields).toContain("session_id");
    expect(accountEventToEntity(fakeAccountEvent).displayMetadata.pivotableFields).toContain("session_id");
    expect(transferToEntity(fakeTransfer).displayMetadata.pivotableFields).toContain("session_id");
  });
});

describe("placeToEntity", () => {
  it("maps place -> kind 'place'", () => {
    const p: Place = { id: "p1", name: "Cobstead Grocers", category: "groceries", lat: 29.7, lng: -95.4 };
    const e = placeToEntity(p);
    expect(e.kind).toBe("place");
    expect(e.coords).toEqual({ lat: 29.7, lng: -95.4 });
    expect(e.displayMetadata.primaryLabel).toBe("Cobstead Grocers");
    expect(e.displayMetadata.pivotableFields).toEqual([]);
  });
});

describe("selectedToEntity", () => {
  it("auth SelectedEntity -> Entity with kind auth", () => {
    const tx = fakeTx();
    const e = selectedToEntity({ kind: "auth", tx });
    expect(e.kind).toBe("auth");
    expect(e.id).toBe(tx.id);
  });
  it("fraud SelectedEntity -> Entity with kind fraud", () => {
    const tx = fakeTx({ is_fraud: 1 });
    const e = selectedToEntity({ kind: "fraud", tx });
    expect(e.kind).toBe("fraud");
  });
  it("login SelectedEntity -> Entity with kind login", () => {
    const login = fakeLogin();
    const e = selectedToEntity({ kind: "login", login });
    expect(e.kind).toBe("login");
  });
  it("place SelectedEntity -> Entity with kind place", () => {
    const place: Place = { id: "p1", name: "X", category: "y", lat: 1, lng: 2 };
    const e = selectedToEntity({ kind: "place", place });
    expect(e.kind).toBe("place");
  });
});
