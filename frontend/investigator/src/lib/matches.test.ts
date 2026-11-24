import { describe, it, expect } from "vitest";
import {
  relatedEntities,
  sessionMatchStats,
  FIELD_SOURCES,
  isMatchableField,
  matchBaseline,
  withExtraTransactions,
} from "./matches";
import type { AccountEvent, LoginEvent, Transaction, Transfer } from "../types";

// Minimal Transaction factory - all required fields populated with
// sensible defaults; overrides win. Keeps test data declarative.
function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-default",
    card_id: "card-marcus",
    account_id: "acct-marcus",
    timestamp: "2026-05-26T10:00:00-05:00",
    amount: 50,
    merchant_name: "Default Cafe",
    merchant_lat: 29.77,
    merchant_lng: -95.55,
    merchant_country: "US",
    mcc: "5814",
    category: "coffee",
    is_card_present: 1,
    is_fraud: 0,
    balance_after: 50,
    auth_response_code: "00",
    pos_entry_mode: "chip",
    network_ref_number: "NRN0001",
    terminal_id: "T-1",
    acquirer: "Halvard Settlement Services",
    auth_source: "issuer",
    risk_score: 100,
    is_3ds: 0,
    currency: "USD",
    ...overrides,
  };
}

function login(overrides: Partial<LoginEvent> = {}): LoginEvent {
  return {
    id: "login-default",
    account_id: "acct-marcus",
    timestamp: "2026-05-26T08:00:00-05:00",
    ip: "10.64.12.34",
    ip_country: "US",
    ip_lat: 29.77,
    ip_lng: -95.55,
    device_fp: "Handset-Browser-A1F8",
    user_agent: "ua",
    outcome: "success",
    two_fa_used: 0,
    session_id: "s-1",
    ip_type: "residential",
    ip_asn: "Quiltide Fiber Texas AS64496",
    ip_reputation: 90,
    device_first_seen_at: "2025-01-01T00:00:00-05:00",
    device_trust: "known",
    auth_method: "password",
    challenge_reason: null,
    ...overrides,
  };
}

function accountEvent(overrides: Partial<AccountEvent> = {}): AccountEvent {
  return {
    id: "ae-default",
    account_id: "acct-priya",
    timestamp: "2026-05-25T10:14:00-05:00",
    kind: "profile_change",
    field: "email",
    old_value: "a@x.example",
    new_value: "b@y.example",
    payee_id: null,
    session_id: "sess-takeover",
    is_fraud: 1,
    ...overrides,
  };
}

function transfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: "tr-default",
    account_id: "acct-priya",
    timestamp: "2026-05-25T10:36:00-05:00",
    amount: 4200,
    payee_id: "payee-dr",
    rail: "wire",
    status: "sent",
    decline_reason: null,
    session_id: "sess-takeover",
    is_fraud: 1,
    ...overrides,
  };
}

describe("FIELD_SOURCES registry", () => {
  it("covers all MatchableField values exhaustively", () => {
    const expected = [
      "acquirer", "pos_entry_mode", "merchant_country", "mcc",
      "merchant_name", "card_id", "auth_source", "ip_asn", "device_fp",
      "session_id", "terminal_id",
    ];
    expect(Object.keys(FIELD_SOURCES).sort()).toEqual(expected.sort());
  });
});

describe("relatedEntities", () => {
  it("returns empty for unmatched value", () => {
    const ctx = { transactions: [tx({ acquirer: "Ladleton Pay" })], logins: [], places: [] };
    expect(relatedEntities("acquirer", "NonexistentAcquirer", ctx)).toEqual([]);
  });

  it("returns empty for empty dataset", () => {
    expect(relatedEntities("acquirer", "Ladleton Pay", { transactions: [], logins: [], places: [] })).toEqual([]);
  });

  it("matches transaction fields with auth kind by default", () => {
    const t1 = tx({ id: "t1", acquirer: "Zamberi Pay", is_fraud: 0 });
    const t2 = tx({ id: "t2", acquirer: "Zamberi Pay", is_fraud: 0 });
    const t3 = tx({ id: "t3", acquirer: "Ladleton Pay", is_fraud: 0 });
    const ctx = { transactions: [t1, t2, t3], logins: [], places: [] };
    const matches = relatedEntities("acquirer", "Zamberi Pay", ctx);
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.kind === "auth")).toBe(true);
    const ids = matches.map((m) => (m.kind === "auth" ? m.tx.id : ""));
    expect(ids.sort()).toEqual(["t1", "t2"]);
  });

  it("uses fraud kind when transaction is_fraud is truthy", () => {
    const t1 = tx({ id: "t1", acquirer: "Zamberi Pay", is_fraud: 1 });
    const ctx = { transactions: [t1], logins: [], places: [] };
    const matches = relatedEntities("acquirer", "Zamberi Pay", ctx);
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe("fraud");
  });

  it("matches pos_entry_mode (the chip_fallback_swipe signature)", () => {
    const t1 = tx({ id: "t1", pos_entry_mode: "chip_fallback_swipe", is_fraud: 1 });
    const t2 = tx({ id: "t2", pos_entry_mode: "chip_fallback_swipe", is_fraud: 1 });
    const t3 = tx({ id: "t3", pos_entry_mode: "chip", is_fraud: 0 });
    const ctx = { transactions: [t1, t2, t3], logins: [], places: [] };
    expect(relatedEntities("pos_entry_mode", "chip_fallback_swipe", ctx)).toHaveLength(2);
  });

  it("matches merchant_country", () => {
    const t1 = tx({ id: "t1", merchant_country: "NG" });
    const t2 = tx({ id: "t2", merchant_country: "US" });
    expect(relatedEntities("merchant_country", "NG", { transactions: [t1, t2], logins: [], places: [] })).toHaveLength(1);
  });

  it("matches mcc", () => {
    const t1 = tx({ id: "t1", mcc: "5411" });
    const t2 = tx({ id: "t2", mcc: "5411" });
    const t3 = tx({ id: "t3", mcc: "5814" });
    expect(relatedEntities("mcc", "5411", { transactions: [t1, t2, t3], logins: [], places: [] })).toHaveLength(2);
  });

  it("matches login ip_asn (logins side, not transactions)", () => {
    const t1 = tx({ id: "t1" });
    const l1 = login({ id: "l1", ip_asn: "Quiltide Fiber Texas AS64496" });
    const l2 = login({ id: "l2", ip_asn: "Longleaf Cable Houston AS64497" });
    const ctx = { transactions: [t1], logins: [l1, l2], places: [] };
    const matches = relatedEntities("ip_asn", "Quiltide Fiber Texas AS64496", ctx);
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe("login");
    expect(matches[0].kind === "login" && matches[0].login.id).toBe("l1");
  });

  it("matches device_fp on logins", () => {
    const l1 = login({ id: "l1", device_fp: "Handset-Browser-A1F8" });
    const l2 = login({ id: "l2", device_fp: "Laptop-Browser-B2E7" });
    expect(relatedEntities("device_fp", "Handset-Browser-A1F8", { transactions: [], logins: [l1, l2], places: [] })).toHaveLength(1);
  });

  it("does not cross entity kinds: transaction field returns no logins", () => {
    const l1 = login({ id: "l1" });
    expect(relatedEntities("acquirer", "anything", { transactions: [], logins: [l1], places: [] })).toEqual([]);
  });

  it("returns [] for a field not present in FIELD_SOURCES (unmapped pivot field guard)", () => {
    // Cast is intentional - simulates a runtime caller passing an unregistered field.
    const unmapped = "nonexistent_field" as unknown as import("./matches").MatchableField;
    const ctx = { transactions: [tx()], logins: [login()], places: [] };
    expect(relatedEntities(unmapped, "anything", ctx)).toEqual([]);
  });
});

describe("relatedEntities - session_id across behavioral kinds", () => {
  const ctx = {
    transactions: [],
    logins: [login({ id: "l-1", session_id: "sess-takeover", timestamp: "2026-05-25T10:07:00-05:00" })],
    places: [],
    accountEvents: [
      accountEvent({ id: "ae-1", timestamp: "2026-05-25T10:14:00-05:00" }),
      accountEvent({ id: "ae-2", kind: "payee_add", field: null, payee_id: "payee-dr", timestamp: "2026-05-25T10:23:00-05:00" }),
    ],
    transfers: [
      transfer({ id: "tr-1", timestamp: "2026-05-25T10:36:00-05:00" }),
      transfer({ id: "tr-2", amount: 3800, status: "blocked", decline_reason: "velocity_rule", timestamp: "2026-05-25T11:06:00-05:00" }),
      transfer({ id: "tr-3", session_id: "sess-other", timestamp: "2026-05-25T12:00:00-05:00" }),
    ],
  };

  it("returns matches from login + account_event + transfer sources", () => {
    const out = relatedEntities("session_id", "sess-takeover", ctx);
    expect(out).toHaveLength(5);
    expect(out.map((m) => m.kind).sort()).toEqual(
      ["account_event", "account_event", "login", "transfer", "transfer"],
    );
  });

  it("strict equality - a different session id matches nothing shared", () => {
    const out = relatedEntities("session_id", "sess-other", ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("transfer");
  });

  it("returns matches in chronological order", () => {
    const out = relatedEntities("session_id", "sess-takeover", ctx);
    const ids = out.map((m) =>
      m.kind === "login" ? m.login.id
      : m.kind === "account_event" ? m.event.id
      : m.kind === "transfer" ? m.transfer.id
      : m.kind === "place" ? m.place.id
      : m.kind === "entity" ? m.entity.id
      : m.tx.id,
    );
    expect(ids).toEqual(["l-1", "ae-1", "ae-2", "tr-1", "tr-2"]);
  });

  it("tolerates contexts without behavioral arrays (optional fields)", () => {
    const lean = { transactions: [], logins: [login({ session_id: "s-9" })], places: [] };
    expect(relatedEntities("session_id", "s-9", lean)).toHaveLength(1);
  });
});

describe("sessionMatchStats", () => {
  it("counts this session and takes median size of the others as baseline", () => {
    const data = {
      logins: [
        login({ id: "l-a", session_id: "sess-takeover" }),
        login({ id: "l-b", session_id: "s-1" }),
        login({ id: "l-c", session_id: "s-2" }),
        login({ id: "l-d", session_id: "s-3" }),
      ],
      accountEvents: [accountEvent({ id: "ae-a" }), accountEvent({ id: "ae-b" })],
      transfers: [transfer({ id: "tr-a" }), transfer({ id: "tr-b" })],
    };
    const stats = sessionMatchStats("sess-takeover", data);
    expect(stats.count).toBe(5);
    expect(stats.baseline).toBe(1);
  });

  it("returns baseline 0 when this is the only session", () => {
    const data = {
      logins: [login({ session_id: "only" })],
      accountEvents: [],
      transfers: [],
    };
    expect(sessionMatchStats("only", data)).toEqual({ count: 1, baseline: 0 });
  });

  it("returns count 0 for an unknown session", () => {
    const data = { logins: [login({ session_id: "s-1" })], accountEvents: [], transfers: [] };
    expect(sessionMatchStats("missing", data).count).toBe(0);
  });
});

describe("terminal_id as a matchable field", () => {
  it("is registered as a transaction-side field", () => {
    expect(FIELD_SOURCES.terminal_id).toEqual(["transaction"]);
  });

  it("matches transactions at the same terminal across cards, chronologically", () => {
    const a = tx({ id: "a", terminal_id: "ZEL-7731042", timestamp: "2026-05-02T10:00:00-05:00" });
    const b = tx({ id: "b", card_id: "card-other", terminal_id: "ZEL-7731042", timestamp: "2026-05-01T10:00:00-05:00" });
    const c = tx({ id: "c", terminal_id: "T-9" });
    const out = relatedEntities("terminal_id", "ZEL-7731042", { transactions: [a, b, c], logins: [], places: [] });
    expect(out.map((m) => (m.kind === "auth" ? m.tx.id : ""))).toEqual(["b", "a"]);
  });
});

describe("isMatchableField", () => {
  it("accepts registered fields and rejects everything else", () => {
    expect(isMatchableField("terminal_id")).toBe(true);
    expect(isMatchableField("device_fp")).toBe(true);
    expect(isMatchableField("not_a_field")).toBe(false);
    expect(isMatchableField("toString")).toBe(false); // inherited keys are not fields
    expect(isMatchableField(undefined)).toBe(false);
    expect(isMatchableField(7)).toBe(false);
  });
});

describe("withExtraTransactions", () => {
  it("adds rows by id without duplicating or mutating the base context", () => {
    const base = { transactions: [tx({ id: "a" })], logins: [login()], places: [] };
    const merged = withExtraTransactions(base, [tx({ id: "a", amount: 1 }), tx({ id: "b" })]);
    expect(merged.transactions.map((t) => t.id)).toEqual(["a", "b"]);
    expect(merged.transactions[0].amount).toBe(50); // the base row wins
    expect(merged.logins).toBe(base.logins);
    expect(base.transactions).toHaveLength(1);
  });
});

describe("matchBaseline", () => {
  const ctx = (transactions: Transaction[], logins: LoginEvent[] = []) => ({ transactions, logins, places: [] });

  it("is the median size of the OTHER values' groups", () => {
    const rows = [
      tx({ id: "1", mcc: "A" }), tx({ id: "2", mcc: "A" }), tx({ id: "3", mcc: "A" }),
      tx({ id: "4", mcc: "B" }),
      tx({ id: "5", mcc: "C" }), tx({ id: "6", mcc: "C" }), tx({ id: "7", mcc: "C" }),
    ];
    expect(matchBaseline("mcc", "A", ctx(rows))).toBe(3); // others: B=1, C=3 -> upper median 3
  });

  it("is 0 when there is no other value to compare against", () => {
    expect(matchBaseline("mcc", "A", ctx([tx({ mcc: "A" })]))).toBe(0);
  });

  it("ignores empty terminal ids (card-not-present rows carry none)", () => {
    const rows = [tx({ id: "1", terminal_id: "T-1" }), tx({ id: "2", terminal_id: "" }), tx({ id: "3", terminal_id: "" })];
    expect(matchBaseline("terminal_id", "T-1", ctx(rows))).toBe(0);
  });

  it("reads the login side for login-sourced fields", () => {
    const logins = [
      login({ id: "l1", device_fp: "own" }),
      login({ id: "l2", device_fp: "peer" }),
      login({ id: "l3", device_fp: "peer" }),
    ];
    expect(matchBaseline("device_fp", "own", ctx([], logins))).toBe(2);
  });
});
