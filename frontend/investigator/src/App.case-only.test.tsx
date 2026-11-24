import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ScenarioNode } from "./lib/scenarios";

// The investigator app is the case view alone: an address that names another view opens the case,
// and the top row holds no view pill, in a live build and in a static one. App is mounted with its
// children replaced by stubs, as App.tip.test.tsx does. The case's own parts leave a mark (the
// menus and the Inspector); the queue and the view switch are NOT mocked, so on a tree that still
// has them they mount and these cases fail on the assertions below. It lays nothing out and draws no
// map: the top row's real geometry is read from a rendered page, not from here.

vi.mock("./store/decisions", () => ({ useDecisions: () => ({ decisions: [], error: null }) }));
vi.mock("./components/ui", () => ({
  Panel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Eyebrow: () => null,
  Pill: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  // A real queue component also asks the barrel for this one; the mock holds it so a red run fails
  // on the view's assertions and not on the mock.
  FocusButton: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("./components/MapRecovery", () => ({ RecoveringGlobeMap: () => null }));
vi.mock("./components/CaseBottomStack", () => ({ CaseBottomStack: () => null }));
vi.mock("./components/MapMenus", () => ({ MapMenus: () => <div data-testid="case-menus" /> }));
vi.mock("./components/Inspector", () => ({ Inspector: () => <div data-testid="case-inspector" /> }));
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

// An auth node: a pack with card activity, on which the queue would be offered today.
const cardNode: ScenarioNode = { kind: "auth", label: "Authorization", palette: "#fff", source: "sql" };
const VIEW_PILL = /^(view queue|open case|manager console|close console)$/i;

// Each case loads App and the stores afresh, with the build flag set for it, so the view store reads
// the address the case sets.
async function openAt(query: string, staticBuild: boolean) {
  window.location.href = `http://localhost/${query}`;
  vi.resetModules();
  vi.doMock("./lib/build-flags", () => ({ IS_STATIC_BUILD: staticBuild }));
  const { default: App } = await import("./App");
  const { useSchema } = await import("./store/schema");
  useSchema.setState({ nodes: [cardNode] });
  return render(<App />);
}

beforeEach(() => {
  // Vitest runs with globals off, so Testing Library does not set this itself.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })),
  );
});
afterEach(() => {
  cleanup();
  vi.doUnmock("./lib/build-flags");
  vi.unstubAllGlobals();
  window.location.href = "http://localhost/";
});

// Each case evaluates the whole app afresh (openAt), which takes seconds on a busy machine. The time
// limit is raised so that a slow load is not read as a failure.
const SLOW_LOAD_MS = 30_000;

describe.each([
  ["?view=queue opens the case", "?view=queue"],
  ["?view=manager opens the case", "?view=manager"],
  ["with no view in the address the top row holds no view pill", ""],
])("%s, live and static", (_title, query) => {
  it.each([
    ["a live build", false],
    ["a static build", true],
  ])("in %s", async (_name, staticBuild) => {
    const view = await openAt(query, staticBuild);
    expect(view.getByTestId("case-menus")).toBeTruthy();
    expect(view.getByTestId("case-inspector")).toBeTruthy();
    expect(view.queryByRole("button", { name: VIEW_PILL })).toBeNull();
  }, SLOW_LOAD_MS);
});
