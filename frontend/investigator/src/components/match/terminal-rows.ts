/**
 * useTerminalRows - every card's transactions at one terminal, fetched on demand.
 *
 * The case read (/api/transactions) is scoped to the focal card, so a terminal's
 * other visitors are not in memory. Opening the terminal's matches (or a decision
 * trace naming it) asks the backend for just that terminal's rows
 * (/api/transactions?terminal_id=), keeps them here, and lets the same
 * relatedEntities() walk read them next to the case data via withExtraTransactions.
 * Nothing is loaded into the focal case and nothing is fetched until a terminal is
 * asked for; a terminal is fetched once, a failed read can be retried.
 */
import { create } from "zustand";
import type { Transaction } from "../../types";

export type TerminalRowsStatus = "loading" | "ok" | "error";

interface TerminalRowsState {
  /** Rows by terminal id; present only once that terminal's read succeeded. */
  rows: Record<string, Transaction[]>;
  status: Record<string, TerminalRowsStatus>;
  load: (terminalId: string) => void;
}

export const useTerminalRows = create<TerminalRowsState>((set, get) => ({
  rows: {},
  status: {},
  load: (terminalId) => {
    // '' is "no terminal" (card-not-present), never a terminal to read.
    const current = get().status[terminalId];
    if (terminalId === "" || current === "loading" || current === "ok") return;
    set((s) => ({ status: { ...s.status, [terminalId]: "loading" } }));
    fetch(`/api/transactions?terminal_id=${encodeURIComponent(terminalId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`terminal read failed: ${r.status}`);
        return r.json() as Promise<Transaction[]>;
      })
      .then((rows) =>
        set((s) => ({
          rows: { ...s.rows, [terminalId]: rows },
          status: { ...s.status, [terminalId]: "ok" },
        }))
      )
      .catch(() => set((s) => ({ status: { ...s.status, [terminalId]: "error" } })));
  },
}));
