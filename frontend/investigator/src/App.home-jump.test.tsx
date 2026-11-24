import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import App from "./App";
import { usePlayhead } from "./store/playhead";
import type { ScenarioHome, ScenarioNode } from "./lib/scenarios";

// FITFIX: the effect that frames the camera on the scenario's home marks its jump as an opening
// (`jumpHome`), so the fit above the bar is taken from the zoom the jump leaves. App is mounted with
// its children stubbed: the globe hands up a fake map, the scenario switcher reports an active
// scenario, and the test reads the jump the map received.

const live = vi.hoisted(() => ({
  map: { jumpTo: vi.fn(), on: vi.fn(), off: vi.fn(), getCenter: () => ({ lng: 0, lat: 0 }), project: () => ({ x: 0, y: 0 }) }, // the last four: what the globe's marks ask of the map
  onActive: null as null | ((s: unknown) => void),
}));

vi.mock("./components/MapRecovery", () => ({
  RecoveringGlobeMap: ({ onMapReady }: { onMapReady?: (m: unknown) => void }) => {
    useEffect(() => onMapReady?.(live.map), [onMapReady]);
    return null;
  },
}));
vi.mock("./components/ScenarioSwitcher", () => ({
  ScenarioSwitcher: ({ onActive }: { onActive: (s: unknown) => void }) => {
    live.onActive = onActive;
    return null;
  },
}));
vi.mock("./components/CaseBottomStack", () => ({ CaseBottomStack: () => null }));
vi.mock("./components/MapMenus", () => ({ MapMenus: () => null }));
vi.mock("./store/decisions", () => ({ useDecisions: () => ({ decisions: [], error: null }) }));
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
  linkHoldsCamera: false,
  linkOpensCase: () => false,
  useShareLink: () => {},
}));

const NODES: ScenarioNode[] = ["auth", "fraud", "login"].map((kind) => ({
  kind, label: kind, palette: kind, source: kind, timestamp: "timestamp", primary: "${id}", secondary: "${id}",
}));
const active = (id: string, home: ScenarioHome) => ({ id, nodes: NODES, home });
const lock = window as unknown as { __ffrCameraLock?: boolean };

async function mounted() {
  render(<App />);
  await act(async () => {});
}

beforeEach(() => {
  live.map.jumpTo.mockClear();
  live.onActive = null;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));
  usePlayhead.setState({ playhead: 0, minTime: 0, maxTime: 0, windowMin: 0, windowMax: 0, opening: null, isPlaying: false });
});
afterEach(() => {
  delete lock.__ffrCameraLock;
  vi.unstubAllGlobals();
});

describe("App: the jump to the scenario home", () => {
  it("jumps to the home once the map and the home are both known, marked as an opening", async () => {
    await mounted();
    expect(live.map.jumpTo).not.toHaveBeenCalled(); // no home yet
    act(() => live.onActive?.(active("card-fraud", { lng: -40, lat: 20, zoom: 2 })));
    expect(live.map.jumpTo).toHaveBeenCalledTimes(1);
    expect(live.map.jumpTo).toHaveBeenCalledWith({ center: [-40, 20], zoom: 2 }, { ffrHome: true });
  });

  it("marks the jump of a change of scenario on the same map as well", async () => {
    await mounted();
    act(() => live.onActive?.(active("card-fraud", { lng: -40, lat: 20, zoom: 2 })));
    act(() => live.onActive?.(active("priya-ato", { lng: -95, lat: 31, zoom: 4 })));
    expect(live.map.jumpTo).toHaveBeenCalledTimes(2);
    expect(live.map.jumpTo).toHaveBeenLastCalledWith({ center: [-95, 31], zoom: 4 }, { ffrHome: true });
  });

  it("does not jump while the camera is locked by the link or the capture harness", async () => {
    lock.__ffrCameraLock = true;
    await mounted();
    act(() => live.onActive?.(active("card-fraud", { lng: -40, lat: 20, zoom: 2 })));
    expect(live.map.jumpTo).not.toHaveBeenCalled();
  });
});
