/**
 * Reached decisions - the playhead-gated decision list, App-fed (the same
 * reachedDecisions() the old DecisionRail computed), so the Inspector's
 * DECISIONS section can render pills without dataset prop-drilling. The
 * id-signature guard matters: the playhead ticks at animation rate during
 * playback, but membership changes only when a trigger timestamp is crossed -
 * identical signatures keep array identity so subscribers don't re-render.
 */
import { create } from "zustand";
import type { Decision } from "../lib/decisions";

export interface DecisionDataState {
  reached: Decision[];
  setReached: (d: Decision[]) => void;
}

const sig = (xs: Decision[]): string => xs.map((x) => x.id).join("|");

export const useDecisionData = create<DecisionDataState>((set, get) => ({
  reached: [],
  setReached: (d) => {
    if (sig(d) === sig(get().reached)) return;
    set({ reached: d });
  },
}));
