import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import appSource from "./App.tsx?raw";
import App from "./App";
import { useSolo } from "./store/solo";
import { useSchema } from "./store/schema";
import { usePlayhead } from "./store/playhead";
import { useLayers } from "./store/layers";
import { useSelection } from "./store/selection";
import { useDecisionData } from "./store/decision-data";
import type { ScenarioNode } from "./lib/scenarios";
import type { LoginEvent, Transaction } from "./types";

// The Layers switches are one derivation in App, after the solo: a switched-off kind or value leaves
// what the globe, the ticker, the paths and the card counts are given, and nothing else. Matches, the
// Timeline's data (it narrows itself), the Layers menu's whole lists, the reached decisions and the
// opening focus stay whole. App is mounted with its children replaced by stubs that record the props
// they were given, so the test reads the arrays App passes and not the pixels. PIN_WINS is false
// before item 1, so nothing here asserts that a pin keeps a record on.

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
vi.mock("./components/ui", () => ({
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
const CARD_NODES = ["auth", "fraud", "login", "account_event", "transfer"].map(node);
// A manifest kind outside the seed schema: it is read through /api/entities and placed by its coords.
const WIDGET: ScenarioNode = {
  kind: "widget", label: "Widget", palette: "#66ccff", source: "sql", query: "q", timestamp: "timestamp",
  primary: "${id}", secondary: "${id}", coords: { lat: "y", lng: "x" },
};

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
const WIDGET_ROWS = [{ id: "w1", timestamp: "2026-05-20T09:30:00Z", y: 6.5, x: 3.4 }];
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
const layers = (over: Partial<ReturnType<typeof useLayers.getState>>) => act(() => useLayers.setState(over));

beforeEach(() => {
  seen.globe = null;
  seen.stack = null;
  seen.menus = null;
  seen.decisions = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const path = url.split("?")[0];
      const body = path === "/api/entities" && new URL(url, "http://x").searchParams.get("kind") === "widget" ? WIDGET_ROWS : (DATA[path] ?? []);
      return { ok: true, status: 200, json: async () => body };
    }),
  );
  useSolo.setState({ solo: null });
  useDecisionData.setState({ reached: [] });
  useLayers.setState({ showAuths: true, showLogins: true, hiddenKinds: [], hiddenValues: {}, yoursOn: false });
  useSelection.setState({ selected: null });
  usePlayhead.setState({ playhead: 0, minTime: 0, maxTime: 0, windowMin: 0, windowMax: 0, opening: null });
  useSchema.getState().setActive("layers-test", CARD_NODES);
});
afterEach(() => {
  vi.unstubAllGlobals();
  useLayers.setState({ showAuths: true, showLogins: true, hiddenKinds: [], hiddenValues: {}, yoursOn: false });
});

describe("App: with nothing switched off nothing is narrowed", () => {
  it("gives the globe, the layer counts and the ticker the whole case, as with no switch at all", async () => {
    await mounted();
    expect(ids(seen.globe?.transactions)).toEqual(["a1", "f1", "f2", "f3"]);
    expect(ids(seen.globe?.logins)).toEqual(["l1", "l2"]);
    expect(ids(seen.menus?.visibleTransactions)).toEqual(["a1", "f1", "f2", "f3"]);
    expect(ids(seen.stack?.tickerItems)).toEqual([...ALL_TICKER].sort());
    expect(seen.globe?.paths.find((p) => p.kind === "fraud")?.nodes).toHaveLength(3);
  });
});

describe("App: a switched-off kind leaves the globe, the counts, the paths and the ticker", () => {
  it("Authorizations off: no transaction on the globe, in the card counts or in the ticker, and no fraud path", async () => {
    await mounted();
    await layers({ showAuths: false });
    expect(ids(seen.globe?.transactions)).toEqual([]);
    expect(ids(seen.menus?.visibleTransactions)).toEqual([]);
    const ticker = ids(seen.stack?.tickerItems);
    for (const id of ["a1", "f1", "f2", "f3"]) expect(ticker).not.toContain(id);
    expect(ticker).toEqual(["e1", "l1", "l2", "x1", "x2"]);
    expect(seen.globe?.paths.find((p) => p.kind === "fraud")).toBeUndefined();
  });

  it("Logins off: no sign-in on the globe or in the ticker, and the transactions stay", async () => {
    await mounted();
    await layers({ showLogins: false });
    expect(ids(seen.globe?.logins)).toEqual([]);
    expect(ids(seen.menus?.visibleLogins)).toEqual([]);
    const ticker = ids(seen.stack?.tickerItems);
    expect(ticker).not.toContain("l1");
    expect(ticker).not.toContain("l2");
    expect(ids(seen.globe?.transactions)).toEqual(["a1", "f1", "f2", "f3"]);
  });

  it("a merchant solo and Authorizations off leaves nothing of the transactions on the globe", async () => {
    await mounted();
    await solo("merchant_name", "Lekki ATM");
    expect(ids(seen.globe?.transactions)).toEqual(["f1", "f2"]);
    await layers({ showAuths: false });
    expect(ids(seen.globe?.transactions)).toEqual([]);
    expect(ids(seen.menus?.visibleTransactions)).toEqual([]);
  });

  it("switching it back on gives the records back", async () => {
    await mounted();
    await layers({ showAuths: false });
    await layers({ showAuths: true });
    expect(ids(seen.globe?.transactions)).toEqual(["a1", "f1", "f2", "f3"]);
    expect(seen.globe?.paths.find((p) => p.kind === "fraud")?.nodes).toHaveLength(3);
  });
});

describe("App: what the switches do not narrow", () => {
  it("keeps the full lists in the layer menu's totals and in the Timeline's data", async () => {
    await mounted();
    await layers({ showAuths: false });
    expect(ids(seen.menus?.transactions)).toEqual(["a1", "f1", "f2", "f3"]);
    expect(ids(seen.menus?.logins)).toEqual(["l1", "l2"]);
    expect(ids(seen.stack?.transactions)).toEqual(["a1", "f1", "f2", "f3"]);
    expect(ids(seen.stack?.logins)).toEqual(["l1", "l2"]);
    expect(ids(seen.stack?.accountEvents)).toEqual(["e1"]);
    expect(ids(seen.stack?.transfers)).toEqual(["x1", "x2"]);
  });

  it("a decision whose trigger is a switched-off record still reaches the reached list", async () => {
    seen.decisions = [decision("d-in", "f1"), decision("d-out", "f3")];
    await mounted();
    await waitFor(() => expect(useDecisionData.getState().reached.map((d) => d.id).sort()).toEqual(["d-in", "d-out"]));
    await layers({ showAuths: false });
    expect(useDecisionData.getState().reached.map((d) => d.id).sort()).toEqual(["d-in", "d-out"]);
  });

  it("feeds Matches, the windows and the notes' lookup from the whole case", () => {
    expect(appSource).toMatch(/<MatchesTable context=\{matchContext\}/);
    expect(appSource).toMatch(/<PivotWindowsLayer map=\{mapInstance\} decisions=\{decisions\} context=\{matchContext\}/);
    expect(appSource).toMatch(/lookupFromContext\(matchContext\)/);
  });
});

describe("App: the selected record stays in the lists while its kind is off", () => {
  // The model's one function keeps the selected record against every switch, so what App hands the globe and the ticker holds that record and nothing else of its kind.
  // The globe's card layers must then draw the list as given (components/GlobeMap.layers.test.ts).
  it("Authorizations off with one transaction selected: the globe list and the ticker hold that transaction only", async () => {
    await mounted();
    const f1 = seen.globe?.transactions.find((t) => t.id === "f1") as unknown as Transaction;
    act(() => useSelection.getState().selectTransaction(f1));
    await layers({ showAuths: false });
    expect(ids(seen.globe?.transactions)).toEqual(["f1"]);
    expect(ids(seen.menus?.visibleTransactions)).toEqual(["f1"]);
    const ticker = ids(seen.stack?.tickerItems);
    expect(ticker.filter((id) => ["a1", "f1", "f2", "f3"].includes(id))).toEqual(["f1"]);
    // The sign-ins are not the selected kind: their switch is still on.
    expect(ids(seen.globe?.logins)).toEqual(["l1", "l2"]);
  });

  it("Logins off with one sign-in selected: the globe list and the ticker hold that sign-in only", async () => {
    await mounted();
    const l1 = seen.globe?.logins.find((l) => l.id === "l1") as unknown as LoginEvent;
    act(() => useSelection.getState().selectLogin(l1));
    await layers({ showLogins: false });
    expect(ids(seen.globe?.logins)).toEqual(["l1"]);
    expect(ids(seen.menus?.visibleLogins)).toEqual(["l1"]);
    const ticker = ids(seen.stack?.tickerItems);
    expect(ticker.filter((id) => ["l1", "l2"].includes(id))).toEqual(["l1"]);
    expect(ids(seen.globe?.transactions)).toEqual(["a1", "f1", "f2", "f3"]);
  });

  it("clearing the selection lets the switch take the record off again", async () => {
    await mounted();
    const f1 = seen.globe?.transactions.find((t) => t.id === "f1") as unknown as Transaction;
    act(() => useSelection.getState().selectTransaction(f1));
    await layers({ showAuths: false });
    act(() => useSelection.getState().clear());
    expect(ids(seen.globe?.transactions)).toEqual([]);
  });
});

describe("App: a manifest kind", () => {
  it("is on the globe with nothing hidden and leaves it when its kind is switched off", async () => {
    useSchema.getState().setActive("layers-test", [...CARD_NODES, WIDGET]);
    render(<App />);
    await waitFor(() => expect(seen.globe?.transactions).toHaveLength(4));
    await waitFor(() => expect(ids(seen.globe?.genericEntities)).toEqual(["w1"]));
    await layers({ hiddenKinds: ["widget"] });
    expect(ids(seen.globe?.genericEntities)).toEqual([]);
    // The card kinds are untouched by a manifest kind's switch.
    expect(ids(seen.globe?.transactions)).toEqual(["a1", "f1", "f2", "f3"]);
    await layers({ hiddenKinds: [] });
    expect(ids(seen.globe?.genericEntities)).toEqual(["w1"]);
  });

  it("streams into the ticker and leaves it when its kind is switched off", async () => {
    useSchema.getState().setActive("layers-test", [...CARD_NODES, WIDGET]);
    render(<App />);
    await waitFor(() => expect(ids(seen.stack?.tickerItems)).toEqual([...ALL_TICKER, "w1"].sort()));
    await layers({ hiddenKinds: ["widget"] });
    expect(ids(seen.stack?.tickerItems)).toEqual([...ALL_TICKER].sort());
  });
});
