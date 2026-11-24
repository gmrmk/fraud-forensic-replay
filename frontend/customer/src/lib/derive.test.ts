import { describe, it, expect } from "vitest";
import { visibleTxns, currentBalance, fraudAlerted, lagosAlert, isDeclined, greetingFor, dayLine } from "./derive";
import type { Transaction } from "./types";

const tx = (id: string, iso: string, over: Partial<Transaction> = {}): Transaction => ({
  id, card_id: "c1", timestamp: iso, amount: 10, merchant_name: "M", merchant_lat: 0, merchant_lng: 0,
  merchant_country: "US", mcc: "5411", category: "Groceries",
  is_card_present: 1, is_fraud: 0, balance_after: 100, ...over,
});

const T0 = "2026-06-03T03:00:00Z";
const T1 = "2026-06-03T22:00:00Z";
const T2 = "2026-06-04T18:42:00Z"; // Lagos fraud

const data: Transaction[] = [
  tx("a", T0, { balance_after: 2155.92 }),
  tx("b", T1, { balance_after: 2367.32 }),
  tx("c", T2, { is_fraud: 1, balance_after: 2847.32, merchant_country: "NG" }),
];

describe("visibleTxns", () => {
  it("includes only txns at or before t, newest first", () => {
    const v = visibleTxns(data, Date.parse(T1));
    expect(v.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("excludes the future fraud txn before it posts", () => {
    expect(visibleTxns(data, Date.parse(T1)).some((x) => x.id === "c")).toBe(false);
  });
});

describe("currentBalance", () => {
  it("is the balance_after of the latest visible txn", () => {
    expect(currentBalance(visibleTxns(data, Date.parse(T1)))).toBe(2367.32);
  });
  it("is 0 when nothing is visible yet", () => {
    expect(currentBalance(visibleTxns(data, Date.parse(T0) - 1))).toBe(0);
  });
});

describe("fraudAlerted", () => {
  it("flips true once a fraud txn is visible", () => {
    expect(fraudAlerted(visibleTxns(data, Date.parse(T1)))).toBe(false);
    expect(fraudAlerted(visibleTxns(data, Date.parse(T2)))).toBe(true);
  });
});

// Marcus's real hand-off: the last clean Houston swipe, three online micro-charges (card testing,
// Houston-located, card-not-present), then four card-present charges in Lagos.
describe("lagosAlert", () => {
  const hou = { merchant_lat: 29.777, merchant_lng: -95.546 };
  const lag = { merchant_lat: 6.5364, merchant_lng: 3.3972, merchant_country: "NG", is_fraud: 1 };
  const marcus: Transaction[] = [
    tx("grocery", "2026-05-26T22:00:00-05:00", hou),
    tx("t1", "2026-05-21T09:14:00-05:00", { ...hou, is_fraud: 1, is_card_present: 0 }),
    tx("t2", "2026-05-21T09:15:00-05:00", { ...hou, is_fraud: 1, is_card_present: 0 }),
    tx("t3", "2026-05-21T09:17:00-05:00", { ...hou, is_fraud: 1, is_card_present: 0 }),
    tx("atm1", "2026-05-27T07:41:00-05:00", lag),
    tx("atm2", "2026-05-27T07:42:00-05:00", lag),
    tx("mall", "2026-05-27T07:45:00-05:00", { ...lag, merchant_lat: 6.5324, merchant_lng: 3.4012 }),
    tx("market", "2026-05-27T07:49:00-05:00", { ...lag, merchant_lat: 6.5384, merchant_lng: 3.4042 }),
  ];
  it("stays silent while only the Houston card-testing charges are visible", () => {
    expect(lagosAlert(visibleTxns(marcus, Date.parse("2026-05-26T23:00:00-05:00")))).toBeNull();
  });
  it("counts only the card-present charges in Lagos, not the online micro-charges", () => {
    expect(lagosAlert(visibleTxns(marcus, Date.parse("2026-05-27T08:00:00-05:00")))?.count).toBe(4);
  });
  it("measures from the last domestic swipe the way the investigator does (6,526 mi, 9h 41m)", () => {
    const a = lagosAlert(visibleTxns(marcus, Date.parse("2026-05-27T08:00:00-05:00")));
    expect(Math.round(a!.miles)).toBe(6526);
    expect(a!.minutes).toBe(581);
  });
  // Test 4, a pin (passes before the change): with no declined row the alert is what it was.
  // The miles value was read from a run on the code before the declined change.
  it("pin: with no declined row the alert is unchanged (count, exact miles, minutes)", () => {
    const a = lagosAlert(visibleTxns(marcus, Date.parse("2026-05-27T08:00:00-05:00")));
    expect(a!.count).toBe(4);
    expect(a!.miles).toBeCloseTo(6525.661038621894, 6);
    expect(a!.minutes).toBe(581);
  });

  // Tests 2 and 3: the first Lagos attempt was declined (auth response "05").
  const withDeclinedFirst = marcus.map((x) => (x.id === "atm1" ? { ...x, auth_response_code: "05" } : x));
  it("does not count the declined attempt as a charge, and measures from it all the same", () => {
    const a = lagosAlert(visibleTxns(withDeclinedFirst, Date.parse("2026-05-27T08:00:00-05:00")));
    expect(a!.count).toBe(3);
    expect(a!.miles).toBeCloseTo(6525.661038621894, 6);
    expect(a!.minutes).toBe(581);
  });
  it("with only the declined row visible it returns count 0 with the pair's miles and minutes", () => {
    const a = lagosAlert(visibleTxns(withDeclinedFirst, Date.parse("2026-05-27T07:41:30-05:00")));
    expect(a).not.toBeNull();
    expect(a!.count).toBe(0);
    expect(a!.miles).toBeCloseTo(6525.661038621894, 6);
    expect(a!.minutes).toBe(581);
  });
});

// Test 1.
describe("isDeclined", () => {
  it("is true for a response code that is not 00", () => {
    expect(isDeclined(tx("d", T0, { auth_response_code: "05" }))).toBe(true);
  });
  it("is false for 00, a missing field, null and the empty string", () => {
    expect(isDeclined(tx("e", T0, { auth_response_code: "00" }))).toBe(false);
    expect(isDeclined(tx("f", T0))).toBe(false);
    expect(isDeclined(tx("g", T0, { auth_response_code: null }))).toBe(false);
    expect(isDeclined(tx("h", T0, { auth_response_code: "" }))).toBe(false);
  });
});

describe("greeting and date follow the replay clock (Houston time), not today", () => {
  const at = (iso: string) => Date.parse(iso);
  it("morning of the Lagos charges", () => {
    expect(greetingFor(at("2026-05-27T07:50:00-05:00"))).toBe("Good morning");
    expect(dayLine(at("2026-05-27T07:50:00-05:00"))).toBe("Wednesday, May 27");
  });
  it("afternoon and evening", () => {
    expect(greetingFor(at("2026-05-26T14:00:00-05:00"))).toBe("Good afternoon");
    expect(greetingFor(at("2026-05-26T22:00:00-05:00"))).toBe("Good evening");
  });
});
