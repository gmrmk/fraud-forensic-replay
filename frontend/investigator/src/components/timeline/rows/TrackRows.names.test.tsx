/**
 * A long name in the rows' list stays on one line. jsdom draws no layout, so this file pins the classes
 * and the attributes that make a name one line and keep its whole text; the pixels (each name 19 px
 * tall, a row 24 px from the next) are checked in the browser. It sits beside TrackRows.test.tsx
 * because that file is at the 400 line cap the rows' files hold.
 */
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
const ONE_LINE = ["truncate", "min-w-0"];
const NAME_60 = "Gormvale Provisions of the Montrose Quarter and Harbour Ltd.";
// A member label is held to 24 characters by the rows' builder, so a line's name is 26 at most.
const LABEL_24 = "Loading bay, north quays";
const VALUE_59 = "Bay B-17 of the north quay, west wing, second level, door 4";

/** A case of one row (`team_name` as given) with one member line, drawn open or shut. */
function draw(name: string, label: string, value: string) {
  const entities: Entity[] = [
    manifestRowToEntity(nodes[0], { id: "s1", at: iso(1), team_id: "m", team_name: name }),
    manifestRowToEntity(nodes[1], { id: "w1", at: iso(2), team_id: "m", bay_id: value, weight: 5 }),
  ];
  const events = caseStepEvents({ transactions: [], logins: [], accountEvents: [], transfers: [], entities }, nodes);
  const set = buildTracks({
    events, entities, nodes, rows: { by: "team_id", name: "team_name", member: "bay_id" },
    fields: { team_id: { label: "Squad" }, bay_id: { label } },
  });
  if (!set) throw new Error("expected rows");
  return render(
    <TrackRows
      set={set} ticks={rowTicks(events)} slot={{ project, onPlotMouseDown: () => {} }} grids={[{ step: HOUR, firstBucketStart: T0 }]}
      mirror prominence={0.5} paint={(k) => `rgb(var(--${k}-rgb))`} onPanel={(k) => `var(--${k}-on-panel)`}
      kindFor={(k) => k} kindLabel={(k) => k} open onToggle={() => {}} onActivate={() => {}} listId="rows-list"
      soloKey={null} onSolo={() => {}} plotPx={1000}
    />,
  );
}

beforeEach(() => {
  usePlayhead.setState({ playhead: T0 + 2.25 * HOUR });
  useClockForm.getState().set(false);
  useTheme.setState({ theme: "dark", color: "neon" });
});

describe("a long name in the rows' list", () => {
  it("draws a 60 character row name on one line, cut by the cell, with the whole name in its label and its tip", () => {
    expect(NAME_60).toHaveLength(60);
    const { container } = draw(NAME_60, LABEL_24, VALUE_59);
    const el = container.querySelector<HTMLElement>("[data-track-name]") as HTMLElement;
    for (const cls of ONE_LINE) expect(el.classList.contains(cls), cls).toBe(true);
    expect(el.getAttribute("aria-label")).toBe(NAME_60);
    expect(el.getAttribute("data-tip")).toContain(NAME_60);
    expect(el.style.lineHeight).toBe("19px");
  });

  it("draws a member line's long name on one line, cut by the cell, with the whole name in its label and its value in its tip", () => {
    expect(LABEL_24).toHaveLength(24);
    expect(VALUE_59).toHaveLength(59);
    const { container } = draw("Team m", LABEL_24, VALUE_59);
    fireEvent.click(container.querySelector("[data-row-open]") as HTMLElement);
    const line = container.querySelector<HTMLElement>("[data-line-name]") as HTMLElement;
    for (const cls of ONE_LINE) expect(line.classList.contains(cls), cls).toBe(true);
    expect(line.getAttribute("aria-label")).toBe(`${LABEL_24} 1`);
    expect(line.getAttribute("data-tip")).toContain(VALUE_59);
  });
});
