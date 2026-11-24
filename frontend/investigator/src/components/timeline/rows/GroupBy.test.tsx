/**
 * The grouping control. Every fixture is written here, with names that belong to no pack: the control
 * reads the manifest, the loaded rows and the stores, and carries no word of its own about a field.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { manifestRowToEntity } from "../../../lib/adapters/manifest-row";
import { caseStepEvents } from "../../../lib/case-events";
import type { Entity } from "../../../lib/entity";
import { rowTicks } from "../../../lib/row-ticks";
import type { ScenarioFieldWords, ScenarioNode, ScenarioRows } from "../../../lib/scenarios";
import { buildShareLink } from "../../../lib/share-link";
import { makeProjector } from "../../../lib/timeline-projector";
import { buildTracks } from "../../../lib/tracks";
import { usePivotData } from "../../../store/pivot-data";
import { useSchema } from "../../../store/schema";
import { useSolo } from "../../../store/solo";
import { useTrackBy } from "../../../store/track-by";
import { GroupBy } from "./GroupBy";
import { TrackRows } from "./TrackRows";

const node = (kind: string, label: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind, label, palette: "#ff8800", source: "json", coords: null, timestamp: "at", primary: "${id}", ...extra,
});
const stopNode = node("stop", "Stop", { pivotable: ["team_id", "zone_code", "gate_code"] });
const nodes: ScenarioNode[] = [stopNode];
const rowsDecl: ScenarioRows = { by: "team_id" };
const fields: Record<string, ScenarioFieldWords> = {
  team_id: { label: "Squad" },
  zone_code: { label: "Zone" },
  gate_code: { label: "Gate" },
};
const at = (hours: number): string => new Date(Date.parse("2026-06-08T09:00:00-05:00") + hours * 3_600_000).toISOString();
const stops = (): Entity[] => [
  manifestRowToEntity(stopNode, { id: "s1", at: at(1), team_id: "a", zone_code: "n", gate_code: "g1" }),
  manifestRowToEntity(stopNode, { id: "s2", at: at(2), team_id: "b", zone_code: "s", gate_code: "g2" }),
];

function seed(over: { nodes?: ScenarioNode[]; rows?: ScenarioRows; fields?: Record<string, ScenarioFieldWords>; entities?: Entity[] } = {}): void {
  useSchema.setState({ nodes: over.nodes ?? nodes, rows: over.rows ?? rowsDecl, fields: over.fields ?? fields });
  usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: over.entities ?? stops() });
}

const trigger = (c: ParentNode): HTMLButtonElement => c.querySelector("[data-group-by]") as HTMLButtonElement;
const menu = (c: ParentNode): HTMLElement | null => c.querySelector("[data-group-menu]");
const items = (c: ParentNode): HTMLElement[] => [...c.querySelectorAll<HTMLElement>("[data-group-option]")];
const labelsOf = (c: ParentNode): string[] => items(c).map((el) => el.textContent ?? "");
const open = (c: ParentNode): void => {
  fireEvent.click(trigger(c));
};

beforeEach(() => {
  seed();
  useTrackBy.setState({ by: null });
  useSolo.setState({ solo: null });
});

describe("the grouping control", () => {
  it("draws nothing while fewer than two fields can group the rows", () => {
    seed({ fields: { team_id: { label: "Squad" } } });
    expect(render(<GroupBy />).container.firstChild).toBeNull();
    seed({ entities: [] });
    expect(render(<GroupBy />).container.firstChild).toBeNull();
    seed({ nodes: [], rows: undefined, fields: undefined });
    expect(render(<GroupBy />).container.firstChild).toBeNull();
  });

  it("is a button whose name begins with its visible word and names the field in force", () => {
    const { container } = render(<GroupBy />);
    const button = trigger(container);
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Group: Squad");
    expect(button.textContent?.startsWith("Group")).toBe(true);
    // The menu is mounted only while it is open, so nothing may point at it while it is shut.
    expect(button.hasAttribute("aria-controls")).toBe(false);
    act(() => useTrackBy.getState().setBy("zone_code"));
    expect(button.getAttribute("aria-label")).toBe("Group: Zone");
  });

  it("ends in the one fold mark, drawn as a picture with the control's own spacing, and prints no triangle character as text", () => {
    const { container } = render(<GroupBy />);
    const mark = trigger(container).querySelector<HTMLElement>("[data-fold-mark]");
    // A menu's caret: it points down and never turns, so it is the open mark, with the control's own margin.
    expect(mark?.getAttribute("data-fold-mark")).toBe("open");
    expect(mark?.className).toContain("ml-1");
    const copy = trigger(container).cloneNode(true) as HTMLElement;
    copy.querySelectorAll("[data-fold-mark]").forEach((n) => n.remove());
    for (const t of [String.fromCodePoint(0x25b8), String.fromCodePoint(0x25be)]) expect(copy.textContent).not.toContain(t);
    expect(copy.textContent).toBe("Group");
    open(container);
    expect(trigger(container).querySelector("[data-fold-mark]")?.getAttribute("data-fold-mark")).toBe("open");
  });

  it("opens a menu of the offered fields, in the manifest's order, with the field in force checked", () => {
    const { container } = render(<GroupBy />);
    expect(menu(container)).toBeNull();
    open(container);
    expect(trigger(container).getAttribute("aria-expanded")).toBe("true");
    expect(menu(container)?.getAttribute("role")).toBe("menu");
    expect(menu(container)?.getAttribute("aria-label")).toBe("Group by");
    expect(labelsOf(container)).toEqual(["Squad", "Zone", "Gate"]);
    expect(items(container).map((el) => el.getAttribute("role"))).toEqual(["menuitemradio", "menuitemradio", "menuitemradio"]);
    expect(items(container).map((el) => el.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
  });

  it("puts focus on the checked field, and holds one Tab stop in the menu", () => {
    useTrackBy.getState().setBy("zone_code");
    const { container } = render(<GroupBy />);
    open(container);
    expect(document.activeElement).toBe(items(container)[1]);
    expect(items(container).map((el) => el.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
  });

  it("moves focus with the arrow keys, Home and End, and changes nothing until a field is chosen", () => {
    const { container } = render(<GroupBy />);
    open(container);
    const list = items(container);
    fireEvent.keyDown(list[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(list[1]);
    fireEvent.keyDown(list[1], { key: "ArrowDown" });
    expect(document.activeElement).toBe(list[2]);
    fireEvent.keyDown(list[2], { key: "ArrowDown" });
    expect(document.activeElement).toBe(list[0]);
    fireEvent.keyDown(list[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(list[2]);
    fireEvent.keyDown(list[2], { key: "Home" });
    expect(document.activeElement).toBe(list[0]);
    fireEvent.keyDown(list[0], { key: "End" });
    expect(document.activeElement).toBe(list[2]);
    expect(useTrackBy.getState().by).toBeNull();
    expect(menu(container)).not.toBeNull();
  });

  it("chooses with Enter: the grouping changes, the menu closes and focus stays on the button", () => {
    const { container } = render(<GroupBy />);
    open(container);
    fireEvent.keyDown(items(container)[0], { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as Element, { key: "Enter" });
    expect(useTrackBy.getState().by).toBe("zone_code");
    expect(menu(container)).toBeNull();
    expect(document.activeElement).toBe(trigger(container));
    expect(trigger(container).getAttribute("aria-expanded")).toBe("false");
    expect(trigger(container).getAttribute("aria-label")).toBe("Group: Zone");
  });

  it("chooses with Space and with a click", () => {
    const { container } = render(<GroupBy />);
    open(container);
    fireEvent.keyDown(items(container)[2], { key: " " });
    expect(useTrackBy.getState().by).toBe("gate_code");
    open(container);
    fireEvent.click(items(container)[1]);
    expect(useTrackBy.getState().by).toBe("zone_code");
    expect(document.activeElement).toBe(trigger(container));
  });

  it("stores no grouping for the manifest's own field, so the link writes none", () => {
    const { container } = render(<GroupBy />);
    open(container);
    fireEvent.click(items(container)[1]);
    expect(buildShareLink({ scenario: "s", by: useTrackBy.getState().by })).toContain("by=zone_code");
    open(container);
    fireEvent.click(items(container)[0]);
    expect(useTrackBy.getState().by).toBeNull();
    expect(buildShareLink({ scenario: "s", by: useTrackBy.getState().by })).not.toContain("by=");
  });

  it("clears the solo when the grouping changes, and keeps it when the field in force is chosen again", () => {
    const { container } = render(<GroupBy />);
    act(() => useSolo.getState().toggle("team_id", "a"));
    open(container);
    fireEvent.click(items(container)[0]);
    expect(useSolo.getState().solo).toEqual({ field: "team_id", value: "a" });
    open(container);
    fireEvent.click(items(container)[1]);
    expect(useSolo.getState().solo).toBeNull();
  });

  it("closes on Escape with focus on the button and the grouping as it was", () => {
    const { container } = render(<GroupBy />);
    open(container);
    fireEvent.keyDown(items(container)[0], { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(menu(container)).toBeNull();
    expect(document.activeElement).toBe(trigger(container));
    expect(useTrackBy.getState().by).toBeNull();
  });

  it("closes on a press outside and when focus leaves, and keeps an Escape handler only while open", () => {
    const { container } = render(<GroupBy />);
    open(container);
    fireEvent.mouseDown(document.body);
    expect(menu(container)).toBeNull();
    open(container);
    fireEvent.blur(items(container)[0], { relatedTarget: document.body });
    expect(menu(container)).toBeNull();
    // Shut: Escape reaches no handler of the control, so the key is left to the page.
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("closes again on a second press of the button", () => {
    const { container } = render(<GroupBy />);
    open(container);
    open(container);
    expect(menu(container)).toBeNull();
  });

  it("holds the buttons and the options to at least 24 px by 24 px, the target size of WCAG 2.5.8", () => {
    const { container } = render(<GroupBy />);
    open(container);
    for (const el of [trigger(container), ...items(container)]) expect(el.className).toMatch(/\bh-6\b|min-h-\[24px\]/);
  });

  it("serves a pack with other names, and a link's grouping that the manifest labels", () => {
    const trip = node("trip", "Trip", { pivotable: ["driver_ref", "vehicle_ref"] });
    seed({
      nodes: [trip],
      rows: { by: "driver_ref" },
      fields: { driver_ref: { label: "Driver" }, vehicle_ref: { label: "Vehicle" } },
      entities: [manifestRowToEntity(trip, { id: "t1", at: at(1), driver_ref: "d1", vehicle_ref: "v1" })],
    });
    useTrackBy.getState().setBy("vehicle_ref");
    const { container } = render(<GroupBy />);
    expect(trigger(container).getAttribute("aria-label")).toBe("Group: Vehicle");
    open(container);
    expect(labelsOf(container)).toEqual(["Driver", "Vehicle"]);
  });

  it("names the button 'Group' alone when the field in force has no label to offer", () => {
    useTrackBy.getState().setBy("unlisted_code");
    const { container } = render(<GroupBy />);
    expect(trigger(container).getAttribute("aria-label")).toBe("Group");
    open(container);
    expect(items(container).map((el) => el.getAttribute("aria-checked"))).toEqual(["false", "false", "false"]);
    expect(items(container).map((el) => el.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });
});

// The mount case of the item. It sits here and not in TrackRows.test.tsx, which is at the 400 line
// cap that RowDot.test.tsx holds every file of this folder to (as TrackRows.names.test.tsx does).
describe("the grouping control in the rows' header", () => {
  const HOUR = 3_600_000;
  const T0 = Date.parse("2026-06-08T09:00:00-05:00");
  /** The real TrackRows on the case the stores hold, shut or open, with a row alone or none. */
  function drawRows(over: Partial<React.ComponentProps<typeof TrackRows>> = {}) {
    const list = usePivotData.getState().entities;
    const events = caseStepEvents({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: list }, nodes);
    const set = buildTracks({ events, entities: list, nodes, rows: rowsDecl, fields });
    if (!set) throw new Error("expected rows");
    return render(
      <TrackRows
        set={set} ticks={rowTicks(events)} slot={{ project: makeProjector(T0, T0 + 10 * HOUR), onPlotMouseDown: () => {} }}
        grids={[{ step: HOUR, firstBucketStart: T0 }]} mirror prominence={0.5} paint={(k) => `rgb(var(--${k}-rgb))`}
        onPanel={(k) => `var(--${k}-on-panel)`} kindFor={(k) => k} kindLabel={(k) => k} open onToggle={() => {}}
        onActivate={() => {}} listId="rows-list" soloKey={null} onSolo={() => {}} plotPx={1000} {...over}
      />,
    );
  }

  it("is mounted in the header after the fold button, and stays when the rows are folded", () => {
    for (const shown of [true, false]) {
      const { container, unmount } = drawRows({ open: shown });
      const header = container.querySelector("[data-track-header]") as HTMLElement;
      const control = header.querySelector("[data-group-by]") as HTMLButtonElement;
      expect(control.getAttribute("aria-label")).toBe("Group: Squad");
      const buttons = [...header.querySelectorAll("button")];
      expect(buttons[0].hasAttribute("aria-expanded") && buttons[0].hasAttribute("aria-controls")).toBe(true);
      expect(buttons.indexOf(control)).toBeGreaterThan(0);
      // A native button with no tabindex of its own is in the Tab order (jsdom's tabIndex getter is not asked).
      expect(control.hasAttribute("tabindex") || control.disabled || control.closest("[aria-hidden='true']") !== null).toBe(false);
      expect(control.closest("[hidden]")).toBeNull();
      unmount();
    }
  });

  it("is not drawn when the loaded rows give the manifest no second field to group by", () => {
    seed({ fields: { team_id: { label: "Squad" } } });
    expect(drawRows().container.querySelector("[data-group-by]")).toBeNull();
  });

  it("regroups from the header: the choice is stored and a solo made under the old grouping is cleared", () => {
    useSolo.getState().toggle("team_id", "a");
    const { container } = drawRows({ soloKey: "v:a" });
    expect(container.querySelector("[data-solo-clear]")).not.toBeNull();
    fireEvent.click(container.querySelector("[data-group-by]") as HTMLElement);
    fireEvent.click(items(container).find((el) => el.textContent === "Zone") as HTMLElement);
    expect(useTrackBy.getState().by).toBe("zone_code");
    expect(useSolo.getState().solo).toBeNull();
  });
});

describe("the grouping control's words", () => {
  const SENTENCE_MOST = 25;
  const EM_DASH = String.fromCharCode(0x2014);
  const EN_DASH = String.fromCharCode(0x2013);
  /** Every tooltip sentence and every accessible name on the control, shut and open. */
  function sentences(): string[] {
    const { container } = render(<GroupBy />);
    const out: string[] = [];
    const take = (el: Element): void => {
      for (const line of (el.getAttribute("data-tip") ?? "").split("\n")) out.push(line);
      out.push(el.getAttribute("aria-label") ?? "");
    };
    take(trigger(container));
    open(container);
    take(menu(container) as Element);
    items(container).forEach(take);
    return out.filter((s) => s !== "");
  }

  it("says what the control is, in short active sentences, and never what to conclude", () => {
    const lines = sentences();
    expect(lines.length).toBeGreaterThan(4);
    for (const line of lines) {
      for (const sentence of line.split(/(?<=\.)\s+/)) {
        expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(SENTENCE_MOST);
      }
      expect(line).not.toContain(EM_DASH);
      expect(line).not.toContain(EN_DASH);
      expect(line).not.toMatch(/\b(should|probably|suspicious|fraud|risk|best|better)\b/i);
    }
  });

  it("carries its tooltip on the button only while the menu is shut", () => {
    const { container } = render(<GroupBy />);
    expect(trigger(container).getAttribute("data-tip")).toContain("Group: Squad");
    expect(trigger(container).getAttribute("data-tip")).toContain("Press to open the list of fields.");
    open(container);
    expect(trigger(container).hasAttribute("data-tip")).toBe(false);
    expect(items(container)[0].getAttribute("data-tip")).toBe("Squad\nThe rows use this field.");
    expect(items(container)[1].getAttribute("data-tip")).toBe("Zone\nPress to group the rows by this field.");
  });
});

describe("GroupBy.tsx source", () => {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "GroupBy.tsx"), "utf8");

  it("names no pack's field or label, touches no storage and reads no clock", () => {
    for (const word of ["org_id", "org_name", "merchant_name", "credential_id", "ip_asn", "seat_id", "Organisation", "Merchant", "API key", "Network"]) {
      expect(source).not.toContain(word);
    }
    expect(source).not.toMatch(/localStorage|sessionStorage|Date\.now|setInterval|performance\.now/);
  });

  it("adds no key handler beyond the menu's own, and no live region", () => {
    expect(source).not.toMatch(/aria-live|role="status"|role="alert"/);
    expect(source).not.toContain("aria-controls");
  });

  it("holds every type size to the ones the bar's files already use", () => {
    const sizes = [...source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
    for (const size of sizes) expect([8, 8.5, 9, 10]).toContain(size);
  });
});
