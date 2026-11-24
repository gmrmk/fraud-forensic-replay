/**
 * INT-5b: the rows lift the key of the row the focus stands in, so the slider's spoken value can
 * carry that row's number (design section 11, the number at the line). The callback is a prop that
 * the event handlers call: it is never called from an effect, so a render with no focus calls it
 * never. It sits beside TrackRows.test.tsx because that file is at the 400 line cap the rows' files
 * hold. Every fixture is written here, with words no pack uses.
 */
import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { manifestRowToEntity } from "../../../lib/adapters/manifest-row";
import { caseStepEvents } from "../../../lib/case-events";
import type { Entity } from "../../../lib/entity";
import { rowTicks } from "../../../lib/row-ticks";
import type { ScenarioNode } from "../../../lib/scenarios";
import { makeProjector } from "../../../lib/timeline-projector";
import { buildTracks } from "../../../lib/tracks";
import { useClockForm } from "../../../store/clock-form";
import { usePlayhead } from "../../../store/playhead";
import { useTheme } from "../../../store/theme";
import { TrackRows } from "./TrackRows";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-06-08T09:00:00-05:00");
const iso = (hours: number): string => new Date(T0 + hours * HOUR).toISOString();
const project = makeProjector(T0, T0 + 10 * HOUR);
const node = (kind: string, label: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind, label, palette: "#ff8800", source: "json", coords: null, timestamp: "at", primary: "${id}", ...extra,
});
const nodes: ScenarioNode[] = [
  node("stop", "Stop"),
  node("load", "Load", { palette: "#2d7ff9", magnitude: "weight", magnitudeLabel: "Weight", magnitudeUnit: "kg" }),
];

/** Two rows, "Team m" and "Team n", each with one member line, drawn open. */
function draw(onFocusRow?: (key: string | null) => void) {
  const entities: Entity[] = [
    manifestRowToEntity(nodes[0], { id: "s1", at: iso(1), team_id: "m", team_name: "Team m" }),
    manifestRowToEntity(nodes[1], { id: "w1", at: iso(2), team_id: "m", bay_id: "Bay 1", weight: 5 }),
    manifestRowToEntity(nodes[0], { id: "s2", at: iso(1), team_id: "n", team_name: "Team n" }),
    manifestRowToEntity(nodes[1], { id: "w2", at: iso(2), team_id: "n", bay_id: "Bay 2", weight: 7 }),
  ];
  const events = caseStepEvents({ transactions: [], logins: [], accountEvents: [], transfers: [], entities }, nodes);
  const set = buildTracks({
    events, entities, nodes, rows: { by: "team_id", name: "team_name", member: "bay_id" },
    fields: { team_id: { label: "Squad" }, bay_id: { label: "Bay" } },
  });
  if (!set) throw new Error("expected rows");
  return render(
    <TrackRows
      set={set} ticks={rowTicks(events)} slot={{ project, onPlotMouseDown: () => {} }} grids={[{ step: HOUR, firstBucketStart: T0 }]}
      mirror prominence={0.5} paint={(k) => `rgb(var(--${k}-rgb))`} onPanel={(k) => `var(--${k}-on-panel)`}
      kindFor={(k) => k} kindLabel={(k) => k} open onToggle={() => {}} onActivate={() => {}} listId="rows-list"
      soloKey={null} onSolo={() => {}} plotPx={1000} onFocusRow={onFocusRow}
    />,
  );
}

const stops = (c: HTMLElement): HTMLElement[] => [...c.querySelectorAll<HTMLElement>("[data-track-name]")];

beforeEach(() => {
  usePlayhead.setState({ playhead: T0 + 2.25 * HOUR });
  useClockForm.getState().set(false);
  useTheme.setState({ theme: "dark", color: "neon" });
});

describe("the key of the row the focus stands in", () => {
  it("is never called by a draw alone, and the rows draw without the prop", () => {
    const onFocusRow = vi.fn();
    const { unmount } = draw(onFocusRow);
    expect(onFocusRow).not.toHaveBeenCalled();
    unmount();
    const { container } = draw();
    expect(() => fireEvent.focus(stops(container)[0])).not.toThrow();
  });

  it("is the row's key when the focus lands on a row's name", () => {
    const onFocusRow = vi.fn();
    const { container } = draw(onFocusRow);
    const second = stops(container)[1];
    act(() => fireEvent.focus(second));
    expect(onFocusRow).toHaveBeenLastCalledWith(second.dataset.stop);
    expect(second.dataset.stop).toMatch(/n$/);
  });

  it("follows the arrow keys from one row to the next, with no empty call between the two", () => {
    const onFocusRow = vi.fn();
    const { container } = draw(onFocusRow);
    const [first, second] = stops(container);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);
    expect(onFocusRow.mock.calls.map((c) => c[0])).toEqual([first.dataset.stop, second.dataset.stop]);
  });

  it("is the row's key, and not the line's, when the focus lands on a member line", () => {
    const onFocusRow = vi.fn();
    const { container } = draw(onFocusRow);
    fireEvent.click(container.querySelector("[data-row-open]") as HTMLElement);
    const line = container.querySelector<HTMLElement>("[data-line-name]") as HTMLElement;
    expect(line.dataset.stop).not.toBe(stops(container)[0].dataset.stop);
    act(() => fireEvent.focus(line));
    expect(onFocusRow).toHaveBeenLastCalledWith(stops(container)[0].dataset.stop);
  });

  it("is null when the focus leaves the list, and not when it moves inside the list", () => {
    const onFocusRow = vi.fn();
    const { container } = draw(onFocusRow);
    const [first, second] = stops(container);
    act(() => fireEvent.focus(first));
    fireEvent.blur(first, { relatedTarget: second });
    expect(onFocusRow).toHaveBeenLastCalledWith(first.dataset.stop);
    fireEvent.blur(second, { relatedTarget: document.body });
    expect(onFocusRow).toHaveBeenLastCalledWith(null);
    fireEvent.blur(second, { relatedTarget: null });
    expect(onFocusRow).toHaveBeenLastCalledWith(null);
  });
});
