/**
 * The hooks of the marks store: they select raw slices and derive with useMemo, so a result keeps
 * its identity until a slice it reads changes. The switches' value holds still between playhead
 * ticks; the draw inputs follow the playhead.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  useCaseLookup,
  useDrawInputs,
  useFailCategories,
  useMarksStore,
  useRecordFacts,
  useRecordNode,
  useRecordNotes,
  useShowInputs,
  useYourMarks,
} from "./marks";
import { PIN_WINS, useLayers } from "./layers";
import { useNotesStore } from "./notes";
import { usePivotData } from "./pivot-data";
import { usePlayhead } from "./playhead";
import { useSchema } from "./schema";
import { useSelection } from "./selection";
import { manifestRowToEntity } from "../lib/adapters/manifest-row";
import { makeNode, makeNote, makePath } from "../lib/notes/test-fixtures";
import { verdictNode } from "../lib/verdict-fixtures";
import { drawState } from "../lib/marks/draw";
import type { Entity } from "../lib/entity";
import type { RecordLookup } from "../components/notes/record-lookup";

const SCENARIO = "card-fraud";
const R1 = { kind: "stop", id: "rec-1" };

const decision = (id: string, state: string, finding: string, when: string): Entity =>
  manifestRowToEntity(verdictNode, { id, state, finding, memo: "m", who: "analyst", subject: "S", acct: "a1", worked: "ev-7", when, y: 1, x: 2 });

beforeEach(() => {
  useMarksStore.getState().clear();
  useNotesStore.getState().clear();
  useLayers.setState({
    showAuths: true,
    showLogins: true,
    showPlaces: false,
    hiddenKinds: [],
    hiddenValues: {},
    yoursOn: false,
    yoursFacets: { pinned: true, pass: true, fail: true, wait: true, noted: true, inPath: true },
  });
  usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [] });
  useSchema.setState({ scenarioId: null, nodes: [] });
  usePlayhead.setState({ playhead: 100, minTime: 0, maxTime: 0 });
  useSelection.setState({ selected: null });
});

/** A selection of the shapes the Inspector shows, cut to the fields the link reads (the id and the kind). */
const selectTx = (kind: "auth" | "fraud", id: string) => useSelection.setState({ selected: { kind, tx: { id } } as never });
const selectEntity = (kind: string, id: string) => useSelection.setState({ selected: { kind: "entity", entity: { id, kind } } as never });

describe("useRecordNode and useRecordNotes", () => {
  it("follow the stores and keep the same value between renders when nothing changed", () => {
    useMarksStore.setState({ scenario: SCENARIO, nodes: [makeNode({ record: R1, pinned: true })] });
    useNotesStore.setState({ scenario: SCENARIO, notes: [makeNote({ link: { kind: "stop", id: "rec-1" } }), makeNote({ id: "note-" + "a".repeat(32), seq: 2, link: null })] });
    const node = renderHook(({ r }) => useRecordNode(r), { initialProps: { r: R1 as typeof R1 | null } });
    const notes = renderHook(({ r }) => useRecordNotes(r), { initialProps: { r: R1 as typeof R1 | null } });
    expect(node.result.current).toMatchObject({ pinned: true });
    expect(notes.result.current).toHaveLength(1);
    const n0 = node.result.current;
    const l0 = notes.result.current;
    node.rerender({ r: { ...R1 } }); // a new record object for the same record
    notes.rerender({ r: { ...R1 } });
    expect(node.result.current).toBe(n0);
    expect(notes.result.current).toBe(l0);
    act(() => useMarksStore.setState({ nodes: [makeNode({ record: R1, pinned: false })] }));
    expect(node.result.current).not.toBe(n0);
    expect(node.result.current?.pinned).toBe(false);
    act(() => useNotesStore.setState({ notes: [] }));
    expect(notes.result.current).toEqual([]);
  });
  it("a null record gives null and no notes; a fraud record finds the auth node", () => {
    useMarksStore.setState({ scenario: SCENARIO, nodes: [makeNode({ record: { kind: "auth", id: "tx-1" } })] });
    const none = renderHook(() => useRecordNode(null));
    expect(none.result.current).toBeNull();
    expect(renderHook(() => useRecordNotes(null)).result.current).toEqual([]);
    expect(renderHook(() => useRecordNode({ kind: "fraud", id: "tx-1" })).result.current).not.toBeNull();
  });
  it("notes of another story are not this record's notes", () => {
    useNotesStore.setState({ scenario: SCENARIO, notes: [makeNote({ scenario: "priya-ato", link: R1 })] });
    expect(renderHook(() => useRecordNotes(R1)).result.current).toEqual([]);
  });
});

describe("useRecordFacts", () => {
  it("changes identity only when the nodes, the notes or the paths change", () => {
    useMarksStore.setState({ scenario: SCENARIO, nodes: [makeNode({ record: R1, pinned: true })], paths: [] });
    const { result, rerender } = renderHook(() => useRecordFacts());
    const f0 = result.current;
    expect(f0(R1)).toMatchObject({ pinned: true, noted: false, inPath: false });
    rerender();
    expect(result.current).toBe(f0);
    act(() => usePlayhead.setState({ playhead: 500 }));
    expect(result.current).toBe(f0);
    act(() => useMarksStore.setState({ paths: [makePath()] }));
    expect(result.current).not.toBe(f0);
    expect(result.current(R1).inPath).toBe(true);
    const f1 = result.current;
    act(() => useNotesStore.setState({ scenario: SCENARIO, notes: [makeNote({ link: R1 })] }));
    expect(result.current).not.toBe(f1);
    expect(result.current(R1).noted).toBe(true);
    const f2 = result.current;
    act(() => useMarksStore.setState({ nodes: [makeNode({ record: R1, disposition: "pass" })] }));
    expect(result.current).not.toBe(f2);
  });
});

describe("useShowInputs and useDrawInputs", () => {
  it("useShowInputs keeps its identity across a playhead change", () => {
    const { result } = renderHook(() => useShowInputs());
    const s0 = result.current;
    act(() => usePlayhead.setState({ playhead: 777 }));
    act(() => usePlayhead.setState({ playhead: 778 }));
    expect(result.current).toBe(s0);
  });
  it("reads showPlaces and PIN_WINS", () => {
    const { result } = renderHook(() => useShowInputs());
    expect(result.current.placesOn).toBe(false);
    expect(result.current.pinWins).toBe(PIN_WINS);
    act(() => useLayers.setState({ showPlaces: true }));
    expect(result.current.placesOn).toBe(true);
  });
  it("follows the switches: a hidden kind, a hidden value, Yours and its facets", () => {
    useSchema.setState({
      nodes: [{ kind: "signin", label: "Sign-in", filter: { field: "network_type", label: "Network type" } } as never],
    });
    const { result } = renderHook(() => useShowInputs());
    expect(result.current.kindOn("signin")).toBe(true);
    expect(result.current.filterField("signin")).toBe("network_type");
    act(() => useLayers.setState({ hiddenKinds: ["signin"], hiddenValues: { signin: ["vpn"] }, yoursOn: true }));
    expect(result.current.kindOn("signin")).toBe(false);
    expect(result.current.valueOn("signin", "vpn")).toBe(false);
    expect(result.current.valueOn("signin", "isp")).toBe(true);
    expect(result.current.yours.on).toBe(true);
  });
  it("its facts follow the marks", () => {
    const { result } = renderHook(() => useShowInputs());
    expect(result.current.facts(R1).pinned).toBe(false);
    act(() => useMarksStore.setState({ scenario: SCENARIO, nodes: [makeNode({ record: R1, pinned: true })] }));
    expect(result.current.facts(R1).pinned).toBe(true);
  });
  it("reads the selected record in canonical form, and null when none is selected", () => {
    const { result } = renderHook(() => useShowInputs());
    expect(result.current.selected).toBeNull();
    act(() => selectEntity("stop", "rec-1"));
    expect(result.current.selected).toEqual({ kind: "stop", id: "rec-1" });
    act(() => selectTx("fraud", "tx-1")); // a fraud transaction is the auth record
    expect(result.current.selected).toEqual({ kind: "auth", id: "tx-1" });
    act(() => selectTx("auth", "tx-2"));
    expect(result.current.selected).toEqual({ kind: "auth", id: "tx-2" });
    act(() => useSelection.getState().clear());
    expect(result.current.selected).toBeNull();
  });
  it("reads no selected record for a selected note", () => {
    const { result } = renderHook(() => useShowInputs());
    act(() => selectEntity("note", "note-" + "a".repeat(32)));
    expect(result.current.selected).toBeNull();
  });
  it("changes identity when the selected record changes, and holds it for the same record and across a playhead tick", () => {
    const { result } = renderHook(() => useShowInputs());
    const s0 = result.current;
    act(() => selectEntity("stop", "rec-1"));
    const s1 = result.current;
    expect(s1).not.toBe(s0);
    // the same record picked again, as a new selection object, and a tick of the playhead
    act(() => selectEntity("stop", "rec-1"));
    act(() => usePlayhead.setState({ playhead: 4321 }));
    expect(result.current).toBe(s1);
    expect(result.current.selected).toBe(s1.selected);
    // the same transaction selected as fraud and as auth is one record to the one function
    act(() => selectTx("fraud", "tx-1"));
    const s2 = result.current;
    expect(s2).not.toBe(s1);
    act(() => selectTx("auth", "tx-1"));
    expect(result.current).toBe(s2);
    act(() => selectTx("auth", "tx-9"));
    expect(result.current).not.toBe(s2);
  });
  it("keeps the selected record drawn against a switched-off kind", () => {
    useLayers.setState({ hiddenKinds: ["stop"] });
    const rec = { kind: "stop", id: "rec-1", timestamp: 0, fields: {} };
    const { result } = renderHook(() => useDrawInputs());
    expect(drawState(rec, result.current).shown).toBe(false);
    act(() => selectEntity("stop", "rec-1"));
    expect(drawState(rec, result.current)).toMatchObject({ shown: true, reached: true, dot: true });
    act(() => selectEntity("stop", "rec-2"));
    expect(drawState(rec, result.current).shown).toBe(false);
  });
  it("useDrawInputs follows the playhead, and windowed is maxTime above minTime", () => {
    const { result } = renderHook(() => useDrawInputs());
    expect(result.current).toMatchObject({ playhead: 100, windowed: false });
    act(() => usePlayhead.setState({ playhead: 250, minTime: 10, maxTime: 900 }));
    expect(result.current).toMatchObject({ playhead: 250, windowed: true });
    // it is a ShowInputs too: the one function reads it
    const st = drawState({ kind: "stop", id: "rec-1", timestamp: 300, fields: {} }, result.current);
    expect(st).toMatchObject({ shown: true, reached: false });
    act(() => usePlayhead.setState({ playhead: 300 }));
    expect(drawState({ kind: "stop", id: "rec-1", timestamp: 300, fields: {} }, result.current).reached).toBe(true);
  });
  it("useDrawInputs keeps its identity until the playhead or the switches change", () => {
    const { result, rerender } = renderHook(() => useDrawInputs());
    const d0 = result.current;
    rerender();
    expect(result.current).toBe(d0);
  });
});

describe("useFailCategories", () => {
  it("gives the story's failed-decision word, then the typed names", () => {
    useSchema.setState({ nodes: [verdictNode] });
    usePivotData.setState({
      entities: [
        decision("d1", "FAIL", "FRAUD", "2026-06-09T09:40:00-05:00"),
        decision("d2", "PASS", "PASSED", "2026-06-09T09:41:00-05:00"),
      ],
    });
    useMarksStore.setState({ scenario: SCENARIO, failCategories: ["Shared key", "fraud"] });
    const { result } = renderHook(() => useFailCategories());
    expect(result.current).toEqual(["FRAUD", "Shared key"]);
    const l0 = result.current;
    act(() => usePlayhead.setState({ playhead: 5 }));
    expect(result.current).toBe(l0);
  });
});

describe("useCaseLookup", () => {
  it("is memoised on the five lists: the same function until one changes, and a changed list is read", () => {
    const { result, rerender } = renderHook(() => useCaseLookup());
    const l0 = result.current;
    rerender();
    expect(result.current).toBe(l0);
    act(() => usePlayhead.setState({ playhead: 9 }));
    expect(result.current).toBe(l0);
    expect(l0({ kind: "signin", id: "si-1" })).toBeNull();
    act(() =>
      usePivotData.setState({
        entities: [
          {
            id: "si-1",
            kind: "signin",
            timestamp: 5,
            coords: { lat: 1, lng: 2 },
            fields: {},
            displayMetadata: { primaryLabel: "x", secondaryLabel: "", paletteKind: "signin", pivotableFields: [] },
          },
        ],
      }),
    );
    expect(result.current).not.toBe(l0);
    expect(result.current({ kind: "signin", id: "si-1" })).toMatchObject({ time: 5, lngLat: { lng: 2, lat: 1 } });
  });
});

describe("useYourMarks", () => {
  it("gives yourMarks of the stores: the marked records, pinned first", () => {
    useMarksStore.setState({ scenario: SCENARIO, nodes: [makeNode({ record: R1 }), makeNode({ record: { kind: "stop", id: "rec-2" }, pinned: true })] });
    useNotesStore.setState({ scenario: SCENARIO, notes: [makeNote({ link: R1 })] });
    const lookup: RecordLookup = () => null;
    const { result } = renderHook(() => useYourMarks(lookup));
    expect(result.current.map((m) => m.record.id)).toEqual(["rec-2", "rec-1"]);
    const y0 = result.current;
    act(() => usePlayhead.setState({ playhead: 12 }));
    expect(result.current).toBe(y0);
  });
  it("is empty with no story loaded", () => {
    const lookup: RecordLookup = () => null;
    expect(renderHook(() => useYourMarks(lookup)).result.current).toEqual([]);
  });
});
