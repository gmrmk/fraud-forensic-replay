import { describe, it, expect } from "vitest";
import {
  haversineMiles,
  timeDeltaMs,
  impossibleTravelSpeedMph,
  formatTimeDelta,
  formatTs,
  computeBaseline,
} from "./entities";
import type { Transaction } from "../types";

const HOUSTON: [number, number] = [29.7604, -95.3698];
const LAGOS: [number, number] = [6.5244, 3.3792];
const DALLAS: [number, number] = [32.7767, -96.7970];

describe("haversineMiles", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMiles(HOUSTON, HOUSTON)).toBe(0);
  });

  it("Houston→Dallas is ~225 miles (±5)", () => {
    const d = haversineMiles(HOUSTON, DALLAS);
    expect(d).toBeGreaterThan(220);
    expect(d).toBeLessThan(230);
  });

  it("Houston→Lagos is ~6500 miles (±100)", () => {
    // Verified against external haversine calculators: ~6515 mi
    const d = haversineMiles(HOUSTON, LAGOS);
    expect(d).toBeGreaterThan(6400);
    expect(d).toBeLessThan(6600);
  });
});

describe("timeDeltaMs", () => {
  it("subtracts earlier from later and returns positive ms", () => {
    const earlier = "2026-05-26T11:50:00-05:00";
    const later = "2026-05-26T21:30:00-05:00"; // +9h40m later
    const ms = timeDeltaMs(earlier, later);
    expect(ms).toBe(9 * 3600 * 1000 + 40 * 60 * 1000);
  });

  it("returns negative when later < earlier", () => {
    expect(
      timeDeltaMs("2026-05-26T21:30:00-05:00", "2026-05-26T11:50:00-05:00")
    ).toBeLessThan(0);
  });
});

describe("impossibleTravelSpeedMph", () => {
  it("Houston→Lagos in 9h40m requires ~674 mph (still impossible)", () => {
    // ~6515 mi / 9.667 h ≈ 674 mph - above commercial-jet cruise (600)
    const mph = impossibleTravelSpeedMph(
      HOUSTON,
      "2026-05-26T11:50:00-05:00",
      LAGOS,
      "2026-05-26T21:30:00-05:00"
    );
    expect(mph).toBeGreaterThan(650);
    expect(mph).toBeLessThan(700);
  });

  it("returns Infinity when the time delta is zero", () => {
    expect(
      impossibleTravelSpeedMph(
        HOUSTON,
        "2026-05-26T11:50:00-05:00",
        LAGOS,
        "2026-05-26T11:50:00-05:00"
      )
    ).toBe(Infinity);
  });
});

describe("computeBaseline", () => {
  const baseTx: Transaction = {
    id: "x",
    card_id: "card-x",
    account_id: "acct-x",
    timestamp: "2026-05-01T08:00:00-05:00",
    amount: 10,
    merchant_name: "M",
    merchant_lat: 29.77,
    merchant_lng: -95.55,
    merchant_country: "US",
    mcc: "5814",
    category: "coffee",
    is_card_present: 1,
    is_fraud: 0,
    balance_after: 0,
    auth_response_code: "00",
    pos_entry_mode: "chip",
    network_ref_number: "NRN",
    terminal_id: "TID",
    acquirer: "Ladleton Pay",
    auth_source: "issuer",
    risk_score: 50,
    is_3ds: 0,
    currency: "USD",
  };

  it("returns zero stats for empty input", () => {
    const b = computeBaseline([], "card-x", "2026-05-26T00:00:00-05:00");
    expect(b.avgDailySpend).toBe(0);
    expect(b.avgDailyAuths).toBe(0);
    expect(b.topMerchants).toEqual([]);
    expect(b.topCategories).toEqual([]);
  });

  it("computes avg daily spend over the prior 30 days", () => {
    // 30 txs at $10 each across 30 distinct days = $10/day avg
    const txs: Transaction[] = Array.from({ length: 30 }, (_, i) => ({
      ...baseTx,
      id: `tx-${i}`,
      amount: 10,
      timestamp: `2026-05-${String((i % 28) + 1).padStart(2, "0")}T12:00:00-05:00`,
    }));
    const b = computeBaseline(txs, "card-x", "2026-05-29T23:59:00-05:00");
    expect(b.avgDailySpend).toBeGreaterThan(8);
    expect(b.avgDailySpend).toBeLessThan(12);
  });

  it("returns top merchants by count", () => {
    const txs: Transaction[] = [
      { ...baseTx, id: "1", amount: 5, merchant_name: "Cobstead Grocers", timestamp: "2026-05-26T08:00:00-05:00" },
      { ...baseTx, id: "2", amount: 5, merchant_name: "Cobstead Grocers", timestamp: "2026-05-26T09:00:00-05:00" },
      { ...baseTx, id: "3", amount: 5, merchant_name: "Cobstead Grocers", timestamp: "2026-05-26T10:00:00-05:00" },
      { ...baseTx, id: "4", amount: 5, merchant_name: "Gillamwood Gas Station", timestamp: "2026-05-26T11:00:00-05:00" },
    ];
    const b = computeBaseline(txs, "card-x", "2026-05-26T23:00:00-05:00");
    expect(b.topMerchants[0]).toEqual({ name: "Cobstead Grocers", count: 3 });
    expect(b.topMerchants[1]).toEqual({ name: "Gillamwood Gas Station", count: 1 });
  });

  it("excludes fraud transactions from baseline", () => {
    const txs: Transaction[] = [
      { ...baseTx, id: "1", amount: 10, is_fraud: 0, timestamp: "2026-05-26T08:00:00-05:00" },
      { ...baseTx, id: "2", amount: 9999, is_fraud: 1, timestamp: "2026-05-26T09:00:00-05:00" },
    ];
    const b = computeBaseline(txs, "card-x", "2026-05-26T23:00:00-05:00");
    // Fraud $9999 should NOT pull the avg up - 1 clean tx of $10
    // across 30 days = $0.33/day
    expect(b.avgDailySpend).toBeLessThan(20);
  });
});

describe("formatTimeDelta", () => {
  it("formats minutes for sub-hour deltas", () => {
    expect(formatTimeDelta(5 * 60 * 1000)).toBe("5m");
    expect(formatTimeDelta(55 * 60 * 1000)).toBe("55m");
  });

  it("formats h+m for sub-day deltas", () => {
    expect(formatTimeDelta(2 * 3600 * 1000 + 15 * 60 * 1000)).toBe("2h 15m");
  });

  it("formats d+h for multi-day deltas", () => {
    expect(formatTimeDelta(3 * 86400 * 1000 + 4 * 3600 * 1000)).toBe("3d 4h");
  });

  it("formats seconds for sub-minute deltas", () => {
    expect(formatTimeDelta(45 * 1000)).toBe("45s");
  });

  it("formats 0 as '0s'", () => {
    expect(formatTimeDelta(0)).toBe("0s");
  });
});

// formatTs moved here from AuthInspector.tsx so that the Posted row and the From Date row print one
// format. The three strings were taken from the function before the move (and pinned on the rendered
// Posted row in AuthInspector.test.tsx); the dot is built from its code point.
describe("formatTs", () => {
  const DOT = String.fromCharCode(0xb7);

  it("gives the same string as before for three fixed inputs", () => {
    expect(formatTs("2026-05-26T21:14:00Z")).toBe(`Tue May 26 ${DOT} 4:14p CDT`);
    expect(formatTs("2026-05-26T10:07:00-05:00")).toBe(`Tue May 26 ${DOT} 10:07a CDT`);
    expect(formatTs("2026-01-15T03:05:00Z")).toBe(`Wed Jan 14 ${DOT} 9:05p CDT`);
  });

  it("reads the Houston day, not the UTC day", () => {
    // 03:05 UTC on the 15th is the evening of the 14th in Chicago (CST in January).
    expect(formatTs("2026-01-15T03:05:00Z")).toContain("Jan 14");
  });
});
