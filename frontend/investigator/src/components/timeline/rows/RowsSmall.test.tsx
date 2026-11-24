/**
 * The folded rows' small version, first half: the count, for a story with an hourly
 * step and for one with a day for its step, a window that leaves the busiest step out, and the day
 * cells across a clock change. The number's side, a row that is alone, a case with nothing to draw,
 * the rows' button and the source's rules are in RowsSmall.line.test.tsx (split by subject,
 * because this file passed the 400 line cap the rows' files hold). Every fixture is written here: a
 * pack of "Group" rows, an hourly one (events and bars) and a daily one (events only, 128 rows), with
 * generic names. jsdom draws no layout, so the plot's width comes in as `plotPx` where a test needs it.
 */
import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SMALL_PLOT_PX } from "../../../lib/bar-metrics-small";
import type { RowTick } from "../../../lib/row-ticks";
import type { Track, TrackSet } from "../../../lib/tracks";
import { makeProjector } from "../../../lib/timeline-projector";
import type { LanesSlot } from "../../../lib/timeline-lanes";
import { useClockForm } from "../../../store/clock-form";
import { usePlayhead } from "../../../store/playhead";
import { RowsSmall } from "./RowsSmall";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const EVENING = Date.parse("2026-06-02T22:00:00Z"); // 5:00 PM Houston
const MORNING = Date.parse("2026-06-02T13:00:00Z"); // 8:00 AM Houston

interface Ev {
  row: number;
  t: number;
}
interface Bar {
  row: number;
  t: number;
  value: number;
}

function makeSet(heading: string, rows: number, events: readonly Ev[], bars: readonly Bar[]): { set: TrackSet; ticks: RowTick[] } {
  const tracks: Track[] = Array.from({ length: rows }, (_, i) => {
    const own = bars.filter((b) => b.row === i).map((b) => ({ t: b.t, value: b.value }));
    return { key: `v:g${i}`, name: `Group ${i}`, rest: false, count: 0, bars: own, total: own.reduce((s, b) => s + b.value, 0), kinds: [], lines: [] };
  });
  const trackOf = new Map<string, number>();
  const ticks: RowTick[] = events.map((e, n) => {
    trackOf.set(`e${n}`, e.row);
    return { id: `e${n}`, kind: "k", label: `e${n}`, secondary: "", facts: [], t: e.t, session: null, challengeVar: null, newDevice: false, blocked: false };
  });
  const set: TrackSet = {
    by: "g",
    heading,
    tracks,
    named: rows,
    trackOf,
    scale: bars.length > 0 ? { top: 100, max: 100, above: 0 } : null,
    step: bars.length > 0 ? HOUR : 0,
    barPalette: "",
    barName: "Weight",
    barUnit: "kg",
    memberLabel: "",
  };
  return { set, ticks };
}

const eventsAt = (t: number, n: number): Ev[] => Array.from({ length: n }, (_, row) => ({ row, t }));

// Hourly: 15 of 30 rows active in the evening hour (10 by an event, 5 by a bar), 21 of 30 in the morning hour.
const HOURLY = makeSet(
  "Group",
  30,
  [...eventsAt(EVENING + 10 * MIN, 10), ...eventsAt(MORNING + 5 * MIN, 21)],
  [10, 11, 12, 13, 14].map((row) => ({ row, t: EVENING, value: 3 })),
);

// Daily, shaped as the card story: 128 named rows, few active on any day, no bars.
const DAY1 = Date.parse("2026-05-09T17:00:00Z");
const DAY2 = Date.parse("2026-05-10T17:00:00Z");
const DAY3 = Date.parse("2026-05-11T17:00:00Z");
const DAILY = makeSet("Merchant", 128, [...eventsAt(DAY1, 3), ...eventsAt(DAY2, 9), ...eventsAt(DAY3, 1)], []);

function slotFor(from: number, to: number): LanesSlot & { onPlotMouseDown: ReturnType<typeof vi.fn> } {
  return { project: makeProjector(from, to), onPlotMouseDown: vi.fn() };
}
const setPlayhead = (ms: number) => act(() => usePlayhead.setState({ playhead: ms }));
const figure = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-small-count-figure]");
const label = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-small-label]");
const bars = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("[data-small-count]")];
const heightOf = (bar: HTMLElement) => parseFloat((bar.firstElementChild as HTMLElement).style.height);

const grids = [{ step: HOUR, firstBucketStart: EVENING }];

function hourly(playhead: number, extra: Partial<Parameters<typeof RowsSmall>[0]> = {}) {
  const slot = slotFor(MORNING - 2 * HOUR, EVENING + 4 * HOUR);
  setPlayheadSync(playhead);
  const view = render(<RowsSmall set={HOURLY.set} ticks={HOURLY.ticks} slot={slot} grids={grids} soloKey={null} plotPx={1000} {...extra} />);
  return { ...view, slot };
}
function setPlayheadSync(ms: number) {
  usePlayhead.setState({ playhead: ms });
}

beforeEach(() => {
  usePlayhead.setState({ playhead: EVENING, minTime: MORNING, maxTime: EVENING + 4 * HOUR, isPlaying: false });
  useClockForm.setState({ h24: false });
});

describe("the count, a story with an hourly step", () => {
  it("reads 15 of 30 at 5:22 PM and 21 of 30 at 8:45 AM", () => {
    const { container } = hourly(EVENING + 22 * MIN);
    expect(figure(container)?.textContent).toBe("15 of 30");
    setPlayhead(MORNING + 45 * MIN);
    expect(figure(container)?.textContent).toBe("21 of 30");
  });

  it("prints 0 of 30 in an hour with nothing in it", () => {
    const { container } = hourly(EVENING + 3 * HOUR);
    expect(figure(container)?.textContent).toBe("0 of 30");
  });

  it("prints the range, 0 to the largest count of the whole case, in the name cell", () => {
    const { container } = hourly(EVENING);
    expect(label(container)?.textContent).toBe("Active / 1H · 0 to 21");
  });

  it("marks its kind on the root, as the probe reads it", () => {
    const { container } = hourly(EVENING);
    expect(container.querySelector("[data-rows-small]")?.getAttribute("data-rows-small")).toBe("count");
  });

  it("draws one bar for each hour that has a count, and the busiest fills the 24 px plot", () => {
    const { container } = hourly(EVENING);
    const all = bars(container);
    expect(all).toHaveLength(2);
    const byN = new Map(all.map((b) => [Number(b.dataset.n), heightOf(b)]));
    expect(byN.get(21)).toBe(SMALL_PLOT_PX);
    expect(byN.get(15)).toBeCloseTo((15 / 21) * SMALL_PLOT_PX, 5);
    expect(byN.get(15)).not.toBe(byN.get(21));
  });

  it("gives the plot the height of 24 px", () => {
    const { container } = hourly(EVENING);
    expect(container.querySelector<HTMLElement>("[data-small-plot]")?.style.height).toBe("24px");
  });

  it("says in the label's tooltip what active means and what the top of the scale is", () => {
    const { container } = hourly(EVENING);
    const words = label(container)?.getAttribute("data-tip") ?? "";
    expect(words).toContain("A row is active when it shows an event or a bar over zero in that time.");
    expect(words).toContain("At most 21 rows are active in one bar.");
  });

  it("gives each bar a tooltip with its hour and its count out of all the named rows", () => {
    const { container } = hourly(EVENING);
    const evening = bars(container).find((b) => b.dataset.n === "15");
    expect(evening?.getAttribute("data-tip")).toContain("15 of 30");
    expect(evening?.getAttribute("data-tip")).toContain("5:00p to 6:00p");
  });

  it("writes the hours in the clock's form", () => {
    useClockForm.setState({ h24: true });
    const { container } = hourly(EVENING);
    const evening = bars(container).find((b) => b.dataset.n === "15");
    expect(evening?.getAttribute("data-tip")).toContain("17:00 to 18:00");
  });

  it("draws the line through the plot, and a press on the plot is the track's press", () => {
    const { container, slot } = hourly(EVENING);
    const plot = container.querySelector<HTMLElement>("[data-small-plot]")!;
    expect(plot.querySelector("[data-head-sled]")).not.toBeNull();
    fireEvent.mouseDown(plot);
    expect(slot.onPlotMouseDown).toHaveBeenCalledTimes(1);
  });
});

describe("the count, a story with a day for its step (the card story's shape)", () => {
  const slot = slotFor(DAY1 - 2 * DAY, DAY3 + 3 * DAY);
  const view = (playhead: number, extra: Partial<Parameters<typeof RowsSmall>[0]> = {}) => {
    setPlayheadSync(playhead);
    return render(<RowsSmall set={DAILY.set} ticks={DAILY.ticks} slot={slot} grids={[]} soloKey={null} plotPx={1000} {...extra} />);
  };

  it("prints the range as the largest count of the whole case, 9, and not the 128 named rows", () => {
    const { container } = view(DAY2);
    expect(label(container)?.textContent).toBe("Active / 1D · 0 to 9");
  });

  it("fills the plot with the busiest day, and draws two different counts at two different heights", () => {
    const { container } = view(DAY2);
    const byN = new Map(bars(container).map((b) => [Number(b.dataset.n), heightOf(b)]));
    expect(byN.get(9)).toBe(SMALL_PLOT_PX);
    expect(byN.get(3)).toBe(8);
    expect(new Set(byN.values()).size).toBe(3);
  });

  it("reads 9 of 128 on the busiest day, with the day's own date in the tooltip", () => {
    const { container } = view(DAY2);
    expect(figure(container)?.textContent).toBe("9 of 128");
    const busiest = bars(container).find((b) => b.dataset.n === "9");
    expect(busiest?.getAttribute("data-tip")).toContain("Sun May 10");
  });

  it("starts each bar at the Houston day's own midnight, taken from the data and not a clock", () => {
    const { container } = view(DAY2);
    expect(bars(container).map((b) => Number(b.dataset.t))).toEqual([
      Date.parse("2026-05-09T05:00:00Z"),
      Date.parse("2026-05-10T05:00:00Z"),
      Date.parse("2026-05-11T05:00:00Z"),
    ]);
  });

  it("draws the heading and the count of named rows, with the heading cut to one line", () => {
    const { container } = view(DAY2, { onOpen: () => undefined });
    const button = container.querySelector<HTMLElement>("[data-small-open]")!;
    expect(button.textContent).toContain("Merchant · 128");
    expect(button.className).toContain("whitespace-nowrap");
    expect(button.querySelector(".truncate")?.textContent).toBe("Merchant");
  });

  it("cuts a name cell that is too long to one line, whole in its tooltip", () => {
    const { container } = view(DAY2);
    expect(label(container)?.className).toContain("truncate");
    expect(label(container)?.getAttribute("data-tip")).toContain("Merchant: active rows");
  });

  it("prints that row's own count under a solo, with its own range and bars, on this fixture", () => {
    // Row 4 has one event on the first day and three on the second (one of them from the nine).
    const soloed = makeSet(
      "Merchant",
      128,
      [...eventsAt(DAY1, 3), ...eventsAt(DAY2, 9), { row: 4, t: DAY2 + MIN }, { row: 4, t: DAY2 + 2 * MIN }, { row: 4, t: DAY1 + MIN }],
      [],
    );
    setPlayheadSync(DAY2);
    const { container } = render(<RowsSmall set={soloed.set} ticks={soloed.ticks} slot={slot} grids={[]} soloKey="v:g4" plotPx={1000} />);
    expect(figure(container)?.textContent).toBe("3");
    expect(label(container)?.textContent).toBe("Events / 1D · 0 to 3");
    const byN = new Map(bars(container).map((b) => [Number(b.dataset.n), heightOf(b)]));
    expect(byN.get(3)).toBe(SMALL_PLOT_PX);
    expect(byN.get(1)).toBe(SMALL_PLOT_PX / 3);
  });
});

describe("a window that leaves the busiest step of the case out", () => {
  it("keeps the whole case's top in the label, so the bar in view is shorter than the plot", () => {
    // The 21 row hour is at 8 AM; the window starts at 4 PM and holds only the 15 row hour.
    const slot = slotFor(EVENING - HOUR, EVENING + 4 * HOUR);
    setPlayheadSync(EVENING);
    const { container } = render(<RowsSmall set={HOURLY.set} ticks={HOURLY.ticks} slot={slot} grids={grids} soloKey={null} plotPx={1000} />);
    expect(label(container)?.textContent).toBe("Active / 1H · 0 to 21");
    const inView = bars(container);
    expect(inView).toHaveLength(1);
    expect(heightOf(inView[0])).toBeCloseTo((15 / 21) * SMALL_PLOT_PX, 5);
    expect(heightOf(inView[0])).toBeLessThan(SMALL_PLOT_PX);
  });
});

describe("the day cells across a clock change", () => {
  const OCT31 = Date.parse("2026-10-31T17:00:00Z");
  const NOV1 = Date.parse("2026-11-01T18:00:00Z");
  const NOV2 = Date.parse("2026-11-02T18:00:00Z");
  const fall = makeSet("Group", 5, [...eventsAt(OCT31, 2), ...eventsAt(NOV1, 4), ...eventsAt(NOV2, 1)], []);
  const slot = slotFor(Date.parse("2026-10-30T05:00:00Z"), Date.parse("2026-11-04T06:00:00Z"));

  it("starts the count's bars at local midnight on both sides of it", () => {
    setPlayheadSync(NOV1);
    const { container } = render(<RowsSmall set={fall.set} ticks={fall.ticks} slot={slot} grids={[]} soloKey={null} plotPx={1000} />);
    expect(bars(container).map((b) => Number(b.dataset.t))).toEqual([
      Date.parse("2026-10-31T05:00:00Z"),
      Date.parse("2026-11-01T05:00:00Z"),
      Date.parse("2026-11-02T06:00:00Z"),
    ]);
  });

  it("measures the half of the 25 hour day from its own span", () => {
    const start = Date.parse("2026-11-01T05:00:00Z");
    const side = (offset: number) => {
      setPlayheadSync(start + offset);
      const { container, unmount } = render(<RowsSmall set={fall.set} ticks={fall.ticks} slot={slot} grids={[]} soloKey={null} plotPx={5000} />);
      const found = figure(container)?.dataset.side;
      unmount();
      return found;
    };
    // The half of 25 hours is at 12.5 hours; 24 hours would put it at 12.
    expect(side(12.25 * HOUR)).toBe("right");
    expect(side(12.75 * HOUR)).toBe("left");
  });
});
