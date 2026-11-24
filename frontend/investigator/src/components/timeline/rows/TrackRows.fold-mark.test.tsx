/**
 * The rows' two fold controls draw the one fold mark of the playbar (FoldMark): the header's button,
 * open and folded, and a row's own control, closed and open. jsdom draws no layout, so this file reads
 * the DOM; the size on screen is checked in a browser. It sits beside TrackRows.test.tsx because that
 * file is at the 400 line cap the rows' files hold. Neither triangle character is typed here.
 */
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { manifestRowToEntity } from "../../../lib/adapters/manifest-row";
import { OPEN } from "../../../lib/bar-metrics";
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
const TRIANGLES = [String.fromCodePoint(0x25b8), String.fromCodePoint(0x25be)];

/** A case of one row with one member line, so the row can open. */
function draw(open: boolean) {
  const entities: Entity[] = [
    manifestRowToEntity(nodes[0], { id: "s1", at: iso(1), team_id: "m", team_name: "Team m" }),
    manifestRowToEntity(nodes[1], { id: "w1", at: iso(2), team_id: "m", bay_id: "x", weight: 5 }),
  ];
  const events = caseStepEvents({ transactions: [], logins: [], accountEvents: [], transfers: [], entities }, nodes);
  const set = buildTracks({
    events, entities, nodes, rows: { by: "team_id", name: "team_name", member: "bay_id" },
    fields: { team_id: { label: "Squad" }, bay_id: { label: "Bay" } },
  });
  if (!set) throw new Error("expected rows");
  const ticks = rowTicks(events);
  const element = (isOpen: boolean) => (
    <TrackRows
      set={set} ticks={ticks} slot={{ project, onPlotMouseDown: () => {} }} grids={[{ step: HOUR, firstBucketStart: T0 }]}
      mirror prominence={0.5} paint={(k) => `rgb(var(--${k}-rgb))`} onPanel={(k) => `var(--${k}-on-panel)`}
      kindFor={(k) => k} kindLabel={(k) => k} open={isOpen} onToggle={() => {}} onActivate={() => {}} listId="rows-list"
      soloKey={null} onSolo={() => {}} plotPx={1000}
    />
  );
  const result = render(element(open));
  return { ...result, setOpen: (isOpen: boolean) => result.rerender(element(isOpen)) };
}

const markOf = (el: Element | null): string | null => el?.querySelector("[data-fold-mark]")?.getAttribute("data-fold-mark") ?? null;
/** The text of a control with the mark's own (hidden) glyph taken out. */
const visible = (el: Element): string => {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[data-fold-mark]").forEach((n) => n.remove());
  return copy.textContent ?? "";
};

beforeEach(() => {
  usePlayhead.setState({ playhead: T0 + 2.25 * HOUR });
  useClockForm.getState().set(false);
  useTheme.setState({ theme: "dark", color: "neon" });
});

describe("the rows' fold marks", () => {
  it("draws the header's button with the one mark, open and folded, and no triangle character as text", () => {
    const { container, setOpen } = draw(true);
    const header = (): Element => container.querySelector("[data-track-header] button") as Element;
    expect(markOf(header())).toBe("open");
    expect(header().querySelector("[data-fold-svg]")).toBeNull();
    for (const t of TRIANGLES) expect(visible(header())).not.toContain(t);
    setOpen(false);
    expect(markOf(header())).toBe("closed");
    for (const t of TRIANGLES) expect(visible(header())).not.toContain(t);
  });

  it("draws a row's own control with the one mark and no margin, keeping its width and its opacity", () => {
    const { container } = draw(true);
    const control = (): HTMLElement => container.querySelector("[data-row-open]") as HTMLElement;
    expect(markOf(control())).toBe("closed");
    expect(control().style.opacity).toBe("0.6");
    expect(control().style.width).toBe(`${OPEN}px`);
    expect(control().querySelector("[data-fold-mark]")?.className).not.toMatch(/\bm[lr]?-/);
    expect(visible(control())).toBe("");
    fireEvent.click(control());
    expect(markOf(control())).toBe("open");
    expect(control().style.opacity).toBe("1");
    expect(control().style.width).toBe(`${OPEN}px`);
    expect(visible(control())).toBe("");
  });
});
