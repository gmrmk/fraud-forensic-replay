/**
 * The globe layer of the investigator's paths, mounted on a fake map over the real stores: what it asks
 * of the map, which plates it renders and how strongly, and what it does after a style swap. The map is
 * a fake that keeps what it is given and the Marker a recorder, so these tests say what the layer does,
 * not how the real globe draws it (that needs a real render).
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, render } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import { CustomPathGlobeLayer } from "./CustomPathGlobeLayer";
import { CPATH } from "./custom-path-map";
import { AHEAD_OPACITY, DRAFT_ID, DRAFT_OPACITY, UNCHOSEN_OPACITY } from "./path-geometry";
import { usePathSession } from "./path-session";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import { recordNode } from "../../lib/verdict-fixtures";
import { makePath } from "../../lib/notes/test-fixtures";
import { resolvePalette } from "../../theme/resolve";
import { useClockForm } from "../../store/clock-form";
import { useLayers } from "../../store/layers";
import { useMarksStore } from "../../store/marks";
import { useNavigation } from "../../store/navigation";
import { usePivotData } from "../../store/pivot-data";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useTheme } from "../../store/theme";
import { plateLabel } from "../../lib/tooltip-words/paths";

const live = vi.hoisted(() => ({
  markers: [] as { el: HTMLElement; opts: Record<string, unknown>; lngLat: [number, number] | null }[],
  words: 0,
}));

vi.mock("maplibre-gl", () => {
  class Marker {
    el: HTMLElement;
    opts: Record<string, unknown>;
    lngLat: [number, number] | null = null;
    constructor(opts: { element: HTMLElement }) {
      this.el = opts.element;
      this.opts = opts;
    }
    setLngLat(ll: [number, number]) {
      this.lngLat = ll;
      return this;
    }
    addTo(map: { getCanvasContainer(): HTMLElement }) {
      map.getCanvasContainer().appendChild(this.el);
      live.markers.push(this);
      return this;
    }
    remove() {
      this.el.remove();
      live.markers = live.markers.filter((m) => m !== this);
      return this;
    }
  }
  return { default: { Marker }, Marker };
});

// Counts the words built for the plates, so a render of the layer can be counted; the words stay real.
vi.mock("./plate-words", async (orig) => {
  const real = await orig<typeof import("./plate-words")>();
  return {
    ...real,
    plateWords: (...a: Parameters<typeof real.plateWords>) => {
      live.words += 1;
      return real.plateWords(...a);
    },
  };
});

type Handler = (e?: unknown) => void;
interface FakeSource {
  data: GeoJSON.FeatureCollection;
  setData: Mock<[GeoJSON.FeatureCollection], void>;
}

function fakeMap() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const st = {
    loaded: true,
    sources: new Map<string, FakeSource>(),
    layers: [] as { id: string }[],
    images: new Set<string>(),
    paint: [] as [string, string, unknown][],
    plain: [] as { type: string; fn: Handler }[],
    delegated: [] as { type: string; layer: string; fn: Handler }[],
    calls: [] as string[],
  };
  const map = {
    getCanvasContainer: () => container,
    isStyleLoaded: () => st.loaded,
    getSource: (id: string) => st.sources.get(id),
    addSource: (id: string, spec: { data: GeoJSON.FeatureCollection }) => {
      st.calls.push("addSource");
      const source: FakeSource = {
        data: spec.data,
        setData: vi.fn((d: GeoJSON.FeatureCollection) => {
          source.data = d;
        }),
      };
      st.sources.set(id, source);
    },
    getLayer: (id: string) => st.layers.find((l) => l.id === id),
    addLayer: (spec: { id: string }) => {
      st.calls.push("addLayer");
      st.layers.push({ id: spec.id });
    },
    setPaintProperty: (layer: string, name: string, value: unknown) => st.paint.push([layer, name, value]),
    hasImage: (id: string) => st.images.has(id),
    addImage: (id: string) => {
      st.calls.push("addImage");
      st.images.add(id);
    },
    on: (type: string, a: string | Handler, b?: Handler) => {
      if (typeof a === "string") st.delegated.push({ type, layer: a, fn: b! });
      else st.plain.push({ type, fn: a });
    },
    off: (type: string, a: string | Handler, b?: Handler) => {
      if (typeof a === "string") st.delegated = st.delegated.filter((h) => !(h.type === type && h.layer === a && h.fn === b));
      else st.plain = st.plain.filter((h) => !(h.type === type && h.fn === a));
    },
    getCanvas: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
  };
  const fire = (type: string) => [...st.plain].filter((h) => h.type === type).forEach((h) => h.fn());
  /** A style swap: everything the layer added is gone, and the style is loading. */
  const wipe = () => {
    st.sources.clear();
    st.layers.length = 0;
    st.images.clear();
  };
  return { map: map as unknown as maplibregl.Map, st, fire, wipe };
}

/** A Proxy that records every property read on it: the layer must not touch the map at all. */
function touchyMap() {
  const touched: string[] = [];
  const map = new Proxy({}, { get: (_t, k) => (touched.push(String(k)), () => undefined) });
  return { map: map as unknown as maplibregl.Map, touched };
}

const T0 = Date.parse("2026-05-21T14:00:00Z");
const HOUR = 3_600_000;
const row = (n: number) => ({ id: `e${n}`, acct: `a${n}`, gadget: "g", when: new Date(T0 + (n - 1) * HOUR).toISOString(), y: 29.7 + n * 0.05, x: -95.4 + n * 0.1 });
const ENTITIES = [1, 2, 3, 4].map((n) => manifestRowToEntity(recordNode, row(n)));
const ref = (n: number | string) => ({ kind: "login_like", id: typeof n === "number" ? `e${n}` : n });
const PATH_ID = (c: string) => `path-${c.repeat(32)}`;
const path = (c: string, stops: ReturnType<typeof ref>[], seq = 1, name = `Path ${seq}`) => makePath({ id: PATH_ID(c), seq, name, stops });
const FOUR = [ref(1), ref(2), ref(3), ref(4)];

const sourceData = (f: ReturnType<typeof fakeMap>) => f.st.sources.get(CPATH.source)!.data.features;
const runs = (f: ReturnType<typeof fakeMap>) => sourceData(f).filter((x) => x.properties?.role === "run");
const plateEls = () => live.markers.map((m) => m.el.querySelector("[data-stop-plate]") as HTMLElement);
const label = (el: HTMLElement) => el.textContent;

function resetStores() {
  useSchema.setState({ nodes: [recordNode] });
  usePivotData.setState({ entities: ENTITIES, transactions: [], logins: [], accountEvents: [], transfers: [] });
  useMarksStore.setState({ scenario: "card-fraud", paths: [], nodes: [] });
  usePathSession.setState({ draft: null, hidden: [], chosen: null });
  usePlayhead.setState({ playhead: T0 + 10 * HOUR, minTime: T0, maxTime: T0 + 10 * HOUR, windowMin: T0, windowMax: T0 + 10 * HOUR });
  useLayers.setState({ hiddenKinds: [], hiddenValues: {} });
  useClockForm.setState({ h24: false });
  useTheme.setState({ theme: "dark", color: useTheme.getState().color });
  useNavigation.setState({ navigate: vi.fn() });
}

beforeEach(() => {
  document.body.innerHTML = "";
  live.markers = [];
  live.words = 0;
  resetStores();
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("CustomPathGlobeLayer draws nothing and asks nothing of the map until a path is drawn", () => {
  it("with no saved path and no draft renders nothing and touches no method of the map", () => {
    const m = touchyMap();
    const { container } = render(<CustomPathGlobeLayer map={m.map} />);
    expect(container.innerHTML).toBe("");
    expect(live.markers).toEqual([]);
    expect(m.touched).toEqual([]);
  });

  it("renders nothing and asks nothing with no map yet", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathGlobeLayer map={null} />);
    expect(container.innerHTML).toBe("");
    expect(live.markers).toEqual([]);
  });

  it("with only a hidden path still touches nothing", () => {
    const m = touchyMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    usePathSession.setState({ hidden: [PATH_ID("a")] });
    render(<CustomPathGlobeLayer map={m.map} />);
    expect(m.touched).toEqual([]);
  });
});

describe("CustomPathGlobeLayer draws a saved path", () => {
  it("adds the layers and gives the map the four stops: a run of four points and four plates", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    expect(f.st.layers.map((l) => l.id)).toEqual([CPATH.casing, CPATH.line, CPATH.hit, CPATH.clear]);
    const run = runs(f);
    expect(run).toHaveLength(1);
    expect((run[0].geometry as GeoJSON.LineString).coordinates).toHaveLength(4);
    expect(live.markers).toHaveLength(4);
    expect(plateEls().map(label)).toEqual(["1", "2", "3", "4"]);
  });

  it("puts each plate left of its record's point, level with it, anchored right", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    for (const m of live.markers) expect(m.opts).toMatchObject({ anchor: "right", offset: [-12, 0], opacityWhenCovered: 0 });
    expect(live.markers[0].lngLat).toEqual([ENTITIES[0].coords!.lng, ENTITIES[0].coords!.lat]);
  });

  it("puts the lens on plate 1 only", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    expect(live.markers.map((m) => m.el.querySelectorAll('[data-glyph="lens"]').length)).toEqual([1, 0, 0, 0]);
  });

  it("words each plate: its place in the path, its record and its time, on the button", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    const el = live.markers[1].el;
    expect(el.getAttribute("aria-label")).toBe("Stop 2 of 4, Path 1. Login-like: e2");
    expect(el.getAttribute("data-tip")?.split("\n").slice(0, 2)).toEqual(["Stop 2 of 4, Path 1", "Login-like: e2"]);
    expect(el.getAttribute("data-tip")?.split("\n")[2]).toMatch(/^Time: /);
  });

  it("skips a stop that is not shown: plates 1, 3 and 4 and a run of three points", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", [ref(1), ref("gone"), ref(3), ref(4)])] });
    render(<CustomPathGlobeLayer map={f.map} />);
    expect(plateEls().map(label)).toEqual(["1", "3", "4"]);
    expect((runs(f)[0].geometry as GeoJSON.LineString).coordinates).toHaveLength(3);
  });

  it("skips every stop of a kind the Layers switches leave off", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    useLayers.setState({ hiddenKinds: ["login_like"] });
    render(<CustomPathGlobeLayer map={f.map} />);
    expect(live.markers).toEqual([]);
  });

  it("draws nothing for a path switched off, and draws it again when it is switched on", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    expect(live.markers).toHaveLength(4);
    act(() => usePathSession.getState().toggleHidden(PATH_ID("a")));
    expect(live.markers).toEqual([]);
    expect(sourceData(f)).toEqual([]);
    act(() => usePathSession.getState().toggleHidden(PATH_ID("a")));
    expect(live.markers).toHaveLength(4);
  });

  it("draws a plate at full strength with the path chosen or nothing chosen, and at 0.35 when another path is chosen", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", [ref(1), ref(2)], 1), path("b", [ref(3), ref(4)], 2)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    expect(plateEls().map((p) => p.style.opacity)).toEqual(["", "", "", ""]);
    act(() => usePathSession.getState().choose(PATH_ID("b")));
    expect(plateEls().map((p) => p.style.opacity)).toEqual([String(UNCHOSEN_OPACITY), String(UNCHOSEN_OPACITY), "", ""]);
    const ops = runs(f).map((r) => r.properties?.op);
    expect(ops).toEqual([UNCHOSEN_OPACITY, 1]);
  });

  it("gives the same record's plate in a second path a place below the first", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", [ref(1), ref(2)], 1), path("b", [ref(2), ref(3)], 2)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    expect(live.markers.map((m) => m.opts.offset)).toEqual([[-12, 0], [-12, 0], [-12, 15], [-12, 0]]);
  });

  it("merges two stops of one path at one place into one plate reading both numbers", () => {
    const f = fakeMap();
    const twin = manifestRowToEntity(recordNode, { ...row(5), y: row(1).y, x: row(1).x });
    usePivotData.setState({ entities: [...ENTITIES, twin] });
    useMarksStore.setState({ paths: [path("a", [ref(1), ref(2), ref(5)])] });
    render(<CustomPathGlobeLayer map={f.map} />);
    expect(plateEls().map(label)).toEqual([plateLabel([1, 3]), "2"]);
  });

  it("draws the draft: its plates at full strength and its line at 0.6", () => {
    const f = fakeMap();
    render(<CustomPathGlobeLayer map={f.map} />);
    expect(f.st.layers).toEqual([]);
    act(() => {
      usePathSession.getState().start("Path 1");
      usePathSession.getState().addStop(ref(1));
    });
    // One stop: a plate, no line yet.
    expect(plateEls().map(label)).toEqual(["1"]);
    expect(runs(f)).toEqual([]);
    act(() => {
      usePathSession.getState().addStop(ref(2));
    });
    expect(plateEls().map((p) => p.style.opacity)).toEqual(["", ""]);
    expect(runs(f).map((r) => [r.properties?.pathId, r.properties?.op])).toEqual([[DRAFT_ID, DRAFT_OPACITY]]);
  });
});

describe("CustomPathGlobeLayer and the playhead", () => {
  const AHEAD = String(AHEAD_OPACITY);

  it("dims the plates of the stops after the playhead to 0.45, and keeps the line whole", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    act(() => usePlayhead.setState({ playhead: T0 + 1.5 * HOUR }));
    render(<CustomPathGlobeLayer map={f.map} />);
    expect(plateEls().map((p) => p.style.opacity)).toEqual(["", "", AHEAD, AHEAD]);
    expect(runs(f)[0].properties?.op).toBe(1);
  });

  it("dims nothing before the playhead's bounds have loaded", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    act(() => usePlayhead.setState({ playhead: 0, minTime: 0, maxTime: 0 }));
    render(<CustomPathGlobeLayer map={f.map} />);
    expect(plateEls().map((p) => p.style.opacity)).toEqual(["", "", "", ""]);
  });

  it("does not render again for a playhead move between two stop times, and does when it crosses one", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    act(() => usePlayhead.setState({ playhead: T0 + 1.2 * HOUR }));
    render(<CustomPathGlobeLayer map={f.map} />);
    const built = live.words;
    expect(built).toBeGreaterThanOrEqual(4);
    for (const step of [1.3, 1.5, 1.8, 1.99]) act(() => usePlayhead.setState({ playhead: T0 + step * HOUR }));
    expect(live.words).toBe(built);
    act(() => usePlayhead.setState({ playhead: T0 + 2.5 * HOUR }));
    expect(live.words).toBeGreaterThan(built);
    expect(plateEls().map((p) => p.style.opacity)).toEqual(["", "", "", AHEAD]);
  });
});

describe("CustomPathGlobeLayer's press, mode and theme", () => {
  it("a press on a plate navigates to that stop's record", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    act(() => live.markers[1].el.click());
    const navigate = useNavigation.getState().navigate as unknown as ReturnType<typeof vi.fn>;
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0]).toMatchObject({ kind: "entity", entity: { id: "e2" } });
  });

  it("a press on a merged plate navigates to its first stop", () => {
    const f = fakeMap();
    const twin = manifestRowToEntity(recordNode, { ...row(5), y: row(1).y, x: row(1).x });
    usePivotData.setState({ entities: [...ENTITIES, twin] });
    useMarksStore.setState({ paths: [path("a", [ref(1), ref(2), ref(5)])] });
    render(<CustomPathGlobeLayer map={f.map} />);
    act(() => live.markers[0].el.click());
    const navigate = useNavigation.getState().navigate as unknown as ReturnType<typeof vi.fn>;
    expect(navigate.mock.calls[0][0]).toMatchObject({ entity: { id: "e1" } });
  });

  it("repaints the casing and the line when the theme changes", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    f.st.paint.length = 0;
    act(() => useTheme.setState({ theme: "light" }));
    const ink = resolvePalette("light", useTheme.getState().color).neutral;
    expect(f.st.paint).toEqual([
      [CPATH.casing, "line-color", ink.bg],
      [CPATH.line, "line-color", ink.text],
    ]);
  });

  it("puts the layers back on the map's next idle after a style swap, with the data as it is now", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    f.wipe();
    f.st.loaded = false;
    // While the new style loads the layer asks nothing of the map.
    act(() => useTheme.setState({ theme: "light" }));
    expect(f.st.layers).toEqual([]);
    f.st.loaded = true;
    act(() => f.fire("idle"));
    expect(f.st.layers.map((l) => l.id)).toEqual([CPATH.casing, CPATH.line, CPATH.hit, CPATH.clear]);
    expect(runs(f)).toHaveLength(1);
  });

  it("a change made while the map is busy (a fly after a press) still reaches the source and the paint", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", [ref(1), ref(2)], 1), path("b", [ref(3), ref(4)], 2)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    // isStyleLoaded is false while tiles load or an update is pending; the idle that follows finds the
    // layers in place and does nothing, so a change dropped here would stay dropped.
    f.st.loaded = false;
    act(() => usePathSession.getState().choose(PATH_ID("b")));
    expect(runs(f).map((r) => r.properties?.op)).toEqual([UNCHOSEN_OPACITY, 1]);
    f.st.paint.length = 0;
    act(() => useTheme.setState({ theme: "light" }));
    const ink = resolvePalette("light", useTheme.getState().color).neutral;
    expect(f.st.paint).toEqual([
      [CPATH.casing, "line-color", ink.bg],
      [CPATH.line, "line-color", ink.text],
    ]);
  });

  it("an idle with the layers in place changes nothing, so the data is not set on every idle", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    const setData = f.st.sources.get(CPATH.source)!.setData;
    const before = setData.mock.calls.length;
    const calls = f.st.calls.length;
    act(() => f.fire("idle"));
    act(() => f.fire("idle"));
    expect(setData.mock.calls.length).toBe(before);
    expect(f.st.calls.length).toBe(calls);
  });

  it("binds the line's tooltip once the first path is drawn, and unbinds it with the idle listener on unmount", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const view = render(<CustomPathGlobeLayer map={f.map} />);
    expect(f.st.delegated.map((h) => `${h.type} ${h.layer}`).sort()).toEqual([`mouseleave ${CPATH.hit}`, `mousemove ${CPATH.hit}`]);
    expect(f.st.plain.map((h) => h.type).sort()).toEqual(["idle", "movestart"]);
    view.unmount();
    expect(f.st.delegated).toEqual([]);
    expect(f.st.plain).toEqual([]);
  });

  it("binds the tooltip once, however often the path is drawn again", () => {
    const f = fakeMap();
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    render(<CustomPathGlobeLayer map={f.map} />);
    act(() => usePathSession.getState().choose(PATH_ID("a")));
    act(() => usePathSession.getState().choose(null));
    expect(f.st.delegated).toHaveLength(2);
    expect(f.st.plain.filter((h) => h.type === "idle")).toHaveLength(1);
  });
});
