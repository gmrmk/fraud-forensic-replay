import { create } from "zustand";
import { useEffect } from "react";
import type { AccountSummary, Transaction } from "../lib/types";
import { fetchAccount, fetchTransactions } from "../lib/api";
import { startClock } from "./clock";

interface DataState {
  account: AccountSummary | null;
  txns: Transaction[];
  error: string | null;
  load: () => Promise<void>;
}

export const useData = create<DataState>((set) => ({
  account: null,
  txns: [],
  error: null,
  load: async () => {
    try {
      const account = await fetchAccount();
      const txns = await fetchTransactions(account.card_id);
      set({ account, txns, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to load account" });
    }
  },
}));

/** Mount-once: load Marcus's account + txns and start the clock (backend poll, or the
 *  channel in a static build). */
export function useBootstrap(): void {
  useEffect(() => {
    void useData.getState().load();
    const stop = startClock();
    return stop;
  }, []);
}
