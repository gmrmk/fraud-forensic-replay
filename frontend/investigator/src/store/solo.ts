/**
 * The soloed row: `{ field, value }` or null. A second filter beside Matches and the session
 * filter, kept in its own store (the session filter dims and rings, a solo removes). The store
 * holds only the choice; the lists are narrowed by lib/solo.ts from this value.
 *
 * It is view state and not a clock: nothing here reads the time. It is not saved and not in the
 * share link (a later item carries it there).
 */
import { create } from "zustand";
import { soloHasData, type Solo } from "../lib/solo";
import type { PivotContext } from "../lib/matches";

export interface SoloState {
  solo: Solo | null;
  /** A press on a row's name: solo it, or clear it when it is the one already soloed. An empty
   *  field or value is not a row and sets nothing. */
  toggle: (field: string, value: string) => void;
  clear: () => void;
}

export const useSolo = create<SoloState>((set) => ({
  solo: null,
  toggle: (field, value) => {
    if (field === "" || value === "") return;
    set((s) => ({
      solo: s.solo && s.solo.field === field && s.solo.value === value ? null : { field, value },
    }));
  },
  clear: () => set({ solo: null }),
}));

/** Clear the solo when its value has left the data (a scenario change, a reload that dropped the
 *  row). Pass a context that holds every kind the rows read, bars included, or a row with bars and
 *  no node reads as gone. Run it when the data changes, as syncSessionFilter does for its filter. */
export function syncSolo(context: PivotContext): void {
  const { solo, clear } = useSolo.getState();
  if (solo && !soloHasData(solo, context)) clear();
}
