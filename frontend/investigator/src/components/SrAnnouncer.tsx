/**
 * SrAnnouncer - visually-hidden aria-live="polite" region that announces
 * session-thread transitions to screen readers.
 *
 * Mounted ONCE at app level (App.tsx). Subscribes to the session-filter store
 * and writes the live-region text IMPERATIVELY (textContent on a ref) on every
 * selectedSessionId TRANSITION:
 *   active select   → "Session thread active: N events"
 *   active -> null  → "Session thread cleared"
 * No announcement on mount or on an async pivot-data load - the subscription
 * fires only on real store changes, and a non-transition (sel === prev) is
 * ignored. N comes from sessionMatchStats (the same source as the MatchBadge
 * count). Writing textContent directly (not React setState) keeps this off the
 * render path - the right shape for an imperative SR announcement reacting to an
 * external store, and avoids the set-state-in-effect anti-pattern.
 *
 * sr-only: absolute 1×1 clip-rect - invisible but present in the accessibility
 * tree (NOT display:none / visibility:hidden, which would drop it from the tree).
 */
import { useEffect, useRef } from "react";
import { useSessionFilter } from "../store/session-filter";
import { usePivotData } from "../store/pivot-data";
import { sessionMatchStats } from "../lib/matches";

const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function SrAnnouncer() {
  const ref = useRef<HTMLDivElement>(null);
  const prevSelected = useRef<string | null>(useSessionFilter.getState().selectedSessionId);

  useEffect(() => {
    // Subscribe to session-thread transitions and announce imperatively.
    // Returns zustand's unsubscribe as the effect cleanup.
    return useSessionFilter.subscribe((state) => {
      const sel = state.selectedSessionId;
      const prev = prevSelected.current;
      if (sel === prev) return; // ignore non-transitions (unrelated store writes)
      prevSelected.current = sel;
      const node = ref.current;
      if (!node) return;
      if (sel === null) {
        node.textContent = prev !== null ? "Session thread cleared" : "";
        return;
      }
      const { logins, accountEvents, transfers } = usePivotData.getState();
      const { count } = sessionMatchStats(sel, { logins, accountEvents, transfers });
      node.textContent = `Session thread active: ${count} event${count === 1 ? "" : "s"}`;
    });
  }, []);

  return <div ref={ref} role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY} />;
}
