/**
 * `Timeline` wires the five settings. The Timeline itself mounts: the rows' small version, the
 * folded lane's small version, a line for each section on the first fold, the lane's lines and the
 * Timeline's kind lines (both closed until their triangle is pressed). The fixture pack is written
 * here, with words no pack uses.
 */
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import type { Entity } from "../../lib/entity";
import type { ScenarioNode } from "../../lib/scenarios";
import { useClockForm } from "../../store/clock-form";
import { useLayers } from "../../store/layers";
import { useNavigation } from "../../store/navigation";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useSelection } from "../../store/selection";
import { useSolo } from "../../store/solo";
import { useTrackBy } from "../../store/track-by";
import { Timeline } from "../Timeline";

// The render counters: each wraps a function that only a memoised part calls while it draws, so a
// count that does not move while the playhead ticks is a part that was not drawn again. The
// figures at the line legitimately follow the playhead and are not counted.
const counts = vi.hoisted(() => ({ bars: 0, laneLine: 0, kindLine: 0, laneSmall: 0 }));
vi.mock("../../lib/tooltip-words/rows-small", async (orig) => {
  const real = await orig<typeof import("../../lib/tooltip-words/rows-small")>();
  return { ...real, countBarWords: (...a: Parameters<typeof real.countBarWords>) => (counts.bars++, real.countBarWords(...a)) };
});
vi.mock("../../lib/tooltip-words/lane-depth", async (orig) => {
  const real = await orig<typeof import("../../lib/tooltip-words/lane-depth")>();
  return { ...real, laneLineWords: (...a: Parameters<typeof real.laneLineWords>) => (counts.laneLine++, real.laneLineWords(...a)) };
});
vi.mock("../../lib/tooltip-words/kinds", async (orig) => {
  const real = await orig<typeof import("../../lib/tooltip-words/kinds")>();
  return { ...real, kindLineWords: (...a: Parameters<typeof real.kindLineWords>) => (counts.kindLine++, real.kindLineWords(...a)) };
});
vi.mock("../../lib/tooltip-words/lane-small", async (orig) => {
  const real = await orig<typeof import("../../lib/tooltip-words/lane-small")>();
  return { ...real, laneSmallWords: (...a: Parameters<typeof real.laneSmallWords>) => (counts.laneSmall++, real.laneSmallWords(...a)) };
});

// ---- the fixture pack -----------------------------------------------------------------------------
const HOUR = 3_600_000;
const MS0 = Date.parse("2026-05-12T00:00:00-05:00");
const MS1 = Date.parse("2026-06-01T00:00:00-05:00");
const at = (h: number): string => new Date(MS0 + h * HOUR).toISOString();

const stopNode: ScenarioNode = { kind: "stop", label: "Stop", palette: "#ffb347", source: "sql", coords: null, timestamp: "at", primary: "${id}", pivotable: ["team_id"] };
const scanNode: ScenarioNode = { ...stopNode, kind: "scan", label: "Scan", palette: "#66ccff" };
const loadNode: ScenarioNode = { ...stopNode, kind: "load", label: "Load", palette: "#f5a623", magnitude: "weight", magnitudeLabel: "Weight", magnitudeUnit: "kg" };
const NODES = [stopNode, scanNode, loadNode];
const CARRIERS = ["north", "south", "west"];

/** Twelve teams, so the rows' list is longer than it can be at 900 px: each has a stop, a scan and a load. */
const makeEntities = (): Entity[] =>
  Array.from({ length: 12 }, (_, i) => {
    const team = { team_id: `t${i}`, team_name: `Team ${String(i).padStart(2, "0")}` };
    return [
      manifestRowToEntity(stopNode, { id: `s${i}`, at: at(24 + i), ...team }),
      manifestRowToEntity(scanNode, { id: `c${i}`, at: at(24 + i), ...team }),
      manifestRowToEntity(loadNode, { id: `l${i}`, at: at(24 + (i % 3)), ...team, weight: 10 + i, carrier: CARRIERS[i % 3] }),
    ];
  }).flat();
const ENTITIES = makeEntities();
const NO_TRANSACTIONS: never[] = [];

const PACK = {
  nodes: NODES,
  rows: { by: "team_id", name: "team_name" },
  fields: { team_id: { label: "Squad" }, carrier: { label: "Carrier" } },
  lanes: [{ id: "load", depth: { split: "carrier" } }] as never,
};

const q = <T extends Element = HTMLElement>(c: ParentNode, sel: string): T => c.querySelector(sel) as T;
const qa = (c: ParentNode, sel: string): HTMLElement[] => [...c.querySelectorAll<HTMLElement>(sel)];
const foldButton = (c: HTMLElement): HTMLElement => q(c, "[data-bar-fold]");
const rowsButton = (c: HTMLElement): HTMLElement => q(c, "[data-track-header] button");
const laneButton = (c: HTMLElement): HTMLElement => q(c, '[data-magnitude-lane="load"] button');
const scroller = (c: HTMLElement): HTMLElement => q(c, "[data-track-scroller]");

function setWindowHeight(h: number): void {
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true, writable: true });
}

function draw(list: Entity[] = ENTITIES) {
  return render(<Timeline transactions={NO_TRANSACTIONS} genericEntities={list} />);
}

beforeEach(() => {
  localStorage.clear();
  setWindowHeight(900);
  useLayers.setState({ collapsedLanes: [], barSize: "middle" });
  useClockForm.setState({ h24: false });
  usePlayhead.setState({
    playhead: MS0 + 24.2 * HOUR, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1,
    isPlaying: false, isScrubbing: false, playbackRate: 1,
  });
  useSchema.setState({ nodes: PACK.nodes, rows: PACK.rows, fields: PACK.fields, lanes: PACK.lanes });
  useSelection.setState({ selected: null });
  useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
  useSolo.setState({ solo: null });
  useTrackBy.setState({ by: null });
});
afterEach(() => {
  useSchema.setState({ rows: undefined, fields: undefined, lanes: undefined });
  useSolo.setState({ solo: null });
  useLayers.setState({ collapsedLanes: [], barSize: "middle" });
});

describe("the five picks are mounted", () => {
  it("call 13: at the middle size the rows' small version stands under the folded rows and has no button of its own", () => {
    const { container } = draw();
    const small = q(container, "[data-rows-small]");
    expect(small).not.toBeNull();
    expect(small.getAttribute("data-rows-small")).toBe("count");
    expect(q(container, "[data-track-rows]").compareDocumentPosition(small) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(q(small, "[data-small-open]")).toBeNull();
    expect(qa(small, "[data-small-count]").length).toBeGreaterThan(0);
  });

  it("call 13: with the rows open the small version is not drawn", () => {
    useLayers.setState({ barSize: "open" });
    const { container } = draw();
    expect(q(container, "[data-rows-small]")).toBeNull();
  });

  it("call 13: under a solo the small version counts that row's own events", () => {
    const { container } = draw();
    const figure = (): string | undefined => qa(container, "[data-rows-small] [data-small-count-figure]")[0]?.textContent ?? undefined;
    const before = figure();
    act(() => useSolo.getState().toggle("team_id", "t1"));
    const after = figure();
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
  });

  it("call 14: a folded lane with the name column draws its small version, and it is the lane's one button", () => {
    useLayers.setState({ collapsedLanes: ["load"] });
    const { container } = draw();
    const lane = q(container, '[data-magnitude-lane="load"]');
    expect(lane).not.toBeNull();
    expect(q(lane, '[data-lane-small="load"]')).not.toBeNull();
    // The small version stands in the lane's own place: no header above it and no open plot.
    expect(q(lane, "[data-magnitude-header]")).toBeNull();
    expect(q(lane, "[data-magnitude-plot]")).toBeNull();
    const buttons = qa(lane, "button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-expanded")).toBe("false");
    expect(buttons[0].hasAttribute("aria-controls")).toBe(false);
    // A press opens the lane: the header and the plot are back and the small version is gone.
    fireEvent.click(buttons[0]);
    expect(useLayers.getState().collapsedLanes).toEqual([]);
    expect(q(container, '[data-magnitude-lane="load"] [data-magnitude-plot]')).not.toBeNull();
    expect(q(container, '[data-lane-small="load"]')).toBeNull();
  });

  it("call 14: the folded lane keeps its group, its id and, under a solo, the row's name", () => {
    useLayers.setState({ collapsedLanes: ["load"] });
    const { container } = draw();
    act(() => useSolo.getState().toggle("team_id", "t1"));
    const lane = q(container, '[data-magnitude-lane="load"]');
    expect(lane.getAttribute("role")).toBe("group");
    expect(lane.getAttribute("aria-label")).toMatch(/Team 01 alone$/);
    expect(lane.getAttribute("data-lane-whose")).toBe("Team 01");
  });

  it("call 15: the first fold leaves a line for each section, the second gives one line, the third opens the bar as it was", () => {
    useLayers.setState({ barSize: "open" });
    const { container } = draw();
    const button = foldButton(container);
    button.focus();
    fireEvent.click(button);
    expect(useLayers.getState().barSize).toBe("line");
    expect(q(container, "[data-bar-stack]")).not.toBeNull();
    expect(q(container, "[data-rows-small] [data-small-open]")).not.toBeNull();
    expect(q(container, '[data-lane-small="load"]')).not.toBeNull();
    expect(q(container, "[data-timeline-gestures]")).toBeNull();
    expect(foldButton(container)).toBe(button);
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(useLayers.getState().barSize).toBe("line");
    expect(q(container, "[data-bar-stack]")).toBeNull();
    expect(q(container, "[data-rows-small]")).toBeNull();
    expect(q(container, "[data-case-strip]")).not.toBeNull();
    expect(foldButton(container)).toBe(button);
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(useLayers.getState().barSize).toBe("open");
    expect(q(container, "[data-timeline-gestures]")).not.toBeNull();
    expect(foldButton(container)).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  it("call 15: a bar saved as one line opens on one line, not on a line for each section", () => {
    useLayers.setState({ barSize: "line" });
    const { container } = draw();
    expect(q(container, "[data-bar-stack]")).toBeNull();
    expect(q(container, "[data-case-strip]")).not.toBeNull();
  });

  it("call 15: a pack with no rows and no lane folds straight to one line", () => {
    useSchema.setState({ nodes: [stopNode, scanNode], rows: undefined, fields: undefined, lanes: undefined });
    const { container } = draw();
    fireEvent.click(foldButton(container));
    expect(useLayers.getState().barSize).toBe("line");
    expect(q(container, "[data-bar-stack]")).toBeNull();
    expect(q(container, "[data-case-strip]")).not.toBeNull();
  });

  it("call 15: a press on the rows' button in the stack opens the bar with the rows open and moves the focus to the rows' control", () => {
    const { container } = draw();
    fireEvent.click(foldButton(container));
    const press = q(container, "[data-rows-small] [data-small-open]");
    press.focus();
    fireEvent.click(press);
    expect(useLayers.getState().barSize).toBe("open");
    expect(q(container, "[data-bar-stack]")).toBeNull();
    expect(rowsButton(container).getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(rowsButton(container));
  });

  it("call 15: a press on the lane's button in the stack opens the bar at the size it had, opens the lane and focuses the lane's control", () => {
    useLayers.setState({ collapsedLanes: ["load"] });
    const { container } = draw();
    fireEvent.click(foldButton(container));
    const press = q(container, '[data-lane-small="load"] [data-lane-small-name]');
    press.focus();
    fireEvent.click(press);
    expect(useLayers.getState().barSize).toBe("middle");
    expect(useLayers.getState().collapsedLanes).toEqual([]);
    expect(q(container, "[data-bar-stack]")).toBeNull();
    expect(document.activeElement).toBe(laneButton(container));
    expect(laneButton(container).getAttribute("aria-expanded")).toBe("true");
  });

  it("call 16: the lane's lines are closed, name the field's label, and open into a line for each value", () => {
    const { container } = draw();
    const toggle = q(container, '[data-magnitude-lane="load"] [data-lane-lines-toggle]');
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Carrier");
    expect(qa(container, "[data-lane-line-row]")).toHaveLength(0);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(qa(container, "[data-lane-line-row]").map((r) => r.getAttribute("data-lane-line-row")).sort()).toEqual(CARRIERS.slice().sort());
  });

  it("call 16: a lane that declares no depth has no lines", () => {
    useSchema.setState({ lanes: undefined });
    const { container } = draw();
    expect(q(container, "[data-lane-lines-toggle]")).toBeNull();
  });

  it("call 16: the lines narrow with the row that is alone", () => {
    const { container } = draw();
    fireEvent.click(q(container, "[data-lane-lines-toggle]"));
    expect(qa(container, "[data-lane-line-row]")).toHaveLength(3);
    act(() => useSolo.getState().toggle("team_id", "t1"));
    expect(qa(container, "[data-lane-line-row]").map((r) => r.getAttribute("data-lane-line-row"))).toEqual(["south"]);
  });

  it("call 17: the kind lines are closed, read the whole case on the rail, and open into a line for each kind", () => {
    const { container } = draw();
    const control = q(container, "[data-kinds-fold]");
    expect(control).not.toBeNull();
    expect(control.getAttribute("aria-expanded")).toBe("false");
    expect(control.hasAttribute("aria-controls")).toBe(false);
    expect(control.textContent).toContain("24");
    expect(q(container, "[data-kind-lines]")).toBeNull();
    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    const lines = qa(container, "[data-kind-line]");
    expect(lines.map((l) => l.getAttribute("data-kind-line")).sort()).toEqual(["scan", "stop"]);
    expect(lines.map((l) => Number(q(l, "[data-kind-count]").textContent))).toEqual([12, 12]);
    expect(control.getAttribute("aria-controls")).toBe(q(container, "[data-kind-lines]").id);
  });

  it("call 17: a pack with one kind offers no kind line", () => {
    useSchema.setState({ nodes: [stopNode, loadNode] });
    const { container } = draw();
    expect(q(container, "[data-kinds-fold]")).toBeNull();
  });

  it("call 17: under a solo the lines keep the case's kinds and count the row's events", () => {
    const { container } = draw();
    fireEvent.click(q(container, "[data-kinds-fold]"));
    act(() => useSolo.getState().toggle("team_id", "t1"));
    const lines = qa(container, "[data-kind-line]");
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => Number(q(l, "[data-kind-count]").textContent))).toEqual([1, 1]);
    expect(q(container, "[data-kinds-fold]").textContent).toContain("2");
  });

  it("call 17: every copy in a kind line is out of the Tab order and has an original on the track", () => {
    const { container } = draw();
    fireEvent.click(q(container, "[data-kinds-fold]"));
    const track = q(container, '[role="slider"]');
    const originals = qa(track, 'button[aria-label^="Jump to"]');
    expect(originals).toHaveLength(24);
    const copies = qa(q(container, "[data-kind-lines]"), "[data-kind-plot] button");
    expect(copies).toHaveLength(24);
    for (const copy of copies) expect(copy.getAttribute("tabindex")).toBe("-1");
  });
});

describe("a depth that is not drawn takes no room (r3 R3)", () => {
  const listPx = (c: HTMLElement): number => parseFloat(scroller(c).style.maxHeight);

  it("with the lane folded and the rows open, the list is as tall as with the depth closed", () => {
    useLayers.setState({ barSize: "open" });
    const { container } = draw();
    const closed = listPx(container);
    expect(closed).toBeGreaterThan(0);
    // First prove that an open depth does shorten this list, or the equality below is empty.
    fireEvent.click(q(container, "[data-lane-lines-toggle]"));
    const withLines = listPx(container);
    expect(withLines).toBeLessThan(closed);
    // Fold the lane: its lines leave and the list takes its room back.
    fireEvent.click(laneButton(container));
    expect(listPx(container)).toBe(closed);
    // Open it again: the lines are still open and the list gives the room up again.
    fireEvent.click(q(container, '[data-lane-small="load"] [data-lane-small-name]'));
    expect(listPx(container)).toBe(withLines);
  });

  it("the kind lines give room the same way, and give it back when they close", () => {
    useLayers.setState({ barSize: "open" });
    const { container } = draw();
    const closed = listPx(container);
    fireEvent.click(q(container, "[data-kinds-fold]"));
    expect(listPx(container)).toBeLessThan(closed);
    fireEvent.click(q(container, "[data-kinds-fold]"));
    expect(listPx(container)).toBe(closed);
  });
});

describe("what a tick of the playhead draws again (section 8)", () => {
  /** 60 ticks of half a minute each, from 24:12 to 24:42 hours of the case: inside one hour. */
  const tick60 = (): void => {
    for (let i = 1; i <= 60; i++) act(() => usePlayhead.setState({ playhead: MS0 + 24.2 * HOUR + i * 30_000 }));
  };

  it("a depth line, a kind line and the rows' small strip are drawn 0 times after the first draw", () => {
    const { container } = draw();
    fireEvent.click(q(container, "[data-lane-lines-toggle]"));
    fireEvent.click(q(container, "[data-kinds-fold]"));
    expect(qa(container, "[data-lane-line-row]").length).toBeGreaterThan(0);
    expect(qa(container, "[data-kind-line]").length).toBeGreaterThan(0);
    expect(qa(container, "[data-small-count]").length).toBeGreaterThan(0);
    const before = { ...counts };
    expect(before.laneLine).toBeGreaterThan(0);
    expect(before.kindLine).toBeGreaterThan(0);
    expect(before.bars).toBeGreaterThan(0);
    tick60();
    expect(counts.laneLine).toBe(before.laneLine);
    expect(counts.kindLine).toBe(before.kindLine);
    expect(counts.bars).toBe(before.bars);
  });

  it("the folded lane's small strip is drawn 0 times after the first draw", () => {
    useLayers.setState({ collapsedLanes: ["load"] });
    const { container } = draw();
    expect(q(container, '[data-lane-small="load"]')).not.toBeNull();
    const before = counts.laneSmall;
    expect(before).toBeGreaterThan(0);
    tick60();
    expect(counts.laneSmall).toBe(before);
  });

  it("the stack's strips are drawn 0 times after the first draw", () => {
    const { container } = draw();
    fireEvent.click(foldButton(container));
    expect(q(container, "[data-bar-stack]")).not.toBeNull();
    const before = { bars: counts.bars, small: counts.laneSmall };
    expect(before.bars).toBeGreaterThan(0);
    expect(before.small).toBeGreaterThan(0);
    tick60();
    expect(counts.bars).toBe(before.bars);
    expect(counts.laneSmall).toBe(before.small);
  });
});
