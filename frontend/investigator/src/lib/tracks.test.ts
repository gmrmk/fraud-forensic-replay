/**
 * The rows model. Every fixture is written here and shaped as the stories are: a grouping field,
 * a name field, rows of one event and rows of several, events with the field empty, bars that
 * carry the field, and a member field. The counts of the real stories are checked
 * on the built static site, not a test of this file.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { manifestRowToEntity } from "./adapters/manifest-row";
import { caseStepEvents } from "./case-events";
import type { Entity } from "./entity";
import { magnitudeBars } from "./magnitude";
import type { ScenarioFieldWords, ScenarioNode, ScenarioRows } from "./scenarios";
import { buildTracks, entityOfEvent, groupingOf, rowValue, type TrackSet } from "./tracks";
import type { LoginEvent, Transaction } from "../types";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-06-08T09:00:00-05:00");
const iso = (hours: number): string => new Date(T0 + hours * HOUR).toISOString();

const node = (kind: string, label: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind, label, palette: "#fff", source: "json", coords: null, timestamp: "at", primary: "${id}", ...extra,
});
const nodes: ScenarioNode[] = [
  node("stop", "Stop"),
  node("visit", "Visit"),
  node("load", "Load", { magnitude: "weight", magnitudeLabel: "Weight", magnitudeUnit: "kg" }),
];
const rows: ScenarioRows = { by: "team_id", name: "team_name", member: "bay_id" };
const fields: Record<string, ScenarioFieldWords> = {
  team_id: { label: "Squad" },
  bay_id: { label: "Bay" },
};

let seq = 0;
const stop = (team: string | null, hours: number, extra: Record<string, unknown> = {}): Entity =>
  manifestRowToEntity(nodes[0], { id: `s${++seq}`, at: iso(hours), team_id: team, team_name: team ? `Team ${team}` : "", ...extra });
const visit = (team: string | null, hours: number, extra: Record<string, unknown> = {}): Entity =>
  manifestRowToEntity(nodes[1], { id: `v${++seq}`, at: iso(hours), team_id: team, ...extra });
const load = (team: string | null, hours: number, weight: number, bay: string | null = null): Entity =>
  manifestRowToEntity(nodes[2], { id: `w${++seq}`, at: iso(hours), team_id: team, bay_id: bay, weight });

const empty = { transactions: [], logins: [], accountEvents: [], transfers: [] };
function build(entities: Entity[], over: Partial<Parameters<typeof buildTracks>[0]> = {}): TrackSet {
  const events = caseStepEvents({ ...empty, entities }, nodes);
  const set = buildTracks({ events, entities, nodes, rows, fields, ...over });
  if (!set) throw new Error("expected rows");
  return set;
}
const names = (set: TrackSet): string[] => set.tracks.map((t) => t.name);

describe("rowValue: the one reading of a grouping value, for the rows and the solo", () => {
  it("trims a string and writes a finite number as text", () => {
    expect(rowValue("Acme")).toBe("Acme");
    expect(rowValue("  Acme \t")).toBe("Acme");
    expect(rowValue(42)).toBe("42");
    expect(rowValue(0)).toBe("0");
    expect(rowValue(4.5)).toBe("4.5");
  });

  it("gives an empty text for anything else", () => {
    for (const v of ["", "   ", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, true, {}, []]) {
      expect(rowValue(v), String(v)).toBe("");
    }
  });

  it("is the value a row's key is made from: a padded and a numeric value each give one row", () => {
    const set = build([stop(" a ", 1, { team_id: " a " }), stop("a", 2), stop("7" as string, 3, { team_id: 7 }), stop("7", 4)]);
    expect(set.tracks.map((t) => t.key).sort()).toEqual(["v:7", "v:a"]);
  });
});

describe("buildTracks: the rows", () => {
  it("puts the busiest row first, and follows the named rows with the rest row however busy it is", () => {
    const set = build([
      stop("b", 1), stop("a", 2), stop("c", 3), stop("c", 4), stop("c", 5),
      stop(null, 6), stop(null, 7), stop(null, 8), stop(null, 9),
      stop("b", 10),
    ]);
    // c has three, b has two, a has one; the four with no value are busier than all of them and still come last.
    expect(names(set)).toEqual(["Team c", "Team b", "Team a", "Stop"]);
    expect(set.tracks.map((t) => t.rest)).toEqual([false, false, false, true]);
    expect(set.tracks[3].count).toBe(4);
    expect(set.named).toBe(3);
  });

  it("breaks a tie in event count by name, whatever the runtime's locale", () => {
    const set = build([stop("y", 1), stop("x", 2), stop("z", 3)]);
    expect(names(set)).toEqual(["Team x", "Team y", "Team z"]);
  });

  it("keeps a row for events that lack the field, named by their kind's label, one for each kind", () => {
    const set = build([stop("a", 1), stop(null, 2), visit(null, 3), visit(null, 4)]);
    expect(set.tracks.filter((t) => t.rest).map((t) => [t.name, t.count])).toEqual([["Visit", 2], ["Stop", 1]]);
    expect(set.named).toBe(1);
  });

  it("keeps a rest row's name exactly as its kind's label is written", () => {
    const odd = [node("stop", "  Mixed Case  ")];
    const entities = [manifestRowToEntity(odd[0], { id: "q1", at: iso(1) })];
    const set = buildTracks({ events: caseStepEvents({ ...empty, entities }, odd), entities, nodes: odd, rows, fields });
    expect(set?.tracks[0].name).toBe("  Mixed Case  ");
  });

  it("matches a value after trim: 'Acme' and 'Acme ' are one row of two events", () => {
    const set = build([stop("Acme", 1, { team_name: "Acme" }), stop("Acme ", 2, { team_name: "Acme " })]);
    expect(set.tracks).toHaveLength(1);
    expect(set.tracks[0].count).toBe(2);
    expect(set.tracks[0].name).toBe("Acme");
  });

  it("names a row by the name field, and by the value when the name field is empty", () => {
    const set = build([stop("a", 1), stop("b", 2, { team_name: "" })]);
    expect(names(set).sort()).toEqual(["Team a", "b"]);
  });

  it("names a row by the first non-empty name among its events in time order, whatever order they arrive in", () => {
    const entities = [stop("a", 1, { team_name: "" }), stop("a", 2, { team_name: "Late" }), stop("a", 3, { team_name: "Later" })];
    expect(names(build(entities))).toEqual(["Late"]);
    const events = [...caseStepEvents({ ...empty, entities }, nodes)].reverse();
    const reversed = buildTracks({ events, entities, nodes, rows, fields });
    expect(reversed?.tracks.map((t) => t.name)).toEqual(["Late"]);
  });

  it("names a row by its value when no event carries a name, and lets an event's name outrank a bar's", () => {
    const named = (id: string, hours: number, name: string): Entity =>
      manifestRowToEntity(nodes[2], { id, at: iso(hours), team_id: "a", team_name: name, weight: 1 });
    expect(names(build([stop("a", 1, { team_name: "" })]))).toEqual(["a"]);
    expect(names(build([named("w-only", 1, "From a bar")]))).toEqual(["From a bar"]);
    expect(names(build([named("w-early", 0, "From a bar"), stop("a", 2, { team_name: "From an event" })]))).toEqual(["From an event"]);
  });

  // A bar row may name a row because usage is a carrier kind for rows.name in the platform manifest's own drift check (backend/tests/test_platform_manifest.py, the name rule).
  it("names a row by its bar row's name when its events carry none", () => {
    const bar = (id: string, hours: number, name: string): Entity =>
      manifestRowToEntity(nodes[2], { id, at: iso(hours), team_id: "a", team_name: name, weight: 1 });
    const set = build([stop("a", 1, { team_name: "" }), bar("w-named", 2, "From a bar")]);
    expect(set.tracks.map((t) => [t.name, t.count])).toEqual([["From a bar", 1]]);
  });

  it("reads the heading from the field's label and counts named rows only", () => {
    const set = build([stop("a", 1), stop(null, 2)]);
    expect(set.heading).toBe("Squad");
    expect(set.named).toBe(1);
    expect(set.by).toBe("team_id");
  });

  it("still builds the rows, with no heading, when the grouping field has no label", () => {
    const set = build([stop("a", 1)], { fields: { bay_id: { label: "Bay" } } });
    expect(set.heading).toBe("");
    expect(set.tracks).toHaveLength(1);
  });

  it("reads every name from a fixture manifest with other names, and from nothing else", () => {
    const other: ScenarioRows = { by: "crew", name: "crew_title" };
    const entities = [
      manifestRowToEntity(nodes[0], { id: "z1", at: iso(1), crew: "k1", crew_title: "Kestrel" }),
      manifestRowToEntity(nodes[0], { id: "z2", at: iso(2), crew: "k1", crew_title: "Kestrel" }),
      manifestRowToEntity(nodes[1], { id: "z3", at: iso(3), crew: "m2", crew_title: "Magpie" }),
    ];
    const set = buildTracks({ events: caseStepEvents({ ...empty, entities }, nodes), entities, nodes, rows: other, fields: { crew: { label: "Crew" } } });
    expect(set?.heading).toBe("Crew");
    expect(set?.tracks.map((t) => [t.name, t.count])).toEqual([["Kestrel", 2], ["Magpie", 1]]);
  });

  it("counts a row's events by kind label for its tooltip", () => {
    const set = build([stop("a", 1), stop("a", 2), visit("a", 3)]);
    expect(set.tracks[0].kinds).toEqual([["Stop", 2], ["Visit", 1]]);
  });

  it("maps every event to its row", () => {
    const entities = [stop("a", 1), stop("b", 2), stop(null, 3)];
    const set = build(entities);
    for (const e of entities) expect(set.trackOf.has(e.id)).toBe(true);
    const row = (id: string): string => set.tracks[set.trackOf.get(id) as number].name;
    expect(row(entities[0].id)).toBe("Team a");
    expect(row(entities[2].id)).toBe("Stop");
  });
});

describe("buildTracks: an event of the seed's own shape", () => {
  const tx = (id: string, hours: number, merchant: string | null, fraud = 0): Transaction =>
    ({ id, timestamp: iso(hours), is_fraud: fraud, merchant_name: merchant, amount: 5, mcc: "5411", merchant_country: "US", merchant_lat: 0, merchant_lng: 0 }) as unknown as Transaction;
  const login = (id: string, hours: number): LoginEvent =>
    ({ id, timestamp: iso(hours), device_fp: "d", outcome: "ok", ip_type: "home", ip_lat: 0, ip_lng: 0 }) as unknown as LoginEvent;
  const seedNodes = [node("auth", "Authorization", { source: "sql" }), node("fraud", "Fraud", { source: "sql" }), node("login", "Login", { source: "sql" })];

  it("groups transactions by the declared field and keeps a login, which lacks it, in a rest row named for its kind", () => {
    const events = caseStepEvents({ ...empty, transactions: [tx("t1", 1, "Cafe"), tx("t2", 2, "Cafe", 1), tx("t3", 3, "Shop"), tx("t4", 4, " ")], logins: [login("l1", 5)], entities: [] }, seedNodes);
    const set = buildTracks({ events, entities: [], nodes: seedNodes, rows: { by: "merchant_name" }, fields: { merchant_name: { label: "Place" } } });
    expect(set?.tracks.map((t) => [t.name, t.count, t.rest])).toEqual([
      ["Cafe", 2, false], ["Shop", 1, false], ["Authorization", 1, true], ["Login", 1, true],
    ]);
    expect(set?.tracks[0].kinds).toEqual([["Authorization", 1], ["Fraud", 1]]);
  });

  it("turns each kind of step event into an entity, and a place into none", () => {
    const events = caseStepEvents({ ...empty, transactions: [tx("t1", 1, "Cafe")], logins: [login("l1", 2)], entities: [] }, seedNodes);
    expect(events.map((e) => entityOfEvent(e)?.kind)).toEqual(["auth", "login"]);
    const place = { id: "p", t: T0, match: { kind: "place", place: { id: "p" } } } as unknown as Parameters<typeof entityOfEvent>[0];
    expect(entityOfEvent(place)).toBeNull();
  });

  it("builds from the case read only: the rows follow the events, so a stray row of the bar kind that no event carries gives no node", () => {
    // The strays reach the model through its other input, entities, as rows of the bar kind.
    // No event carries them (the bar kind is not an event kind), as a transaction read from another
    // card's terminal file would not be an event of this case.
    const mine = stop("a", 1);
    const strayAlone = load("zed", 2, 0); // its own value, and no weight, so no bar: nothing may give it a row
    const strayShared = load("a", 3, 7); // the value of a row that has an event: no event, no count
    const set = build([mine, strayAlone, strayShared]);
    expect(names(set)).toEqual(["Team a"]);
    expect(set.tracks[0].count).toBe(1);
    expect(set.trackOf.has(mine.id)).toBe(true);
    expect(set.trackOf.has(strayAlone.id)).toBe(false);
    expect(set.trackOf.has(strayShared.id)).toBe(false);
    expect(set.trackOf.size).toBe(1);
    expect(set.tracks[0].bars).toEqual([{ t: T0 + 3 * HOUR, value: 7 }]);
  });
});

describe("buildTracks: bars", () => {
  it("draws each row's bars from the kind that declares a magnitude, summed at each instant", () => {
    const set = build([stop("a", 1), load("a", 1, 2), load("a", 1, 3), load("a", 2, 4), load("b", 1, 1)]);
    const a = set.tracks.find((t) => t.name === "Team a");
    expect(a?.bars).toEqual([{ t: T0 + HOUR, value: 5 }, { t: T0 + 2 * HOUR, value: 4 }]);
    expect(a?.total).toBe(9);
    expect(set.barName).toBe("Load · Weight");
    expect(set.barUnit).toBe("kg");
  });

  it("gives a row that has bars and no event a place, with a count of nothing", () => {
    const set = build([stop("a", 1), load("b", 1, 7)]);
    const b = set.tracks.find((t) => t.bars.length > 0 && t.count === 0);
    expect(b?.name).toBe("b");
    expect(set.tracks[0].name).toBe("Team a");
  });

  it("measures the scale over every row and the step from the instants of every row", () => {
    const set = build([load("a", 0, 10), load("a", 1, 20), load("b", 3, 30)]);
    expect(set.step).toBe(HOUR);
    expect(set.scale?.max).toBe(30);
    expect(build([stop("a", 1)]).scale).toBeNull();
    expect(build([stop("a", 1)]).step).toBe(0);
  });

  it("groups by a field the bars lack: one rest row named by the bar kind's label holds every bar and no named row has one", () => {
    const entities = [stop("a", 1, { seat: "s1" }), load("a", 1, 2), load("b", 2, 3), load("b", 3, 4)];
    const set = build(entities, { rows: { by: "seat" }, fields: { seat: { label: "Seat" } } });
    const withBars = set.tracks.filter((t) => t.bars.length > 0);
    expect(withBars.map((t) => [t.name, t.rest, t.bars.length])).toEqual([["Load", true, 3]]);
    expect(set.tracks.filter((t) => !t.rest).every((t) => t.bars.length === 0)).toBe(true);
  });

  it("keeps the lane's set the same under a grouping the bars lack as under the default", () => {
    // The bar at timestamp 0 (the epoch) is one the lane keeps, so the rows keep it too.
    const epoch = manifestRowToEntity(nodes[2], { id: "w-epoch", at: new Date(0).toISOString(), team_id: "b", weight: 6 });
    expect(epoch.timestamp).toBe(0);
    const entities = [stop("a", 1, { seat: "s1" }), epoch, load("a", 1, 2), load("a", 2, 3), load("b", 2, 4), load("b", 5, 8), load(null, 5, 1)];
    const bySeries = (set: TrackSet): [number, number][] => {
      const sums = new Map<number, number>();
      for (const t of set.tracks) for (const b of t.bars) sums.set(b.t, (sums.get(b.t) ?? 0) + b.value);
      return [...sums].sort((x, y) => x[0] - y[0]);
    };
    const usual = bySeries(build(entities));
    const lacking = bySeries(build(entities, { rows: { by: "seat" }, fields: { seat: { label: "Seat" } } }));
    const lane = magnitudeBars(entities, nodes[2]).map((b): [number, number] => [b.t, b.value]);
    expect(usual).toEqual(lane);
    expect(lacking).toEqual(lane);
  });

  it("uses the grouping in force, not only the manifest's", () => {
    const entities = [stop("a", 1, { zone: "north" }), stop("b", 2, { zone: "north" })];
    const set = build(entities, { by: "zone", fields: { zone: { label: "Zone" } } });
    expect(set.by).toBe("zone");
    expect(set.heading).toBe("Zone");
    expect(names(set)).toEqual(["north"]);
  });

  it("applies the manifest's name field only under the manifest's own grouping", () => {
    const entities = [stop("a", 1, { zone: "north" })];
    const set = build(entities, { by: "zone" });
    expect(names(set)).toEqual(["north"]);
  });
});

describe("buildTracks: member lines", () => {
  const sumOf = (bars: readonly { t: number; value: number }[]): Map<number, number> => new Map(bars.map((b) => [b.t, b.value]));

  it("opens a row into one line for each member value, named from the label and a number, with the value kept", () => {
    const set = build([stop("a", 1, { bay_id: "k-9" }), stop("a", 2, { bay_id: "k-3" })]);
    expect(set.tracks[0].lines.map((l) => [l.name, l.value])).toEqual([["Bay 1", "k-9"], ["Bay 2", "k-3"]]);
    expect(set.memberLabel).toBe("Bay");
  });

  it("orders lines by first appearance, and by value where two first appear together", () => {
    const set = build([stop("a", 2, { bay_id: "k-b" }), stop("a", 1, { bay_id: "k-z" }), stop("a", 1, { bay_id: "k-c" })]);
    expect(set.tracks[0].lines.map((l) => l.value)).toEqual(["k-c", "k-z", "k-b"]);
  });

  it("gives a member that has bars and no event a line of its own", () => {
    const set = build([stop("a", 1), load("a", 1, 2, "k-1"), load("a", 1, 5, "k-2")]);
    const lines = set.tracks[0].lines;
    expect(lines.map((l) => l.value)).toEqual(["k-1", "k-2"]);
    expect(lines.every((l) => l.ids.size === 0)).toBe(true);
  });

  it("makes a row's value in every hour the sum of its lines, except for a bar with no member", () => {
    const set = build([
      stop("a", 0),
      load("a", 0, 0.5, "k-1"), load("a", 0, 2.25, "k-2"),
      load("a", 1, 4, "k-1"),
      load("a", 1, 8), // no member: in the row, on no line
      load("a", 2, 1, "k-2"),
    ]);
    const row = sumOf(set.tracks[0].bars);
    const sums = new Map<number, number>();
    for (const l of set.tracks[0].lines) for (const b of l.bars) sums.set(b.t, (sums.get(b.t) ?? 0) + b.value);
    expect(row.get(T0)).toBeCloseTo(2.75, 9);
    expect(sums.get(T0)).toBeCloseTo(2.75, 9);
    expect(row.get(T0 + HOUR)).toBe(12);
    expect(sums.get(T0 + HOUR)).toBe(4);
    expect(row.get(T0 + 2 * HOUR)).toBe(sums.get(T0 + 2 * HOUR));
  });

  it("draws every line's bars on the rows' shared top", () => {
    const set = build([load("a", 0, 10, "k-1"), load("b", 0, 40, "k-2")]);
    const top = set.scale?.top;
    expect(top).toBeGreaterThan(0);
    for (const t of set.tracks) for (const l of t.lines) expect(l.top).toBe(top);
  });

  it("keeps an event that names no member on the closed line only", () => {
    const set = build([stop("a", 1, { bay_id: "k-1" }), stop("a", 2)]);
    const [line] = set.tracks[0].lines;
    expect(set.tracks[0].count).toBe(2);
    expect(line.ids.size).toBe(1);
  });

  it("gives no line to a row whose events and bars carry no member value, nor to a rest row", () => {
    const set = build([stop("a", 1), stop(null, 2, { bay_id: "k-1" })]);
    expect(set.tracks.map((t) => t.lines.length)).toEqual([0, 0]);
  });

  it("gives no line when the pack declares no member field, or the member field has no label", () => {
    const entities = [stop("a", 1, { bay_id: "k-1" })];
    expect(build(entities, { rows: { by: "team_id", name: "team_name" } }).tracks[0].lines).toEqual([]);
    expect(build(entities, { fields: { team_id: { label: "Squad" } } }).tracks[0].lines).toEqual([]);
  });

  it("keeps a member's events with their times and the manifest's second line", () => {
    const set = build([stop("a", 1, { bay_id: "k-1" })]);
    expect(set.tracks[0].lines[0].events).toEqual([{ id: expect.any(String), t: T0 + HOUR, words: "" }]);
  });
});

describe("buildTracks: input the manifest may get wrong", () => {
  it("returns nothing for a pack with no rows, or a grouping field that is not a field name", () => {
    const events = caseStepEvents({ ...empty, entities: [stop("a", 1)] }, nodes);
    expect(buildTracks({ events, entities: [], nodes, rows: undefined, fields })).toBeNull();
    expect(buildTracks({ events, entities: [], nodes, rows: { by: "no spaces allowed" }, fields })).toBeNull();
    expect(buildTracks({ events, entities: [], nodes, rows: { by: "" }, fields })).toBeNull();
  });

  it("drops a bad name or member field and keeps the rows", () => {
    const entities = [stop("a", 1, { bay_id: "k-1" })];
    const set = build(entities, { rows: { by: "team_id", name: "x y", member: "9bad" } });
    expect(names(set)).toEqual(["a"]);
    expect(set.tracks[0].lines).toEqual([]);
  });

  it("drops a label that is empty or longer than 24 characters", () => {
    const entities = [stop("a", 1, { bay_id: "k-1" })];
    expect(build(entities, { fields: { team_id: { label: "x".repeat(25) }, bay_id: { label: "Bay" } } }).heading).toBe("");
    expect(build(entities, { fields: { team_id: { label: "  " }, bay_id: { label: "Bay" } } }).heading).toBe("");
  });

  it("does not read a field that the entity inherits", () => {
    const set = build([stop("a", 1)], { rows: { by: "constructor" }, fields: { constructor: { label: "Ctor" } } });
    expect(set.tracks.every((t) => t.rest)).toBe(true);
  });
});

describe("groupingOf", () => {
  it("takes the asked field when it is a field name, else the manifest's, else nothing", () => {
    expect(groupingOf({ by: "team_id" }, "zone")).toBe("zone");
    expect(groupingOf({ by: "team_id" }, null)).toBe("team_id");
    expect(groupingOf({ by: "team_id" }, "not a field")).toBe("team_id");
    expect(groupingOf(undefined, null)).toBeNull();
    expect(groupingOf({ by: "bad name" }, null)).toBeNull();
  });
});

describe("tracks.ts source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, "tracks.ts"), "utf8");

  it("reads no clock, runs no timer and animates nothing", () => {
    expect(source).not.toMatch(/Date\.now|setInterval|setTimeout|performance\.now|requestAnimationFrame/);
  });

  it("names no pack: no field, kind, label or noun of a story", () => {
    for (const word of ["org_id", "org_name", "merchant_name", "credential_id", "API key", "Organisation", "Merchant", "network"]) {
      expect(source).not.toContain(word);
    }
  });
});
