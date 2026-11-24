// frontend/investigator/src/components/timeline/LaneSmall.test.tsx
// The folded lane keeps its bars and its number on one line. The fixture lane is written here: 100 hourly bars of a generic "Parcel · Weight" lane in
// kg, six of them far over the plot's top. The window shows 17 of them; four of the six cut bars lie
// outside it, so the sentence about cut bars must count the whole lane and not the window.
// The real stories' figures (17 bars and 4,061.71 at 5:22 PM on the token story) are checked
// on the built site and are not read here.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer, showTipAt } from "../ui/Tip";
import { LaneSmall } from "./LaneSmall";
import { SMALL_LABEL_GAP_PX } from "../../lib/bar-metrics-small";
import { amount, span } from "../../lib/time-words";
import { laneBarWords } from "../../lib/tooltip-words/lane";
import { laneSmallWords } from "../../lib/tooltip-words/lane-small";
import {
  LANE_PLOT_PX,
  buildLane,
  formatLaneNumber,
  formatScaleNumber,
  laneValueAttr,
  type LaneModel,
  type LanesSlot,
} from "../../lib/timeline-lanes";
import { makeProjector } from "../../lib/timeline-projector";
import { useClockForm } from "../../store/clock-form";
import { usePlayhead } from "../../store/playhead";
import type { Entity } from "../../lib/entity";
import type { ScenarioNode } from "../../lib/scenarios";

// ---- Fixtures ------------------------------------------------------------------------------

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 5);

const node: ScenarioNode = {
  kind: "parcel",
  label: "Parcel",
  palette: "#3366cc",
  source: "json",
  timestamp: "at",
  magnitude: "weight",
  magnitudeLabel: "Weight",
  magnitudeUnit: "kg",
};

const row = (i: number, weight: number): Entity => ({
  id: `r${i}`,
  kind: "parcel",
  timestamp: T0 + i * HOUR,
  coords: null,
  fields: { weight },
  displayMetadata: { primaryLabel: `r${i}`, secondaryLabel: "", paletteKind: "parcel", pivotableFields: [] },
});

/** Hours of the six bars far over the top: two stand in the window below, four stand outside it. */
const BIG_HOURS = [3, 10, 25, 30, 60, 80];
const weightAt = (i: number): number => (BIG_HOURS.includes(i) ? 5000.5 + i : 100.25 + (i % 10));

const makeLane = (): LaneModel => {
  const lane = buildLane(
    Array.from({ length: 100 }, (_, i) => row(i, weightAt(i))),
    node,
  );
  if (!lane) throw new Error("fixture lane is empty");
  return lane;
};

/** The window runs from 20.5 h to 36.9 h: with a bar 0.85 h wide, the bars of hours 20 to 36 reach
 *  into it, and that is 17 bars. */
const WIN_FROM = T0 + 20.5 * HOUR;
const WIN_TO = T0 + 36.9 * HOUR;
const project = makeProjector(WIN_FROM, WIN_TO);
const grids = [{ step: HOUR, firstBucketStart: T0 }];
const formatTime = (ms: number): string => `t${(ms - T0) / HOUR}h`;

interface Opts {
  lane?: LaneModel;
  whose?: string;
  controls?: string;
  plotPx?: number;
  onToggle?: (kind: string) => void;
  onPlotMouseDown?: LanesSlot["onPlotMouseDown"];
}

const props = (o: Opts = {}) => {
  const slot: LanesSlot = { project, onPlotMouseDown: o.onPlotMouseDown ?? vi.fn() };
  return {
    lane: o.lane ?? makeLane(),
    slot,
    onToggle: o.onToggle ?? vi.fn(),
    head: { grids },
    formatTime,
    plotPx: o.plotPx ?? 600,
    ...(o.whose !== undefined ? { whose: o.whose } : {}),
    ...(o.controls !== undefined ? { controls: o.controls } : {}),
  };
};

const mount = (o: Opts = {}) => {
  const view = render(
    <>
      <LaneSmall {...props(o)} />
      <TipLayer />
    </>,
  );
  const q = <E extends Element = HTMLElement>(sel: string): E => view.container.querySelector<E>(sel) as E;
  const qa = (sel: string): HTMLElement[] => Array.from(view.container.querySelectorAll<HTMLElement>(sel));
  return { ...view, q, qa, button: () => q<HTMLButtonElement>("[data-lane-small-name]") };
};

const setPlayhead = (ms: number) => act(() => usePlayhead.setState({ playhead: ms }));
const figure = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-lane-figure-value]");

beforeEach(() => {
  usePlayhead.setState({ playhead: T0 + 22.1 * HOUR, minTime: T0, maxTime: T0 + 100 * HOUR, isPlaying: false });
  useClockForm.setState({ h24: false });
});
afterEach(() => {
  act(() => {
    showTipAt(null);
  });
});

// ---- The fixture itself -------------------------------------------------------------------------

describe("the fixture", () => {
  it("has six bars over its top and two decimals, so the tests below read what they say", () => {
    const lane = makeLane();
    expect(lane.bars).toHaveLength(100);
    expect(lane.scale.above).toBe(6);
    expect(lane.decimals).toBe(2);
    expect(lane.bars.filter((b) => b.cut).map((b) => (b.t - T0) / HOUR)).toEqual(BIG_HOURS);
  });
});

// ---- The bars --------------------------------------------------------------------------------

describe("LaneSmall bars", () => {
  it("draws the bars that reach into the window and no others: 17 of the lane's 100", () => {
    const { qa } = mount();
    expect(qa("[data-lane-small-bar]")).toHaveLength(17);
  });

  it("draws a cut bar with its cap, a bar under the top with one piece", () => {
    const { qa } = mount();
    const cut = qa("[data-lane-small-bar][data-lane-small-cut]");
    expect(cut).toHaveLength(2);
    for (const bar of cut) expect(bar.querySelectorAll("[data-lane-small-piece]")).toHaveLength(2);
    const plain = qa("[data-lane-small-bar]:not([data-lane-small-cut])");
    expect(plain).toHaveLength(15);
    for (const bar of plain) expect(bar.querySelectorAll("[data-lane-small-piece]")).toHaveLength(1);
  });

  it("gives each bar the lane's own words for a bar, and the cut sentence to a cut bar", () => {
    const { qa } = mount();
    const bars = qa("[data-lane-small-bar]");
    const lane = makeLane();
    const first = lane.bars.find((b) => b.t === T0 + 20 * HOUR)!;
    const words = laneBarWords("Parcel · Weight", undefined, span(first.t, lane.step, "12h"), amount(first.value, "kg"), null);
    expect(bars[0].getAttribute("data-tip")).toBe(words.join("\n"));
    const cutTip = qa("[data-lane-small-cut]")[0].getAttribute("data-tip") ?? "";
    expect(cutTip).toContain(`The plot cuts this bar at ${amount(lane.scale.top, "kg")}.`);
  });

  it("has a plot as high as the open lane's, and the plot is not the open plot", () => {
    const { q, container } = mount();
    const plot = q("[data-lane-small-plot]");
    expect(plot.style.height).toBe(`${LANE_PLOT_PX}px`);
    expect(plot.getAttribute("role")).toBe("img");
    expect(plot.getAttribute("aria-label")).toContain("Parcel Weight");
    // The lane check's selector stays on that attribute only: the small version never carries it.
    expect(container.querySelector("[data-magnitude-plot]")).toBeNull();
    expect(container.querySelector("[data-magnitude-lane]")).toBeNull();
    expect(container.querySelector("[data-bucket]")).toBeNull();
  });

  it("hands a press on the plot to the shell's seek", () => {
    const onPlotMouseDown = vi.fn();
    const { q } = mount({ onPlotMouseDown });
    fireEvent.mouseDown(q("[data-lane-small-plot]"));
    expect(onPlotMouseDown).toHaveBeenCalledTimes(1);
  });
});

// ---- The number at the line ----------------------------------------------------------------------

describe("LaneSmall number at the line", () => {
  it("is the value of the bar that holds the playhead, in the lane's full form", () => {
    const { container } = mount();
    const lane = makeLane();
    const bar = lane.bars.find((b) => b.t === T0 + 22 * HOUR)!;
    expect(figure(container)!.getAttribute("data-lane-figure-value")).toBe(laneValueAttr(bar.value, 2));
    expect(figure(container)!.textContent).toBe(formatLaneNumber(bar.value, 2));
  });

  it("stands right in the first half of its bar's step and left in the second half (call 18)", () => {
    const { container } = mount();
    setPlayhead(T0 + 22.25 * HOUR);
    expect(figure(container)!.getAttribute("data-side")).toBe("right");
    setPlayhead(T0 + 22.5 * HOUR);
    expect(figure(container)!.getAttribute("data-side")).toBe("left");
    setPlayhead(T0 + 22.75 * HOUR);
    expect(figure(container)!.getAttribute("data-side")).toBe("left");
  });

  it("stands left near the plot's right end, where its measured width would pass the end", () => {
    const { container } = mount({ plotPx: 600 });
    // At 36.1 h the line is at 95 percent of 600 px: 570 px, and the figure is about 47 px wide.
    setPlayhead(T0 + 36.1 * HOUR);
    expect(figure(container)!.getAttribute("data-side")).toBe("left");
  });

  it("is on the plot, which holds the head's line too", () => {
    const { q } = mount();
    expect(q("[data-lane-small-plot] [data-head-line]")).not.toBeNull();
    expect(q("[data-lane-small-plot] [data-lane-figure-value]")).not.toBeNull();
  });
});

// ---- The name button -----------------------------------------------------------------------------

describe("LaneSmall name button", () => {
  it("reads as not expanded, as the open plot is hidden, and names no element a press does not open", () => {
    const { button } = mount();
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(button().hasAttribute("aria-controls")).toBe(false);
  });

  it("names the open plot when its owner gives the plot's id", () => {
    const { button } = mount({ controls: "open-plot-id" });
    expect(button().getAttribute("aria-controls")).toBe("open-plot-id");
  });

  it("opens the lane by the lane's kind", () => {
    const onToggle = vi.fn();
    const { button } = mount({ onToggle });
    fireEvent.click(button());
    expect(onToggle).toHaveBeenCalledWith("parcel");
  });

  it("carries the sentence that explains a bar over the top as its description", () => {
    const { button } = mount();
    const lane = makeLane();
    const description = button().getAttribute("aria-description") ?? "";
    expect(description).toContain(
      `${lane.scale.above} bars are over that. The plot cuts them. The largest bar is ${amount(lane.scale.max, "kg")}.`,
    );
    const lines = laneSmallWords("Parcel · Weight", "kg", "1H", undefined, amount(lane.scale.top, "kg"), 6, amount(lane.scale.max, "kg"));
    expect(button().getAttribute("data-tip")).toBe(lines.join("\n"));
  });

  it("shows that sentence when the keyboard focuses the button, with no hover", () => {
    const { button } = mount();
    // The test environment answers false to ":focus-visible", so the keyboard case stands in for it.
    vi.spyOn(button(), "matches").mockImplementation((s: string) => s === ":focus-visible");
    act(() => button().focus());
    const layer = document.querySelector("[data-tip-layer]");
    expect(layer).not.toBeNull();
    expect(layer!.textContent).toContain("6 bars are over that. The plot cuts them.");
    expect(layer!.textContent).toContain("The largest bar is");
  });

  it("says nothing about cut bars on a lane with none", () => {
    const flat = buildLane(
      Array.from({ length: 30 }, (_, i) => row(i, 100.25 + (i % 5))),
      node,
    )!;
    expect(flat.scale.above).toBe(0);
    const { button } = mount({ lane: flat });
    expect(button().getAttribute("aria-description")).not.toMatch(/over that/);
  });

  it("has an accessible name that is the lane's name and then what it is and what a press does", () => {
    const { button } = mount();
    expect(button().textContent).toContain("Parcel · Weight");
    expect(button().textContent).toContain("It is folded. It shows a small version. Press to open the lane.");
  });

  it("draws the one fold mark, closed, and no outline: the folded lane's triangle is the open lane's triangle turned", () => {
    const { q, button } = mount();
    const mark = q("[data-lane-small-name] [data-fold-mark]");
    expect(mark.getAttribute("data-fold-mark")).toBe("closed");
    expect(mark.className).toBe("mr-1 shrink-0");
    expect(mark.querySelector("path")!.getAttribute("fill")).toBe("currentColor");
    expect(button().querySelectorAll("[data-fold-mark]")).toHaveLength(1);
    expect(document.querySelector("[data-fold-svg]")).toBeNull();
    expect(button().querySelector("polygon")).toBeNull();
  });

  it("reads the row's name when one row is alone, and says so in the words", () => {
    const { button } = mount({ whose: "Acme Co" });
    expect(button().textContent).toContain("Acme Co");
    expect(button().getAttribute("data-tip")).toContain("Each bar shows the values of Acme Co alone in one hour.");
  });

  it("prints the unit, the step and the plot's range under the name, as the open lane's header does", () => {
    const { q } = mount();
    const lane = makeLane();
    expect(q("[data-lane-small-range]").textContent).toBe(`kg / 1H · 0 to ${formatScaleNumber(lane.scale.top)}`);
  });
});

// ---- The label's gap to the plot -----------------------------------------------------------------------
// The rule `small-label-gap` (scripts/lane-check.mjs) reads two labels of a small version: the first
// span of the name button that is neither aria-hidden nor the sr-only words, and the range line, and
// it takes each one's drawn end as its box's right edge less its OWN right padding. jsdom draws no
// layout, so these tests pin the styles that give that gap (one line, an ellipsis, 12 px of padding
// on the measured element itself); a crawl of the built site checks the pixels.

describe("LaneSmall label gap", () => {
  const LONG = "Authorizations and transfers across every channel of the whole book";
  const nameSpan = (q: <E extends Element = HTMLElement>(s: string) => E) =>
    q("[data-lane-small-name] > span:not([aria-hidden]):not([data-lane-small-words])");
  const longLane = (): LaneModel => ({ ...makeLane(), nodeLabel: LONG });

  it("uses a name of 60 characters or more, so the tests below read what they say", () => {
    expect(`${LONG} · Weight`.length).toBeGreaterThanOrEqual(60);
  });

  it("keeps the name on one line, cut with an ellipsis, with the gap on the span the reader measures", () => {
    const { q } = mount({ lane: longLane() });
    const span = nameSpan(q);
    for (const cls of ["truncate", "min-w-0"]) expect(span.className).toContain(cls);
    expect(span.style.paddingRight).toBe(`${SMALL_LABEL_GAP_PX}px`);
  });

  it("keeps the range on one line, cut with an ellipsis, with the gap on the range element itself", () => {
    const { q } = mount({ lane: longLane() });
    const range = q("[data-lane-small-range]");
    for (const cls of ["truncate", "whitespace-nowrap"]) expect(range.className).toContain(cls);
    expect(range.style.paddingRight).toBe(`${SMALL_LABEL_GAP_PX}px`);
  });

  it("gives the button no padding of its own that would take the place of the 12 px", () => {
    const { button } = mount({ lane: longLane() });
    expect(button().className).not.toMatch(/(^|\s)p[rx]-/);
    expect(button().style.paddingRight).toBe("");
    for (const cls of ["whitespace-nowrap", "w-full", "min-w-0"]) expect(button().className).toContain(cls);
  });

  it("keeps the whole name in the button's text, in the span and in the tooltip, and cuts none in script", () => {
    const { q, button } = mount({ lane: longLane() });
    expect(nameSpan(q).textContent).toBe(`${LONG} · Weight`);
    expect(button().textContent).toContain(`${LONG} · Weight`);
    expect(button().getAttribute("data-tip")).toContain(`${LONG} · Weight`);
  });

  it("holds the same rule for a long name of one row that is alone", () => {
    const whose = "Fiskhaven Market Montrose Pharmacy and Pilates Collective Suite";
    const { q } = mount({ lane: longLane(), whose });
    expect(nameSpan(q).textContent).toBe(whose);
    expect(nameSpan(q).className).toContain("truncate");
    expect(nameSpan(q).style.paddingRight).toBe(`${SMALL_LABEL_GAP_PX}px`);
  });

  it("leaves the name column's width alone: it is the first child and is as wide as the inset", () => {
    const { q } = mount({ lane: longLane() });
    expect((q("[data-lane-small]").firstElementChild as HTMLElement).style.width).toBe("148px");
  });
});

// ---- The source ------------------------------------------------------------------------------------

describe("LaneSmall source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const files = ["LaneSmall.tsx", "../../lib/tooltip-words/lane-small.ts"].map((f) => strip(readFileSync(resolve(here, f), "utf8")));
  const raw = ["LaneSmall.tsx", "../../lib/tooltip-words/lane-small.ts"].map((f) => readFileSync(resolve(here, f), "utf8"));

  it("reads no clock and does not follow the playhead itself: only the head's pieces do", () => {
    for (const src of files) {
      expect(src).not.toMatch(/usePlayhead|Date\.now|setInterval|requestAnimationFrame|setTimeout/);
    }
  });

  it("holds no word of one pack", () => {
    for (const src of files) expect(src).not.toMatch(/usage|spend|usd/i);
  });

  it("holds no key handler and not the word of one dismissal key, comments included (call 7 is open)", () => {
    const key = new RegExp(["Esc", "ape"].join(""), "i");
    for (const src of [...raw, readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => !l.includes('["Esc"')).join("\n")]) {
      expect(src).not.toMatch(key);
    }
    for (const src of files) expect(src).not.toMatch(/onKeyDown|keydown/);
  });
});
