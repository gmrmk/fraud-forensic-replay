/** Phase C: the magnitude lanes in the timeline shell, their mouse-down and wheel hand-off to the
 *  track, the slider's spoken value, and the fold in the layers store. Fixture kinds are neutral. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Timeline } from "../Timeline";
import { TimelineShell } from "./TimelineShell";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useSelection } from "../../store/selection";
import { useNavigation } from "../../store/navigation";
import { useLayers } from "../../store/layers";
import { useClockForm } from "../../store/clock-form";
import { useSolo } from "../../store/solo";
import { useTrackBy } from "../../store/track-by";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import { when } from "../../lib/time-words";
import type { ScenarioLane, ScenarioNode } from "../../lib/scenarios";

// ---- rAF queue and rectangle mock: copied from lib/use-zoom-gestures.test.ts ---------------------
let rafQueue: FrameRequestCallback[] = [];

function installRafMock(): void {
  rafQueue = [];
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  window.cancelAnimationFrame = (): void => {};
}

function flushRaf(rounds = 30): void {
  for (let i = 0; i < rounds; i++) {
    const pending = rafQueue.splice(0);
    if (pending.length === 0) break;
    for (const cb of pending) cb(performance.now());
  }
}

function mockRect(el: Element, width = 1000): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: width, bottom: 100, width, height: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

function wheelEvent(deltaY: number, clientX: number): WheelEvent {
  const e = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
  Object.defineProperty(e, "clientX", { value: clientX, configurable: true });
  return e;
}

// ---- Fixtures --------------------------------------------------------------------------------------
const HOUR = 3_600_000;
const MS0 = Date.parse("2026-05-12T00:00:00-05:00");
const MS1 = Date.parse("2026-06-01T00:00:00-05:00");
const at = (h: number): string => new Date(MS0 + h * HOUR).toISOString();

const dotNode: ScenarioNode = {
  kind: "shipment", label: "Shipment", palette: "#ffb347", source: "sql", coords: null, timestamp: "at", primary: "${id}",
};
const parcelNode: ScenarioNode = {
  kind: "parcel", label: "Parcel", palette: "#ffd166", source: "sql", coords: null, timestamp: "at", primary: "${id}",
  magnitude: "weight", magnitudeLabel: "Weight", magnitudeUnit: "kg",
};
const crateNode: ScenarioNode = {
  kind: "crate", label: "Crate", palette: "#66ccff", source: "sql", coords: null, timestamp: "at", primary: "${id}",
  magnitude: "load", magnitudeLabel: "Load",
};
const NODES = [dotNode, parcelNode, crateNode];

const ENTITIES = [
  manifestRowToEntity(dotNode, { id: "s1", at: at(30) }),
  // Parcels at hours 24, 25, 26: 10, 30, 20 (a step of one hour, whole numbers).
  manifestRowToEntity(parcelNode, { id: "p1", at: at(24), weight: 10 }),
  manifestRowToEntity(parcelNode, { id: "p2", at: at(25), weight: 30 }),
  manifestRowToEntity(parcelNode, { id: "p3", at: at(26), weight: 20 }),
  // Crates at hours 100 and 101: 5.5 and 6.5 (two decimals).
  manifestRowToEntity(crateNode, { id: "c1", at: at(100), load: 5.5 }),
  manifestRowToEntity(crateNode, { id: "c2", at: at(101), load: 6.5 }),
];

const slider = (c: HTMLElement): HTMLElement => c.querySelector('[role="slider"]') as HTMLElement;
const lanes = (c: HTMLElement): HTMLElement[] => [...c.querySelectorAll<HTMLElement>("[data-magnitude-lane]")];
const laneOf = (c: HTMLElement, kind: string): HTMLElement => c.querySelector(`[data-magnitude-lane="${kind}"]`) as HTMLElement;
const plotOf = (c: HTMLElement, kind: string): HTMLElement => laneOf(c, kind).querySelector("[data-magnitude-plot]") as HTMLElement;

const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;

describe("Timeline lanes", () => {
  beforeEach(() => {
    installRafMock();
    localStorage.clear();
    useLayers.setState({ collapsedLanes: [] });
    usePlayhead.setState({
      playhead: MS0 + 24.5 * HOUR, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1,
      isPlaying: false, isScrubbing: false, playbackRate: 1,
    });
    useSchema.setState({ nodes: NODES });
    useSelection.setState({ selected: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useSchema.setState({ rows: undefined, fields: undefined, lanes: undefined });
    rafQueue = [];
  });

  it("puts the lanes after the slider and before the axis, in manifest order, each with its own scale and a focusable button", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    const found = lanes(container);
    expect(found.map((l) => l.getAttribute("data-magnitude-lane"))).toEqual(["parcel", "crate"]);
    const axis = container.querySelector("[data-timeline-axis]") as HTMLElement;
    expect(axis).not.toBeNull();
    const track = slider(container);
    const dot = container.querySelector('button[aria-label^="Jump to"]') as HTMLElement;
    expect(track.contains(dot)).toBe(true);
    for (const lane of found) {
      expect(track.compareDocumentPosition(lane) & FOLLOWING).toBeTruthy();
      expect(lane.compareDocumentPosition(axis) & FOLLOWING).toBeTruthy();
      const button = lane.querySelector("button") as HTMLElement;
      expect(dot.compareDocumentPosition(button) & FOLLOWING).toBeTruthy();
      expect(track.compareDocumentPosition(button) & FOLLOWING).toBeTruthy();
      const tab = button.getAttribute("tabindex");
      expect(tab === null || Number(tab) >= 0).toBe(true);
    }
    expect(found.map((l) => l.querySelector("[data-magnitude-scale]")?.textContent)).toEqual(["0 to 30", "0 to 6.5"]);
  });

  describe("a mouse-down on a plot", () => {
    it("seeks as the track does at the same x, prevents the default and focuses the track", () => {
      const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
      const track = slider(container);
      mockRect(track);
      const focus = vi.spyOn(track, "focus");
      const seeks: number[] = [];
      for (const x of [250, 600]) {
        fireEvent.mouseDown(track, { clientX: x });
        seeks.push(usePlayhead.getState().playhead);
        fireEvent.mouseUp(window);
      }
      expect(focus).not.toHaveBeenCalled(); // a track mouse-down is not the plot's hand-off
      const plotSeeks: number[] = [];
      for (const x of [250, 600]) {
        const notPrevented = fireEvent.mouseDown(plotOf(container, "parcel"), { clientX: x });
        expect(notPrevented).toBe(false);
        plotSeeks.push(usePlayhead.getState().playhead);
        fireEvent.mouseUp(window);
      }
      expect(plotSeeks).toEqual(seeks);
      expect(seeks[0]).toBeGreaterThan(MS0);
      expect(seeks[1]).toBeLessThan(MS1);
      expect(seeks[0]).not.toBe(seeks[1]);
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    });

    it("seeks against the window as it is now, after a zoom (added after the Phase C check)", () => {
      const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
      const track = slider(container);
      mockRect(track);
      // The window narrows after the first render: the plot's hand-off must use this render's
      // track handler, not the one the shell had when the lanes were made.
      const W0 = MS0 + 10 * HOUR;
      const W1 = MS0 + 50 * HOUR;
      act(() => {
        usePlayhead.setState({ windowMin: W0, windowMax: W1 });
      });
      fireEvent.mouseDown(track, { clientX: 250 });
      const trackSeek = usePlayhead.getState().playhead;
      fireEvent.mouseUp(window);
      fireEvent.mouseDown(plotOf(container, "parcel"), { clientX: 250 });
      const plotSeek = usePlayhead.getState().playhead;
      fireEvent.mouseUp(window);
      expect(trackSeek).toBe(W0 + 0.25 * (W1 - W0));
      expect(plotSeek).toBe(trackSeek);
    });

    it("continues as a drag on window and ends on mouseup", () => {
      const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
      const track = slider(container);
      mockRect(track);
      fireEvent.mouseDown(plotOf(container, "crate"), { clientX: 250 });
      expect(usePlayhead.getState().isScrubbing).toBe(true);
      fireEvent.mouseMove(window, { clientX: 700 });
      expect(usePlayhead.getState().playhead).toBe(MS0 + 0.7 * (MS1 - MS0));
      fireEvent.mouseUp(window);
      expect(usePlayhead.getState().isScrubbing).toBe(false);
      fireEvent.mouseMove(window, { clientX: 100 });
      expect(usePlayhead.getState().playhead).toBe(MS0 + 0.7 * (MS1 - MS0));
    });
  });

  describe("the wheel", () => {
    it("over a lane changes the zoom window; in bounds mode it does not", () => {
      const { container, unmount } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
      const wrapper = container.querySelector("[data-timeline-gestures]") as HTMLElement;
      expect(wrapper).not.toBeNull();
      mockRect(wrapper);
      const before = usePlayhead.getState().windowMax - usePlayhead.getState().windowMin;
      const header = laneOf(container, "parcel").querySelector("[data-magnitude-header]") as HTMLElement;
      act(() => {
        header.dispatchEvent(wheelEvent(-100, 500));
        flushRaf(30);
      });
      const after = usePlayhead.getState().windowMax - usePlayhead.getState().windowMin;
      expect(after).toBeLessThan(before);
      unmount();

      usePlayhead.setState({ windowMin: MS0, windowMax: MS1 });
      const bounds = render(
        <TimelineShell scrubDomain="bounds" transport={<span />} lanes={() => <div data-testid="bounds-lane" />}>
          {() => null}
        </TimelineShell>,
      );
      const lane = bounds.getByTestId("bounds-lane");
      mockRect(lane.parentElement as HTMLElement);
      act(() => {
        lane.dispatchEvent(wheelEvent(-100, 500));
        flushRaf(30);
      });
      expect(usePlayhead.getState().windowMax - usePlayhead.getState().windowMin).toBe(MS1 - MS0);
    });
  });

  it("ends the slider's spoken value with each lane's name and value, or its name and no data", () => {
    const first = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    // Hour 24.5: a parcel bucket (10 kg), no crate bucket.
    expect(slider(first.container).getAttribute("aria-valuetext")).toMatch(/, Parcel Weight 10 kg, Crate Load no data$/);
    first.unmount();
    usePlayhead.setState({ playhead: MS0 + 100.5 * HOUR });
    const second = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    expect(slider(second.container).getAttribute("aria-valuetext")).toMatch(/, Parcel Weight no data, Crate Load 5\.50$/);
    second.unmount();
    usePlayhead.setState({ playhead: MS0 + 60 * HOUR });
    const third = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    expect(slider(third.container).getAttribute("aria-valuetext")).toMatch(/, Parcel Weight no data, Crate Load no data$/);
  });

  it("holds no svg lane and no readout inside the slider", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    expect(slider(container).querySelector("svg[data-magnitude-lane]")).toBeNull();
    expect(slider(container).querySelector("[data-magnitude-readout]")).toBeNull();
    // The number stands at the line now (the head's piece), so the header carries no readout.
    expect(container.querySelectorAll("[data-magnitude-readout]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-lane-figure-value]").length).toBeGreaterThan(0);
  });

  it("a manifest with no magnitude kind renders no lane", () => {
    useSchema.setState({ nodes: [dotNode] });
    const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    expect(container.querySelector("[data-magnitude-lane]")).toBeNull();
    expect(container.querySelector("[data-magnitude-readout]")).toBeNull();
  });

  it("folding one lane leaves the other open and stores the folded kind alone", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    expect(plotOf(container, "parcel").hidden).toBe(false);
    fireEvent.click(laneOf(container, "parcel").querySelector("button") as HTMLElement);
    expect(plotOf(container, "parcel").hidden).toBe(true);
    expect(plotOf(container, "crate").hidden).toBe(false);
    expect(laneOf(container, "parcel").querySelector("button")?.getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem("ffr.lanes.collapsed")).toBe('["parcel"]');
  });

  it("folds a declared lane by its id when another lane reads the same kind, and a saved fold of the id folds it", () => {
    const peak: ScenarioLane = {
      id: "parcel-peak", name: "Parcels", label: "Heaviest", unit: "kg", kinds: ["parcel"], field: "weight", bucket: "hour", aggregate: "max",
    };
    useSchema.setState({ lanes: [peak] });
    const { container, unmount } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    expect(lanes(container).map((l) => l.getAttribute("data-magnitude-lane"))).toEqual(["parcel", "crate", "parcel-peak"]);
    fireEvent.click(laneOf(container, "parcel-peak").querySelector("button") as HTMLElement);
    expect(localStorage.getItem("ffr.lanes.collapsed")).toBe('["parcel-peak"]');
    expect(plotOf(container, "parcel-peak").hidden).toBe(true);
    expect(plotOf(container, "parcel").hidden).toBe(false);
    unmount();
    // The saved list holds the id, and the lane of the same kind stays open.
    const again = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    expect(plotOf(again.container, "parcel-peak").hidden).toBe(true);
    expect(plotOf(again.container, "parcel").hidden).toBe(false);
  });
});

// ---- INT-1: the rows join the lanes, and the slider speaks the clock's form ----------------------
const teamStop: ScenarioNode = { ...dotNode, kind: "stop", label: "Stop", pivotable: ["team_id"] };
const teamLoad: ScenarioNode = { ...parcelNode, kind: "load", label: "Load", pivotable: ["team_id"] };
const TEAM_NODES = [teamStop, teamLoad];
const TEAM_ENTITIES = [
  manifestRowToEntity(teamStop, { id: "s1", at: at(24), team_id: "a", team_name: "Team a" }),
  manifestRowToEntity(teamStop, { id: "s2", at: at(25), team_id: "b", team_name: "Team b" }),
  manifestRowToEntity(teamLoad, { id: "w1", at: at(24), team_id: "a", team_name: "Team a", weight: 10 }),
  manifestRowToEntity(teamLoad, { id: "w2", at: at(25), team_id: "b", team_name: "Team b", weight: 40 }),
  manifestRowToEntity(teamLoad, { id: "w3", at: at(26), team_id: "b", team_name: "Team b", weight: 20 }),
];

describe("Timeline rows with lanes", () => {
  beforeEach(() => {
    installRafMock();
    localStorage.clear();
    useLayers.setState({ collapsedLanes: [], barSize: "middle" });
    useClockForm.setState({ h24: false });
    usePlayhead.setState({
      playhead: MS0 + 24.5 * HOUR, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1,
      isPlaying: false, isScrubbing: false, playbackRate: 1,
    });
    useSchema.setState({ nodes: TEAM_NODES, rows: { by: "team_id", name: "team_name" }, fields: { team_id: { label: "Squad" } }, lanes: undefined });
    useSelection.setState({ selected: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
    useSolo.setState({ solo: null });
    useTrackBy.setState({ by: null });
  });
  afterEach(() => {
    useSchema.setState({ rows: undefined, fields: undefined, lanes: undefined });
    useSolo.setState({ solo: null });
    useClockForm.setState({ h24: false });
    rafQueue = [];
  });

  it("stands in this order: the slider, the rows, the lanes, the hours", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={TEAM_ENTITIES} />);
    const track = slider(container);
    const rows = container.querySelector("[data-track-rows]") as HTMLElement;
    const lane = laneOf(container, "load");
    const axis = container.querySelector("[data-timeline-axis]") as HTMLElement;
    expect(rows).not.toBeNull();
    for (const [first, second] of [[track, rows], [rows, lane], [lane, axis]]) {
      expect(first.compareDocumentPosition(second) & FOLLOWING).toBeTruthy();
    }
  });

  it("with a row alone the lane is that row's, on a top of its own, and the slider names the row and its number", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={TEAM_ENTITIES} />);
    expect(slider(container).getAttribute("aria-valuetext")).toMatch(/Load Weight 10 kg$/);
    // Team b is alone: its bars of 40 and 20 stand in hours 25 and 26, and team a's bar leaves.
    act(() => useSolo.getState().toggle("team_id", "b"));
    const lane = laneOf(container, "load");
    expect(lane.querySelectorAll("[data-bucket]")).toHaveLength(2);
    expect(lane.textContent).toContain("Team b");
    act(() => usePlayhead.setState({ playhead: MS0 + 25.5 * HOUR }));
    expect(slider(container).getAttribute("aria-valuetext")).toMatch(/Load Weight 40 kg, Team b 40 kg$/);
  });

  it("a row with one bar keeps the lane's step, so its number stands and its bar has a width", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={TEAM_ENTITIES} />);
    act(() => useSolo.getState().toggle("team_id", "a"));
    // Team a has one bar, 10 in hour 24; the playhead is in that hour.
    expect(slider(container).getAttribute("aria-valuetext")).toMatch(/Load Weight 10 kg, Team a 10 kg$/);
    const bucket = laneOf(container, "load").querySelector("[data-bucket]") as HTMLElement;
    expect(parseFloat(bucket.style.width)).toBeGreaterThan(0);
  });

  // INT-1b (a): a lane the one row has no value for stays, empty, and the header names the row.
  it("with a row alone that has no value for a lane, the lane stays with no bars and the row's name", () => {
    const withC = [...TEAM_ENTITIES, manifestRowToEntity(teamStop, { id: "s3", at: at(27), team_id: "c", team_name: "Team c" })];
    const { container } = render(<Timeline transactions={[]} genericEntities={withC} />);
    act(() => useSolo.getState().toggle("team_id", "c"));
    const lane = laneOf(container, "load");
    expect(lane).not.toBeNull();
    expect(lane.querySelectorAll("[data-bucket]")).toHaveLength(0);
    expect(lane.hasAttribute("data-lane-empty")).toBe(true);
    expect(lane.querySelector("[data-magnitude-whose]")?.textContent).toBe("Team c");
    expect(lane.getAttribute("aria-label")).toMatch(/Team c alone$/);
    expect(slider(container).getAttribute("aria-valuetext")).toMatch(/Load Weight no data$/);
    // With no row alone the lane has its bars again and is not marked empty.
    act(() => useSolo.getState().clear());
    expect(laneOf(container, "load").hasAttribute("data-lane-empty")).toBe(false);
    expect(laneOf(container, "load").querySelectorAll("[data-bucket]").length).toBeGreaterThan(0);
  });

  // INT-1b (b): a press on the name of a row whose value is padded or a number puts that row alone.
  it("a press on the name of a row with a padded or a numeric value leaves that row's bars, not none", () => {
    useLayers.setState({ barSize: "open" });
    const extra = [
      manifestRowToEntity(teamStop, { id: "s4", at: at(28), team_id: "p ", team_name: "Team p" }),
      manifestRowToEntity(teamLoad, { id: "w4", at: at(28), team_id: "p ", team_name: "Team p", weight: 8 }),
      manifestRowToEntity(teamStop, { id: "s5", at: at(29), team_id: 42, team_name: "Team n" }),
      manifestRowToEntity(teamLoad, { id: "w5", at: at(29), team_id: 42, team_name: "Team n", weight: 9 }),
    ];
    const { container } = render(<Timeline transactions={[]} genericEntities={[...TEAM_ENTITIES, ...extra]} />);
    for (const [name, bars] of [["Team p", 1], ["Team n", 1]] as const) {
      const button = [...container.querySelectorAll<HTMLElement>("[data-track-name]")].find((b) => b.textContent?.includes(name)) as HTMLElement;
      expect(button, name).toBeDefined();
      fireEvent.click(button);
      expect(laneOf(container, "load").querySelectorAll("[data-bucket]"), name).toHaveLength(bars);
      expect(container.querySelectorAll("[data-track-group][data-soloed]"), name).toHaveLength(1);
      fireEvent.click(container.querySelector("[data-track-group][data-soloed] [data-track-name]") as HTMLElement);
      expect(useSolo.getState().solo, name).toBeNull();
    }
  });

  it("one press on the name of the row that is alone clears it, when the stored value is padded", () => {
    useLayers.setState({ barSize: "open" });
    useSolo.setState({ solo: { field: "team_id", value: " b " } });
    const { container } = render(<Timeline transactions={[]} genericEntities={TEAM_ENTITIES} />);
    expect(container.querySelectorAll("[data-track-group][data-soloed]")).toHaveLength(1);
    fireEvent.click(container.querySelector("[data-track-group][data-soloed] [data-track-name]") as HTMLElement);
    expect(useSolo.getState().solo).toBeNull();
  });

  // INT-1b (c): a stored solo that names no row is cleared once the rows have loaded.
  it("clears a stored solo that names no row, once the rows are there, and keeps one that names a row", () => {
    useSolo.setState({ solo: { field: "team_id", value: "nobody" } });
    const { unmount } = render(<Timeline transactions={[]} genericEntities={TEAM_ENTITIES} />);
    expect(useSolo.getState().solo).toBeNull();
    unmount();
    useSolo.setState({ solo: { field: "team_id", value: "b" } });
    const again = render(<Timeline transactions={[]} genericEntities={TEAM_ENTITIES} />);
    expect(useSolo.getState().solo).toEqual({ field: "team_id", value: "b" });
    expect(again.container.querySelector("[data-lane-whose]")?.getAttribute("data-lane-whose")).toBe("Team b");
  });

  // INT-1b (d): an alone row on a zoomed window. Team b's peak hour (25, bar 40) is outside the window.
  it("with a row alone and the window zoomed past its peak hour, the lane's top stays at the peak", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={TEAM_ENTITIES} />);
    act(() => useSolo.getState().toggle("team_id", "b"));
    const scale = (): string | null | undefined => laneOf(container, "load").querySelector("[data-magnitude-scale]")?.textContent;
    expect(scale()).toBe("0 to 40");
    act(() => usePlayhead.setState({ windowMin: MS0 + 25.9 * HOUR, windowMax: MS0 + 27 * HOUR }));
    // Only the hour-26 bar (20) is in the window now; the top is still the row's largest hourly bar.
    expect(scale()).toBe("0 to 40");
    const heights = [...laneOf(container, "load").querySelectorAll<HTMLElement>("[data-bucket] [data-bar-piece]")].map((p) => parseFloat(p.style.height));
    expect(heights.length).toBeGreaterThan(0);
    expect(Math.max(...heights)).toBeLessThan(24);
  });

  it("takes the clock's form in its spoken value", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={TEAM_ENTITIES} />);
    expect(slider(container).getAttribute("aria-valuetext")).toMatch(/\b\d{1,2}:\d{2}[ap],/);
    act(() => useClockForm.setState({ h24: true }));
    expect(slider(container).getAttribute("aria-valuetext")).toMatch(/\b\d{2}:\d{2},/);
    expect(slider(container).getAttribute("aria-valuetext")).not.toMatch(/\d[ap],/);
  });

  it("holds its spoken value while the playhead plays, and computes it once when playback stops", () => {
    usePlayhead.setState({ isPlaying: true });
    const { container } = render(<Timeline transactions={[]} genericEntities={TEAM_ENTITIES} />);
    const first = slider(container).getAttribute("aria-valuetext");
    // Ten ticks, each a step of an hour and a half: the clock, which is read to the minute, would
    // change at every one.
    for (let i = 1; i <= 10; i++) {
      act(() => usePlayhead.setState({ playhead: MS0 + (24.5 + 1.5 * i) * HOUR }));
      expect(slider(container).getAttribute("aria-valuetext")).toBe(first);
    }
    act(() => usePlayhead.setState({ isPlaying: false }));
    const stopped = slider(container).getAttribute("aria-valuetext");
    expect(stopped).not.toBe(first);
    expect(stopped).toContain(when(MS0 + 39.5 * HOUR));
  });
});
