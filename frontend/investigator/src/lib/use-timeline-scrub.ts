/**
 * useTimelineScrub - the case Timeline's scrub interaction (item O, transport
 * unification), extracted from Timeline.tsx so the rich-track component stays
 * under the line cap and the scrub model is a reusable unit (this also sets up
 * the Phase 7 Timeline split, item P).
 *
 * Mouse: a main-button mousedown anywhere on the track jumps the playhead and starts
 * scrubbing (a right press, a middle press and ctrl+click do not: the right press opens
 * a record's menu); global window listeners keep a fast drag alive even if the cursor
 * leaves the track (without them, fast drags lose grip).
 *
 * Keyboard: one key model (Arrow +/-1% / Shift+Arrow +/-10% / PageUp-Down
 * +/-10% / Home-End) for every transport. The case scrubs
 * through this hook (TimelineShell owns it).
 * This closes a real a11y gap - the track is a role=slider that previously had
 * no keyboard handler, so it could not be focused or arrowed.
 *
 * Window-relative (zoom, Phase 2): the track represents the VISIBLE window, so
 * every scrub - the mouse ratio and the keyboard step - maps against
 * windowMin/windowMax, NOT the global bounds. Arrow keys step 1% of the visible
 * window (fine-grained when zoomed in); Home/End jump to the window edges.
 *
 * scrubDomain (TimelineShell split, item P): case mode scrubs the visible WINDOW
 * (the default, "window" - preserves the zoom behavior above). "bounds" maps
 * the track against the full minTime/maxTime - the whole span (a folded bar),
 * which never zooms, so the window edges are the bounds.
 * playhead-as-truth: a 0..1 fraction maps to ms via setPlayhead - no clock.
 * Pauses on any scrub. The rich track itself (interactive event dots + lane and
 * density overlays) stays in Timeline.tsx: a plain slider primitive cannot host
 * them (it would nest a role=slider inside the dot buttons and has no overlay
 * slot), so only the interaction model is shared, not the track.
 */
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { usePlayhead } from "../store/playhead";

export interface TimelineScrub {
  trackRef: React.RefObject<HTMLDivElement | null>;
  onTrackMouseDown: (e: MouseEvent<HTMLDivElement>) => void;
  onTrackKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

/** What the step and mark keys do. Absent callbacks leave their keys unhandled. */
export interface TimelineKeys {
  /** `,` (back) and `.` (forward): go to the previous or next event. */
  onStep?: (dir: 1 | -1) => void;
  /** `m`: drop a mark at the playhead, or lift the one it sits on. */
  onMark?: () => void;
  /** `n`: add a note at the playhead (custom notes). */
  onNote?: () => void;
}

export function useTimelineScrub(
  scrubDomain: "window" | "bounds" = "window",
  keys: TimelineKeys = {},
): TimelineScrub {
  const playhead = usePlayhead((s) => s.playhead);
  // The case scrubs the VISIBLE window (zoom); bounds mode scrubs the whole
  // span. Select the active domain edges once, then the interaction is identical.
  const windowMin = usePlayhead((s) => s.windowMin);
  const windowMax = usePlayhead((s) => s.windowMax);
  const minTime = usePlayhead((s) => s.minTime);
  const maxTime = usePlayhead((s) => s.maxTime);
  const domainMin = scrubDomain === "bounds" ? minTime : windowMin;
  const domainMax = scrubDomain === "bounds" ? maxTime : windowMax;
  const isScrubbing = usePlayhead((s) => s.isScrubbing);
  const setPlayhead = usePlayhead((s) => s.setPlayhead);
  const setScrubbing = usePlayhead((s) => s.setScrubbing);
  const pause = usePlayhead((s) => s.pause);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Global drag handlers - wired only while scrubbing so we don't pay the
  // listener cost on idle.
  useEffect(() => {
    if (!isScrubbing) return;
    function onMove(e: globalThis.MouseEvent) {
      if (!trackRef.current) return;
      const r = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      setPlayhead(domainMin + ratio * (domainMax - domainMin));
    }
    function onUp() {
      setScrubbing(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isScrubbing, domainMin, domainMax, setPlayhead, setScrubbing]);

  function onTrackMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (!trackRef.current) return;
    if (e.button !== 0 || e.ctrlKey) return; // a right press, or a Mac's ctrl+click, opens a menu: no pause, seek or scrub
    // Pause during scrub for predictable behavior.
    pause();
    const r = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setPlayhead(domainMin + ratio * (domainMax - domainMin));
    setScrubbing(true);
  }

  function onTrackKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return; // a key pressed on a mark or a pile member inside the track bubbles here; it is not the track's key
    // Step and mark keys: focus-scoped like the rest (they act only from the track), and never
    // with a modifier, so no browser shortcut is taken. Escape is deliberately not handled.
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if ((e.key === "," || e.key === ".") && keys.onStep) {
        e.preventDefault();
        keys.onStep(e.key === "." ? 1 : -1);
        return;
      }
      if ((e.key === "m" || e.key === "M") && keys.onMark) {
        e.preventDefault();
        keys.onMark();
        return;
      }
      if ((e.key === "n" || e.key === "N") && keys.onNote) {
        e.preventDefault();
        keys.onNote();
        return;
      }
    }
    const dur = domainMax - domainMin;
    if (dur <= 0) return;
    const frac = (playhead - domainMin) / dur;
    let next: number;
    switch (e.key) {
      case "ArrowRight":
        next = frac + (e.shiftKey ? 0.1 : 0.01);
        break;
      case "ArrowLeft":
        next = frac - (e.shiftKey ? 0.1 : 0.01);
        break;
      case "PageUp":
        next = frac + 0.1;
        break;
      case "PageDown":
        next = frac - 0.1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    pause();
    setPlayhead(domainMin + Math.max(0, Math.min(1, next)) * dur);
  }

  return { trackRef, onTrackMouseDown, onTrackKeyDown };
}
