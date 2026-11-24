import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimelineControls } from "./TimelineControls";
import { usePlayhead } from "../store/playhead";
import { useClockForm } from "../store/clock-form";
import * as words from "../lib/tooltip-words/transport";
import { PLAYBACK_DURATION_MS } from "./timeline/usePlaybackDriver";

describe("TimelineControls - VCR icon transport", () => {
  beforeEach(() => {
    usePlayhead.setState({
      isPlaying: false,
      minTime: 100,
      maxTime: 1000,
      windowMin: 100,
      windowMax: 1000,
      playhead: 500,
      playbackRate: 1,
    });
  });

  it("renders the four transport buttons + the speed readout, by accessible name", () => {
    render(<TimelineControls />);
    expect(screen.getByRole("button", { name: /^back to the start$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^slower$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^play$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^faster$/i })).toBeInTheDocument();
    // The SpeedFlyout trigger is the tiny speed readout.
    expect(screen.getByRole("button", { name: /playback speed/i })).toBeInTheDocument();
  });

  it("skip-back snaps the playhead to the window start through the store", () => {
    render(<TimelineControls />);
    fireEvent.click(screen.getByRole("button", { name: /^back to the start$/i }));
    expect(usePlayhead.getState().playhead).toBe(100);
  });

  it("play toggles playback through the store", () => {
    render(<TimelineControls />);
    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("fast-forward steps the rate faster (1× → 4×) and plays", () => {
    render(<TimelineControls />);
    fireEvent.click(screen.getByRole("button", { name: /^faster$/i }));
    expect(usePlayhead.getState().playbackRate).toBe(4);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("rewind steps the rate slower (1× → 0.5×)", () => {
    render(<TimelineControls />);
    fireEvent.click(screen.getByRole("button", { name: /^slower$/i }));
    expect(usePlayhead.getState().playbackRate).toBe(0.5);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  describe("icons, not text glyphs", () => {
    const cases: Array<{ name: RegExp; icon: string }> = [
      { name: /^back to the start$/i, icon: "lucide-skip-back" },
      { name: /^slower$/i, icon: "lucide-rewind" },
      { name: /^play$/i, icon: "lucide-play" },
      { name: /^faster$/i, icon: "lucide-fast-forward" },
    ];

    for (const { name, icon } of cases) {
      it(`${icon} is a 12 px currentColor svg inside the button, with no text`, () => {
        render(<TimelineControls />);
        const button = screen.getByRole("button", { name });
        const svg = button.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg!.classList.contains(icon)).toBe(true);
        expect(svg!.getAttribute("width")).toBe("12");
        expect(svg!.getAttribute("height")).toBe("12");
        expect(svg!.getAttribute("fill")).toBe("currentColor");
        expect(button.textContent).toBe("");
      });
    }

    it("shows the pause icon, named Pause, while playing", () => {
      usePlayhead.setState({ isPlaying: true });
      render(<TimelineControls />);
      const button = screen.getByRole("button", { name: /^pause$/i });
      const svg = button.querySelector("svg");
      expect(svg!.classList.contains("lucide-pause")).toBe(true);
      expect(svg!.classList.contains("lucide-play")).toBe(false);
      expect(svg!.getAttribute("width")).toBe("12");
      expect(svg!.getAttribute("height")).toBe("12");
      expect(svg!.getAttribute("fill")).toBe("currentColor");
      expect(button.textContent).toBe("");
    });

    // The native title is gone: the one tooltip layer says what each button is, from `data-tip`
    // (a title beside it would show a second, browser-styled tooltip). The aria-label stays.
    it("carries no native title; each button's words come from the one tooltip layer", () => {
      const { container } = render(<TimelineControls />);
      expect(container.querySelector("[title]")).toBeNull();
      const tip = (name: RegExp) => screen.getByRole("button", { name }).getAttribute("data-tip");
      expect(tip(/^back to the start$/i)?.split("\n")[0]).toBe("Back to the start");
      expect(tip(/^slower$/i)?.split("\n")[0]).toBe("Slower");
      expect(tip(/^play$/i)?.split("\n")[0]).toBe("Play");
      expect(tip(/^faster$/i)?.split("\n")[0]).toBe("Faster");
    });

    it("keeps the accessible name of every button", () => {
      render(<TimelineControls />);
      // The accessible name and the tooltip's title are the one word: "Back to the start", "Slower", "Play", "Faster".
      expect(screen.getByRole("button", { name: "Back to the start" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Slower" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Faster" })).toBeInTheDocument();
    });

    it("names Pause in the tooltip while playing", () => {
      usePlayhead.setState({ isPlaying: true });
      render(<TimelineControls />);
      const pause = screen.getByRole("button", { name: /^pause$/i });
      expect(pause).not.toHaveAttribute("title");
      expect(pause.getAttribute("data-tip")?.split("\n")[0]).toBe("Pause");
    });
  });

  describe("the clock's switch", () => {
    beforeEach(() => {
      useClockForm.setState({ h24: false });
    });

    it("is off by default: with no prop the transport draws no clock switch and ends on the speed", () => {
      render(<TimelineControls />);
      expect(screen.queryByRole("button", { name: /the clock shows the \d\d hour form\. press to show/i })).toBeNull();
      const buttons = screen.getAllByRole("button");
      expect(buttons[buttons.length - 1]).toBe(screen.getByRole("button", { name: /playback speed/i }));
      expect(buttons).toHaveLength(5);
    });

    it("is drawn when the prop shows it: six buttons, the clock last", () => {
      render(<TimelineControls showClock />);
      expect(screen.getAllByRole("button")).toHaveLength(6);
      expect(screen.getByRole("button", { name: /the clock shows the \d\d hour form\. press to show/i })).toBeInTheDocument();
    });

    it("is the last control of the transport, after the speed", () => {
      render(<TimelineControls showClock />);
      const buttons = screen.getAllByRole("button");
      const speed = screen.getByRole("button", { name: /playback speed/i });
      const clock = screen.getByRole("button", { name: /the clock shows the \d\d hour form\. press to show/i });
      expect(buttons[buttons.length - 1]).toBe(clock);
      expect(buttons[buttons.length - 2]).toBe(speed);
      expect(clock).toHaveTextContent("12h");
    });

    it("each of the six transport buttons carries its own description for assistive technology", () => {
      render(<TimelineControls showClock />);
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(6);
      const said = (lines: string[]) => lines.join(". ");
      const expected = [
        said(words.toStart()),
        said(words.slower()),
        said(words.play(PLAYBACK_DURATION_MS)),
        said(words.faster()),
        said(words.speed(PLAYBACK_DURATION_MS)),
        said(words.clockSwitch(false)),
      ];
      expect(buttons.map((b) => b.getAttribute("aria-description"))).toEqual(expected);
    });

    it("turns the form of the one shared value", () => {
      render(<TimelineControls showClock />);
      fireEvent.click(screen.getByRole("button", { name: /the clock shows the \d\d hour form\. press to show/i }));
      expect(useClockForm.getState().h24).toBe(true);
      expect(screen.getByRole("button", { name: /the clock shows the \d\d hour form\. press to show/i })).toHaveTextContent("24h");
    });

    it("leaves the playhead and the playback alone", () => {
      render(<TimelineControls showClock />);
      fireEvent.click(screen.getByRole("button", { name: /the clock shows the \d\d hour form\. press to show/i }));
      expect(usePlayhead.getState().playhead).toBe(500);
      expect(usePlayhead.getState().isPlaying).toBe(false);
      expect(usePlayhead.getState().playbackRate).toBe(1);
    });
  });

  describe("button classes", () => {
    const names = [
      /^back to the start$/i,
      /^slower$/i,
      /^play$/i,
      /^faster$/i,
    ];

    for (const name of names) {
      it(`${name} keeps the 28 px box, the flat hover and the compositor-only press`, () => {
        render(<TimelineControls />);
        const cl = screen.getByRole("button", { name }).classList;
        for (const c of [
          "w-7",
          "h-7",
          "hover:bg-text/10",
          "transition-transform",
          "active:scale-[0.96]",
          "motion-reduce:transition-none",
        ]) {
          expect(cl.contains(c), c).toBe(true);
        }
        expect(cl.contains("hover:text-accent")).toBe(false);
        expect(cl.contains("hover:border-accent")).toBe(false);
        expect(cl.contains("transition")).toBe(false);
        expect(cl.contains("text-[12px]")).toBe(false);
      });
    }

    it("only play keeps its ring, in the muted text colour; the other three hold a transparent border", () => {
      // The ring is play's only mark of primacy, so it takes --text-muted (at least 4.8:1 on the
      // flat glass, the oracle in MagnitudeLane.test.tsx); the hairline it had nearly vanished
      // in the light theme (vision judge, 2026-11-15).
      render(<TimelineControls />);
      const play = screen.getByRole("button", { name: /^play$/i }).classList;
      expect(play.contains("border-muted")).toBe(true);
      expect(play.contains("border-panel-border")).toBe(false);
      expect(play.contains("border-transparent")).toBe(false);
      for (const name of [/^back to the start$/i, /^slower$/i, /^faster$/i]) {
        const cl = screen.getByRole("button", { name }).classList;
        expect(cl.contains("border-transparent")).toBe(true);
        expect(cl.contains("border-muted")).toBe(false);
        expect(cl.contains("border")).toBe(true);
      }
    });

    it("the pause state keeps the play button's ring", () => {
      usePlayhead.setState({ isPlaying: true });
      render(<TimelineControls />);
      const cl = screen.getByRole("button", { name: /^pause$/i }).classList;
      expect(cl.contains("border-muted")).toBe(true);
    });
  });
});
