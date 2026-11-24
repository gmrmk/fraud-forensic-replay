/**
 * Session-thread filter - which behavioral session (login/account_event/transfer
 * session_id) the investigator is threading across the timeline lanes. Toggle
 * semantics: selecting the active id clears it, so every transition changes
 * selectedSessionId and selector subscribers re-fire on their own (no re-trigger
 * token needed; three review lenses proved one would be dead state here). Kept
 * separate from selection/matches/navigation: this filters MANY events, never
 * focuses one entity.
 */
import { create } from "zustand";

export interface SessionFilterState {
  selectedSessionId: string | null;
  toggleSession: (id: string) => void;
  clearSession: () => void;
}

export const useSessionFilter = create<SessionFilterState>((set) => ({
  selectedSessionId: null,
  toggleSession: (id) =>
    set((s) => ({ selectedSessionId: s.selectedSessionId === id ? null : id })),
  clearSession: () => set({ selectedSessionId: null }),
}));
