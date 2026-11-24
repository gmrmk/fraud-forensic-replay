import { useEffect, useRef, useState } from "react";
import {
  ensureChosenScenario,
  fetchScenarios,
  scenarioChoiceHeld,
  selectScenario,
} from "../lib/scenarios";
import { IS_STATIC_BUILD } from "../lib/build-flags";
import type { ActiveScenario, ScenarioSummary } from "../lib/scenarios";
import { dropShareLink } from "../hooks/useShareLink";
import { Panel, Eyebrow, FocusButton } from "./ui";
import { tip } from "./ui/Tip";

interface ScenarioSwitcherProps {
  /** Injected for tests; defaults to a full page reload so every store and
   *  fetch re-derives from a fresh boot against the newly active DB. */
  reload?: () => void;
  /** Fires once the active scenario (with its manifest `home`) has loaded -
   *  App uses it to frame the camera on the scenario's establishing shot. */
  onActive?: (scenario: ActiveScenario) => void;
  /** Fires once when the scenario could not be loaded, so the map can open at its fixed view. */
  onError?: () => void;
}

/**
 * The case header's scenario line, made live: shows the active scenario and
 * opens a flat panel-idiom list to hot-swap it. Replaces the hardcoded
 * CASE-MARCUS-001 string (the most visible piece of D2 chrome debt).
 */
export function ScenarioSwitcher({
  reload = () => window.location.reload(),
  onActive,
  onError,
}: ScenarioSwitcherProps) {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [active, setActive] = useState<ActiveScenario | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Dismissal: Escape closes and returns focus to the trigger; a pointer-down
  // outside the component closes. Listeners exist only while open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    // ensureChosenScenario re-asserts this browser's persisted scenario when
    // a backend restart reset the process-global active to its default.
    Promise.all([fetchScenarios(), ensureChosenScenario()])
      .then(([list, act]) => {
        if (cancelled) return;
        // The case data loaded on mount from the pack the backend had active; after re-asserting
        // this browser's choice it is the wrong pack's data, so reload (as a manual pick does).
        if (act.reselected) {
          reload();
          return;
        }
        setScenarios(list);
        setActive(act);
        onActive?.(act);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        onError?.();
      });
    return () => {
      cancelled = true;
    };
    // onActive is a notification seam, not a data dependency - re-running the
    // load when the parent re-renders with a new closure would refetch for
    // nothing. eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (s: ScenarioSummary) => {
    if (switching) return;
    if (active && s.id === active.id) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    setError(null);
    selectScenario(s.id)
      .then(() => {
        // The address bar describes the pack being left; kept, the reload would reopen it.
        // A static build has no server to hold the pick: where the browser would not store it, the
        // reload's address carries it (the adapter reads it there). Elsewhere the address is bare, as ever.
        dropShareLink(IS_STATIC_BUILD && !scenarioChoiceHeld(s.id) ? s.id : undefined);
        reload();
      })
      .catch((err: Error) => {
        setError(err.message);
        setSwitching(false);
      });
  };

  return (
    <div ref={rootRef} className="relative pointer-events-auto">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        // The title card gives way when the top row is short of room: the line is cut with an
        // ellipsis (the cell below), the button never passes the card, and the whole line stays in
        // the tooltip. The accessible name is the button's text, which the cut does not remove.
        style={{ maxWidth: "100%" }}
        {...tip(["Scenario", `${switching ? "switching…" : (active?.label ?? "-")} · Synthetic data`])}
        className="flex items-baseline gap-1.5 text-[10px] uppercase tracking-widest text-[color:var(--text-faint-on-panel)] hover:text-muted transition"
      >
        {/* One cell holds the three parts, so one ellipsis cuts the line at its end; the 6 px
            between the parts is the margin the button's gap gave them. The arrow stays outside. */}
        <span className="min-w-0 truncate">
          <span className="mr-1.5">Scenario ·</span>
          <span className="mr-1.5 text-muted">
            {switching ? "switching…" : (active?.label ?? "-")}
          </span>
          {/* Every pack is generated data; the risk score is authored from the outcome (D1). */}
          <span>· Synthetic data</span>
        </span>
        <span
          className={`inline-block text-[8px] transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <Panel
          material="instrument"
          elevation="focal"
          radius="md"
          role="listbox"
          aria-label="Scenario"
          className="absolute left-0 top-full mt-1.5 z-20 min-w-[240px] overflow-hidden"
        >
          {scenarios.map((s) => {
            const isActive = s.id === active?.id;
            return (
              <FocusButton
                key={s.id}
                role="option"
                aria-selected={isActive}
                onClick={() => pick(s)}
                className="w-full px-3 py-2 flex items-baseline justify-between gap-3 border-b border-panel-border/60 last:border-0 hover:bg-accent/5 transition text-left"
              >
                <span className="flex items-baseline gap-2 min-w-0">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                      isActive ? "bg-accent" : "bg-dim"
                    }`}
                  />
                  <Eyebrow tone="muted" className="truncate">
                    {s.label}
                  </Eyebrow>
                </span>
                <span className="font-mono text-[9px] text-dim shrink-0">{s.id}</span>
              </FocusButton>
            );
          })}
        </Panel>
      )}

      {error && (
        <div className="mt-1 font-mono text-[9px] text-signal">{error}</div>
      )}
    </div>
  );
}
