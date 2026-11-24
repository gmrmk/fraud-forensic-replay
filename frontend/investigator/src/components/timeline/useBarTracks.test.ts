/**
 * The bar's data plumbing: the rows, the lanes, and the
 * one derivation of a solo, all keyed on data and never on the playhead. Every fixture is written
 * here, with names no pack uses.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import type { Entity } from "../../lib/entity";
import { narrowByShown } from "../../lib/marks/draw";
import type { ScenarioFieldWords, ScenarioLane, ScenarioNode, ScenarioRows } from "../../lib/scenarios";
import { useLayers } from "../../store/layers";
import { useSchema } from "../../store/schema";
import { useSelection } from "../../store/selection";
import { useSolo } from "../../store/solo";
import { useTrackBy } from "../../store/track-by";
import { usePlayhead } from "../../store/playhead";
import { useTheme } from "../../store/theme";
import { COLOR_MODES, THEMES, type ColorMode, type Theme } from "../../theme/axes";
import type { Transaction } from "../../types";
import { useBarTracks } from "./useBarTracks";

// narrowByShown is wrapped, not replaced: every call and its result are kept, so a test can read that
// a narrowing with nothing switched off hands its input back by reference.
vi.mock("../../lib/marks/draw", async (original) => {
  const real = await original<typeof import("../../lib/marks/draw")>();
  return { ...real, narrowByShown: vi.fn(real.narrowByShown) };
});

const HOUR = 3_600_000;
const T0 = Date.parse("2026-06-08T00:00:00-05:00");
const iso = (hours: number): string => new Date(T0 + hours * HOUR).toISOString();

const node = (kind: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind, label: kind[0].toUpperCase() + kind.slice(1), palette: "#7ee787", source: "json", coords: null, timestamp: "at",
  primary: "${id}", pivotable: ["team_id"], ...extra,
});
const nodes: ScenarioNode[] = [
  node("stop"),
  node("reading"),
  node("load", { palette: "#f5a623", magnitude: "weight", magnitudeLabel: "Weight", magnitudeUnit: "kg" }),
];
const rows: ScenarioRows = { by: "team_id", name: "team_name" };
const fields: Record<string, ScenarioFieldWords> = { team_id: { label: "Squad" } };
// A lane of the largest reading in each hour: not a sum, so no row takes a bar from it.
const peak: ScenarioLane = {
  id: "peak", name: "Readings", label: "Highest level", unit: "lvl", kinds: ["reading"], field: "level", bucket: "hour", aggregate: "max",
};

let seq = 0;
const make = (kind: string, team: string, hours: number, extra: Record<string, unknown> = {}): Entity =>
  manifestRowToEntity(nodes.find((n) => n.kind === kind)!, { id: `${kind[0]}${++seq}`, at: iso(hours), team_id: team, team_name: `Team ${team}`, ...extra });

const entities = (): Entity[] => [
  make("stop", "a", 1), make("stop", "a", 2), make("stop", "b", 2), make("stop", "b", 5),
  make("reading", "a", 2, { level: 9 }), make("reading", "a", 3, { level: 5 }), make("reading", "b", 2, { level: 100 }),
  // Bars: a has 216 and 4 in hour 2 and 50 in hour 3; b has 30 in hour 2 and 10 in hour 3.
  make("load", "a", 2, { weight: 216 }), make("load", "a", 2, { weight: 4 }), make("load", "a", 3, { weight: 50 }),
  make("load", "b", 2, { weight: 30 }), make("load", "b", 3, { weight: 10 }),
];

// The lists are stable, as the ones the app hands the Timeline are: a new array at each render would redo the model.
const NO_TRANSACTIONS: Transaction[] = [];
const run = (all: Entity[] = entities()) => renderHook(() => useBarTracks({ transactions: NO_TRANSACTIONS, genericEntities: all }));

describe("useBarTracks", () => {
  beforeEach(() => {
    useSchema.setState({ nodes, rows, fields, lanes: [peak] });
    useSolo.setState({ solo: null });
    useTrackBy.setState({ by: null });
    usePlayhead.setState({ playhead: T0, minTime: T0, maxTime: T0 + 8 * HOUR, windowMin: T0, windowMax: T0 + 8 * HOUR, isPlaying: false });
  });

  it("builds the rows from the manifest's grouping and finds no rows where the pack declares none", () => {
    const { result } = run();
    expect(result.current.set?.by).toBe("team_id");
    expect(result.current.set?.heading).toBe("Squad");
    expect(result.current.set?.tracks.map((t) => t.name)).toEqual(["Team a", "Team b"]);
    useSchema.setState({ rows: undefined });
    expect(run().result.current.set).toBeNull();
  });

  it("a lane that is not a sum gives its rows no bars, and a sum lane of a node still adds up to its rows in every hour", () => {
    const { result } = run();
    const { set, lanes } = result.current;
    expect(lanes.map((l) => l.id)).toEqual(["load", "peak"]);
    const byHour = new Map<number, number>();
    for (const t of set!.tracks) for (const b of t.bars) byHour.set(b.t, (byHour.get(b.t) ?? 0) + b.value);
    // The rows' bars are the sum lane's, hour by hour, and nothing of the readings (9, 5, 100) is in them.
    expect([...byHour].sort((a, b) => a[0] - b[0])).toEqual(lanes[0].bars.map((b) => [b.t, b.value]));
    expect(lanes[0].bars.map((b) => b.value)).toEqual([250, 60]);
    expect(set!.tracks.find((t) => t.name === "Team a")!.bars.map((b) => b.value)).toEqual([220, 50]);
  });

  it("with no solo the lists are the case's own, by reference", () => {
    const all = entities();
    const { result } = run(all);
    expect(result.current.solo).toBeNull();
    expect(result.current.rows.genericEntities).toBe(all);
    expect(result.current.stepEvents).toBe(result.current.allEvents);
  });

  it("a solo narrows the events, the lists and the lanes by one derivation, and the bars of the row survive it", () => {
    const { result } = run();
    const whole = result.current;
    act(() => useSolo.getState().toggle("team_id", "a"));
    const alone = result.current;
    expect(alone.solo).toEqual({ key: "v:a", name: "Team a" });
    // The step keys walk the soloed row's events (its two stops and its two readings), and the
    // case's whole list stays whole (seven events).
    expect(alone.stepEvents).toHaveLength(4);
    expect(alone.stepEvents.every((e) => e.match.kind === "entity" && e.match.entity.fields.team_id === "a")).toBe(true);
    expect(alone.allEvents).toHaveLength(7);
    expect(whole.allEvents).toHaveLength(7);
    expect(alone.rows.genericEntities?.every((e) => e.fields.team_id === "a")).toBe(true);
    // The sum lane's top is the soloed row's largest hourly bar over the whole case, 220; it is the
    // row's own bars, so the bars of the bar kind are still there.
    expect(alone.lanes[0].bars.map((b) => b.value)).toEqual([220, 50]);
    expect(alone.lanes[0].scale.top).toBe(220);
    // The lane that is not a sum keeps the top it had with no solo, and shows the row's readings.
    expect(alone.lanes[1].scale.top).toBe(whole.lanes[1].scale.top);
    expect(alone.lanes[1].bars.map((b) => b.value)).toEqual([9, 5]);
  });

  it("a solo of a value no row has, or of another field than the grouping, narrows nothing", () => {
    const { result } = run();
    act(() => useSolo.getState().toggle("team_id", "nobody"));
    expect(result.current.solo).toBeNull();
    expect(result.current.stepEvents).toBe(result.current.allEvents);
    act(() => useSolo.getState().toggle("device_id", "a"));
    expect(result.current.solo).toBeNull();
  });

  it("holds its model across a tick of the playhead: the rows, the lanes and the grids keep their identity", () => {
    const { result, rerender } = run();
    const before = result.current;
    act(() => usePlayhead.setState({ playhead: T0 + 3 * HOUR }));
    rerender();
    expect(result.current.set).toBe(before.set);
    expect(result.current.lanes).toBe(before.lanes);
    expect(result.current.grids).toBe(before.grids);
    expect(result.current.ticks).toBe(before.ticks);
  });

  // INT-1b (a): section 8 (Solo), a lane the one row has no value for stays, with no bars and the row's name.
  it("a lane the soloed row has no value for stays, with no bars, in its place", () => {
    const { result } = run([...entities(), make("stop", "c", 4)]);
    act(() => useSolo.getState().toggle("team_id", "c"));
    const alone = result.current;
    expect(alone.solo).toEqual({ key: "v:c", name: "Team c" });
    expect(alone.lanes.map((l) => l.id)).toEqual(["load", "peak"]);
    expect(alone.lanes.map((l) => l.bars.length)).toEqual([0, 0]);
    // The lane keeps the case's step, and an empty lane draws no grid (the head reads the lanes that have bars).
    expect(alone.lanes.map((l) => l.step)).toEqual([HOUR, HOUR]);
    expect(alone.grids).toEqual([]);
    // Clear it and the lanes have their bars again.
    act(() => useSolo.getState().clear());
    expect(result.current.lanes.map((l) => l.bars.length)).toEqual([2, 2]);
  });

  // INT-1b (b): the rows trim and write a number as text, and the solo matches the same reading.
  it("a row whose value is padded or a number can be put alone, and its records stay", () => {
    const all = [...entities(), make("stop", "d ", 3), make("stop", "d", 4), make("load", "d ", 4, { weight: 7 }), make("stop", "x", 6, { team_id: 42 }), make("load", "x", 6, { team_id: 42, weight: 3 })];
    const { result } = run(all);
    expect(result.current.set?.tracks.map((t) => t.key)).toEqual(expect.arrayContaining(["v:d", "v:42"]));
    // The row's key is what a press on its name sends to the solo.
    act(() => useSolo.getState().toggle("team_id", "d"));
    expect(result.current.solo).toEqual({ key: "v:d", name: "Team d" });
    expect(result.current.stepEvents).toHaveLength(2);
    expect(result.current.lanes[0].bars.map((b) => b.value)).toEqual([7]);
    // The row has a load and no reading: the second lane stays, empty (the design's own case).
    expect(result.current.lanes.map((l) => [l.id, l.bars.length])).toEqual([["load", 1], ["peak", 0]]);
    act(() => useSolo.getState().toggle("team_id", "42"));
    expect(result.current.solo?.key).toBe("v:42");
    expect(result.current.stepEvents).toHaveLength(1);
    expect(result.current.lanes[0].bars.map((b) => b.value)).toEqual([3]);
    // A solo that holds the padded text, as a link might, finds the same row.
    act(() => useSolo.getState().clear());
    act(() => useSolo.setState({ solo: { field: "team_id", value: " d " } }));
    expect(result.current.solo?.key).toBe("v:d");
    expect(result.current.stepEvents).toHaveLength(2);
  });

  // INT-1b (c): a solo that names no row is cleared, but only once rows exist.
  describe("a stored solo that names no row", () => {
    it("is cleared once the rows have loaded and none is named by it", () => {
      useSolo.setState({ solo: { field: "team_id", value: "nobody" } });
      run();
      expect(useSolo.getState().solo).toBeNull();
    });

    it("is cleared when the grouping in force is another field", () => {
      useSolo.setState({ solo: { field: "device_id", value: "a" } });
      run();
      expect(useSolo.getState().solo).toBeNull();
    });

    it("is kept while no rows exist: no grouping declared, or no event loaded yet", () => {
      useSolo.setState({ solo: { field: "team_id", value: "a" } });
      useSchema.setState({ rows: undefined });
      run();
      expect(useSolo.getState().solo).toEqual({ field: "team_id", value: "a" });
      useSchema.setState({ rows });
      run([]);
      expect(useSolo.getState().solo).toEqual({ field: "team_id", value: "a" });
    });

    it("is kept when a row names it, and is cleared when the data then loses the row", () => {
      useSolo.setState({ solo: { field: "team_id", value: "a" } });
      const { result, rerender } = renderHook(({ list }) => useBarTracks({ transactions: NO_TRANSACTIONS, genericEntities: list }), { initialProps: { list: entities() } });
      expect(useSolo.getState().solo).toEqual({ field: "team_id", value: "a" });
      expect(result.current.solo?.key).toBe("v:a");
      rerender({ list: entities().filter((e) => e.fields.team_id !== "a") });
      expect(useSolo.getState().solo).toBeNull();
    });

    it("is cleared when the grouping changes to another field", () => {
      const { result } = run();
      act(() => useSolo.getState().toggle("team_id", "a"));
      expect(result.current.solo?.key).toBe("v:a");
      act(() => useTrackBy.setState({ by: "device_id" }));
      expect(useSolo.getState().solo).toBeNull();
    });
  });

  // INT-1b (d): the lane's top comes from the soloed row over the whole case, never from the zoom window.
  it("with a row alone and a window that leaves out its peak hour, the sum lane's top stays at the peak", () => {
    const { result } = run();
    act(() => useSolo.getState().toggle("team_id", "a"));
    expect(result.current.lanes[0].scale.top).toBe(220);
    // Team a's peak, 220, is in hour 2; the window shows hours 3 to 6 only.
    act(() => usePlayhead.setState({ windowMin: T0 + 3 * HOUR, windowMax: T0 + 6 * HOUR }));
    const zoomed = result.current;
    expect(zoomed.lanes[0].scale).toMatchObject({ top: 220, max: 220 });
    expect(zoomed.lanes[0].bars.map((b) => b.value)).toEqual([220, 50]);
    // The lane that is not a sum keeps the top it has with no solo, in the same window.
    act(() => useSolo.getState().clear());
    const whole = result.current.lanes[1].scale.top;
    act(() => useSolo.getState().toggle("team_id", "a"));
    expect(result.current.lanes[1].scale.top).toBe(whole);
  });

  it("gives each lane's bucket grid, which sets where the faint part starts", () => {
    const { result } = run();
    expect(result.current.grids).toEqual([
      { step: HOUR, firstBucketStart: T0 + 2 * HOUR },
      { step: HOUR, firstBucketStart: T0 + 2 * HOUR },
    ]);
  });
});

// ---- INT-5: the Timeline's kind lines and the lanes' lines (calls 16 and 17) ---------------------
const carrierFields: Record<string, ScenarioFieldWords> = { team_id: { label: "Squad" }, carrier: { label: "Carrier" } };
// The node's own lane declares its depth by an entry that holds only its id and a depth.
const depthLanes = [peak, { id: "load", depth: { split: "carrier" } }] as unknown as ScenarioLane[];
const carried = (): Entity[] => [
  make("stop", "a", 1), make("stop", "a", 2), make("stop", "b", 2), make("stop", "b", 5),
  make("reading", "a", 2, { level: 9 }), make("reading", "a", 3, { level: 5 }), make("reading", "b", 2, { level: 100 }),
  make("load", "a", 2, { weight: 216, carrier: "x" }), make("load", "a", 2, { weight: 4, carrier: "x" }), make("load", "a", 3, { weight: 50, carrier: "y" }),
  make("load", "b", 2, { weight: 30, carrier: "x" }), make("load", "b", 3, { weight: 10, carrier: "y" }),
];

describe("useBarTracks: depth", () => {
  beforeEach(() => {
    useSchema.setState({ nodes, rows, fields: carrierFields, lanes: depthLanes });
    useSolo.setState({ solo: null });
    useTrackBy.setState({ by: null });
    useLayers.setState({ collapsedLanes: [] });
    usePlayhead.setState({ playhead: T0, minTime: T0, maxTime: T0 + 8 * HOUR, windowMin: T0, windowMax: T0 + 8 * HOUR, isPlaying: false });
  });
  afterEach(() => {
    useLayers.setState({ collapsedLanes: [] });
  });

  it("a line for each kind of event, the kind with the most first, by the manifest's label; the total is the rail's number", () => {
    const { result } = run(carried());
    const { kinds } = result.current;
    expect(kinds).toBeDefined();
    expect(kinds.lines.map((l) => [l.name, l.count])).toEqual([["Stop", 4], ["Reading", 3]]);
    expect(kinds.total).toBe(7);
    expect(kinds.open).toBe(false);
    act(() => kinds.toggle());
    expect(result.current.kinds.open).toBe(true);
  });

  it("with a row alone the lines keep the case's kinds and count the row's events, and the track's ticks are the row's", () => {
    const { result } = run(carried());
    const whole = result.current;
    expect(whole.trackTicks).toBe(whole.ticks);
    act(() => useSolo.getState().toggle("team_id", "a"));
    const alone = result.current;
    expect(alone.kinds.lines.map((l) => [l.name, l.count])).toEqual([["Stop", 2], ["Reading", 2]]);
    expect(alone.kinds.total).toBe(4);
    expect(alone.trackTicks.map((t) => t.id).sort()).toEqual(alone.stepEvents.map((e) => e.id).sort());
    expect(alone.trackTicks.length).toBe(4);
    expect(alone.ticks.length).toBe(7);
  });

  it("offers no kind line when the pack has no rows, or has one kind of event", () => {
    useSchema.setState({ rows: undefined });
    expect(run(carried()).result.current.kinds.lines).toEqual([]);
    useSchema.setState({ rows });
    expect(run(carried().filter((e) => e.kind !== "reading")).result.current.kinds.lines).toEqual([]);
  });

  it("a lane that declares a depth has a line for each value of the field, busiest first, in the manifest's label", () => {
    const { result } = run(carried());
    const { laneLines } = result.current;
    expect([...laneLines.keys()]).toEqual(["load"]);
    const depth = laneLines.get("load")!;
    expect(depth.label).toBe("Carrier");
    expect(depth.lines.map((l) => [l.name, l.total])).toEqual([["x", 250], ["y", 60]]);
    expect(depth.open).toBe(false);
    // The lines add up to the lane's bar in every hour.
    const lane = result.current.lanes[0];
    const sum = new Map<number, number>();
    for (const line of depth.lines) for (const b of line.lane.bars) sum.set(b.t, (sum.get(b.t) ?? 0) + b.value);
    expect([...sum].sort((a, b) => a[0] - b[0])).toEqual(lane.bars.map((b) => [b.t, b.value]));
  });

  it("a lane with no declared depth, or a pack with no rows, has no lines", () => {
    useSchema.setState({ lanes: [peak] });
    expect(run(carried()).result.current.laneLines.size).toBe(0);
    useSchema.setState({ lanes: depthLanes, rows: undefined });
    expect(run(carried()).result.current.laneLines.size).toBe(0);
  });

  it("with a row alone the lines are that row's", () => {
    const { result } = run(carried());
    act(() => useSolo.getState().toggle("team_id", "a"));
    const depth = result.current.laneLines.get("load")!;
    expect(depth.lines.map((l) => [l.name, l.total])).toEqual([["x", 220], ["y", 50]]);
  });

  it("the room the depth takes counts an open block and nothing else", () => {
    const { result } = run(carried());
    expect(result.current.depthPx).toBe(0);
    act(() => result.current.setLaneLinesOpen("load", true));
    expect(result.current.laneLines.get("load")!.open).toBe(true);
    expect(result.current.depthPx).toBe(2 * 27);
    act(() => result.current.kinds.toggle());
    expect(result.current.depthPx).toBe(2 * 27 + 2 * 18);
    // A folded lane draws no lines, so it takes no room (r3 R3): the open flag is kept, the px go.
    act(() => useLayers.setState({ collapsedLanes: ["load"] }));
    expect(result.current.laneLines.get("load")!.open).toBe(true);
    expect(result.current.depthPx).toBe(2 * 18);
    act(() => useLayers.setState({ collapsedLanes: [] }));
    act(() => result.current.setLaneLinesOpen("load", false));
    act(() => result.current.kinds.toggle());
    expect(result.current.depthPx).toBe(0);
  });

  it("holds its depth across a tick of the playhead: the lines keep their identity", () => {
    const { result, rerender } = run(carried());
    const before = result.current;
    act(() => usePlayhead.setState({ playhead: T0 + 3 * HOUR }));
    rerender();
    expect(result.current.kinds.lines).toBe(before.kinds.lines);
    expect(result.current.laneLines).toBe(before.laneLines);
    expect(result.current.trackTicks).toBe(before.trackTicks);
    expect(result.current.depthPx).toBe(before.depthPx);
  });
});

// C0: a decision kind is an overlay only while the manifest can place it. Where no node declares
// coords, its rows are step events: a tick, a row of the track set (a rest row named by the kind's
// label when the record has no grouping value), and a kind the dots paint in the manifest's colour.
describe("a decision kind in a manifest that places nothing", () => {
  const ruling = node("ruling", {
    label: "Ruling", palette: "#ff6b6b", pivotable: [],
    decision: { status: "state", outcome: "finding", note: "memo", actor: "who", target: "subject", key: "acct", event: "worked" },
  });
  const rulingRow = (): Entity => manifestRowToEntity(ruling, { id: "r1", at: iso(4), state: "FAIL", finding: "Takeover" });
  beforeEach(() => {
    useSchema.setState({ nodes, rows, fields, lanes: [peak] });
    useSolo.setState({ solo: null });
    useTrackBy.setState({ by: null });
    usePlayhead.setState({ playhead: T0, minTime: T0, maxTime: T0 + 8 * HOUR, windowMin: T0, windowMax: T0 + 8 * HOUR, isPlaying: false });
  });

  it("is a step event, a tick and a rest row named by the kind's label, and the step events hold it", () => {
    useSchema.setState({ nodes: [...nodes, ruling] });
    const { result } = run([...entities(), rulingRow()]);
    expect(result.current.allEvents.map((e) => e.id)).toContain("r1");
    expect(result.current.stepEvents).toBe(result.current.allEvents);
    expect(result.current.ticks.find((t) => t.id === "r1")?.kind).toBe("ruling");
    const rest = result.current.set!.tracks.filter((t) => t.rest);
    expect(rest.map((t) => [t.key, t.name])).toEqual([["k:ruling", "Ruling"]]);
    // The dots paint it as its own kind, in the manifest's colour, not as an authorization.
    expect(result.current.dots.kindFor("ruling")).toBe("ruling");
    expect(result.current.dots.paint("ruling")).toBe("rgb(255 107 107)");
    expect(result.current.dots.kindLabel("ruling")).toBe("Ruling");
  });

  it("is left out as today when some node of the manifest declares coords", () => {
    const placed = node("stop", { coords: { lat: "y", lng: "x" } });
    useSchema.setState({ nodes: [placed, ruling] });
    const { result } = run([make("stop", "a", 1), rulingRow()]);
    expect(result.current.allEvents.map((e) => e.id)).not.toContain("r1");
    expect(result.current.ticks.map((t) => t.id)).not.toContain("r1");
    expect(result.current.set!.tracks.filter((t) => t.rest)).toEqual([]);
    expect(result.current.dots.kindFor("ruling")).toBe("auth");
  });
});

// The Layers switches (C3 c, C5 b): a switched-off kind or value leaves every list the bar draws, before
// the solo. Before item 1 PIN_WINS is false, so nothing here asserts a pin's win.
describe("useBarTracks: the Layers switches", () => {
  // The stop node declares a filter on the field the rows group by, so a value of it can be switched off.
  const filtered: ScenarioNode[] = [node("stop", { filter: { field: "team_id", label: "Squad" } }), node("reading"), nodes[2]];
  const hide = (over: { hiddenKinds?: string[]; hiddenValues?: Record<string, string[]> }) => act(() => useLayers.setState(over));

  beforeEach(() => {
    useSchema.setState({ nodes: filtered, rows, fields, lanes: [peak] });
    useSolo.setState({ solo: null });
    useTrackBy.setState({ by: null });
    useSelection.setState({ selected: null });
    useLayers.setState({ hiddenKinds: [], hiddenValues: {} });
    usePlayhead.setState({ playhead: T0, minTime: T0, maxTime: T0 + 8 * HOUR, windowMin: T0, windowMax: T0 + 8 * HOUR, isPlaying: false });
  });
  afterEach(() => {
    useLayers.setState({ hiddenKinds: [], hiddenValues: {} });
    useSelection.setState({ selected: null });
  });

  const kindsOf = (list: readonly { match: { kind: string; entity?: Entity } }[]): string[] => [...new Set(list.map((e) => e.match.entity?.kind ?? e.match.kind))].sort();

  it("(a) a switched-off kind leaves the events, the dots, the step keys, the rows' lists and its lane; the other lane keeps its bars", () => {
    const { result } = run();
    expect(result.current.lanes.map((l) => l.id)).toEqual(["load", "peak"]);
    hide({ hiddenKinds: ["reading"] });
    const t = result.current;
    expect(kindsOf(t.allEvents)).toEqual(["stop"]);
    expect(t.allEvents).toHaveLength(4);
    expect(t.ticks.map((x) => x.kind)).not.toContain("reading");
    expect(kindsOf(t.stepEvents)).toEqual(["stop"]);
    expect(t.rows.genericEntities?.some((e) => e.kind === "reading")).toBe(false);
    expect(t.lanes.map((l) => l.id)).toEqual(["load"]);
    expect(t.lanes[0].bars.length).toBeGreaterThan(0);
  });

  it("(b) a switched-off value of a kind that declares a filter leaves that value's records only", () => {
    const { result } = run();
    hide({ hiddenValues: { stop: ["b"] } });
    const stops = result.current.allEvents.filter((e) => e.match.kind === "entity" && e.match.entity.kind === "stop");
    expect(stops.map((e) => (e.match.kind === "entity" ? e.match.entity.fields.team_id : null))).toEqual(["a", "a"]);
    expect(result.current.allEvents.filter((e) => e.match.kind === "entity" && e.match.entity.kind === "reading")).toHaveLength(3);
  });

  it("(c) with a kind off, the control counts the events the track draws over every event of the case", () => {
    const { result } = run();
    hide({ hiddenKinds: ["reading"] });
    const { kinds } = result.current;
    expect(kinds.lines.map((l) => l.name)).toEqual(["Stop"]);
    expect(kinds.total).toBe(4);
    expect(kinds.all).toBe(7);
    expect(kinds.offered).toBe(true);
  });

  it("(d) with every kind off, the control is still offered and reads nothing shown out of all", () => {
    const { result } = run();
    hide({ hiddenKinds: ["stop", "reading", "load"] });
    const { kinds } = result.current;
    expect(kinds.lines).toEqual([]);
    expect(kinds.total).toBe(0);
    expect(kinds.all).toBe(7);
    expect(kinds.offered).toBe(true);
    expect(result.current.set).not.toBeNull();
  });

  it("(e) with nothing off, nothing is rebuilt: the lists are the case's own and all equals the total", () => {
    const all = entities();
    const { result } = run(all);
    expect(result.current.kinds.all).toBe(result.current.kinds.total);
    expect(result.current.kinds.all).toBe(7);
    expect(result.current.kinds.offered).toBe(true);
    expect(result.current.shownCase.genericEntities).toBe(all);
    expect(result.current.shownCase.transactions).toBe(NO_TRANSACTIONS);
    expect(result.current.rows.genericEntities).toBe(all);
    expect(result.current.stepEvents).toBe(result.current.allEvents);
  });

  it("(f) with a row alone and a kind off, the control counts that row's shown events over that row's events", () => {
    const { result } = run();
    act(() => useSolo.getState().toggle("team_id", "a"));
    hide({ hiddenKinds: ["reading"] });
    expect(result.current.solo?.key).toBe("v:a");
    expect(result.current.kinds.total).toBe(2);
    expect(result.current.kinds.all).toBe(4);
  });

  it("(f2) with a row alone and nothing off, all equals the total, so the control reads today's text", () => {
    const { result } = run();
    act(() => useSolo.getState().toggle("team_id", "a"));
    expect(result.current.solo?.key).toBe("v:a");
    expect(result.current.kinds.total).toBe(4);
    expect(result.current.kinds.all).toBe(4);
    expect(result.current.kinds.offered).toBe(true);
  });

  it("(g) a tick of the playhead keeps the model by identity while a kind is off", () => {
    const { result, rerender } = run();
    hide({ hiddenKinds: ["reading"] });
    const before = result.current;
    act(() => usePlayhead.setState({ playhead: T0 + 3 * HOUR }));
    rerender();
    expect(result.current.set).toBe(before.set);
    expect(result.current.lanes).toBe(before.lanes);
    expect(result.current.grids).toBe(before.grids);
    expect(result.current.ticks).toBe(before.ticks);
    expect(result.current.kinds.lines).toBe(before.kinds.lines);
  });

  it("(h) a switch that leaves the row that is alone with no record ends the solo", () => {
    const { result } = run();
    act(() => useSolo.getState().toggle("team_id", "b"));
    expect(result.current.solo?.key).toBe("v:b");
    // Row b's stops go by their value, its readings and loads by their kinds; row a keeps its stops.
    hide({ hiddenValues: { stop: ["b"] }, hiddenKinds: ["reading", "load"] });
    expect(useSolo.getState().solo).toBeNull();
    expect(result.current.solo).toBeNull();
    expect(result.current.set?.tracks.map((t) => t.name)).toEqual(["Team a"]);
  });

  it("(j) switchesHide says whether the switches took anything out of the case: false with nothing off, true with a kind or a value off", () => {
    const { result } = run();
    expect(result.current.switchesHide).toBe(false);
    hide({ hiddenKinds: ["reading"] });
    expect(result.current.switchesHide).toBe(true);
    hide({ hiddenKinds: [], hiddenValues: { stop: ["b"] } });
    expect(result.current.switchesHide).toBe(true);
    hide({ hiddenKinds: [], hiddenValues: {} });
    expect(result.current.switchesHide).toBe(false);
  });

  it("(i) the case before the solo holds every record the switches show, and a solo is not applied to it", () => {
    const { result } = run();
    act(() => useSolo.getState().toggle("team_id", "a"));
    hide({ hiddenKinds: ["reading"] });
    const generic = result.current.shownCase.genericEntities ?? [];
    expect(generic.some((e) => e.kind === "reading")).toBe(false);
    expect(generic.filter((e) => e.kind === "stop")).toHaveLength(4);
    expect(generic.filter((e) => e.kind === "load")).toHaveLength(5);
    // The rows' lists are the narrowed ones, the soloed row's alone.
    expect(result.current.rows.genericEntities?.every((e) => e.fields.team_id === "a")).toBe(true);
  });

  // The selected record keeps its dot, its mark, its row in the lists and its place in the counts (the
  // model's rule, which draw.ts keeps), but the rows and the measure lanes are sums over a kind: while
  // the kind or the value is off they leave, selected record or not.
  describe("a selected record of a switched-off kind or value", () => {
    const rowOf = (t: ReturnType<typeof run>["result"]["current"], name: string) => t.set?.tracks.find((r) => r.name === name);
    const select = (e: Entity) => act(() => useSelection.getState().selectEntity(e));

    it("(k) a kind off with one of its records selected: the record stays in the events, the kind line and the counts, and no row and no lane holds it", () => {
      const all = entities();
      const reading = all.find((e) => e.kind === "reading" && e.fields.team_id === "a" && e.fields.level === 9)!;
      const { result } = run(all);
      hide({ hiddenKinds: ["reading"] });
      select(reading);
      const t = result.current;
      // Single records: the selected record stays in the events, the step keys, the dots and the case lists.
      expect(t.allEvents.filter((e) => e.match.kind === "entity" && e.match.entity.kind === "reading").map((e) => e.id)).toEqual([reading.id]);
      expect(t.stepEvents.map((e) => e.id)).toContain(reading.id);
      expect(t.ticks.map((x) => x.id)).toContain(reading.id);
      expect(t.shownCase.genericEntities?.filter((e) => e.kind === "reading").map((e) => e.id)).toEqual([reading.id]);
      // The kind line stays with count 1, and the control counts it: 4 stops and the reading of 7.
      expect(t.kinds.lines.map((l) => [l.name, l.count])).toEqual([["Stop", 4], ["Reading", 1]]);
      expect(t.kinds.total).toBe(5);
      expect(t.kinds.all).toBe(7);
      // Sums over the kind: no row holds the record, and the lane built from that kind is gone.
      expect(t.set?.trackOf.has(reading.id)).toBe(false);
      expect(rowOf(t, "Team a")?.count).toBe(2);
      expect(rowOf(t, "Team a")?.kinds).toEqual([["Stop", 2]]);
      expect(rowOf(t, "Team b")?.count).toBe(2);
      expect(t.lanes.map((l) => l.id)).toEqual(["load"]);
      // The other kind's lane and its rows' bars are whole.
      expect(t.lanes[0].bars.length).toBeGreaterThan(0);
      expect(rowOf(t, "Team a")?.bars.length).toBeGreaterThan(0);
    });

    it("(k2) the rows' bars leave with a switched-off magnitude kind whose record is selected", () => {
      const all = entities();
      const load = all.find((e) => e.kind === "load" && e.fields.team_id === "a" && e.fields.weight === 216)!;
      const { result } = run(all);
      hide({ hiddenKinds: ["load"] });
      select(load);
      expect(result.current.set?.tracks.every((r) => r.bars.length === 0 && r.total === 0)).toBe(true);
      expect(result.current.lanes.map((l) => l.id)).toEqual(["peak"]);
    });

    it("(l) a value off with one of its records selected: the record stays in the single-record lists, and no row and no lane holds it", () => {
      // The reading node declares the filter too, so a value of it can be off; the b reading is the highest (100).
      const withFilter: ScenarioNode[] = [filtered[0], node("reading", { filter: { field: "team_id", label: "Squad" } }), filtered[2]];
      useSchema.setState({ nodes: withFilter, rows, fields, lanes: [peak] });
      const all = entities();
      const highest = all.find((e) => e.kind === "reading" && e.fields.team_id === "b")!;
      const { result } = run(all);
      hide({ hiddenValues: { reading: ["b"] } });
      select(highest);
      const t = result.current;
      expect(t.allEvents.some((e) => e.id === highest.id)).toBe(true);
      expect(t.ticks.some((x) => x.id === highest.id)).toBe(true);
      expect(t.kinds.lines.map((l) => [l.name, l.count])).toEqual([["Stop", 4], ["Reading", 3]]);
      // Not in the rows, and the lane reads the hour's highest of the readings that are on (9), not 100.
      expect(t.set?.trackOf.has(highest.id)).toBe(false);
      expect(rowOf(t, "Team b")?.kinds).toEqual([["Stop", 2]]);
      const peakLane = t.lanes.find((l) => l.id === "peak");
      expect(peakLane?.bars.find((b) => b.t === T0 + 2 * HOUR)?.value).toBe(9);
    });

    it("(m) with nothing off both narrowings hand their input back by reference, so a selected record and a tick rebuild nothing", () => {
      const all = entities();
      const some = all.find((e) => e.kind === "stop")!;
      vi.mocked(narrowByShown).mockClear();
      const { result, rerender } = run(all);
      select(some);
      const before = result.current;
      act(() => usePlayhead.setState({ playhead: T0 + 3 * HOUR }));
      rerender();
      const after = result.current;
      expect(after.set).toBe(before.set);
      expect(after.lanes).toBe(before.lanes);
      expect(after.grids).toBe(before.grids);
      expect(after.ticks).toBe(before.ticks);
      expect(after.allEvents).toBe(before.allEvents);
      expect(after.stepEvents).toBe(after.allEvents);
      expect(after.rows.genericEntities).toBe(all);
      expect(after.shownCase.genericEntities).toBe(all);
      // Every call of the one function, the lenient and the strict, gave its input itself.
      const calls = vi.mocked(narrowByShown).mock.calls;
      const results = vi.mocked(narrowByShown).mock.results;
      expect(calls.length).toBeGreaterThan(0);
      calls.forEach(([ctx], i) => expect(results[i].value).toBe(ctx));
      // The strict call is the model's own function with the selection cleared.
      expect(calls.some(([, s]) => s.selected === null)).toBe(true);
    });

    it("(n) the strict lists are the model's function with the selection cleared, and a tick rebuilds nothing while a kind is off and its record selected", () => {
      const all = entities();
      const reading = all.find((e) => e.kind === "reading")!;
      const { result, rerender } = run(all);
      hide({ hiddenKinds: ["reading"] });
      select(reading);
      const before = result.current;
      act(() => usePlayhead.setState({ playhead: T0 + 3 * HOUR }));
      rerender();
      expect(result.current.set).toBe(before.set);
      expect(result.current.lanes).toBe(before.lanes);
      expect(result.current.grids).toBe(before.grids);
      expect(result.current.ticks).toBe(before.ticks);
      expect(result.current.kinds.lines).toBe(before.kinds.lines);
      // Selecting nothing again takes the record out of the single-record lists and changes no row or lane.
      act(() => useSelection.getState().clear());
      expect(result.current.allEvents.some((e) => e.id === reading.id)).toBe(false);
      expect(result.current.set?.trackOf.has(reading.id)).toBe(false);
      expect(result.current.lanes.map((l) => l.id)).toEqual(["load"]);
    });

    it("(o) a solo's lanes follow the strict lists too: the soloed row's peak lane does not hold the selected reading of a kind that is off", () => {
      const all = entities();
      const reading = all.find((e) => e.kind === "reading" && e.fields.team_id === "a" && e.fields.level === 9)!;
      const { result } = run(all);
      act(() => useSolo.getState().toggle("team_id", "a"));
      hide({ hiddenKinds: ["reading"] });
      select(reading);
      expect(result.current.solo?.key).toBe("v:a");
      expect(result.current.lanes.map((l) => l.id)).toEqual(["load"]);
      // The track draws the soloed row's records, and the selected reading stays among them.
      expect(result.current.trackTicks.some((x) => x.id === reading.id)).toBe(true);
    });

    it("(p) a kind with exactly one record, that record selected and the kind off: the switches still hide it from the rows, so switchesHide is true, while the record keeps its place in the events and its kind line", () => {
      // The lenient narrowing loses nothing here (the one reading is the selected record), the strict one
      // loses it: switchesHide follows the strict one, so the rows' section can leave with the kind.
      const only = entities().filter((e) => e.kind !== "reading" || (e.fields.team_id === "a" && e.fields.level === 9));
      const reading = only.find((e) => e.kind === "reading")!;
      expect(only.filter((e) => e.kind === "reading")).toHaveLength(1);
      const { result } = run(only);
      hide({ hiddenKinds: ["reading"] });
      select(reading);
      const t = result.current;
      expect(t.switchesHide).toBe(true);
      expect(t.allEvents.filter((e) => e.match.kind === "entity" && e.match.entity.kind === "reading").map((e) => e.id)).toEqual([reading.id]);
      expect(t.kinds.lines.map((l) => [l.name, l.count])).toEqual([["Stop", 4], ["Reading", 1]]);
      // No row holds it, and the selected record leaving the selection ends nothing that was shown.
      expect(t.set?.trackOf.has(reading.id)).toBe(false);
      act(() => useSelection.getState().clear());
      expect(result.current.switchesHide).toBe(true);
    });
  });
});

// Test 3.2 (theme follow, C3.T2): the dots model, the lanes and the rows' bar take a story's own kinds'
// colour in the live theme and colour mode, and a kind that has a palette slot is not changed.
describe("useBarTracks: a story's own kinds follow the theme and the colour mode", () => {
  const manifests = Object.values(
    import.meta.glob<string>("../../../../../backend/scenarios/*.scenario.json", { query: "?raw", import: "default", eager: true }),
  ).map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[]; rows?: ScenarioRows; fields?: Record<string, ScenarioFieldWords> });
  const manifestOf = (id: string) => {
    const found = manifests.find((m) => m.id === id);
    if (!found) throw new Error(`no scenario file with id ${id}`);
    return found;
  };
  const keyNet = manifestOf("key-many-networks");
  const usageNode = keyNet.nodes.find((n) => n.kind === "usage_day")!;
  const usageDay = (id: string, hours: number, requests: number): Entity =>
    manifestRowToEntity(usageNode, { id, timestamp: iso(hours), requests, principal_id: "p1" });
  const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };
  const put = (theme: Theme, color: ColorMode) => act(() => useTheme.setState({ theme, color }));
  const keyRun = () => renderHook(() => useBarTracks({ transactions: NO_TRANSACTIONS, genericEntities: [usageDay("u1", 2, 40), usageDay("u2", 3, 60)] }));

  beforeEach(() => {
    useSchema.setState({ nodes: keyNet.nodes, rows: keyNet.rows, fields: keyNet.fields, lanes: undefined });
    useSolo.setState({ solo: null });
    useTrackBy.setState({ by: null });
    usePlayhead.setState({ playhead: T0, minTime: T0, maxTime: T0 + 8 * HOUR, windowMin: T0, windowMax: T0 + 8 * HOUR, isPlaying: false });
    useTheme.setState({ theme: "dark", color: "neon" });
  });
  afterEach(() => useTheme.setState(saved));

  const lane = (t: ReturnType<typeof keyRun>["result"]["current"]) => t.lanes.find((l) => l.kind === "usage_day")!;

  it("in dark neon the lane, the rows' bar and the dots keep the manifest's colours (ruling T1)", () => {
    const t = keyRun().result.current;
    expect(lane(t).palette).toBe("#ffd166");
    expect(t.set?.barPalette).toBe("#ffd166");
    expect(t.dots.paint("signin", 0.5)).toBe("rgb(255 155 210 / 0.5)");
    expect(t.dots.onPanel("signin")).toBe("#ff9bd2");
  });

  it("in light neon the lane, the rows' bar and the dots take the resolver's marks", () => {
    put("light", "neon");
    const t = keyRun().result.current;
    expect(lane(t).palette).toBe("#755200");
    expect(t.set?.barPalette).toBe("#755200");
    expect(t.dots.paint("signin", 0.5)).toBe("rgb(226 0 125 / 0.5)");
    expect(t.dots.onPanel("signin")).toBe("#e2007d");
  });

  it("a live switch of the theme and of the mode in one mount equals a fresh mount in that state", () => {
    const { result } = keyRun();
    const read = (t: typeof result.current) => [lane(t).palette, t.set?.barPalette, t.dots.paint("signin", 0.5), t.dots.onPanel("signin")];
    const states: [Theme, ColorMode, string[]][] = [
      ["light", "neon", ["#755200", "#755200", "rgb(226 0 125 / 0.5)", "#e2007d"]],
      ["light", "deuteranopia", ["#4b4e53", "#4b4e53", "rgb(0 32 77 / 0.5)", "#00204d"]],
      ["dark", "deuteranopia", ["#a1a1a1", "#a1a1a1", "rgb(0 104 250 / 0.5)", "#0068fa"]],
      ["dark", "neon", ["#ffd166", "#ffd166", "rgb(255 155 210 / 0.5)", "#ff9bd2"]],
    ];
    for (const [theme, color, want] of states) {
      put(theme, color);
      expect(read(result.current)).toEqual(want);
      expect(read(keyRun().result.current)).toEqual(want);
    }
  });

  it("PIN (ruling T3): a kind that has a palette slot paints from its slot variables in every theme and mode", () => {
    useSchema.setState({ nodes: manifestOf("card-fraud").nodes, rows: undefined, fields: undefined, lanes: undefined });
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        put(theme, color);
        const t = renderHook(() => useBarTracks({ transactions: NO_TRANSACTIONS })).result.current;
        expect(t.dots.paint("auth")).toBe("rgb(var(--r1-rgb))");
        expect(t.dots.onPanel("auth")).toBe("var(--r1-on-panel)");
      }
    }
  });
});
