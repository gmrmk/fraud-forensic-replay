/**
 * The one function. The truth table is BUILD-PLAN C5.2, rows 1 to 20, run with the pin winning and
 * rows 8, 9 and 14 again with it not winning (every commit before the layers piece's item 1), then
 * rows 21 to 25 with the record selected (S = 1, AMEND-model 6.2); rows 1 to 20 run with S = 0. Also
 * the switches' inputs, the seed schema's adapter, `narrowByShown` and `drawCounts`. No wall clock:
 * every time is fixed text parsed here.
 */
import { describe, it, expect } from "vitest";
import {
  drawCounts,
  drawRecordOf,
  drawState,
  isShown,
  kindOnOf,
  narrowByShown,
  showInputsOf,
  type DrawInputs,
  type DrawRecord,
  type ShowSwitches,
} from "./draw";
import type { RecordFacts, RecordRef, YoursFacet } from "./types";
import type { ScenarioNode } from "../scenarios";
import type { Entity } from "../entity";
import type { PivotContext } from "../matches";
import type { AccountEvent, LoginEvent, Place, Transaction, Transfer } from "../../types";

const ALL_ON: Record<YoursFacet, boolean> = { pinned: true, pass: true, fail: true, wait: true, noted: true, inPath: true };
const NONE: RecordFacts = { pinned: false, disposition: "none", noted: false, inPath: false };
const facts = (over: Partial<RecordFacts> = {}): RecordFacts => ({ ...NONE, ...over });

const SIGNIN_NODE: ScenarioNode = {
  kind: "signin",
  label: "Sign-in",
  palette: "login",
  source: "signin.json",
  filter: { field: "network_type", label: "Network type" },
};
const NODES: ScenarioNode[] = [SIGNIN_NODE, { kind: "org", label: "Organisation", palette: "entity", source: "org.json" }];

const sw = (over: Partial<ShowSwitches> = {}): ShowSwitches => ({
  showAuths: true,
  showLogins: true,
  showPlaces: false,
  pinWins: true,
  hiddenKinds: [],
  hiddenValues: {},
  yoursOn: false,
  yoursFacets: ALL_ON,
  ...over,
});

const REACHED = Date.parse("2026-11-16T10:00:00Z");
const PLAYHEAD = Date.parse("2026-11-16T12:00:00Z");
const AHEAD = Date.parse("2026-11-16T14:00:00Z");

interface Row {
  n: number;
  name: string;
  kindOff?: boolean;
  valueOff?: boolean;
  yours?: Partial<Record<YoursFacet, boolean>>;
  facts?: Partial<RecordFacts>;
  ahead?: boolean;
  untimed?: boolean;
  place?: boolean;
  placesOn?: boolean;
  /** S = 1: the record is the one the Inspector shows (Q10). Rows 1 to 20 leave it out (S = 0). */
  selected?: boolean;
  /** shown, reached, dot, globeMark, timelineMark */
  expect: [boolean, boolean, boolean, string, string];
}

/** Rows 1 to 20 of the truth table (BUILD-PLAN C5.2), with the pin winning (W = 1). */
const ROWS: Row[] = [
  { n: 1, name: "plain, reached", expect: [true, true, true, "none", "none"] },
  { n: 2, name: "plain, ahead", ahead: true, expect: [true, false, false, "none", "none"] },
  { n: 3, name: "kind off", kindOff: true, expect: [false, false, false, "none", "none"] },
  { n: 4, name: "value off", valueOff: true, expect: [false, false, false, "none", "none"] },
  { n: 5, name: "marked, reached", facts: { disposition: "pass" }, expect: [true, true, true, "lit", "lit"] },
  { n: 6, name: "marked, unpinned, ahead", facts: { disposition: "pass" }, ahead: true, expect: [true, false, false, "none", "dim"] },
  { n: 7, name: "pinned, ahead", facts: { pinned: true }, ahead: true, expect: [true, false, false, "dim", "dim"] },
  { n: 8, name: "kind off, pinned, reached", kindOff: true, facts: { pinned: true }, expect: [true, true, true, "lit", "lit"] },
  { n: 9, name: "kind off, pinned, ahead", kindOff: true, facts: { pinned: true }, ahead: true, expect: [true, false, false, "dim", "dim"] },
  { n: 10, name: "kind off, marked, unpinned", kindOff: true, facts: { disposition: "pass" }, expect: [false, false, false, "none", "none"] },
  { n: 11, name: "Yours on, matches an on facet", yours: {}, facts: { disposition: "pass" }, expect: [true, true, true, "lit", "lit"] },
  { n: 12, name: "Yours on, untouched", yours: {}, expect: [false, false, false, "none", "none"] },
  { n: 13, name: "Yours on, kind off, PASS, unpinned", yours: {}, kindOff: true, facts: { disposition: "pass" }, expect: [false, false, false, "none", "none"] },
  { n: 14, name: "Yours on, kind off, pinned, Pinned facet on", yours: {}, kindOff: true, facts: { pinned: true }, expect: [true, true, true, "lit", "lit"] },
  { n: 15, name: "Yours on, pinned only, Pinned facet off", yours: { pinned: false }, facts: { pinned: true }, expect: [false, false, false, "none", "none"] },
  {
    n: 16,
    name: "Yours on, all six facets off",
    yours: { pinned: false, pass: false, fail: false, wait: false, noted: false, inPath: false },
    facts: { pinned: true, disposition: "pass", noted: true, inPath: true },
    expect: [false, false, false, "none", "none"],
  },
  { n: 17, name: "in a path only, Yours on, In a path on", yours: {}, facts: { inPath: true }, expect: [true, true, true, "none", "none"] },
  { n: 18, name: "untimed, pinned", untimed: true, facts: { pinned: true }, expect: [true, true, true, "lit", "lit"] },
  { n: 19, name: "a marked place, Places off", place: true, facts: { noted: true }, expect: [true, true, false, "lit", "lit"] },
  { n: 20, name: "a marked place, Places on", place: true, placesOn: true, facts: { noted: true }, expect: [true, true, true, "lit", "lit"] },
  // Rows 21 to 25 (AMEND-model 6.2, owner question Q10): the selected record stays drawn, S = 1.
  { n: 21, name: "selected, kind off, reached", selected: true, kindOff: true, expect: [true, true, true, "none", "none"] },
  { n: 22, name: "selected, value off, reached", selected: true, valueOff: true, expect: [true, true, true, "none", "none"] },
  { n: 23, name: "selected, Yours on, untouched, reached", selected: true, yours: {}, expect: [true, true, true, "none", "none"] },
  { n: 24, name: "selected, kind off, marked, unpinned, reached", selected: true, kindOff: true, facts: { disposition: "pass" }, expect: [true, true, true, "lit", "lit"] },
  { n: 25, name: "selected, kind off, ahead of the playhead", selected: true, kindOff: true, ahead: true, expect: [true, false, false, "none", "none"] },
];

function recordOf(row: Row): DrawRecord {
  if (row.place) return { kind: "place", id: "pl-1", timestamp: 0, fields: {} };
  const timestamp = row.untimed ? 0 : row.ahead ? AHEAD : REACHED;
  return { kind: "signin", id: "si-1", timestamp, fields: { network_type: row.valueOff ? "mobile" : "fixed" } };
}

/** The record the Inspector shows: the row's own record when `selected` is set, else another one. */
function selectedOf(row: Row, on: boolean): RecordRef {
  const rec = recordOf(row);
  return on ? { kind: rec.kind, id: rec.id } : { kind: rec.kind, id: "someone-else" };
}

function inputsOf(row: Row, pinWins: boolean, selected: RecordRef | null = row.selected === true ? selectedOf(row, true) : null): DrawInputs {
  const s = showInputsOf(
    sw({
      pinWins,
      showPlaces: row.placesOn === true,
      hiddenKinds: row.kindOff ? ["signin"] : [],
      hiddenValues: row.valueOff ? { signin: ["mobile"] } : {},
      yoursOn: row.yours !== undefined,
      yoursFacets: { ...ALL_ON, ...row.yours },
    }),
    NODES,
    () => facts(row.facts),
    selected,
  );
  return { ...s, playhead: PLAYHEAD, windowed: true };
}

describe("drawState: the truth table", () => {
  it.each(ROWS)("row $n: $name", (row) => {
    const rec = recordOf(row);
    const d = inputsOf(row, true);
    const got = drawState(rec, d);
    expect([got.shown, got.reached, got.dot, got.globeMark, got.timelineMark]).toEqual(row.expect);
    expect(isShown(rec, d)).toBe(got.shown);
  });

  it.each(ROWS.filter((r) => r.n <= 20))("row $n: $name, with another record selected (S = 0) reads as with none", (row) => {
    const rec = recordOf(row);
    expect(drawState(rec, inputsOf(row, true, selectedOf(row, false)))).toEqual(drawState(rec, inputsOf(row, true, null)));
  });

  it.each(ROWS.filter((r) => r.n >= 21))("row $n: $name, is shown whether or not the pin wins", (row) => {
    expect(drawState(recordOf(row), inputsOf(row, false)).shown).toBe(true);
  });

  it.each(ROWS.filter((r) => r.n >= 21))("row $n: $name, is not shown when nothing is selected", (row) => {
    const d = inputsOf(row, true, null);
    expect(isShown(recordOf(row), d)).toBe(false);
  });

  it("compares the selected record by canonical kind: a record selected as auth is the fraud transaction", () => {
    const rec: DrawRecord = { kind: "fraud", id: "tx-1", timestamp: REACHED, fields: {} };
    const hidden = sw({ showAuths: false });
    const sel = showInputsOf(hidden, NODES, () => facts(), { kind: "auth", id: "tx-1" });
    expect(isShown(rec, sel)).toBe(true);
    const other = showInputsOf(hidden, NODES, () => facts(), { kind: "auth", id: "tx-2" });
    expect(isShown(rec, other)).toBe(false);
    // the same id under another kind is another record
    const otherKind = showInputsOf(hidden, NODES, () => facts(), { kind: "login", id: "tx-1" });
    expect(isShown(rec, otherKind)).toBe(false);
  });

  it("keeps the selected record shown against a Yours facet that does not match and against a hidden value", () => {
    const rec: DrawRecord = { kind: "signin", id: "si-1", timestamp: REACHED, fields: { network_type: "mobile" } };
    const s = showInputsOf(sw({ yoursOn: true, hiddenValues: { signin: ["mobile"] }, hiddenKinds: ["signin"] }), NODES, () => facts(), { kind: "signin", id: "si-1" });
    expect(drawState({ ...rec }, { ...s, playhead: PLAYHEAD, windowed: true })).toMatchObject({ shown: true, reached: true, dot: true });
  });

  it.each(ROWS.filter((r) => [8, 9, 14].includes(r.n)))("row $n: $name, with the pin not winning (before item 1)", (row) => {
    const got = drawState(recordOf(row), inputsOf(row, false));
    expect(got).toEqual({ shown: false, reached: false, dot: false, globeMark: "none", timelineMark: "none" });
  });

  it.each(ROWS.filter((r) => ![8, 9, 14].includes(r.n)))("row $n gives the same answer whether or not the pin wins", (row) => {
    expect(drawState(recordOf(row), inputsOf(row, false))).toEqual(drawState(recordOf(row), inputsOf(row, true)));
  });

  it("makes every shown record reached before the playhead's bounds load (windowed false)", () => {
    const row = ROWS[1];
    const d: DrawInputs = { ...inputsOf(row, true), windowed: false };
    expect(drawState(recordOf(row), d)).toMatchObject({ shown: true, reached: true, dot: true });
  });

  it("reads a record with no value for the filter field as the empty value, which can be switched off", () => {
    const rec: DrawRecord = { kind: "signin", id: "si-1", timestamp: REACHED, fields: {} };
    const on = showInputsOf(sw(), NODES, () => facts(), null);
    const off = showInputsOf(sw({ hiddenValues: { signin: [""] } }), NODES, () => facts(), null);
    expect(isShown(rec, on)).toBe(true);
    expect(isShown(rec, off)).toBe(false);
    // A blank string and a number read as rowValue reads them.
    const blank: DrawRecord = { ...rec, fields: { network_type: "  " } };
    expect(isShown(blank, off)).toBe(false);
    const num: DrawRecord = { ...rec, fields: { network_type: 4 } };
    expect(isShown(num, showInputsOf(sw({ hiddenValues: { signin: ["4"] } }), NODES, () => facts(), null))).toBe(false);
  });

  it("does not count a timestamp that does not parse as reached while the bounds are loaded", () => {
    const rec: DrawRecord = { kind: "signin", id: "si-1", timestamp: Number.NaN, fields: {} };
    const s = showInputsOf(sw(), NODES, () => facts({ pinned: true }), null);
    expect(drawState(rec, { ...s, playhead: PLAYHEAD, windowed: true })).toMatchObject({ shown: true, reached: false, dot: false, globeMark: "dim" });
    expect(drawState(rec, { ...s, playhead: PLAYHEAD, windowed: false })).toMatchObject({ reached: true });
  });

  it("asks the facts function for the record by its own kind and id", () => {
    const asked: string[] = [];
    const s = showInputsOf(sw(), NODES, (r) => {
      asked.push(`${r.kind}:${r.id}`);
      return facts();
    }, null);
    drawState({ kind: "fraud", id: "tx-1", timestamp: REACHED, fields: {} }, { ...s, playhead: PLAYHEAD, windowed: true });
    expect(asked).toEqual(["fraud:tx-1"]);
  });
});

describe("kindOnOf", () => {
  it("reads auth and fraud from showAuths, login from showLogins, a place always on, any other kind from the list", () => {
    const on = kindOnOf(sw({ hiddenKinds: ["place", "auth", "login"] }));
    expect(on("auth")).toBe(true);
    expect(on("fraud")).toBe(true);
    expect(on("login")).toBe(true);
    expect(on("place")).toBe(true);
    const off = kindOnOf(sw({ showAuths: false, showLogins: false }));
    expect(off("auth")).toBe(false);
    expect(off("fraud")).toBe(false);
    expect(off("login")).toBe(false);
    const listed = kindOnOf(sw({ hiddenKinds: ["signin"] }));
    expect(listed("signin")).toBe(false);
    expect(listed("org")).toBe(true);
    expect(listed("account_event")).toBe(true);
  });
});

describe("showInputsOf", () => {
  it("valueOn reads only an own key of the hidden values", () => {
    const s = showInputsOf(sw({ hiddenValues: { signin: ["mobile"] } }), NODES, () => facts(), null);
    expect(s.valueOn("signin", "mobile")).toBe(false);
    expect(s.valueOn("signin", "fixed")).toBe(true);
    expect(s.valueOn("org", "mobile")).toBe(true);
    expect(s.valueOn("constructor", "x")).toBe(true);
    expect(s.valueOn("__proto__", "x")).toBe(true);
    expect(s.valueOn("toString", "x")).toBe(true);
  });

  it("filterField comes from the kind's node and is null for a kind with none or a bad filter", () => {
    const bad: ScenarioNode = { kind: "key", label: "Key", palette: "entity", source: "k.json", filter: { field: "1x", label: "Key" } };
    const s = showInputsOf(sw(), [...NODES, bad], () => facts(), null);
    expect(s.filterField("signin")).toBe("network_type");
    expect(s.filterField("org")).toBeNull();
    expect(s.filterField("key")).toBeNull();
    expect(s.filterField("nothing")).toBeNull();
    expect(s.filterField("constructor")).toBeNull();
  });

  it("passes Yours, the facts, the Places switch and the pin switch through", () => {
    const f = () => facts({ pinned: true });
    const s = showInputsOf(sw({ yoursOn: true, yoursFacets: { ...ALL_ON, noted: false }, showPlaces: true, pinWins: false }), NODES, f, null);
    expect(s.yours).toEqual({ on: true, facets: { ...ALL_ON, noted: false } });
    expect(s.facts).toBe(f);
    expect(s.placesOn).toBe(true);
    expect(s.pinWins).toBe(false);
    const d = showInputsOf(sw(), NODES, f, null);
    expect(d.placesOn).toBe(false);
    expect(d.pinWins).toBe(true);
  });

  it("passes the selected record through, and null when none is selected", () => {
    const ref: RecordRef = { kind: "auth", id: "tx-1" };
    expect(showInputsOf(sw(), NODES, () => facts(), ref).selected).toBe(ref);
    expect(showInputsOf(sw(), NODES, () => facts(), null).selected).toBeNull();
  });
});

const NOW = "2026-11-16T10:00:00Z";
const tx = (id: string, isFraud: number): Transaction => ({ id, timestamp: NOW, is_fraud: isFraud, merchant_name: "Corner Store", merchant_lat: 1, merchant_lng: 2 }) as unknown as Transaction;
const login = (id: string): LoginEvent => ({ id, timestamp: NOW, ip: "192.0.2.1", ip_lat: 3, ip_lng: 4 }) as unknown as LoginEvent;
const event = (id: string): AccountEvent => ({ id, timestamp: NOW, kind: "payee_add", field: null }) as unknown as AccountEvent;
const transfer = (id: string): Transfer => ({ id, timestamp: NOW, rail: "wire", status: "sent" }) as unknown as Transfer;
const place = (id: string): Place => ({ id, name: "Pier", category: "harbour", lat: 5, lng: 6 });
const entity = (id: string, kind: string, timestamp: number, fields: Record<string, unknown> = {}): Entity => ({
  id,
  kind,
  timestamp,
  coords: null,
  fields,
  displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
});

describe("drawRecordOf: the seed schema's one adapter", () => {
  it("reads an auth transaction as auth and a fraud one as fraud, by is_fraud, with the row as its fields", () => {
    const a = tx("tx-1", 0);
    const f = tx("tx-2", 1);
    expect(drawRecordOf({ kind: "auth", tx: a })).toEqual({ kind: "auth", id: "tx-1", timestamp: Date.parse(NOW), fields: a });
    expect(drawRecordOf({ kind: "fraud", tx: f })).toEqual({ kind: "fraud", id: "tx-2", timestamp: Date.parse(NOW), fields: f });
  });

  it("reads a login, an account event and a transfer at their parsed time", () => {
    expect(drawRecordOf({ kind: "login", login: login("lg-1") })).toMatchObject({ kind: "login", id: "lg-1", timestamp: Date.parse(NOW) });
    expect(drawRecordOf({ kind: "account_event", event: event("ae-1") })).toMatchObject({ kind: "account_event", id: "ae-1", timestamp: Date.parse(NOW) });
    expect(drawRecordOf({ kind: "transfer", transfer: transfer("tf-1") })).toMatchObject({ kind: "transfer", id: "tf-1", timestamp: Date.parse(NOW) });
  });

  it("reads a place at time 0", () => {
    expect(drawRecordOf({ kind: "place", place: place("pl-1") })).toEqual({ kind: "place", id: "pl-1", timestamp: 0, fields: place("pl-1") });
  });

  it("reads a manifest entity as its own kind, time and fields", () => {
    const e = entity("si-1", "signin", REACHED, { network_type: "mobile" });
    expect(drawRecordOf({ kind: "entity", entity: e })).toEqual({ kind: "signin", id: "si-1", timestamp: REACHED, fields: { network_type: "mobile" } });
    expect(drawRecordOf({ kind: "entity", entity: entity("org-1", "org", 0) })).toMatchObject({ kind: "org", timestamp: 0 });
  });

  it("gives a timestamp that does not parse as NaN, not as a number", () => {
    const bad = { ...tx("tx-3", 0), timestamp: "not a time" };
    expect(Number.isNaN(drawRecordOf({ kind: "auth", tx: bad }).timestamp)).toBe(true);
  });
});

describe("narrowByShown", () => {
  const ctx: PivotContext = {
    transactions: [tx("tx-1", 0), tx("tx-2", 1)],
    logins: [login("lg-1")],
    places: [place("pl-1")],
    accountEvents: [event("ae-1")],
    entities: [entity("si-1", "signin", REACHED, { network_type: "mobile" }), entity("si-2", "signin", REACHED, { network_type: "fixed" }), entity("org-1", "org", 0)],
  };
  const inputs = (over: Partial<ShowSwitches> = {}, f: (r: { kind: string; id: string }) => RecordFacts = () => facts()) => showInputsOf(sw(over), NODES, f, null);

  it("returns the context itself when every switch is at its default", () => {
    expect(narrowByShown(ctx, inputs())).toBe(ctx);
  });

  it("returns the context itself when the hidden kind or value has no records", () => {
    expect(narrowByShown(ctx, inputs({ hiddenKinds: ["key_event"] }))).toBe(ctx);
    expect(narrowByShown(ctx, inputs({ hiddenValues: { signin: ["unseen"] } }))).toBe(ctx);
  });

  it("keeps the records isShown keeps in every list, places by reference, and an absent list absent", () => {
    const narrowed = narrowByShown(ctx, inputs({ showAuths: false, hiddenValues: { signin: ["mobile"] } }));
    expect(narrowed).not.toBe(ctx);
    expect(narrowed.transactions).toEqual([]);
    expect(narrowed.logins).toBe(ctx.logins);
    expect(narrowed.places).toBe(ctx.places);
    expect(narrowed.accountEvents).toBe(ctx.accountEvents);
    expect(narrowed.entities?.map((e) => e.id)).toEqual(["si-2", "org-1"]);
    expect(narrowed.transfers).toBeUndefined();
    expect("transfers" in narrowed).toBe(false);
  });

  it("keeps a pinned record of a switched-off kind when the pin wins", () => {
    const pinned = (r: { id: string }) => facts({ pinned: r.id === "tx-2" });
    const narrowed = narrowByShown(ctx, inputs({ showAuths: false }, pinned));
    expect(narrowed.transactions.map((t) => t.id)).toEqual(["tx-2"]);
    const loses = narrowByShown(ctx, inputs({ showAuths: false, pinWins: false }, pinned));
    expect(loses.transactions).toEqual([]);
  });

  it("keeps the selected record of a switched-off kind or value, and of a Yours row it does not match", () => {
    const sel = (selected: RecordRef | null, over: Partial<ShowSwitches>) => showInputsOf(sw(over), NODES, () => facts(), selected);
    const off = narrowByShown(ctx, sel({ kind: "auth", id: "tx-1" }, { showAuths: false }));
    expect(off.transactions.map((t) => t.id)).toEqual(["tx-1"]);
    // a fraud transaction selected as fraud, or as auth, is the same record
    expect(narrowByShown(ctx, sel({ kind: "fraud", id: "tx-2" }, { showAuths: false })).transactions.map((t) => t.id)).toEqual(["tx-2"]);
    expect(narrowByShown(ctx, sel({ kind: "auth", id: "tx-2" }, { showAuths: false })).transactions.map((t) => t.id)).toEqual(["tx-2"]);
    const value = narrowByShown(ctx, sel({ kind: "signin", id: "si-1" }, { hiddenValues: { signin: ["mobile"] } }));
    expect(value.entities?.map((e) => e.id)).toEqual(["si-1", "si-2", "org-1"]);
    const yours = narrowByShown(ctx, sel({ kind: "login", id: "lg-1" }, { yoursOn: true }));
    expect(yours.logins).toBe(ctx.logins);
    expect(yours.transactions).toEqual([]);
    // nothing selected: the same switches cut as before
    expect(narrowByShown(ctx, sel(null, { showAuths: false })).transactions).toEqual([]);
  });

  it("narrows by Yours as well", () => {
    const touched = (r: { id: string }) => facts({ disposition: r.id === "lg-1" ? "pass" : "none" });
    const narrowed = narrowByShown(ctx, inputs({ yoursOn: true }, touched));
    expect(narrowed.logins).toBe(ctx.logins);
    expect(narrowed.transactions).toEqual([]);
    expect(narrowed.entities).toEqual([]);
    expect(narrowed.accountEvents).toEqual([]);
  });
});

describe("drawCounts", () => {
  const recs: DrawRecord[] = [
    { kind: "signin", id: "a", timestamp: REACHED, fields: { network_type: "fixed" } },
    { kind: "signin", id: "b", timestamp: AHEAD, fields: { network_type: "fixed" } },
    { kind: "signin", id: "c", timestamp: REACHED, fields: { network_type: "mobile" } },
    { kind: "signin", id: "d", timestamp: 0, fields: { network_type: "mobile" } },
  ];
  const d = (over: Partial<ShowSwitches>, windowed = true): DrawInputs => ({
    ...showInputsOf(sw(over), NODES, () => facts(), null),
    playhead: PLAYHEAD,
    windowed,
  });

  it("counts every record, the shown ones and the reached ones", () => {
    expect(drawCounts(recs, d({}))).toEqual({ shown: 4, reached: 3, all: 4 });
  });

  it("counts a switched-off value as not shown and not reached", () => {
    expect(drawCounts(recs, d({ hiddenValues: { signin: ["mobile"] } }))).toEqual({ shown: 2, reached: 1, all: 4 });
    expect(drawCounts(recs, d({ hiddenKinds: ["signin"] }))).toEqual({ shown: 0, reached: 0, all: 4 });
  });

  it("counts the selected record as shown, and as reached once the playhead has reached it", () => {
    const withSelected = (id: string): DrawInputs => ({
      ...showInputsOf(sw({ hiddenKinds: ["signin"] }), NODES, () => facts(), { kind: "signin", id }),
      playhead: PLAYHEAD,
      windowed: true,
    });
    expect(drawCounts(recs, withSelected("a"))).toEqual({ shown: 1, reached: 1, all: 4 });
    expect(drawCounts(recs, withSelected("b"))).toEqual({ shown: 1, reached: 0, all: 4 });
    expect(drawCounts(recs, withSelected("nobody"))).toEqual({ shown: 0, reached: 0, all: 4 });
  });

  it("counts every shown record as reached before the bounds load", () => {
    expect(drawCounts(recs, d({}, false))).toEqual({ shown: 4, reached: 4, all: 4 });
  });

  it("counts an empty list as zero", () => {
    expect(drawCounts([], d({}))).toEqual({ shown: 0, reached: 0, all: 0 });
  });
});
