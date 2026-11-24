// frontend/investigator/src/components/timeline/head/HeadSled.test.tsx
// The line, the veil and the lane's number. Everything here is a function of the
// playhead alone and is placed by a transform; paused, two reads are equal. The pack's grids and
// lane are fixtures written in this file (a lane called "lane-a" in "units").
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useClockForm } from "../../../store/clock-form";
import { usePlayhead } from "../../../store/playhead";
import { span } from "../../../lib/time-words";
import { headEdge } from "../../../lib/head-edge";
import { makeProjector } from "../../../lib/timeline-projector";
import type { LaneBar, LaneModel } from "../../../lib/timeline-lanes";
import { HeadSled } from "./HeadSled";
import { LaneFigure } from "./LaneFigure";

const HOUR = 3_600_000;
const FIRST = Date.parse("2026-06-08T00:00:00Z");
// A 10 hour window, so one hour is ten percent of the plot.
const project = makeProjector(FIRST, FIRST + 10 * HOUR);
const grids = [{ step: HOUR, firstBucketStart: FIRST }];

function bars(values: readonly number[]): LaneBar[] {
  return values.map((value, i) => ({ t: FIRST + i * HOUR, value, height: 10, cut: false }));
}
const lane: LaneModel = {
  id: "lane-a",
  kind: "lane-a",
  nodeLabel: "Lane A",
  label: "",
  unit: "units",
  palette: "",
  bars: bars([5, 4061.71, 4133.57, 7, 9, 3, 2, 1, 8, 4133.57]),
  step: HOUR,
  scale: { top: 5000, max: 4133.57, above: 0 },
  decimals: 2,
  peak: { t: FIRST + 2 * HOUR, value: 4133.57, height: 10, cut: false },
};

const setPlayhead = (ms: number) => act(() => usePlayhead.setState({ playhead: ms }));
const sled = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-head-sled]")!;
const line = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-head-line]")!;
const veil = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-head-veil]")!;
// The sled that carries a piece is its parent: the piece sits at the sled's left edge and the
// sled's transform is what moves.
const moverOf = (el: HTMLElement) => el.parentElement!;
const pctOf = (el: HTMLElement): number => Number(/translateX\(([\d.]+)%\)/.exec(moverOf(el).style.transform)?.[1] ?? NaN);

beforeEach(() => {
  usePlayhead.setState({ playhead: FIRST, minTime: FIRST, maxTime: FIRST + 10 * HOUR, isPlaying: false });
  useClockForm.setState({ h24: false });
});

describe("HeadSled", () => {
  it("places the line by a transform at the playhead and never by a left offset", () => {
    setPlayhead(FIRST + 2.5 * HOUR);
    const { container } = render(
      <div style={{ position: "relative" }}>
        <HeadSled project={project} grids={grids} />
      </div>,
    );
    expect(pctOf(line(container))).toBeCloseTo(25, 5);
    // The line's own left stays 0 at every playhead: only its sled's transform changes.
    expect(line(container).style.left).toBe("0px");
    expect(line(container).style.width).toBe("1px");
    // The component is hidden from assistive tech: the track says the time.
    expect(sled(container).getAttribute("aria-hidden")).toBe("true");
  });

  it("gives equal reads twice when paused, and a new place when the playhead moves", () => {
    setPlayhead(FIRST + 2.5 * HOUR);
    const { container, rerender } = render(<HeadSled project={project} grids={grids} />);
    const first = container.innerHTML;
    rerender(<HeadSled project={project} grids={grids} />);
    expect(container.innerHTML).toBe(first);
    setPlayhead(FIRST + 6 * HOUR);
    expect(container.innerHTML).not.toBe(first);
    expect(pctOf(line(container))).toBeCloseTo(60, 5);
  });

  it("starts the veil at the end of the hour the line is in, from the lanes' grid", () => {
    setPlayhead(FIRST + 2.5 * HOUR);
    const { container } = render(<HeadSled project={project} grids={grids} />);
    // The hour that holds 2:30 ends at 3:00, which is 30 percent of the window.
    expect(headEdge(FIRST + 2.5 * HOUR, grids)).toBe(FIRST + 3 * HOUR);
    expect(pctOf(veil(container))).toBeCloseTo(30, 5);
    // Inside the same hour the veil does not move.
    const before = moverOf(veil(container)).style.transform;
    setPlayhead(FIRST + 2.9 * HOUR);
    expect(moverOf(veil(container)).style.transform).toBe(before);
    // Across the edge it moves one hour on.
    setPlayhead(FIRST + 3 * HOUR);
    expect(pctOf(veil(container))).toBeCloseTo(40, 5);
  });

  it("starts the veil at the line where the pack has no lane", () => {
    setPlayhead(FIRST + 2.5 * HOUR);
    const { container } = render(<HeadSled project={project} grids={[]} />);
    expect(pctOf(veil(container))).toBeCloseTo(25, 5);
  });

  it("hides the line outside the window and the veil when the edge is past the window's end", () => {
    setPlayhead(FIRST + 9.5 * HOUR);
    const { container } = render(<HeadSled project={project} grids={grids} />);
    // 9:30's hour ends at 10:00, the window's end: there is nothing left to veil.
    expect(veil(container).style.visibility).toBe("hidden");
    expect(line(container).style.visibility).toBe("visible");
    setPlayhead(FIRST - HOUR);
    expect(line(container).style.visibility).toBe("hidden");
  });

  it("draws in the theme's own colours, through tokens", () => {
    // happy-dom drops a colour written with a variable, so the source is read instead.
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "HeadSled.tsx"), "utf8");
    expect(source).toContain("rgb(var(--text-rgb))");
    expect(source).toContain("rgb(var(--glass-tint) / 0.5)");
  });
});

describe("LaneFigure", () => {
  const figure = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-lane-figure]");

  it("writes the lane's id and the value of the bar that holds the playhead", () => {
    setPlayhead(FIRST + 1.25 * HOUR);
    const { container } = render(<LaneFigure laneId="lane-a" lane={lane} project={project} name="Lane A" plotPx={1000} />);
    expect(figure(container)!.getAttribute("data-lane-figure")).toBe("lane-a");
    // As the header's readout writes its value: plain digits with two decimals.
    expect(figure(container)!.getAttribute("data-lane-figure-value")).toBe("4061.71");
    // On screen it is the full form with the separator.
    expect(figure(container)!.textContent).toBe("4,061.71");
  });

  it("follows the playhead into the next bar and shows nothing where no bar holds it", () => {
    setPlayhead(FIRST + 2.1 * HOUR);
    const { container } = render(<LaneFigure laneId="lane-a" lane={lane} project={project} name="Lane A" plotPx={1000} />);
    expect(figure(container)!.getAttribute("data-lane-figure-value")).toBe("4133.57");
    setPlayhead(FIRST + 11 * HOUR);
    expect(figure(container)).toBeNull();
    setPlayhead(FIRST - HOUR);
    expect(figure(container)).toBeNull();
  });

  it("stands right of the line in the first half of its bar and left in the second half", () => {
    const { container } = render(<LaneFigure laneId="lane-a" lane={lane} project={project} name="Lane A" plotPx={1000} />);
    setPlayhead(FIRST + 1.25 * HOUR);
    expect(figure(container)!.getAttribute("data-side")).toBe("right");
    setPlayhead(FIRST + 1.5 * HOUR);
    expect(figure(container)!.getAttribute("data-side")).toBe("left");
    setPlayhead(FIRST + 1.75 * HOUR);
    expect(figure(container)!.getAttribute("data-side")).toBe("left");
  });

  it("stands left near the plot's right end, by its measured width and not a share of the plot", () => {
    // The last bar holds 4,133.57: eight characters, 59.56 px with its padding and gap. A quarter
    // into that bar the line is at 92.5 percent of the plot, so the figure fits to its right on a
    // plot of 800 px (740 + 59.56 is 799.56) and does not on one of 790 px (730.75 + 59.56).
    setPlayhead(FIRST + 9.25 * HOUR);
    const { container, rerender } = render(<LaneFigure laneId="lane-a" lane={lane} project={project} name="Lane A" plotPx={1244} />);
    expect(figure(container)!.getAttribute("data-side")).toBe("right");
    rerender(<LaneFigure laneId="lane-a" lane={lane} project={project} name="Lane A" plotPx={800} />);
    expect(figure(container)!.getAttribute("data-side")).toBe("right");
    rerender(<LaneFigure laneId="lane-a" lane={lane} project={project} name="Lane A" plotPx={790} />);
    expect(figure(container)!.getAttribute("data-side")).toBe("left");
  });

  it("places the figure by a transform and carries a tooltip with the hour and the value", () => {
    setPlayhead(FIRST + 1.25 * HOUR);
    const { container } = render(<LaneFigure laneId="lane-a" lane={lane} project={project} name="Lane A" plotPx={1000} />);
    const f = figure(container)!;
    expect(/translateX\(12\.5%\)/.test(f.parentElement!.style.transform)).toBe(true);
    expect(f.getAttribute("data-tip")).toContain("Lane A at the playhead");
    expect(f.getAttribute("data-tip")).toContain("4,061.71 units");
    expect(f.parentElement!.parentElement!.getAttribute("aria-hidden")).toBe("true");
  });

  // Call 43: a time inside a tooltip follows the clock's switch. The bar that holds the playhead
  // here starts one hour into the window.
  const BAR_START = FIRST + HOUR;

  it("writes the tooltip's hour in the 12 hour form while the clock is in it", () => {
    setPlayhead(FIRST + 1.25 * HOUR);
    const { container } = render(<LaneFigure laneId="lane-a" lane={lane} project={project} name="Lane A" plotPx={1000} />);
    expect(span(BAR_START, HOUR, "12h")).not.toBe(span(BAR_START, HOUR, "24h"));
    expect(figure(container)!.getAttribute("data-tip")).toContain(span(BAR_START, HOUR, "12h"));
  });

  it("writes the tooltip's hour in the 24 hour form when the switch is turned, on the same mount", () => {
    setPlayhead(FIRST + 1.25 * HOUR);
    const { container } = render(<LaneFigure laneId="lane-a" lane={lane} project={project} name="Lane A" plotPx={1000} />);
    expect(figure(container)!.getAttribute("data-tip")).toContain(span(BAR_START, HOUR, "12h"));
    act(() => useClockForm.setState({ h24: true }));
    const tipText = figure(container)!.getAttribute("data-tip")!;
    expect(tipText).toContain(span(BAR_START, HOUR, "24h"));
    expect(tipText).not.toContain(span(BAR_START, HOUR, "12h"));
    // And back: the form is part of what rebuilds the words.
    act(() => useClockForm.setState({ h24: false }));
    expect(figure(container)!.getAttribute("data-tip")).toContain(span(BAR_START, HOUR, "12h"));
  });
});
