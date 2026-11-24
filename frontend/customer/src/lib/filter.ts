import type { Transaction } from "./types";

export interface TxnFilter { q?: string; category?: string; flaggedOnly?: boolean; minAmount?: number; }

export function filterTxns(txns: readonly Transaction[], f: TxnFilter): Transaction[] {
  const q = f.q?.trim().toLowerCase();
  return txns.filter((t) => {
    if (q && !t.merchant_name.toLowerCase().includes(q)) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.flaggedOnly && t.is_fraud !== 1) return false;
    if (f.minAmount != null && t.amount < f.minAmount) return false;
    return true;
  });
}
