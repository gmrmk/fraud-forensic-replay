import { describe, it, expect, beforeEach } from "vitest";
import { useSelection } from "./selection";
import type { Transaction, LoginEvent, Place } from "../types";

const tx: Transaction = {
  id: "tx-1",
  card_id: "card-x",
  account_id: "acct-x",
  timestamp: "2026-05-01T08:30:00-05:00",
  amount: 4.58,
  merchant_name: "Test Cafe",
  merchant_lat: 29.77,
  merchant_lng: -95.55,
  merchant_country: "US",
  mcc: "5814",
  category: "coffee",
  is_card_present: 1,
  is_fraud: 0,
  balance_after: 4.58,
  // bank-grade fixture defaults
  auth_response_code: "00",
  pos_entry_mode: "chip",
  network_ref_number: "NRN000000001",
  terminal_id: "LAD-1234567",
  acquirer: "Ladleton Pay",
  auth_source: "issuer",
  risk_score: 45,
  is_3ds: 0,
  currency: "USD",
};

const fraudTx: Transaction = { ...tx, id: "tx-fraud", is_fraud: 1 };

const login: LoginEvent = {
  id: "login-1",
  account_id: "acct-x",
  timestamp: "2026-05-01T08:00:00-05:00",
  ip: "10.64.12.34",
  ip_country: "US",
  ip_lat: 29.77,
  ip_lng: -95.55,
  device_fp: "Handset-Browser-A1F8",
  user_agent: "ua",
  outcome: "success",
  two_fa_used: 0,
  // bank-grade fixture defaults
  session_id: "sess-20260501080000-1234",
  ip_type: "residential",
  ip_asn: "Quiltide Fiber Texas (AS64496)",
  ip_reputation: 95,
  device_first_seen_at: "2023-06-20",
  device_trust: "known",
  auth_method: "password",
  challenge_reason: null,
};

const place: Place = {
  id: "p1",
  name: "Cobstead Grocers",
  category: "groceries",
  lat: 29.79,
  lng: -95.53,
};

describe("selection store", () => {
  beforeEach(() => {
    useSelection.getState().clear();
  });

  it("starts with no selection", () => {
    expect(useSelection.getState().selected).toBeNull();
  });

  it("selects an auth transaction with kind=auth when not fraud", () => {
    useSelection.getState().selectTransaction(tx);
    const s = useSelection.getState().selected;
    expect(s?.kind).toBe("auth");
    expect(s?.kind === "auth" && s.tx.id).toBe("tx-1");
  });

  it("selects a fraud transaction with kind=fraud", () => {
    useSelection.getState().selectTransaction(fraudTx);
    const s = useSelection.getState().selected;
    expect(s?.kind).toBe("fraud");
  });

  it("selects a login with kind=login", () => {
    useSelection.getState().selectLogin(login);
    const s = useSelection.getState().selected;
    expect(s?.kind).toBe("login");
    expect(s?.kind === "login" && s.login.id).toBe("login-1");
  });

  it("selects a place with kind=place", () => {
    useSelection.getState().selectPlace(place);
    const s = useSelection.getState().selected;
    expect(s?.kind).toBe("place");
    expect(s?.kind === "place" && s.place.id).toBe("p1");
  });

  it("clear() resets selection to null", () => {
    useSelection.getState().selectTransaction(tx);
    useSelection.getState().clear();
    expect(useSelection.getState().selected).toBeNull();
  });

  it("selecting a new entity replaces the previous", () => {
    useSelection.getState().selectTransaction(tx);
    useSelection.getState().selectLogin(login);
    const s = useSelection.getState().selected;
    expect(s?.kind).toBe("login");
  });
});
