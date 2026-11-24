import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchScenarios,
  fetchActiveScenario,
  selectScenario,
  ensureChosenScenario,
  parseTemplateFields,
  validLanes,
  filterOf,
  type ScenarioNode,
} from "./scenarios";

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function errResponse(status: number, detail?: string): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(detail ? { detail } : {}),
  } as unknown as Response;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("fetchScenarios", () => {
  it("returns the id+label list from /api/scenarios", async () => {
    const list = [
      { id: "card-fraud", label: "Card · Houston→Lagos" },
      { id: "card-fraud-concordia", label: "Card · Concordia-generated" },
    ];
    const fetchMock = vi.fn().mockResolvedValue(okJson(list));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchScenarios()).resolves.toEqual(list);
    expect(fetchMock).toHaveBeenCalledWith("/api/scenarios");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errResponse(500)));
    await expect(fetchScenarios()).rejects.toThrow(/500/);
  });
});

describe("fetchActiveScenario", () => {
  it("reduces the active manifest to id + label + home + annotations", async () => {
    const manifest = {
      id: "card-fraud",
      label: "Card · Houston→Lagos",
      db: "data/replay.db",
      home: { lat: 20.0, lng: -40.0, zoom: 2 },
      nodes: [],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(manifest)));

    await expect(fetchActiveScenario()).resolves.toEqual({
      id: "card-fraud",
      label: "Card · Houston→Lagos",
      home: { lat: 20.0, lng: -40.0, zoom: 2 },
      annotations: [],
      nodes: [],
      focal: null,
    });
  });

  it("leaves home undefined when the manifest has none", async () => {
    const manifest = { id: "x", label: "X", db: "data/x.db", nodes: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(manifest)));

    const active = await fetchActiveScenario();
    expect(active.home).toBeUndefined();
  });

  it("passes the manifest's node metadata through", async () => {
    const manifest = {
      id: "x",
      label: "X",
      db: "data/x.db",
      nodes: [
        {
          kind: "login",
          label: "Login",
          palette: "#b388ff",
          source: "sql",
          query: "SELECT * FROM logins",
          coords: { lat: "ip_lat", lng: "ip_lng" },
          timestamp: "timestamp",
          primary: "device_fp",
          secondary: "outcome",
          pivotable: ["session_id", "device_fp"],
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(manifest)));
    const active = await fetchActiveScenario();
    expect(active.nodes).toHaveLength(1);
    expect(active.nodes[0]).toMatchObject({ kind: "login", primary: "device_fp" });
  });
});

describe("selectScenario", () => {
  it("POSTs the id to /api/scenario/select", async () => {
    const manifest = { id: "card-fraud-concordia", label: "Card · Concordia-generated" };
    const fetchMock = vi.fn().mockResolvedValue(okJson(manifest));
    vi.stubGlobal("fetch", fetchMock);

    await expect(selectScenario("card-fraud-concordia")).resolves.toEqual({
      id: "card-fraud-concordia",
      label: "Card · Concordia-generated",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/scenario/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "card-fraud-concordia" }),
    });
  });

  it("surfaces the backend detail on a 400 (unknown id)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errResponse(400, "unknown scenario: nope")),
    );
    await expect(selectScenario("nope")).rejects.toThrow(/unknown scenario: nope/);
  });

  it("persists the chosen id so a backend restart cannot silently swap cases", async () => {
    const manifest = { id: "priya-ato", label: "ATO · Priya" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(manifest)));
    await selectScenario("priya-ato");
    expect(localStorage.getItem("ffr.scenario")).toBe("priya-ato");
  });
});

describe("ensureChosenScenario", () => {
  const ACTIVE_DEFAULT = { id: "card-fraud", label: "Card · Houston→Lagos" };
  const ACTIVE_PRIYA = { id: "priya-ato", label: "ATO · Priya" };

  it("returns the server's active scenario when no choice is stored", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson(ACTIVE_DEFAULT));
    vi.stubGlobal("fetch", fetchMock);

    const active = await ensureChosenScenario();
    expect(active.id).toBe("card-fraud");
    expect(fetchMock).toHaveBeenCalledTimes(1); // GET only, no select POST
  });

  it("re-asserts a stored choice after a backend restart reset", async () => {
    localStorage.setItem("ffr.scenario", "priya-ato");
    // Restart symptom: server says card-fraud (its import-time default),
    // this browser chose priya-ato. Expect select POST + re-fetch.
    let gets = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/scenario/select") return Promise.resolve(okJson(ACTIVE_PRIYA));
      if (init) return Promise.reject(new Error(`unexpected: ${url}`));
      gets += 1;
      return Promise.resolve(okJson(gets === 1 ? ACTIVE_DEFAULT : ACTIVE_PRIYA));
    });
    vi.stubGlobal("fetch", fetchMock);

    const active = await ensureChosenScenario();
    expect(active.id).toBe("priya-ato");
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/scenario/select"),
    ).toHaveLength(1);
  });

  it("falls back to the server's active when the stored id no longer exists", async () => {
    localStorage.setItem("ffr.scenario", "removed-scenario");
    const fetchMock = vi.fn((url: string) =>
      url === "/api/scenario/select"
        ? Promise.resolve(errResponse(400, "unknown scenario: removed-scenario"))
        : Promise.resolve(okJson(ACTIVE_DEFAULT)),
    );
    vi.stubGlobal("fetch", fetchMock);

    const active = await ensureChosenScenario();
    expect(active.id).toBe("card-fraud");
  });

  it("SCN-05: propagates a re-fetch failure after a successful POST (does not return stale manifest)", async () => {
    // Scenario: POST /api/scenario/select succeeds, but the subsequent GET
    // /api/scenario fails. The old code caught both in one block and would
    // silently return the stale pre-switch `active` (wrong scenario data).
    // The fix separates the two try/catch scopes so the re-fetch error surfaces.
    localStorage.setItem("ffr.scenario", "priya-ato");
    let getCount = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/scenario/select") return Promise.resolve(okJson(ACTIVE_PRIYA));
      // First GET (boot probe) succeeds; second GET (post-select re-fetch) fails.
      getCount += 1;
      if (getCount === 1) return Promise.resolve(okJson(ACTIVE_DEFAULT));
      return Promise.resolve(errResponse(503, "service unavailable"));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureChosenScenario()).rejects.toThrow(/503|service unavailable/i);
  });
});


describe("parseTemplateFields", () => {
  it("extracts field names from a compound template", () => {
    expect(parseTemplateFields("$${amount} · ${merchant_name}")).toEqual(["amount", "merchant_name"]);
  });
  it("handles a single placeholder", () => {
    expect(parseTemplateFields("${device_fp}")).toEqual(["device_fp"]);
  });
  it("returns empty for undefined", () => {
    expect(parseTemplateFields(undefined)).toEqual([]);
  });
  it("returns empty for null", () => {
    expect(parseTemplateFields(null)).toEqual([]);
  });
  it("returns empty for a template with no placeholders", () => {
    expect(parseTemplateFields("plain text")).toEqual([]);
  });
});

describe("fetchActiveScenario: the manifest's root keys", () => {
  // A fixture manifest whose names are none of the three stories'.
  const FIXTURE = {
    id: "fixture",
    label: "Fixture",
    db: "data/fixture.db",
    nodes: [],
    rows: { by: "region", name: "region_name", member: "agent" },
    fields: {
      region: { label: "Region" },
      agent: { label: "Agent" },
      cost: { label: "Cost", unit: "EUR" },
    },
    lanes: [
      {
        id: "cost-by-hour",
        name: "Orders",
        label: "Cost",
        unit: "EUR",
        kinds: ["order"],
        field: "cost",
        bucket: "hour",
        aggregate: "max",
        top: 80,
      },
    ],
  };

  it("carries rows, fields and lanes through unchanged, whatever the names", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(FIXTURE)));
    const active = await fetchActiveScenario();
    expect(active.rows).toEqual(FIXTURE.rows);
    expect(active.fields).toEqual(FIXTURE.fields);
    expect(active.lanes).toEqual(FIXTURE.lanes);
  });

  it("does not validate where it reduces: a malformed lane arrives beside a good one", async () => {
    // Validation is the reader's, so that an invalid entry hides only what it names.
    const lanes = [{ id: "", kinds: "not a list" }, FIXTURE.lanes[0]];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson({ ...FIXTURE, lanes })));
    const active = await fetchActiveScenario();
    expect(active.lanes).toEqual(lanes);
    expect(active.rows).toEqual(FIXTURE.rows);
  });

  it("leaves all three undefined when the manifest declares none", async () => {
    const bare = { id: "x", label: "X", db: "data/x.db", nodes: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(bare)));
    const active = await fetchActiveScenario();
    expect(active.rows).toBeUndefined();
    expect(active.fields).toBeUndefined();
    expect(active.lanes).toBeUndefined();
  });

  describe("the shipped manifests", () => {
    const manifestPath = (pack: string): string =>
      resolve(dirname(fileURLToPath(import.meta.url)), `../../../../backend/scenarios/${pack}.scenario.json`);
    const manifestOf = (pack: string): Record<string, unknown> =>
      JSON.parse(readFileSync(manifestPath(pack), "utf8")) as Record<string, unknown>;
    const fetched = async (pack: string) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(manifestOf(pack))));
      return fetchActiveScenario();
    };

    it.each([
      "platform-access",
      "card-fraud",
      "priya-ato",
      "key-many-networks",
      "agent-runs-shared-key",
      "seats-two-networks",
      "volume-step",
      "seat-failed-signins",
    ])(
      "%s: the root keys the file declares reach the app unchanged",
      async (pack) => {
        const file = manifestOf(pack);
        const active = await fetched(pack);
        expect(file.rows).toBeDefined();
        expect(file.fields).toBeDefined();
        expect(active.rows).toEqual(file.rows);
        expect(active.fields).toEqual(file.fields);
        expect(active.lanes).toEqual(file.lanes);
      },
    );

    it("the token story groups by organisation and opens a row into its keys", async () => {
      const active = await fetched("platform-access");
      expect(active.rows).toEqual({ by: "org_id", name: "org_name", member: "credential_id" });
      expect(active.fields?.org_id?.label).toBe("Organisation");
      expect(active.fields?.credential_id?.label).toBe("API key");
      expect(active.lanes).toEqual([{ id: "usage", depth: { split: "ip_asn" } }]);
    });

    // The card story declares its two lanes: spend, and the highest model rank.
    it("the card story groups by merchant, names a row by its value and declares its two lanes", async () => {
      const active = await fetched("card-fraud");
      expect(active.rows).toEqual({ by: "merchant_name" });
      expect(active.fields?.merchant_name?.label).toBe("Merchant");
      expect(active.lanes).toEqual([
        {
          id: "card-spend",
          name: "Authorizations",
          label: "Spend",
          unit: "USD",
          kinds: ["auth", "fraud"],
          field: "amount",
          bucket: "hour",
          aggregate: "sum",
        },
        {
          id: "card-rank",
          name: "Authorizations",
          label: "Highest model rank",
          unit: "pct",
          kinds: ["auth", "fraud"],
          field: "ml_percentile",
          bucket: "hour",
          aggregate: "max",
        },
      ]);
    });

    it.each(["card-fraud", "priya-ato"])("%s: every lane the file declares passes the reader", async (pack) => {
      const active = await fetched(pack);
      expect(validLanes(active.lanes, active.nodes)).toEqual(active.lanes);
    });

    it("the account story groups by merchant and declares its spend lane", async () => {
      const active = await fetched("priya-ato");
      expect(active.rows).toEqual({ by: "merchant_name" });
      expect(active.lanes).toEqual([
        {
          id: "account-spend",
          name: "Authorizations/transfers",
          label: "Spend",
          unit: "USD",
          kinds: ["auth", "transfer"],
          field: "amount",
          bucket: "hour",
          aggregate: "sum",
        },
      ]);
    });

    // The public copy leaves this manifest out (SKIP in scripts/export-public.mjs): the case skips
    // there and runs unchanged where the file exists. Presence only: a file that is there and wrong fails.
    it.skipIf(!existsSync(manifestPath("card-fraud-concordia")))(
      "a pack that declares none keeps today's bar (skipped where the public copy leaves out backend/scenarios/card-fraud-concordia.scenario.json)",
      async () => {
        const active = await fetched("card-fraud-concordia");
        expect(active.rows).toBeUndefined();
        expect(active.fields).toBeUndefined();
        expect(active.lanes).toBeUndefined();
        expect(active.nodes.length).toBeGreaterThan(0);
      },
    );
  });
});

// The reader of the manifest's lanes (LM2): it is where an invalid entry is found, and it hides
// only that entry. The fixture's names are none of the three stories'.
describe("validLanes", () => {
  const nodes: ScenarioNode[] = [
    { kind: "order", label: "Order", palette: "#369", source: "sql", timestamp: "placed_at" },
    { kind: "refund", label: "Refund", palette: "#963", source: "sql", timestamp: "paid_at" },
    { kind: "memo", label: "Memo", palette: "#666", source: "json" },
  ];
  const good = {
    id: "cost-by-hour",
    name: "Orders",
    label: "Cost",
    unit: "EUR",
    kinds: ["order", "refund"],
    field: "cost",
    bucket: "hour",
    aggregate: "sum",
  };
  const other = { ...good, id: "worst-cost", label: "Dearest order", unit: "pct", aggregate: "max", top: 80 };

  it("keeps a good lane as declared, and a good lane beside a malformed one", () => {
    expect(validLanes([good], nodes)).toEqual([good]);
    expect(validLanes([{ id: "", kinds: "not a list" }, good, other], nodes)).toEqual([good, other]);
  });

  it("a manifest with one malformed lane keeps the other lane and the rows", async () => {
    const manifest = {
      id: "fixture",
      label: "Fixture",
      nodes,
      rows: { by: "region" },
      fields: { region: { label: "Region" } },
      lanes: [{ ...good, aggregate: "mean" }, other],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(manifest)));
    const active = await fetchActiveScenario();
    expect(active.rows).toEqual({ by: "region" });
    expect(active.fields).toEqual(manifest.fields);
    expect(validLanes(active.lanes, active.nodes)).toEqual([other]);
  });

  it("hides an entry with a word out of bounds, a kind that is not a timed node, or a value it does not know", () => {
    const bad: unknown[] = [
      { ...good, name: "n".repeat(25) },
      { ...good, label: "" },
      { ...good, unit: "u".repeat(17) },
      { ...good, kinds: ["order", "memo"] },
      { ...good, kinds: ["nothing"] },
      { ...good, kinds: [] },
      { ...good, kinds: "order" },
      { ...good, field: "" },
      { ...good, field: 3 },
      { ...good, bucket: "day" },
      { ...good, bucket: undefined },
      { ...good, aggregate: "mean" },
      { ...good, top: 0 },
      { ...good, top: -2 },
      { ...good, top: Number.POSITIVE_INFINITY },
      { ...good, id: "x".repeat(65) },
      { ...good, id: 12 },
      null,
      [],
      "lane",
    ];
    for (const entry of bad) expect(validLanes([entry, other], nodes), JSON.stringify(entry)).toEqual([other]);
  });

  it("trims the words and keeps a top above zero", () => {
    const [lane] = validLanes([{ ...good, name: "  Orders ", top: 12.5 }], nodes);
    expect(lane.name).toBe("Orders");
    expect(lane.top).toBe(12.5);
  });

  it("the first lane of an id is kept and a later one is left out; an id already taken is left out too", () => {
    expect(validLanes([good, { ...other, id: good.id }], nodes).map((l) => l.label)).toEqual(["Cost"]);
    expect(validLanes([good, other], nodes, ["worst-cost"]).map((l) => l.id)).toEqual(["cost-by-hour"]);
  });

  it("gives nothing for anything but a list", () => {
    for (const none of [undefined, null, "lanes", 3, { 0: good }]) expect(validLanes(none, nodes), String(none)).toEqual([]);
  });

  it("checks and returns a lane's id as trimmed: ' a' and 'a' are one id", () => {
    expect(validLanes([{ ...good, id: " a " }], nodes).map((l) => l.id)).toEqual(["a"]);
    // The first of the two is kept, and the second is a duplicate after trim.
    expect(validLanes([{ ...good, id: "a", label: "First" }, { ...other, id: " a" }], nodes).map((l) => l.label)).toEqual(["First"]);
    expect(validLanes([{ ...good, id: " a", label: "First" }, { ...other, id: "a" }], nodes).map((l) => l.label)).toEqual(["First"]);
  });

  it("holds a lane's id to 1 to 64 characters after trim, at both bounds", () => {
    const sixtyFour = "x".repeat(64);
    expect(validLanes([{ ...good, id: sixtyFour }], nodes).map((l) => l.id)).toEqual([sixtyFour]);
    // 64 characters that carry padding are 66 raw and still fit, and the id comes back without the padding.
    expect(validLanes([{ ...good, id: `  ${sixtyFour} ` }], nodes).map((l) => l.id)).toEqual([sixtyFour]);
    expect(validLanes([{ ...good, id: "x".repeat(65) }, other], nodes).map((l) => l.id)).toEqual(["worst-cost"]);
    expect(validLanes([{ ...good, id: ` ${"x".repeat(65)}` }, other], nodes).map((l) => l.id)).toEqual(["worst-cost"]);
    expect(validLanes([{ ...good, id: "   " }, other], nodes).map((l) => l.id)).toEqual(["worst-cost"]);
  });
});

describe("filterOf", () => {
  const base: ScenarioNode = {
    kind: "signin",
    label: "Sign-in",
    palette: "login",
    source: "signin.json",
    timestamp: "at",
    coords: { lat: "lat", lng: "lng" },
  };
  const withFilter = (filter: unknown): ScenarioNode => ({ ...base, filter }) as ScenarioNode;

  it("gives the field and its label, the label trimmed", () => {
    expect(filterOf(withFilter({ field: "network_type", label: "Network type" }))).toEqual({ field: "network_type", label: "Network type" });
    expect(filterOf(withFilter({ field: "network_type", label: "  Network type  " }))?.label).toBe("Network type");
  });

  it("gives a fresh object, not the manifest's", () => {
    const declared = { field: "network_type", label: "Network type" };
    const got = filterOf(withFilter(declared));
    expect(got).not.toBe(declared);
    expect(got).toEqual(declared);
  });

  it("is null for a node with no filter key", () => {
    expect(filterOf(base)).toBeNull();
  });

  it("is null for a field that is not a field name", () => {
    for (const field of ["", "1x", "a b", "a-b", "x".repeat(65), 5, null, undefined]) {
      expect(filterOf(withFilter({ field, label: "Label" })), String(field)).toBeNull();
    }
  });

  it("is null for the node's own timestamp field and for a coordinate field", () => {
    expect(filterOf(withFilter({ field: "at", label: "Time" }))).toBeNull();
    expect(filterOf(withFilter({ field: "lat", label: "Latitude" }))).toBeNull();
    expect(filterOf(withFilter({ field: "lng", label: "Longitude" }))).toBeNull();
    // With no timestamp or coords declared, those names are ordinary fields.
    expect(filterOf({ ...base, timestamp: undefined, coords: null, filter: { field: "at", label: "Time" } })).toEqual({ field: "at", label: "Time" });
  });

  it("is null for a label that is empty, blank, over 24 characters after trimming, or not text", () => {
    for (const label of ["", "   ", "x".repeat(25), 5, null, undefined]) {
      expect(filterOf(withFilter({ field: "network_type", label })), String(label)).toBeNull();
    }
    expect(filterOf(withFilter({ field: "network_type", label: "x".repeat(24) }))?.label).toBe("x".repeat(24));
    expect(filterOf(withFilter({ field: "network_type", label: ` ${"x".repeat(24)} ` }))?.label).toBe("x".repeat(24));
  });

  it("is null for a filter that is not an object", () => {
    for (const filter of ["network_type", 5, null, true, ["network_type", "Network type"]]) {
      expect(filterOf(withFilter(filter)), String(filter)).toBeNull();
    }
  });
});
