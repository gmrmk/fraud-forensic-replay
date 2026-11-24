/**
 * The static-build API adapter: the same URL to file rule as backend/static_keys.py
 * (checked against the shared vectors file), and one answer per request kind.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStaticFetch, fnv1a32, installStaticApi, staticPath } from "./static-api";

// The one file both implementations are checked against (written by the Python side).
const VECTORS: { url: string; path: string }[] = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../backend/tests/static_key_vectors.json",
    ),
    "utf8",
  ),
);

const INDEX = { default: "card-fraud", scenarios: ["card-fraud", "priya-ato"], build: "abc123def456" };
const SCENARIOS = [
  { id: "card-fraud", label: "Card" },
  { id: "priya-ato", label: "Account" },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** An adapter over a fake file server that records every URL it was asked for. */
function harness(stored: string | null = null) {
  const asked: string[] = [];
  const posted: unknown[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    return url.includes("missing") ? json({ detail: "Not Found" }, 404) : json({ from: url });
  });
  const staticFetch = createStaticFetch({
    base: "./",
    index: INDEX,
    scenarios: SCENARIOS,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    storage: { getItem: () => stored },
    channel: { postMessage: (m: unknown) => posted.push(m) },
  });
  return { staticFetch, asked, posted };
}

describe("the key contract", () => {
  it("matches the published FNV-1a anchors", () => {
    expect(fnv1a32("")).toBe("811c9dc5");
    expect(fnv1a32("a")).toBe("e40c292c");
    expect(fnv1a32("foobar")).toBe("bf9cf968");
  });

  it("agrees with the Python implementation on every shared vector", () => {
    expect(VECTORS.length).toBeGreaterThanOrEqual(8);
    for (const v of VECTORS) expect(staticPath(v.url), v.url).toBe(v.path);
  });

  it("ignores parameter order and space encoding", () => {
    expect(staticPath("/api/manager/members?dim=merchant_name&value=Alderlowe%20Fuel")).toBe(
      staticPath("/api/manager/members?value=Alderlowe+Fuel&dim=merchant_name"),
    );
  });

  it("rejects a URL outside the api", () => {
    expect(() => staticPath("/data/timezones.geojson")).toThrow();
    expect(() => staticPath("/api/")).toThrow();
  });
});

describe("the static fetch", () => {
  it("serves the scenario list and the active manifest from files", async () => {
    const { staticFetch, asked } = harness();
    await staticFetch("/api/scenarios");
    await staticFetch("/api/scenario");
    expect(asked).toEqual(["./static-api/scenarios.json", "./static-api/card-fraud/scenario/_.json"]);
  });

  it("reads case data under the stored scenario when the build ships it", async () => {
    const { staticFetch, asked } = harness("priya-ato");
    await staticFetch("/api/transactions?terminal_id=ZEL-7731042");
    expect(asked).toEqual([
      "./static-api/priya-ato/transactions/terminal_id=ZEL-7731042-1d7c5f1c.json",
    ]);
  });

  it("falls back to the default when the stored scenario is not in this build", async () => {
    const { staticFetch, asked } = harness("retired-pack");
    await staticFetch("/api/decisions");
    expect(asked).toEqual(["./static-api/card-fraud/decisions/_.json"]);
  });

  it("falls back to the default when reading the stored scenario throws", async () => {
    const asked: string[] = [];
    const staticFetch = createStaticFetch({
      base: "./",
      index: INDEX,
      scenarios: SCENARIOS,
      fetchImpl: (async (input: RequestInfo | URL) => {
        asked.push(String(input));
        return json({});
      }) as typeof fetch,
      storage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      channel: { postMessage: () => {} },
    });
    await staticFetch("/api/decisions");
    const health = await (await staticFetch("/api/health")).json();
    expect(asked).toEqual(["./static-api/card-fraud/decisions/_.json"]);
    expect(health.scenario).toBe("card-fraud");
  });

  describe("where storage names no shipped story, the page's address does", () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
    };
    /** An adapter given the page's address (its query string) and a storage; returns what it fetched. */
    async function open(search: string, storage: { getItem: () => string | null }) {
      const asked: string[] = [];
      const staticFetch = createStaticFetch({
        base: "./",
        index: INDEX,
        scenarios: SCENARIOS,
        fetchImpl: (async (input: RequestInfo | URL) => {
          asked.push(String(input));
          return json({});
        }) as typeof fetch,
        storage,
        search,
        channel: { postMessage: () => {} },
      });
      await staticFetch("/api/decisions");
      const health = await (await staticFetch("/api/health")).json();
      return { asked, health };
    }

    it.each([
      ["storage throws", blocked],
      ["storage holds nothing", { getItem: () => null }],
    ])("serves the story the address names when %s", async (_name, storage) => {
      const { asked, health } = await open("?scenario=priya-ato&theme=dark", storage);
      expect(asked).toEqual(["./static-api/priya-ato/decisions/_.json"]);
      expect(health.scenario).toBe("priya-ato");
    });

    it.each([
      ["storage throws", blocked],
      ["storage holds nothing", { getItem: () => null }],
    ])("serves the default story for an address naming a story the build does not ship when %s", async (_name, storage) => {
      const { asked, health } = await open("?scenario=retired-pack", storage);
      expect(asked).toEqual(["./static-api/card-fraud/decisions/_.json"]);
      expect(health.scenario).toBe("card-fraud");
    });

    it("serves the default story for an address with no story, and for an unreadable one", async () => {
      expect((await open("", blocked)).health.scenario).toBe("card-fraud");
      expect((await open("?theme=dark", blocked)).health.scenario).toBe("card-fraud");
    });

    it("lets a shipped story in storage win over the address, as it does today", async () => {
      expect((await open("?scenario=card-fraud", { getItem: () => "priya-ato" })).health.scenario).toBe("priya-ato");
      expect((await open("?scenario=priya-ato", { getItem: () => "card-fraud" })).health.scenario).toBe("card-fraud");
    });

    it("falls through to the address when storage holds a story the build does not ship", async () => {
      expect((await open("?scenario=priya-ato", { getItem: () => "retired-pack" })).health.scenario).toBe("priya-ato");
    });
  });

  it("keeps the story it was made with when storage changes later in the page", async () => {
    let stored = "card-fraud";
    const asked: string[] = [];
    const staticFetch = createStaticFetch({
      base: "./",
      index: INDEX,
      scenarios: SCENARIOS,
      fetchImpl: (async (input: RequestInfo | URL) => {
        asked.push(String(input));
        return json({});
      }) as typeof fetch,
      storage: { getItem: () => stored },
      channel: { postMessage: () => {} },
    });
    stored = "priya-ato";
    await staticFetch("/api/decisions");
    const health = await (await staticFetch("/api/health")).json();
    expect(asked).toEqual(["./static-api/card-fraud/decisions/_.json"]);
    expect(health.scenario).toBe("card-fraud");
  });

  it("answers a scenario switch without a server", async () => {
    const { staticFetch, asked } = harness();
    const ok = await staticFetch("/api/scenario/select", {
      method: "POST",
      body: JSON.stringify({ id: "priya-ato" }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ id: "priya-ato", label: "Account" });

    const unknown = await staticFetch("/api/scenario/select", {
      method: "POST",
      body: JSON.stringify({ id: "no-such-pack" }),
    });
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).detail).toMatch(/unknown scenario/);
    expect(asked).toEqual([]);
  });

  it("reports health with the build id as its boot id", async () => {
    const { staticFetch } = harness("priya-ato");
    const health = await (await staticFetch("/api/health")).json();
    expect(health).toEqual({ status: "ok", boot_id: "static-abc123def456", scenario: "priya-ato" });
  });

  it("relays the playhead over the clock channel", async () => {
    const { staticFetch, posted, asked } = harness();
    const res = await staticFetch("/api/clock", {
      method: "POST",
      body: JSON.stringify({ t: 1780000000000, playing: true, rate: 2 }),
    });
    expect(res.status).toBe(200);
    expect(posted).toEqual([{ t: 1780000000000, playing: true, rate: 2 }]);
    expect(asked).toEqual([]);
  });

  it("replays the last playhead to a tab that says hello", async () => {
    // The backend relay remembered the last playhead for a late customer tab. The
    // channel does not, so the adapter answers a hello with what it last published.
    const posted: unknown[] = [];
    const channel = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage: (m: unknown) => posted.push(m),
    };
    const staticFetch = createStaticFetch({
      base: "./",
      index: INDEX,
      scenarios: SCENARIOS,
      fetchImpl: (async () => json({})) as typeof fetch,
      storage: { getItem: () => null },
      channel,
    });

    channel.onmessage?.({ data: { type: "hello" } });
    expect(posted).toEqual([]); // nothing published yet: stay quiet

    const clock = { t: 1780000000000, playing: false, rate: 1 };
    await staticFetch("/api/clock", { method: "POST", body: JSON.stringify(clock) });
    channel.onmessage?.({ data: { type: "hello" } });
    channel.onmessage?.({ data: { type: "something-else" } });
    expect(posted).toEqual([clock, clock]);
  });

  it("serves no places", async () => {
    const { staticFetch, asked } = harness();
    expect(await (await staticFetch("/api/places")).json()).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("passes a missing file through as a failed response, never as empty data", async () => {
    const { staticFetch } = harness();
    const res = await staticFetch("/api/entities?kind=missing");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
  });

  it("refuses other writes", async () => {
    const { staticFetch } = harness();
    const res = await staticFetch("/api/transactions", { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  it("leaves requests outside the api alone", async () => {
    const { staticFetch, asked } = harness();
    await staticFetch("./data/timezones.geojson");
    expect(asked).toEqual(["./data/timezones.geojson"]);
  });
});

describe("installStaticApi", () => {
  it("loads the index and the scenario list, then replaces fetch on the target", async () => {
    const asked: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      asked.push(url);
      if (url.endsWith("index.json")) return json(INDEX);
      if (url.endsWith("scenarios.json")) return json(SCENARIOS);
      return json({ from: url });
    }) as typeof fetch;
    const target = { fetch: fetchImpl };

    await installStaticApi({
      base: "./",
      fetchImpl,
      storage: { getItem: () => null },
      channel: { postMessage: () => {} },
      target,
    });

    expect(asked.sort()).toEqual(["./static-api/index.json", "./static-api/scenarios.json"]);
    expect(target.fetch).not.toBe(fetchImpl);
    const health = await (await target.fetch("/api/health")).json();
    expect(health.boot_id).toBe("static-abc123def456");
  });

  /** An install over the fake export that reads the browser's own storage (no `storage` option). */
  async function installOnDefaultStorage() {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("index.json")) return json(INDEX);
      if (url.endsWith("scenarios.json")) return json(SCENARIOS);
      return json({ from: url });
    }) as typeof fetch;
    const target = { fetch: fetchImpl };
    await installStaticApi({
      base: "./",
      fetchImpl,
      channel: { postMessage: () => {} },
      target,
    });
    return target;
  }

  it("opens on the default story where touching the browser's storage throws", async () => {
    const own = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      const target = await installOnDefaultStorage();
      const health = await (await target.fetch("/api/health")).json();
      expect(health.scenario).toBe("card-fraud");
    } finally {
      if (own) Object.defineProperty(globalThis, "localStorage", own);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });

  it("opens on the story the page's own address names where touching the browser's storage throws", async () => {
    const own = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    window.location.search = "?scenario=priya-ato";
    try {
      const target = await installOnDefaultStorage();
      const health = await (await target.fetch("/api/health")).json();
      expect(health.scenario).toBe("priya-ato");
    } finally {
      window.location.href = "http://localhost/";
      if (own) Object.defineProperty(globalThis, "localStorage", own);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });

  it("honours a story stored in the browser's storage when storage works", async () => {
    localStorage.setItem("ffr.scenario", "priya-ato");
    try {
      const target = await installOnDefaultStorage();
      const health = await (await target.fetch("/api/health")).json();
      expect(health.scenario).toBe("priya-ato");
    } finally {
      localStorage.clear();
    }
  });

  it("fails loudly when the export is absent", async () => {
    const fetchImpl = (async () => json({ detail: "Not Found" }, 404)) as typeof fetch;
    await expect(
      installStaticApi({
        base: "./",
        fetchImpl,
        storage: { getItem: () => null },
        channel: { postMessage: () => {} },
        target: { fetch: fetchImpl },
      }),
    ).rejects.toThrow(/static export/);
  });
});
