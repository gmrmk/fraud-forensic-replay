/**
 * The folded rows' small version, second half: the number's side of the line, a row
 * that is alone, a case with nothing to draw, the rows' button on the line, and the source's own
 * rules. It was split from RowsSmall.test.tsx by subject because that file passed the 400
 * line cap the rows' files hold; the count stories stay there. Every fixture is written here: a pack
 * of "Group" rows with events and bars, and generic names.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BAR_FOCUS_RING } from "../../../lib/bar-metrics";
import { SMALL_LABEL_GAP_PX, SMALL_PLOT_PX } from "../../../lib/bar-metrics-small";
import type { RowTick } from "../../../lib/row-ticks";
import { rowsCountName } from "../../../lib/row-ticks";
import { foldTail } from "../../../lib/tooltip-words/head";
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

describe("the number's side of the line (call 18)", () => {
  const side = (playhead: number, plotPx: number, window: [number, number]) => {
    const slot = slotFor(window[0], window[1]);
    setPlayheadSync(playhead);
    const { container, unmount } = render(<RowsSmall set={HOURLY.set} ticks={HOURLY.ticks} slot={slot} grids={grids} soloKey={null} plotPx={plotPx} />);
    const found = figure(container)?.dataset.side;
    unmount();
    return found;
  };
  const wide: [number, number] = [EVENING - 2 * HOUR, EVENING + 8 * HOUR];

  it("stands right of the line at a quarter of its hour", () => {
    expect(side(EVENING + 15 * MIN, 2000, wide)).toBe("right");
  });

  it("stands left of the line at a half of its hour, and at three quarters", () => {
    expect(side(EVENING + 30 * MIN, 2000, wide)).toBe("left");
    expect(side(EVENING + 45 * MIN, 2000, wide)).toBe("left");
  });

  it("stands left near the plot's right end, where its width would pass the end", () => {
    const end: [number, number] = [EVENING - 9 * HOUR, EVENING + HOUR];
    expect(side(EVENING + 3 * MIN, 200, end)).toBe("left");
    // The same place on a plot wide enough to hold the figure keeps it on the right.
    expect(side(EVENING + 3 * MIN, 2000, end)).toBe("right");
  });
});

describe("under a solo", () => {
  const events: Ev[] = [
    { row: 2, t: EVENING + 5 * MIN },
    { row: 2, t: EVENING + 40 * MIN },
    { row: 2, t: MORNING + 10 * MIN },
    // Eight other rows, none of them row 2.
    ...Array.from({ length: 8 }, (_, i) => ({ row: 3 + i, t: EVENING + 50 * MIN })),
  ];
  const solo = makeSet("Group", 30, events, [{ row: 2, t: EVENING, value: 5 }]);
  const slot = slotFor(MORNING - 2 * HOUR, EVENING + 4 * HOUR);

  it("prints that row's own count at the line, and says events in the name cell", () => {
    setPlayheadSync(EVENING + 22 * MIN);
    const { container } = render(<RowsSmall set={solo.set} ticks={solo.ticks} slot={slot} grids={grids} soloKey="v:g2" plotPx={1000} />);
    expect(figure(container)?.textContent).toBe("2");
    expect(label(container)?.textContent).toBe("Events / 1H · 0 to 2");
    setPlayhead(MORNING + 20 * MIN);
    expect(figure(container)?.textContent).toBe("1");
  });

  it("scales the bars from 0 to that row's own largest count", () => {
    setPlayheadSync(EVENING);
    const { container } = render(<RowsSmall set={solo.set} ticks={solo.ticks} slot={slot} grids={grids} soloKey="v:g2" plotPx={1000} />);
    const byN = new Map(bars(container).map((b) => [Number(b.dataset.n), heightOf(b)]));
    expect(byN.get(2)).toBe(SMALL_PLOT_PX);
    expect(byN.get(1)).toBe(SMALL_PLOT_PX / 2);
  });

  it("counts the whole case when the key names no named row", () => {
    setPlayheadSync(EVENING + 22 * MIN);
    const { container } = render(<RowsSmall set={solo.set} ticks={solo.ticks} slot={slot} grids={grids} soloKey="v:nobody" plotPx={1000} />);
    expect(figure(container)?.textContent).toMatch(/ of 30$/);
  });
});

describe("with nothing to draw", () => {
  const slot = slotFor(EVENING, EVENING + DAY);

  it("draws no strip and no range label for a fixture with no named rows", () => {
    const none = makeSet("Group", 0, [], []);
    const { container } = render(<RowsSmall set={none.set} ticks={none.ticks} slot={slot} grids={[]} soloKey={null} plotPx={1000} />);
    expect(container.querySelector("[data-small-plot]")).toBeNull();
    expect(container.querySelector("[data-small-label]")).toBeNull();
    expect(container.textContent).not.toMatch(/0 to 0/i);
    expect(container.innerHTML).toBe("");
  });

  it("draws no strip and no label named 0 to 0 for named rows with nothing in any hour", () => {
    const empty = makeSet("Group", 4, [], []);
    const { container } = render(<RowsSmall set={empty.set} ticks={empty.ticks} slot={slot} grids={[]} soloKey={null} plotPx={1000} />);
    expect(container.querySelector("[data-small-plot]")).toBeNull();
    expect(container.textContent).not.toMatch(/0 to 0/i);
  });

  it("keeps the line's own button for named rows with nothing in any hour", () => {
    const empty = makeSet("Group", 4, [], []);
    const { container } = render(<RowsSmall set={empty.set} ticks={empty.ticks} slot={slot} grids={[]} soloKey={null} plotPx={1000} onOpen={() => undefined} />);
    expect(container.querySelector("[data-small-open]")).not.toBeNull();
    expect(container.querySelector("[data-small-label]")).toBeNull();
  });
});

describe("the rows' button on the line (when the line carries it)", () => {
  const open = (onOpen = vi.fn()) => {
    const slot = slotFor(MORNING - 2 * HOUR, EVENING + 4 * HOUR);
    setPlayheadSync(EVENING);
    const view = render(<RowsSmall set={HOURLY.set} ticks={HOURLY.ticks} slot={slot} grids={grids} soloKey={null} plotPx={1000} onOpen={onOpen} />);
    return { ...view, onOpen, button: view.container.querySelector<HTMLElement>("[data-small-open]")! };
  };

  it("is drawn only when the line is given a press to hand on", () => {
    const { container } = hourly(EVENING);
    expect(container.querySelector("[data-small-open]")).toBeNull();
  });

  it("stands for a folded section, reads as not expanded, and opens the rows when pressed", () => {
    const { button, onOpen } = open();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("is named by the heading and the count of rows, then says that a small version is shown", () => {
    const { button } = open();
    expect(button.getAttribute("aria-label")).toBe(`${rowsCountName("Group", 30)}. ${foldTail("small", "the rows")}`);
  });

  it("carries the one fold mark, closed, and no outline: a folded section that shows a small version", () => {
    const { button } = open();
    const marks = button.querySelectorAll("[data-fold-mark]");
    expect(marks).toHaveLength(1);
    expect(marks[0].getAttribute("data-fold-mark")).toBe("closed");
    expect(marks[0].className).toBe("mr-1 shrink-0");
    expect(marks[0].querySelector("path")!.getAttribute("fill")).toBe("currentColor");
    expect(button.querySelector("[data-fold-svg]")).toBeNull();
    expect(button.querySelector("polygon")).toBeNull();
  });

  it("takes the bar's one focus ring and a tooltip that says what a press does", () => {
    const { button } = open();
    for (const cls of BAR_FOCUS_RING.split(" ")) expect(button.className).toContain(cls);
    expect(button.getAttribute("data-tip")).toContain("Press to open the rows.");
  });

  // The rule `small-label-gap` reads the label's drawn end as its box's right edge less its OWN right
  // padding, and for this button it reads the last span, so the 12 px stands on that span and not on
  // the button. jsdom draws no layout: this pins the styles, not pixels.
  it("holds the 12 px gap on the span the reader measures, for a heading of 60 characters", () => {
    const long = makeSet("Merchant category and acquiring bank of every card in the whole book", 30, eventsAt(EVENING, 3), []);
    const slot = slotFor(MORNING - 2 * HOUR, EVENING + 4 * HOUR);
    const { container } = render(<RowsSmall set={long.set} ticks={long.ticks} slot={slot} grids={grids} soloKey={null} plotPx={1000} onOpen={() => undefined} />);
    const button = container.querySelector<HTMLElement>("[data-small-open]")!;
    const heading = button.firstElementChild!.nextElementSibling as HTMLElement;
    const last = button.lastElementChild as HTMLElement;
    expect(last.tagName).toBe("SPAN");
    expect(heading.textContent).toBe(long.set.heading);
    expect(heading.className).toContain("truncate");
    expect(last.style.paddingRight).toBe(`${SMALL_LABEL_GAP_PX}px`);
    expect(button.className).not.toMatch(/(^|\s)p[rx]-/);
    expect(button.getAttribute("data-tip")).toContain(long.set.heading);
    expect(button.getAttribute("aria-label")).toContain(long.set.heading);
    expect(label(container)?.style.paddingRight).toBe(`${SMALL_LABEL_GAP_PX}px`);
    expect(label(container)?.className).toContain("truncate");
  });
});

describe("the source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "RowsSmall.tsx"), "utf8");

  it("reads no clock and starts no timer", () => {
    expect(source).not.toMatch(/Date\.now|new Date\(\)|performance\.now|setInterval|setTimeout|requestAnimationFrame/);
  });

  it("holds no code of the option that was not picked", () => {
    expect(source.toLowerCase()).not.toContain(["stri", "pe"].join(""));
  });

  it("names no Escape key, since the tooltip layer holds that", () => {
    expect(source).not.toContain("Escape");
  });
});
