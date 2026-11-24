/**
 * SpeedMenu - vertical stacked playback-speed picker hosted in the SpeedFlyout
 * popover. Replaces the horizontal SpeedChipRow (2026-06-22): same speed set,
 * same radiogroup a11y (the correct role for one-of-N exclusive selection -
 * menus are for commands), rotated to a vertical menu of full-width rows with
 * the forward speeds nearest the trigger (the menu opens upward).
 *
 * Speed set: −4× −1× −0.25× 0 0.25× 0.5× 1× 4× 16× - rewind (negative) | pause
 * (0) | slowmo (sub-1×, both directions) | forward (1×/4×/16×). Asymmetric bias
 * toward forward since investigators replay forward more than backward.
 *
 * Accessibility (W3C ARIA radiogroup pattern, vertical orientation):
 *   - Container role="radiogroup", aria-label.
 *   - Each row role="radio", aria-checked, aria-label with intent.
 *   - Roving tabindex - exactly one tab stop always (the active row, or the 1×
 *     anchor when the rate is off the set), so Tab and focus-on-open have a target.
 *   - ArrowUp/ArrowDown move + select AND move DOM focus (focus follows selection).
 *   - Home → 1×, End → 16×, Space toggles current ↔ 0 (resume / pause shortcut).
 */
import { useCallback, useEffect, useRef } from "react";
import { usePlayhead } from "../../store/playhead";
import { SPEED_CHIPS } from "./speed-chips";

const ZERO_INDEX = SPEED_CHIPS.indexOf(0);
const ONE_INDEX = SPEED_CHIPS.indexOf(1);
const MAX_INDEX = SPEED_CHIPS.length - 1;

/** Compact multiplier label: −4× · 0 · 0.5× · 16× (Unicode minus + ×). */
// eslint-disable-next-line react-refresh/only-export-components -- a tiny label helper co-located with its sole consumer; a separate module is overkill
export function speedLabel(rate: number): string {
  if (rate === 0) return "0";
  const sign = rate < 0 ? "−" : ""; // U+2212 MINUS SIGN, not hyphen
  return `${sign}${Math.abs(rate)}×`; // U+00D7 MULTIPLICATION SIGN
}

function speedAriaLabel(rate: number): string {
  if (rate === 0) return "Stopped";
  const direction = rate < 0 ? "backwards" : "forward";
  return `Play at ${Math.abs(rate)}× ${direction}`;
}

interface SpeedMenuProps {
  /** Fired on any row click - lets the hosting flyout close on selection
   *  (even when re-picking the active row, where apply() itself no-ops). */
  onSelect?: () => void;
}

export function SpeedMenu({ onSelect }: SpeedMenuProps) {
  const playbackRate = usePlayhead((s) => s.playbackRate);
  const setRate = usePlayhead((s) => s.setRate);
  const play = usePlayhead((s) => s.play);
  const pauseAndZeroRate = usePlayhead((s) => s.pauseAndZeroRate);

  const groupRef = useRef<HTMLDivElement>(null);

  // The roving tab stop: the active row, or the 1× anchor when the rate is off
  // the set (an externally-set rate the store permits). Guarantees exactly one
  // tabIndex=0 so Tab and the flyout focus-on-open always resolve to a row.
  const currentIdx = SPEED_CHIPS.indexOf(playbackRate as (typeof SPEED_CHIPS)[number]);
  const rovingIdx = currentIdx === -1 ? ONE_INDEX : currentIdx;

  // Persist the last non-zero rate so Space-toggle resumes it from 0 (not 1×).
  const lastNonZeroRateRef = useRef<number>(playbackRate === 0 ? 1 : playbackRate);
  useEffect(() => {
    if (playbackRate !== 0) lastNonZeroRateRef.current = playbackRate;
  }, [playbackRate]);

  // Focus follows selection: when a key changes the rate while focus is inside
  // the group, move DOM focus to the new tab stop (W3C radiogroup APG). Guarded
  // so an external rate change never steals focus; the click-close path unmounts
  // the menu before this can run.
  useEffect(() => {
    const group = groupRef.current;
    if (!group || !group.contains(document.activeElement)) return;
    group.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
  }, [playbackRate]);

  // Apply a rate through the unified pathway: 0 → pause+zero; else setRate then
  // play() (play handles boundary replay). No-op for the already-active rate.
  const apply = useCallback(
    (rate: number) => {
      if (rate === playbackRate) return;
      if (rate === 0) {
        pauseAndZeroRate();
        return;
      }
      setRate(rate);
      play();
    },
    [playbackRate, setRate, play, pauseAndZeroRate],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = Math.min(MAX_INDEX, rovingIdx + 1);
          if (next !== rovingIdx) apply(SPEED_CHIPS[next]);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prev = Math.max(0, rovingIdx - 1);
          if (prev !== rovingIdx) apply(SPEED_CHIPS[prev]);
          break;
        }
        case "Home": {
          e.preventDefault();
          apply(SPEED_CHIPS[ONE_INDEX]);
          break;
        }
        case "End": {
          e.preventDefault();
          apply(SPEED_CHIPS[MAX_INDEX]);
          break;
        }
        case " ":
        case "Spacebar": {
          e.preventDefault();
          apply(playbackRate === 0 ? lastNonZeroRateRef.current : 0);
          break;
        }
      }
    },
    [rovingIdx, playbackRate, apply],
  );

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Playback speed"
      onKeyDown={onKeyDown}
      className="flex flex-col min-w-[76px]"
    >
      {SPEED_CHIPS.map((rate, i) => {
        const isActive = rate === playbackRate;
        // Hairline rules group the menu: reverse | pause | forward.
        const groupBreak = i === ZERO_INDEX || i === ZERO_INDEX + 1;
        return (
          <button
            key={rate}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={speedAriaLabel(rate)}
            tabIndex={i === rovingIdx ? 0 : -1}
            onClick={() => {
              apply(rate);
              onSelect?.();
            }}
            className={[
              "flex items-center px-2.5 py-1 font-mono text-[9px] tracking-widest tabular-nums",
              "outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent",
              groupBreak ? "border-t border-panel-border" : "",
              // The selected speed in the on-panel accent: the raw slot is about 2:1 on a light panel.
              isActive ? "text-[color:var(--r1-on-panel)] bg-accent/10" : "text-muted hover:bg-accent/5 hover:text-text",
            ].join(" ")}
          >
            {speedLabel(rate)}
          </button>
        );
      })}
    </div>
  );
}
