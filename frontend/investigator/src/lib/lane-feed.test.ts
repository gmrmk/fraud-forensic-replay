/**
 * The lane feed: the case's own rows, adapted to the
 * generic entity shape, reach the lane builder, so a pack that declares a lane over concrete kinds
 * (authorizations, transfers) draws it. Every fixture is written here and names no pack.
 */
import { describe, expect, it } from "vitest";
import { manifestRowToEntity } from "./adapters/manifest-row";
import { buildCaseLanes, laneDeclarations, laneEntities } from "./lane-feed";
import { buildLanes } from "./timeline-lanes";
import type { ScenarioLane, ScenarioNode } from "./scenarios";
import type { Transaction, Transfer } from "../types";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-05-26T08:00:00-05:00");
const iso = (hours: number): string => new Date(T0 + hours * HOUR).toISOString();

const concrete = (kind: string, label: string): ScenarioNode => ({
  kind, label, palette: "#33aaff", source: "sql", coords: null, timestamp: "timestamp", primary: "${id}",
});
const nodes: ScenarioNode[] = [concrete("auth", "Authorization"), concrete("fraud", "Fraud"), concrete("transfer", "Transfer")];

const spend: ScenarioLane = {
  id: "case-spend", name: "Authorizations", label: "Spend", unit: "USD", kinds: ["auth", "fraud"], field: "amount",
  bucket: "hour", aggregate: "sum",
};
const rank: ScenarioLane = {
  id: "case-rank", name: "Authorizations", label: "Highest rank", unit: "pct", kinds: ["auth", "fraud"], field: "ml_percentile",
  bucket: "hour", aggregate: "max",
};

let seq = 0;
const tx = (hours: number, amount: number, extra: Record<string, unknown> = {}): Transaction =>
  ({ id: `t${++seq}`, timestamp: iso(hours), is_fraud: 0, amount, merchant_name: "Shop", ml_percentile: 10, ...extra }) as unknown as Transaction;
const transfer = (hours: number, amount: number): Transfer =>
  ({ id: `x${++seq}`, timestamp: iso(hours), amount, rail: "wire", status: "sent", session_id: "s" }) as unknown as Transfer;

const rows = (transactions: Transaction[], transfers: Transfer[] = []) => ({ transactions, transfers });
const feed = (transactions: Transaction[], declared: ScenarioLane[], transfers: Transfer[] = []) =>
  laneEntities(rows(transactions, transfers), new Set(laneDeclarations(nodes, declared).flatMap((d) => d.kinds)));

describe("laneEntities", () => {
  it("adapts the concrete rows a lane lists, and leaves out those no lane lists", () => {
    const entities = laneEntities(rows([tx(0, 5)], [transfer(0, 7)]), new Set(["auth"]));
    expect(entities.map((e) => e.kind)).toEqual(["auth"]);
    expect(entities[0].fields.amount).toBe(5);
  });

  it("gives a fraud transaction the kind fraud, and keeps the generic entities as they are", () => {
    const generic = manifestRowToEntity(concrete("reading", "Reading"), { id: "g1", timestamp: iso(1) });
    const out = laneEntities({ transactions: [tx(0, 5, { is_fraud: 1 })], entities: [generic] }, new Set(["auth", "fraud"]));
    expect(out.map((e) => e.kind)).toEqual(["fraud", "reading"]);
  });
});

describe("a lane declared over concrete kinds", () => {
  it("gives one bar for each hour, summing the transactions that share an hour", () => {
    const txs = [tx(0, 10), tx(0.25, 20), tx(0.75, 30), tx(1.5, 40), tx(5, 8)];
    const lanes = buildCaseLanes(nodes, feed(txs, [spend]), [spend]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].id).toBe("case-spend");
    expect(lanes[0].bars.map((b) => b.value)).toEqual([60, 40, 8]);
    expect(lanes[0].step).toBe(HOUR);
    expect(lanes[0].nodeLabel).toBe("Authorizations");
  });

  it("draws no lane when the manifest declares none", () => {
    const txs = [tx(0, 10), tx(1, 20)];
    expect(buildCaseLanes(nodes, feed(txs, []), undefined)).toEqual([]);
    expect(buildCaseLanes(nodes, feed(txs, []), [])).toEqual([]);
  });

  it("adds the transfers to the hour they fall in when the lane lists them (the account story)", () => {
    const account: ScenarioLane = { ...spend, id: "account-spend", kinds: ["auth", "transfer"] };
    const lanes = buildCaseLanes(nodes, feed([tx(0, 10), tx(2, 5)], [account], [transfer(0.5, 100), transfer(3, 50)]), [account]);
    expect(lanes[0].bars.map((b) => [b.t, b.value])).toEqual([
      [T0, 110],
      [T0 + 2 * HOUR, 5],
      [T0 + 3 * HOUR, 50],
    ]);
  });

  it("hides a lane whose field no row carries, and keeps the others", () => {
    const absent: ScenarioLane = { ...spend, id: "none", field: "no_such_field" };
    const lanes = buildCaseLanes(nodes, feed([tx(0, 10)], [absent, spend]), [absent, spend]);
    expect(lanes.map((l) => l.id)).toEqual(["case-spend"]);
  });

  it("with no solo is the lane list buildLanes gives", () => {
    const entities = feed([tx(0, 10), tx(1, 70)], [spend, rank]);
    expect(buildCaseLanes(nodes, entities, [spend, rank])).toEqual(buildLanes(nodes, entities, [spend, rank]));
    expect(buildCaseLanes(nodes, entities, [spend, rank], null)).toEqual(buildLanes(nodes, entities, [spend, rank]));
  });

  it("a node's own lane keeps the node's kind as its id, so a saved fold still holds", () => {
    const usage: ScenarioNode = { ...concrete("usage", "Token usage"), source: "json", magnitude: "cost", magnitudeLabel: "Spend", magnitudeUnit: "USD" };
    const own = manifestRowToEntity(usage, { id: "u1", timestamp: iso(0), cost: 3 });
    expect(buildCaseLanes([usage], [own], undefined).map((l) => l.id)).toEqual(["usage"]);
  });
});

describe("a lane under a solo (the owner's pick, call 34)", () => {
  // Hours 0 to 3 hold the whole case. The soloed row owns 215.56 at hour 0 and 40 at hour 2.
  const mine = [tx(0, 200), tx(0, 15.56), tx(2, 40)];
  const others = [tx(0, 300), tx(1, 120), tx(3, 90)];
  const all = [...mine, ...others];

  it("a sum lane takes the soloed row's largest hourly bar over the whole case as its top, exactly", () => {
    const entities = feed(all, [spend]);
    const alone = feed(mine, [spend]);
    const whole = buildCaseLanes(nodes, entities, [spend])[0];
    const solo = buildCaseLanes(nodes, entities, [spend], alone)[0];
    expect(whole.scale.top).not.toBe(215.56);
    expect(solo.bars.map((b) => b.value)).toEqual([215.56, 40]);
    expect(solo.scale.top).toBe(215.56);
    expect(solo.scale.max).toBe(215.56);
    expect(solo.scale.above).toBe(0);
    // The soloed row's biggest bar fills the plot, and its small bar stands taller than the same
    // 40 does on the case's own top.
    expect(solo.bars[0].height).toBe(24);
    expect(solo.bars[1].height).toBeGreaterThan(whole.bars[2].height);
  });

  it("a lane that is not a sum keeps the top it has with no solo", () => {
    const ranked = [tx(0, 1, { ml_percentile: 40 }), tx(1, 1, { ml_percentile: 99 })];
    const entities = feed(ranked, [rank]);
    const whole = buildCaseLanes(nodes, entities, [rank])[0];
    const solo = buildCaseLanes(nodes, entities, [rank], feed([ranked[0]], [rank]))[0];
    expect(solo.scale.top).toBe(whole.scale.top);
    expect(solo.bars.map((b) => b.value)).toEqual([40]);
  });

  it("a lane with no declared bucket keeps the case's step for a row with one bar or with gaps", () => {
    const usage: ScenarioNode = { ...concrete("usage", "Token usage"), source: "json", magnitude: "cost", magnitudeLabel: "Spend", magnitudeUnit: "USD" };
    const row = (id: string, hours: number, cost: number) => manifestRowToEntity(usage, { id, timestamp: iso(hours), cost });
    const whole = [row("u1", 0, 5), row("u2", 1, 6), row("u3", 2, 7), row("u4", 3, 8)];
    const wholeLane = buildCaseLanes([usage], whole, undefined)[0];
    expect(wholeLane.step).toBe(HOUR);
    // One bar: no step can be inferred from it.
    expect(buildCaseLanes([usage], whole, undefined, [whole[0]])[0].step).toBe(HOUR);
    // Two bars three hours apart would infer a step of three hours.
    expect(buildCaseLanes([usage], whole, undefined, [whole[0], whole[3]])[0].step).toBe(HOUR);
  });

  // Section 8 (Solo): a lane the soloed row has no value for stays, with no bars, so the lane's
  // header can still name the row. It keeps the case's step, unit and number form.
  it("a lane the soloed row has no value for is kept, with no bars and the case's own step and scale", () => {
    const whole = buildCaseLanes(nodes, feed(all, [spend]), [spend])[0];
    const lanes = buildCaseLanes(nodes, feed(all, [spend]), [spend], []);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toMatchObject({ id: "case-spend", nodeLabel: "Authorizations", label: "Spend", unit: "USD", step: HOUR, decimals: whole.decimals });
    expect(lanes[0].bars).toEqual([]);
    expect(lanes[0].scale).toEqual({ top: whole.scale.top, max: 0, above: 0 });
  });

  it("keeps an empty lane of each kind, in its place, beside a lane the row does have values for", () => {
    const entities = feed(all, [spend, rank]);
    // A row whose transactions have an amount and no rank: the spend lane has its bar, the rank lane is empty.
    const unranked = feed([tx(0, 5, { ml_percentile: null })], [spend, rank]);
    const mixed = buildCaseLanes(nodes, entities, [spend, rank], unranked);
    expect(mixed.map((l) => [l.id, l.bars.length])).toEqual([["case-spend", 1], ["case-rank", 0]]);
    const none = buildCaseLanes(nodes, entities, [spend, rank], []);
    expect(none.map((l) => [l.id, l.bars.length])).toEqual([["case-spend", 0], ["case-rank", 0]]);
  });

  it("leaves out a lane that has no value in the whole case either", () => {
    const absent: ScenarioLane = { ...spend, id: "none", field: "no_such_field" };
    expect(buildCaseLanes(nodes, feed(all, [absent, spend]), [absent, spend], []).map((l) => l.id)).toEqual(["case-spend"]);
  });
});
