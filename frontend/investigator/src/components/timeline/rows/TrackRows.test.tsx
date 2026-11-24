/**
 * The rows under the track. Every fixture is written here: a pack with a grouping field, a name
 * field, a member field, one kind of bars, and rows of one event, of several, and of none.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { manifestRowToEntity } from "../../../lib/adapters/manifest-row";
import { caseStepEvents } from "../../../lib/case-events";
import { GUTTER, OPEN } from "../../../lib/bar-metrics";
import { nameChars, rowListHeight, rowTicks, type RowTick } from "../../../lib/row-ticks";
import type { Entity } from "../../../lib/entity";
import type { ScenarioFieldWords, ScenarioNode, ScenarioRows } from "../../../lib/scenarios";
import { buildTracks, type TrackSet } from "../../../lib/tracks";
import { makeProjector } from "../../../lib/timeline-projector";
import { COLOR_MODES, THEMES } from "../../../theme/axes";
import { contrastRatio } from "../../../theme/legibility";
import { resolvePalette } from "../../../theme/resolve";
import { hexToRgb01 } from "../../../theme/to-rgb";
import { useClockForm } from "../../../store/clock-form";
import { usePlayhead } from "../../../store/playhead";
import { useTheme } from "../../../store/theme";
import { RowDot } from "./RowDot";
import { RowFigures } from "./RowFigures";
import { TrackRows } from "./TrackRows";

// A counting stand-in for the row's dot and bars: it draws the real ones and counts its own renders.
const renders = vi.hoisted(() => ({ dots: 0, bars: 0 }));
vi.mock("./RowDot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./RowDot")>();
  return {
    ...actual,
    RowDot: (props: Parameters<typeof actual.RowDot>[0]) => {
      renders.dots += 1;
      return actual.RowDot(props);
    },
    RowBars: (props: Parameters<typeof actual.RowBars>[0]) => {
      renders.bars += 1;
      return actual.RowBars(props);
    },
  };
});

const HOUR = 3_600_000;
const T0 = Date.parse("2026-06-08T09:00:00-05:00");
const BAR = T0 + 2 * HOUR;
const iso = (hours: number): string => new Date(T0 + hours * HOUR).toISOString();
const project = makeProjector(T0, T0 + 10 * HOUR);
const slot = { project, onPlotMouseDown: () => {} };

const node = (kind: string, label: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind, label, palette: "#ff8800", source: "json", coords: null, timestamp: "at", primary: "${id}", ...extra,
});
const nodes: ScenarioNode[] = [
  node("stop", "Stop"),
  node("visit", "Visit"),
  node("load", "Load", { palette: "#2d7ff9", magnitude: "weight", magnitudeLabel: "Weight", magnitudeUnit: "kg" }),
];
const rowsDecl: ScenarioRows = { by: "team_id", name: "team_name", member: "bay_id" };
const fields: Record<string, ScenarioFieldWords> = { team_id: { label: "Squad" }, bay_id: { label: "Bay" } };

let seq = 0;
const stop = (team: string | null, hours: number, name = team ? `Team ${team}` : ""): Entity =>
  manifestRowToEntity(nodes[0], { id: `s${++seq}`, at: iso(hours), team_id: team, team_name: name });
const visit = (hours: number): Entity => manifestRowToEntity(nodes[1], { id: `v${++seq}`, at: iso(hours), team_id: null });
const load = (team: string, hours: number, weight: number, bay: string): Entity =>
  manifestRowToEntity(nodes[2], { id: `w${++seq}`, at: iso(hours), team_id: team, bay_id: bay, weight });

// Squad a: three events, bars of 216 on bay x and 4 on bay y in hour 2; b: two events, a bar in hour 3; c: one; one rest row.
const small = (): Entity[] => [
  stop("a", 1), stop("a", 2), stop("a", 3), stop("b", 1), stop("b", 4), stop("c", 5), visit(6),
  load("a", 2, 216, "x"), load("a", 2, 4, "y"), load("b", 3, 10, "x"),
];

let ticks: RowTick[] = [];
/** The rows of a case, and the dots that belong to them. */
function make(entities: Entity[] = small()): TrackSet {
  const events = caseStepEvents({ transactions: [], logins: [], accountEvents: [], transfers: [], entities }, nodes);
  ticks = rowTicks(events);
  const set = buildTracks({ events, entities, nodes, rows: rowsDecl, fields });
  if (!set) throw new Error("expected rows");
  return set;
}

type Props = Partial<React.ComponentProps<typeof TrackRows>>;
function view(set: TrackSet, over: Props = {}) {
  const props: React.ComponentProps<typeof TrackRows> = {
    set, ticks, slot, grids: [{ step: HOUR, firstBucketStart: T0 }], mirror: true, prominence: 0.5,
    paint: (k) => `rgb(var(--${k}-rgb))`, onPanel: (k) => `var(--${k}-on-panel)`, kindFor: (k) => k, kindLabel: (k) => k,
    open: true, onToggle: () => {}, onActivate: () => {}, listId: "rows-list", soloKey: null, onSolo: () => {}, plotPx: 1000,
    ...over,
  };
  const result = render(<TrackRows {...props} />);
  return { ...result, rerenderWith: (next: Props) => result.rerender(<TrackRows {...props} {...next} />) };
}

/** Whether a keyboard reaches it: a native button without a negative tabindex, or a positive-or-zero tabindex. */
const reachable = (el: HTMLElement): boolean => (el.hasAttribute("tabindex") ? Number(el.getAttribute("tabindex")) >= 0 : /^(BUTTON|A|INPUT)$/.test(el.tagName));
const tabbable = (root: Element | null): HTMLElement[] =>
  [...(root?.querySelectorAll<HTMLElement>("button, [tabindex], a[href], input") ?? [])].filter(
    (el) => reachable(el) && !el.closest("[aria-hidden='true']") && !el.closest("[hidden]"),
  );
const tree = (c: ParentNode): HTMLElement => c.querySelector("[role='tree']") as HTMLElement;
const stopOf = (c: ParentNode, name: string): HTMLElement =>
  [...c.querySelectorAll<HTMLElement>("[data-stop]")].find((el) => el.getAttribute("aria-label") === name) as HTMLElement;
const namesOf = (c: ParentNode): string[] => [...c.querySelectorAll("[data-track-name]")].map((el) => el.getAttribute("aria-label") ?? "");

beforeEach(() => {
  renders.dots = 0;
  renders.bars = 0;
  seq = 0;
  usePlayhead.setState({ playhead: BAR + 0.25 * HOUR });
  useClockForm.getState().set(false);
  useTheme.setState({ theme: "dark", color: "neon" });
});

describe("the rows' list", () => {
  it("puts the busiest row first and the rest rows under the list, outside its scroller", () => {
    const { container } = view(make());
    expect(namesOf(container)).toEqual(["Team a", "Team b", "Team c", "Visit"]);
    const scroller = container.querySelector("[data-track-scroller]") as HTMLElement;
    expect(scroller.contains(stopOf(container, "Team c"))).toBe(true);
    expect(scroller.contains(stopOf(container, "Visit"))).toBe(false);
    expect(container.querySelector("[data-track-rest]")?.contains(stopOf(container, "Visit"))).toBe(true);
  });

  it("holds exactly one Tab stop in the list: closed, with a row open, soloed, and after the rows change", () => {
    const { container, rerenderWith } = view(make());
    expect(tabbable(tree(container))).toHaveLength(1);
    const a = stopOf(container, "Team a");
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(a.getAttribute("aria-expanded")).toBe("true");
    expect(tabbable(tree(container))).toHaveLength(1);
    rerenderWith({ soloKey: "v:a" });
    expect(tabbable(tree(container))).toHaveLength(1);
    // The row that held the stop leaves with the next set: the stop moves to the first row.
    rerenderWith({ set: make([stop("z", 1), stop("y", 2), stop("y", 3)]), ticks, soloKey: null });
    const stops = tabbable(tree(container));
    expect(stops).toHaveLength(1);
    expect(stops[0].getAttribute("aria-label")).toBe("Team y");
  });

  it("moves the stop with the arrow keys, Home and End", () => {
    const { container } = view(make());
    const a = stopOf(container, "Team a");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowDown" });
    expect(document.activeElement).toBe(stopOf(container, "Team b"));
    expect(tabbable(tree(container))).toEqual([stopOf(container, "Team b")]);
    fireEvent.keyDown(document.activeElement as Element, { key: "End" });
    expect(document.activeElement).toBe(stopOf(container, "Visit"));
    fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
    expect(document.activeElement).toBe(a);
  });

  it("puts the focused row alone on Enter or Space and takes it back the same way, and not a rest row", () => {
    const onSolo = vi.fn();
    const { container } = view(make(), { onSolo });
    const a = stopOf(container, "Team a");
    fireEvent.keyDown(a, { key: "Enter" });
    fireEvent.keyDown(a, { key: " " });
    expect(onSolo).toHaveBeenNthCalledWith(1, "v:a");
    expect(onSolo).toHaveBeenNthCalledWith(2, "v:a");
    fireEvent.keyDown(stopOf(container, "Visit"), { key: "Enter" });
    expect(onSolo).toHaveBeenCalledTimes(2);
    fireEvent.click(stopOf(container, "Team b"));
    expect(onSolo).toHaveBeenLastCalledWith("v:b");
  });

  it("opens a row into its lines with the right key and folds them with the left key, as a tree view does", () => {
    const { container } = view(make());
    const a = stopOf(container, "Team a");
    expect(a.getAttribute("aria-expanded")).toBe("false");
    expect(stopOf(container, "Team c").hasAttribute("aria-expanded")).toBe(false);
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(a.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(a);
    expect(stopOf(container, "Bay 1")).toBeTruthy();
    expect(stopOf(container, "Bay 2")).toBeTruthy();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(document.activeElement).toBe(stopOf(container, "Bay 1"));
    expect(tabbable(tree(container))).toEqual([stopOf(container, "Bay 1")]);
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(a.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[data-row-lines]")).toBeNull();
  });

  it("puts a line's member value in its words, and leaves the triangle and every copy out of the Tab order", () => {
    const { container } = view(make());
    fireEvent.click(container.querySelector("[data-row-open]") as HTMLElement);
    expect(stopOf(container, "Team a").getAttribute("aria-expanded")).toBe("true");
    expect(stopOf(container, "Bay 1").getAttribute("aria-description")).toContain("x");
    for (const el of container.querySelectorAll("[data-row-open], [data-row-dot]")) {
      expect(el.getAttribute("tabindex")).toBe("-1");
      expect(el.getAttribute("aria-hidden")).toBe("true");
    }
    expect(tabbable(tree(container))).toHaveLength(1);
  });

  it("has an original in the Tab order for every copy", () => {
    const { container } = view(make());
    const originals = render(
      <div>
        {ticks.map((t) => (
          <RowDot key={t.id} tick={t} left={10} prominence={0} mirror={false} paint={() => "x"} onPanel={() => "x"} kindFor={(k) => k} kindLabel={(k) => k} selectedSessionId={null} form="12h" onActivate={() => {}} />
        ))}
      </div>,
    ).container;
    const copies = [...container.querySelectorAll<HTMLElement>("[data-row-dot]")];
    expect(copies).toHaveLength(ticks.length);
    for (const copy of copies) {
      const brief = copy.getAttribute("data-tip-node");
      const original = [...originals.querySelectorAll<HTMLElement>("[data-row-dot]")].find((o) => o.getAttribute("data-tip-node") === brief);
      expect(original, brief ?? "").toBeTruthy();
      expect(reachable(original as HTMLElement)).toBe(true);
    }
  });

  it("names the fold button with the count as words, and 1 row for a pack with one row", () => {
    const first = view(make());
    expect(first.container.querySelector("[data-track-header] button")?.getAttribute("aria-label")).toBe("Squad: 3 rows");
    first.unmount();
    const one = view(make([stop("a", 1)]));
    expect(one.container.querySelector("[data-track-header] button")?.getAttribute("aria-label")).toBe("Squad: 1 row");
  });

  it("keeps a name's full text as the stop's name when the cell cuts it", () => {
    const long = "A merchant with a very long name indeed, Ltd";
    const { container } = view(make([stop("m", 1, long), stop("n", 2, "Short")]));
    const el = stopOf(container, long);
    const shown = el.querySelector("[data-name-text]");
    // No row of this pack opens, so no triangle column is kept and the name has the whole cell.
    expect(shown?.textContent?.length).toBeLessThanOrEqual(nameChars(GUTTER - 8));
    expect(shown?.textContent?.length).toBeGreaterThan(nameChars(GUTTER - 8 - OPEN));
    expect(shown?.textContent?.endsWith("…")).toBe(true);
    expect(shown?.getAttribute("aria-hidden")).toBe("true");
    expect(el.getAttribute("data-tip")).toContain(long);
  });

  it("takes its height from the share, the floor and the depth lines' px, and gives the same list at 0", () => {
    const set = make(Array.from({ length: 30 }, (_, i) => stop(`t${i}`, 1 + (i % 8))));
    const at = (depthPx: number): string => {
      const { container, unmount } = view(set, { depthPx });
      const got = (container.querySelector("[data-track-scroller]") as HTMLElement).style.maxHeight;
      unmount();
      return got;
    };
    const want = (depthPx: number): string => `${rowListHeight({ innerHeight: window.innerHeight, named: 30, rest: 0, depthPx })}px`;
    expect(at(0)).toBe(want(0));
    expect(at(90)).toBe(want(90));
    expect(Number.parseFloat(want(90))).toBeLessThan(Number.parseFloat(want(0)));
  });
});

describe("solo and the clear control", () => {
  it("lets the other rows leave the list, shows the soloed row selected and keeps one stop", () => {
    const { container } = view(make(), { soloKey: "v:a" });
    expect(namesOf(container)).toEqual(["Team a"]);
    expect(container.querySelector("[data-track-rest]")).toBeNull();
    expect(stopOf(container, "Team a").getAttribute("aria-selected")).toBe("true");
    expect(tabbable(tree(container))).toHaveLength(1);
    expect(tree(container).getAttribute("aria-label")).toBe("Squad: 3 rows"); // the list still counts every row
  });

  it("keeps a clear control on screen when the rows are open and when they are folded, named for the row", () => {
    const onSolo = vi.fn();
    const { container, rerenderWith } = view(make(), { soloKey: "v:a", onSolo });
    for (const open of [true, false]) {
      rerenderWith({ open });
      const clear = container.querySelector("[data-solo-clear]") as HTMLElement;
      expect(clear.getAttribute("aria-label")).toBe("Team a is alone. Press to show every row.");
      expect(clear.closest("[hidden]")).toBeNull();
      expect(reachable(clear)).toBe(true);
    }
    fireEvent.click(container.querySelector("[data-solo-clear]") as HTMLElement);
    expect(onSolo).toHaveBeenCalledWith("v:a");
  });

  it("clears the solo on Enter or Space on the soloed row, and shows every row again", () => {
    let soloKey: string | null = "v:a";
    let redraw: (next: Props) => void = () => {};
    const onSolo = vi.fn((key: string) => {
      soloKey = soloKey === key ? null : key; // the owner of the solo toggles it, as a parent does
      redraw({ soloKey });
    });
    const { container, rerenderWith } = view(make(), { soloKey, onSolo });
    redraw = rerenderWith;
    for (const key of ["Enter", " "]) {
      expect(namesOf(container)).toEqual(["Team a"]);
      fireEvent.keyDown(stopOf(container, "Team a"), { key });
      expect(onSolo).toHaveBeenLastCalledWith("v:a");
      expect(soloKey).toBeNull();
      expect(namesOf(container)).toEqual(["Team a", "Team b", "Team c", "Visit"]);
      expect(container.querySelector("[data-solo-clear]")).toBeNull();
      fireEvent.keyDown(stopOf(container, "Team a"), { key }); // and the same press puts it alone again
      expect(soloKey).toBe("v:a");
    }
    expect(onSolo).toHaveBeenCalledTimes(4);
  });

  it("shows no clear control when nothing is alone, and takes a folded list out of the Tab order", () => {
    const { container } = view(make(), { open: false });
    expect(container.querySelector("[data-solo-clear]")).toBeNull();
    expect(tabbable(tree(container))).toHaveLength(0);
  });
});

describe("the number at the line", () => {
  const figure = (at: number, plotPx = 1000) => {
    usePlayhead.setState({ playhead: at });
    const set = make();
    const lines = [{ key: "v:a", name: "Team a", bars: set.tracks[0].bars, top: 0, h: 24 }];
    const { container } = render(<RowFigures set={set} lines={lines} height={24} project={project} plotPx={plotPx} form="12h" />);
    return container.querySelector<HTMLElement>("[data-row-figure]");
  };

  it("reads the value of the bar whose hour holds the playhead, short, and none in an hour with no bar", () => {
    expect(figure(BAR + 0.25 * HOUR)?.textContent).toBe("220");
    expect(figure(BAR + 5 * HOUR)).toBeNull();
  });

  it("stands right of the line at a quarter of the step and left at a half and at three quarters", () => {
    expect(figure(BAR + 0.25 * HOUR)?.getAttribute("data-side")).toBe("right");
    expect(figure(BAR + 0.5 * HOUR)?.getAttribute("data-side")).toBe("left");
    expect(figure(BAR + 0.75 * HOUR)?.getAttribute("data-side")).toBe("left");
  });

  it("stands left near the plot's right end, where its measured width would pass it", () => {
    // The line stands at 22.5 percent. A 200 px plot puts it at 45 px and the number fits; a plot of
    // 30 px puts it at 6.75 px and the number's 24 px pass the end.
    expect(figure(BAR + 0.25 * HOUR, 200)?.getAttribute("data-side")).toBe("right");
    expect(figure(BAR + 0.25 * HOUR, 30)?.getAttribute("data-side")).toBe("left");
  });

  it("stands on a flat patch of the bar's surface, which holds 4.5:1 for the text in both themes and six modes", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    expect(readFileSync(resolve(here, "RowFigures.tsx"), "utf8")).toContain('backgroundColor: "rgb(var(--glass-tint))"');
    for (const theme of THEMES) {
      for (const mode of COLOR_MODES) {
        const p = resolvePalette(theme, mode);
        const surface = p.material.glassTint.split(/\s+/).map((n) => Number(n) / 255) as [number, number, number];
        expect(contrastRatio(hexToRgb01(p.neutral.text), surface), `${theme}/${mode}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("gives the focused row its number in its description and no other row's", () => {
    const { container } = view(make());
    const hour = "11:00a to 12:00p";
    const a = stopOf(container, "Team a");
    expect(a.getAttribute("aria-description")).toContain(hour);
    expect(stopOf(container, "Team b").getAttribute("aria-description")).not.toContain(hour);
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowDown" });
    expect(stopOf(container, "Team a").getAttribute("aria-description")).not.toContain(hour);
  });
});

describe("what is drawn again, and when", () => {
  it("draws no row, dot or bar again while the playhead advances 60 ticks inside one hour, across its half", () => {
    usePlayhead.setState({ playhead: BAR });
    const { container } = view(make());
    const [dots, bars] = [renders.dots, renders.bars];
    expect(dots).toBeGreaterThan(0);
    expect(bars).toBeGreaterThan(0);
    const seen = new Set<string | null | undefined>();
    for (let i = 1; i <= 60; i += 1) {
      act(() => usePlayhead.setState({ playhead: BAR + (i * HOUR * 0.98) / 60 }));
      seen.add(container.querySelector("[data-row-figure]")?.getAttribute("data-side"));
    }
    expect(renders.dots).toBe(dots);
    expect(renders.bars).toBe(bars);
    // The side is set by the head: it changed across the half hour, and no row was drawn again.
    expect(seen).toEqual(new Set(["right", "left"]));
  });
});

describe("a row's bar", () => {
  it("takes the kind's colour through the per-theme clamp and holds 3.0 on the panel in both themes and six modes", () => {
    const set = make();
    for (const theme of THEMES) {
      for (const mode of COLOR_MODES) {
        useTheme.setState({ theme, color: mode });
        const { container, unmount } = view(set);
        const fill = (container.querySelector("[data-row-bar] > div") as HTMLElement).style.backgroundColor;
        const rgb = fill.startsWith("#") ? hexToRgb01(fill) : ((fill.match(/\d+/g) ?? []).map((n) => Number(n) / 255) as [number, number, number]);
        const panel = resolvePalette(theme, mode).material.panelBase.split(/\s+/).map((n) => Number(n) / 255) as [number, number, number];
        expect(contrastRatio(rgb, panel), `${theme}/${mode}`).toBeGreaterThanOrEqual(3);
        unmount();
      }
    }
  });
});
