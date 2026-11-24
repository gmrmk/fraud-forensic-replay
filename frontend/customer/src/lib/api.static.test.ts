/**
 * In a static build the customer app reads the exported files for the card case
 * instead of the backend. The site serves this app from `customer/`, one level below
 * the export, so every path climbs one directory.
 */
import { it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./build-flags", () => ({ IS_STATIC_BUILD: true }));

import { fetchAccount, fetchClock, fetchTransactions } from "./api";

let asked: string[];

beforeEach(() => {
  asked = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      return { ok: true, json: async () => ({}) };
    }),
  );
});
afterEach(() => { vi.unstubAllGlobals(); });

it("reads the account, the clock default and the card's transactions from the export", async () => {
  await fetchAccount();
  await fetchClock();
  await fetchTransactions("card-marcus-visa-001");
  expect(asked.map((u) => u.replace(/^.*static-api\//, "static-api/"))).toEqual([
    "static-api/card-fraud/account/_.json",
    "static-api/card-fraud/clock/_.json",
    // The case bundle is the cardholder's own transactions (the exporter checks this).
    "static-api/card-fraud/transactions/_.json",
  ]);
  for (const url of asked) expect(url).toContain("../static-api/");
});
