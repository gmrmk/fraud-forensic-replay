/**
 * The step and mark keys on the case timeline's track: comma and period walk the events the
 * timeline draws as dots (a step is what a click on a dot does), m drops and lifts marks. The
 * fixture pack has only file-backed kinds, so nothing here leans on the card kinds or the ticker.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { Timeline } from "./Timeline";
import { usePlayhead } from "../store/playhead";
import { useSchema } from "../store/schema";
import { useSolo } from "../store/solo";
import { useTrackBy } from "../store/track-by";
import { useSelection } from "../store/selection";
import { useNavigation } from "../store/navigation";
import { manifestRowToEntity } from "../lib/adapters/manifest-row";
import type { ScenarioNode } from "../lib/scenarios";

const node = (kind: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind, label: kind, palette: "#7ee787", source: "json", coords: null, timestamp: "at", primary: "${id}", ...extra,
});
const stopNode = node("stop");
const loadNode = node("load", { magnitude: "weight" });
const MS0 = Date.parse("2026-06-08T00:00:00-05:00");
const MS1 = Date.parse("2026-06-09T00:00:00-05:00");
const HOUR = 3_600_000;
const iso = (h: number) => new Date(MS0 + h * HOUR).toISOString();
const stops = [1, 2, 5].map((h, i) => manifestRowToEntity(stopNode, { id: `s${i + 1}`, at: iso(h) }));
const loads = [1.5, 3].map((h, i) => manifestRowToEntity(loadNode, { id: `w${i + 1}`, at: iso(h), weight: 10 }));

const track = () => screen.getByRole("slider", { name: "Playhead position" });
const selectedId = () => {
  const s = useSelection.getState().selected;
  return s && s.kind === "entity" ? s.entity.id : null;
};

describe("step and mark keys on the case timeline", () => {
  beforeEach(() => {
    usePlayhead.setState({ playhead: MS0, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1, isPlaying: true, markA: null, markB: null });
    useSchema.setState({ nodes: [stopNode, loadNode] });
    useSelection.setState({ selected: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
  });

  it("period goes to the next dot as a click does: it is selected, the playhead is there, playback stops", () => {
    render(<Timeline transactions={[]} genericEntities={[...stops, ...loads]} />);
    fireEvent.keyDown(track(), { key: "." });
    expect(selectedId()).toBe("s1");
    expect(usePlayhead.getState().playhead).toBe(stops[0].timestamp);
    expect(usePlayhead.getState().isPlaying).toBe(false);
  });

  it("walks forward and back, and a kind drawn as bars is not a step", () => {
    render(<Timeline transactions={[]} genericEntities={[...stops, ...loads]} />);
    fireEvent.keyDown(track(), { key: "." });
    fireEvent.keyDown(track(), { key: "." });
    expect(selectedId()).toBe("s2"); // not w1, the bar between them
    fireEvent.keyDown(track(), { key: "." });
    expect(selectedId()).toBe("s3"); // not w2
    fireEvent.keyDown(track(), { key: "," });
    expect(selectedId()).toBe("s2");
  });

  it("does nothing past the last event", () => {
    usePlayhead.setState({ playhead: MS1 });
    render(<Timeline transactions={[]} genericEntities={stops} />);
    fireEvent.keyDown(track(), { key: "." });
    expect(selectedId()).toBeNull();
    expect(usePlayhead.getState().playhead).toBe(MS1);
  });

  it("acts only on the track: the same key elsewhere does nothing", () => {
    render(<Timeline transactions={[]} genericEntities={stops} />);
    fireEvent.keyDown(document.body, { key: "." });
    fireEvent.keyDown(document.body, { key: "m" });
    expect(selectedId()).toBeNull();
    expect(usePlayhead.getState().markA).toBeNull();
  });

  it("m drops A, then B, and the gap between them is read out; m on a mark lifts it", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={stops} />);
    usePlayhead.setState({ playhead: MS0 + HOUR, isPlaying: false });
    fireEvent.keyDown(track(), { key: "m" });
    usePlayhead.setState({ playhead: MS0 + HOUR + 252_000 });
    fireEvent.keyDown(track(), { key: "m" });
    expect(container.querySelector("[data-marks-readout]")!.textContent).toBe("A to B · 4 min 12 s");
    fireEvent.keyDown(track(), { key: "m" }); // the playhead sits on B
    expect(usePlayhead.getState().markB).toBeNull();
    expect(container.querySelector("[data-marks-readout]")).toBeNull();
  });

  it("names its keys for assistive technology", () => {
    render(<Timeline transactions={[]} genericEntities={stops} />);
    expect(track().getAttribute("aria-keyshortcuts")).toBe(", . M");
  });
});

// INT-1: with a row alone, the step keys walk that row's events and no others.
describe("step keys with a row alone", () => {
  const teamStop = node("stop", { pivotable: ["team_id"] });
  const teamLoad = node("load", { magnitude: "weight", pivotable: ["team_id"] });
  const entity = (id: string, hours: number, team: string, extra: Record<string, unknown> = {}) =>
    manifestRowToEntity(id.startsWith("w") ? teamLoad : teamStop, { id, at: iso(hours), team_id: team, ...extra });
  // Team a has events at hours 1 and 5, team b at 2 and 3; a bar of a falls between them.
  const mixed = [entity("a1", 1, "a"), entity("b1", 2, "b"), entity("b2", 3, "b"), entity("a2", 5, "a"), entity("w1", 4, "a", { weight: 10 })];

  beforeEach(() => {
    usePlayhead.setState({ playhead: MS0, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1, isPlaying: false, markA: null, markB: null });
    useSchema.setState({ nodes: [teamStop, teamLoad], rows: { by: "team_id" }, fields: { team_id: { label: "Squad" } }, lanes: undefined });
    useSelection.setState({ selected: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
    useSolo.setState({ solo: null });
    useTrackBy.setState({ by: null });
  });
  afterEach(() => {
    useSolo.setState({ solo: null });
    useSchema.setState({ rows: undefined, fields: undefined, lanes: undefined });
  });

  it("walk every event with no row alone", () => {
    render(<Timeline transactions={[]} genericEntities={mixed} />);
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(track(), { key: "." });
      seen.push(selectedId());
    }
    expect(seen).toEqual(["a1", "b1", "b2", "a2"]);
  });

  it("visit the alone row's events only, forward and back", () => {
    render(<Timeline transactions={[]} genericEntities={mixed} />);
    act(() => useSolo.getState().toggle("team_id", "a"));
    fireEvent.keyDown(track(), { key: "." });
    expect(selectedId()).toBe("a1");
    fireEvent.keyDown(track(), { key: "." });
    expect(selectedId()).toBe("a2");
    fireEvent.keyDown(track(), { key: "." });
    expect(selectedId()).toBe("a2");
    fireEvent.keyDown(track(), { key: "," });
    expect(selectedId()).toBe("a1");
  });

  it("visit the events of a row whose value is padded or a number, when the solo holds the row's own value", () => {
    const padded = [entity("p1", 6, "p "), entity("p2", 7, "p"), entity("n1", 8, "n", { team_id: 42 }), entity("n2", 9, "n", { team_id: 42 })];
    render(<Timeline transactions={[]} genericEntities={[...mixed, ...padded]} />);
    act(() => useSolo.getState().toggle("team_id", "p"));
    fireEvent.keyDown(track(), { key: "." });
    expect(selectedId()).toBe("p1");
    fireEvent.keyDown(track(), { key: "." });
    expect(selectedId()).toBe("p2");
    act(() => useSolo.getState().toggle("team_id", "42"));
    fireEvent.keyDown(track(), { key: "." });
    expect(selectedId()).toBe("n1");
  });

  it("go back to every event when the solo is cleared", () => {
    render(<Timeline transactions={[]} genericEntities={mixed} />);
    act(() => useSolo.getState().toggle("team_id", "a"));
    act(() => useSolo.getState().clear());
    fireEvent.keyDown(track(), { key: "." });
    fireEvent.keyDown(track(), { key: "." });
    expect(selectedId()).toBe("b1");
  });
});
