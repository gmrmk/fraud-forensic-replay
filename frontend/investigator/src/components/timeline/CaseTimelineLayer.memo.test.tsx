/**
 * The marker lane is not built again on a tick that changes nothing it draws (T1, BACKLOG item 20).
 * The layer does not read the playhead; it rendered at every tick because TimelineShell does and
 * hands the layer a new element each time. The lane's map (one button per node) calls
 * `sessionTickState` once per node, so the spy counts the builds of the map. Rendered through the
 * Timeline, as the app mounts it: the layer on its own would not show the shell's re-render.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Timeline } from "../Timeline";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useSelection } from "../../store/selection";
import { useNavigation } from "../../store/navigation";
import { useSessionFilter } from "../../store/session-filter";
import { useClockForm } from "../../store/clock-form";
import { useMarksStore } from "../../store/marks";
import { usePivotData } from "../../store/pivot-data";
import { makePath } from "../../lib/notes/test-fixtures";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import type { ScenarioNode } from "../../lib/scenarios";

const lane = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../../lib/session-highlight", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/session-highlight")>();
  return {
    ...real,
    sessionTickState: (...args: Parameters<typeof real.sessionTickState>) => {
      lane.calls += 1;
      return real.sessionTickState(...args);
    },
  };
});

const node = (kind: string, palette: string): ScenarioNode => ({
  kind, label: kind, palette, source: "sql", coords: null, timestamp: "at", primary: "${id}",
});
const shipmentNode = node("shipment", "#ffb347");
const refundNode = node("refund", "#ff5c5c");
const MS0 = Date.parse("2026-05-12T00:00:00-05:00");
const MS1 = Date.parse("2026-06-01T00:00:00-05:00");
const entities = [
  manifestRowToEntity(shipmentNode, { id: "sh-0100", at: "2026-05-12T10:14:00-05:00" }),
  manifestRowToEntity(shipmentNode, { id: "sh-0101", at: "2026-05-15T10:14:00-05:00" }),
  manifestRowToEntity(refundNode, { id: "rfnd-1", at: "2026-05-29T10:05:00-05:00" }),
];

describe("CaseTimelineLayer: the marker lane's map", () => {
  beforeEach(() => {
    usePlayhead.setState({ playhead: MS0, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1, isPlaying: true });
    useSchema.setState({ nodes: [shipmentNode, refundNode] });
    useSelection.setState({ selected: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
    useSessionFilter.setState({ selectedSessionId: null });
  });

  it("is built for each node on the first render, and not again on twenty playhead ticks inside the window", () => {
    lane.calls = 0;
    const { container } = render(<Timeline transactions={[]} genericEntities={entities} />);
    expect(container.querySelectorAll('button[aria-label^="Jump to"]')).toHaveLength(entities.length);
    expect(lane.calls).toBeGreaterThan(0);
    lane.calls = 0;
    for (let i = 1; i <= 20; i++) act(() => usePlayhead.setState({ playhead: MS0 + ((MS1 - MS0) * i) / 21 }));
    expect(lane.calls).toBe(0);
  });

  it("is built again when the selected session changes", () => {
    render(<Timeline transactions={[]} genericEntities={entities} />);
    lane.calls = 0;
    act(() => useSessionFilter.setState({ selectedSessionId: "S1" }));
    expect(lane.calls).toBeGreaterThan(0);
  });

  it("is built again when the visible window changes", () => {
    render(<Timeline transactions={[]} genericEntities={entities} />);
    lane.calls = 0;
    act(() => usePlayhead.setState({ windowMin: MS0 + 86_400_000 }));
    expect(lane.calls).toBeGreaterThan(0);
  });

  it("is built again when the clock's switch changes the words", () => {
    render(<Timeline transactions={[]} genericEntities={entities} />);
    lane.calls = 0;
    act(() => useClockForm.setState((s) => ({ h24: !s.h24 })));
    expect(lane.calls).toBeGreaterThan(0);
  });

  it("is built once, and not again on twenty playhead ticks, with a saved path of two of its records drawn", () => {
    // The investigator's path reads the playhead only as which stops lie after it, so the ticks that
    // cross its stops render the path and not the layer's dots. The stops' records come from the pivot data.
    usePivotData.setState({ entities });
    useMarksStore.setState({
      scenario: "card-fraud",
      paths: [makePath({ stops: [{ kind: "shipment", id: "sh-0100" }, { kind: "shipment", id: "sh-0101" }] })],
    });
    try {
      lane.calls = 0;
      const { container } = render(<Timeline transactions={[]} genericEntities={entities} />);
      expect(container.querySelectorAll('button[aria-label^="Jump to"]')).toHaveLength(entities.length);
      expect(container.querySelectorAll("[data-path-plate]")).toHaveLength(2);
      expect(lane.calls).toBeGreaterThan(0);
      lane.calls = 0;
      for (let i = 1; i <= 20; i++) act(() => usePlayhead.setState({ playhead: MS0 + ((MS1 - MS0) * i) / 21 }));
      expect(lane.calls).toBe(0);
    } finally {
      usePivotData.setState({ entities: [] });
      useMarksStore.setState({ scenario: null, paths: [] });
    }
  });
});
