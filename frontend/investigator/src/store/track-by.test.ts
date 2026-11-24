import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { manifestRowToEntity } from "../lib/adapters/manifest-row";
import type { Entity } from "../lib/entity";
import type { ScenarioFieldWords, ScenarioNode, ScenarioRows } from "../lib/scenarios";
import { buildShareLink } from "../lib/share-link";
import { chooseGrouping, groupingOptions, useTrackBy, type GroupingData } from "./track-by";
import { useSolo } from "./solo";

describe("useTrackBy", () => {
  beforeEach(() => useTrackBy.setState({ by: null }));

  it("starts with no grouping asked, which means the manifest's own", () => {
    expect(useTrackBy.getState().by).toBeNull();
  });

  it("holds a field name once set, and clears on null", () => {
    useTrackBy.getState().setBy("zone_code");
    expect(useTrackBy.getState().by).toBe("zone_code");
    useTrackBy.getState().setBy(null);
    expect(useTrackBy.getState().by).toBeNull();
  });

  it("refuses a value that is not a field name and keeps what it had", () => {
    useTrackBy.getState().setBy("zone_code");
    for (const bad of ["", "has space", "9lead", "x".repeat(65), "semi;colon"]) {
      useTrackBy.getState().setBy(bad);
      expect(useTrackBy.getState().by).toBe("zone_code");
    }
  });

  it("is held in memory and writes nothing to storage", () => {
    const before = Object.keys(localStorage).length;
    useTrackBy.getState().setBy("zone_code");
    expect(Object.keys(localStorage).length).toBe(before);
  });
});

// A pack written here: two timed kinds, each with its own pivotable fields, and fields of every
// kind of trouble (no label, a label that is too long, no event that carries it, not pivotable).
const node = (kind: string, label: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind, label, palette: "#ff8800", source: "json", coords: null, timestamp: "at", primary: "${id}", ...extra,
});
const stopNode = node("stop", "Stop", { pivotable: ["team_id", "zone_code", "bare_code", "long_code", "empty_code", "__proto__"] });
const visitNode = node("visit", "Visit", { pivotable: ["zone_code", "team_id", "gate_code"] });
const ghostNode = node("ghost", "Ghost", { pivotable: ["ghost_code"] });
const untimedNode = node("place", "Place", { timestamp: undefined, pivotable: ["place_code"] });
const decisionNode = node("verdict", "Verdict", {
  pivotable: ["verdict_code"],
  decision: { status: "s", outcome: "o", note: "n", actor: "a", target: "t", key: "k", event: "e" },
});
const nodes: ScenarioNode[] = [stopNode, visitNode, ghostNode, untimedNode, decisionNode];
const rowsDecl: ScenarioRows = { by: "team_id" };
const fields: Record<string, ScenarioFieldWords> = {
  team_id: { label: "Squad" },
  zone_code: { label: "Zone" },
  gate_code: { label: "Gate" },
  long_code: { label: "x".repeat(25) },
  empty_code: { label: "Empty" },
  ghost_code: { label: "Ghost field" },
  place_code: { label: "Place field" },
  verdict_code: { label: "Verdict field" },
  not_pivotable: { label: "Loose" },
};

const at = (hours: number): string => new Date(Date.parse("2026-06-08T09:00:00-05:00") + hours * 3_600_000).toISOString();
const entities = (): Entity[] => [
  manifestRowToEntity(stopNode, { id: "s1", at: at(1), team_id: "a", zone_code: "n", bare_code: "b1", long_code: "l1", not_pivotable: "p1" }),
  manifestRowToEntity(stopNode, { id: "s2", at: at(2), team_id: "b", zone_code: "s", bare_code: "b2", long_code: "l2" }),
  manifestRowToEntity(visitNode, { id: "v1", at: at(3), team_id: "a", gate_code: "g1" }),
  manifestRowToEntity(untimedNode, { id: "p1", place_code: "x" }),
];
const data = (list: Entity[] = entities()): GroupingData => ({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: list });
const options = (over: Partial<Parameters<typeof groupingOptions>[0]> = {}) =>
  groupingOptions({ nodes, rows: rowsDecl, fields, data: data(), ...over });

describe("groupingOptions", () => {
  it("lists the union of the timed kinds' pivotable fields that have a label and give a named row", () => {
    // Order: the nodes' order, then each node's own order. team_id and zone_code come from the first kind,
    // gate_code from the second. Not offered: bare_code (no label), long_code (a label over 24
    // characters), empty_code (no event carries it), __proto__ (not an own key of the words),
    // ghost_code, place_code, verdict_code (no timed kind with events, no timestamp, an overlay) and
    // not_pivotable (labelled but listed by no node).
    expect(options()).toEqual([
      { field: "team_id", label: "Squad" },
      { field: "zone_code", label: "Zone" },
      { field: "gate_code", label: "Gate" },
    ]);
  });

  it("offers a field once however many kinds list it", () => {
    expect(options().filter((o) => o.field === "team_id")).toHaveLength(1);
  });

  it("offers nothing when the manifest declares no words, or the words are not an object", () => {
    expect(options({ fields: undefined })).toEqual([]);
    expect(options({ fields: null as unknown as undefined })).toEqual([]);
    expect(options({ fields: { team_id: null as unknown as ScenarioFieldWords, zone_code: { label: 7 as unknown as string } } })).toEqual([]);
  });

  it("reads a label after trimming it", () => {
    expect(options({ fields: { team_id: { label: "  Squad  " }, zone_code: { label: "   " } } })).toEqual([{ field: "team_id", label: "Squad" }]);
  });

  it("drops a field that no loaded row carries, and offers it again when one does", () => {
    const without = entities().filter((e) => e.kind !== "visit");
    expect(options({ data: data(without) }).map((o) => o.field)).toEqual(["team_id", "zone_code"]);
    expect(options({ data: data([]) })).toEqual([]);
  });

  it("agrees with the rows: the manifest's own grouping is among the fields offered", () => {
    expect(options().map((o) => o.field)).toContain(rowsDecl.by);
  });

  it("names no pack: the same code serves a pack with other names", () => {
    const other = node("trip", "Trip", { pivotable: ["driver_ref"] });
    const found = groupingOptions({
      nodes: [other],
      rows: { by: "driver_ref" },
      fields: { driver_ref: { label: "Driver" } },
      data: data([manifestRowToEntity(other, { id: "t1", at: at(1), driver_ref: "d1" })]),
    });
    expect(found).toEqual([{ field: "driver_ref", label: "Driver" }]);
  });
});

describe("chooseGrouping", () => {
  beforeEach(() => {
    useTrackBy.setState({ by: null });
    useSolo.setState({ solo: null });
  });

  it("stores the field and clears the solo when the grouping in force changes", () => {
    useSolo.getState().toggle("team_id", "a");
    chooseGrouping("zone_code", rowsDecl);
    expect(useTrackBy.getState().by).toBe("zone_code");
    expect(useSolo.getState().solo).toBeNull();
  });

  it("stores null for the manifest's own grouping, and clears the solo made under another one", () => {
    chooseGrouping("zone_code", rowsDecl);
    useSolo.getState().toggle("zone_code", "n");
    chooseGrouping("team_id", rowsDecl);
    expect(useTrackBy.getState().by).toBeNull();
    expect(useSolo.getState().solo).toBeNull();
  });

  it("keeps the solo when the field asked for is the one in force already", () => {
    useSolo.getState().toggle("team_id", "a");
    chooseGrouping("team_id", rowsDecl);
    expect(useSolo.getState().solo).toEqual({ field: "team_id", value: "a" });
    expect(useTrackBy.getState().by).toBeNull();
    chooseGrouping("zone_code", rowsDecl);
    useSolo.getState().toggle("zone_code", "n");
    chooseGrouping("zone_code", rowsDecl);
    expect(useSolo.getState().solo).toEqual({ field: "zone_code", value: "n" });
    expect(useTrackBy.getState().by).toBe("zone_code");
  });

  it("treats a link's grouping that equals the manifest's own as in force, and stores null", () => {
    useTrackBy.getState().setBy("team_id");
    useSolo.getState().toggle("team_id", "a");
    chooseGrouping("team_id", rowsDecl);
    expect(useTrackBy.getState().by).toBeNull();
    expect(useSolo.getState().solo).not.toBeNull();
  });

  it("works for a pack that declares no grouping of its own", () => {
    chooseGrouping("zone_code", undefined);
    expect(useTrackBy.getState().by).toBe("zone_code");
  });

  it("refuses a value that is not a field name, and changes nothing", () => {
    useSolo.getState().toggle("team_id", "a");
    chooseGrouping("has space", rowsDecl);
    expect(useTrackBy.getState().by).toBeNull();
    expect(useSolo.getState().solo).not.toBeNull();
  });

  it("writes the link's by, and writes none for the manifest's own grouping", () => {
    chooseGrouping("zone_code", rowsDecl);
    expect(buildShareLink({ scenario: "s", by: useTrackBy.getState().by })).toContain("by=zone_code");
    chooseGrouping("team_id", rowsDecl);
    expect(buildShareLink({ scenario: "s", by: useTrackBy.getState().by })).not.toContain("by=");
  });
});

describe("track-by.ts source", () => {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "track-by.ts"), "utf8");

  it("touches no storage, no clock and no word of one pack", () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|Date\.now|setTimeout|setInterval/);
    for (const word of ["org_id", "org_name", "merchant_name", "credential_id", "API key", "Organisation", "Merchant", "network"]) {
      expect(source).not.toContain(word);
    }
  });
});
