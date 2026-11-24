import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import type { ReactNode, Ref } from "react";
import App from "./App";
import { usePlayhead } from "./store/playhead";
import { useSchema } from "./store/schema";
import type { ScenarioNode } from "./lib/scenarios";

// T1 (BACKLOG item 20): the observer that publishes --bottom-stack-h reads no layout that an
// observer entry already gives, and none while the playhead plays. The profile of the first 400 ms
// of the played swing put 7.3 ms a run in the `offsetHeight` getter this observer calls. App is
// mounted with its children replaced by stubs, the stack's element stands in for the real one, and
// the two observers are fakes whose callbacks the test calls. The published value is the layout
// height (`offsetHeight`, integer): an entry's border box rounded is the same number.

const STACK_ID = "bottom-stack-stub";
vi.mock("./components/CaseBottomStack", () => ({
  CaseBottomStack: ({ stackRef }: { stackRef: Ref<HTMLDivElement> }) => <div ref={stackRef} data-testid={STACK_ID} />,
}));
vi.mock("./components/MapRecovery", () => ({ RecoveringGlobeMap: () => null }));
vi.mock("./components/MapMenus", () => ({ MapMenus: () => null }));
vi.mock("./store/decisions", () => ({ useDecisions: () => ({ decisions: [], error: null }) }));
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

type Watcher = { cb: (...a: unknown[]) => void; target: Element | null };
const watchers = vi.hoisted(() => ({ resize: [] as Watcher[], mutation: [] as Watcher[] }));
const fakeObserver = (list: Watcher[]) =>
  class {
    private w: Watcher;
    constructor(cb: (...a: unknown[]) => void) {
      this.w = { cb, target: null };
      list.push(this.w);
    }
    observe(target: Element) {
      this.w.target = target;
    }
    unobserve() {}
    disconnect() {
      this.w.target = null;
    }
    takeRecords() {
      return [];
    }
  };

const NODES: ScenarioNode[] = ["auth", "fraud", "login"].map((kind) => ({
  kind, label: kind, palette: kind, source: kind, timestamp: "timestamp", primary: "${id}", secondary: "${id}",
}));

type Spy = { mock: { calls: unknown[][] } };
const reads = { count: 0, height: 172 };
const heightProp = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const stack = (): HTMLElement => document.querySelector(`[data-testid="${STACK_ID}"]`) as HTMLElement;
const stackWatchers = (list: Watcher[]) => list.filter((w) => w.target === stack());
const published = (setProp: Spy) =>
  setProp.mock.calls.filter((c) => c[0] === "--bottom-stack-h").map((c) => c[1]);

let setProp: Spy;

async function mounted() {
  render(<App />);
  await act(async () => {});
  expect(stack()).not.toBeNull();
}
const entry = (blockSize: number) => ({ target: stack(), borderBoxSize: [{ blockSize, inlineSize: 900 }] });

beforeEach(() => {
  watchers.resize.length = 0;
  watchers.mutation.length = 0;
  reads.count = 0;
  reads.height = 172;
  vi.stubGlobal("ResizeObserver", fakeObserver(watchers.resize));
  vi.stubGlobal("MutationObserver", fakeObserver(watchers.mutation));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (this.dataset?.testid === STACK_ID) reads.count += 1;
      return reads.height;
    },
  });
  setProp = vi.spyOn(document.documentElement.style, "setProperty");
  usePlayhead.setState({ playhead: 0, minTime: 0, maxTime: 0, windowMin: 0, windowMax: 0, opening: null, isPlaying: false });
  useSchema.getState().setActive("stack-height-test", NODES);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (heightProp) Object.defineProperty(HTMLElement.prototype, "offsetHeight", heightProp);
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
});

describe("App: the --bottom-stack-h observer", () => {
  it("reads the layout height once when it mounts, and publishes it", async () => {
    await mounted();
    expect(reads.count).toBe(1);
    expect(published(setProp)).toEqual(["172px"]);
    expect(stackWatchers(watchers.resize)).toHaveLength(1);
    expect(stackWatchers(watchers.mutation)).toHaveLength(1);
  });

  it("publishes a resize entry's rounded border-box height and reads no layout", async () => {
    await mounted();
    const [ro] = stackWatchers(watchers.resize);
    reads.count = 0;
    act(() => ro.cb([entry(180.4)]));
    expect(published(setProp).at(-1)).toBe("180px");
    act(() => ro.cb([entry(181.6)]));
    expect(published(setProp).at(-1)).toBe("182px");
    expect(reads.count).toBe(0);
  });

  it("writes the property only when the value is not the one last written", async () => {
    await mounted();
    const [ro] = stackWatchers(watchers.resize);
    act(() => ro.cb([entry(172)]));
    act(() => ro.cb([entry(172.2)]));
    expect(published(setProp)).toEqual(["172px"]); // the mount's write only
    act(() => ro.cb([entry(190)]));
    act(() => ro.cb([entry(190)]));
    expect(published(setProp)).toEqual(["172px", "190px"]);
  });

  it("reads the layout on a content change while the playhead is not playing", async () => {
    await mounted();
    const [mo] = stackWatchers(watchers.mutation);
    reads.count = 0;
    reads.height = 205;
    act(() => mo.cb([]));
    expect(reads.count).toBe(1);
    expect(published(setProp).at(-1)).toBe("205px");
  });

  it("reads no layout on a content change while playing, and reads once when play stops", async () => {
    await mounted();
    const [mo] = stackWatchers(watchers.mutation);
    act(() => usePlayhead.setState({ isPlaying: true }));
    reads.count = 0;
    reads.height = 205;
    for (let i = 0; i < 10; i++) act(() => mo.cb([]));
    expect(reads.count).toBe(0);
    expect(published(setProp).at(-1)).toBe("172px"); // nothing new written in play
    act(() => usePlayhead.setState({ isPlaying: false }));
    expect(reads.count).toBe(1);
    expect(published(setProp).at(-1)).toBe("205px");
  });

  it("stops watching the playhead and both observers when it unmounts", async () => {
    const { unmount } = render(<App />);
    await act(async () => {});
    const els = [...stackWatchers(watchers.resize), ...stackWatchers(watchers.mutation)];
    expect(els).toHaveLength(2);
    unmount();
    expect(els.every((w) => w.target === null)).toBe(true);
    reads.count = 0;
    act(() => usePlayhead.setState({ isPlaying: true }));
    act(() => usePlayhead.setState({ isPlaying: false }));
    expect(reads.count).toBe(0);
  });
});
