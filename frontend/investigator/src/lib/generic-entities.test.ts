import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { fetchGenericEntities, genericCounts, useGenericEntities } from "./generic-entities";
import type { Entity } from "./entity";
import type { DrawInputs } from "./marks/draw";
import type { RecordFacts } from "./marks/types";
import type { ScenarioNode } from "./scenarios";
import { verdictNode } from "./verdict-fixtures";

/**
 * A hand-built `DrawInputs` with nothing off and no investigator state: every kind and value on, no
 * filter field, Yours off, nothing pinned or marked, no selected record, Places and the pin's win off
 * (the pin's win is `PIN_WINS`, false until item 1). The playhead is free until a test sets it.
 */
function drawFixture(over: Partial<DrawInputs> = {}): DrawInputs {
  const untouched = (): RecordFacts => ({ pinned: false, disposition: "none", noted: false, inPath: false });
  return {
    kindOn: () => true,
    valueOn: () => true,
    filterField: () => null,
    yours: { on: false, facets: { pinned: true, pass: true, fail: true, wait: true, noted: true, inPath: true } },
    facts: untouched,
    placesOn: false,
    pinWins: false,
    selected: null,
    playhead: 0,
    windowed: false,
    ...over,
  };
}

const node = (kind: string, source = "sql"): ScenarioNode => ({
  kind, label: kind, palette: "#fff", source, query: "q",
  coords: null, timestamp: "at", primary: "${id}",
});
const rows: Record<string, unknown[]> = {
  shipment: [{ id: "t1", at: "2026-05-12T10:14:00-05:00" }],
  refund: [{ id: "r1", at: "2026-05-29T10:05:00-05:00" }],
};

function stubFetch(status = 200) {
  const f = vi.fn(async (url: string) => {
    const kind = new URL(url, "http://x").searchParams.get("kind") ?? "";
    return { ok: status === 200, status, json: async () => rows[kind] ?? [] } as Response;
  });
  vi.stubGlobal("fetch", f);
  return f;
}
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchGenericEntities", () => {
  it("fetches only the generic nodes, one /api/entities read per kind", async () => {
    const f = stubFetch();
    const out = await fetchGenericEntities([node("auth"), node("shipment"), node("place", "places-api"), node("refund")]);
    expect(f.mock.calls.map((c) => c[0])).toEqual(["/api/entities?kind=shipment", "/api/entities?kind=refund"]);
    expect(Object.keys(out)).toEqual(["shipment", "refund"]);
    expect(out.shipment[0]).toMatchObject({ id: "t1", kind: "shipment" });
  });

  it("makes no request for a scenario with only concrete kinds", async () => {
    const f = stubFetch();
    expect(await fetchGenericEntities([node("auth"), node("login")])).toEqual({});
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects when a read fails (never an empty set passed off as data)", async () => {
    stubFetch(500);
    await expect(fetchGenericEntities([node("shipment")])).rejects.toThrow(/shipment.*500/);
  });
});

describe("useGenericEntities", () => {
  it("returns the stable empty map when no node is generic", () => {
    stubFetch();
    const nodes = [node("auth")];
    const { result, rerender } = renderHook(() => useGenericEntities(nodes, vi.fn()));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(first).toEqual({});
  });

  it("loads the generic kinds and reports a failure through onError", async () => {
    stubFetch();
    const nodes = [node("shipment")];
    const { result } = renderHook(() => useGenericEntities(nodes, vi.fn()));
    await waitFor(() => expect(result.current.shipment?.length).toBe(1));

    stubFetch(500);
    const onError = vi.fn();
    renderHook(() => useGenericEntities([node("refund")], onError));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("refund")));
  });
});

describe("genericCounts", () => {
  const nodes = [node("auth"), node("shipment"), node("refund"), node("hop")];
  const mk = (id: string, kind: string, ts: number) => ({
    id, kind, timestamp: ts, coords: null, fields: {},
    displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
  });
  const byKind = {
    shipment: [mk("t1", "shipment", 100), mk("t2", "shipment", 200), mk("t3", "shipment", 300)],
    refund: [mk("r1", "refund", 400)],
  };

  it("counts, per declared generic kind, the events the playhead has reached against the total", () => {
    expect(genericCounts(nodes, byKind, drawFixture({ playhead: 250, windowed: true })).map((c) => [c.kind, c.visible, c.total])).toEqual([
      ["shipment", 2, 3], ["refund", 0, 1], ["hop", 0, 0],
    ]);
  });

  it("skips the concrete kinds and carries the node label and palette", () => {
    const c = genericCounts([{ ...node("shipment"), label: "Shipment", palette: "#ffb347" }], byKind, drawFixture({ playhead: 0, windowed: true }));
    expect(c[0]).toMatchObject({ kind: "shipment", label: "Shipment", palette: "#ffb347" });
  });

  it("counts everything before the playhead bounds have loaded", () => {
    expect(genericCounts(nodes, byKind, drawFixture({ playhead: 0, windowed: false }))[0]).toMatchObject({ visible: 3, total: 3 });
  });
});

describe("genericCounts: values, switches and tones", () => {
  const signNode: ScenarioNode = { ...node("sign"), label: "Sign-in", filter: { field: "net", label: "Network type" } };
  const mk = (id: string, ts: number, fields: Record<string, unknown>): Entity => ({
    id, kind: "sign", timestamp: ts, coords: null, fields,
    displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: "sign", pivotableFields: [] },
  });
  // Five sign-ins: three corporate (the third ahead of the playhead), one education, one with no value.
  const signs = [
    mk("s1", 100, { net: "corporate" }), mk("s2", 200, { net: "corporate" }), mk("s3", 300, { net: "corporate" }),
    mk("s4", 400, { net: "education" }), mk("s5", 100, {}),
  ];
  const at250 = { playhead: 250, windowed: true };
  const fieldOf = (kind: string) => (kind === "sign" ? "net" : null);

  it("groups a filtered kind by its field: total descending, then value, a missing value as an empty one", () => {
    const [c] = genericCounts([signNode], { sign: signs }, drawFixture({ ...at250, filterField: fieldOf }));
    expect(c.filter).toEqual({ field: "net", label: "Network type" });
    expect(c.values).toEqual([
      { value: "corporate", visible: 2, total: 3, tone: null },
      { value: "", visible: 1, total: 1, tone: null },
      { value: "education", visible: 0, total: 1, tone: null },
    ]);
    expect(c).toMatchObject({ visible: 3, total: 5 });
  });

  it("gives a kind with no filter, or one the manifest reader refuses, no values", () => {
    expect(genericCounts([node("sign")], { sign: signs }, drawFixture(at250))[0]).toMatchObject({ filter: null, values: [] });
    // A filter on the node's own timestamp field is refused by filterOf.
    const refused: ScenarioNode = { ...node("sign"), filter: { field: "at", label: "When" } };
    expect(genericCounts([refused], { sign: signs }, drawFixture(at250))[0]).toMatchObject({ filter: null, values: [] });
  });

  it("reads a switched-off kind as zero for the kind and for every value", () => {
    const [c] = genericCounts([signNode], { sign: signs }, drawFixture({ ...at250, filterField: fieldOf, kindOn: () => false }));
    expect(c.visible).toBe(0);
    expect(c.total).toBe(5);
    expect(c.values.map((v) => [v.value, v.visible, v.total])).toEqual([["corporate", 0, 3], ["", 0, 1], ["education", 0, 1]]);
  });

  it("reads a switched-off value as zero and lowers the kind's reached count by that value's records", () => {
    const d = drawFixture({ ...at250, filterField: fieldOf, valueOn: (_k, v) => v !== "corporate" });
    const [c] = genericCounts([signNode], { sign: signs }, d);
    expect(c.visible).toBe(1);
    expect(c.values.find((v) => v.value === "corporate")).toMatchObject({ visible: 0, total: 3 });
    expect(c.values.find((v) => v.value === "")).toMatchObject({ visible: 1, total: 1 });
  });

  it("keeps a value named like an inherited key as an ordinary value", () => {
    const odd = [mk("o1", 100, { net: "constructor" }), mk("o2", 100, { net: "__proto__" }), mk("o3", 100, { net: "constructor" })];
    const [c] = genericCounts([signNode], { sign: odd }, drawFixture({ ...at250, filterField: fieldOf }));
    expect(c.values.map((v) => [v.value, v.total])).toEqual([["constructor", 2], ["__proto__", 1]]);
  });

  it("reads a kind named like an inherited key that has no entry in the lists as empty", () => {
    const odd: ScenarioNode = { ...node("constructor"), label: "Constructor" };
    expect(genericCounts([odd], {}, drawFixture(at250))[0]).toMatchObject({ total: 0, visible: 0, values: [] });
  });

  it("reads each decision status as its tone, and a word it does not know as unknown", () => {
    const decisions: ScenarioNode = { ...verdictNode, filter: { field: "state", label: "Status" } };
    const row = (id: string, state: string): Entity => ({
      id, kind: decisions.kind, timestamp: 100, coords: null, fields: { state },
      displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: decisions.kind, pivotableFields: [] },
    });
    const list = [row("d1", "FAIL"), row("d2", "PASS"), row("d3", "WAITING"), row("d4", "REVIEW")];
    const [c] = genericCounts([decisions], { [decisions.kind]: list }, drawFixture({ ...at250, filterField: () => "state" }));
    expect(Object.fromEntries(c.values.map((v) => [v.value, v.tone]))).toEqual({
      FAIL: "fail", PASS: "pass", WAITING: "wait", REVIEW: "unknown",
    });
  });

  it("gives a decision kind's value no tone when the filter field is not its status field", () => {
    const decisions: ScenarioNode = { ...verdictNode, filter: { field: "finding", label: "Finding" } };
    const row = (id: string, finding: string): Entity => ({
      id, kind: decisions.kind, timestamp: 100, coords: null, fields: { state: "FAIL", finding },
      displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: decisions.kind, pivotableFields: [] },
    });
    const [c] = genericCounts([decisions], { [decisions.kind]: [row("d1", "ATO")] }, drawFixture({ ...at250, filterField: () => "finding" }));
    expect(c.values).toEqual([{ value: "ATO", visible: 1, total: 1, tone: null }]);
  });
});
