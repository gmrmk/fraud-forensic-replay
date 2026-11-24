import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import App from "./App";
import { usePlayhead } from "./store/playhead";
import { useSelection } from "./store/selection";
import { useNavigation } from "./store/navigation";
import { useSchema } from "./store/schema";
import { selectionId } from "./lib/case-events";
import type { ScenarioHome, ScenarioNode } from "./lib/scenarios";

// The opening: which record the case first shows, and where the playhead stands. App is mounted with
// its children stubbed. The scenario switcher reports an active scenario, fetch serves the rows, and
// the test reads the selection, the playhead and the camera target the opening left. Three kinds of
// pack are mounted: a story whose finding is a rule decision (the older three), a story whose case is
// a manifest decision node (the newer five), and the link cases that stand the opening down.

const live = vi.hoisted(() => ({
  decisions: [] as unknown[],
  loaded: true,
  linkOpens: false,
  holdsCamera: false,
  scenario: null as null | Record<string, unknown>,
  rows: {} as Record<string, unknown[]>,
  // Reads held back until the test lets them go (see `hold`): a url that matches waits for its promise.
  gates: [] as { match: RegExp; wait: Promise<void> }[],
}));

vi.mock("./components/MapRecovery", () => ({ RecoveringGlobeMap: () => null }));
vi.mock("./components/ScenarioSwitcher", () => ({
  ScenarioSwitcher: ({ onActive }: { onActive: (s: unknown) => void }) => {
    // Once per mount: App hands a new onActive each render, and the report sets state.
    const sent = useRef(false);
    useEffect(() => {
      if (live.scenario && !sent.current) {
        sent.current = true;
        onActive(live.scenario);
      }
    }, [onActive]);
    return null;
  },
}));
vi.mock("./components/CaseBottomStack", () => ({ CaseBottomStack: () => null }));
vi.mock("./components/MapMenus", () => ({ MapMenus: () => null }));
vi.mock("./store/decisions", () => ({
  useDecisions: () => ({ decisions: live.decisions, error: null, loaded: live.loaded }),
}));
vi.mock("./components/ui", () => ({
  Panel: ({ children }: { children?: ReactNode }) => children ?? null,
  Eyebrow: () => null,
}));
vi.mock("./components/Inspector", () => ({ Inspector: () => null }));
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
  get linkHoldsCamera() {
    return live.holdsCamera;
  },
  linkOpensCase: () => live.linkOpens,
  useShareLink: () => {},
}));

const base = { label: "k", palette: "#fff", source: "json", timestamp: "at", primary: "${id}", secondary: "${id}" };
const DECISION_MAP = { status: "st", outcome: "word", note: "n", actor: "a", target: "t", key: "k", event: "ev" };
const NODES: ScenarioNode[] = [
  { ...base, kind: "ping", coords: { lat: "lat", lng: "lng" } },
  { ...base, kind: "load", magnitude: "size" },
  { ...base, kind: "alert", decision: DECISION_MAP },
];
const HOME: ScenarioHome = { lng: -22, lat: 42, zoom: 2 };
const T = (h: number) => `2026-12-01T0${h}:00:00Z`;
const ms = (h: number) => Date.parse(T(h));

// The newer shape: two pings, a bar, and one decision at the end naming the last ping and the bar.
const OVERLAY_ROWS = {
  ping: [
    { id: "p1", at: T(1), lat: 10, lng: 20 },
    { id: "p2", at: T(2), lat: 11, lng: 21 },
  ],
  load: [{ id: "l1", at: T(3), size: 9 }],
  alert: [{ id: "a1", at: T(4), st: "FAIL", word: "FOR REVIEW", ev: ["p1", "p2", "l1"] }],
};

const rule = (trigger: string) => ({
  id: "d-rule",
  rule: { id: "r", label: "r", kind: "rule" },
  subjectPathKind: "login",
  triggerEntityIds: [trigger],
  inputs: [],
  thresholds: [],
  verdict: "ACCOUNT TAKEOVER",
  decision: "FLAG",
  evidence: [],
  severity: 0.9,
});
const login = (id: string, h: number) => ({
  id, account_id: "acct-1", timestamp: T(h), ip_lat: 51.5, ip_lng: -0.1, device_fp: `dev-${id}`, session_id: "S", outcome: "success",
});

async function mounted() {
  render(<App />);
  await act(async () => {});
}
const selectedId = () => selectionId(useSelection.getState().selected);

/** Hold back every read whose url matches until the returned function is called (by hand, in an act). */
function hold(match: RegExp): () => void {
  let release = () => {};
  live.gates.push({ match, wait: new Promise<void>((resolve) => (release = resolve)) });
  return release;
}
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => {});
};

beforeEach(() => {
  live.decisions = [];
  live.loaded = true;
  live.linkOpens = false;
  live.holdsCamera = false;
  live.scenario = { id: "pack", nodes: NODES, home: HOME };
  live.rows = OVERLAY_ROWS;
  live.gates = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const gate of live.gates) if (gate.match.test(url)) await gate.wait;
      const kind = /kind=([^&]+)/.exec(url)?.[1];
      const body = kind ? live.rows[kind] ?? [] : live.rows[url.split("?")[0]] ?? [];
      return { ok: true, status: 200, json: async () => body };
    }),
  );
  useSelection.getState().clear();
  useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null });
  usePlayhead.setState({ playhead: 0, minTime: 0, maxTime: 0, windowMin: 0, windowMax: 0, opening: null, isPlaying: false });
  useSchema.getState().setActive("pack", NODES);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App: a pack whose case is a manifest decision opens into it", () => {
  it("selects the last record its decision names that the step keys can reach, and stands the playhead there", async () => {
    await mounted();
    await waitFor(() => expect(selectedId()).toBe("p2"));
    expect(usePlayhead.getState().playhead).toBe(ms(2));
    expect(usePlayhead.getState().playhead).toBeLessThan(usePlayhead.getState().maxTime);
  });

  it("does not move the camera: the map opened on the scenario's home", async () => {
    await mounted();
    await waitFor(() => expect(selectedId()).toBe("p2"));
    expect(useNavigation.getState().panTarget).toBeNull();
  });

  it("opens a record with no place without a camera move", async () => {
    live.rows = { ...OVERLAY_ROWS, ping: OVERLAY_ROWS.ping.map(({ id, at }) => ({ id, at })) };
    live.scenario = { id: "pack", nodes: NODES };
    live.holdsCamera = true;
    await mounted();
    await waitFor(() => expect(selectedId()).toBe("p2"));
    expect(useNavigation.getState().panTarget).toBeNull();
  });
});

describe("App: a pack with a rule decision opens as it did", () => {
  // The platform-access shape: no focal, the rule's trigger is a manifest record, and the pack also
  // has a decision node naming a later record.
  it("selects the rule finding's landing trigger even when the pack also has a decision node", async () => {
    live.decisions = [rule("p1")];
    await mounted();
    await waitFor(() => expect(selectedId()).toBe("p1"));
    expect(usePlayhead.getState().playhead).toBe(ms(1));
    expect(useNavigation.getState().panTarget).toBeNull();
  });

  // The priya-ato shape: a focal, the rule's trigger is a sign-in read through /api/logins.
  it("selects a sign-in trigger of a pack with a focal", async () => {
    live.scenario = { id: "pack", nodes: NODES, home: HOME, focal: { card_id: "c", account_id: "acct-1" } };
    live.rows = { ...OVERLAY_ROWS, "/api/logins": [login("lg-ato", 1)] };
    live.decisions = [rule("lg-ato")];
    await mounted();
    await waitFor(() => expect(selectedId()).toBe("lg-ato"));
    expect(usePlayhead.getState().playhead).toBe(ms(1));
  });

  it("does not open on the decision node's event while the rule decisions are still loading", async () => {
    live.loaded = false;
    live.decisions = [];
    const view = render(<App />);
    await act(async () => {});
    await act(async () => {});
    expect(selectedId()).toBeNull();
    live.loaded = true;
    live.decisions = [rule("p1")];
    view.rerender(<App />);
    await waitFor(() => expect(selectedId()).toBe("p1"));
  });
});

describe("App: a link wins over the opening", () => {
  it("a link that names a selection or a time leaves the opening alone", async () => {
    live.linkOpens = true;
    await mounted();
    await act(async () => {});
    expect(selectedId()).toBeNull();
  });

  it("a link that holds a camera still opens on the record but does not move the camera", async () => {
    live.holdsCamera = true;
    live.scenario = { id: "pack", nodes: NODES };
    await mounted();
    await waitFor(() => expect(selectedId()).toBe("p2"));
    expect(useNavigation.getState().panTarget).toBeNull();
  });
});

// The two reads of the story (the case rows, the generic kinds) land in either order. A playhead the
// opening focus has placed stays when the later read widens the bounds; with no focus it ends at the end.
describe("App: records that arrive late do not move the playhead off the opening", () => {
  const FOCAL = { card_id: "c", account_id: "acct-1" };
  // Two sign-ins, so the case rows alone give the bounds a span.
  const CASE_ROWS = { "/api/logins": [login("lg-ato", 1), login("lg-last", 2)] };
  const GENERIC_ENTITIES = /\/api\/entities\?kind=/;

  it("the case rows land and the focus fires; the generic kinds then land with a later record and the playhead stays", async () => {
    live.scenario = { id: "pack", nodes: NODES, home: HOME, focal: FOCAL };
    live.rows = { ...OVERLAY_ROWS, ...CASE_ROWS };
    live.decisions = [rule("lg-ato")];
    const release = hold(GENERIC_ENTITIES);
    await mounted();
    await waitFor(() => expect(selectedId()).toBe("lg-ato"));
    expect(usePlayhead.getState().playhead).toBe(ms(1));
    expect(usePlayhead.getState().maxTime).toBe(ms(2)); // only the case rows have arrived
    await act(async () => release());
    await waitFor(() => expect(usePlayhead.getState().maxTime).toBe(ms(4))); // the decision record, after the last case row
    await settle();
    expect(usePlayhead.getState().playhead).toBe(ms(1));
    expect(usePlayhead.getState().maxTime).toBe(ms(4));
    expect(selectedId()).toBe("lg-ato");
  });

  it("with no focus to fire the playhead ends at the end of all the data, the case rows first", async () => {
    const plain = NODES.slice(0, 2); // no decision node: nothing for the overlay focus to stand on
    live.scenario = { id: "pack", nodes: plain, home: HOME, focal: FOCAL };
    live.rows = { ...OVERLAY_ROWS, ...CASE_ROWS };
    const release = hold(GENERIC_ENTITIES);
    await mounted();
    await settle();
    expect(usePlayhead.getState().maxTime).toBe(ms(2));
    expect(usePlayhead.getState().playhead).toBe(ms(2));
    await act(async () => release());
    await waitFor(() => expect(usePlayhead.getState().maxTime).toBe(ms(3)));
    await settle();
    expect(usePlayhead.getState().playhead).toBe(ms(3));
    expect(selectedId()).toBeNull();
  });

  it("the generic kinds land first, then the case rows, then the focus: the playhead is on the focus record", async () => {
    const plain = NODES.slice(0, 2); // the rule decision is the only focus, and it needs the case rows
    live.scenario = { id: "pack", nodes: plain, home: HOME, focal: FOCAL };
    live.rows = { ...OVERLAY_ROWS, ...CASE_ROWS };
    live.decisions = [rule("lg-ato")];
    const release = hold(/\/api\/logins/);
    await mounted();
    await waitFor(() => expect(usePlayhead.getState().maxTime).toBe(ms(3))); // the generic kinds' end
    expect(selectedId()).toBeNull();
    await act(async () => release());
    await waitFor(() => expect(selectedId()).toBe("lg-ato"));
    await settle();
    expect(usePlayhead.getState().playhead).toBe(ms(1));
  });
});
