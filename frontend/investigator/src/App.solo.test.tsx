import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import appSource from "./App.tsx?raw";
import App from "./App";
import { LayerPanels } from "./components/LayerPanels";
import { kindSwitchWords } from "./lib/tooltip-words/layers";
import { useSolo } from "./store/solo";
import { useSchema } from "./store/schema";
import { usePlayhead } from "./store/playhead";
import { useDecisionData } from "./store/decision-data";
import type { ScenarioNode } from "./lib/scenarios";

// A solo is one derivation in App: the soloed value narrows what the globe, the layer counts, the
// paths and the ticker are given, and nothing else. The decisions still reach the reached list
// from the whole case, and `entitiesByKind` is not filtered here. App is mounted with its
// children replaced by stubs that record the props they were given, so the test reads the
// arrays App passes and not the pixels.

interface Rows {
  id: string;
}
interface Seen {
  globe: { transactions: Rows[]; logins: Rows[]; genericEntities: Rows[]; paths: { kind: string; nodes: unknown[] }[] } | null;
  stack: { transactions: Rows[]; logins: Rows[]; accountEvents: Rows[]; transfers: Rows[]; tickerItems: Rows[] } | null;
  menus: { transactions: Rows[]; visibleTransactions: Rows[]; visibleLogins: Rows[]; logins: Rows[] } | null;
  decisions: unknown[];
}
const seen = vi.hoisted<Seen>(() => ({ globe: null, stack: null, menus: null, decisions: [] }));

vi.mock("./components/MapRecovery", () => ({
  RecoveringGlobeMap: (p: NonNullable<Seen["globe"]>) => {
    seen.globe = p;
    return null;
  },
}));
vi.mock("./components/CaseBottomStack", () => ({
  CaseBottomStack: (p: NonNullable<Seen["stack"]>) => {
    seen.stack = p;
    return null;
  },
}));
vi.mock("./components/MapMenus", () => ({
  MapMenus: (p: NonNullable<Seen["menus"]>) => {
    seen.menus = p;
    return null;
  },
}));
vi.mock("./store/decisions", () => ({ useDecisions: () => ({ decisions: seen.decisions, error: null }) }));
// The rest of the module stays real, so the Layers menu itself can be drawn from the props App gives it.
vi.mock("./components/ui", async (original) => ({
  ...(await original<typeof import("./components/ui")>()),
  Panel: ({ children }: { children?: ReactNode }) => children ?? null,
  Eyebrow: () => null,
}));
vi.mock("./components/Inspector", () => ({ Inspector: () => null }));
vi.mock("./components/ScenarioSwitcher", () => ({ ScenarioSwitcher: () => null }));
vi.mock("./components/StalenessBanner", () => ({ StalenessBanner: () => null }));
vi.mock("./components/DataErrors", () => ({ DataErrors: () => null }));
vi.mock("./components/SrAnnouncer", () => ({ SrAnnouncer: () => null }));
vi.mock("./components/NarrativeLog", () => ({ NarrativeLog: () => null }));
vi.mock("./components/pivot/PivotWindowsLayer", () => ({ PivotWindowsLayer: () => null }));
vi.mock("./components/match/MatchesTable", () => ({ MatchesTable: () => null }));
vi.mock("./components/inspector/AuthInspector", () => ({ AuthInspector: () => null }));
vi.mock("./components/inspector/FraudInspector", () => ({ FraudInspector: () => null }));
vi.mock("./components/inspector/LoginInspector", () => ({ LoginInspector: () => null }));
vi.mock("./components/inspector/PlaceInspector", () => ({ PlaceInspector: () => null }));
vi.mock("./components/inspector/AccountEventInspector", () => ({ AccountEventInspector: () => null }));
vi.mock("./components/inspector/TransferInspector", () => ({ TransferInspector: () => null }));
vi.mock("./components/notes-menu/NotesMenu", () => ({ NotesMenu: () => null }));
vi.mock("./components/ThemeSwitcher", () => ({ ThemeSwitcher: () => null }));
vi.mock("./components/timeline/usePlaybackDriver", () => ({ usePlaybackDriver: () => {} }));
vi.mock("./components/MapCredit", () => ({ MapCredit: () => null }));
vi.mock("./hooks/usePublishClock", () => ({ usePublishClock: () => {} }));
vi.mock("./hooks/useShareLink", () => ({
  linkHoldsCamera: false,
  linkOpensCase: () => false,
  useShareLink: () => {},
}));

const node = (kind: string): ScenarioNode => ({
  kind,
  label: kind,
  palette: kind,
  source: kind,
  timestamp: "timestamp",
  primary: "${id}",
  secondary: "${id}",
});
const NODES = ["auth", "fraud", "login", "account_event", "transfer"].map(node);

const tx = (id: string, merchant: string, fraud: number, time: string, lng: number) => ({
  id,
  card_id: "card-1",
  account_id: "acct-1",
  timestamp: `2026-05-20T${time}:00Z`,
  amount: 10,
  merchant_name: merchant,
  merchant_lat: 6.4,
  merchant_lng: lng,
  merchant_country: "NG",
  mcc: "6011",
  category: "cash",
  is_fraud: fraud,
});
const login = (id: string, session: string, time: string) => ({
  id,
  account_id: "acct-1",
  timestamp: `2026-05-20T${time}:00Z`,
  ip_lat: 51.5,
  ip_lng: -0.1,
  device_fp: `dev-${id}`,
  session_id: session,
  outcome: "success",
});
const DATA: Record<string, unknown[]> = {
  "/api/transactions": [
    tx("a1", "Cobstead Grocers Bunker Hill", 0, "09:00", 3.4),
    tx("f1", "Lekki ATM", 1, "10:00", 3.5),
    tx("f2", "Lekki ATM", 1, "11:00", 3.6),
    tx("f3", "Cobstead Grocers Bunker Hill", 1, "12:00", 3.7),
  ],
  "/api/logins": [login("l1", "S1", "08:00"), login("l2", "S2", "08:30")],
  "/api/account_events": [
    { id: "e1", account_id: "acct-1", timestamp: "2026-05-20T08:10:00Z", kind: "payee_add", field: null, old_value: null, new_value: null, payee_id: "p1", session_id: "S1", is_fraud: 1 },
  ],
  "/api/transfers": [
    { id: "x1", account_id: "acct-1", timestamp: "2026-05-20T08:20:00Z", amount: 5, payee_id: "p1", rail: "wire", status: "sent", decline_reason: null, session_id: "S1", is_fraud: 1 },
    { id: "x2", account_id: "acct-1", timestamp: "2026-05-20T08:40:00Z", amount: 6, payee_id: "p1", rail: "wire", status: "sent", decline_reason: null, session_id: "S2", is_fraud: 1 },
  ],
};
const ALL_TICKER = ["a1", "f1", "f2", "f3", "l1", "l2", "e1", "x1", "x2"];

const ids = (rows: Rows[] | undefined) => (rows ?? []).map((r) => r.id).sort();
const decision = (id: string, trigger: string) => ({
  id,
  rule: { id: "r", label: "r", kind: "rule" },
  subjectPathKind: "fraud",
  triggerEntityIds: [trigger],
  inputs: [],
  thresholds: [],
  verdict: "v",
  decision: "FLAG",
  evidence: [],
  severity: 1,
});

async function mounted() {
  render(<App />);
  await waitFor(() => expect(seen.globe?.transactions).toHaveLength(4));
  await waitFor(() => expect(seen.stack?.tickerItems.length).toBe(ALL_TICKER.length));
}
const solo = (field: string, value: string) => act(() => useSolo.getState().toggle(field, value));

beforeEach(() => {
  seen.globe = null;
  seen.stack = null;
  seen.menus = null;
  seen.decisions = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => DATA[String(input).split("?")[0]] ?? [],
    })),
  );
  useSolo.setState({ solo: null });
  useDecisionData.setState({ reached: [] });
  usePlayhead.setState({ playhead: 0, minTime: 0, maxTime: 0, windowMin: 0, windowMax: 0, opening: null });
  useSchema.getState().setActive("solo-test", NODES);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App: with no solo nothing is narrowed", () => {
  it("gives the globe, the layer counts and the ticker the whole case", async () => {
    await mounted();
    expect(ids(seen.globe?.transactions)).toEqual(["a1", "f1", "f2", "f3"]);
    expect(ids(seen.globe?.logins)).toEqual(["l1", "l2"]);
    expect(ids(seen.menus?.visibleTransactions)).toEqual(["a1", "f1", "f2", "f3"]);
    expect(ids(seen.stack?.tickerItems)).toEqual([...ALL_TICKER].sort());
    expect(seen.globe?.paths.find((p) => p.kind === "fraud")?.nodes).toHaveLength(3);
  });
});

describe("App: a soloed value narrows the globe and the ticker", () => {
  it("a merchant solo keeps that merchant's transactions on the globe, in the counts, on the paths and in the ticker", async () => {
    await mounted();
    await solo("merchant_name", "Lekki ATM");
    expect(ids(seen.globe?.transactions)).toEqual(["f1", "f2"]);
    expect(ids(seen.globe?.logins)).toEqual([]);
    expect(ids(seen.menus?.visibleTransactions)).toEqual(["f1", "f2"]);
    expect(ids(seen.menus?.visibleLogins)).toEqual([]);
    expect(ids(seen.stack?.tickerItems)).toEqual(["f1", "f2"]);
    expect(seen.globe?.paths.find((p) => p.kind === "fraud")?.nodes).toHaveLength(2);
  });

  it("a session solo narrows sign-ins, account events and transfers in the ticker", async () => {
    await mounted();
    await solo("session_id", "S1");
    expect(ids(seen.globe?.logins)).toEqual(["l1"]);
    expect(ids(seen.globe?.transactions)).toEqual([]);
    expect(ids(seen.stack?.tickerItems)).toEqual(["e1", "l1", "x1"]);
  });

  it("clearing the solo gives everything back", async () => {
    await mounted();
    await solo("merchant_name", "Lekki ATM");
    await act(async () => useSolo.getState().clear());
    expect(ids(seen.globe?.transactions)).toEqual(["a1", "f1", "f2", "f3"]);
    expect(ids(seen.stack?.tickerItems)).toEqual([...ALL_TICKER].sort());
    expect(seen.globe?.paths.find((p) => p.kind === "fraud")?.nodes).toHaveLength(3);
  });
});

describe("App: a soloed value narrows the Layers menu's manifest kinds", () => {
  it("gives the menu the soloed manifest records to count and the whole lists for the totals", async () => {
    const widget: ScenarioNode = { ...node("widget"), source: "sql", query: "q", pivotable: ["session_id"] };
    const rows = [
      { id: "w1", timestamp: "2026-05-20T08:05:00Z", session_id: "S1" },
      { id: "w2", timestamp: "2026-05-20T08:35:00Z", session_id: "S2" },
    ];
    const read = fetch as unknown as { mockImplementation: (f: (input: RequestInfo | URL) => unknown) => void };
    read.mockImplementation(async (input) => {
      const path = String(input).split("?")[0];
      return { ok: true, status: 200, json: async () => (path === "/api/entities" ? rows : (DATA[path] ?? [])) };
    });
    useSchema.getState().setActive("solo-test", [...NODES, widget]);
    render(<App />);
    const menus = () => seen.menus as unknown as { genericByKind?: Record<string, Rows[]>; soloEntities?: Rows[] };
    await waitFor(() => expect(ids(menus().genericByKind?.widget)).toEqual(["w1", "w2"]));
    await solo("session_id", "S1");
    expect(ids(menus().soloEntities)).toEqual(["w1"]);
    expect(ids(menus().genericByKind?.widget)).toEqual(["w1", "w2"]);
  });

  it("counts a placed decision as reached when the solo keeps the event it works, as the map keeps its capsule", async () => {
    // The decision pivots on the card, not on the merchant the solo names, so the solo does not keep it by its fields.
    const ruling: ScenarioNode = {
      ...node("ruling"),
      label: "Ruling",
      source: "sql",
      query: "q",
      coords: { lat: "lat", lng: "lng" },
      pivotable: ["card_id"],
      decision: { status: "status", outcome: "status", note: "status", actor: "status", target: "status", key: "card_id", event: "event_id" },
    };
    const rows = [
      { id: "r1", timestamp: "2026-05-20T10:30:00Z", lat: 6.4, lng: 3.5, card_id: "card-1", status: "FAIL", event_id: "f1" },
      { id: "r2", timestamp: "2026-05-20T12:30:00Z", lat: 6.4, lng: 3.7, card_id: "card-1", status: "PASS", event_id: "f3" },
    ];
    const read = fetch as unknown as { mockImplementation: (f: (input: RequestInfo | URL) => unknown) => void };
    read.mockImplementation(async (input) => {
      const path = String(input).split("?")[0];
      return { ok: true, status: 200, json: async () => (path === "/api/entities" ? rows : (DATA[path] ?? [])) };
    });
    useSchema.getState().setActive("solo-test", [...NODES, ruling]);
    render(<App />);
    const menus = () => seen.menus as unknown as ComponentProps<typeof LayerPanels>;
    await waitFor(() => expect(ids(menus().genericByKind?.ruling)).toEqual(["r1", "r2"]));
    await solo("merchant_name", "Lekki ATM");
    // The menu is drawn from what App gives it; the stores it reads are the ones App filled.
    const menu = render(<LayerPanels {...menus()} />);
    // The row is found by its tooltip, since the label's own element is a stub in this file.
    const row = within(menu.container)
      .getAllByRole("button")
      .find((b) => b.getAttribute("data-tip") === kindSwitchWords("Ruling").join("\n"));
    expect(row?.textContent).toContain("1 / 2");
  });
});

describe("App: what a solo does not narrow", () => {
  it("keeps the full lists in the layer menu's totals and in the Timeline's data", async () => {
    await mounted();
    await solo("merchant_name", "Lekki ATM");
    expect(ids(seen.menus?.transactions)).toEqual(["a1", "f1", "f2", "f3"]);
    expect(ids(seen.menus?.logins)).toEqual(["l1", "l2"]);
    expect(ids(seen.stack?.transactions)).toEqual(["a1", "f1", "f2", "f3"]);
    expect(ids(seen.stack?.logins)).toEqual(["l1", "l2"]);
    expect(ids(seen.stack?.accountEvents)).toEqual(["e1"]);
    expect(ids(seen.stack?.transfers)).toEqual(["x1", "x2"]);
  });

  it("a decision whose trigger is outside the solo still reaches the reached list", async () => {
    seen.decisions = [decision("d-in", "f1"), decision("d-out", "f3")];
    await mounted();
    await waitFor(() => expect(useDecisionData.getState().reached.map((d) => d.id).sort()).toEqual(["d-in", "d-out"]));
    await solo("merchant_name", "Lekki ATM");
    expect(useDecisionData.getState().reached.map((d) => d.id).sort()).toEqual(["d-in", "d-out"]);
  });

  it("feeds reachedDecisions and the opening focus from the unfiltered entitiesByKind", () => {
    expect(appSource).toMatch(/reachedDecisions\(decisions, playhead, entitiesByKind\)/);
    expect(appSource).toMatch(/bootFocusEntity\(decisions, caseRows, entitiesByKind, maxTime\)/);
  });
});
