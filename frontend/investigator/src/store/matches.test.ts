import { describe, it, expect, beforeEach } from "vitest";
import { useMatches } from "./matches";
import { useSelection } from "./selection";
import { useSessionFilter } from "./session-filter";
import type { LoginEvent, Transaction } from "../types";

function fakeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1", card_id: "c", account_id: "a",
    amount: 100, merchant_name: "M", merchant_lat: 0, merchant_lng: 0,
    merchant_country: "US", mcc: "5411", category: "g",
    timestamp: "2026-05-26T20:00:00Z", is_card_present: 1, is_fraud: 0,
    balance_after: 100, auth_response_code: "00", pos_entry_mode: "chip",
    network_ref_number: "N", terminal_id: "T", acquirer: "A",
    auth_source: "issuer", risk_score: 100, is_3ds: 0, currency: "USD",
    ...overrides,
  };
}

/** Narrow the union for assertions - field-mode tests read field/value/parentKind. */
function fieldActive() {
  const a = useMatches.getState().active;
  return a?.mode === "field" ? a : null;
}

describe("useMatches store", () => {
  beforeEach(() => {
    useMatches.setState({ active: null });
    useSelection.setState({ selected: null });
  });

  it("starts with active = null", () => {
    expect(useMatches.getState().active).toBeNull();
  });

  it("open() sets field mode with active.field + active.value", () => {
    useMatches.getState().open("acquirer", "Zamberi Pay");
    const a = fieldActive();
    expect(a?.field).toBe("acquirer");
    expect(a?.value).toBe("Zamberi Pay");
  });

  it("open() infers parentKind from current selection (fraud)", () => {
    const tx = fakeTx({ is_fraud: 1 });
    useSelection.getState().selectTransaction(tx);
    useMatches.getState().open("mcc", "5411");
    expect(fieldActive()?.parentKind).toBe("fraud");
  });

  it("open() defaults parentKind to 'auth' with no selection (transaction field)", () => {
    useMatches.getState().open("mcc", "5411");
    expect(fieldActive()?.parentKind).toBe("auth");
  });

  it("open() derives parentKind from field sources when no selection (login-only field → login)", () => {
    // ip_asn and device_fp are login-only per FIELD_SOURCES; defaulting to
    // "auth" when there is no selection mislabels the Matches window chrome
    // (derive from field rather than hard-code "auth").
    useMatches.getState().open("ip_asn", "Quiltide Fiber Texas AS64496");
    expect(fieldActive()?.parentKind).toBe("login");

    useMatches.setState({ active: null });
    useSelection.setState({ selected: null });
    useMatches.getState().open("device_fp", "Handset-Browser-A1F8");
    expect(fieldActive()?.parentKind).toBe("login");
  });

  it("open() infers parentKind from login selection", () => {
    const login: LoginEvent = {
      id: "l-1", account_id: "a", timestamp: "2026-05-26T20:00:00Z",
      ip: "1", ip_country: "US", ip_lat: 0, ip_lng: 0,
      ip_type: "residential", ip_asn: "AS1", ip_reputation: 90,
      device_fp: "dev", user_agent: "ua", outcome: "success",
      session_id: "s", two_fa_used: 0,
      device_first_seen_at: "2026-01-01T00:00:00Z",
      device_trust: "known", auth_method: "password", challenge_reason: null,
    };
    useSelection.getState().selectLogin(login);
    useMatches.getState().open("device_fp", "dev");
    expect(fieldActive()?.parentKind).toBe("login");
  });

  it("open() REPLACES the active match (no list)", () => {
    useMatches.getState().open("mcc", "5411");
    useMatches.getState().open("acquirer", "Harlowe Bank");
    const a = fieldActive();
    expect(a?.field).toBe("acquirer");
    expect(a?.value).toBe("Harlowe Bank");
  });

  it("close() clears active", () => {
    useMatches.getState().open("mcc", "5411");
    useMatches.getState().close();
    expect(useMatches.getState().active).toBeNull();
  });

  it("openRule() sets rule mode with the decision id", () => {
    useMatches.getState().openRule("decision:account-takeover:gen-login-40927");
    const a = useMatches.getState().active;
    expect(a?.mode).toBe("rule");
    expect(a?.mode === "rule" && a.decisionId).toBe(
      "decision:account-takeover:gen-login-40927",
    );
  });

  it("open() after openRule() replaces rule mode with field mode", () => {
    useMatches.getState().openRule("decision:x");
    useMatches.getState().open("mcc", "5411");
    expect(useMatches.getState().active?.mode).toBe("field");
  });
});

describe("session-filter entanglement (one thread state)", () => {
  beforeEach(() => {
    useMatches.setState({ active: null });
    useSelection.setState({ selected: null });
    useSessionFilter.setState({ selectedSessionId: null });
  });

  it("open(session_id) engages the filter on the same session", () => {
    useMatches.getState().open("session_id", "sess-takeover");
    expect(useSessionFilter.getState().selectedSessionId).toBe("sess-takeover");
  });

  it("open(session_id) retargets the filter from another session", () => {
    useSessionFilter.setState({ selectedSessionId: "sess-37274" });
    useMatches.getState().open("session_id", "sess-takeover");
    expect(useSessionFilter.getState().selectedSessionId).toBe("sess-takeover");
  });

  it("open() on a non-session field clears the filter", () => {
    useMatches.getState().open("session_id", "sess-takeover");
    useMatches.getState().open("acquirer", "Harlowe Bank");
    expect(useSessionFilter.getState().selectedSessionId).toBeNull();
  });

  it("openRule() clears the filter", () => {
    useMatches.getState().open("session_id", "sess-takeover");
    useMatches.getState().openRule("decision:x");
    expect(useSessionFilter.getState().selectedSessionId).toBeNull();
  });

  it("close() clears the filter", () => {
    useMatches.getState().open("session_id", "sess-takeover");
    useMatches.getState().close();
    expect(useSessionFilter.getState().selectedSessionId).toBeNull();
  });
});
