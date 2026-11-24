import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import appSource from "./App.tsx?raw";
import App from "./App";
import { showTipAt } from "./components/ui/Tip";

// One tooltip layer serves the whole screen, so App mounts it once, outside the case gate: the
// whole screen carries tooltips. App is mounted with its children replaced by stubs,
// as App.solo.test.tsx does, and the layer itself is the real one.

vi.mock("./store/decisions", () => ({ useDecisions: () => ({ decisions: [], error: null }) }));
vi.mock("./components/ui", () => ({
  Panel: ({ children }: { children?: ReactNode }) => children ?? null,
  Eyebrow: () => null,
}));
vi.mock("./components/MapRecovery", () => ({ RecoveringGlobeMap: () => null }));
vi.mock("./components/CaseBottomStack", () => ({ CaseBottomStack: () => null }));
vi.mock("./components/MapMenus", () => ({ MapMenus: () => null }));
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

const layers = () => document.querySelectorAll("[data-tip-layer]");
const showOne = () => act(() => showTipAt({ x: 200, y: 200 }, ["Authorizations", "12 of 40"]));

beforeEach(() => {
  // Vitest runs with globals off, so Testing Library does not set this itself.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })),
  );
});
afterEach(() => {
  act(() => showTipAt(null));
  vi.unstubAllGlobals();
});

describe("App mounts the tooltip layer", () => {
  it("imports TipLayer from the ui folder and renders it once", () => {
    expect(appSource).toMatch(/import \{ TipLayer \} from "\.\/components\/ui\/Tip";/);
    expect(appSource.match(/<TipLayer\b/g) ?? []).toHaveLength(1);
  });

  it("shows exactly one tooltip when one is asked for, in a case", async () => {
    render(<App />);
    expect(layers()).toHaveLength(0);
    await showOne();
    expect(layers()).toHaveLength(1);
    expect(layers()[0].textContent).toContain("Authorizations");
    expect(layers()[0].textContent).toContain("12 of 40");
  });

  it("a second ask moves the one tooltip and does not add another", async () => {
    render(<App />);
    await showOne();
    await act(async () => showTipAt({ x: 40, y: 60 }, ["Logins", "2 of 9"]));
    expect(layers()).toHaveLength(1);
    expect(layers()[0].textContent).toContain("Logins");
  });
});
