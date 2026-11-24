// The Shared values rows of a record (lib/shared-values.ts). The fixture is a small pack of five kinds and
// one decision kind, built from manifest nodes and rows by manifestRowToEntity, so no row is a literal
// Entity and the nodes are the only schema the rows know. It does not render anything or read a store
// (SharedValuesSection.test.tsx does both for the component).
import { describe, expect, it } from "vitest";
import { manifestRowToEntity } from "./adapters/manifest-row";
import { relatedEntities, type PivotContext } from "./matches";
import type { Entity } from "./entity";
import type { ScenarioNode } from "./scenarios";
import { drawCounts, showInputsOf, type DrawInputs, type ShowSwitches } from "./marks/draw";
import { sharedRows } from "./shared-values";

const node = (kind: string, label: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind, label, palette: "#4da3ff", source: "json", ...extra,
});

const NODES: ScenarioNode[] = [
  node("principal", "Key or seat", { palette: "#aa0001", pivotable: ["principal_id"] }),
  node("network_seen", "Network seen", { palette: "#aa0002", timestamp: "timestamp", pivotable: ["principal_id", "network_id"] }),
  node("key_event", "Key event", { palette: "#aa0003", timestamp: "timestamp", pivotable: ["principal_id"] }),
  node("request_sample", "Request", { palette: "#aa0004", timestamp: "timestamp", pivotable: ["principal_id", "network_id"] }),
  node("org", "Organisation", { pivotable: ["org_id"] }),
  node("decision", "Decision", {
    palette: "#aa0006", timestamp: "decided_at", pivotable: ["org_id"],
    decision: { status: "status", outcome: "outcome", note: "note", actor: "actor", target: "target", key: "org_id", event: "event_ids" },
  }),
];
const nodeOf = (kind: string): ScenarioNode => NODES.find((n) => n.kind === kind)!;
const T = (hour: number) => `2026-06-08T${String(hour).padStart(2, "0")}:00:00Z`;
const at = (hour: number) => Date.parse(T(hour));
const make = (kind: string, row: Record<string, unknown>): Entity => manifestRowToEntity(nodeOf(kind), row);

const N4 = make("network_seen", { id: "nw-0004", timestamp: T(10), principal_id: "pr-1", network_id: "net-1" });
const ENTITIES: Entity[] = [
  make("principal", { id: "pr-1", principal_id: "pr-1", org_id: "org-1" }),
  make("principal", { id: "pr-2", principal_id: "pr-2", org_id: "org-1" }),
  N4,
  make("network_seen", { id: "nw-0005", timestamp: T(11), principal_id: "pr-1", network_id: "net-2" }),
  make("network_seen", { id: "nw-0006", timestamp: T(12), principal_id: "pr-2", network_id: "net-1" }),
  make("key_event", { id: "ke-1", timestamp: T(9), principal_id: "pr-1" }),
  make("key_event", { id: "ke-2", timestamp: T(13), principal_id: "pr-1" }),
  make("key_event", { id: "ke-3", timestamp: T(13), principal_id: "pr-2" }),
  make("request_sample", { id: "rq-1", timestamp: T(10), principal_id: "pr-1", network_id: "net-1" }),
  make("request_sample", { id: "rq-2", timestamp: T(14), principal_id: "pr-1", network_id: "net-2" }),
  make("request_sample", { id: "rq-3", timestamp: T(15), principal_id: "pr-2", network_id: "net-1" }),
  make("org", { id: "org-1", org_id: "org-1", timestamp: 0 }),
  make("decision", {
    id: "dc-2", decided_at: T(16), status: "WAITING", outcome: "FOR REVIEW", note: "", actor: "", target: "",
    org_id: "org-1", event_ids: ["nw-0004", "nw-0006"],
  }),
  make("decision", {
    id: "dc-1", decided_at: T(14), status: "WAITING", outcome: "FOR REVIEW", note: "", actor: "", target: "",
    org_id: "org-1", event_ids: ["nw-0004"],
  }),
  make("decision", {
    id: "dc-3", decided_at: T(18), status: "WAITING", outcome: "FOR REVIEW", note: "", actor: "", target: "",
    org_id: "org-1", event_ids: ["nw-0006"],
  }),
];
const CTX: PivotContext = { transactions: [], logins: [], places: [], accountEvents: [], transfers: [], entities: ENTITIES };

describe("sharedRows", () => {
  it("gives one row for each kind and field the record shares, in the node's field order, then its decisions", () => {
    const rows = sharedRows(N4, NODES, CTX);
    expect(rows.map((r) => r.key)).toEqual([
      "principal:principal_id",
      "network_seen:principal_id",
      "key_event:principal_id",
      "request_sample:principal_id",
      "network_seen:network_id",
      "request_sample:network_id",
      "decision:event_ids:dc-1",
      "decision:event_ids:dc-2",
    ]);
  });

  it("never counts the record itself among a row's members", () => {
    for (const row of sharedRows(N4, NODES, CTX)) expect(row.members.map((m) => m.id)).not.toContain("nw-0004");
    const own = sharedRows(N4, NODES, CTX).find((r) => r.key === "network_seen:principal_id")!;
    expect(own.members.map((m) => m.id)).toEqual(["nw-0005"]);
  });

  it("reads each row's words and colour from the manifest, the field's label as the Inspector prints it", () => {
    const row = sharedRows(N4, NODES, CTX).find((r) => r.key === "principal:principal_id")!;
    expect(row).toMatchObject({
      kind: "principal", kindLabel: "Key or seat", palette: "#aa0001",
      field: "principal_id", fieldLabel: "Principal ID", value: "pr-1",
    });
    expect(row.open).toEqual({ type: "matches", field: "principal_id", value: "pr-1" });
  });

  it("matches the Matches press: the members of a field's rows are what relatedEntities lists, less the record", () => {
    const rows = sharedRows(N4, NODES, CTX);
    for (const [field, value] of [["principal_id", "pr-1"], ["network_id", "net-1"]] as const) {
      const counted = rows.filter((r) => r.field === field && r.open.type === "matches").reduce((n, r) => n + r.members.length, 0);
      expect(counted, field).toBe(relatedEntities(field, value, CTX).length - 1);
    }
    // One value, one kind: the row's own count equals the press's, less the record.
    const net = rows.find((r) => r.key === "request_sample:network_id")!;
    expect(net.members.map((m) => m.id)).toEqual(["rq-1", "rq-3"]);
  });

  it("carries each member's time, 0 for a record with none", () => {
    const rows = sharedRows(N4, NODES, CTX);
    const timed = (key: string) => rows.find((r) => r.key === key)!.members.map((m) => ({ id: m.id, timestamp: m.timestamp }));
    expect(timed("key_event:principal_id")).toEqual([
      { id: "ke-1", timestamp: at(9) },
      { id: "ke-2", timestamp: at(13) },
    ]);
    // The key or seat has no timestamp key in its node: its time is 0.
    expect(timed("principal:principal_id")).toEqual([{ id: "pr-1", timestamp: 0 }]);
  });

  it("does not count a kind whose node does not list the field as pivotable, though its rows hold the value", () => {
    const stray = make("org", { id: "org-2", org_id: "org-2", principal_id: "pr-1", timestamp: 0 });
    const rows = sharedRows(N4, NODES, { ...CTX, entities: [...ENTITIES, stray] });
    expect(rows.some((r) => r.kind === "org")).toBe(false);
  });

  it("gives no row for a value that is null, empty or not a string, and a list value never matches", () => {
    const none = make("network_seen", { id: "nw-9", timestamp: T(10), principal_id: null, network_id: "" });
    expect(sharedRows(none, NODES, CTX).filter((r) => r.open.type === "matches")).toEqual([]);
    const number = make("network_seen", { id: "nw-9", timestamp: T(10), principal_id: 7, network_id: 7 });
    expect(sharedRows(number, NODES, CTX).filter((r) => r.open.type === "matches")).toEqual([]);
    const list = make("network_seen", { id: "nw-9", timestamp: T(10), principal_id: ["pr-1"], network_id: ["net-1"] });
    expect(sharedRows(list, NODES, CTX).filter((r) => r.open.type === "matches")).toEqual([]);
  });

  it("gives no row for a kind with no other record holding the value, and none for a record whose kind has no node", () => {
    const lone = make("network_seen", { id: "nw-9", timestamp: T(10), principal_id: "pr-9", network_id: "net-9" });
    expect(sharedRows(lone, NODES, CTX).filter((r) => r.open.type === "matches")).toEqual([]);
    expect(sharedRows(N4, [], CTX)).toEqual([]);
    const ghost: Entity = { ...N4, kind: "no_such_kind" };
    expect(sharedRows(ghost, NODES, CTX)).toEqual([]);
  });

  it("gives one row for each decision whose events include the record, in time order, and opens that decision", () => {
    const rows = sharedRows(N4, NODES, CTX).filter((r) => r.open.type === "record");
    expect(rows.map((r) => r.members[0].id)).toEqual(["dc-1", "dc-2"]);
    expect(rows.map((r) => r.members[0].timestamp)).toEqual([at(14), at(16)]);
    expect(rows[0]).toMatchObject({ kind: "decision", kindLabel: "Decision", field: "event_ids", fieldLabel: "Event Ids", value: "nw-0004" });
    const dc1 = ENTITIES.find((e) => e.id === "dc-1")!;
    expect(rows[0].open).toEqual({ type: "record", match: { kind: "entity", entity: dc1 } });
    // dc-3 names another event only.
    expect(rows.map((r) => r.members[0].id)).not.toContain("dc-3");
  });

  it("gives a record with no row nothing", () => {
    const quiet = make("key_event", { id: "ke-9", timestamp: T(9), principal_id: "pr-77" });
    expect(sharedRows(quiet, NODES, CTX)).toEqual([]);
  });

  it("puts a kind with no node after the kinds that have one, by name", () => {
    const withSeed: PivotContext = {
      ...CTX,
      transactions: [
        { id: "tx-1", timestamp: T(10), card_id: "c-1", is_fraud: 0, amount: 5, merchant_name: "M", mcc: "1", merchant_country: "XX", merchant_lat: 1, merchant_lng: 2 },
        { id: "tx-2", timestamp: T(11), card_id: "c-1", is_fraud: 1, amount: 6, merchant_name: "M", mcc: "1", merchant_country: "XX", merchant_lat: 1, merchant_lng: 2 },
      ] as unknown as PivotContext["transactions"],
    };
    const cardNode = node("card_note", "Card note", { pivotable: ["card_id"] });
    const noteRow = manifestRowToEntity(cardNode, { id: "cn-1", card_id: "c-1" });
    const rows = sharedRows(noteRow, [cardNode], { ...withSeed, entities: [noteRow] });
    // A flagged and an ordinary transaction are two kinds, as the manifest's nodes and the Layers menu
    // hold them; with no node for either, each prints its kind and has no colour, by name.
    expect(rows.map((r) => [r.kind, r.members.length])).toEqual([["auth", 1], ["fraud", 1]]);
    expect(rows.map((r) => r.kindLabel)).toEqual(["auth", "fraud"]);
    expect(rows.map((r) => r.palette)).toEqual(["", ""]);
    expect(rows.map((r) => r.members[0].id)).toEqual(["tx-1", "tx-2"]);
    // With the nodes the pack declares, each row takes its node's label and colour.
    const labelled = sharedRows(noteRow, [cardNode, node("auth", "Authorization", { palette: "#00e5ff" }), node("fraud", "Fraud", { palette: "#ff3d2e" })], { ...withSeed, entities: [noteRow] });
    expect(labelled.map((r) => [r.kindLabel, r.palette])).toEqual([["Authorization", "#00e5ff"], ["Fraud", "#ff3d2e"]]);
  });
});

// The count is the one function's: `drawCounts` over a row's members, which are the records themselves as
// `DrawRecord`s (a kind, an id, a time and the fields), so the Layers switches reach them.
describe("a row's members and the one function's count", () => {
  const NO_FACTS = { pinned: false, disposition: "none", noted: false, inPath: false } as const;
  const SWITCHES: ShowSwitches = {
    showAuths: true, showLogins: true, showPlaces: false, pinWins: false, hiddenKinds: [], hiddenValues: {}, yoursOn: false,
    yoursFacets: { pinned: true, pass: true, fail: true, wait: true, noted: true, inPath: true },
  };
  /** A DrawInputs with nothing switched off unless `over` says so; the playhead is the argument. */
  const inputs = (playhead: number, windowed = true, over: Partial<ShowSwitches> = {}, nodes: readonly ScenarioNode[] = NODES): DrawInputs => ({
    ...showInputsOf({ ...SWITCHES, ...over }, nodes, () => NO_FACTS, null),
    playhead,
    windowed,
  });
  const row = (key: string) => sharedRows(N4, NODES, CTX).find((r) => r.key === key)!;

  it("holds each member as a DrawRecord: its kind, id, time and fields", () => {
    expect(row("key_event:principal_id").members[0]).toMatchObject({ kind: "key_event", id: "ke-1", timestamp: at(9), fields: { principal_id: "pr-1" } });
    // A decision row's member is the decision record itself, at its own time.
    expect(row("decision:event_ids:dc-1").members[0]).toMatchObject({ kind: "decision", id: "dc-1", timestamp: at(14) });
  });

  it("counts every member before the playhead's bounds have loaded", () => {
    const members = row("key_event:principal_id").members;
    expect(drawCounts(members, inputs(at(9), false))).toMatchObject({ reached: 2, all: 2 });
  });

  it("counts the members at or before the playhead once they have, and a member with no time", () => {
    const keys = row("key_event:principal_id").members; // ke-1 at 9, ke-2 at 13
    expect(drawCounts(keys, inputs(at(12))).reached).toBe(1);
    expect(drawCounts(keys, inputs(at(13))).reached).toBe(2);
    expect(drawCounts(keys, inputs(at(8))).reached).toBe(0);
    // The key or seat has no time: it is always reached.
    expect(drawCounts(row("principal:principal_id").members, inputs(at(8)))).toMatchObject({ reached: 1, all: 1 });
    expect(drawCounts([], inputs(at(12)))).toEqual({ shown: 0, reached: 0, all: 0 });
  });

  it("reads 0 of the total when the members' whole kind is switched off", () => {
    const keys = row("key_event:principal_id").members;
    expect(drawCounts(keys, inputs(at(20), true, { hiddenKinds: ["key_event"] }))).toMatchObject({ reached: 0, all: 2 });
    // Another kind's switch leaves it alone.
    expect(drawCounts(keys, inputs(at(20), true, { hiddenKinds: ["request_sample"] }))).toMatchObject({ reached: 2, all: 2 });
  });

  it("lowers only the records of a switched-off value of the kind's filter field", () => {
    const filtered = NODES.map((n) => (n.kind === "request_sample" ? { ...n, filter: { field: "network_id", label: "Network" } } : n));
    const reqs = row("request_sample:principal_id").members; // rq-1 (net-1, at 10) and rq-2 (net-2, at 14)
    expect(drawCounts(reqs, inputs(at(15), true, {}, filtered)).reached).toBe(2);
    expect(drawCounts(reqs, inputs(at(15), true, { hiddenValues: { request_sample: ["net-1"] } }, filtered))).toMatchObject({ reached: 1, all: 2 });
    expect(drawCounts(reqs, inputs(at(12), true, { hiddenValues: { request_sample: ["net-1"] } }, filtered))).toMatchObject({ reached: 0, all: 2 });
  });
});
