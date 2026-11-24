import { describe, it, expect, beforeEach } from "vitest";
import { usePivotStore } from "./pivot";
import { chromeToWindowNow } from "./text-size";
import { RECORD_WINDOW_DIMS } from "../lib/window-dims";
import type { EntityMatch } from "../lib/matches";
import type { Transaction } from "../types";
import type { Entity } from "../lib/entity";

function fakeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx1", card_id: "c1", account_id: "a1",
    timestamp: "2026-05-14T22:41:00Z", amount: 1275.97,
    merchant_name: "Mall · cash-out", merchant_lat: 6.43, merchant_lng: 3.42,
    merchant_country: "NG", mcc: "6011", category: "cash",
    is_card_present: 1, is_fraud: 1, balance_after: 0,
    auth_response_code: "00", pos_entry_mode: "05", network_ref_number: "n1",
    terminal_id: "t1", acquirer: "acq", auth_source: "card_present",
    risk_score: 943, is_3ds: 0, currency: "USD",
    ...overrides,
  };
}

const fraudEntity: EntityMatch = { kind: "fraud", tx: fakeTx() };
const authEntity: EntityMatch = { kind: "auth", tx: fakeTx({ id: "tx2", is_fraud: 0 }) };

beforeEach(() => {
  usePivotStore.setState({ windows: [], nextZ: 20 });
});

describe("glance tier (unpinned replacement)", () => {
  it("a second glance replaces the first unpinned window", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 10, y: 10 });
    usePivotStore.getState().openGlance(authEntity, { x: 50, y: 50 });
    const ws = usePivotStore.getState().windows;
    expect(ws).toHaveLength(1);
    expect(ws[0].kind).toBe("detail");
    expect(ws[0].kind === "detail" && ws[0].entity).toEqual(authEntity);
  });

  it("a glance does NOT replace a pinned window", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 10, y: 10 });
    const id = usePivotStore.getState().windows[0].id;
    usePivotStore.getState().togglePinned(id);
    usePivotStore.getState().openGlance(authEntity, { x: 50, y: 50 });
    expect(usePivotStore.getState().windows).toHaveLength(2);
  });

  it("openTrace shares the single transient slot with detail glances", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 10, y: 10 });
    usePivotStore.getState().openTrace("decision:geo_velocity:a:b", { x: 60, y: 60 });
    const ws = usePivotStore.getState().windows;
    expect(ws).toHaveLength(1);
    expect(ws[0].kind).toBe("trace");
  });
});

describe("flag tier", () => {
  it("flagToNode sets a node anchor and forces pinned", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 100, y: 100 });
    const id = usePivotStore.getState().windows[0].id;
    usePivotStore.getState().flagToNode(id, { lng: 3.42, lat: 6.43 }, { dx: 40, dy: -60 });
    const w = usePivotStore.getState().windows[0];
    expect(w.anchor.type).toBe("node");
    expect(w.pinned).toBe(true);
  });

  it("togglePinned is a no-op while node-anchored (flag implies pinned)", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 100, y: 100 });
    const id = usePivotStore.getState().windows[0].id;
    usePivotStore.getState().flagToNode(id, { lng: 3.42, lat: 6.43 }, { dx: 0, dy: 0 });
    usePivotStore.getState().togglePinned(id);
    expect(usePivotStore.getState().windows[0].pinned).toBe(true);
  });

  it("unflag reverts to a pinned screen window at the caller-provided position", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 100, y: 100 });
    const id = usePivotStore.getState().windows[0].id;
    usePivotStore.getState().flagToNode(id, { lng: 3.42, lat: 6.43 }, { dx: 0, dy: 0 });
    usePivotStore.getState().unflag(id, { x: 320, y: 180 });
    const w = usePivotStore.getState().windows[0];
    expect(w.anchor).toEqual({ type: "screen", x: 320, y: 180 });
    expect(w.pinned).toBe(true);
  });

  it("updateOffset adjusts a flagged window's tether", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 100, y: 100 });
    const id = usePivotStore.getState().windows[0].id;
    usePivotStore.getState().flagToNode(id, { lng: 3.42, lat: 6.43 }, { dx: 10, dy: 10 });
    usePivotStore.getState().updateOffset(id, 55, -20);
    const w = usePivotStore.getState().windows[0];
    expect(w.anchor.type === "node" && w.anchor.offset).toEqual({ dx: 55, dy: -20 });
  });
});

describe("collapse + z + lifecycle", () => {
  it("toggleCollapsed is orthogonal to pin state", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 10, y: 10 });
    const id = usePivotStore.getState().windows[0].id;
    usePivotStore.getState().toggleCollapsed(id);
    expect(usePivotStore.getState().windows[0].collapsed).toBe(true);
    expect(usePivotStore.getState().windows[0].pinned).toBe(false);
  });

  it("bringToFront assigns a strictly increasing z", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 10, y: 10 });
    const a = usePivotStore.getState().windows[0].id;
    usePivotStore.getState().togglePinned(a);
    usePivotStore.getState().openGlance(authEntity, { x: 50, y: 50 });
    usePivotStore.getState().bringToFront(a);
    const ws = usePivotStore.getState().windows;
    const za = ws.find((w) => w.id === a)!.z;
    const zb = ws.find((w) => w.id !== a)!.z;
    expect(za).toBeGreaterThan(zb);
  });

  it("updatePosition moves a screen-anchored window", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 10, y: 10 });
    const id = usePivotStore.getState().windows[0].id;
    usePivotStore.getState().updatePosition(id, 200, 300);
    expect(usePivotStore.getState().windows[0].anchor).toEqual({ type: "screen", x: 200, y: 300 });
  });

  it("closeWindow removes the window", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 10, y: 10 });
    const id = usePivotStore.getState().windows[0].id;
    usePivotStore.getState().closeWindow(id);
    expect(usePivotStore.getState().windows).toHaveLength(0);
  });
});

function gen(kind: string, id: string, coords: { lat: number; lng: number } | null, ts = 0): Entity {
  return {
    id, kind, timestamp: ts, coords, fields: { id },
    displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
  };
}
const AMS = { lat: 52.3676, lng: 4.9041 };
const signIn = gen("signin", "si-0628", AMS);
const change = gen("account_change", "ch-0002", AMS);
const SIGN_IN = { type: "section", sectionId: "sign-in", label: "Sign-in" } as const;
const CHANGE = { type: "section", sectionId: "account-change", label: "Account change" } as const;
const NOTES = { type: "notes", label: "Notes" } as const;

describe("popouts", () => {
  it("opens node-anchored and pinned at the entity's coords, carrying its view", () => {
    const id = usePivotStore.getState().openPopout(signIn, SIGN_IN);
    const [w] = usePivotStore.getState().windows;
    expect(w.id).toBe(id);
    expect(w.kind).toBe("detail");
    expect(w.pinned).toBe(true);
    expect(w.anchor).toEqual({ type: "node", lngLat: { lng: 4.9041, lat: 52.3676 }, offset: { dx: 32, dy: -17 } });
    expect(w.kind === "detail" && w.view).toEqual(SIGN_IN);
    expect(w.kind === "detail" && w.entity).toEqual({ kind: "entity", entity: signIn });
  });

  it("a second popout at the same pin stacks below the first", () => {
    usePivotStore.getState().openPopout(signIn, SIGN_IN);
    usePivotStore.getState().openPopout(change, CHANGE);
    const [, b] = usePivotStore.getState().windows;
    expect(b.anchor.type === "node" && b.anchor.offset).toEqual({ dx: 32, dy: -17 + 190 + 8 });
  });

  it("a popout that would reach the bottom stack below its pin starts a second column", () => {
    const HOU = { lat: 29.7371, lng: -95.5262 };
    const a = gen("record", "rec-0112", HOU);
    const b = gen("record", "rec-0113", HOU);
    usePivotStore.getState().setPinRoom(() => ({ pinX: 600, pinY: 300, right: 1588, bottom: 908 }));
    try {
      usePivotStore.getState().openPopout(a, NOTES); // 230 tall
      usePivotStore.getState().openPopout(a, SIGN_IN); // 190 tall
      usePivotStore.getState().openPopout(b, NOTES); // would end at 300 + 419 + 230 = 949, past 908
    } finally {
      usePivotStore.getState().setPinRoom(null);
    }
    const offsets = usePivotStore.getState().windows.map((w) => w.anchor.type === "node" && w.anchor.offset);
    expect(offsets).toEqual([{ dx: 32, dy: -17 }, { dx: 32, dy: -17 + 230 + 8 }, { dx: 32 + 308, dy: -17 }]);
  });

  it("re-opening the same view raises and expands it instead of duplicating", () => {
    const id = usePivotStore.getState().openPopout(signIn, SIGN_IN)!;
    usePivotStore.getState().toggleCollapsed(id);
    const zBefore = usePivotStore.getState().windows[0].z;
    expect(usePivotStore.getState().openPopout(signIn, SIGN_IN)).toBe(id);
    const ws = usePivotStore.getState().windows;
    expect(ws).toHaveLength(1);
    expect(ws[0].collapsed).toBe(false);
    expect(ws[0].z).toBeGreaterThan(zBefore);
  });

  it("a record's notes and one of its sections are separate windows", () => {
    const t = gen("record", "rec-0112", { lat: 29.7371, lng: -95.5262 });
    usePivotStore.getState().openPopout(t, NOTES);
    usePivotStore.getState().openPopout(t, SIGN_IN);
    expect(usePivotStore.getState().windows).toHaveLength(2);
  });

  it("an entity with no geography opens nothing", () => {
    expect(usePivotStore.getState().openPopout(gen("record", "r1", null), NOTES)).toBeNull();
    expect(usePivotStore.getState().windows).toHaveLength(0);
  });

  it("a glance does not evict an open popout", () => {
    usePivotStore.getState().openPopout(signIn, SIGN_IN);
    usePivotStore.getState().openGlance(fraudEntity, { x: 10, y: 10 });
    expect(usePivotStore.getState().windows).toHaveLength(2);
  });
});

describe("notes and pile popouts", () => {
  const decision = { id: "dec-1", kind: "verdict_export", timestamp: 5, coords: { lat: 36.6, lng: -93.2 }, fields: {},
    displayMetadata: { primaryLabel: "ATO · S", secondaryLabel: "", paletteKind: "verdict_export", pivotableFields: [] } } as Entity;

  it("a notes popout tethers at an explicit spot when given one", () => {
    usePivotStore.getState().openPopout(decision, { type: "notes", label: "Notes" }, { lng: 4.9, lat: 52.4 });
    const w = usePivotStore.getState().windows[0];
    expect(w.anchor).toMatchObject({ type: "node", lngLat: { lng: 4.9, lat: 52.4 } });
  });

  it("opening the same notes twice raises the open window instead of a second one", () => {
    const a = usePivotStore.getState().openPopout(decision, { type: "notes", label: "Notes" });
    const b = usePivotStore.getState().openPopout(decision, { type: "notes", label: "Notes" });
    expect(b).toBe(a);
    expect(usePivotStore.getState().windows).toHaveLength(1);
  });

  it("two piles of different members at one anchor are two windows", () => {
    usePivotStore.getState().openPopout(decision, { type: "pile", label: "2 decisions here", memberIds: ["a", "b"] });
    usePivotStore.getState().openPopout(decision, { type: "pile", label: "2 decisions here", memberIds: ["a", "c"] });
    expect(usePivotStore.getState().windows).toHaveLength(2);
  });
});

describe("record windows (the record's own window: state only)", () => {
  const rec = { kind: "auth", id: "tx-0001" };
  const place = (pinned: boolean, at?: { x: number; y: number }) => ({ lngLat: AMS, pinned, at });
  const noPlace = (pinned: boolean, at?: { x: number; y: number }) => ({ lngLat: null, pinned, at });
  const recordWindows = () => usePivotStore.getState().windows.filter((w) => w.kind === "record");

  it("with a place the window is node anchored and pinned as asked", () => {
    const id = usePivotStore.getState().openRecord(rec, place(true));
    const w = usePivotStore.getState().windows[0];
    expect(w.id).toBe(id);
    expect(w.kind).toBe("record");
    expect(w.anchor).toMatchObject({ type: "node", lngLat: AMS });
    expect(w.pinned).toBe(true);
    expect(w.kind === "record" && w.record).toEqual(rec);
    expect(w.collapsed).toBe(false);
  });

  it("the record is stored canonical: a fraud record opens as auth", () => {
    usePivotStore.getState().openRecord({ kind: "fraud", id: "tx-0001" }, place(false));
    const w = usePivotStore.getState().windows[0];
    expect(w.kind === "record" && w.record).toEqual({ kind: "auth", id: "tx-0001" });
  });

  it("one window per record: a second call raises and unfolds it, takes the new pinned value and returns its id", () => {
    const a = usePivotStore.getState().openRecord(rec, place(false));
    usePivotStore.getState().toggleCollapsed(a);
    const z0 = usePivotStore.getState().windows[0].z;
    const b = usePivotStore.getState().openRecord({ kind: "fraud", id: "tx-0001" }, place(true));
    expect(b).toBe(a);
    const ws = usePivotStore.getState().windows;
    expect(ws).toHaveLength(1);
    expect(ws[0].collapsed).toBe(false);
    expect(ws[0].pinned).toBe(true);
    expect(ws[0].z).toBeGreaterThan(z0);
  });

  it("without a place it is a screen window at `at`, else at the default spot stepping 24 px", () => {
    usePivotStore.getState().openRecord(rec, noPlace(true, { x: 300, y: 200 }));
    expect(usePivotStore.getState().windows[0].anchor).toEqual({ type: "screen", x: 300, y: 200 });
    usePivotStore.setState({ windows: [], nextZ: 20 });
    usePivotStore.getState().openRecord({ kind: "x", id: "1" }, noPlace(true));
    usePivotStore.getState().openRecord({ kind: "x", id: "2" }, noPlace(true));
    expect(usePivotStore.getState().windows.map((w) => w.anchor)).toEqual([
      { type: "screen", x: 120, y: 80 },
      { type: "screen", x: 144, y: 104 },
    ]);
  });

  it("opening a record window drops an unpinned glance, and keeps a pinned window", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 10, y: 10 });
    usePivotStore.getState().openRecord(rec, place(true));
    expect(usePivotStore.getState().windows.map((w) => w.kind)).toEqual(["record"]);
    usePivotStore.getState().openRecord({ kind: "login", id: "lg-1" }, noPlace(false));
    expect(usePivotStore.getState().windows).toHaveLength(2);
    usePivotStore.getState().openRecord({ kind: "login", id: "lg-2" }, noPlace(false));
    // the unpinned record window was the one transient slot; the pinned one stays
    expect(recordWindows().map((w) => w.kind === "record" && w.record.id)).toEqual(["tx-0001", "lg-2"]);
  });

  it("a pinned record window survives a later glance and trace; an unpinned one does not", () => {
    usePivotStore.getState().openRecord(rec, place(true));
    usePivotStore.getState().openRecord({ kind: "login", id: "lg-1" }, noPlace(false));
    usePivotStore.getState().openGlance(fraudEntity, { x: 10, y: 10 });
    expect(usePivotStore.getState().windows.map((w) => w.kind)).toEqual(["record", "detail"]);
    usePivotStore.getState().openTrace("decision:x", { x: 5, y: 5 });
    expect(usePivotStore.getState().windows.map((w) => w.kind)).toEqual(["record", "trace"]);
  });

  it("setRecordPinned changes every window of that record and no other", () => {
    usePivotStore.getState().openRecord(rec, place(true));
    usePivotStore.getState().openRecord({ kind: "login", id: "lg-1" }, noPlace(true));
    usePivotStore.getState().openGlance(fraudEntity, { x: 10, y: 10 });
    usePivotStore.getState().setRecordPinned({ kind: "fraud", id: "tx-0001" }, false);
    const ws = usePivotStore.getState().windows;
    expect(ws.map((w) => w.pinned)).toEqual([false, true, false]);
    usePivotStore.getState().setRecordPinned(rec, true);
    expect(usePivotStore.getState().windows.map((w) => w.pinned)).toEqual([true, true, false]);
  });

  it("togglePinned, flagToNode and unflag leave a record window as it was", () => {
    const a = usePivotStore.getState().openRecord({ kind: "x", id: "1" }, noPlace(false, { x: 50, y: 60 }));
    const b = usePivotStore.getState().openRecord(rec, place(true));
    const before = JSON.stringify(usePivotStore.getState().windows);
    usePivotStore.getState().togglePinned(a);
    usePivotStore.getState().flagToNode(a, AMS, { dx: 1, dy: 2 });
    usePivotStore.getState().unflag(b, { x: 5, y: 5 });
    usePivotStore.getState().flagToNode(b, AMS, { dx: 1, dy: 2 });
    expect(JSON.stringify(usePivotStore.getState().windows)).toBe(before);
  });

  it("updatePosition and updateOffset keep their rules for a record window", () => {
    const a = usePivotStore.getState().openRecord({ kind: "x", id: "1" }, noPlace(true, { x: 50, y: 60 }));
    const b = usePivotStore.getState().openRecord(rec, place(true));
    usePivotStore.getState().updatePosition(a, 70, 80);
    usePivotStore.getState().updateOffset(b, 11, 12);
    const ws = usePivotStore.getState().windows;
    expect(ws[0].anchor).toEqual({ type: "screen", x: 70, y: 80 });
    expect(ws[1].anchor).toMatchObject({ type: "node", offset: { dx: 11, dy: 12 } });
  });

  it("estHeight reads RECORD_WINDOW_DIMS: a second popout at the same place stacks below it", () => {
    usePivotStore.getState().openRecord(rec, place(true));
    const first = usePivotStore.getState().windows[0].anchor;
    usePivotStore.getState().openPopout(gen("signin", "si-1", AMS), SIGN_IN);
    const second = usePivotStore.getState().windows[1].anchor;
    if (first.type !== "node" || second.type !== "node") throw new Error("node anchors expected");
    expect(second.offset.dy).toBe(first.offset.dy + chromeToWindowNow(RECORD_WINDOW_DIMS.height) + 8);
  });

  it("RECORD_WINDOW_DIMS is the plan's estimate: 300 wide, 260 high (measured 172 with no note, 302 with four)", () => {
    expect(RECORD_WINDOW_DIMS).toEqual({ width: 300, height: 260 });
  });
});

// The rules the record window's frame leans on (PLAN-window R1.3): its pin is the record's pin, so the
// window store's own pin, flag and slot rules must leave a record window to the marks store.
describe("record windows (the frame's pin and the one transient slot)", () => {
  const rec = { kind: "auth", id: "tx-0001" };
  const other = { kind: "login", id: "lg-1" };
  const state = () => usePivotStore.getState();

  it("a screen-held record window keeps its pinned value after togglePinned, pinned or not", () => {
    const a = state().openRecord(other, { lngLat: null, pinned: false, at: { x: 50, y: 60 } });
    state().togglePinned(a);
    expect(state().windows[0].pinned).toBe(false);
    state().setRecordPinned(other, true);
    state().togglePinned(a);
    expect(state().windows[0].pinned).toBe(true);
  });

  it("a tethered record window keeps its anchor after unflag, and flagToNode leaves a screen-held one on the screen", () => {
    const t = state().openRecord(rec, { lngLat: AMS, pinned: true });
    const before = state().windows[0].anchor;
    state().unflag(t, { x: 5, y: 5 });
    expect(state().windows[0].anchor).toEqual(before);
    const s = state().openRecord(other, { lngLat: null, pinned: true, at: { x: 50, y: 60 } });
    state().flagToNode(s, AMS, { dx: 1, dy: 2 });
    expect(state().windows[1].anchor).toEqual({ type: "screen", x: 50, y: 60 });
  });

  it("an unpinned record window is removed by a glance, and by a trace", () => {
    state().openRecord(rec, { lngLat: AMS, pinned: false });
    state().openGlance(fraudEntity, { x: 10, y: 10 });
    expect(state().windows.map((w) => w.kind)).toEqual(["detail"]);
    state().openRecord(rec, { lngLat: AMS, pinned: false });
    state().openTrace("decision:x", { x: 5, y: 5 });
    expect(state().windows.map((w) => w.kind)).toEqual(["trace"]);
  });

  it("a record window made pinned by setRecordPinned survives a glance and a trace", () => {
    state().openRecord(rec, { lngLat: AMS, pinned: false });
    state().setRecordPinned(rec, true);
    state().openGlance(fraudEntity, { x: 10, y: 10 });
    state().openTrace("decision:x", { x: 5, y: 5 });
    expect(state().windows.map((w) => w.kind)).toEqual(["record", "trace"]);
    state().setRecordPinned(rec, false);
    state().openGlance(authEntity, { x: 10, y: 10 });
    expect(state().windows.map((w) => w.kind)).toEqual(["detail"]);
  });

  it("closeWindow removes a record window", () => {
    const id = state().openRecord(rec, { lngLat: AMS, pinned: true });
    state().closeWindow(id);
    expect(state().windows).toEqual([]);
  });
});
