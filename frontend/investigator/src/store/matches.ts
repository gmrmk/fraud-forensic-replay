/**
 * useMatches - single active match set (or null).
 *
 * Replaces usePivotStore for the Spec 2 redesign. parentKind is
 * inferred from useSelection at open() time per the established
 * selection-driven-inference pattern (see prior session's pivot-
 * palette fix). Drives MatchesTable rendering.
 */
import { create } from "zustand";
import { useSelection } from "./selection";
import { useSessionFilter } from "./session-filter";
import { fieldSources, type MatchableField } from "../lib/matches";
import type { EntityKind } from "../lib/entity";

/** Two breakout modes, one window (user-ratified 2026-06-11): field mode lists
 *  entities matching field=value (the ×N badge path); rule mode stacks the
 *  rule's authored brief card above the decision's matched events (the
 *  DecisionPill path). */
export type ActiveMatch =
  | { mode: "field"; field: MatchableField; value: string; parentKind: EntityKind }
  | { mode: "rule"; decisionId: string };

export interface MatchesState {
  active: ActiveMatch | null;
  open: (field: MatchableField, value: string) => void;
  openRule: (decisionId: string) => void;
  close: () => void;
}

/** One-thread invariant: the session FILTER is on
 *  IFF this window is open in field mode on session_id. The open window IS the
 *  filter's indicator and clear affordance (the timeline chip is gone), so the
 *  filter can never be stranded on-screen without a way out. Every transition
 *  through this store re-syncs the filter to hold the invariant. */
function syncSessionFilter(next: ActiveMatch | null): void {
  const sf = useSessionFilter.getState();
  if (next?.mode === "field" && next.field === "session_id") {
    if (sf.selectedSessionId !== next.value) sf.toggleSession(next.value);
  } else if (sf.selectedSessionId !== null) {
    sf.clearSession();
  }
}

export const useMatches = create<MatchesState>((set) => ({
  active: null,
  open: (field, value) => {
    const selected = useSelection.getState().selected;
    // When no entity is selected, infer a palette kind from the field's
    // source registry rather than hard-coding "auth". Login-only fields
    // (ip_asn, device_fp) open with the login palette; all others
    // default to "auth" (the transaction palette - neutral for mixed
    // fields like session_id). Hard-coding "auth" when the field is
    // login-only mislabels the Matches window chrome.
    const parentKind: EntityKind =
      (selected?.kind === "entity" ? selected.entity.kind : selected?.kind) ??
      (fieldSources(field)?.every((s) => s === "login") ? "login" : "auth");
    const next: ActiveMatch = { mode: "field", field, value, parentKind };
    syncSessionFilter(next);
    set({ active: next });
  },
  openRule: (decisionId) => {
    syncSessionFilter(null);
    set({ active: { mode: "rule", decisionId } });
  },
  close: () => {
    syncSessionFilter(null);
    set({ active: null });
  },
}));
