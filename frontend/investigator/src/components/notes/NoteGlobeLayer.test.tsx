/**
 * The globe layer of marks: the investigator's mark of each marked record at the record's place (the
 * ring form and the plate, drawn by GlobeMarks and tested in full there). A note with no record, or
 * whose record is missing from the data or has no place, draws nothing on the globe, and a linked note
 * draws no square of its own: its record's mark carries it as the plate's count.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import { NoteGlobeLayer } from "./NoteGlobeLayer";
import { lookupFromContext, linkFromSelected } from "./record-lookup";
import { useLayers } from "../../store/layers";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePlayhead } from "../../store/playhead";
import { usePivotStore } from "../../store/pivot";
import { useSchema } from "../../store/schema";
import { useSelection } from "../../store/selection";
import { bodyOf, makeNode, makeNote } from "../../lib/notes/test-fixtures";
import { CONTEXT, RECORD, SCENARIO } from "./test-support";
import type { Note } from "../../lib/notes/types";

const live = vi.hoisted(() => ({ markers: [] as { el: HTMLElement; opts: Record<string, unknown>; lngLat: [number, number] | null }[] }));
vi.mock("maplibre-gl", () => {
  class Marker {
    el: HTMLElement; opts: Record<string, unknown>; lngLat: [number, number] | null = null;
    constructor(opts: { element: HTMLElement }) { this.el = opts.element; this.opts = opts; }
    setLngLat(ll: [number, number]) { this.lngLat = ll; return this; }
    addTo(map: { getCanvasContainer(): HTMLElement }) { map.getCanvasContainer().appendChild(this.el); live.markers.push(this); return this; }
    remove() { this.el.remove(); live.markers = live.markers.filter((m) => m !== this); return this; }
  }
  return { default: { Marker }, Marker };
});

function fakeMap() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return {
    getCanvasContainer: () => container,
    project: ([lng, lat]: [number, number]) => ({ x: lng * 10, y: -lat * 10 }),
    getCenter: () => ({ lng: -95, lat: 29 }),
    on: vi.fn(), off: vi.fn(),
  } as unknown as maplibregl.Map;
}

const T = 1763556003600; // the shared fixtures' note time (a 13 digit number that fails Luhn)
const link = { kind: "stop", id: "rec-1" };
const mk = (n: number, time: number, over: Partial<Note> = {}) =>
  makeNote({ id: `note-${String(n).padStart(32, "e")}`, seq: n, time, link, ...over });
const lookup = lookupFromContext(CONTEXT);

describe("record lookup and the link from a selection", () => {
  it("resolves a link to the kind, a headline and a place", () => {
    expect(lookup({ kind: "stop", id: "rec-1" })).toMatchObject({ kind: "stop", headline: "Corner Store", lngLat: { lng: RECORD.coords!.lng, lat: RECORD.coords!.lat } });
    expect(lookup({ kind: "stop", id: "nope" })).toBeNull();
    expect(lookup({ kind: "other", id: "rec-1" })).toBeNull(); // the kind must agree
  });

  it("builds a link from a selected record, and from nothing else", () => {
    expect(linkFromSelected({ kind: "entity", entity: RECORD })).toEqual({ kind: "stop", id: "rec-1" });
    expect(linkFromSelected(null)).toBeNull();
    expect(linkFromSelected({ kind: "entity", entity: { ...RECORD, kind: "note", id: "note-0123456789abcdef0123456789abcdef" } })).toBeNull();
    expect(linkFromSelected({ kind: "entity", entity: { ...RECORD, id: "has space" } })).toBeNull(); // fails the link pattern
  });
});

describe("NoteGlobeLayer", () => {
  beforeEach(() => {
    live.markers = [];
    usePivotStore.setState({ windows: [], nextZ: 20 });
    usePlayhead.setState({ playhead: T + 10, minTime: T - 1000, maxTime: T + 100000, windowMin: T - 1000, windowMax: T + 100000, isPlaying: true });
    useSelection.setState({ selected: null });
    useLayers.setState({ showAuths: true, showLogins: true, showPlaces: false, hiddenKinds: [], hiddenValues: {}, yoursOn: false });
    useSchema.setState({ nodes: [] });
    useNotesStore.setState({ scenario: SCENARIO, notes: [mk(1, T, { category: "Question", body: bodyOf("Look here.") })], customCategories: [], skipped: 0, error: null });
    useMarksStore.setState({ scenario: SCENARIO, nodes: [], paths: [] });
  });

  it("draws one mark for the record the note links: one plate, named for the record, with the ring beside it", () => {
    render(<NoteGlobeLayer map={fakeMap()} lookup={lookup} />);
    const b = screen.getByRole("button", { name: "Open your mark: stop: Corner Store" });
    expect(b.getAttribute("aria-label")).not.toContain("Open note");
    expect(live.markers).toHaveLength(2); // the ring and the plate
    for (const m of live.markers) expect(m.lngLat).toEqual([RECORD.coords!.lng, RECORD.coords!.lat]);
  });

  it("draws no square for each note: three notes on one record are one plate with the count 3", () => {
    useNotesStore.setState({ notes: [mk(1, T), mk(2, T + 1), mk(3, T + 2)] });
    render(<NoteGlobeLayer map={fakeMap()} lookup={lookup} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button").textContent).toBe("3");
  });

  it("a press opens the record's window and leaves the playhead where it was", () => {
    render(<NoteGlobeLayer map={fakeMap()} lookup={lookup} />);
    fireEvent.click(screen.getByRole("button", { name: "Open your mark: stop: Corner Store" }));
    expect(usePlayhead.getState().playhead).toBe(T + 10);
    expect(usePlayhead.getState().isPlaying).toBe(true);
    const w = usePivotStore.getState().windows;
    expect(w).toHaveLength(1);
    expect(w[0].kind === "record" && w[0].record).toEqual({ kind: "stop", id: "rec-1" });
    expect(useSelection.getState().selected).toBeNull();
  });

  it("an unpinned record draws nothing before its own time; a pinned one draws its plate alone", () => {
    usePlayhead.setState({ playhead: T - 500 });
    const { unmount } = render(<NoteGlobeLayer map={fakeMap()} lookup={lookup} />);
    expect(live.markers).toHaveLength(0);
    unmount();
    useMarksStore.setState({ nodes: [makeNode({ pinned: true })] });
    render(<NoteGlobeLayer map={fakeMap()} lookup={lookup} />);
    expect(live.markers).toHaveLength(1);
  });

  it("a note with no record, or whose record is not in the data, draws nothing on the globe", () => {
    useNotesStore.setState({ notes: [mk(1, T, { link: null }), mk(2, T, { link: { kind: "stop", id: "gone" } })] });
    render(<NoteGlobeLayer map={fakeMap()} lookup={lookup} />);
    expect(live.markers).toHaveLength(0);
  });

  it("draws nothing without a map", () => {
    render(<NoteGlobeLayer map={null} lookup={lookup} />);
    expect(live.markers).toHaveLength(0);
  });
});
