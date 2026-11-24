/**
 * SpeedFlyout - collapses the 9-speed SpeedMenu behind a single trigger that
 * SHOWS the current playback speed, freeing horizontal real-estate in the
 * timeline transport for the zoom controls. Click the trigger to fly the full
 * picker out ABOVE it (the timeline sits at screen bottom); pick a speed, press
 * Escape, or click away to close. The vertical menu - radiogroup, roving
 * tabindex, the whole keyboard model - is hosted verbatim, so its a11y survives.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { usePlayhead } from "../../store/playhead";
import { SpeedMenu, speedLabel } from "./SpeedMenu";
import { Pill, Panel } from "../ui";
import { tip } from "../ui/Tip";
import { speed } from "../../lib/tooltip-words/transport";
import { PLAYBACK_DURATION_MS } from "./usePlaybackDriver";

export function SpeedFlyout() {
  const playbackRate = usePlayhead((s) => s.playbackRate);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the trigger (the only [aria-haspopup] in the wrapper).
    wrapRef.current?.querySelector<HTMLButtonElement>("[aria-haspopup]")?.focus();
  }, []);

  // Dismiss on outside-click or Escape - only while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // On open, move focus into the picker (the active chip = its roving tab stop)
  // so keyboard users land on a usable control rather than the page.
  useEffect(() => {
    if (!open) return;
    wrapRef.current
      ?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')
      ?.focus();
  }, [open]);

  const label = speedLabel(playbackRate);

  return (
    // The tooltip sits on the button, as the four icon buttons carry theirs, while the picker is
    // shut: an open picker must not carry the readout's tooltip.
    <div ref={wrapRef} className="relative inline-flex">
      <Pill
        tone="text"
        size="md"
        {...(open ? {} : tip(speed(PLAYBACK_DURATION_MS)))}
        aria-haspopup={true}
        aria-expanded={open}
        aria-label={`${label}. Playback speed. Press to open the list of speeds.`}
        onClick={() => setOpen((o) => !o)}
        className="min-w-[52px] h-7 justify-center tabular-nums !tracking-normal"
      >
        {label}
      </Pill>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30">
          {/* Opaque, not glass: the menu opens over the ticker, and inside the timeline panel's
              backdrop root its blur never reaches the text under it, which showed through. */}
          <Panel material="instrument" className="p-1">
            <SpeedMenu onSelect={close} />
          </Panel>
        </div>
      )}
    </div>
  );
}
