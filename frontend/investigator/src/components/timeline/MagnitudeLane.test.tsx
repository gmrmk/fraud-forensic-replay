import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MagnitudeLane } from "./MagnitudeLane";
import type { BucketGrid } from "../../lib/head-edge";
import { laneBarWords, laneFoldWords, laneScaleWords } from "../../lib/tooltip-words/lane";
import { amount, span } from "../../lib/time-words";
import {
  LANE_EDGE_VAR,
  LANE_LINE_VAR,
  LANE_PLOT_PX,
  barWidthPct,
  buildLane,
  emptyLaneLike,
  formatLaneNumber,
  formatStep,
  laneName,
  lanePlotLabel,
  laneScaleText,
  type LaneModel,
  type LanesSlot,
} from "../../lib/timeline-lanes";
import { makeProjector, type TimelineProjector } from "../../lib/timeline-projector";
import { usePlayhead } from "../../store/playhead";
import { compositeOver, contrastRatio } from "../../theme/legibility";
import { hexToRgb01 } from "../../theme/to-rgb";
import { PALETTES } from "../../theme/tokens";
import type { Entity } from "../../lib/entity";
import type { ScenarioNode } from "../../lib/scenarios";

// ---- Fixtures: the shape of lib/timeline-lanes.test.ts (not imported from it) -------------------

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 5);

const bare: ScenarioNode = {
  kind: "parcel",
  label: "Parcel",
  palette: "#3366cc",
  source: "json",
  timestamp: "at",
  magnitude: "weight",
};
const named: ScenarioNode = { ...bare, magnitudeLabel: "Weight", magnitudeUnit: "kg" };

const row = (id: string, weight: unknown, timestamp: number): Entity => ({
  id,
  kind: "parcel",
  timestamp,
  coords: null,
  fields: { weight },
  displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: "parcel", pivotableFields: [] },
});

/** Rows at the given hours (from T0) with the given values. */
const at = (hours: readonly number[], values: readonly number[]): Entity[] =>
  hours.map((h, i) => row(`r${i}`, values[i], T0 + h * HOUR));

/** Nine buckets with a gap at hour 5: 1,000 at hour 0, 1,100 at hour 1, and so on. */
const GAP_HOURS = [0, 1, 2, 3, 4, 6, 7, 8, 9];
const GAP_VALUES = GAP_HOURS.map((h) => 1000 + 100 * h);
const GAP_ROWS = at(GAP_HOURS, GAP_VALUES);

const gapLane = (node: ScenarioNode): LaneModel => {
  const lane = buildLane(GAP_ROWS, node);
  if (!lane) throw new Error("fixture lane is empty");
  return lane;
};

/** Eighteen values 100 to 270 and two of 3,000 and 3,600: the top is 540 and the last two are cut. */
const CUT_VALUES = [...Array.from({ length: 18 }, (_, i) => 100 + 10 * i), 3000, 3600];
const cutLane = (): LaneModel => {
  const lane = buildLane(at(CUT_VALUES.map((_, i) => i), CUT_VALUES), named);
  if (!lane) throw new Error("fixture lane is empty");
  return lane;
};

/** 1 percent of the window per hour. */
const hundred = (): TimelineProjector => makeProjector(T0, T0 + 100 * HOUR);

const formatTime = (ms: number): string => `t${(ms - T0) / HOUR}h`;

interface Opts {
  lane?: LaneModel;
  project?: TimelineProjector;
  collapsed?: boolean;
  onToggle?: (kind: string) => void;
  onPlotMouseDown?: LanesSlot["onPlotMouseDown"];
  /** The optional props of item B5. Left out, the lane is today's. */
  inset?: number;
  whose?: string;
  head?: { grids: readonly BucketGrid[] };
  below?: ReactNode;
  foldedView?: ReactNode;
}

const props = (o: Opts = {}) => {
  const slot: LanesSlot = {
    project: o.project ?? hundred(),
    onPlotMouseDown: o.onPlotMouseDown ?? vi.fn(),
  };
  return {
    lane: o.lane ?? gapLane(named),
    slot,
    collapsed: o.collapsed ?? false,
    onToggle: o.onToggle ?? vi.fn(),
    formatTime,
    ...(o.inset !== undefined ? { inset: o.inset } : {}),
    ...(o.whose !== undefined ? { whose: o.whose } : {}),
    ...(o.head !== undefined ? { head: o.head } : {}),
    ...(o.below !== undefined ? { below: o.below } : {}),
    ...(o.foldedView !== undefined ? { foldedView: o.foldedView } : {}),
  };
};

const mount = (o: Opts = {}) => {
  const view = render(<MagnitudeLane {...props(o)} />);
  const q = <E extends Element = HTMLElement>(sel: string): E => {
    const el = view.container.querySelector<E>(sel);
    if (!el) throw new Error(`no element for ${sel}`);
    return el;
  };
  return { ...view, q, qa: (sel: string) => Array.from(view.container.querySelectorAll<HTMLElement>(sel)) };
};

const setPlayhead = (ms: number): void => {
  act(() => {
    usePlayhead.setState({ playhead: ms });
  });
};

const pxOf = (value: string): number => parseFloat(value);

beforeEach(() => {
  usePlayhead.setState({ playhead: T0 });
});

// ---- The header ----------------------------------------------------------------------------------

/** The text of a node with its aria-hidden parts taken out and white space collapsed. */
const spokenText = (el: Element): string => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll("[aria-hidden='true']").forEach((n) => n.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
};

describe("MagnitudeLane header", () => {
  it("shows the node label, quantity label, unit, step and scale text on an open button", () => {
    const lane = gapLane(named);
    const { q } = mount({ lane });
    const button = q<HTMLButtonElement>("button");
    expect(q("[data-magnitude-node]").textContent).toBe("Parcel");
    expect(q("[data-magnitude-label]").textContent).toBe("Weight");
    expect(q("[data-magnitude-unit]").textContent).toBe("kg");
    expect(q("[data-magnitude-step]").textContent).toBe(formatStep(HOUR));
    expect(q("[data-magnitude-scale]").textContent).toBe(laneScaleText(lane));
    // The scale caption takes --caption-on-glass, not text-muted.
    expect(q("[data-magnitude-scale]").className).toContain("text-[color:var(--caption-on-glass)]");
    expect(q("[data-magnitude-scale]").className).not.toContain("text-muted");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(q("[data-magnitude-plot]").id);
    expect(button.getAttribute("aria-controls")).not.toBe("");
    expect(button.hasAttribute("aria-label")).toBe(false);
    expect(button.hasAttribute("title")).toBe(false);
    expect(spokenText(button)).toBe("Parcel Weight kg 1H");
    // The header writes its text in capitals; the app's reset sets a button's text-transform to
    // none, so the button carries the class itself (seen in the built page, 2026-11-14).
    expect(button.className.split(/\s+/)).toContain("uppercase");
  });

  it("is a group named by the lane and tagged with its kind", () => {
    const lane = gapLane(named);
    const { q } = mount({ lane });
    const root = q("[data-magnitude-lane]");
    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-label")).toBe(laneName(lane));
    expect(root.getAttribute("data-magnitude-lane")).toBe("parcel");
    expect(root.style.marginTop).toBe("4px");
    expect(q("[data-magnitude-header]")).toBeTruthy();
  });

  it("draws no label and no unit span for a lane with neither, and still draws the step", () => {
    const { q, container } = mount({ lane: gapLane(bare) });
    expect(container.querySelector("[data-magnitude-label]")).toBeNull();
    expect(container.querySelector("[data-magnitude-unit]")).toBeNull();
    expect(q("[data-magnitude-step]").textContent).toBe("1H");
    expect(spokenText(q("button"))).toBe("Parcel 1H");
  });

  it("separates the parts with a middle dot, and a slash before the step when a unit precedes it", () => {
    const { q } = mount({ lane: gapLane(named) });
    // The fold mark (a span and its picture) is aria-hidden too: it is left out of the separators.
    const sepsOf = (button: Element): (string | null)[] =>
      Array.from(button.querySelectorAll("[aria-hidden='true']"))
        .filter((n) => !n.closest("[data-fold-mark]"))
        .map((n) => n.textContent);
    // a dot before the quantity label, a dot before the unit and a slash before the step
    expect(sepsOf(q("button"))).toEqual(["·", "·", "/"]);
    const bare2 = mount({ lane: gapLane(bare) });
    expect(sepsOf(bare2.q("button"))).toEqual(["·"]);
  });
});

// ---- The readout ---------------------------------------------------------------------------------

describe("MagnitudeLane readout", () => {
  it("shows the grouped value of the bucket at the playhead and follows it", () => {
    setPlayhead(T0 + 2.5 * HOUR);
    const { q } = mount();
    const readout = q("[data-magnitude-readout]");
    expect(readout.textContent).toContain("1,200");
    expect(readout.getAttribute("data-magnitude-value")).toBe("1200");
    expect(readout.hasAttribute("data-empty")).toBe(false);
    setPlayhead(T0 + 7.5 * HOUR);
    expect(readout.textContent).toContain("1,700");
    expect(readout.getAttribute("data-magnitude-value")).toBe("1700");
  });

  it("shows a hyphen and a spoken 'no data at playhead' after the last bucket and in a gap, in the same spans", () => {
    setPlayhead(T0 + 2.5 * HOUR);
    const { q } = mount();
    const readout = q("[data-magnitude-readout]");
    const [visible, hidden] = Array.from(readout.children) as HTMLElement[];
    expect(readout.children).toHaveLength(2);
    expect(hidden.className).toContain("sr-only");
    expect(hidden.textContent).toBe("");
    expect(visible.hasAttribute("aria-hidden")).toBe(false);

    for (const gap of [T0 + 5.5 * HOUR, T0 + 20 * HOUR]) {
      setPlayhead(gap);
      expect(Array.from(readout.children)).toEqual([visible, hidden]);
      expect(visible.textContent).toBe("-");
      expect(visible.getAttribute("aria-hidden")).toBe("true");
      expect(hidden.textContent).toBe("no data at playhead");
      expect(readout.hasAttribute("data-empty")).toBe(true);
      expect(readout.hasAttribute("data-magnitude-value")).toBe(false);
    }
    setPlayhead(T0 + 3.5 * HOUR);
    expect(visible.textContent).toBe("1,300");
    expect(hidden.textContent).toBe("");
  });

  it("shows two decimals when the lane's values are not whole (added after the Phase B check)", () => {
    const lane = buildLane(at([0, 1], [12.5, 7.25]), named);
    if (!lane) throw new Error("fixture lane is empty");
    setPlayhead(T0 + 0.5 * HOUR);
    const { q } = mount({ lane });
    const readout = q("[data-magnitude-readout]");
    expect(readout.textContent).toBe("12.50");
    expect(readout.getAttribute("data-magnitude-value")).toBe("12.50");
    setPlayhead(T0 + 1.5 * HOUR);
    expect(readout.textContent).toBe("7.25");
  });

  it("is plain text, not a live region", () => {
    const { q } = mount();
    expect(q("[data-magnitude-readout]").closest("[aria-live]")).toBeNull();
    expect(q("[data-magnitude-readout]").hasAttribute("aria-live")).toBe(false);
  });

  it("still reads with the playhead outside the window while the line and band are hidden", () => {
    // The window starts at hour 3.5; the playhead is inside the bucket of hour 1.
    const project = makeProjector(T0 + 3.5 * HOUR, T0 + 13.5 * HOUR);
    setPlayhead(T0 + 1.5 * HOUR);
    const { q } = mount({ project });
    expect(q("[data-magnitude-readout]").getAttribute("data-magnitude-value")).toBe("1100");
    expect(q("[data-lane-line]").style.visibility).toBe("hidden");
    expect(q("[data-lane-band]").style.visibility).toBe("hidden");
  });
});

// ---- The two marks -------------------------------------------------------------------------------

describe("MagnitudeLane playhead marks", () => {
  it("puts the line at the playhead's percent and the band over the bucket", () => {
    const lane = gapLane(named);
    const project = hundred();
    setPlayhead(T0 + 2.5 * HOUR);
    const { q } = mount({ lane, project });
    const line = q("[data-lane-line]");
    const band = q("[data-lane-band]");
    expect(line.style.visibility).toBe("visible");
    expect(band.style.visibility).toBe("visible");
    expect(parseFloat(line.style.left)).toBeCloseTo(2.5, 6);
    expect(line.style.width).toBe("1px");
    expect(line.style.pointerEvents).toBe("none");
    expect(parseFloat(band.style.left)).toBeCloseTo(2, 6);
    expect(parseFloat(band.style.width)).toBeCloseTo(1, 6);
    expect(band.style.minWidth).toBe("2px");
    expect(band.style.pointerEvents).toBe("none");
  });

  it("hides the band in no bucket but keeps the line, and hides both outside the window", () => {
    const { q } = mount();
    setPlayhead(T0 + 5.5 * HOUR);
    expect(q("[data-lane-line]").style.visibility).toBe("visible");
    expect(q("[data-lane-band]").style.visibility).toBe("hidden");
    setPlayhead(T0 + 101 * HOUR);
    expect(q("[data-lane-line]").style.visibility).toBe("hidden");
    expect(q("[data-lane-band]").style.visibility).toBe("hidden");
    setPlayhead(T0 - HOUR);
    expect(q("[data-lane-line]").style.visibility).toBe("hidden");
  });

  it("shows the line with the playhead exactly at either edge of the window (added after the Phase B check)", () => {
    const { q } = mount();
    setPlayhead(T0);
    expect(q("[data-lane-line]").style.visibility).toBe("visible");
    expect(q("[data-lane-band]").style.visibility).toBe("visible");
    setPlayhead(T0 + 100 * HOUR);
    expect(q("[data-lane-line]").style.visibility).toBe("visible");
    expect(q("[data-lane-band]").style.visibility).toBe("hidden");
    // At the end the line stays on the plot's last pixel; at 100% it would be clipped (review, 2026-11-14).
    expect(q("[data-lane-line]").style.left).toBe("calc(100% - 1px)");
  });

  it("draws a bar exactly at the top whole, with no cut (added after the review)", () => {
    // Eighteen values 100 to 270 and nothing above: the top is the largest value, 270.
    const values = Array.from({ length: 18 }, (_, i) => 100 + 10 * i);
    const lane = buildLane(at(values.map((_, i) => i), values), named);
    if (!lane) throw new Error("fixture lane is empty");
    const { qa } = mount({ lane, project: makeProjector(T0, T0 + 20 * HOUR) });
    expect(qa("[data-cut]")).toHaveLength(0);
    const last = qa("[data-bucket]").at(-1);
    expect(last?.querySelectorAll("[data-bar-piece]")).toHaveLength(1);
  });

  it("gives the plot the track's pointer and no text selection (added after the review)", () => {
    const { q } = mount();
    const classes = q("[data-magnitude-plot]").className.split(/\s+/);
    expect(classes).toContain("cursor-pointer");
    expect(classes).toContain("select-none");
  });

  it("keeps both marks in the document in every state", () => {
    const { container } = mount();
    for (const ms of [T0 - HOUR, T0 + 2.5 * HOUR, T0 + 5.5 * HOUR, T0 + 200 * HOUR]) {
      setPlayhead(ms);
      expect(container.querySelectorAll("[data-lane-line]")).toHaveLength(1);
      expect(container.querySelectorAll("[data-lane-band]")).toHaveLength(1);
    }
  });
});

// ---- The bars ------------------------------------------------------------------------------------

describe("MagnitudeLane bars", () => {
  it("renders one bucket per bar that reaches into the window", () => {
    const { qa } = mount();
    expect(qa("[data-bucket]")).toHaveLength(9);
  });

  it("leaves out a bucket wholly before the window and keeps one that straddles its left edge", () => {
    // 1 percent is 0.1 h here: the window starts at hour 3.5, inside the bucket of hour 3.
    const project = makeProjector(T0 + 3.5 * HOUR, T0 + 13.5 * HOUR);
    const { qa } = mount({ project });
    const buckets = qa("[data-bucket]");
    // hours 3, 4, 6, 7, 8, 9; hour 2 ends at -6.5 percent
    expect(buckets).toHaveLength(6);
    expect(parseFloat(buckets[0].style.left)).toBeCloseTo(-5, 6);
  });

  it("leaves out a bucket wholly after the window and keeps one that straddles its right edge", () => {
    const project = makeProjector(T0, T0 + 7.5 * HOUR);
    const { qa } = mount({ project });
    // hours 0 to 4, 6 and 7; hour 7 starts at 93 percent and runs past 100; hours 8 and 9 start after it
    expect(qa("[data-bucket]")).toHaveLength(7);
  });

  it("places a bucket by the projector and sizes it by the model", () => {
    const lane = gapLane(named);
    const project = hundred();
    const { qa } = mount({ lane, project });
    const second = qa("[data-bucket]")[1];
    expect(parseFloat(second.style.left)).toBeCloseTo(project.pct(T0 + HOUR), 6);
    expect(parseFloat(second.style.width)).toBeCloseTo(barWidthPct(lane, project), 6);
    expect(second.style.minWidth).toBe("1px");
    expect(second.style.position).toBe("absolute");
    expect(pxOf(second.style.height)).toBe(LANE_PLOT_PX);
  });

  it("draws a cut bucket as a 19 px body and a 3 px cap at 21 px, and an ordinary one as one piece", () => {
    const lane = cutLane();
    const { qa } = mount({ lane, project: makeProjector(T0, T0 + 40 * HOUR) });
    const buckets = qa("[data-bucket]");
    expect(buckets).toHaveLength(20);
    expect(qa("[data-bucket][data-cut]")).toHaveLength(2);
    const cut = qa("[data-bucket][data-cut]")[0];
    const pieces = Array.from(cut.querySelectorAll<HTMLElement>("[data-bar-piece]"));
    expect(pieces).toHaveLength(2);
    expect([pxOf(pieces[0].style.bottom), pxOf(pieces[0].style.height)]).toEqual([0, 19]);
    expect([pxOf(pieces[1].style.bottom), pxOf(pieces[1].style.height)]).toEqual([21, 3]);
    const plain = buckets[0].querySelectorAll<HTMLElement>("[data-bar-piece]");
    expect(buckets[0].hasAttribute("data-cut")).toBe(false);
    expect(plain).toHaveLength(1);
    expect(pxOf(plain[0].style.bottom)).toBe(0);
    expect(pxOf(plain[0].style.height)).toBe(lane.bars[0].height);
  });

  // happy-dom drops any colour written with var() (the edge, the line and the band), so those are
  // held by the source-text rows and the crawl; the fill is a literal colour and is read here.
  it("paints a piece with the node colour at 0.85 and a 1 px solid edge", () => {
    const { q } = mount();
    const piece = q("[data-bar-piece]");
    expect(piece.style.backgroundColor).toBe("rgb(51 102 204 / 0.85)");
    expect(piece.style.boxSizing).toBe("border-box");
    expect(piece.style.borderStyle).toBe("solid");
    // A piece that stands on the baseline has an edge on its top and sides, none under it
    // (happy-dom folds "1px 1px 0 1px" into "1px 1px 0px").
    expect(piece.style.borderWidth).toBe("1px 1px 0px");
  });

  it("gives the cap an edge on all four sides", () => {
    const lane = cutLane();
    const { qa } = mount({ lane, project: makeProjector(T0, T0 + 40 * HOUR) });
    const cap = qa("[data-bucket][data-cut]")[0].querySelectorAll<HTMLElement>("[data-bar-piece]")[1];
    expect(cap.style.borderWidth).toBe("1px");
  });

  it("keeps the model's piece heights when the projector's window changes", () => {
    const lane = gapLane(named);
    const heights = (el: HTMLElement): string[] =>
      Array.from(el.querySelectorAll<HTMLElement>("[data-bar-piece]")).map((p) => p.style.height);
    const view = mount({ lane, project: hundred() });
    const before = heights(view.container);
    view.rerender(<MagnitudeLane {...props({ lane, project: makeProjector(T0, T0 + 12 * HOUR) })} />);
    expect(heights(view.container)).toEqual(before);
    expect(before).toEqual(lane.bars.map((b) => `${b.height}px`));
  });
});

// ---- The plot ------------------------------------------------------------------------------------

describe("MagnitudeLane plot", () => {
  it("is an image with one label and a fixed, clipping, content-box style", () => {
    const lane = gapLane(named);
    const { q } = mount({ lane });
    const plot = q("[data-magnitude-plot]");
    expect(plot.getAttribute("role")).toBe("img");
    expect(plot.getAttribute("aria-label")).toBe(lanePlotLabel(lane, formatTime));
    expect(plot.style.height).toBe("24px");
    expect(plot.style.boxSizing).toBe("content-box");
    expect(plot.style.overflow).toBe("hidden");
    expect(plot.style.position).toBe("relative");
    expect(plot.style.margin).toBe("");
    expect(plot.style.marginTop).toBe("");
    expect(plot.style.marginBottom).toBe("");
    // The baseline is the plot's own 1 px bottom border, from classes (the file holds no colour variable).
    expect(plot.className).toContain("border-b");
    expect(plot.className).toContain("border-panel-border");
    expect(plot.hasAttribute("hidden")).toBe(false);
    // No class that sets a margin or a display, so the stack's 53 px and 28 px hold and `hidden` works.
    expect(plot.className.split(/\s+/).filter((c) => /^(m[trblxy]?-|-m|block|flex|grid|inline|contents)/.test(c))).toEqual([]);
  });

  it("calls the slot's mouse-down handler for the plot and not for the header", () => {
    const onPlotMouseDown = vi.fn();
    const { q } = mount({ onPlotMouseDown });
    fireEvent.mouseDown(q("[data-magnitude-header]"));
    fireEvent.mouseDown(q("button"));
    expect(onPlotMouseDown).not.toHaveBeenCalled();
    fireEvent.mouseDown(q("[data-magnitude-plot]"));
    expect(onPlotMouseDown).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(q("[data-bucket]"));
    expect(onPlotMouseDown).toHaveBeenCalledTimes(2);
  });
});

// ---- Folding -------------------------------------------------------------------------------------

describe("MagnitudeLane folding", () => {
  it("calls onToggle with the kind on a click", () => {
    const onToggle = vi.fn();
    const { q } = mount({ onToggle });
    fireEvent.click(q("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("parcel");
  });

  // The pin of a folded lane that hides the plot, kept for the no-slot case. A `foldedView` is the
  // slot contract below ("MagnitudeLane slots"): the open plot stays hidden while the button says
  // it is not expanded, and the small version is a separate element.
  it("when folded and with no slot, hides the plot, keeps the header and readout, and keeps the same button", () => {
    const lane = gapLane(named);
    const view = mount({ lane, collapsed: false });
    const button = view.q("button");
    const plot = view.q("[data-magnitude-plot]");
    const readout = view.q("[data-magnitude-readout]");
    view.rerender(<MagnitudeLane {...props({ lane, collapsed: true })} />);
    expect(view.q("button")).toBe(button);
    expect(view.q("[data-magnitude-plot]")).toBe(plot);
    expect(view.q("[data-magnitude-readout]")).toBe(readout);
    expect(plot.hasAttribute("hidden")).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(plot.id);
    expect(view.container.querySelector("[data-magnitude-scale]")).toBeNull();
    expect(view.q("[data-magnitude-header]")).toBeTruthy();
    expect(spokenText(button)).toBe("Parcel Weight kg 1H");
  });

  it("draws the one fold mark, open then closed, and prints no triangle character as text", () => {
    const lane = gapLane(named);
    const view = mount({ lane, collapsed: false });
    const button = view.q("button");
    const mark = (): string | null => button.querySelector("[data-fold-mark]")?.getAttribute("data-fold-mark") ?? null;
    const visible = (): string => {
      const copy = button.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("[data-fold-mark]").forEach((n) => n.remove());
      return copy.textContent ?? "";
    };
    expect(mark()).toBe("open");
    view.rerender(<MagnitudeLane {...props({ lane, collapsed: true })} />);
    expect(mark()).toBe("closed");
    for (const t of [String.fromCodePoint(0x25b8), String.fromCodePoint(0x25be)]) expect(visible()).not.toContain(t);
  });

  it("is a button of type button with no key handler of its own", () => {
    const onToggle = vi.fn();
    const { q } = mount({ onToggle });
    const button = q<HTMLButtonElement>("button");
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");
    // The browser's own click does the work for Enter and Space; a bare keydown does nothing here.
    expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
    expect(onToggle).not.toHaveBeenCalled();
    // Escape is not handled: the event is not default-prevented.
    expect(fireEvent.keyDown(button, { key: "Escape" })).toBe(true);
    expect(fireEvent.keyDown(q("[data-magnitude-lane]"), { key: "Escape" })).toBe(true);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

// ---- Item B5: the lane's id, its words, the inset, whose, the head's pieces and the slots --------

const GRIDS: BucketGrid[] = [{ step: HOUR, firstBucketStart: T0 }];
const tipNameOf = (lane: LaneModel): string => (lane.label ? `${lane.nodeLabel} · ${lane.label}` : lane.nodeLabel);
const tipOf = (el: Element): string => el.getAttribute("data-tip") ?? "";

describe("MagnitudeLane identity and words", () => {
  it("writes data-magnitude-lane from the lane's id and not from its kind", () => {
    const lane = { ...gapLane(named), id: "weekly" };
    const { q } = mount({ lane });
    expect(lane.kind).toBe("parcel");
    expect(q("[data-magnitude-lane]").getAttribute("data-magnitude-lane")).toBe("weekly");
  });

  it("says what the fold button is, from the words file, and the instruction follows the state", () => {
    const lane = gapLane(named);
    const open = mount({ lane });
    expect(tipOf(open.q("button"))).toBe(laneFoldWords(tipNameOf(lane), "kg", formatStep(HOUR), undefined, true).join("\n"));
    const folded = mount({ lane, collapsed: true });
    expect(tipOf(folded.q("button"))).toBe(laneFoldWords(tipNameOf(lane), "kg", formatStep(HOUR), undefined, false).join("\n"));
    // The accessible name is still its text: the words are a description, not a label or a title.
    expect(open.q("button").hasAttribute("aria-label")).toBe(false);
    expect(open.q("button").hasAttribute("title")).toBe(false);
  });

  it("says the scale on the scale text, with the bars over the top when there are some", () => {
    const lane = cutLane();
    const { q } = mount({ lane });
    expect(lane.scale.above).toBe(2);
    expect(tipOf(q("[data-magnitude-scale]"))).toBe(laneScaleWords(amount(lane.scale.top, "kg"), 2, amount(lane.scale.max, "kg")).join("\n"));
  });

  it("gives each bar the lane's name, the row, the hour and the amount, and says a cut bar is cut", () => {
    const lane = cutLane();
    const { qa } = mount({ lane });
    const buckets = qa("[data-bucket]");
    const first = buckets[0];
    expect(tipOf(first)).toBe(laneBarWords(tipNameOf(lane), undefined, span(T0, HOUR), amount(100, "kg"), null).join("\n"));
    const last = buckets[buckets.length - 1];
    expect(last.hasAttribute("data-cut")).toBe(true);
    expect(tipOf(last)).toBe(laneBarWords(tipNameOf(lane), undefined, span(T0 + 19 * HOUR, HOUR), amount(3600, "kg"), amount(lane.scale.top, "kg")).join("\n"));
  });
});

describe("MagnitudeLane inset", () => {
  it("moves only the plot", () => {
    const base = mount();
    const moved = mount({ inset: 148 });
    expect(moved.q("[data-magnitude-plot]").style.marginLeft).toBe("148px");
    expect(base.q("[data-magnitude-plot]").style.marginLeft).toBe("");
    // The group and the header keep the panel's left edge.
    for (const sel of ["[data-magnitude-lane]", "[data-magnitude-header]"]) {
      expect(moved.q(sel).style.marginLeft).toBe("");
      expect(moved.q(sel).style.paddingLeft).toBe("");
    }
    expect(moved.q("[data-magnitude-lane]").style.marginTop).toBe("4px");
    // The bars stand at the same percents: the inset is the plot's own offset.
    const lefts = (v: { qa: (s: string) => HTMLElement[] }) => v.qa("[data-bucket]").map((b) => b.style.left);
    expect(lefts(moved)).toEqual(lefts(base));
  });

  it("writes no margin for a zero inset", () => {
    expect(mount({ inset: 0 }).q("[data-magnitude-plot]").style.marginLeft).toBe("");
  });
});

describe("MagnitudeLane whose", () => {
  it("names the soloed row in the header, in the group's name and in the fold button's words", () => {
    const lane = gapLane(named);
    const { q } = mount({ lane, whose: "Acme Co" });
    const who = q("[data-magnitude-whose]");
    expect(who.textContent).toBe("Acme Co");
    expect(q("[data-magnitude-header]").contains(who)).toBe(true);
    expect(q("button").contains(who)).toBe(true);
    expect(spokenText(q("button"))).toBe("Parcel Weight kg 1H Acme Co");
    expect(q("[data-magnitude-lane]").getAttribute("aria-label")).toBe(`${laneName(lane)}, Acme Co alone`);
    expect(tipOf(q("button"))).toBe(laneFoldWords(tipNameOf(lane), "kg", formatStep(HOUR), "Acme Co", true).join("\n"));
    expect(tipOf(q("button"))).not.toMatch(/all rows/i);
    // A long name is cut by the box and not by the header's other parts.
    expect(who.className).toContain("truncate");
  });

  it("names the row on each bar's words", () => {
    const lane = gapLane(named);
    const { qa } = mount({ lane, whose: "Acme Co" });
    expect(tipOf(qa("[data-bucket]")[0]).split("\n")[1]).toBe("Acme Co");
  });

  // INT-1b (a): a lane with no bars (the one row has no value for it) keeps its header and says whose.
  it("a lane with no bars draws its header, the row's name, the scale and a plot with no bucket", () => {
    const lane = emptyLaneLike(gapLane(named));
    const { q, qa } = mount({ lane, whose: "Acme Co", head: { grids: [] } });
    expect(q("[data-magnitude-lane]").hasAttribute("data-lane-empty")).toBe(true);
    expect(q("[data-magnitude-whose]").textContent).toBe("Acme Co");
    expect(q("[data-magnitude-scale]").textContent).toBe(laneScaleText(lane));
    expect(q("[data-magnitude-plot]").getAttribute("aria-label")).toBe(lanePlotLabel(lane, formatTime));
    expect(qa("[data-bucket]")).toHaveLength(0);
    // A tick of the playhead over an empty lane draws no number at the line.
    setPlayhead(T0 + HOUR);
    expect(qa("[data-lane-figure-value]")).toHaveLength(0);
  });

  it("a lane with bars is not marked empty", () => {
    expect(mount({ lane: gapLane(named) }).q("[data-magnitude-lane]").hasAttribute("data-lane-empty")).toBe(false);
  });

  it("draws no row name and keeps the group's name when no row is soloed", () => {
    const lane = gapLane(named);
    const { q, container } = mount({ lane });
    expect(container.querySelector("[data-magnitude-whose]")).toBeNull();
    expect(q("[data-magnitude-lane]").getAttribute("aria-label")).toBe(laneName(lane));
    expect(spokenText(q("button"))).toBe("Parcel Weight kg 1H");
  });
});

describe("MagnitudeLane head pieces", () => {
  it("draws the head's line and the lane's number in the plot, and no readout, line or band of its own", () => {
    setPlayhead(T0 + 2.5 * HOUR);
    const lane = gapLane(named);
    const { q, container } = mount({ lane, head: { grids: GRIDS } });
    const plot = q("[data-magnitude-plot]");
    expect(plot.querySelector("[data-head-sled]")).not.toBeNull();
    const figure = plot.querySelector("[data-lane-figure]");
    expect(figure?.getAttribute("data-lane-figure")).toBe("parcel");
    expect(figure?.getAttribute("data-lane-figure-value")).toBe("1200");
    expect(container.querySelector("[data-magnitude-readout]")).toBeNull();
    expect(container.querySelector("[data-lane-line]")).toBeNull();
    expect(container.querySelector("[data-lane-band]")).toBeNull();
    // The header keeps its button and its scale text.
    expect(spokenText(q("button"))).toBe("Parcel Weight kg 1H");
    expect(q("[data-magnitude-scale]").textContent).toBe(laneScaleText(lane));
  });

  it("passes the lane's id to the number", () => {
    setPlayhead(T0 + 2.5 * HOUR);
    const { q } = mount({ lane: { ...gapLane(named), id: "weekly" }, head: { grids: GRIDS } });
    expect(q("[data-lane-figure]").getAttribute("data-lane-figure")).toBe("weekly");
  });

  it("draws today's header and plot when no head is passed", () => {
    setPlayhead(T0 + 2.5 * HOUR);
    const { q, container } = mount();
    expect(q("[data-magnitude-header] [data-magnitude-readout]")).toBeTruthy();
    expect(q("[data-lane-line]")).toBeTruthy();
    expect(q("[data-lane-band]")).toBeTruthy();
    expect(container.querySelector("[data-head-sled]")).toBeNull();
    expect(container.querySelector("[data-lane-figure]")).toBeNull();
  });
});

describe("MagnitudeLane slots", () => {
  it("renders `below` after the plot, inside the group, while the lane is open", () => {
    const { q } = mount({ below: <div data-testid="below">lines</div> });
    const below = q("[data-testid='below']");
    const plot = q("[data-magnitude-plot]");
    expect(below.parentElement).toBe(q("[data-magnitude-lane]"));
    expect(plot.compareDocumentPosition(below) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not render `below` while the lane is folded", () => {
    const { container } = mount({ collapsed: true, below: <div data-testid="below">lines</div> });
    expect(container.querySelector("[data-testid='below']")).toBeNull();
  });

  // The slot contract that replaces the pin "a folded lane hides the plot" for a lane with a
  // `foldedView`: the open plot stays hidden while aria-expanded is false, and the small version
  // is a separate element that aria-controls does not name.
  it("renders `foldedView` as a separate element while folded, with the open plot still hidden", () => {
    const lane = gapLane(named);
    const { q, container } = mount({ lane, collapsed: true, foldedView: <div data-testid="small">small</div> });
    const button = q("button");
    const plot = q("[data-magnitude-plot]");
    const small = q("[data-testid='small']");
    expect(plot.hasAttribute("hidden")).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(plot.id);
    expect(plot.contains(small)).toBe(false);
    const holder = small.closest("[data-lane-folded-view]");
    expect(holder).not.toBeNull();
    expect(holder?.id ?? "").not.toBe(plot.id);
    expect(holder?.hasAttribute("id")).toBe(false);
    expect(button.getAttribute("aria-controls")).not.toBe(holder?.id);
    expect(holder?.hasAttribute("data-magnitude-plot")).toBe(false);
    expect(container.querySelectorAll("[data-magnitude-plot]")).toHaveLength(1);
  });

  it("removes the `foldedView` when the lane opens, and keeps the same button and plot", () => {
    const lane = gapLane(named);
    const view = mount({ lane, collapsed: true, foldedView: <div data-testid="small">small</div> });
    const button = view.q("button");
    const plot = view.q("[data-magnitude-plot]");
    view.rerender(<MagnitudeLane {...props({ lane, collapsed: false, foldedView: <div data-testid="small">small</div> })} />);
    expect(view.container.querySelector("[data-testid='small']")).toBeNull();
    expect(view.q("button")).toBe(button);
    expect(view.q("[data-magnitude-plot]")).toBe(plot);
    expect(plot.hasAttribute("hidden")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("with no slot passed and the lane folded, keeps the header's readout as today", () => {
    const { q, container } = mount({ collapsed: true });
    expect(q("[data-magnitude-header] [data-magnitude-readout]")).toBeTruthy();
    expect(container.querySelector("[data-lane-folded-view]")).toBeNull();
  });
});

// ---- Contrast ------------------------------------------------------------------------------------

type Rgb = [number, number, number];

/** The material of each theme at its plain glass fill (rainbow keeps the base fill, tokens.ts lines
 *  175 and 213) and at its firmed-up one (neon takes the override, lines 238 and 244). */
const FILLS = {
  dark: { plain: PALETTES.dark.rainbow, firm: PALETTES.dark.neon },
  light: { plain: PALETTES.light.rainbow, firm: PALETTES.light.neon },
} as const;

const triplet = (t: string): Rgb => {
  const [r, g, b] = t.split(/\s+/).map((n) => parseInt(n, 10) / 255);
  return [r, g, b];
};

/** The glass panel's one flat fill (src/index.css, `.glass`: rgb(var(--glass-tint) / var(--glass-fill)))
 *  over a backdrop. */
const flatFill = (m: { glassTint: string; glassFill: number }, backdrop: Rgb): Rgb =>
  compositeOver(triplet(m.glassTint), m.glassFill, backdrop);

const BACKDROPS: Record<"dark" | "light", Rgb[]> = {
  dark: [
    [0, 0, 0],
    [128 / 255, 128 / 255, 128 / 255],
  ],
  light: [
    [0, 0, 0],
    [128 / 255, 128 / 255, 128 / 255],
    [1, 1, 1],
  ],
};

describe("MagnitudeLane contrast", () => {
  it("reads the plain and the firmed-up fill of each theme from the tokens", () => {
    expect(FILLS.dark.plain.material.glassFill).toBe(0.52);
    expect(FILLS.dark.firm.material.glassFill).toBe(0.74);
    expect(FILLS.light.plain.material.glassFill).toBe(0.85);
    expect(FILLS.light.firm.material.glassFill).toBe(0.88);
  });

  for (const theme of ["dark", "light"] as const) {
    it(`keeps the edge at 4.5 and the line at 3 over the flat glass fill in the ${theme} theme`, () => {
      let edgeMin = Infinity;
      let lineMin = Infinity;
      for (const fill of ["plain", "firm"] as const) {
        const cell = FILLS[theme][fill];
        const edge = hexToRgb01(cell.neutral.textMuted);
        const line = hexToRgb01(cell.neutral.text);
        for (const backdrop of BACKDROPS[theme]) {
          const flat = flatFill(cell.material, backdrop);
          edgeMin = Math.min(edgeMin, contrastRatio(edge, flat));
          lineMin = Math.min(lineMin, contrastRatio(line, flat));
        }
      }
      expect(edgeMin).toBeGreaterThanOrEqual(4.5);
      expect(lineMin).toBeGreaterThanOrEqual(3);
      // This test's own tighter figures, from the flat fill (measured 2026-11-15, rounded down): the
      // edge, and the line against the same panel. Dark measured 4.8006 and 7.3110, light 5.2333 and
      // 11.3704 (the old three-stop gradient measured 4.6147, 7.0278 and 5.2333, 11.3704).
      expect(edgeMin).toBeGreaterThanOrEqual(theme === "light" ? 5.2 : 4.8);
      expect(lineMin).toBeGreaterThanOrEqual(theme === "light" ? 11.3 : 7.3);
    });
  }
});

// ---- The source ----------------------------------------------------------------------------------

describe("MagnitudeLane source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, "MagnitudeLane.tsx"), "utf8");

  it("paints through the two named constants and holds no literal colour variable", () => {
    expect(source).toContain("LANE_EDGE_VAR");
    expect(source).toContain("LANE_LINE_VAR");
    // The one literal variable is the scale caption's token:
    // its class is taken out before the check, and it must appear exactly once.
    const caption = "text-[color:var(--caption-on-glass)]";
    expect(source.split(caption).length - 1).toBe(1);
    expect(source.replace(caption, "")).not.toContain("var(--");
  });

  it("reads no clock of its own and animates nothing", () => {
    expect(source).not.toContain("Date.now");
    expect(source).not.toMatch(/transition|animate|animation/i);
  });

  it("names no pack", () => {
    for (const word of ["usage", "spend", "usd"]) expect(source.toLowerCase()).not.toContain(word);
  });

  it("holds the two variable names the design gives", () => {
    expect(LANE_EDGE_VAR).toBe("--text-muted-rgb");
    expect(LANE_LINE_VAR).toBe("--text-rgb");
  });

  it("formats the readout through the model's formatter", () => {
    expect(formatLaneNumber(4133.565, 2)).toBe("4,133.57");
  });
});
