/**
 * TimelineControls - VCR-style icon transport: skip-to-start, slower/reverse,
 * play/pause, faster, plus the SpeedFlyout (a tiny live speed readout that opens
 * the precise-speed chip picker) and, after it, the clock's switch (12h / 24h). Icons for the
 * gestures; a small number for forensic speed-awareness. Replaces the prior PLAY + 9-chip row +
 * RESET (2026-06-22). Each button's words come from the one tooltip layer (`tip`), not a native title.
 */
import { FastForward, Pause, Play, Rewind, SkipBack } from "lucide-react";
import { usePlayhead } from "../store/playhead";
import { SpeedFlyout } from "./timeline/SpeedFlyout";
import { ClockSwitch } from "./timeline/ClockSwitch";
import { PLAYBACK_DURATION_MS } from "./timeline/usePlaybackDriver";
import { steppedRate } from "../lib/speed-control";
import * as words from "../lib/tooltip-words/transport";
import { FocusButton } from "./ui";
import { tip } from "./ui/Tip";

// Compact circular icon button, 28 px. The hover is a flat fill that changes no
// colour (the raw accent over the glass is too faint to read); the press is
// compositor-only and stilled under reduced motion. The border colour is added
// per button: only play keeps its ring, the rest hold a transparent border so
// all four stay 28 px.
const GLYPH =
  "flex-none flex items-center justify-center w-7 h-7 rounded-pill border text-text hover:bg-text/10 transition-transform active:scale-[0.96] motion-reduce:transition-none";
// The ring is play's only mark of primacy: the muted text colour (at least 4.8:1 on the flat
// glass), not the hairline, which nearly vanished in the light theme.
const RING = "border-muted";
const NO_RING = "border-transparent";

// One icon size and fill for the whole transport.
const ICON = { size: 12, fill: "currentColor" } as const;

interface TimelineControlsProps {
  /** Draws the clock's switch after the speed. Off by default: the item that owns the case bar turns it on. */
  showClock?: boolean;
}

export function TimelineControls({ showClock = false }: TimelineControlsProps) {
  const isPlaying = usePlayhead((s) => s.isPlaying);
  const playbackRate = usePlayhead((s) => s.playbackRate);
  const toggle = usePlayhead((s) => s.toggle);
  const snapToStart = usePlayhead((s) => s.snapToStart);
  const setRate = usePlayhead((s) => s.setRate);
  const play = usePlayhead((s) => s.play);
  const pauseAndZeroRate = usePlayhead((s) => s.pauseAndZeroRate);

  // Step the rate through the discrete set (shared steppedRate), applied via the
  // same pathway as the chip picker: 0 -> pause+zero; else setRate then play
  // (play() handles the boundary replay). No-op when the step doesn't move.
  const step = (dir: 1 | -1) => {
    const r = steppedRate(playbackRate, dir);
    if (r === playbackRate) return;
    if (r === 0) {
      pauseAndZeroRate();
    } else {
      setRate(r);
      play();
    }
  };

  return (
    <div className="flex items-center gap-1">
      <FocusButton
        variant="icon"
        onClick={snapToStart}
        aria-label="Back to the start"
        {...tip(words.toStart())}
        className={`${GLYPH} ${NO_RING}`}
      >
        <SkipBack {...ICON} />
      </FocusButton>
      <FocusButton
        variant="icon"
        onClick={() => step(-1)}
        aria-label="Slower"
        {...tip(words.slower())}
        className={`${GLYPH} ${NO_RING}`}
      >
        <Rewind {...ICON} />
      </FocusButton>
      <FocusButton
        variant="icon"
        onClick={toggle}
        aria-label={isPlaying ? "Pause" : "Play"}
        {...tip(isPlaying ? words.pause() : words.play(PLAYBACK_DURATION_MS))}
        className={`${GLYPH} ${RING}`}
      >
        {isPlaying ? <Pause {...ICON} /> : <Play {...ICON} />}
      </FocusButton>
      <FocusButton
        variant="icon"
        onClick={() => step(1)}
        aria-label="Faster"
        {...tip(words.faster())}
        className={`${GLYPH} ${NO_RING}`}
      >
        <FastForward {...ICON} />
      </FocusButton>
      <SpeedFlyout />
      {showClock ? <ClockSwitch /> : null}
    </div>
  );
}
