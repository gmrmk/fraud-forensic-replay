/**
 * Pivot dataset slices - the loaded behavioral arrays, pushed by App after
 * each scenario load, so leaf fields (SessionField's MatchBadge) can compute
 * match counts WITHOUT re-threading dataset props through every inspector
 * (the prop triplication the SessionField extraction killed). Data only -
 * UI state (which match is open) stays in useMatches. `entities` holds the
 * manifest-node (generic) entities: the decision badges and linked counts read them.
 */
import { create } from "zustand";
import type { AccountEvent, LoginEvent, Transaction, Transfer } from "../types";
import type { Entity } from "../lib/entity";

export interface PivotDataState {
  transactions: Transaction[];
  logins: LoginEvent[];
  accountEvents: AccountEvent[];
  transfers: Transfer[];
  entities: Entity[];
  setPivotData: (d: {
    transactions: Transaction[];
    logins: LoginEvent[];
    accountEvents: AccountEvent[];
    transfers: Transfer[];
    entities: Entity[];
  }) => void;
}

export const usePivotData = create<PivotDataState>((set) => ({
  transactions: [],
  logins: [],
  accountEvents: [],
  transfers: [],
  entities: [],
  setPivotData: (d) => set(d),
}));
