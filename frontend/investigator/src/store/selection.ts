/**
 * Selection store - single source of truth for "which entity is the
 * analyst inspecting right now."
 *
 * One slot. Picking a new entity replaces the previous; there is no
 * stack or history (Gotham uses a stack via keyboard shortcuts). Esc / X button / clicking the basemap clears.
 *
 * The discriminated union `SelectedEntity` is defined in src/types.ts;
 * keep store + types co-located in spirit even though split for the
 * one-file-one-responsibility rule.
 */
import { create } from "zustand";
import type { Entity } from "../lib/entity";
import type {
  AccountEvent,
  LoginEvent,
  Place,
  SelectedEntity,
  Transaction,
  Transfer,
} from "../types";

export interface SelectionState {
  selected: SelectedEntity | null;
  selectTransaction: (tx: Transaction) => void;
  selectLogin: (login: LoginEvent) => void;
  selectPlace: (place: Place) => void;
  selectAccountEvent: (event: AccountEvent) => void;
  selectTransfer: (transfer: Transfer) => void;
  selectEntity: (entity: Entity) => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  selected: null,
  selectTransaction: (tx) =>
    set({
      selected: tx.is_fraud
        ? { kind: "fraud", tx }
        : { kind: "auth", tx },
    }),
  selectLogin: (login) => set({ selected: { kind: "login", login } }),
  selectPlace: (place) => set({ selected: { kind: "place", place } }),
  selectAccountEvent: (event) => set({ selected: { kind: "account_event", event } }),
  selectTransfer: (transfer) => set({ selected: { kind: "transfer", transfer } }),
  selectEntity: (entity) => set({ selected: { kind: "entity", entity } }),
  clear: () => set({ selected: null }),
}));
