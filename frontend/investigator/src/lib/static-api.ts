/**
 * Static-build API adapter.
 *
 * A static build has no backend. backend/export_static.py writes every response the
 * app requests to a file; this module answers `/api/*` requests from those files. It
 * is installed once, at the app boundary (main.tsx), and only when the build sets
 * VITE_STATIC=1. No call site knows it exists, and dev mode never loads it.
 *
 * `staticPath` is the twin of backend/static_keys.py. Both are checked against
 * backend/tests/static_key_vectors.json, the one place the rule is pinned.
 */

const API_PREFIX = "/api/";
const SLUG_MAX = 48;
const UNSAFE = /[^A-Za-z0-9._=-]/g;
/** The scenario preference key lib/scenarios.ts already persists. */
const SCENARIO_PREF_KEY = "ffr.scenario";
/** The playhead relay to the customer app (same origin, static builds only). */
export const CLOCK_CHANNEL = "ffr-clock";

export interface StaticIndex {
  default: string;
  scenarios: string[];
  build: string;
}

export interface StaticScenario {
  id: string;
  label: string;
}

/** The part of BroadcastChannel the adapter uses. */
export interface ClockChannel {
  onmessage?: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
}

/** A real BroadcastChannel, narrowed to ClockChannel (its event carries far more than data). */
function openBroadcast(): ClockChannel {
  const broadcast = new BroadcastChannel(CLOCK_CHANNEL);
  const channel: ClockChannel = {
    onmessage: null,
    postMessage: (message) => broadcast.postMessage(message),
  };
  broadcast.onmessage = (event: MessageEvent<unknown>) => channel.onmessage?.({ data: event.data });
  return channel;
}

function isHello(data: unknown): boolean {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === "hello";
}

export interface StaticFetchContext {
  /** Vite's BASE_URL ("./" in a static build). */
  base: string;
  index: StaticIndex;
  scenarios: StaticScenario[];
  fetchImpl: typeof fetch;
  storage: Pick<Storage, "getItem">;
  /** The page's address (its query string). Where storage names no shipped story, its `scenario`
   *  parameter does: a pick or a link reaches the adapter this way in a browser that blocks site data. */
  search?: string;
  channel: ClockChannel;
}

/** FNV-1a, 32-bit, over the UTF-8 bytes of `text`, as 8 lowercase hex digits. */
export function fnv1a32(text: string): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The export file for one request, relative to the scenario directory. */
export function staticPath(url: string): string {
  const parsed = new URL(url, "http://static.invalid");
  const route = parsed.pathname.slice(API_PREFIX.length).replace(/^\/+|\/+$/g, "");
  if (!parsed.pathname.startsWith(API_PREFIX) || route === "") {
    throw new Error(`not an /api/ request: ${url}`);
  }
  // ponytail: sorted by UTF-16 code unit; Python sorts by code point. The two agree for
  // every id this app uses (ASCII). Astral characters in a query would need a shared rule.
  const pairs = [...parsed.searchParams.entries()].sort(
    ([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0),
  );
  const dir = route.replaceAll("/", "__");
  if (pairs.length === 0) return `${dir}/_.json`;
  const canon = pairs.map(([k, v]) => `${k}=${v}`).join("&");
  const slug = canon.replace(UNSAFE, "_").slice(0, SLUG_MAX);
  return `${dir}/${slug}-${fnv1a32(canon)}.json`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(init.body);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The `fetch` a static build uses: `/api/*` from files, everything else untouched. */
export function createStaticFetch(ctx: StaticFetchContext): typeof fetch {
  const root = `${ctx.base}static-api/`;
  const shipped = new Map(ctx.scenarios.map((s) => [s.id, s]));

  // Resolved once: every story pick reloads the page and makes a new adapter, so a page reads the
  // story it opened on even when storage names another one later (a reload the visitor cancelled).
  const active = ((): string => {
    let stored: string | null = null;
    try {
      stored = ctx.storage.getItem(SCENARIO_PREF_KEY);
    } catch {
      // Blocked storage reads as nothing stored: the address, then the default story, decide.
    }
    if (stored !== null && shipped.has(stored)) return stored;
    const linked = new URLSearchParams(ctx.search ?? "").get("scenario");
    return linked !== null && shipped.has(linked) ? linked : ctx.index.default;
  })();

  // The backend relay remembered the last playhead for a customer tab that opened late.
  // A channel has no memory, so a tab that says hello is answered with the last one sent.
  let lastClock: Record<string, unknown> | null = null;
  ctx.channel.onmessage = (event) => {
    if (lastClock !== null && isHello(event.data)) ctx.channel.postMessage(lastClock);
  };

  return async (input, init) => {
    const url = requestUrl(input);
    const path = new URL(url, "http://static.invalid").pathname;
    if (!path.startsWith(API_PREFIX)) return ctx.fetchImpl(input, init);

    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST" && path === "/api/scenario/select") {
      const id = parseBody(init).id;
      const scenario = typeof id === "string" ? shipped.get(id) : undefined;
      return scenario
        ? jsonResponse({ id: scenario.id, label: scenario.label })
        : jsonResponse({ detail: `unknown scenario: ${String(id)}` }, 400);
    }
    if (method === "POST" && path === "/api/clock") {
      lastClock = parseBody(init);
      ctx.channel.postMessage(lastClock);
      return jsonResponse({});
    }
    if (method !== "GET") return jsonResponse({ detail: "the static build is read-only" }, 405);

    if (path === "/api/scenarios") return ctx.fetchImpl(`${root}scenarios.json`);
    if (path === "/api/health") {
      return jsonResponse({ status: "ok", boot_id: `static-${ctx.index.build}`, scenario: active });
    }
    // Places are not part of the static build (the cache names real businesses).
    if (path === "/api/places") return jsonResponse([]);
    // A missing file comes back as its 404, so the caller reports an error, not empty data.
    return ctx.fetchImpl(`${root}${active}/${staticPath(url)}`);
  };
}

export interface InstallOptions {
  base: string;
  fetchImpl?: typeof fetch;
  storage?: Pick<Storage, "getItem">;
  /** The page's query string; the page's own address when not given. */
  search?: string;
  channel?: ClockChannel;
  /** Where `fetch` is replaced; the global object outside tests. */
  target?: { fetch: typeof fetch };
}

async function loadJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`static export not found at ${url} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

/** Load the export's index, then answer every later `/api/*` request from files. */
export async function installStaticApi(opts: InstallOptions): Promise<void> {
  const target = opts.target ?? globalThis;
  const fetchImpl = opts.fetchImpl ?? target.fetch.bind(target);
  const root = `${opts.base}static-api/`;
  const [index, scenarios] = await Promise.all([
    loadJson<StaticIndex>(fetchImpl, `${root}index.json`),
    loadJson<StaticScenario[]>(fetchImpl, `${root}scenarios.json`),
  ]);
  // Resolved inside a try, because merely touching `localStorage` can throw (site data blocked).
  let storage: Pick<Storage, "getItem">;
  try {
    storage = opts.storage ?? localStorage;
  } catch {
    storage = { getItem: () => null };
  }
  target.fetch = createStaticFetch({
    base: opts.base,
    index,
    scenarios,
    fetchImpl,
    storage,
    search: opts.search ?? globalThis.location?.search ?? "",
    channel: opts.channel ?? openBroadcast(),
  });
}
