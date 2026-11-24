/**
 * Tests for SpeedMenu - the vertical stacked speed picker (replaces the
 * horizontal SpeedChipRow). 9 rows: −4× −1× −0.25× 0 0.25× 0.5× 1× 4× 16×.
 *
 * Verifies:
 *  - render contract (9 rows, correct labels, role=radiogroup/radio)
 *  - click handlers wire to usePlayhead actions (setRate / pause / play)
 *  - aria-checked tracks the active rate
 *  - keyboard navigation (ArrowUp / ArrowDown / Home / End / Space)
 *  - active row is the only tab stop (roving tabindex)
 *  - onSelect fires for the hosting flyout
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpeedMenu } from "./SpeedMenu";
import { SPEED_CHIPS } from "./speed-chips";
import { usePlayhead } from "../../store/playhead";
import { COLOR_MODES, THEMES } from "../../theme/axes";
import { compositeOver, contrastRatio } from "../../theme/legibility";
import { resolvePalette } from "../../theme/resolve";
import { hexToRgb01 } from "../../theme/to-rgb";

beforeEach(() => {
  usePlayhead.setState({
    playhead: 5_000,
    minTime: 0,
    maxTime: 10_000,
    isPlaying: false,
    playbackRate: 1,
    isScrubbing: false,
  });
});

describe("SpeedMenu - the selected row's colour", () => {
  it("prints the selected speed in the on-panel accent, not the raw slot", () => {
    render(<SpeedMenu />);
    const active = screen.getAllByRole("radio").find((r) => r.getAttribute("aria-checked") === "true");
    const cls = (active as HTMLElement).className.split(/\s+/);
    expect(cls).toContain("text-[color:var(--r1-on-panel)]");
    expect(cls).not.toContain("text-accent");
  });

  it("the selected speed reaches 4.5:1 on its tint over the menu's opaque panel, in every theme and colour mode", () => {
    // Measured 2026-11-15: the raw accent on a light panel is about 2:1. The menu is the
    // instrument material (its fill is material.panelBase) and the selected row adds the raw
    // accent at 10 percent.
    const triplet = (t: string): [number, number, number] => {
      const [r, g, b] = t.split(/\s+/).map((n) => parseInt(n, 10) / 255);
      return [r, g, b];
    };
    const failures: string[] = [];
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const p = resolvePalette(theme, color);
        const bg = compositeOver(hexToRgb01(p.ramp.r1), 0.1, triplet(p.material.panelBase));
        const c = contrastRatio(hexToRgb01(p.onPanel.r1), bg);
        if (c < 4.5) failures.push(`${theme}.${color} = ${c.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("SpeedMenu - render contract", () => {
  it("exposes the 9 canonical speeds in order", () => {
    expect(SPEED_CHIPS).toEqual([-4, -1, -0.25, 0, 0.25, 0.5, 1, 4, 16]);
  });

  it("renders 9 rows wrapped in a radiogroup", () => {
    render(<SpeedMenu />);
    const group = screen.getByRole("radiogroup", { name: /playback speed/i });
    expect(group).toBeInTheDocument();
    const rows = screen.getAllByRole("radio");
    expect(rows).toHaveLength(9);
  });

  it("renders row labels with Unicode minus + × (not ASCII)", () => {
    render(<SpeedMenu />);
    expect(screen.getByText("−4×")).toBeInTheDocument();
    expect(screen.getByText("−1×")).toBeInTheDocument();
    expect(screen.getByText("−0.25×")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("0.25×")).toBeInTheDocument();
    expect(screen.getByText("0.5×")).toBeInTheDocument();
    expect(screen.getByText("1×")).toBeInTheDocument();
    expect(screen.getByText("4×")).toBeInTheDocument();
    expect(screen.getByText("16×")).toBeInTheDocument();
  });

  it("aria-checked is true on the row matching playbackRate, false elsewhere", () => {
    usePlayhead.setState({ playbackRate: 4 });
    render(<SpeedMenu />);
    expect(screen.getByRole("radio", { name: /4× forward/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: /1× forward/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("aria-label uses 'backwards' for negative, 'stopped' for 0, 'forward' for positive", () => {
    render(<SpeedMenu />);
    expect(screen.getByRole("radio", { name: /4× backwards/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /0\.25× backwards/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /stopped/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /0\.25× forward/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /0\.5× forward/i })).toBeInTheDocument();
  });

  it("only the active row is in the tab order (roving tabindex)", () => {
    usePlayhead.setState({ playbackRate: 1 });
    render(<SpeedMenu />);
    expect(screen.getByRole("radio", { name: /1× forward/i })).toHaveAttribute("tabIndex", "0");
    expect(screen.getByRole("radio", { name: /4× forward/i })).toHaveAttribute("tabIndex", "-1");
  });

  it("keeps a single tab stop (the 1× anchor) when the rate is off the set", () => {
    usePlayhead.setState({ playbackRate: 2 }); // 2 is not in SPEED_CHIPS
    render(<SpeedMenu />);
    const tabStops = screen
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("tabIndex") === "0");
    expect(tabStops).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /1× forward/i })).toHaveAttribute("tabIndex", "0");
  });
});

describe("SpeedMenu - click behavior", () => {
  it("click 4× sets rate to 4 and starts playback", () => {
    usePlayhead.setState({ playbackRate: 1, isPlaying: false });
    render(<SpeedMenu />);
    fireEvent.click(screen.getByRole("radio", { name: /4× forward/i }));
    expect(usePlayhead.getState().playbackRate).toBe(4);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("click −1× sets rate to −1 and starts playback", () => {
    usePlayhead.setState({ playbackRate: 1, isPlaying: false });
    render(<SpeedMenu />);
    fireEvent.click(screen.getByRole("radio", { name: /1× backwards/i }));
    expect(usePlayhead.getState().playbackRate).toBe(-1);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("click 0 sets rate to 0 and pauses", () => {
    usePlayhead.setState({ playbackRate: 4, isPlaying: true });
    render(<SpeedMenu />);
    fireEvent.click(screen.getByRole("radio", { name: /stopped/i }));
    expect(usePlayhead.getState().playbackRate).toBe(0);
    expect(usePlayhead.getState().isPlaying).toBe(false);
  });

  it("click 0.5× (slowmo) sets rate to 0.5 and starts playback", () => {
    usePlayhead.setState({ playbackRate: 0, isPlaying: false });
    render(<SpeedMenu />);
    fireEvent.click(screen.getByRole("radio", { name: /0\.5× forward/i }));
    expect(usePlayhead.getState().playbackRate).toBe(0.5);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("click 0.25× (quarter-speed forward slowmo) sets rate to 0.25 and starts playback", () => {
    usePlayhead.setState({ playbackRate: 0, isPlaying: false });
    render(<SpeedMenu />);
    fireEvent.click(screen.getByRole("radio", { name: /0\.25× forward/i }));
    expect(usePlayhead.getState().playbackRate).toBe(0.25);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("click −0.25× (quarter-speed reverse slowmo) sets rate to −0.25 and starts playback", () => {
    usePlayhead.setState({ playbackRate: 0, isPlaying: false });
    render(<SpeedMenu />);
    fireEvent.click(screen.getByRole("radio", { name: /0\.25× backwards/i }));
    expect(usePlayhead.getState().playbackRate).toBe(-0.25);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("clicking the already-active row is a no-op for rate, doesn't re-trigger play", () => {
    usePlayhead.setState({ playbackRate: 1, isPlaying: true });
    render(<SpeedMenu />);
    fireEvent.click(screen.getByRole("radio", { name: /1× forward/i }));
    expect(usePlayhead.getState().playbackRate).toBe(1);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("clicking a positive row when playhead is at maxTime: it lights and replays from the start", () => {
    usePlayhead.setState({
      playhead: 10_000, minTime: 0, maxTime: 10_000,
      playbackRate: 0, isPlaying: false,
    });
    render(<SpeedMenu />);
    fireEvent.click(screen.getByRole("radio", { name: /1× forward/i }));
    expect(usePlayhead.getState().playbackRate).toBe(1);
    expect(usePlayhead.getState().playhead).toBe(0);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("clicking a negative row when playhead is at minTime: it lights and replays from the end", () => {
    usePlayhead.setState({
      playhead: 0, minTime: 0, maxTime: 10_000,
      playbackRate: 0, isPlaying: false,
    });
    render(<SpeedMenu />);
    fireEvent.click(screen.getByRole("radio", { name: /1× backwards/i }));
    expect(usePlayhead.getState().playbackRate).toBe(-1);
    expect(usePlayhead.getState().playhead).toBe(10_000);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });
});

describe("SpeedMenu - keyboard navigation (vertical)", () => {
  it("ArrowDown on 1× moves to 4×", () => {
    usePlayhead.setState({ playbackRate: 1 });
    render(<SpeedMenu />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowDown" });
    expect(usePlayhead.getState().playbackRate).toBe(4);
  });

  it("ArrowUp on 1× moves to 0.5×", () => {
    usePlayhead.setState({ playbackRate: 1 });
    render(<SpeedMenu />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowUp" });
    expect(usePlayhead.getState().playbackRate).toBe(0.5);
  });

  it("ArrowUp on 0.5× moves to 0.25× (descends through the forward slowmo row)", () => {
    usePlayhead.setState({ playbackRate: 0.5 });
    render(<SpeedMenu />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowUp" });
    expect(usePlayhead.getState().playbackRate).toBe(0.25);
  });

  it("ArrowDown on −1× moves to −0.25× (ascends through the reverse slowmo row)", () => {
    usePlayhead.setState({ playbackRate: -1 });
    render(<SpeedMenu />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowDown" });
    expect(usePlayhead.getState().playbackRate).toBe(-0.25);
  });

  it("ArrowDown on 16× stays at 16× (does not wrap)", () => {
    usePlayhead.setState({ playbackRate: 16 });
    render(<SpeedMenu />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowDown" });
    expect(usePlayhead.getState().playbackRate).toBe(16);
  });

  it("ArrowUp on −4× stays at −4× (does not wrap)", () => {
    usePlayhead.setState({ playbackRate: -4 });
    render(<SpeedMenu />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowUp" });
    expect(usePlayhead.getState().playbackRate).toBe(-4);
  });

  it("Home jumps to 1×", () => {
    usePlayhead.setState({ playbackRate: -4 });
    render(<SpeedMenu />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "Home" });
    expect(usePlayhead.getState().playbackRate).toBe(1);
  });

  it("End jumps to 16×", () => {
    usePlayhead.setState({ playbackRate: 0 });
    render(<SpeedMenu />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "End" });
    expect(usePlayhead.getState().playbackRate).toBe(16);
  });

  it("Space toggles between current rate and 0", () => {
    usePlayhead.setState({ playbackRate: 4, isPlaying: true });
    render(<SpeedMenu />);
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: " " });
    expect(usePlayhead.getState().playbackRate).toBe(0);
    expect(usePlayhead.getState().isPlaying).toBe(false);
    fireEvent.keyDown(group, { key: " " });
    expect(usePlayhead.getState().playbackRate).toBe(4);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("Space from 0 with no prior rate defaults to 1×", () => {
    usePlayhead.setState({ playbackRate: 0, isPlaying: false });
    render(<SpeedMenu />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: " " });
    expect(usePlayhead.getState().playbackRate).toBe(1);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("moves DOM focus to the newly-selected row on ArrowDown (focus follows selection)", () => {
    usePlayhead.setState({ playbackRate: 1 });
    render(<SpeedMenu />);
    const oneX = screen.getByRole("radio", { name: /1× forward/i });
    oneX.focus();
    expect(document.activeElement).toBe(oneX);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowDown" });
    expect(usePlayhead.getState().playbackRate).toBe(4);
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /4× forward/i }));
  });
});

describe("SpeedMenu - onSelect callback (flyout integration)", () => {
  it("fires onSelect when a row is clicked", () => {
    const onSelect = vi.fn();
    render(<SpeedMenu onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("radio", { name: /4× forward/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("fires onSelect even when clicking the already-active row (so the flyout still closes)", () => {
    usePlayhead.setState({ playbackRate: 1 });
    const onSelect = vi.fn();
    render(<SpeedMenu onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("radio", { name: /1× forward/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
