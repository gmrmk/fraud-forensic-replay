import { it, expect } from "vitest";
import { filterTxns } from "./filter";
import type { Transaction } from "./types";

const base: Transaction = { id:"x", card_id:"c", timestamp:"2026-06-03T10:00:00Z", amount:42,
  merchant_name:"Cobstead Grocers Bunker Hill", merchant_lat:0, merchant_lng:0, merchant_country:"US", mcc:"5411", category:"Groceries",
  is_card_present:1, is_fraud:0, balance_after:100 };
const rows: Transaction[] = [
  base,
  { ...base, id:"y", merchant_name:"Tidewater Trust Bank ATM", category:"ATM", is_fraud:1, merchant_country:"NG", amount:480 },
  { ...base, id:"z", merchant_name:"Scorcher's Tacos", category:"Dining", amount:12 },
];

it("filters by merchant search (case-insensitive)", () => {
  expect(filterTxns(rows, { q: "scorcher" }).map(r => r.id)).toEqual(["z"]);
});
it("filters by category", () => {
  expect(filterTxns(rows, { category: "Groceries" }).map(r => r.id)).toEqual(["x"]);
});
it("filters flagged only", () => {
  expect(filterTxns(rows, { flaggedOnly: true }).map(r => r.id)).toEqual(["y"]);
});
it("filters by min amount", () => {
  expect(filterTxns(rows, { minAmount: 50 }).map(r => r.id)).toEqual(["y"]);
});
