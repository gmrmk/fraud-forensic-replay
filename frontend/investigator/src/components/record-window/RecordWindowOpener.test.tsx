import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { RecordWindowOpener } from "./RecordWindowOpener";
import { RECORD, SCENARIO } from "../notes/test-support";
import { resetNotesTransport, startNotesTransport } from "../../lib/notes-io/session";
import type { MarksBacking } from "../../lib/notes-io/transport";
import { takeInitialFocus } from "../../lib/window-focus";
import { BUTTON_GLYPH_PX } from "../marks/glyphs";
import { OPENER } from "../../lib/tooltip-words/record-window";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePivotData } from "../../store/pivot-data";
import { usePivotStore } from "../../store/pivot";
import { useSelection } from "../../store/selection";
import type { Place, Transaction } from "../../types";

const PLACE: Place = { id: "place_test_1", name: "Montrose Market", category: "grocery_or_supermarket", lat: 29.7433, lng: -95.3909 };
const FRAUD_TX = {
  id: "t1", timestamp: "2026-05-14T22:41:00Z", amount: 1275.97, merchant_name: "Mall", merchant_country: "NG",
  risk_score: 943, auth_source: "card_present", merchant_lat: 6.43, merchant_lng: 3.42, is_fraud: 1,
} as Transaction;

const recordWindows = () => usePivotStore.getState().windows.filter((w) => w.kind === "record");

beforeEach(async () => {
  resetNotesTransport();
  usePivotStore.setState({ windows: [], nextZ: 20 });
  useSelection.setState({ selected: null });
  usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [RECORD] });
  useMarksStore.getState().clear();
  useNotesStore.setState({ scenario: null, notes: [] });
  startNotesTransport(true);
  await useNotesStore.getState().load(SCENARIO);
  await useMarksStore.getState().load(SCENARIO);
});

describe("RecordWindowOpener", () => {
  it("shows for a selected record, named Open your mark, with its tooltip and one hidden lens", () => {
    useSelection.setState({ selected: { kind: "entity", entity: RECORD } });
    render(<RecordWindowOpener />);
    const button = screen.getByRole("button", { name: OPENER.name });
    expect(button.getAttribute("data-tip")).toBe(OPENER.tip);
    const svgs = button.querySelectorAll("svg");
    expect(svgs).toHaveLength(1);
    expect(svgs[0].getAttribute("aria-hidden")).toBe("true");
    expect(svgs[0].getAttribute("data-glyph")).toBe("lens");
    expect(svgs[0].getAttribute("width")).toBe(String(BUTTON_GLYPH_PX));
    expect(button.className).toContain("h-[18px]");
    expect(button.className).toContain("w-[18px]");
    expect(button.className).not.toMatch(/rounded/);
  });

  it("shows nothing when nothing is selected, and nothing for a selected note", () => {
    const { container, rerender } = render(<RecordWindowOpener />);
    expect(container.firstChild).toBeNull();
    useSelection.setState({ selected: { kind: "entity", entity: { ...RECORD, kind: "note" } } });
    rerender(<RecordWindowOpener />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is disabled while the notes store has no scenario", () => {
    useNotesStore.setState({ scenario: null });
    useSelection.setState({ selected: { kind: "entity", entity: RECORD } });
    render(<RecordWindowOpener />);
    expect(screen.getByRole("button", { name: OPENER.name })).toBeDisabled();
  });

  it("a press opens the record's window, asks for focus once, and writes nothing", async () => {
    const marks = useMarksStore.getState().backing as MarksBacking;
    const putNode = vi.spyOn(marks, "putNode");
    useSelection.setState({ selected: { kind: "entity", entity: RECORD } });
    render(<RecordWindowOpener />);
    fireEvent.click(screen.getByRole("button", { name: OPENER.name }));
    const windows = recordWindows();
    expect(windows).toHaveLength(1);
    expect(windows[0].kind === "record" && windows[0].record).toEqual({ kind: "stop", id: "rec-1" });
    expect(takeInitialFocus(windows[0].id)).toBe(true);
    expect(takeInitialFocus(windows[0].id)).toBe(false);
    expect(useMarksStore.getState().nodes).toEqual([]);
    expect(putNode).not.toHaveBeenCalled();
  });

  it("a selected fraud transaction opens a window whose record kind is auth", () => {
    usePivotData.setState({ transactions: [FRAUD_TX] });
    useSelection.setState({ selected: { kind: "fraud", tx: FRAUD_TX } });
    render(<RecordWindowOpener />);
    fireEvent.click(screen.getByRole("button", { name: OPENER.name }));
    const w = recordWindows()[0];
    expect(w.kind === "record" && w.record).toEqual({ kind: "auth", id: "t1" });
    // The record has a place, so the window is tethered.
    expect(w.anchor.type).toBe("node");
  });

  it("a selected place has a window too, tethered to the place the lookup finds", () => {
    useSelection.setState({ selected: { kind: "place", place: PLACE } });
    render(<RecordWindowOpener />);
    fireEvent.click(screen.getByRole("button", { name: OPENER.name }));
    const w = recordWindows()[0];
    expect(w.kind === "record" && w.record).toEqual({ kind: "place", id: "place_test_1" });
    expect(w.anchor.type).toBe("node");
  });

  it("a second press keeps one window and raises it", () => {
    useSelection.setState({ selected: { kind: "entity", entity: RECORD } });
    render(<RecordWindowOpener />);
    fireEvent.click(screen.getByRole("button", { name: OPENER.name }));
    const first = recordWindows()[0];
    fireEvent.click(screen.getByRole("button", { name: OPENER.name }));
    const again = recordWindows();
    expect(again).toHaveLength(1);
    expect(again[0].id).toBe(first.id);
    expect(again[0].z).toBeGreaterThan(first.z);
  });

  it("the lens is faint while no window is open and in the text colour while one is", () => {
    useSelection.setState({ selected: { kind: "entity", entity: RECORD } });
    render(<RecordWindowOpener />);
    const button = screen.getByRole("button", { name: OPENER.name });
    expect(button.style.color).toBe("var(--text-faint)");
    fireEvent.click(button);
    expect(button.style.color).toBe("var(--text)");
    act(() => usePivotStore.getState().closeWindow(recordWindows()[0].id));
    expect(button.style.color).toBe("var(--text-faint)");
  });

  it("the window of another record does not light it", () => {
    usePivotStore.getState().openRecord({ kind: "stop", id: "rec-9" }, { lngLat: null, pinned: false, at: { x: 10, y: 10 } });
    useSelection.setState({ selected: { kind: "entity", entity: RECORD } });
    render(<RecordWindowOpener />);
    expect(screen.getByRole("button", { name: OPENER.name }).style.color).toBe("var(--text-faint)");
  });
});
