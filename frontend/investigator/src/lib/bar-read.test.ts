/**
 * GATE-2b: the page readers of the crawl's bar check (scripts/bar-read.mjs) run here, against a DOM
 * built from the attributes the app draws, and give the facts the rules need.
 *
 * Every attribute name in the fixture below is typed here and not read from the reader, so a name
 * changed in a reader does not change the page it reads. The table at the foot of this file pins each
 * name to the component that draws it, on code lines only (comments are cut first). A last block
 * changes each attribute name a reader holds, one at a time, in a copy of the reader's source, and
 * expects a different reading: a reader that asks for an element the app does not draw turns it red.
 *
 * The environment is happy-dom (this project has no jsdom). It draws no layout, so a box is set on
 * the element that the reader measures, and the range of a label's text is set with it.
 *
 * Where each name is drawn (file:line in the stacked source):
 *   data-eyes="TIMELINE-ROOT"      components/timeline/TimelineShell.tsx:308
 *   role="slider", aria-label      components/timeline/TimelineShell.tsx:340-341 (default "Playhead position", :182)
 *   aria-valuenow                  components/timeline/TimelineShell.tsx:344
 *   data-timeline-axis             components/timeline/TimelineShell.tsx:288
 *   data-stack-lines               components/timeline/TimelineShell.tsx:360
 *   data-case-strip                components/timeline/CaseStrip.tsx:62
 *   data-bar-fold                  components/timeline/head/BarFold.tsx:48
 *   data-magnitude-lane            components/timeline/MagnitudeLane.tsx:228
 *   data-magnitude-node / -label / -unit   components/timeline/MagnitudeLane.tsx:247 / :255 / :263
 *   data-magnitude-plot            components/timeline/MagnitudeLane.tsx:307
 *   data-bar-piece                 components/timeline/MagnitudeLane.tsx:120
 *   data-lane-figure, -value       components/timeline/head/LaneFigure.tsx:82-83
 *   data-lane-small / -name / -words / -range / -plot   components/timeline/LaneSmall.tsx:169 / :173 / :184 / :191 / :198
 *   data-rows-small / -open / -label / -plot / data-small-count-figure   components/timeline/rows/RowsSmall.tsx:215 / :220 / :258 / :272 / :158
 *   data-track-rows, data-track-plot   components/timeline/rows/TrackRows.tsx:359 / :65
 *   data-track-header              components/timeline/rows/TrackHeader.tsx:31
 *   data-lane-lines-toggle / -line-row / -line-plot / data-line-piece   components/timeline/LaneLines.tsx:208 / :140 / :165 / :103
 *   data-kinds-fold / data-kind-line / data-kind-plot   components/timeline/KindLines.tsx:47 / :107 / :124
 *   data-testid="globe-map", data-selected-point   components/GlobeMap.tsx:791 / :424
 *   data-map-credit                components/MapCredit.tsx:17
 *   aria-label="Inspector"         components/Inspector.tsx:36
 *   --bottom-stack-h               App.tsx:159
 *   aria-controls, aria-expanded   BarFold.tsx:50 and :49, KindLines.tsx:49 and :48, LaneLines.tsx:210 and :209
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import readSource from "../../scripts/bar-read.mjs?raw";
import crawlSource from "../../scripts/static-crawl.mjs?raw";
import shellSource from "../components/timeline/TimelineShell.tsx?raw";
import caseStripSource from "../components/timeline/CaseStrip.tsx?raw";
import barFoldSource from "../components/timeline/head/BarFold.tsx?raw";
import magnitudeSource from "../components/timeline/MagnitudeLane.tsx?raw";
import laneFigureSource from "../components/timeline/head/LaneFigure.tsx?raw";
import laneSmallSource from "../components/timeline/LaneSmall.tsx?raw";
import rowsSmallSource from "../components/timeline/rows/RowsSmall.tsx?raw";
import trackRowsSource from "../components/timeline/rows/TrackRows.tsx?raw";
import trackHeaderSource from "../components/timeline/rows/TrackHeader.tsx?raw";
import laneLinesSource from "../components/timeline/LaneLines.tsx?raw";
import kindLinesSource from "../components/timeline/KindLines.tsx?raw";
import globeSource from "../components/GlobeMap.tsx?raw";
import creditSource from "../components/MapCredit.tsx?raw";
import inspectorSource from "../components/Inspector.tsx?raw";
import appSource from "../App.tsx?raw";
import { codeOf, holdsToken } from "./code-text";
import { BAR, FOLD_BUTTON, SLIDER, readBar, readControls, readDepth, readFold, readHeights, readLane, readSmalls, stackFact } from "../../scripts/bar-read.mjs";

type Box = { left?: number; top?: number; width?: number; height?: number };
const boxes = new Map<Element, Required<Box>>();
const texts = new Map<Element, number>();

/** Gives an element a box (the page has no layout here). */
function put(selector: string, box: Box, root: ParentNode = document, nth = 0): Element {
  const el = root.querySelectorAll(selector)[nth];
  if (!el) throw new Error(`the fixture has no ${selector}`);
  const full = { left: 0, top: 0, width: 0, height: 0, ...box };
  boxes.set(el, full);
  (el as HTMLElement).getBoundingClientRect = () => ({ ...full, right: full.left + full.width, bottom: full.top + full.height, x: full.left, y: full.top, toJSON: () => ({}) }) as DOMRect;
  return el;
}

/** The right end of an element's drawn text. */
function textEnd(selector: string, right: number, root: ParentNode = document, nth = 0): void {
  texts.set(root.querySelectorAll(selector)[nth], right);
}

// happy-dom keeps no value for a custom property once removeProperty has run on it, so the app's
// published height is set and cleared through the style attribute.
const noStack = () => document.documentElement.removeAttribute("style");

const SLIDER_AS_DRAWN ='[role="slider"][aria-label="Playhead position"]';
const BAR_AS_DRAWN = '[data-eyes="TIMELINE-ROOT"]';

/**
 * One page with every part the readers read, in the order the app draws them. The lane k1 is open
 * (it has its plot); the lane k2 is folded (a group with a small version in it).
 */
function page(): void {
  document.body.innerHTML = `
    <div data-testid="globe-map" data-selected-point="320,410"></div>
    <aside aria-label="Inspector"></aside>
    <aside id="log"></aside>
    <div data-map-credit></div>
    <div data-eyes="TIMELINE-ROOT">
      <button type="button" data-bar-fold aria-expanded="true" aria-controls="body"></button>
      <div id="body">
        <div role="slider" aria-label="Playhead position" aria-valuenow="1000"></div>
        <div data-track-rows>
          <div data-track-header><button type="button" aria-expanded="true" aria-controls="rows-list">Merchant</button></div>
          <div id="rows-list" role="tree"><div data-track-row><div data-track-plot></div></div></div>
        </div>
        <div data-magnitude-lane="k1" role="group">
          <!-- tabindex="0": the app draws none; a button in a browser has tabIndex 0 and happy-dom's reads -1, so the fixture stands it in -->
          <button type="button" tabindex="0" aria-expanded="true" aria-controls="plot-k1">
            <span data-magnitude-node>Node</span><span data-magnitude-label>Qty</span><span data-magnitude-unit>U</span>
          </button>
          <div id="plot-k1" data-magnitude-plot>
            <div data-lane-figure="k1" data-lane-figure-value="7"></div>
            <div data-bar-piece id="bar-in"></div>
            <div data-bar-piece id="bar-out"></div>
          </div>
          <div data-lane-lines="k1">
            <button type="button" data-lane-lines-toggle aria-expanded="true" aria-controls="lines-k1"></button>
            <div id="lines-k1">
              <div data-lane-line-row="a"><div data-lane-line-plot><div data-line-piece id="piece-in"></div><div data-line-piece id="piece-out"></div></div></div>
              <div data-lane-line-row="b"><div data-lane-line-plot></div></div>
            </div>
          </div>
        </div>
        <div data-magnitude-lane="k2" role="group">
          <div data-lane-small="k2">
            <div>
              <button type="button" data-lane-small-name aria-expanded="false" aria-controls="plot-k2">
                <span aria-hidden="true" style="padding-right:0px;border-right-width:0px">&#9656;</span><span id="k2-name" style="padding-right:0px;border-right-width:0px">Second</span><span data-lane-small-words style="padding-right:0px;border-right-width:0px">It is folded.</span>
              </button>
              <div data-lane-small-range style="padding-right:0px;border-right-width:0px">U / 1H</div>
            </div>
            <div id="plot-k2" data-lane-small-plot><div data-lane-figure="k2" data-lane-figure-value="5"></div></div>
          </div>
        </div>
        <div data-kinds-fold-host>
          <button type="button" data-kinds-fold aria-expanded="true" aria-controls="kind-lines"></button>
          <div id="kind-lines">
            <div data-kind-line="x"><div data-kind-plot></div></div>
            <div data-kind-line="y"><div data-kind-plot></div></div>
          </div>
        </div>
        <div data-rows-small="rows">
          <div>
            <button type="button" data-small-open aria-expanded="false">
              <span aria-hidden="true">&#9656;</span><span id="rows-name">Merchant</span><span id="rows-count" aria-hidden="true" style="padding-right:0px;border-right-width:0px"> 3</span>
            </button>
            <div data-small-label style="padding-right:12px;border-right-width:0px">0 to 5</div>
          </div>
          <div data-small-plot><div data-small-count-figure></div></div>
        </div>
        <div data-stack-lines>
          <div data-lane-small="k3">
            <div>
              <button type="button" data-lane-small-name aria-expanded="false"><span aria-hidden="true" style="padding-right:0px;border-right-width:0px">&#9656;</span><span id="k3-words" data-lane-small-words style="padding-right:0px;border-right-width:0px">It is folded.</span><span id="k3-name" style="padding-right:0px;border-right-width:0px">Third</span></button>
              <div data-lane-small-range style="padding-right:0px;border-right-width:0px">U</div>
            </div>
            <div data-lane-small-plot></div>
          </div>
        </div>
        <div data-case-strip></div>
        <div data-timeline-axis></div>
      </div>
    </div>`;
  document.documentElement.setAttribute("style", "--bottom-stack-h: 320px");
  // The boxes. The track starts at 100 and is 400 wide; every plot of the bar lines up with it.
  put(SLIDER_AS_DRAWN, { left: 100, width: 400, height: 32 });
  put("[data-eyes]", { left: 0, top: 500, width: 1440, height: 380 });
  put("[data-track-plot]", { left: 100, width: 400 });
  put("[data-magnitude-lane=k1]", { height: 120 });
  put("[data-magnitude-lane=k2]", { height: 49 });
  put("[data-magnitude-plot]", { left: 100, top: 100, width: 400, height: 24 });
  put("#bar-in", { top: 104, height: 10 });
  put("#bar-out", { top: 90, height: 10 });
  for (const [i, line] of ["[data-lane-line-plot]", "[data-kind-plot]"].entries()) {
    const n = document.querySelectorAll(line).length;
    for (let k = 0; k < n; k++) put(line, { left: 100, top: 200 + 30 * (i + k), width: 400, height: 24 }, document, k);
  }
  put("#piece-in", { top: 204, height: 10 });
  put("#piece-out", { top: 190, height: 10 });
  put("[data-lane-small=k2] [data-lane-small-plot]", { left: 100, width: 400 });
  put("#k2-name", { left: 0, width: 90 });
  textEnd("#k2-name", 80);
  put("[data-lane-small=k2] [data-lane-small-range]", { left: 0, width: 95 });
  textEnd("[data-lane-small=k2] [data-lane-small-range]", 70);
  put("[data-lane-small=k3] [data-lane-small-plot]", { left: 100, width: 400 });
  // The name's text runs to 84 in a box that ends at 82: the box is the nearer end.
  put("#k3-name", { left: 0, width: 82 });
  textEnd("#k3-name", 84);
  // The screen-reader words come before the name here and end nearer the plot: a name taken from them would read a gap of 5.
  put("#k3-words", { left: 0, width: 99 });
  textEnd("#k3-words", 95);
  put("[data-lane-small=k3] [data-lane-small-range]", { left: 0, width: 95 });
  textEnd("[data-lane-small=k3] [data-lane-small-range]", 90);
  put("[data-small-plot]", { left: 100, width: 400 });
  put("[data-small-label]", { left: 0, width: 100 });
  textEnd("[data-small-label]", 60);
  put("#rows-count", { left: 0, width: 95 });
  textEnd("#rows-count", 70);
  // happy-dom does not match `:scope > ...`: the one selector the rows' reader asks it for is answered here.
  const open = document.querySelector("[data-small-open]") as HTMLElement;
  const ask = open.querySelector.bind(open);
  open.querySelector = ((selector: string) => (selector === ":scope > span:last-child" ? open.lastElementChild : ask(selector))) as typeof open.querySelector;
  put("[data-case-strip]", { left: 100, width: 400 });
  put("[data-testid=globe-map]", { width: 1440, height: 900 });
  put("aside[aria-label=Inspector]", { left: 1100, top: 80, width: 330, height: 400 });
  put("#log", { left: 10, top: 80, width: 300, height: 200 });
  put("[data-map-credit]", { left: 1300, top: 880, width: 130, height: 12 });
}

// The label a reader measures is the element holding the text, and its text range is the node's contents.
const realRange = document.createRange.bind(document);
beforeEach(() => {
  boxes.clear();
  texts.clear();
  document.createRange = (() => {
    let held: Element | null = null;
    return {
      selectNodeContents: (el: Element) => {
        held = el;
      },
      getBoundingClientRect: () => ({ right: held ? (texts.get(held) ?? 0) : 0 }) as DOMRect,
    };
  }) as unknown as typeof document.createRange;
  page();
});
afterEach(() => {
  document.createRange = realRange;
  document.body.innerHTML = "";
  noStack();
});

describe("the names the crawl holds for the page", () => {
  it("holds the bar and the slider as the shell draws them", () => {
    expect(BAR).toBe(BAR_AS_DRAWN);
    expect(SLIDER).toBe(SLIDER_AS_DRAWN);
    const drawn = codeOf(shellSource);
    expect(holdsToken(drawn, 'data-eyes="TIMELINE-ROOT"')).toBe(true);
    expect(holdsToken(drawn, 'role="slider"')).toBe(true);
    expect(holdsToken(drawn, 'ariaLabel = "Playhead position"')).toBe(true);
    expect(document.querySelectorAll(BAR)).toHaveLength(1);
    expect(document.querySelectorAll(SLIDER)).toHaveLength(1);
  });

  it("holds the Timeline's fold button as the bar draws it, and finds it once in the fixture", () => {
    expect(FOLD_BUTTON).toBe("[data-bar-fold]");
    expect(holdsToken(codeOf(barFoldSource), "data-bar-fold")).toBe(true);
    expect(document.querySelectorAll(FOLD_BUTTON)).toHaveLength(1);
  });

  it("leaves no second copy of either in the crawl", () => {
    const code = codeOf(crawlSource);
    expect(code).not.toMatch(/const BAR =/);
    expect(code).not.toMatch(/const SLIDER =/);
    expect(code).toMatch(/import \{[^}]*\bBAR\b[^}]*\} from '\.\/bar-read\.mjs'/);
    expect(code).toMatch(/import \{[^}]*\bSLIDER\b[^}]*\} from '\.\/bar-read\.mjs'/);
  });
});

describe("readControls", () => {
  it("counts every aria-controls on the bar and names the ids that name no element", () => {
    document.getElementById("kind-lines")?.remove();
    // body, rows-list, plot-k1, lines-k1, plot-k2 (kind-lines is gone); the kinds fold's id is missing.
    const got = readControls({ bar: BAR_AS_DRAWN });
    expect(got.total).toBe(6);
    expect(got.missing).toEqual(["kind-lines"]);
  });

  it("gives nothing for a bar that is not on the page", () => {
    expect(readControls({ bar: '[data-eyes="NOT-THERE"]' })).toEqual({ total: 0, missing: [] });
  });
});

describe("readLane", () => {
  const read = () => readLane({ id: "k1", slider: SLIDER_AS_DRAWN });

  it("gives the labels, the number at the line, the boxes, the order and the button's reach for an open lane", () => {
    expect(read()).toEqual({
      present: true,
      nodeLabel: "Node",
      label: "Qty",
      unit: "U",
      readout: { at: 1000, empty: false, value: 7 },
      plot: { left: 100, width: 400 },
      track: { left: 100, width: 400 },
      rowsPlot: { left: 100, width: 400 },
      barsOutside: 1,
      order: "track,rows,lane,axis",
      tabIndex: 0,
      focused: true,
    });
  });

  it("reads an empty readout when no figure stands in the plot, and no readout when neither plot nor slider is there", () => {
    document.querySelector("[data-lane-figure=k1]")?.remove();
    expect(read().readout).toEqual({ at: 1000, empty: true, value: null });
    document.querySelector("[data-magnitude-plot]")?.remove();
    document.querySelector(SLIDER_AS_DRAWN)?.removeAttribute("aria-valuenow");
    expect(read().readout).toBeNull();
  });

  it("reads null for each part a page does not draw", () => {
    document.querySelector("[data-magnitude-plot]")?.remove();
    document.querySelector("[data-timeline-axis]")?.remove();
    const got = read();
    expect(got.plot).toBeNull();
    expect(got.barsOutside).toBeNull();
    expect(got.order).toBeNull();
    expect(readLane({ id: "nobody", slider: SLIDER_AS_DRAWN })).toMatchObject({ present: false, nodeLabel: null, label: null, unit: null, tabIndex: null, focused: null });
  });

  it("leaves the rows out of the order when the page draws none", () => {
    document.querySelector("[data-track-rows]")?.remove();
    expect(read().order).toBe("track,lane,axis");
  });
});

describe("readFold", () => {
  it("gives the open lane's state, its height and the stack's height", () => {
    expect(readFold({ id: "k1" })).toEqual({ expanded: true, plotHidden: false, small: false, height: 120, stack: 320 });
  });

  it("says the plot is not drawn when it is hidden, and when the small version's plot stands in its place", () => {
    (document.querySelector("[data-magnitude-plot]") as HTMLElement).hidden = true;
    expect(readFold({ id: "k1" }).plotHidden).toBe(true);
    // The folded lane's one button is its small version's name, and reads as folded.
    expect(readFold({ id: "k2" })).toEqual({ expanded: false, plotHidden: true, small: true, height: 49, stack: 320 });
  });

  it("reads null for a lane that is not there, and for a stack that is not a number", () => {
    noStack();
    expect(readFold({ id: "nobody" })).toEqual({ expanded: null, plotHidden: null, small: null, height: null, stack: null });
    expect(readFold({ id: "k1" }).stack).toBeNull();
  });

  it("reads an open lane that holds a plot and no small version as shown, and a lane with neither as unknown", () => {
    document.querySelector("[data-magnitude-lane=k2] [data-lane-small-plot]")?.remove();
    expect(readFold({ id: "k2" })).toMatchObject({ plotHidden: null, small: false });
  });
});

describe("readSmalls", () => {
  const read = (scope?: string) => readSmalls({ slider: SLIDER_AS_DRAWN, ...(scope ? { scope } : {}) });

  it("gives each lane's small version in document order, with its plot, its gap and the number at the line", () => {
    const got = read();
    expect(got.lanes.map((l: { id: string }) => l.id)).toEqual(["k2", "k3"]);
    // k2: the name ends at 80 and the range at 70; the plot starts at 100, so the nearer end gives 20.
    expect(got.lanes[0]).toEqual({ id: "k2", drawn: true, plot: { left: 100, width: 400 }, gap: 20, readout: { at: 1000, empty: false, value: 5 } });
    // k3: the name ends at 84 (box 90 less 8 of padding is 82, the nearer), the range at 60.
    expect(got.lanes[1]).toEqual({ id: "k3", drawn: true, plot: { left: 100, width: 400 }, gap: 10, readout: { at: 1000, empty: true, value: null } });
  });

  it("gives the rows' small version: after the rows, the header's state, the plot, the gap and the count's figure", () => {
    const got = read();
    // The label ends at 60, and its box (100 wide) less 12 of padding is 88; the count's span ends at 70 within a box of 95 less 8.
    expect(got.rows).toEqual({ drawn: true, after: true, expanded: true, plot: { left: 100, width: 400 }, track: { left: 100, width: 400 }, gap: 30, figure: true });
  });

  it("gives the Timeline strip, and whether the line for each section is drawn", () => {
    const got = read();
    expect(got.strip).toEqual({ left: 100, width: 400 });
    expect(got.stackDrawn).toBe(true);
    document.querySelector("[data-stack-lines]")?.remove();
    document.querySelector("[data-case-strip]")?.remove();
    expect(read()).toMatchObject({ strip: null, stackDrawn: false });
  });

  it("reads only inside the scope it is given", () => {
    const got = read("[data-stack-lines]");
    expect(got.lanes.map((l: { id: string }) => l.id)).toEqual(["k3"]);
    expect(got.rows).toBeNull();
  });

  it("reads a small version with no plot as not drawn, and the rows' small version without its figure as having none", () => {
    document.querySelector("[data-lane-small=k2] [data-lane-small-plot]")?.remove();
    document.querySelector("[data-small-count-figure]")?.remove();
    const got = read();
    expect(got.lanes[0]).toMatchObject({ id: "k2", drawn: false, plot: null, gap: null, readout: null });
    expect(got.rows).toMatchObject({ drawn: true, figure: false });
    document.querySelector("[data-small-plot]")?.remove();
    expect(read().rows).toMatchObject({ drawn: false, plot: null, gap: null });
  });

  it("reads a name from the first span that is not hidden and not the screen-reader words", () => {
    // The hidden mark comes first and the words last, so a name read from either would end at 0, not at 80.
    const got = read();
    expect(got.lanes[0].gap).toBe(20);
    document.querySelector("[data-lane-small=k2] [data-lane-small-range]")?.remove();
    expect(read().lanes[0].gap).toBe(20);
  });

  it("puts the rows' small version before the rows when the page draws it so", () => {
    const rows = document.querySelector("[data-track-rows]")!;
    document.body.append(rows);
    expect(read().rows).toMatchObject({ after: false });
  });
});

describe("readHeights", () => {
  it("gives the bar's panel height, the stack's height, whether the line for each section is gone, and how many small versions are left", () => {
    expect(readHeights({ bar: BAR_AS_DRAWN })).toEqual({ panel: 380, stack: 320, stackGone: false, smalls: 3 });
  });

  it("says the stack is gone when its element is, and reads null for a bar or a height that is not there", () => {
    document.querySelector("[data-stack-lines]")?.remove();
    noStack();
    expect(readHeights({ bar: BAR_AS_DRAWN })).toEqual({ panel: 380, stack: null, stackGone: true, smalls: 2 });
    expect(readHeights({ bar: '[data-eyes="NOT-THERE"]' })).toEqual({ panel: null, stack: null, stackGone: true, smalls: null });
  });
});

describe("readDepth", () => {
  const read = (options: string[]) => readDepth({ slider: SLIDER_AS_DRAWN, options });

  it("reads each option's control as open, counts the lines, finds each plot on the track and counts the pieces outside their plot", () => {
    expect(read(["lane:k1", "kinds"])).toEqual({ opened: true, lines: 4, aligned: true, outside: 1 });
  });

  it("reads one option alone", () => {
    expect(read(["lane:k1"])).toEqual({ opened: true, lines: 2, aligned: true, outside: 1 });
    expect(read(["kinds"])).toEqual({ opened: true, lines: 2, aligned: true, outside: 0 });
  });

  it("reads a depth that is not open, one with no control, and a plot that is off the track", () => {
    document.querySelector("[data-lane-lines-toggle]")?.setAttribute("aria-expanded", "false");
    expect(read(["lane:k1"]).opened).toBe(false);
    document.querySelector("[data-kinds-fold]")?.remove();
    expect(read(["kinds"]).opened).toBe(false);
    put("[data-kind-plot]", { left: 140, width: 400 });
    expect(read(["kinds"]).aligned).toBe(false);
    expect(read(["lane:nobody"])).toEqual({ opened: false, lines: 0, aligned: true, outside: 0 });
  });
});

describe("readBar", () => {
  it("gives the boxes of the bar, the Inspector, the log and the credit, and the selected marker's point", () => {
    expect(readBar({ bar: BAR_AS_DRAWN })).toEqual({
      bar: { left: 0, top: 500, right: 1440, bottom: 880 },
      inspector: { left: 1100, top: 80, right: 1430, bottom: 480 },
      logs: [{ left: 10, top: 80, right: 310, bottom: 280 }],
      marker: { x: 320, y: 410 },
      credit: { left: 1300, top: 880, right: 1430, bottom: 892 },
    });
  });

  it("reads no marker when the map writes no point, and null for a part that is not there", () => {
    document.querySelector("[data-testid=globe-map]")?.removeAttribute("data-selected-point");
    document.querySelector("[data-map-credit]")?.remove();
    document.querySelector("aside[aria-label=Inspector]")?.remove();
    const got = readBar({ bar: BAR_AS_DRAWN });
    expect(got.marker).toBeNull();
    expect(got.credit).toBeNull();
    expect(got.inspector).toBeNull();
  });
});

describe("stackFact", () => {
  it("gathers the small versions into the fact of the line for each section", () => {
    const smalls = readSmalls({ slider: SLIDER_AS_DRAWN, scope: "[data-stack-lines]" });
    const fact = stackFact(smalls, 380, { stackGone: true, smalls: 0, panel: 44 });
    expect(fact.drawn).toBe(true);
    expect(fact.rows).toBe(0);
    expect(fact.lanes).toEqual(["k3"]);
    expect(fact.oneLine).toEqual({ stackGone: true, smalls: 0, panel: 44, stackPanel: 380 });
  });
});

/** Every attribute name and custom property a reader holds, as the text of its source gives them. */
const NAME = /(?:data|aria)-[a-z-]+|--[a-z-]+/g;
const readers = { readBar, readControls, readDepth, readFold, readHeights, readLane, readSmalls } as const;
type Reader = (arg: never) => unknown;
/** Each reading is a call of the reader on the page, which may first change the page. */
const calls: Record<keyof typeof readers, Array<(fn: Reader) => unknown>> = {
  readBar: [(fn) => fn({ bar: BAR_AS_DRAWN } as never)],
  readControls: [(fn) => fn({ bar: BAR_AS_DRAWN } as never)],
  readDepth: [
    (fn) => fn({ slider: SLIDER_AS_DRAWN, options: ["lane:k1", "kinds"] } as never),
    (fn) => fn({ slider: SLIDER_AS_DRAWN, options: ["lane:k1"] } as never),
  ],
  readFold: [(fn) => fn({ id: "k1" } as never), (fn) => fn({ id: "k2" } as never)],
  readHeights: [(fn) => fn({ bar: BAR_AS_DRAWN } as never)],
  readLane: [(fn) => fn({ id: "k1", slider: SLIDER_AS_DRAWN } as never), (fn) => fn({ id: "k2", slider: SLIDER_AS_DRAWN } as never)],
  readSmalls: [
    (fn) => fn({ slider: SLIDER_AS_DRAWN } as never),
    (fn) => fn({ slider: SLIDER_AS_DRAWN, scope: "[data-stack-lines]" } as never),
    // The rows' label ends nearer the plot than the count of the open button does, so the label sets the gap.
    (fn) => {
      textEnd("[data-small-label]", 75);
      try {
        return fn({ slider: SLIDER_AS_DRAWN } as never);
      } finally {
        textEnd("[data-small-label]", 60);
      }
    },
  ],
};

describe("a name a reader holds that the page does not draw", () => {
  const run = (fn: Reader, reader: keyof typeof readers) => JSON.stringify(calls[reader].map((call) => call(fn)));
  const mutate = (fn: (arg: never) => unknown, name: string) => {
    const changed = fn.toString().replace(new RegExp(`(?<![\\w-])${name}(?![\\w-])`, "g"), `${name}-not-drawn`);
    return new Function(`return ${changed}`)() as (arg: never) => unknown;
  };

  for (const [reader, fn] of Object.entries(readers)) {
    const names = [...new Set(fn.toString().match(NAME) ?? [])];
    it(`gives a different reading from ${reader} for each of its ${names.length} names changed`, () => {
      const key = reader as keyof typeof readers;
      const same = run(fn, key);
      // The copy of the source reads the page as the reader does: no name changed gives the same reading.
      expect(run(mutate(fn, "no-such-name"), key)).toBe(same);
      const survivors = names.filter((name) => run(mutate(fn, name), key) === same);
      expect(survivors).toEqual([]);
    });
  }

  it("reads the stack's height from --bottom-stack-h alone, in readHeights and in readFold", () => {
    expect(readHeights.toString().match(/--bottom-stack-h/g)).toHaveLength(1);
    expect(readFold.toString().match(/--bottom-stack-h/g)).toHaveLength(1);
  });
});

describe("each name the readers hold, against the component that draws it", () => {
  const sources: Record<string, string> = {
    "data-eyes": shellSource,
    "data-timeline-axis": shellSource,
    "data-stack-lines": shellSource,
    "aria-valuenow": shellSource,
    "data-case-strip": caseStripSource,
    "data-bar-fold": barFoldSource,
    "data-magnitude-lane": magnitudeSource,
    "data-magnitude-node": magnitudeSource,
    "data-magnitude-label": magnitudeSource,
    "data-magnitude-unit": magnitudeSource,
    "data-magnitude-plot": magnitudeSource,
    "data-bar-piece": magnitudeSource,
    "data-lane-figure": laneFigureSource,
    "data-lane-figure-value": laneFigureSource,
    "data-lane-small": laneSmallSource,
    "data-lane-small-name": laneSmallSource,
    "data-lane-small-words": laneSmallSource,
    "data-lane-small-range": laneSmallSource,
    "data-lane-small-plot": laneSmallSource,
    "data-rows-small": rowsSmallSource,
    "data-small-open": rowsSmallSource,
    "data-small-label": rowsSmallSource,
    "data-small-plot": rowsSmallSource,
    "data-small-count-figure": rowsSmallSource,
    "data-track-rows": trackRowsSource,
    "data-track-plot": trackRowsSource,
    "data-track-header": trackHeaderSource,
    "data-lane-lines-toggle": laneLinesSource,
    "data-lane-line-row": laneLinesSource,
    "data-lane-line-plot": laneLinesSource,
    "data-line-piece": laneLinesSource,
    "data-kinds-fold": kindLinesSource,
    "data-kind-line": kindLinesSource,
    "data-kind-plot": kindLinesSource,
    "data-testid": globeSource,
    "data-selected-point": globeSource,
    "data-map-credit": creditSource,
    "aria-controls": barFoldSource,
    "aria-hidden": rowsSmallSource,
    "aria-label": inspectorSource,
    "aria-expanded": barFoldSource,
    "--bottom-stack-h": appSource,
  };
  const held = [...new Set(Object.values(readers).flatMap((fn) => fn.toString().match(NAME) ?? []))].sort();

  it("has a component for every name a reader holds", () => {
    expect(held.filter((n) => !(n in sources))).toEqual([]);
  });

  it.each(Object.entries(sources))("draws %s, on a code line and as a whole name", (name, source) => {
    expect(holdsToken(codeOf(source), name)).toBe(true);
  });

  it("draws the Inspector's label, and the globe's test id, as the readers ask for them", () => {
    expect(holdsToken(codeOf(inspectorSource), 'aria-label="Inspector"')).toBe(true);
    expect(holdsToken(codeOf(globeSource), 'data-testid="globe-map"')).toBe(true);
  });

  it("does not take a name from a comment: data-magnitude-plot in LaneSmall.tsx is a comment only", () => {
    expect(holdsToken(laneSmallSource, "data-magnitude-plot")).toBe(true);
    expect(holdsToken(codeOf(laneSmallSource), "data-magnitude-plot")).toBe(false);
    expect(holdsToken(codeOf("<div data-lane-small-plot />"), "data-lane-small")).toBe(false);
  });

  it("holds no name of its own: the readers' header comment names the same, and a pin on it would pass for a wrong name", () => {
    expect(codeOf(readSource).length).toBeLessThan(readSource.length);
  });
});
