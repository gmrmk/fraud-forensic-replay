/**
 * A share link opens the case where it says, and the address bar is kept in step afterwards.
 * The link is passed in here; in the app it is read once from the address bar at load.
 *
 * The test DOM (happy-dom 14) ignores history.replaceState, so "the address bar" here is the
 * last address the hook asked for.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { adoptLinkScenario, dropShareLink, linkOpensCase, useShareLink, type ShareLinkMap } from "./useShareLink";
import { parseShareLink, type ShareLink } from "../lib/share-link";
import { usePlayhead } from "../store/playhead";
import { useSelection } from "../store/selection";
import { useSchema } from "../store/schema";
import { useTheme } from "../store/theme";
import { useLayers } from "../store/layers";
import { useSolo } from "../store/solo";
import { useTrackBy } from "../store/track-by";
import { BAR_SIZE_KEY } from "../lib/bar-size";
import { manifestRowToEntity } from "../lib/adapters/manifest-row";
import type { BootFocusRows } from "../lib/boot-focus";
import type { ScenarioNode } from "../lib/scenarios";

const node: ScenarioNode = { kind: "stop", label: "Stop", palette: "#fff", source: "json", coords: null, timestamp: "at", primary: "${id}" };
const T0 = Date.parse("2026-06-08T00:00:00Z");
const HOUR = 3_600_000;
const stop = (id: string, h: number) => manifestRowToEntity(node, { id, at: new Date(T0 + h * HOUR).toISOString() });
const entities = [stop("s1", 2), stop("s2", 5)];
const rows: BootFocusRows = { transactions: [], logins: [], accountEvents: [], transfers: [], entities };
const NONE: BootFocusRows = { transactions: [], logins: [], accountEvents: [], transfers: [], entities: [] };

/** A map that records what it is asked and can be told a camera move has ended. */
function fakeMap() {
  const listeners: Array<() => void> = [];
  let moving = false;
  return {
    jumpTo: vi.fn(),
    getCenter: () => ({ lng: 4.9, lat: 52.37 }),
    getZoom: () => 3.1,
    getPitch: () => 0,
    getBearing: () => 0,
    isMoving: () => moving,
    on: (_type: "moveend", listener: () => void) => void listeners.push(listener),
    off: vi.fn(),
    startMove: () => void (moving = true),
    moveEnd: () => {
      moving = false;
      listeners.forEach((listener) => listener());
    },
  };
}

function Probe({ link, rows: r, map = null }: { link: ShareLink; rows: BootFocusRows; map?: ShareLinkMap | null }) {
  useShareLink({ rows: r, map, link });
  return null;
}
const selectedId = () => {
  const s = useSelection.getState().selected;
  return s && s.kind === "entity" ? s.entity.id : null;
};
const replace = () => vi.mocked(window.history.replaceState);
/** The last address the hook asked for, or null when it has asked for none. */
const address = (): string | null => {
  const call = replace().mock.calls.at(-1);
  return call ? String(call[2]) : null;
};
const written = (): ShareLink => parseShareLink(address() ?? "");

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window.history, "replaceState");
  localStorage.clear();
  usePlayhead.setState({ minTime: 0, maxTime: 0, windowMin: 0, windowMax: 0, playhead: 0, isPlaying: false, isScrubbing: false, markA: null, markB: null, opening: null });
  useSelection.setState({ selected: null });
  useSchema.setState({ nodes: [node], scenarioId: "pack-x", rows: undefined, fields: undefined });
  useTheme.setState({ theme: "dark", color: "neon" });
  useLayers.setState({ barSize: "middle" });
  useTrackBy.setState({ by: null });
  useSolo.setState({ solo: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("opening on a link", () => {
  it("selects the linked record and opens at the linked time, whenever the data arrives", () => {
    const link: ShareLink = { sel: "s2", playhead: T0 + 3 * HOUR, a: T0 + HOUR, b: T0 + 4 * HOUR };
    const view = render(<Probe link={link} rows={NONE} />);
    expect(selectedId()).toBeNull(); // the record is not loaded yet
    act(() => usePlayhead.getState().setBounds(T0, T0 + 24 * HOUR));
    view.rerender(<Probe link={link} rows={rows} />);
    expect(selectedId()).toBe("s2");
    const s = usePlayhead.getState();
    expect([s.playhead, s.markA, s.markB]).toEqual([T0 + 3 * HOUR, T0 + HOUR, T0 + 4 * HOUR]);
  });

  it("a selection with no time opens at the record's own time", () => {
    act(() => usePlayhead.getState().setBounds(T0, T0 + 24 * HOUR));
    render(<Probe link={{ sel: "s1" }} rows={rows} />);
    expect(selectedId()).toBe("s1");
    expect(usePlayhead.getState().playhead).toBe(T0 + 2 * HOUR);
  });

  it("a time alone moves the playhead and selects nothing", () => {
    render(<Probe link={{ playhead: T0 + 6 * HOUR }} rows={rows} />);
    act(() => usePlayhead.getState().setBounds(T0, T0 + 24 * HOUR));
    expect(usePlayhead.getState().playhead).toBe(T0 + 6 * HOUR);
    expect(selectedId()).toBeNull();
  });

  it("an unknown record is ignored: nothing is selected and the playhead stays where the app put it", () => {
    act(() => usePlayhead.getState().setBounds(T0, T0 + 24 * HOUR));
    render(<Probe link={{ sel: "nobody" }} rows={rows} />);
    expect(selectedId()).toBeNull();
    expect(usePlayhead.getState().playhead).toBe(T0 + 24 * HOUR);
  });

  it("an empty link changes nothing", () => {
    act(() => usePlayhead.getState().setBounds(T0, T0 + 24 * HOUR));
    render(<Probe link={{}} rows={rows} />);
    expect(selectedId()).toBeNull();
    expect(usePlayhead.getState().playhead).toBe(T0 + 24 * HOUR);
  });

  it("moves the camera once the map exists, naming only the axes the link carries", () => {
    // The map reads a named axis with no value as not-a-number, so an absent axis must be absent.
    const link: ShareLink = { zoom: 3 };
    const map = fakeMap();
    const view = render(<Probe link={link} rows={rows} />);
    view.rerender(<Probe link={link} rows={rows} map={map} />);
    view.rerender(<Probe link={link} rows={rows} map={map} />);
    expect(map.jumpTo.mock.calls).toStrictEqual([[{ zoom: 3 }]]);
  });

  it("leaves the camera alone when the link names none", () => {
    const map = fakeMap();
    render(<Probe link={{ playhead: T0, sel: "s1" }} rows={rows} map={map} />);
    expect(map.jumpTo).not.toHaveBeenCalled();
  });
});

// A pack that groups its usage rows by organisation. `org_id` is declared by the manifest and is
// pivotable on the node, so the solo's narrowing (relatedEntities) finds the rows too.
const usageNode: ScenarioNode = { ...node, kind: "usage", label: "Usage", pivotable: ["org_id"] };
const usage = (id: string, h: number, org: string) =>
  manifestRowToEntity(usageNode, { id, at: new Date(T0 + h * HOUR).toISOString(), org_id: org, colour: "red" });
const groupedRows: BootFocusRows = {
  ...NONE,
  entities: [usage("u1", 1, "acme"), usage("u2", 2, "acme"), usage("u3", 3, "globex")],
};
const declare = (): void =>
  useSchema.setState({ nodes: [node, usageNode], rows: { by: "org_id" }, fields: { org_id: { label: "Organisation" } } });
const barSizeKey = (): string | null => localStorage.getItem(BAR_SIZE_KEY);

describe("opening on a link with a grouping and a solo", () => {
  beforeEach(declare);

  it("sets the grouping and the solo, and opens the bar for this session", () => {
    render(<Probe link={{ by: "org_id", solo: "acme" }} rows={groupedRows} />);
    expect(useTrackBy.getState().by).toBe("org_id");
    expect(useSolo.getState().solo).toStrictEqual({ field: "org_id", value: "acme" });
    expect(useLayers.getState().barSize).toBe("open");
  });

  it("opens the bar through openBar() and writes no size: an absent key stays absent", () => {
    expect(barSizeKey()).toBeNull();
    render(<Probe link={{ by: "org_id", solo: "acme" }} rows={groupedRows} />);
    expect(useLayers.getState().barSize).toBe("open");
    expect(barSizeKey()).toBeNull();
  });

  it("leaves a saved size as it was: 'line' stays under the key while the bar is open", () => {
    localStorage.setItem(BAR_SIZE_KEY, "line");
    render(<Probe link={{ solo: "acme" }} rows={groupedRows} />);
    expect(useLayers.getState().barSize).toBe("open");
    expect(barSizeKey()).toBe("line");
  });

  it("a grouping alone opens the bar; a solo alone takes the manifest's grouping as its field", () => {
    const view = render(<Probe link={{ by: "org_id" }} rows={groupedRows} />);
    expect(useTrackBy.getState().by).toBe("org_id");
    expect(useSolo.getState().solo).toBeNull();
    expect(useLayers.getState().barSize).toBe("open");
    view.unmount();
    useTrackBy.setState({ by: null });
    useLayers.setState({ barSize: "middle" });
    render(<Probe link={{ solo: "globex" }} rows={groupedRows} />);
    expect(useTrackBy.getState().by).toBeNull();
    expect(useSolo.getState().solo).toStrictEqual({ field: "org_id", value: "globex" });
    expect(useLayers.getState().barSize).toBe("open");
  });

  it("a link with neither key leaves the size, the grouping and the solo alone", () => {
    localStorage.setItem(BAR_SIZE_KEY, "line");
    useLayers.setState({ barSize: "line" });
    render(<Probe link={{ playhead: T0 }} rows={groupedRows} />);
    expect(useLayers.getState().barSize).toBe("line");
    expect(useTrackBy.getState().by).toBeNull();
    expect(useSolo.getState().solo).toBeNull();
    expect(barSizeKey()).toBe("line");
  });

  it("drops both when the loaded rows lack the grouping field, and does not open the bar", () => {
    // `stop` rows carry no `org_id`.
    render(<Probe link={{ by: "org_id", solo: "acme" }} rows={rows} />);
    expect(useTrackBy.getState().by).toBeNull();
    expect(useSolo.getState().solo).toBeNull();
    expect(useLayers.getState().barSize).toBe("middle");
    expect(barSizeKey()).toBeNull();
  });

  it("drops a solo value that no loaded row holds, and keeps the grouping", () => {
    render(<Probe link={{ by: "org_id", solo: "nobody" }} rows={groupedRows} />);
    expect(useTrackBy.getState().by).toBe("org_id");
    expect(useSolo.getState().solo).toBeNull();
  });

  it("drops a grouping the manifest does not declare, though the rows carry the field", () => {
    render(<Probe link={{ by: "colour", solo: "red" }} rows={groupedRows} />);
    expect(useTrackBy.getState().by).toBeNull();
    expect(useSolo.getState().solo).toBeNull();
    expect(useLayers.getState().barSize).toBe("middle");
  });

  it("drops names that pass the pattern but are not own keys of anything", () => {
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const view = render(<Probe link={{ by: name, solo: "acme" }} rows={groupedRows} />);
      expect(useTrackBy.getState().by).toBeNull();
      expect(useSolo.getState().solo).toBeNull();
      view.unmount();
    }
  });

  it("a solo with no grouping to read it under is dropped", () => {
    useSchema.setState({ rows: undefined });
    render(<Probe link={{ solo: "acme" }} rows={groupedRows} />);
    expect(useSolo.getState().solo).toBeNull();
    expect(useLayers.getState().barSize).toBe("middle");
  });

  it("does not latch a refusal: rows that arrive later are applied", () => {
    const link: ShareLink = { by: "org_id", solo: "acme" };
    const view = render(<Probe link={link} rows={NONE} />);
    expect(useSolo.getState().solo).toBeNull();
    view.rerender(<Probe link={link} rows={groupedRows} />);
    expect(useTrackBy.getState().by).toBe("org_id");
    expect(useSolo.getState().solo).toStrictEqual({ field: "org_id", value: "acme" });
    expect(useLayers.getState().barSize).toBe("open");
  });

  it("applies once: a solo the investigator clears is not put back by later rows", () => {
    const link: ShareLink = { by: "org_id", solo: "acme" };
    const view = render(<Probe link={link} rows={groupedRows} />);
    act(() => useSolo.getState().clear());
    view.rerender(<Probe link={link} rows={{ ...groupedRows, entities: [...(groupedRows.entities ?? [])] }} />);
    expect(useSolo.getState().solo).toBeNull();
  });
});

describe("the address bar and the grouping and the solo", () => {
  const settle = () => act(() => void vi.advanceTimersByTime(400));
  beforeEach(() => {
    declare();
    act(() => usePlayhead.getState().setBounds(T0, T0 + 24 * HOUR));
  });

  it("writes the solo and the grouping in force, and what it writes opens the same state", () => {
    render(<Probe link={{}} rows={groupedRows} />);
    act(() => {
      useTrackBy.getState().setBy("org_id");
      useSolo.getState().toggle("org_id", "acme");
    });
    settle();
    expect(written()).toMatchObject({ by: "org_id", solo: "acme" });
  });

  it("follows a solo that is cleared", () => {
    render(<Probe link={{}} rows={groupedRows} />);
    act(() => useSolo.getState().toggle("org_id", "acme"));
    settle();
    expect(written().solo).toBe("acme");
    act(() => useSolo.getState().clear());
    settle();
    expect(written().solo).toBeUndefined();
  });

  it("leaves `by` out when the manifest's own grouping is in force", () => {
    render(<Probe link={{}} rows={groupedRows} />);
    act(() => useSolo.getState().toggle("org_id", "acme"));
    settle();
    expect(written()).toMatchObject({ solo: "acme" });
    expect(address()).not.toContain("by=");
  });

  it("leaves a solo out when its field is not the grouping in force", () => {
    render(<Probe link={{}} rows={groupedRows} />);
    act(() => {
      useSolo.getState().toggle("colour", "red");
      useTrackBy.getState().setBy("org_id");
    });
    settle();
    expect(address()).toContain("by=org_id");
    expect(address()).not.toContain("solo=");
  });

  it("carries no size, fold, depth or setting key", () => {
    useLayers.setState({ barSize: "line", collapsedLanes: ["usage"] });
    render(<Probe link={{ by: "org_id", solo: "acme" }} rows={groupedRows} />);
    act(() => usePlayhead.getState().setPlayhead(T0 + HOUR));
    settle();
    const keys = [...new URLSearchParams(String(address())).keys()].sort();
    expect(keys).toEqual(["by", "color", "scenario", "solo", "t", "theme"]);
    expect(address()).not.toMatch(/size|fold|depth|collapsed|lane/i);
  });
});

describe("linkOpensCase", () => {
  it("is true for a link with a time, or with a selection these rows hold", () => {
    expect(linkOpensCase(rows, { playhead: 5 })).toBe(true);
    expect(linkOpensCase(rows, { sel: "s1" })).toBe(true);
  });

  it("is false for an unknown selection, a record not loaded yet, and a link with no moment", () => {
    expect(linkOpensCase(rows, { sel: "nobody" })).toBe(false);
    expect(linkOpensCase(NONE, { sel: "s1" })).toBe(false);
    expect(linkOpensCase(rows, { scenario: "x", zoom: 3 })).toBe(false);
    expect(linkOpensCase(rows, {})).toBe(false);
  });
});

describe("the address bar", () => {
  const boot = (map: ShareLinkMap | null = null) => {
    act(() => usePlayhead.getState().setBounds(T0, T0 + 24 * HOUR));
    render(<Probe link={{}} rows={rows} map={map} />);
  };
  const settle = () => act(() => void vi.advanceTimersByTime(400));

  it("follows a selection and the playhead once they change", () => {
    boot();
    act(() => {
      usePlayhead.getState().setPlayhead(T0 + 2 * HOUR);
      useSelection.getState().selectEntity(entities[0]);
    });
    settle();
    expect(written()).toMatchObject({ scenario: "pack-x", playhead: T0 + 2 * HOUR, sel: "s1" });
  });

  it("is not written while playing, and is written when playback stops", () => {
    boot();
    act(() => usePlayhead.setState({ isPlaying: true }));
    act(() => usePlayhead.getState().setPlayhead(T0 + 3 * HOUR));
    settle();
    expect(replace()).not.toHaveBeenCalled();
    act(() => usePlayhead.getState().pause());
    settle();
    expect(written().playhead).toBe(T0 + 3 * HOUR);
  });

  it("is not written during a scrub, and is written when the scrub ends", () => {
    boot();
    act(() => usePlayhead.getState().setScrubbing(true));
    act(() => usePlayhead.getState().setPlayhead(T0 + 4 * HOUR));
    settle();
    expect(replace()).not.toHaveBeenCalled();
    act(() => usePlayhead.getState().setScrubbing(false));
    settle();
    expect(written().playhead).toBe(T0 + 4 * HOUR);
  });

  it("carries the marks, and what it writes opens the same state", () => {
    boot();
    act(() => {
      usePlayhead.getState().setPlayhead(T0 + 2 * HOUR);
      usePlayhead.getState().toggleMark();
      usePlayhead.getState().setPlayhead(T0 + 5 * HOUR);
      usePlayhead.getState().toggleMark();
    });
    settle();
    expect(written()).toMatchObject({ a: T0 + 2 * HOUR, b: T0 + 5 * HOUR, playhead: T0 + 5 * HOUR });
  });

  it("is written again when a camera move ends", () => {
    const map = fakeMap();
    boot(map);
    settle();
    replace().mockClear();
    act(() => map.moveEnd());
    settle();
    expect(replace()).toHaveBeenCalledTimes(1);
    expect(written()).toMatchObject({ center: [4.9, 52.37], zoom: 3.1 });
  });

  it("is not written while the camera is in flight, so it never holds a passing camera", () => {
    // A step selects the next event at once and flies the camera there over a few seconds.
    const map = fakeMap();
    boot(map);
    settle();
    replace().mockClear();
    act(() => {
      map.startMove();
      usePlayhead.getState().setPlayhead(T0 + 2 * HOUR);
    });
    settle();
    expect(replace()).not.toHaveBeenCalled();
    act(() => map.moveEnd());
    settle();
    expect(written()).toMatchObject({ playhead: T0 + 2 * HOUR, center: [4.9, 52.37] });
  });

  it("gains the camera as soon as the map exists", () => {
    // The map loads after the data, and its first move ends before anything listens for it.
    act(() => usePlayhead.getState().setBounds(T0, T0 + 24 * HOUR));
    const view = render(<Probe link={{}} rows={rows} />);
    settle();
    expect(replace()).not.toHaveBeenCalled();
    view.rerender(<Probe link={{}} rows={rows} map={fakeMap()} />);
    settle();
    expect(written()).toMatchObject({ center: [4.9, 52.37], zoom: 3.1 });
  });

  it("carries the theme when it changes", () => {
    boot();
    act(() => useTheme.setState({ theme: "light" }));
    settle();
    expect(address()).toContain("theme=light");
  });

  it("is not written when bounds arrive: the data loading is not a move by the investigator", () => {
    boot();
    act(() => usePlayhead.getState().setBounds(T0, T0 + 48 * HOUR));
    settle();
    expect(replace()).not.toHaveBeenCalled();
  });

  it("is not written before the active scenario is known, so a boot that re-selects the scenario keeps its link", () => {
    useSchema.setState({ scenarioId: null });
    boot();
    act(() => usePlayhead.getState().setPlayhead(T0 + 2 * HOUR));
    settle();
    expect(replace()).not.toHaveBeenCalled();
  });
});

describe("a scenario pick", () => {
  it("dropShareLink leaves the theme and colour and nothing of the old scenario", () => {
    useTheme.setState({ theme: "light", color: "neon" });
    dropShareLink();
    expect(address()).toBe("?theme=light&color=neon");
  });
});

describe("the link the page was loaded with", () => {
  type Lock = { __ffrCameraLock?: boolean };
  afterEach(() => {
    window.location.href = "http://localhost/";
    delete (window as unknown as Lock).__ffrCameraLock;
  });

  it("is read once at load; a camera in it holds the camera against the scenario's establishing shot", async () => {
    window.location.search = "?scenario=platform-access&zoom=3";
    vi.resetModules();
    const fresh = await import("./useShareLink");
    expect(fresh.openingLink).toMatchObject({ scenario: "platform-access", zoom: 3 });
    expect((window as unknown as Lock).__ffrCameraLock).toBe(true);
  });

  it("a link that carries only a scenario opens the story as a first visit does", async () => {
    // The address a story pick reloads to where site data is blocked: nothing but the scenario.
    window.location.search = "?scenario=platform-access";
    vi.resetModules();
    const fresh = await import("./useShareLink");
    expect(fresh.openingLink).toEqual({ scenario: "platform-access" });
    expect(fresh.linkHoldsCamera).toBe(false); // the establishing shot stays free
    expect((window as unknown as Lock).__ffrCameraLock).toBeUndefined();
    expect(fresh.linkOpensCase(rows, fresh.openingLink)).toBe(false); // the app's own opening focus runs
    fresh.adoptLinkScenario();
    expect(localStorage.getItem("ffr.scenario")).toBe("platform-access");
    act(() => usePlayhead.getState().setBounds(T0, T0 + 24 * HOUR));
    render(<Probe link={fresh.openingLink} rows={rows} />);
    expect(selectedId()).toBeNull();
    expect(usePlayhead.getState().opening).toBeNull(); // no moment, marks or window handed over
    expect(usePlayhead.getState().playhead).toBe(T0 + 24 * HOUR);
  });

  it("a link with no camera leaves the establishing shot free", async () => {
    window.location.search = "?scenario=platform-access&t=5";
    vi.resetModules();
    await import("./useShareLink");
    expect((window as unknown as Lock).__ffrCameraLock).toBeUndefined();
  });
});

describe("adoptLinkScenario", () => {
  it("makes a link's scenario this browser's choice, and leaves the choice alone when the link names none", () => {
    localStorage.setItem("ffr.scenario", "card-fraud");
    adoptLinkScenario({ playhead: 5 });
    expect(localStorage.getItem("ffr.scenario")).toBe("card-fraud");
    adoptLinkScenario({ scenario: "platform-access" });
    expect(localStorage.getItem("ffr.scenario")).toBe("platform-access");
  });
});
