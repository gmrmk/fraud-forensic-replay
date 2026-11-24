/**
 * The Your marks block: the records the investigator marked, pinned first, each row a button that
 * selects the record and opens its own window. Records are built from the fixtures and resolved through
 * a real lookup over a small context; marks and notes are made through the stores and the memory backing.
 * The record's window is another builder's: a press is asserted by the store's state, never by a window.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { YourMarks } from "./YourMarks";
import { lookupFromContext } from "../notes/record-lookup";
import { NOTE_TIME, SCENARIO } from "../notes/test-support";
import { resetNotesTransport, startNotesTransport } from "../../lib/notes-io/session";
import { resetUnsaved } from "../../lib/notes-io/unsaved";
import { bodyOf } from "../../lib/notes/test-fixtures";
import type { Entity } from "../../lib/entity";
import type { ScenarioNode } from "../../lib/scenarios";
import { ROW_TIP } from "../../lib/tooltip-words/your-marks";
import type { Place } from "../../types";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePivotStore } from "../../store/pivot";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useSelection } from "../../store/selection";

const T0 = NOTE_TIME;
const A_TIME = T0 + 3_600_000; // the late one
const B_TIME = T0 - 3_600_000; // the early one

const entity = (id: string, name: string, timestamp: number): Entity => ({
  id,
  kind: "stop",
  timestamp,
  coords: { lat: 29.76, lng: -95.37 },
  fields: {},
  displayMetadata: { primaryLabel: name, secondaryLabel: "", paletteKind: "stop", pivotableFields: [] },
});

const A = entity("rec-a", "Late Stop", A_TIME);
const B = entity("rec-b", "Early Stop", B_TIME);
const C = entity("rec-c", "Untimed Stop", 0);
const PLACE: Place = { id: "pl-1", name: "Depot", category: "yard", lat: 30.1, lng: -95.9 };
const lookup = lookupFromContext({ transactions: [], logins: [], places: [PLACE], entities: [A, B, C] });

const ref = (id: string, kind = "stop") => ({ kind, id });
const SCHEMA_NODE: ScenarioNode = { kind: "stop", label: "Stop", palette: "stop", source: "stop" };

/** A pinned at a late time, B PASS early with two notes, C pinned with no time, D (not in the data) WAITING. */
async function seedFour(): Promise<void> {
  startNotesTransport(true);
  await useNotesStore.getState().load(SCENARIO);
  await useMarksStore.getState().load(SCENARIO);
  await useMarksStore.getState().togglePin(ref("rec-a"));
  await useMarksStore.getState().pressDisposition(ref("rec-b"), "pass");
  await useMarksStore.getState().togglePin(ref("rec-c"));
  await useMarksStore.getState().pressDisposition(ref("rec-gone"), "wait");
  for (let i = 0; i < 2; i++) {
    await useNotesStore.getState().create({
      scenario: SCENARIO,
      time: B_TIME + i * 60_000,
      link: ref("rec-b"),
      colour: "r2",
      category: "Note",
      decision: "none",
      body: bodyOf(i === 0 ? "First thing seen." : "Second thing seen."),
    });
  }
}

function rows(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "Your marks" })).getAllByRole("button");
}

beforeEach(() => {
  resetNotesTransport();
  resetUnsaved();
  useNotesStore.getState().setBacking(null);
  useNotesStore.getState().clear();
  useMarksStore.getState().setBacking(null);
  useMarksStore.getState().clear();
  usePivotStore.setState({ windows: [], nextZ: 20 });
  usePlayhead.setState({ playhead: T0, minTime: T0 - 7_200_000, maxTime: T0 + 7_200_000, isPlaying: true });
  useSelection.setState({ selected: null });
  useSchema.setState({ nodes: [SCHEMA_NODE] });
});

describe("YourMarks", () => {
  it("lists the marked records pinned first, then by time, an untimed record after the timed, one not in the data last", async () => {
    await seedFour();
    render(<YourMarks lookup={lookup} />);
    const names = rows().map((r) => r.textContent);
    expect(names).toHaveLength(4);
    expect(names[0]).toContain("Stop: Late Stop");
    expect(names[1]).toContain("Stop: Untimed Stop");
    expect(names[2]).toContain("Stop: Early Stop");
    expect(names[3]).toContain("Stop: rec-gone");
  });

  it("names the list and the heading Your marks", async () => {
    await seedFour();
    render(<YourMarks lookup={lookup} />);
    expect(screen.getByRole("list", { name: "Your marks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your marks" })).toBeInTheDocument();
  });

  it("a pinned record's first line holds the lens and the pin, and its name is cut with an ellipsis rather than wrapped", async () => {
    await seedFour();
    render(<YourMarks lookup={lookup} />);
    const a = rows()[0];
    const one = a.children[0] as HTMLElement;
    expect(one.querySelector('[data-glyph="lens"]')).not.toBeNull();
    expect(one.querySelector('[data-glyph="pin"]')).not.toBeNull();
    expect(one.querySelector('[data-glyph="check"], [data-glyph="cross"], [data-glyph="hourglass"]')).toBeNull();
    expect(within(one).getByText("Stop: Late Stop").className).toContain("truncate");
  });

  it("a PASS record's first line holds the check in the PASS tone, and its second line reads PASS, a middle dot and the note count", async () => {
    await seedFour();
    render(<YourMarks lookup={lookup} />);
    const b = rows()[2];
    const one = b.children[0] as HTMLElement;
    const glyph = one.querySelector('[data-glyph="check"]');
    expect(glyph).not.toBeNull();
    expect((glyph!.parentElement as HTMLElement).style.color).toBe("var(--verdict-pass-on-panel)");
    expect(one.querySelector('[data-glyph="pin"]')).toBeNull();
    expect((b.children[1] as HTMLElement).textContent).toBe(`PASS ${String.fromCharCode(0xb7)} 2 notes`);
  });

  it("a record not in the data is named by its kind and id, and a WAITING record shows the hourglass", async () => {
    await seedFour();
    render(<YourMarks lookup={lookup} />);
    const d = rows()[3];
    expect(within(d.children[0] as HTMLElement).getByText("Stop: rec-gone")).toBeInTheDocument();
    expect((d.children[0] as HTMLElement).querySelector('[data-glyph="hourglass"]')).not.toBeNull();
    expect((d.children[1] as HTMLElement).textContent).toBe("WAITING");
  });

  it("each row is a square button 30 px tall with a tooltip that starts with what the row is and carries the name and parts", async () => {
    await seedFour();
    render(<YourMarks lookup={lookup} />);
    for (const r of rows()) {
      expect(r.getAttribute("data-tip")?.startsWith(`${ROW_TIP}\n`)).toBe(true);
      expect(r.className).toContain("h-[30px]");
      expect(r.className).not.toContain("rounded");
    }
    expect(rows()[0].getAttribute("data-tip")).toBe([ROW_TIP, "Stop: Late Stop", "Pinned"].join("\n"));
    expect(rows()[2].getAttribute("data-tip")).toBe([ROW_TIP, "Stop: Early Stop", "PASS", "2 notes"].join("\n"));
  });

  it("a press on a row seeks the playhead to the record's time, pauses, selects it and opens its window", async () => {
    await seedFour();
    render(<YourMarks lookup={lookup} />);
    fireEvent.click(rows()[2]);
    expect(usePlayhead.getState().playhead).toBe(B_TIME);
    expect(usePlayhead.getState().isPlaying).toBe(false);
    const sel = useSelection.getState().selected;
    expect(sel && sel.kind === "entity" ? sel.entity.id : null).toBe("rec-b");
    const w = usePivotStore.getState().windows.filter((x) => x.kind === "record");
    expect(w).toHaveLength(1);
    expect(w[0].kind === "record" ? w[0].record : null).toEqual(ref("rec-b"));
  });

  it("a press on a record not in the data opens its window and selects nothing, and moves no playhead", async () => {
    await seedFour();
    render(<YourMarks lookup={lookup} />);
    fireEvent.click(rows()[3]);
    expect(useSelection.getState().selected).toBeNull();
    expect(usePlayhead.getState().playhead).toBe(T0);
    expect(usePlayhead.getState().isPlaying).toBe(true);
    const w = usePivotStore.getState().windows.find((x) => x.kind === "record");
    expect(w && w.kind === "record" ? w.record : null).toEqual(ref("rec-gone"));
  });

  it("a marked place opens its window and selects nothing", async () => {
    await seedFour();
    await useMarksStore.getState().togglePin(ref("pl-1", "place"));
    render(<YourMarks lookup={lookup} />);
    const place = rows().find((r) => r.textContent?.includes("Depot"));
    expect(place).toBeDefined();
    fireEvent.click(place!);
    expect(useSelection.getState().selected).toBeNull();
    const w = usePivotStore.getState().windows.find((x) => x.kind === "record");
    expect(w && w.kind === "record" ? w.record : null).toEqual(ref("pl-1", "place"));
  });

  it("a second press on the same row keeps one window for the record", async () => {
    await seedFour();
    render(<YourMarks lookup={lookup} />);
    fireEvent.click(rows()[2]);
    fireEvent.click(rows()[2]);
    expect(usePivotStore.getState().windows.filter((x) => x.kind === "record")).toHaveLength(1);
  });

  it("a note with no record is not a mark, and a record only noted is", async () => {
    startNotesTransport(true);
    await useNotesStore.getState().load(SCENARIO);
    await useMarksStore.getState().load(SCENARIO);
    await useNotesStore.getState().create({ scenario: SCENARIO, time: T0, link: null, colour: "r1", category: "Note", decision: "none", body: bodyOf("Free note.") });
    const { container, rerender } = render(<YourMarks lookup={lookup} />);
    expect(container).toBeEmptyDOMElement();
    await act(async () => {
      await useNotesStore.getState().create({ scenario: SCENARIO, time: T0, link: ref("rec-a"), colour: "r1", category: "Note", decision: "none", body: bodyOf("Linked note.") });
    });
    rerender(<YourMarks lookup={lookup} />);
    expect(rows()).toHaveLength(1);
    expect((rows()[0].children[1] as HTMLElement).textContent).toBe("1 note");
  });

  it("with no marked record the block renders nothing at all: no heading, no list", async () => {
    startNotesTransport(true);
    await useNotesStore.getState().load(SCENARIO);
    await useMarksStore.getState().load(SCENARIO);
    const { container } = render(<YourMarks lookup={lookup} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("a cleared record with no note leaves the list", async () => {
    startNotesTransport(true);
    await useNotesStore.getState().load(SCENARIO);
    await useMarksStore.getState().load(SCENARIO);
    await useMarksStore.getState().pressDisposition(ref("rec-a"), "fail");
    const { container } = render(<YourMarks lookup={lookup} />);
    expect(rows()).toHaveLength(1);
    await act(async () => {
      await useMarksStore.getState().pressDisposition(ref("rec-a"), "fail");
    });
    expect(container).toBeEmptyDOMElement();
  });
});
