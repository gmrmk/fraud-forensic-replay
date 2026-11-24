/**
 * The slider's spoken value carries the number of the row the focus stands in, as it carries the
 * number of the row that is alone, and never every row's. The fixture pack is written here, with words no pack uses: two teams whose bars share two
 * hours, so a row's number is told apart from the lane's sum.
 */
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
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

const HOUR = 3_600_000;
const MS0 = Date.parse("2026-05-12T00:00:00-05:00");
const MS1 = Date.parse("2026-06-01T00:00:00-05:00");
const at = (h: number): string => new Date(MS0 + h * HOUR).toISOString();

const stopNode: ScenarioNode = {
  kind: "stop", label: "Stop", palette: "#ffb347", source: "sql", coords: null, timestamp: "at", primary: "${id}", pivotable: ["team_id"],
};
const loadNode: ScenarioNode = {
  kind: "load", label: "Load", palette: "#ffd166", source: "sql", coords: null, timestamp: "at", primary: "${id}", pivotable: ["team_id"],
  magnitude: "weight", magnitudeLabel: "Weight", magnitudeUnit: "kg",
};
// Team a: 10 kg in hour 24 and 30 kg in hour 25. Team b: 40 kg in hour 25 and 20 kg in hour 26.
const ENTITIES = [
  manifestRowToEntity(stopNode, { id: "s1", at: at(24), team_id: "a", team_name: "Team a" }),
  manifestRowToEntity(stopNode, { id: "s2", at: at(25), team_id: "b", team_name: "Team b" }),
  manifestRowToEntity(loadNode, { id: "w1", at: at(24), team_id: "a", team_name: "Team a", weight: 10 }),
  manifestRowToEntity(loadNode, { id: "w2", at: at(25), team_id: "a", team_name: "Team a", weight: 30 }),
  manifestRowToEntity(loadNode, { id: "w3", at: at(25), team_id: "b", team_name: "Team b", weight: 40 }),
  manifestRowToEntity(loadNode, { id: "w4", at: at(26), team_id: "b", team_name: "Team b", weight: 20 }),
];

const slider = (c: HTMLElement): HTMLElement => c.querySelector('[role="slider"]') as HTMLElement;
const spoken = (c: HTMLElement): string => slider(c).getAttribute("aria-valuetext") ?? "";
const nameOf = (c: HTMLElement, name: string): HTMLElement =>
  [...c.querySelectorAll<HTMLElement>("[data-track-name]")].find((n) => n.getAttribute("aria-label") === name) as HTMLElement;
const atHour = (h: number) => act(() => usePlayhead.setState({ playhead: MS0 + h * HOUR }));

beforeEach(() => {
  localStorage.clear();
  useLayers.setState({ collapsedLanes: [], barSize: "open" });
  useClockForm.setState({ h24: false });
  usePlayhead.setState({
    playhead: MS0 + 25.5 * HOUR, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1,
    isPlaying: false, isScrubbing: false, playbackRate: 1,
  });
  useSchema.setState({ nodes: [stopNode, loadNode], rows: { by: "team_id", name: "team_name" }, fields: { team_id: { label: "Squad" } }, lanes: undefined });
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

describe("the slider's spoken value and the row the focus stands in", () => {
  it("carries no row's number while the focus is on no row", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    expect(spoken(container)).toMatch(/Load Weight 70 kg$/);
    expect(spoken(container)).not.toContain("Team");
  });

  it("gains the focused row's number, in the form of the alone row's, and loses it when the focus leaves the rows", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    const a = nameOf(container, "Team a");
    act(() => fireEvent.focus(a));
    expect(spoken(container)).toMatch(/Load Weight 70 kg, Team a 30 kg$/);
    act(() => fireEvent.focus(nameOf(container, "Team b")));
    expect(spoken(container)).toMatch(/Load Weight 70 kg, Team b 40 kg$/);
    act(() => fireEvent.blur(nameOf(container, "Team b"), { relatedTarget: null }));
    expect(spoken(container)).toMatch(/Load Weight 70 kg$/);
    expect(spoken(container)).not.toContain("Team");
  });

  it("follows the playhead to the focused row's bar at the hour the playhead stands in, and names no number where the row has no bar", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    act(() => fireEvent.focus(nameOf(container, "Team b")));
    atHour(26.5);
    expect(spoken(container)).toMatch(/Load Weight 20 kg, Team b 20 kg$/);
    atHour(24.5);
    expect(spoken(container)).toMatch(/Load Weight 10 kg$/);
    expect(spoken(container)).not.toContain("Team");
  });

  it("names the row's number once when the focused row is the row that is alone", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    act(() => useSolo.getState().toggle("team_id", "a"));
    expect(spoken(container)).toMatch(/Load Weight 30 kg, Team a 30 kg$/);
    act(() => fireEvent.focus(nameOf(container, "Team a")));
    expect(spoken(container).match(/Team a/g)).toHaveLength(1);
  });

  it("never carries every row's number: one focused row adds one number", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={ENTITIES} />);
    act(() => fireEvent.focus(nameOf(container, "Team a")));
    expect(spoken(container).match(/Team [ab]/g)).toHaveLength(1);
  });
});
