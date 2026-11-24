// A list height computed from the window is a window length applied inside the zoomed chrome: it
// is divided by the factor first (design 2026-11-19-text-size.md, section 8).
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { manifestRowToEntity } from "../../../lib/adapters/manifest-row";
import { caseStepEvents } from "../../../lib/case-events";
import { rowListHeight, rowTicks } from "../../../lib/row-ticks";
import type { Entity } from "../../../lib/entity";
import type { ScenarioFieldWords, ScenarioNode, ScenarioRows } from "../../../lib/scenarios";
import { buildTracks } from "../../../lib/tracks";
import { makeProjector } from "../../../lib/timeline-projector";
import { useClockForm } from "../../../store/clock-form";
import { usePlayhead } from "../../../store/playhead";
import { useTextSize } from "../../../store/text-size";
import { useTheme } from "../../../store/theme";
import { TrackRows } from "./TrackRows";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-06-08T09:00:00-05:00");
const project = makeProjector(T0, T0 + 10 * HOUR);
const nodes: ScenarioNode[] = [
  { kind: "stop", label: "Stop", palette: "#ff8800", source: "json", coords: null, timestamp: "at", primary: "${id}" },
];
const rowsDecl: ScenarioRows = { by: "team_id", name: "team_name", member: "bay_id" };
const fields: Record<string, ScenarioFieldWords> = { team_id: { label: "Squad" }, bay_id: { label: "Bay" } };

function mount() {
  const entities: Entity[] = Array.from({ length: 30 }, (_, i) =>
    manifestRowToEntity(nodes[0], { id: `s${i}`, at: new Date(T0 + (1 + (i % 8)) * HOUR).toISOString(), team_id: `t${i}`, team_name: `Team ${i}` }),
  );
  const events = caseStepEvents({ transactions: [], logins: [], accountEvents: [], transfers: [], entities }, nodes);
  const ticks = rowTicks(events);
  const set = buildTracks({ events, entities, nodes, rows: rowsDecl, fields });
  if (!set) throw new Error("expected rows");
  return render(
    <TrackRows
      set={set}
      ticks={ticks}
      slot={{ project, onPlotMouseDown: () => {} }}
      grids={[{ step: HOUR, firstBucketStart: T0 }]}
      mirror
      prominence={0.5}
      paint={(k) => `rgb(var(--${k}-rgb))`}
      onPanel={(k) => `var(--${k}-on-panel)`}
      kindFor={(k) => k}
      kindLabel={(k) => k}
      open
      onToggle={() => {}}
      onActivate={() => {}}
      listId="rows-list"
      soloKey={null}
      onSolo={() => {}}
      plotPx={1000}
    />,
  );
}

const cap = (c: HTMLElement): number => Number.parseFloat((c.querySelector("[data-track-scroller]") as HTMLElement).style.maxHeight);
const listAt = (innerHeight: number): number => rowListHeight({ innerHeight, named: 30, rest: 0, depthPx: 0 });

beforeEach(() => {
  usePlayhead.setState({ playhead: T0 + 3 * HOUR });
  useClockForm.getState().set(false);
  useTheme.setState({ theme: "dark", color: "neon" });
  useTextSize.getState().setSize(100);
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true, writable: true });
});
afterEach(() => useTextSize.getState().setSize(100));

describe("the rows' list height under the text size", () => {
  it("is the same list at 100", () => {
    const { container } = mount();
    expect(cap(container)).toBe(listAt(1000));
  });

  it("divides the window's height by the factor at 125, so the list fills the same share of the window", () => {
    useTextSize.getState().setSize(125);
    const { container } = mount();
    expect(cap(container)).toBe(listAt(800));
    expect(cap(container)).toBeLessThan(listAt(1000));
  });

  it("follows a change of the step while mounted, with no resize of the window", () => {
    const { container } = mount();
    expect(cap(container)).toBe(listAt(1000));
    act(() => useTextSize.getState().setSize(112));
    expect(cap(container)).toBe(listAt(1000 / 1.12));
    act(() => useTextSize.getState().setSize(90));
    expect(cap(container)).toBe(listAt(1000 / 0.9));
  });
});
