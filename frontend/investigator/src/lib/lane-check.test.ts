/**
 * The crawl's lane check is a pure judgment (scripts/lane-check.mjs). Each case here changes one
 * fact of a correct page and expects the one rule that fact breaks; a last case fails when a rule
 * has no such row. The crawl gathers the facts in a browser.
 *
 * Rules: the order is track, rows, lane, date labels; the plot stands
 * inside the name gutter and lines up with the rows' plot; the lanes are the node lanes and then
 * the manifest's root lanes, by id; the number is the figure at the line; two page rules are new
 * (the open bar covers nothing, every aria-controls names an element).
 *
 * GATE-2: the folded lane's small version (the open plot is gone and a plot of its own stands in
 * its place), the rows' small version, a line for each section, the lane's depth and the Timeline's
 * kind lines, each judged on its own fixture; the label gap of every small version; and the
 * printout of the bar's heights with each depth open.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crawlSource from "../../scripts/static-crawl.mjs?raw";
import readSource from "../../scripts/bar-read.mjs?raw";
import checkSource from "../../scripts/lane-check.mjs?raw";
import declSource from "../../scripts/lane-check.d.mts?raw";
import laneSmallSource from "../components/timeline/LaneSmall.tsx?raw";
import rowsSmallSource from "../components/timeline/rows/RowsSmall.tsx?raw";
import laneLinesSource from "../components/timeline/LaneLines.tsx?raw";
import kindLinesSource from "../components/timeline/KindLines.tsx?raw";
import shellSource from "../components/timeline/TimelineShell.tsx?raw";
import caseStripSource from "../components/timeline/CaseStrip.tsx?raw";
import magnitudeSource from "../components/timeline/MagnitudeLane.tsx?raw";
import barFoldSource from "../components/timeline/head/BarFold.tsx?raw";
import { codeOf, holdsToken } from "./code-text";
import { OPEN_BAR_SHARE } from "./bar-metrics";
import { SMALL_LABEL_GAP_PX } from "./bar-metrics-small";
import {
  BAR_SIZES,
  LABEL_GAP_PX,
  LANE_RULES,
  ONE_LINE_PX,
  SHARE,
  WAITING_LEGS,
  barHeights,
  bucketsOf,
  declaredLanes,
  expectedBar,
  expectedLanes,
  expectedReadout,
  findPlace,
  kindsToFetch,
  laneNodes,
  laneProblems,
  laneVerdict,
  passNote,
  stepOf,
  summaryLine,
  waitLine,
  type BarFact,
  type DepthFact,
  type ExpectedBar,
  type ExpectedLane,
  type LaneFacts,
  type LaneNode,
  type LaneRow,
  type PageFacts,
  type SectionFacts,
} from "../../scripts/lane-check.mjs";

const HOUR = 3_600_000;
const MIN = 60_000;
const T0 = Date.parse("2026-01-01T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const node: LaneNode = {
  kind: "k1",
  source: "sql",
  label: "Node",
  timestamp: "ts",
  magnitude: "amt",
  magnitudeLabel: "Qty",
  magnitudeUnit: "U",
};
// A bucket of three rows, a gap, one more bucket; two rows no bucket may hold.
const rows: LaneRow[] = [
  { ts: iso(T0), amt: 1 },
  { ts: iso(T0), amt: 2 },
  { ts: iso(T0), amt: 0.5 },
  { ts: iso(T0 + HOUR), amt: 10 },
  { ts: iso(T0 + 3 * HOUR), amt: 4 },
  { ts: "not a time", amt: 99 },
  { ts: iso(T0 + 5 * HOUR), amt: 0 },
];

const peakAt = T0 + HOUR + HOUR / 2;
const endAt = T0 + 10 * HOUR;

const goodFacts = (): LaneFacts => ({
  id: "k1",
  nodeLabel: "Node",
  label: "Qty",
  unit: "U",
  atPeak: { at: peakAt, empty: false, value: 10 },
  atEnd: { at: endAt, empty: true, value: null },
  plot: { left: 172, width: 1244 },
  track: { left: 172, width: 1244 },
  rowsPlot: null,
  barsOutside: 0,
  order: "track,lane,axis",
  tabIndex: 0,
  focused: true,
  // A pack with no name column folds as today: the open plot is hidden and no small version is drawn.
  fold: { expanded: false, plotHidden: true, small: false, laneDrop: 25, stackDrop: 25 },
  small: { drawn: false, plot: null, gap: null, readout: null },
  afterReload: { expanded: false },
  unfold: { expanded: true, plotHidden: false },
});

/** The folded lane of a pack with a name column: the open plot is gone and the small version stands. */
const withSmall = (f: LaneFacts): void => {
  f.fold = { expanded: false, plotHidden: true, small: true, laneDrop: 24, stackDrop: 24 };
  f.small = { drawn: true, plot: { left: 172, width: 1244 }, gap: 20, readout: { at: endAt, empty: true, value: null } };
};

const goodBar = (size: string): BarFact => ({
  size,
  bar: { left: 12, top: 640, right: 1428, bottom: 708 },
  inspector: { left: 1100, top: 12, right: 1428, bottom: 600 },
  logs: [{ left: 12, top: 80, right: 300, bottom: 560 }],
  marker: { x: 700, y: 300 },
  placed: true,
  credit: { left: 1280, top: 612, right: 1428, bottom: 628 },
});

const goodPage = (lanes: LaneFacts[], ids: string[] = lanes.map((l) => l.id)): PageFacts => ({
  ids,
  lanes,
  bars: BAR_SIZES.map(goodBar),
  controls: { total: 3, missing: [] },
  sections: null,
  depths: null,
});

const expectedOf = (n: LaneNode = node, named = false): ExpectedLane[] => expectedLanes([n], { k1: rows }, [], named);

// ---- GATE-2: what a correct page gives for each small version and each depth ------------------
const barNodes: LaneNode[] = [node, { kind: "ka", source: "sql", label: "A", timestamp: "ts" }, { kind: "kb", source: "sql", label: "B", timestamp: "ts" }];
const barDeclared = [{ id: "k1", depth: { split: "asn" } }];
const barFields = { asn: { label: "ASN" } };
const barOf = (): ExpectedBar => expectedBar(expectedOf(node, true), barNodes, barDeclared, barFields, true);
const sameBar = { left: 216, width: 1200 };

const namedLane = (): LaneFacts => {
  const f = goodFacts();
  f.order = "track,rows,lane,axis";
  f.rowsPlot = { left: 172, width: 1244 };
  withSmall(f);
  return f;
};
const goodSections = (b: ExpectedBar): SectionFacts => ({
  rows: b.rows
    ? { drawn: true, after: true, expanded: false, plot: { left: 172, width: 1244 }, track: { left: 172, width: 1244 }, gap: 20, figure: true }
    : null,
  stack: b.stack
    ? {
        drawn: true,
        rows: b.rows ? 1 : 0,
        lanes: [...b.lanes],
        plots: [...(b.rows ? [sameBar] : []), ...b.lanes.map(() => sameBar)],
        strip: sameBar,
        gaps: [20, 20],
        oneLine: { stackGone: true, smalls: 0, panel: ONE_LINE_PX, stackPanel: 130 },
      }
    : null,
});
const depthFact = (option: string, size: string, over: Partial<DepthFact> = {}): DepthFact => ({
  ...goodBar(size),
  option,
  opened: true,
  lines: 3,
  aligned: true,
  outside: 0,
  panel: 300,
  stack: 330,
  ...over,
});
const withBoth = (b: ExpectedBar): string[] => (b.depths.length > 1 ? [...b.depths, "all"] : b.depths);
const goodDepths = (b: ExpectedBar): DepthFact[] => withBoth(b).flatMap((o) => BAR_SIZES.map((s) => depthFact(o, s)));
const sectionPage = (b: ExpectedBar = barOf()): PageFacts => ({
  ...goodPage([namedLane()]),
  sections: goodSections(b),
  depths: goodDepths(b),
});
const depthOf = (p: PageFacts, option: string, size: string): DepthFact => p.depths!.find((d) => d.option === option && d.size === size)!;
const stackOf = (p: PageFacts) => p.sections!.stack!;
const rowsSmallOf = (p: PageFacts) => p.sections!.rows!;

interface SectionCase {
  name: string;
  rule: string;
  change: (page: PageFacts) => void;
  /** The expectation to judge by when it is not the usual one; a function, so it is built when the case runs. */
  bar?: () => ExpectedBar;
}
const sectionCases: SectionCase[] = [
  { name: "no rows' small version where the pack declares rows", rule: "rows-small", change: (p) => (p.sections!.rows = { ...rowsSmallOf(p), drawn: false }) },
  { name: "the rows' small version before the rows", rule: "rows-small", change: (p) => (p.sections!.rows = { ...rowsSmallOf(p), after: false }) },
  { name: "the rows' button reading expanded while the rows are folded", rule: "rows-small", change: (p) => (p.sections!.rows = { ...rowsSmallOf(p), expanded: true }) },
  { name: "the rows' small plot 2 px off the track", rule: "rows-small", change: (p) => (p.sections!.rows = { ...rowsSmallOf(p), plot: { left: 174, width: 1244 } }) },
  { name: "no number at the line in the rows' small version", rule: "rows-small", change: (p) => (p.sections!.rows = { ...rowsSmallOf(p), figure: false }) },
  { name: "the rows' small version not read", rule: "rows-small", change: (p) => (p.sections!.rows = null) },
  {
    name: "a rows' small version where the pack declares no rows",
    rule: "rows-small",
    bar: () => ({ ...barOf(), rows: false }),
    change: (p) => {
      p.sections!.rows = { drawn: true, after: true, expanded: false, plot: sameBar, track: sameBar, gap: 20, figure: true };
    },
  },
  { name: "no line for each section", rule: "line-for-each-section", change: (p) => (p.sections!.stack = { ...stackOf(p), drawn: false }) },
  { name: "the rows' line missing from the stack", rule: "line-for-each-section", change: (p) => (p.sections!.stack = { ...stackOf(p), rows: 0, plots: stackOf(p).plots!.slice(1) }) },
  { name: "the lane's line missing from the stack", rule: "line-for-each-section", change: (p) => (p.sections!.stack = { ...stackOf(p), lanes: [], plots: stackOf(p).plots!.slice(0, 1) }) },
  { name: "a section's plot 2 px off the Timeline's strip", rule: "line-for-each-section", change: (p) => (p.sections!.stack = { ...stackOf(p), plots: [sameBar, { left: 218, width: 1200 }] }) },
  { name: "the Timeline's strip not read", rule: "line-for-each-section", change: (p) => (p.sections!.stack = { ...stackOf(p), strip: null }) },
  { name: "the stack still drawn after one more fold", rule: "line-for-each-section", change: (p) => (p.sections!.stack = { ...stackOf(p), oneLine: { ...stackOf(p).oneLine!, stackGone: false } }) },
  { name: "a small version still drawn after one more fold", rule: "line-for-each-section", change: (p) => (p.sections!.stack = { ...stackOf(p), oneLine: { ...stackOf(p).oneLine!, smalls: 1 } }) },
  { name: "one line of 60 px", rule: "line-for-each-section", change: (p) => (p.sections!.stack = { ...stackOf(p), oneLine: { ...stackOf(p).oneLine!, panel: 60 } }) },
  { name: "one line no lower than the stack", rule: "line-for-each-section", change: (p) => (p.sections!.stack = { ...stackOf(p), oneLine: { ...stackOf(p).oneLine!, stackPanel: ONE_LINE_PX } }) },
  { name: "the stack not read", rule: "line-for-each-section", change: (p) => (p.sections!.stack = null) },
  { name: "the lane's depth that does not open", rule: "lane-depth", change: (p) => (depthOf(p, "lane:k1", "1440x900").opened = false) },
  { name: "the lane's depth with no line", rule: "lane-depth", change: (p) => (depthOf(p, "lane:k1", "1280x720").lines = 0) },
  { name: "the lane's depth with a plot off the track", rule: "lane-depth", change: (p) => (depthOf(p, "lane:k1", "1440x900").aligned = false) },
  { name: "a bar piece of a depth line outside its plot", rule: "lane-depth", change: (p) => (depthOf(p, "lane:k1", "1440x900").outside = 1) },
  { name: "the lane's depth lines not counted", rule: "lane-depth", change: (p) => (depthOf(p, "lane:k1", "1440x900").lines = null) },
  { name: "the kind lines that do not open", rule: "kinds-depth", change: (p) => (depthOf(p, "kinds", "1280x720").opened = false) },
  { name: "the kind lines with no line", rule: "kinds-depth", change: (p) => (depthOf(p, "kinds", "1440x900").lines = 0) },
  { name: "the kind lines with a plot off the track", rule: "kinds-depth", change: (p) => (depthOf(p, "kinds", "1440x900").aligned = false) },
  { name: "the bar over the Inspector with the lane's depth open", rule: "bar-covers-nothing", change: (p) => (depthOf(p, "lane:k1", "1280x720").bar = { left: 12, top: 400, right: 1428, bottom: 708 }) },
  { name: "the bar over the selected marker with the kind lines open", rule: "bar-covers-nothing", change: (p) => (depthOf(p, "kinds", "1440x900").marker = { x: 700, y: 650 }) },
  { name: "the bar over the map credit with both depths open", rule: "bar-covers-nothing", change: (p) => (depthOf(p, "all", "1440x900").credit = { left: 1280, top: 690, right: 1428, bottom: 706 }) },
  { name: "the Inspector not read with a depth open", rule: "bar-covers-nothing", change: (p) => (depthOf(p, "kinds", "1280x720").inspector = null) },
  { name: "a panel height that is not a number", rule: "bar-heights", change: (p) => (depthOf(p, "lane:k1", "1440x900").panel = null) },
  { name: "a bottom stack height that is not a number", rule: "bar-heights", change: (p) => (depthOf(p, "kinds", "1440x900").stack = Number.NaN) },
  { name: "the option with both depths open never read", rule: "bar-heights", change: (p) => (p.depths = p.depths!.filter((d) => d.option !== "all")) },
  { name: "the lane's depth never read at one size", rule: "bar-heights", change: (p) => (p.depths = p.depths!.filter((d) => !(d.option === "lane:k1" && d.size === "1280x720"))) },
  { name: "no depth facts read", rule: "bar-heights", change: (p) => (p.depths = null) },
  { name: "a lane's small label 5 px from its plot", rule: "small-label-gap", change: (p) => (p.lanes[0].small = { ...p.lanes[0].small!, gap: 5 }) },
  { name: "the rows' small label 11.9 px from its plot", rule: "small-label-gap", change: (p) => (p.sections!.rows = { ...rowsSmallOf(p), gap: LABEL_GAP_PX - 0.1 }) },
  { name: "a stack line's label 3 px from its plot", rule: "small-label-gap", change: (p) => (p.sections!.stack = { ...stackOf(p), gaps: [20, 3] }) },
  { name: "the rows' label gap not measured", rule: "small-label-gap", change: (p) => (p.sections!.rows = { ...rowsSmallOf(p), gap: null }) },
];

describe("laneProblems", () => {
  it("gives nothing for a correct page with one lane", () => {
    expect(laneProblems(goodPage([goodFacts()]), expectedOf())).toEqual([]);
  });

  it("gives nothing for a correct page of a pack with no lane", () => {
    expect(laneProblems(goodPage([]), expectedLanes([{ kind: "auth", source: "sql", magnitude: "amt" }], {}))).toEqual([]);
  });

  it("gives nothing for a correct page of a pack with rows, the rows' plot in line with the lane's", () => {
    const f = goodFacts();
    f.order = "track,rows,lane,axis";
    f.rowsPlot = { left: 172, width: 1244 };
    withSmall(f);
    expect(laneProblems(goodPage([f]), expectedOf(node, true))).toEqual([]);
  });

  interface Case {
    name: string;
    rule: string;
    expected?: ExpectedLane[];
    /** The legs that wait; omitted for the rule's own list, {} to judge every leg. */
    waiting?: Record<string, string>;
    ids?: string[];
    lanes?: LaneFacts[];
    change?: (f: LaneFacts, page: PageFacts) => void;
  }
  const noUnit: LaneNode = { ...node, magnitudeUnit: undefined };
  const named = (f: LaneFacts) => {
    f.order = "track,rows,lane,axis";
    f.rowsPlot = { left: 172, width: 1244 };
    withSmall(f);
  };
  const at = (size: string, page: PageFacts) => page.bars!.find((b) => b.size === size)!;
  const cases: Case[] = [
    { name: "a lane missing", rule: "lanes-on-page", ids: [], lanes: [] },
    { name: "a lane where none is expected", rule: "lanes-on-page", expected: [] },
    { name: "a wrong node label", rule: "node-label", change: (f) => (f.nodeLabel = "Other") },
    { name: "a missing node label", rule: "node-label", change: (f) => (f.nodeLabel = null) },
    { name: "a missing quantity label", rule: "quantity-label", change: (f) => (f.label = null) },
    { name: "a missing unit", rule: "unit", change: (f) => (f.unit = null) },
    { name: "a unit where none is declared", rule: "unit", expected: expectedOf(noUnit) },
    { name: "a value off by 0.01 at the peak", rule: "readout-at-peak", change: (f) => (f.atPeak = { at: peakAt, empty: false, value: 10.01 }) },
    { name: "an empty figure at the peak", rule: "readout-at-peak", change: (f) => (f.atPeak = { at: peakAt, empty: true, value: null }) },
    { name: "an unreadable figure at the peak", rule: "readout-at-peak", change: (f) => (f.atPeak = null) },
    {
      name: "the slider's instant outside the peak bucket",
      rule: "readout-at-peak",
      change: (f) => (f.atPeak = { at: T0 + HOUR / 2, empty: false, value: 3.5 }),
    },
    { name: "a number at the end where empty is expected", rule: "readout-at-end", change: (f) => (f.atEnd = { at: endAt, empty: false, value: 5 }) },
    { name: "a plot 2 px off the track", rule: "aligned-with-track", change: (f) => (f.plot = { left: 174, width: 1244 }) },
    { name: "a plot 2 px too narrow", rule: "aligned-with-track", change: (f) => (f.plot = { left: 172, width: 1242 }) },
    {
      name: "a plot inside the name gutter, not in line with the rows' plot",
      rule: "aligned-with-track",
      expected: expectedOf(node, true),
      change: (f) => {
        named(f);
        f.rowsPlot = { left: 24, width: 1392 };
      },
    },
    {
      name: "rows expected and no rows' plot read",
      rule: "aligned-with-track",
      expected: expectedOf(node, true),
      change: (f) => {
        named(f);
        f.rowsPlot = null;
      },
    },
    { name: "one bar piece above the plot", rule: "bars-inside-plot", change: (f) => (f.barsOutside = 1) },
    { name: "the lane before the track", rule: "order", change: (f) => (f.order = "lane,track,axis") },
    {
      name: "the rows left out where the pack declares rows",
      rule: "order",
      expected: expectedOf(node, true),
      change: (f) => {
        named(f);
        f.order = "track,lane,axis";
      },
    },
    {
      name: "the lane before the rows",
      rule: "order",
      expected: expectedOf(node, true),
      change: (f) => {
        named(f);
        f.order = "track,lane,rows,axis";
      },
    },
    { name: "the rows drawn where the pack declares none", rule: "order", change: (f) => (f.order = "track,rows,lane,axis") },
    { name: "a button with a tabIndex of -1", rule: "button-reachable", change: (f) => (f.tabIndex = -1) },
    { name: "a button that did not take focus", rule: "button-reachable", change: (f) => (f.focused = false) },
    { name: "the plot still shown after folding", rule: "fold-hides-plot", change: (f) => (f.fold = { ...f.fold!, plotHidden: false }) },
    { name: "still expanded after folding", rule: "fold-hides-plot", change: (f) => (f.fold = { ...f.fold!, expanded: true }) },
    { name: "the stack's height unchanged after folding", rule: "fold-lowers-stack", change: (f) => (f.fold = { ...f.fold!, stackDrop: 0 }) },
    { name: "the stack dropping 10 px less than the lane", rule: "fold-lowers-stack", change: (f) => (f.fold = { ...f.fold!, stackDrop: 15 }) },
    { name: "the lane open after the reload", rule: "fold-survives-reload", change: (f) => (f.afterReload = { expanded: true }) },
    { name: "the lane still folded after the second Enter", rule: "unfold-restores", change: (f) => (f.unfold = { expanded: false, plotHidden: true }) },
    { name: "the plot hidden after the second Enter", rule: "unfold-restores", change: (f) => (f.unfold = { expanded: true, plotHidden: true }) },
    // The folded lane, with and without its small version (GATE-2). With a name column the small
    // version stands where the open plot stood; without one the open plot is hidden as before.
    { name: "a name column and a fold that leaves no small version", rule: "fold-hides-plot", expected: expectedOf(node, true), change: (f) => { named(f); f.fold = { ...f.fold!, small: false }; } },
    { name: "the small version and the open plot both drawn", rule: "fold-hides-plot", expected: expectedOf(node, true), change: (f) => { named(f); f.fold = { ...f.fold!, plotHidden: false }; } },
    { name: "a small version where the pack has no name column", rule: "fold-hides-plot", change: (f) => (f.fold = { ...f.fold!, small: true }) },
    { name: "neither the open plot nor a small version found", rule: "fold-hides-plot", change: (f) => (f.fold = { ...f.fold!, plotHidden: null }) },
    { name: "an unreadable small version after folding", rule: "fold-hides-plot", change: (f) => (f.fold = { ...f.fold!, small: null }) },
    { name: "no small version in the lane of a pack with a name column", rule: "lane-small", expected: expectedOf(node, true), change: (f) => { named(f); f.small = { ...f.small!, drawn: false }; } },
    { name: "a small version in the lane of a pack with no name column", rule: "lane-small", change: (f) => { withSmall(f); f.fold = { ...f.fold!, small: false }; } },
    { name: "a small plot 2 px off the track", rule: "lane-small", expected: expectedOf(node, true), change: (f) => { named(f); f.small = { ...f.small!, plot: { left: 174, width: 1244 } }; } },
    { name: "a small version that shows a number the bucket does not hold", rule: "lane-small", expected: expectedOf(node, true), change: (f) => { named(f); f.small = { ...f.small!, readout: { at: endAt, empty: false, value: 5 } }; } },
    { name: "an unreadable small version", rule: "lane-small", change: (f) => (f.small = null) },
    // A fact the crawl could not read breaks its rule too, and a fold must lower the stack at all.
    { name: "an unreadable figure at the end", rule: "readout-at-end", change: (f) => (f.atEnd = null) },
    { name: "an unreadable track box", rule: "aligned-with-track", change: (f) => (f.track = null) },
    { name: "an unreadable bar count", rule: "bars-inside-plot", change: (f) => (f.barsOutside = null) },
    { name: "an unreadable order", rule: "order", change: (f) => (f.order = null) },
    { name: "an unreadable tabIndex", rule: "button-reachable", change: (f) => (f.tabIndex = null) },
    { name: "an unreadable focus", rule: "button-reachable", change: (f) => (f.focused = null) },
    { name: "an unreadable expanded state after folding", rule: "fold-hides-plot", change: (f) => (f.fold = { ...f.fold!, expanded: null }) },
    { name: "an unreadable lane drop", rule: "fold-lowers-stack", change: (f) => (f.fold = { ...f.fold!, laneDrop: null }) },
    { name: "neither the lane nor the stack lower when folding", rule: "fold-lowers-stack", change: (f) => (f.fold = { ...f.fold!, laneDrop: 0, stackDrop: 0 }) },
    { name: "an unreadable state after the reload", rule: "fold-survives-reload", change: (f) => (f.afterReload = null) },
    { name: "an unreadable state after the second Enter", rule: "unfold-restores", change: (f) => (f.unfold = null) },
    // The open bar, at both window sizes: it covers neither the Inspector, the log, the selected
    // marker nor the map credit.
    {
      name: "the bar over the Inspector at 1280 by 720",
      rule: "bar-covers-nothing",
      change: (_f, page) => (at("1280x720", page).bar = { left: 12, top: 400, right: 1428, bottom: 708 }),
    },
    {
      name: "the bar over the log",
      rule: "bar-covers-nothing",
      change: (_f, page) => {
        at("1440x900", page).inspector = { left: 1100, top: 12, right: 1428, bottom: 300 };
        at("1440x900", page).logs = [{ left: 12, top: 80, right: 300, bottom: 660 }];
      },
    },
    // The marker leg is judged since INT-3 (WAITING_LEGS is empty): the crawl reads the point the
    // map writes, and whether the selected record has a place.
    {
      name: "the bar over the selected marker",
      rule: "bar-covers-nothing",
      change: (_f, page) => (at("1440x900", page).marker = { x: 700, y: 650 }),
    },
    { name: "the bar over the map credit", rule: "bar-covers-nothing", change: (_f, page) => (at("1440x900", page).credit = { left: 1280, top: 690, right: 1428, bottom: 706 }) },
    { name: "an unreadable bar box", rule: "bar-covers-nothing", change: (_f, page) => (at("1440x900", page).bar = null) },
    { name: "an unreadable Inspector box", rule: "bar-covers-nothing", change: (_f, page) => (at("1440x900", page).inspector = null) },
    {
      name: "a selected record with a place and no point read",
      rule: "bar-covers-nothing",
      change: (_f, page) => (at("1280x720", page).marker = null),
    },
    {
      name: "a selected record whose place is not known and no point read",
      rule: "bar-covers-nothing",
      change: (_f, page) => {
        at("1280x720", page).marker = null;
        at("1280x720", page).placed = null;
      },
    },
    { name: "an unreadable map credit", rule: "bar-covers-nothing", change: (_f, page) => (at("1280x720", page).credit = null) },
    { name: "an unreadable log", rule: "bar-covers-nothing", change: (_f, page) => (at("1280x720", page).logs = null) },
    { name: "one window size never read", rule: "bar-covers-nothing", change: (_f, page) => (page.bars = page.bars!.slice(0, 1)) },
    { name: "no window size read", rule: "bar-covers-nothing", change: (_f, page) => (page.bars = null) },
    // Every aria-controls on the bar names an element that is in the document.
    { name: "an aria-controls that names nothing", rule: "controls-exist", change: (_f, page) => (page.controls = { total: 3, missing: [":r4:"] }) },
    { name: "no aria-controls found on the bar", rule: "controls-exist", change: (_f, page) => (page.controls = { total: 0, missing: [] }) },
    { name: "the controls not read", rule: "controls-exist", change: (_f, page) => (page.controls = null) },
  ];

  it.each(cases)("$name gives only $rule", ({ rule, expected, waiting, ids, lanes, change }) => {
    const facts = goodFacts();
    const page = goodPage(lanes ?? [facts], ids);
    change?.(facts, page);
    const problems = laneProblems(page, expected ?? expectedOf(), waiting);
    expect(problems.map((p) => p.rule)).toEqual([rule]);
    expect(problems[0].what.length).toBeGreaterThan(0);
  });

  it("has a row in the table for every rule", () => {
    const covered = new Set([...cases, ...sectionCases].map((c) => c.rule));
    for (const id of Object.keys(LANE_RULES)) expect(covered.has(id), `no case for ${id}`).toBe(true);
    for (const id of covered) expect(Object.keys(LANE_RULES)).toContain(id);
  });

  it("states the order as track, rows, lane, date labels", () => {
    expect(LANE_RULES.order).toBe("the document order is track, rows (when the pack declares rows), lane, date labels");
  });

  it("judges only the rule about the lanes when a lane is missing", () => {
    const problems = laneProblems(goodPage([], []), expectedOf());
    expect(problems.map((p) => p.rule)).toEqual(["lanes-on-page"]);
  });

  it("lets a figure within 0.006 and a plot within 1 px pass", () => {
    const near = goodFacts();
    near.atPeak = { at: peakAt, empty: false, value: 10.005 };
    near.plot = { left: 173, width: 1243 };
    expect(laneProblems(goodPage([near]), expectedOf())).toEqual([]);
  });

  it("lets a bar that only touches the Inspector's edge pass, and an absent log", () => {
    const page = goodPage([goodFacts()]);
    page.bars = [
      { ...goodBar("1440x900"), logs: [], inspector: { left: 1100, top: 12, right: 1428, bottom: 640 } },
      goodBar("1280x720"),
    ];
    expect(laneProblems(page, expectedOf())).toEqual([]);
  });

  it("names the window size and the part the bar covers", () => {
    const page = goodPage([goodFacts()]);
    page.bars![1] = { ...goodBar("1280x720"), credit: { left: 1280, top: 690, right: 1428, bottom: 706 } };
    const [problem] = laneProblems(page, expectedOf());
    expect(problem.what).toContain("1280x720");
    expect(problem.what).toContain("credit");
  });

  // INT-3 gave the marker leg its measure: the map writes the selected record's screen point and
  // the crawl reads it, with whether the record has a place. No leg waits now; the machinery for a
  // waiting leg stays, and these cases pass it an explicit list.
  describe("the marker leg", () => {
    const marker = "selected marker";
    const REASON = "a reason written in this test";
    const WAITING = { [marker]: REASON };
    const coveredMarker = () => {
      const page = goodPage([goodFacts()]);
      at("1440x900", page).marker = { x: 700, y: 650 };
      return page;
    };

    it("is judged: no leg waits", () => {
      expect(Object.keys(WAITING_LEGS)).toEqual([]);
      expect(laneVerdict(goodPage([goodFacts()]), expectedOf()).waits).toEqual([]);
    });

    it("fails a point under the bar, and names the marker", () => {
      const verdict = laneVerdict(coveredMarker(), expectedOf());
      expect(verdict.problems.map((p) => p.rule)).toEqual(["bar-covers-nothing"]);
      expect(verdict.problems[0].what).toContain("(1440x900: the bar covers the selected marker)");
    });

    it("fails as unread when a record with a place is selected and no point is read", () => {
      const page = goodPage([goodFacts()]);
      at("1280x720", page).marker = null;
      const [problem] = laneProblems(page, expectedOf());
      expect(problem.what).toContain("1280x720: selected marker not read");
    });

    it("fails as unread when it is not known whether the record has a place and no point is read", () => {
      const page = goodPage([goodFacts()]);
      Object.assign(at("1440x900", page), { marker: null, placed: null });
      const [problem] = laneProblems(page, expectedOf());
      expect(problem.what).toContain("1440x900: selected marker not read");
    });

    it("gives no finding when the selected record has no place and no point is read", () => {
      const page = goodPage([goodFacts()]);
      Object.assign(at("1440x900", page), { marker: null, placed: false });
      Object.assign(at("1280x720", page), { marker: null, placed: false });
      expect(laneVerdict(page, expectedOf())).toEqual({ problems: [], waits: [] });
    });

    it("judges a point that is read even when the place is not known", () => {
      const page = coveredMarker();
      at("1440x900", page).placed = null;
      expect(laneProblems(page, expectedOf()).map((p) => p.rule)).toEqual(["bar-covers-nothing"]);
    });

    it("holds the point on the bar's top edge as clear and a point inside it as covered", () => {
      const page = goodPage([goodFacts()]);
      at("1440x900", page).marker = { x: 700, y: 640 };
      expect(laneProblems(page, expectedOf())).toEqual([]);
      at("1440x900", page).marker = { x: 700, y: 641 };
      expect(laneProblems(page, expectedOf()).map((p) => p.rule)).toEqual(["bar-covers-nothing"]);
    });

    it("still has the waiting machinery: a leg in the list gives one waiting entry and is not judged", () => {
      const verdict = laneVerdict(coveredMarker(), expectedOf(), WAITING);
      expect(verdict.problems).toEqual([]);
      expect(verdict.waits).toEqual([{ rule: "bar-covers-nothing", leg: marker, reason: REASON }]);
      const unread = goodPage([goodFacts()]);
      at("1280x720", unread).marker = null;
      expect(laneVerdict(unread, expectedOf(), WAITING).problems).toEqual([]);
    });

    it("still fails with the Inspector covered while the marker leg waits, and the failure does not name the marker", () => {
      const page = coveredMarker();
      at("1280x720", page).bar = { left: 12, top: 400, right: 1428, bottom: 708 };
      const verdict = laneVerdict(page, expectedOf(), WAITING);
      expect(verdict.problems.map((p) => p.rule)).toEqual(["bar-covers-nothing"]);
      // The rule's own sentence names the marker; the finding in brackets names what was covered.
      const finding = verdict.problems[0].what.split(" (").pop()!;
      expect(finding).toContain("1280x720: the bar covers the Inspector");
      expect(finding).not.toContain(marker);
      expect(finding).not.toContain("1440x900");
      expect(verdict.waits).toHaveLength(1);
    });

    it("prints a waiting leg as a WAITS line that names the leg and what it waits on", () => {
      const [wait] = laneVerdict(coveredMarker(), expectedOf(), WAITING).waits;
      expect(waitLine("lanes card dark", wait)).toBe(`  WAITS  lanes card dark: bar-covers-nothing, selected marker, waits on ${REASON}`);
    });

    it("says three legs held and one waits, and never says the marker held", () => {
      const note = passNote(laneVerdict(coveredMarker(), expectedOf(), WAITING).waits);
      expect(note).toBe("bar covers: three legs held, one waits");
      expect(note).not.toContain(marker);
      expect(passNote([])).toBe("bar covers: four legs held");
    });

    it("counts the waiting legs in the last line, and says every check passed only when none waits", () => {
      expect(summaryLine(0, 0)).toBe("static-crawl: every check passed, 0 waiting legs");
      expect(summaryLine(0, 1)).toBe("static-crawl: no check failed, 1 waiting leg");
      expect(summaryLine(0, 6)).toBe("static-crawl: no check failed, 6 waiting legs");
      expect(summaryLine(2, 6)).toBe("static-crawl: 2 failure(s), 6 waiting legs");
    });
  });

  describe("with two lanes", () => {
    const node2: LaneNode = { ...node, kind: "k2", label: "Second" };
    // Two buckets at hours 6 and 7: no bucket at the first lane's peak or at the end.
    const rows2: LaneRow[] = [
      { ts: iso(T0 + 6 * HOUR), amt: 7 },
      { ts: iso(T0 + 7 * HOUR), amt: 2 },
    ];
    const expected = (): ExpectedLane[] => expectedLanes([node, node2], { k1: rows, k2: rows2 });
    // The page opens at the first lane's peak, so the second lane reads empty there.
    const second = (): LaneFacts => ({
      ...goodFacts(),
      id: "k2",
      nodeLabel: "Second",
      atPeak: { at: peakAt, empty: true, value: null },
    });

    it("gives nothing when both are right, and only the first lane must open in its peak bucket", () => {
      expect(laneProblems(goodPage([goodFacts(), second()]), expected())).toEqual([]);
    });

    it("gives lanes-on-page alone when the two stand in the wrong order", () => {
      const rules = laneProblems(goodPage([goodFacts(), second()], ["k2", "k1"]), expected()).map((p) => p.rule);
      expect(rules).toEqual(["lanes-on-page"]);
    });
  });

  it("names a fact that could not be read as a broken rule, not a crash", () => {
    const facts = goodFacts();
    facts.plot = null;
    facts.fold = null;
    const rules = laneProblems(goodPage([facts]), expectedOf()).map((p) => p.rule);
    expect(rules).toEqual(["aligned-with-track", "fold-hides-plot", "fold-lowers-stack"]);
  });
});

describe("the small versions, the depth and the heights (GATE-2)", () => {
  it("gives nothing for a correct page: both small versions, a line for each section, each depth", () => {
    expect(laneProblems(sectionPage(), expectedOf(node, true), undefined, barOf())).toEqual([]);
  });

  it("judges none of the GATE-2 rules when no expectation of the bar is given", () => {
    const page = sectionPage();
    page.sections = null;
    page.depths = null;
    expect(laneProblems(page, expectedOf(node, true))).toEqual([]);
  });

  it.each(sectionCases)("$name gives only $rule", ({ rule, change, bar }) => {
    const expectation = bar ? bar() : barOf();
    const page = sectionPage(expectation);
    change(page);
    const problems = laneProblems(page, expectedOf(node, true), undefined, expectation);
    expect(problems.map((p) => p.rule)).toEqual([rule]);
    expect(problems[0].what.length).toBeGreaterThan(0);
  });

  it("lets a label exactly 12 px from its plot pass, and holds the floor at the design's number", () => {
    expect(LABEL_GAP_PX).toBe(12);
    const page = sectionPage();
    page.lanes[0].small = { ...page.lanes[0].small!, gap: 12 };
    page.sections!.rows = { ...rowsSmallOf(page), gap: 12 };
    expect(laneProblems(page, expectedOf(node, true), undefined, barOf())).toEqual([]);
  });

  it("holds fold-lowers-stack with the small version (24 and 24) and without it (25 and 25)", () => {
    const withIt = namedLane();
    const without = goodFacts();
    expect([withIt.fold!.laneDrop, withIt.fold!.stackDrop]).toEqual([24, 24]);
    expect([without.fold!.laneDrop, without.fold!.stackDrop]).toEqual([25, 25]);
    expect(laneProblems(goodPage([withIt]), expectedOf(node, true))).toEqual([]);
    expect(laneProblems(goodPage([without]), expectedOf())).toEqual([]);
    withIt.fold = { ...withIt.fold!, stackDrop: 0 };
    expect(laneProblems(goodPage([withIt]), expectedOf(node, true)).map((p) => p.rule)).toEqual(["fold-lowers-stack"]);
  });

  it("names the depth option and the window size in a finding about the bar's reach", () => {
    const page = sectionPage();
    depthOf(page, "lane:k1", "1280x720").bar = { left: 12, top: 400, right: 1428, bottom: 708 };
    const [problem] = laneProblems(page, expectedOf(node, true), undefined, barOf());
    expect(problem.what).toContain("1280x720 with lane:k1 open: the bar covers the Inspector");
  });
});

describe("expectedBar", () => {
  const timed = (kind: string): LaneNode => ({ kind, source: "sql", label: kind, timestamp: "ts" });

  it("expects the rows' small version, a line for each section, the lane's depth and the kind lines of a pack with rows", () => {
    expect(barOf()).toEqual({ rows: true, stack: true, lanes: ["k1"], depths: ["lane:k1", "kinds"] });
  });

  it("expects no rows and no depth of a pack with no name column, and still a stack for a lane", () => {
    expect(expectBar(false)).toEqual({ rows: false, stack: true, lanes: ["k1"], depths: [] });
  });

  it("expects nothing of a pack with no row and no lane", () => {
    expect(expectedBar([], [timed("a")], [], {}, false)).toEqual({ rows: false, stack: false, lanes: [], depths: [] });
  });

  it("offers kind lines from two kinds, and not from one, from a decision or from a kind with no time", () => {
    const two = expectedBar([], [timed("a"), timed("b")], [], {}, true);
    expect(two.depths).toEqual(["kinds"]);
    expect(expectedBar([], [timed("a")], [], {}, true).depths).toEqual([]);
    expect(expectedBar([], [timed("a"), { ...timed("b"), decision: {} }], [], {}, true).depths).toEqual([]);
    expect(expectedBar([], [timed("a"), { kind: "b", source: "sql" }], [], {}, true).depths).toEqual([]);
  });

  it("offers a lane's depth only for a lane the page draws, a split field of the field table and a label", () => {
    const lanes = expectedOf(node, true);
    const depth = (entry: unknown, fields: unknown) => expectedBar(lanes, [node], [entry], fields, true).depths;
    expect(depth({ id: "k1", depth: { split: "asn" } }, barFields)).toEqual(["lane:k1"]);
    expect(depth({ id: "other", depth: { split: "asn" } }, barFields)).toEqual([]);
    expect(depth({ id: "k1", depth: { split: "asn" } }, { asn: {} })).toEqual([]);
    expect(depth({ id: "k1", depth: { split: "asn" } }, {})).toEqual([]);
    expect(depth({ id: "k1", depth: { split: "no good" } }, { "no good": { label: "X" } })).toEqual([]);
    expect(depth({ id: "k1", depth: {} }, barFields)).toEqual([]);
  });

  function expectBar(rowsDeclared: boolean): ExpectedBar {
    return expectedBar(expectedOf(node, rowsDeclared), barNodes, barDeclared, barFields, rowsDeclared);
  }
});

describe("barHeights", () => {
  let b: ExpectedBar;
  beforeEach(() => {
    b = barOf();
  });
  const over =(): DepthFact[] => goodDepths(b).map((d) => (d.option === "lane:k1" && d.size === "1280x720" ? { ...d, panel: 404, stack: 434 } : d));

  it("holds the share at the app's own number, counting the panel", () => {
    expect(SHARE).toBe(OPEN_BAR_SHARE);
    expect(SHARE).toBe(0.42);
  });

  it("prints each option at each size with both heights, and the 1440 by 900 share as 378 px", () => {
    const { lines, problems } = barHeights(goodDepths(b), b.depths);
    expect(problems).toEqual([]);
    expect(lines).toHaveLength(BAR_SIZES.length * 3);
    expect(lines.filter((l) => l.includes("1440x900")).every((l) => l.includes("378 px"))).toBe(true);
    expect(lines.filter((l) => l.includes("1280x720")).every((l) => l.includes("302.4 px"))).toBe(true);
    expect(lines.some((l) => l.includes("both depths"))).toBe(true);
  });

  it("names an option over the share, once, and fails nothing for it", () => {
    const { lines, problems } = barHeights(over(), b.depths);
    expect(problems).toEqual([]);
    expect(lines.filter((l) => l.includes("OVER the share"))).toHaveLength(1);
    expect(lines.find((l) => l.includes("OVER the share"))).toContain("lane depth k1");
  });

  it("fails an option that is missing, and a height that is not a number", () => {
    expect(barHeights(goodDepths(b).slice(1), b.depths).problems).toHaveLength(1);
    expect(barHeights(null, b.depths).problems.length).toBeGreaterThan(0);
    const broken = goodDepths(b).map((d, i) => (i === 0 ? { ...d, panel: null } : d));
    expect(barHeights(broken, b.depths).problems).toHaveLength(1);
  });

  it("asks nothing of a pack that offers no depth", () => {
    expect(barHeights(null, [])).toEqual({ lines: [], problems: [] });
  });
});

describe("laneNodes", () => {
  it("leaves out a node with a decision key, a node of an app kind and a node with no magnitude", () => {
    const nodes: LaneNode[] = [
      node,
      { ...node, kind: "k2", decision: {} },
      { ...node, kind: "auth" },
      { ...node, kind: "k3", magnitude: undefined },
      { ...node, kind: "k4", magnitude: "" },
      { ...node, kind: "k5", source: "api" },
    ];
    expect(laneNodes(nodes).map((n) => n.kind)).toEqual(["k1"]);
  });
});

// The manifest's root `lanes`: a kind with a timestamp, an hour bucket, a sum or a largest value.
const kindA: LaneNode = { kind: "a", source: "sql", label: "A", timestamp: "ts" };
const kindB: LaneNode = { kind: "b", source: "sql", label: "B", timestamp: "ts" };
const noTime: LaneNode = { kind: "c", source: "sql", label: "C" };
const lane = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  name: "Decl",
  label: "Qty",
  unit: "U",
  kinds: ["a"],
  field: "amt",
  bucket: "hour",
  aggregate: "sum",
  ...over,
});

describe("declaredLanes", () => {
  const nodes = [kindA, kindB, noTime];

  it("keeps a valid entry, trimmed, in declared order, and gives [] for a non-array", () => {
    const got = declaredLanes([lane({ id: " d1 ", name: " Decl " }), lane({ id: "d2", aggregate: "max", kinds: ["a", "b"] })], nodes);
    expect(got.map((l) => [l.id, l.name, l.aggregate, l.kinds])).toEqual([
      ["d1", "Decl", "sum", ["a"]],
      ["d2", "Decl", "max", ["a", "b"]],
    ]);
    expect(declaredLanes(undefined, nodes)).toEqual([]);
    expect(declaredLanes({}, nodes)).toEqual([]);
  });

  it.each([
    ["a day bucket", { bucket: "day" }],
    ["a mean", { aggregate: "mean" }],
    ["a kind with no timestamp", { kinds: ["c"] }],
    ["a kind that is no node", { kinds: ["zz"] }],
    ["no kinds", { kinds: [] }],
    ["an empty name", { name: "  " }],
    ["a name of 25 characters", { name: "x".repeat(25) }],
    ["a label of 25 characters", { label: "x".repeat(25) }],
    ["a unit of 17 characters", { unit: "x".repeat(17) }],
    ["an id of 65 characters", { id: "x".repeat(65) }],
    ["no field", { field: "" }],
    ["a top of 0", { top: 0 }],
    ["a top that is a string", { top: "5" }],
  ])("drops an entry with %s, and only that entry", (_name, over) => {
    const got = declaredLanes([lane(over as Record<string, unknown>), lane({ id: "ok" })], nodes);
    expect(got.map((l) => l.id)).toEqual(["ok"]);
  });

  it("drops an id that is used before it, among entries or among the lanes of nodes", () => {
    expect(declaredLanes([lane(), lane({ name: "Again" })], nodes).map((l) => l.name)).toEqual(["Decl"]);
    expect(declaredLanes([lane({ id: "k1" })], nodes, ["k1"])).toEqual([]);
  });
});

describe("expectedLanes", () => {
  it("trims label and unit, gives null for one too long, and the kind for a node with no label", () => {
    const lanes = expectedLanes(
      [
        { ...node, label: undefined, magnitudeLabel: "  Qty  ", magnitudeUnit: " U " },
        { ...node, kind: "k2", magnitudeLabel: "x".repeat(25), magnitudeUnit: "y".repeat(17) },
        { ...node, kind: "k3", magnitudeLabel: 5, magnitudeUnit: "   " },
      ],
      { k1: rows, k2: rows, k3: rows },
    );
    expect(lanes.map((l) => [l.id, l.nodeLabel, l.label, l.unit])).toEqual([
      ["k1", "k1", "Qty", "U"],
      ["k2", "Node", null, null],
      ["k3", "Node", null, null],
    ]);
  });

  it("leaves out a node with no bucket and gives the peak, the step and the opening instant", () => {
    const lanes = expectedLanes([node, { ...node, kind: "k2" }], { k1: rows, k2: [{ ts: "x", amt: 1 }] });
    expect(lanes).toHaveLength(1);
    expect(lanes[0].step).toBe(HOUR);
    expect(lanes[0].peak).toEqual({ t: T0 + HOUR, sum: 10 });
    expect(lanes[0].opening).toBe(T0 + HOUR);
    expect(lanes[0].named).toBe(false);
  });

  describe("with the manifest's root lanes", () => {
    const nodes = [node, kindA, kindB];
    const aRows: LaneRow[] = [
      { ts: iso(T0 + 10 * MIN), amt: 1 },
      { ts: iso(T0 + 50 * MIN), amt: 2 },
      { ts: iso(T0 + 2 * HOUR + 30 * MIN), amt: 4 },
      { ts: iso(T0 + 2 * HOUR + 5 * MIN), amt: 10 },
      { ts: iso(T0 + 3 * HOUR), amt: 0 },
    ];
    const bRows: LaneRow[] = [{ ts: iso(T0 + 2 * HOUR + 20 * MIN), amt: 100 }];
    const byKind = { k1: rows, a: aRows, b: bRows };

    it("lists a node's lane first, then the root lanes in declared order, keyed by id", () => {
      const got = expectedLanes(nodes, byKind, [lane(), lane({ id: "d2", kinds: ["b"] })]);
      expect(got.map((l) => [l.id, l.kind])).toEqual([
        ["k1", "k1"],
        ["d1", "a"],
        ["d2", "b"],
      ]);
    });

    it("sums rows in an hour bucket, keeps the declared hour as the step across a gap, and opens on a row", () => {
      const [d1] = expectedLanes(nodes, byKind, [lane()]).slice(1);
      expect(d1.buckets).toEqual([
        { t: T0, sum: 3 },
        { t: T0 + 2 * HOUR, sum: 14 },
      ]);
      expect(d1.step).toBe(HOUR);
      expect(d1.peak).toEqual({ t: T0 + 2 * HOUR, sum: 14 });
      expect(d1.opening).toBe(T0 + 2 * HOUR + 5 * MIN);
      expect([d1.nodeLabel, d1.label, d1.unit]).toEqual(["Decl", "Qty", "U"]);
    });

    it("takes the largest value of a bucket for a max lane", () => {
      const [d1] = expectedLanes(nodes, byKind, [lane({ aggregate: "max" })]).slice(1);
      expect(d1.buckets).toEqual([
        { t: T0, sum: 2 },
        { t: T0 + 2 * HOUR, sum: 10 },
      ]);
    });

    it("reads the rows of every kind the lane lists, each by its own kind's timestamp field", () => {
      const other: LaneNode = { ...kindB, timestamp: "when" };
      const [d] = expectedLanes([kindA, other], { a: aRows, b: [{ when: iso(T0 + 2 * HOUR + 40 * MIN), amt: 6 }] }, [lane({ kinds: ["a", "b"] })]);
      expect(d.peak).toEqual({ t: T0 + 2 * HOUR, sum: 20 });
    });

    it("gives a lane of one bucket the declared step, so it has a figure", () => {
      const [d2] = expectedLanes(nodes, byKind, [lane({ id: "d2", kinds: ["b"] })]).slice(1);
      expect(d2.step).toBe(HOUR);
      expect(expectedReadout(d2.buckets, d2.step, d2.opening)).toEqual({ empty: false, value: 100 });
    });

    it("leaves out a root lane with no usable row, and one whose id a node's lane has", () => {
      const got = expectedLanes(nodes, byKind, [lane({ id: "k1" }), lane({ id: "e", kinds: ["a"], field: "none" })]);
      expect(got.map((l) => l.id)).toEqual(["k1"]);
    });

    it("expects a lane of a concrete kind such as auth, which no node magnitude gives", () => {
      const authNode: LaneNode = { kind: "auth", source: "sql", label: "Authorization", timestamp: "timestamp", magnitude: "amount" };
      const got = expectedLanes([authNode], { auth: [{ timestamp: iso(T0), amount: 5 }] }, [lane({ id: "card-spend", kinds: ["auth"], field: "amount" })]);
      expect(got.map((l) => l.id)).toEqual(["card-spend"]);
    });

    it("carries the pack's rows into every lane", () => {
      expect(expectedLanes(nodes, byKind, [lane()], true).map((l) => l.named)).toEqual([true, true]);
    });
  });
});

describe("kindsToFetch", () => {
  it("is the kinds of the node lanes and of the valid root lanes, once each, in order", () => {
    const nodes = [node, kindA, kindB, noTime];
    expect(kindsToFetch(nodes, [lane({ kinds: ["b", "a"] }), lane({ id: "bad", kinds: ["c"] })])).toEqual(["k1", "b", "a"]);
  });

  it("is empty for a pack that declares no lane", () => {
    expect(kindsToFetch([kindA], undefined)).toEqual([]);
  });
});

describe("bucketsOf, stepOf and expectedReadout", () => {
  const buckets = bucketsOf(rows, node);

  it("sums a bucket of three rows, skips an unparsable time and a zero, keeps time order", () => {
    expect(buckets).toEqual([
      { t: T0, sum: 3.5 },
      { t: T0 + HOUR, sum: 10 },
      { t: T0 + 3 * HOUR, sum: 4 },
    ]);
    expect(bucketsOf([...rows].reverse(), node)).toEqual(buckets);
  });

  it("takes the smallest gap as the step, and 0 below two buckets", () => {
    expect(stepOf(buckets)).toBe(HOUR);
    expect(stepOf([{ t: 5, sum: 1 }])).toBe(0);
    expect(stepOf([])).toBe(0);
  });

  it("reads a bucket, a gap, an instant after the last bucket and the lane of one bucket", () => {
    const step = HOUR;
    expect(expectedReadout(buckets, step, T0 + 1000)).toEqual({ empty: false, value: 3.5 });
    expect(expectedReadout(buckets, step, T0 + HOUR)).toEqual({ empty: false, value: 10 });
    expect(expectedReadout(buckets, step, T0 + 2 * HOUR + 1)).toEqual({ empty: true });
    expect(expectedReadout(buckets, step, T0 + 3 * HOUR + HOUR)).toEqual({ empty: true });
    expect(expectedReadout(buckets, step, T0 + 100 * HOUR)).toEqual({ empty: true });
    const one = [{ t: T0, sum: 7 }];
    expect(expectedReadout(one, stepOf(one), T0)).toEqual({ empty: true });
  });
});

describe("the crawl and its two files", () => {
  const code = (text: string) => text.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
  const section = (from: string, to: string) => crawlSource.slice(crawlSource.indexOf(from), crawlSource.indexOf(to));
  const lanes = () => section("// ---- the timeline's bar lanes", "async function crawlCustomerAlone");

  it("imports laneProblems and calls crawlLanes on a line that is not a comment", () => {
    expect(code(crawlSource).some((l) => /^\s*import\b.*\blaneProblems\b/.test(l))).toBe(true);
    expect(code(crawlSource).some((l) => /\bawait crawlLanes\(/.test(l))).toBe(true);
  });

  it("keeps a pack's words out of the check and its declaration", () => {
    for (const text of [checkSource, declSource]) expect(text).not.toMatch(/usage|spend|usd/i);
  });

  // Every pin below reads code lines only: the crawl's header comment names the same selectors, so
  // a pin on the whole text would stay green when the code's own selector or attribute is wrong.
  it("reads the number at the line by data-lane-figure-value, and the header's readout no more", () => {
    // The page readers moved from the crawl to bar-read.mjs (the crawl is at its line cap); the pins
    // are the same strings, read where the readers now live.
    const laneCode = code(lanes());
    const readCode = code(readSource);
    expect(readCode.some((l) => l.includes("plot.querySelectorAll('[data-lane-figure]')"))).toBe(true);
    expect(readCode.some((l) => l.includes("getAttribute('data-lane-figure') === id"))).toBe(true);
    expect(readCode.some((l) => l.includes("figure?.getAttribute('data-lane-figure-value')"))).toBe(true);
    expect(laneCode.some((l) => l.includes('[data-lane-figure="${first.id}"]'))).toBe(true);
    expect(code(crawlSource).some((l) => /data-magnitude-readout|data-magnitude-value/.test(l))).toBe(false);
  });

  it("prints a WAITS line for a waiting leg, counts them, and exits on failures alone", () => {
    const all = code(crawlSource);
    expect(all.some((l) => /^\s*import\b.*\blaneVerdict\b.*\bpassNote\b.*\bsummaryLine\b.*\bwaitLine\b/.test(l))).toBe(true);
    expect(all.some((l) => /console\.log\(waitLine\(where, /.test(l))).toBe(true);
    expect(all.some((l) => /waitingLegs\.push\(/.test(l))).toBe(true);
    expect(all.some((l) => /console\.log\(`\\n\$\{summaryLine\(failures\.length, waitingLegs\.length\)\}`\)/.test(l))).toBe(true);
    expect(all.some((l) => /^if \(failures\.length > 0\) \{/.test(l))).toBe(true);
    expect(all.some((l) => /process\.exit\(1\)/.test(l))).toBe(true);
    expect(all.some((l) => /return drawsBar \? passNote\(/.test(l))).toBe(true);
    expect(all.some((l) => /every check passed/.test(l))).toBe(false);
  });

  it("reads the manifest's root lanes and the rows, and finds the lanes by id and not by kind", () => {
    expect(code(crawlSource).some((l) => /\bmanifest\.lanes\b/.test(l))).toBe(true);
    expect(code(crawlSource).some((l) => /\bmanifest\.rows\b/.test(l))).toBe(true);
    expect(code(crawlSource).some((l) => /\bkindsToFetch\(/.test(l))).toBe(true);
    expect(lanes()).not.toMatch(/\be\.kind\b/);
  });

  it("waits for the bar with waitFor and never at network idle in the lane sections", () => {
    expect(lanes().length).toBeGreaterThan(1000);
    expect(code(lanes().split("\n").join("\n")).some((l) => /networkidle/.test(l))).toBe(false);
    expect(lanes()).toContain("waitForFunction");
  });

  // The marker leg reads the point the map writes, not the canvas centre. Source reads, since
  // the crawl itself needs a served site.
  it("reads the selected marker from the map's data-selected-point, and not from the canvas centre", () => {
    const laneCode = code(lanes());
    const readCode = code(readSource);
    expect(readCode.some((l) => l.includes("[data-testid=\"globe-map\"]"))).toBe(true);
    expect(readCode.some((l) => l.includes("getAttribute('data-selected-point')"))).toBe(true);
    for (const all of [laneCode, readCode]) {
      expect(all.some((l) => /width \/ 2|height \/ 2/.test(l))).toBe(false);
      expect(all.some((l) => l.includes("canvas.maplibregl-canvas") && l.includes("getBoundingClientRect"))).toBe(false);
    }
  });

  it("gives each window size whether the selected record has a place, and waits for the point only when it has", () => {
    const laneCode = code(lanes());
    expect(laneCode.some((l) => /placed/.test(l) && /return \{ size/.test(l))).toBe(true);
    expect(laneCode.some((l) => l.includes("page.evaluate(findPlace"))).toBe(true);
    // The wait is a statement in braces under the if, and the return is after the block. A trailing
    // line comment is cut from each line first, so a wait swallowed by one does not count.
    // SHORTCUT: no string in gatherBar holds "//", which this cut would break.
    const body = section("async function gatherBar", "async function crawlLanes").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "").trimEnd());
    const at = body.findIndex((l) => /^\s*if \(placed === true\) \{$/.test(l));
    expect(at).toBeGreaterThan(-1);
    const indent = body[at].match(/^\s*/)![0];
    const close = body.findIndex((l, i) => i > at && l === `${indent}}`);
    expect(close).toBeGreaterThan(at);
    const inside = body.slice(at + 1, close).join("\n");
    expect(inside).toMatch(/^\s*await page\.waitForFunction\(/);
    expect(inside).toContain("data-selected-point");
    const ret = body.findIndex((l) => /^\s*return \{ size, placed/.test(l));
    expect(ret).toBeGreaterThan(close);
    expect(body[ret].startsWith(`${indent}return`)).toBe(true);
  });

  // The page function that says whether a record has a place, run here against a stand-in `fetch`.
  describe("findPlace", () => {
    const lists: Record<string, unknown[]> = {
      "/api/transactions": [{ id: "t1", merchant_lat: 6.5, merchant_lng: 3.4 }, { id: "t2", merchant_lat: null, merchant_lng: null }],
      "/api/logins": [{ id: "l1", ip_lat: 40, ip_lng: -3 }],
      "/api/account_events": [{ id: "e1" }],
      "/api/transfers": [{ id: "x1" }],
      "/api/entities?kind=signin": [{ id: "s1", lat: 1, lng: 2 }],
      "/api/entities?kind=network": [{ id: "n1" }],
    };
    const nodes = [
      { kind: "signin", source: "json", coords: { lat: "lat", lng: "lng" } },
      { kind: "usage", source: "json" },
      { kind: "network", source: "json" },
    ];
    const real = globalThis.fetch;
    const asked: string[] = [];
    beforeEach(() => {
      asked.length = 0;
      globalThis.fetch = (async (url: string) => {
        asked.push(url);
        return { ok: url in lists, json: async () => lists[url] ?? [] };
      }) as unknown as typeof fetch;
    });
    afterEach(() => {
      globalThis.fetch = real;
    });

    it("is true for a row with finite coordinates, in the app's own lists and in a declared kind", async () => {
      expect(await findPlace({ sel: "t1", nodes })).toBe(true);
      expect(await findPlace({ sel: "l1", nodes })).toBe(true);
      expect(await findPlace({ sel: "s1", nodes })).toBe(true);
    });

    it("is false for a row with no coordinates or of a kind that has none", async () => {
      expect(await findPlace({ sel: "t2", nodes })).toBe(false);
      expect(await findPlace({ sel: "e1", nodes })).toBe(false);
      expect(await findPlace({ sel: "x1", nodes })).toBe(false);
    });

    // A pack with no place: the record of a declared kind that has no coords is found in its list and
    // has no place, which is not the same as a record found in no list.
    it("is false for a record of a declared kind that has no coords, and still null for one in no list", async () => {
      expect(await findPlace({ sel: "n1", nodes })).toBe(false);
      expect(asked).toContain("/api/entities?kind=network");
      expect(await findPlace({ sel: "n2", nodes })).toBeNull();
    });

    it("is null when no list holds the row or the address names none, and reads no Places list", async () => {
      expect(await findPlace({ sel: "nobody", nodes })).toBeNull();
      expect(await findPlace({ sel: null, nodes })).toBeNull();
      expect(asked.some((u) => u.includes("places"))).toBe(false);
    });
  });

  it("leaves no leg waiting in the lane check", () => {
    expect(checkSource).toMatch(/export const WAITING_LEGS = Object\.freeze\(\{\}\);/);
  });

  it("runs the bar-covers rule at both window sizes and gathers the aria-controls", () => {
    expect(BAR_SIZES).toEqual(["1440x900", "1280x720"]);
    expect(lanes()).toContain("for (const size of BAR_SIZES)");
    expect(lanes()).toContain("gatherBar(");
    // On code only: the readers' header comment names the same, and a pin on it passes for a wrong name.
    expect(holdsToken(codeOf(readSource), "aria-controls")).toBe(true);
    expect(holdsToken(codeOf(lanes()), "--bottom-stack-h")).toBe(true);
    expect(holdsToken(codeOf(readSource), "--bottom-stack-h")).toBe(true);
  });

  // The crawl gathers each small version and each depth in a state of its own, judges them
  // with the expectation the manifest gives, and prints the heights. Source reads: the crawl runs
  // separately.
  it("judges with the manifest's expectation, prints the heights, and gathers the sections and each depth", () => {
    const all = code(crawlSource);
    expect(all.some((l) => /^\s*import\b.*\bexpectedBar\b.*\bbarHeights\b/.test(l))).toBe(true);
    expect(all.some((l) => /laneVerdict\(facts, expected, undefined, bar\)/.test(l))).toBe(true);
    expect(all.some((l) => /\bbarHeights\(/.test(l))).toBe(true);
    expect(all.some((l) => /console\.log\(line\)/.test(l))).toBe(true);
    expect(all.some((l) => /\bgatherSections\(/.test(l))).toBe(true);
    expect(all.some((l) => /scenario\.fields = manifest\.fields/.test(l))).toBe(true);
    expect(lanes()).not.toContain("not mounted yet");
  });

  it("opens each depth by its own toggle in a context of its own, and presses the toggle before the step key", () => {
    const body = codeOf(section("async function gatherBar", "async function crawlLanes"));
    expect(holdsToken(body, "opens")).toBe(true);
    expect(holdsToken(body, "data-lane-lines-toggle")).toBe(true);
    expect(holdsToken(body, "data-kinds-fold")).toBe(true);
    expect(body.indexOf("[data-kinds-fold]")).toBeLessThan(body.indexOf("page.keyboard.press(stepKey("));
    expect(code(body).filter((l) => /browser\.newContext\(/.test(l))).toHaveLength(1);
  });

  it("waits with waitFor in the page readers' callers and holds no network idle, no Escape and no pack's word in the readers", () => {
    expect(code(readSource).some((l) => /networkidle/.test(l))).toBe(false);
    for (const text of [readSource, checkSource, declSource]) {
      expect(text).not.toMatch(/Escape/);
      expect(text).not.toMatch(/usage|spend|usd/i);
    }
    expect(code(section("async function gatherSections", "async function crawlLanes")).some((l) => /networkidle/.test(l))).toBe(false);
  });

  it("restates the lane check's numbers as the app holds them", () => {
    expect(ONE_LINE_PX).toBe(44);
    expect(LABEL_GAP_PX).toBe(SMALL_LABEL_GAP_PX);
    expect(SHARE).toBe(OPEN_BAR_SHARE);
  });

  // Each selector the readers use, against the source that draws it (the stacked build): the app's
  // file holds the name, and the reader holds it too, both on code lines and as a whole name (bar-read.test.ts
  // runs the readers themselves against a page drawn from these names).
  it.each([
    ["data-lane-small-plot", laneSmallSource],
    ["data-lane-small-name", laneSmallSource],
    ["data-lane-small-range", laneSmallSource],
    ["data-lane-small-words", laneSmallSource],
    ["data-lane-small", laneSmallSource],
    ["data-rows-small", rowsSmallSource],
    ["data-small-label", rowsSmallSource],
    ["data-small-plot", rowsSmallSource],
    ["data-small-open", rowsSmallSource],
    ["data-small-count-figure", rowsSmallSource],
    ["data-lane-lines-toggle", laneLinesSource],
    ["data-lane-line-row", laneLinesSource],
    ["data-lane-line-plot", laneLinesSource],
    ["data-line-piece", laneLinesSource],
    ["data-kinds-fold", kindLinesSource],
    ["data-kind-line", kindLinesSource],
    ["data-kind-plot", kindLinesSource],
    ["data-stack-lines", shellSource],
    ["data-bar-fold", barFoldSource],
    ["data-case-strip", caseStripSource],
    ["data-magnitude-lane", magnitudeSource],
  ])("reads %s, which the app draws", (name, source) => {
    expect(holdsToken(codeOf(source), name)).toBe(true);
    expect(holdsToken(codeOf(readSource), name)).toBe(true);
  });
});
