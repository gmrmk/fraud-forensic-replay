/**
 * worldBase tests: a fake map records sources, layers, layout changes and
 * subscriptions, and the data loader is a function the test controls.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type maplibregl from "maplibre-gl";
import { VECTOR_SOURCE, WORLD_LAYERS, WORLD_MARK, WORLD_MAX_ZOOM, attachWorldBase, type WorldData } from "./worldBase";

const fc = (n: number): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: Array.from({ length: n }, () => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Point" as const, coordinates: [0, 0] },
  })),
});
const WORLD: WorldData = { ocean: fc(1), borders: fc(2), labels: fc(3) };

interface FakeLayer {
  id: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Style layers given as `{ id, paint, layout }`; everything else the module touches is recorded. */
function makeFakeMap(styleLayers: FakeLayer[]) {
  const layers: FakeLayer[] = styleLayers.map((l) => ({ ...l }));
  const sources: Record<string, unknown> = {};
  const layoutChanges: { id: string; prop: string; value: unknown }[] = [];
  const added: { layer: FakeLayer; before: string | undefined }[] = [];
  const subs: { type: string; fn: (e: unknown) => void; active: boolean }[] = [];
  const loaded = new Set<string>();
  const zoom = { value: 2 };

  const map = {
    getZoom: vi.fn(() => zoom.value),
    on: vi.fn((type: string, fn: (e: unknown) => void) => {
      const sub = { type, fn, active: true };
      subs.push(sub);
      return { unsubscribe: () => void (sub.active = false) };
    }),
    isSourceLoaded: vi.fn((id: string) => loaded.has(id)),
    getLayer: vi.fn((id: string) => layers.find((l) => l.id === id)),
    getStyle: vi.fn(() => ({ layers })),
    getPaintProperty: vi.fn((id: string, prop: string) => layers.find((l) => l.id === id)?.paint?.[prop]),
    getLayoutProperty: vi.fn((id: string, prop: string) => layers.find((l) => l.id === id)?.layout?.[prop]),
    setLayoutProperty: vi.fn((id: string, prop: string, value: unknown) => {
      layoutChanges.push({ id, prop, value });
    }),
    addSource: vi.fn((id: string, spec: unknown) => {
      sources[id] = spec;
    }),
    addLayer: vi.fn((layer: FakeLayer, before?: string) => {
      added.push({ layer, before });
      layers.push(layer);
    }),
  };
  const active = (type: string) => subs.filter((s) => s.type === type && s.active);
  const emit = (type: string, e: unknown = {}) => {
    for (const s of active(type)) s.fn(e);
  };
  return { map: map as unknown as maplibregl.Map, raw: map, layers, sources, layoutChanges, added, loaded, zoom, active, emit };
}

const FULL_STYLE: FakeLayer[] = [
  { id: "background" },
  { id: "ml-ocean-base" },
  { id: "natural_earth" },
  { id: "water", paint: { "fill-color": "rgb(1,2,3)" } },
  { id: "boundary_2", paint: { "line-color": "#112233" } },
  {
    id: "label_country_1",
    layout: {
      "text-font": ["Noto Sans Italic"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 1, 9, 5, 14],
      "text-max-width": 7,
    },
    paint: { "text-color": "#abcdef", "text-halo-color": "#010101", "text-halo-width": 2, "text-halo-blur": 0 },
  },
  { id: "label_country_2" },
  { id: "label_country_3" },
];

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const addedById = (f: ReturnType<typeof makeFakeMap>, id: string) => f.added.find((a) => a.layer.id === id);

beforeEach(() => {
  performance.clearMarks(WORLD_MARK);
});

describe("attachWorldBase: adding the layers", () => {
  it("adds three sources and three layers with the spec ids, matching data and maxzoom 6", async () => {
    const f = makeFakeMap(FULL_STYLE);
    attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    expect(WORLD_LAYERS).toEqual(["ml-world-ocean", "ml-world-borders", "ml-world-labels"]);
    expect(Object.keys(f.sources).sort()).toEqual([...WORLD_LAYERS].sort());
    expect((f.sources["ml-world-ocean"] as { data: unknown }).data).toBe(WORLD.ocean);
    expect((f.sources["ml-world-borders"] as { data: unknown }).data).toBe(WORLD.borders);
    expect((f.sources["ml-world-labels"] as { data: unknown }).data).toBe(WORLD.labels);
    for (const id of WORLD_LAYERS) {
      const a = addedById(f, id)!;
      expect(a.layer.maxzoom).toBe(6);
      expect(a.layer.source).toBe(id);
    }
    expect(addedById(f, "ml-world-ocean")!.layer.type).toBe("fill");
    expect(addedById(f, "ml-world-borders")!.layer.type).toBe("line");
    expect(addedById(f, "ml-world-labels")!.layer.type).toBe("symbol");
  });

  it("inserts ocean and borders before the first style layer that is not background or ml-ocean-base; labels before label_country_3", async () => {
    const f = makeFakeMap(FULL_STYLE);
    attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    expect(addedById(f, "ml-world-ocean")!.before).toBe("natural_earth");
    expect(addedById(f, "ml-world-borders")!.before).toBe("natural_earth");
    expect(addedById(f, "ml-world-labels")!.before).toBe("label_country_3");
  });

  it("puts labels on top when label_country_3 is missing", async () => {
    const f = makeFakeMap(FULL_STYLE.filter((l) => l.id !== "label_country_3"));
    attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    expect(addedById(f, "ml-world-labels")!.before).toBeUndefined();
  });

  it("copies every property in the table from the style, expressions included", async () => {
    const f = makeFakeMap(FULL_STYLE);
    attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    const ocean = addedById(f, "ml-world-ocean")!.layer;
    expect(ocean.paint).toEqual({ "fill-color": "rgb(1,2,3)" });
    const borders = addedById(f, "ml-world-borders")!.layer;
    expect(borders.paint).toEqual({ "line-color": "#112233", "line-width": 1, "line-opacity": 0.6 });
    const labels = addedById(f, "ml-world-labels")!.layer;
    expect(labels.layout).toEqual({
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Italic"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 1, 9, 5, 14],
      "text-max-width": 7,
    });
    expect(labels.paint).toEqual({
      "text-color": "#abcdef",
      "text-halo-color": "#010101",
      "text-halo-width": 2,
      "text-halo-blur": 0,
    });
  });

  it("uses every fallback when the layers read from are missing", async () => {
    const f = makeFakeMap([{ id: "background" }, { id: "ml-ocean-base" }, { id: "land" }]);
    attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    expect(addedById(f, "ml-world-ocean")!.layer.paint).toEqual({ "fill-color": "#9ebdff" });
    expect(addedById(f, "ml-world-borders")!.layer.paint).toEqual({
      "line-color": "#6b6a6d",
      "line-width": 1,
      "line-opacity": 0.6,
    });
    const labels = addedById(f, "ml-world-labels")!.layer;
    expect(labels.layout).toEqual({
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 11,
      "text-max-width": 6.25,
    });
    expect(labels.paint).toEqual({
      "text-color": "#000",
      "text-halo-color": "#fff",
      "text-halo-width": 1,
      "text-halo-blur": 1,
    });
  });

  it("uses the fallback for a property the style layer exists but leaves undefined", async () => {
    const f = makeFakeMap([{ id: "background" }, { id: "water" }, { id: "label_country_1" }]);
    attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    expect(addedById(f, "ml-world-ocean")!.layer.paint).toEqual({ "fill-color": "#9ebdff" });
    expect((addedById(f, "ml-world-labels")!.layer.layout as Record<string, unknown>)["text-size"]).toBe(11);
  });

  it("adds the layers again on a fresh fake style (a theme swap)", async () => {
    const first = makeFakeMap(FULL_STYLE);
    attachWorldBase(first.map, () => Promise.resolve(WORLD));
    await flush();
    const second = makeFakeMap(FULL_STYLE);
    attachWorldBase(second.map, () => Promise.resolve(WORLD));
    await flush();
    expect(first.added).toHaveLength(3);
    expect(second.added).toHaveLength(3);
  });

  it("adds nothing and does not throw when the load rejects", async () => {
    const f = makeFakeMap(FULL_STYLE);
    expect(() => attachWorldBase(f.map, () => Promise.reject(new Error("offline")))).not.toThrow();
    await flush();
    expect(f.added).toHaveLength(0);
    expect(Object.keys(f.sources)).toHaveLength(0);
  });
});

describe("attachWorldBase: a style replaced before the data arrives", () => {
  it("adds nothing while the map has no loaded style (a theme swap is under way)", async () => {
    const f = makeFakeMap(FULL_STYLE);
    f.raw.getStyle.mockReturnValue(undefined as unknown as { layers: FakeLayer[] });
    f.raw.addSource.mockImplementation(() => {
      throw new Error("Style is not done loading");
    });
    attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    expect(f.raw.addSource).not.toHaveBeenCalled();
    expect(f.added).toHaveLength(0);
  });
});

describe("attachWorldBase: the performance mark", () => {
  const marks = () => performance.getEntriesByName(WORLD_MARK);

  it("is set on the first render with all three world sources loaded, and only once across two attaches", async () => {
    const a = makeFakeMap(FULL_STYLE);
    attachWorldBase(a.map, () => Promise.resolve(WORLD));
    await flush();
    a.emit("render");
    expect(marks()).toHaveLength(0);
    a.loaded.add("ml-world-ocean");
    a.loaded.add("ml-world-borders");
    a.emit("render");
    expect(marks()).toHaveLength(0); // the names are not in yet
    a.loaded.add("ml-world-labels");
    a.emit("render");
    expect(marks()).toHaveLength(1);
    expect(a.active("render")).toHaveLength(0);

    const b = makeFakeMap(FULL_STYLE);
    attachWorldBase(b.map, () => Promise.resolve(WORLD));
    await flush();
    for (const id of WORLD_LAYERS) b.loaded.add(id);
    b.emit("render");
    expect(marks()).toHaveLength(1);
  });

  it("is not set for a layer that was hidden before it drew", async () => {
    const f = makeFakeMap(FULL_STYLE);
    attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    f.loaded.add(VECTOR_SOURCE);
    f.emit("sourcedata", { sourceId: VECTOR_SOURCE, tile: {} });
    for (const id of WORLD_LAYERS) f.loaded.add(id); // a hidden layer's source counts as loaded
    f.emit("render");
    expect(marks()).toHaveLength(0);
    expect(f.active("render")).toHaveLength(0);
  });

  it("is not set at a zoom where the layer does not draw", async () => {
    const f = makeFakeMap(FULL_STYLE);
    f.zoom.value = WORLD_MAX_ZOOM;
    attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    for (const id of WORLD_LAYERS) f.loaded.add(id); // an unused source counts as loaded
    f.emit("render");
    expect(marks()).toHaveLength(0);
    f.zoom.value = WORLD_MAX_ZOOM - 0.5;
    f.emit("render");
    expect(marks()).toHaveLength(1);
  });
});

describe("attachWorldBase: hiding once a vector tile has loaded", () => {
  const tileEvent = { sourceId: VECTOR_SOURCE, tile: {} };

  it("ignores another source, an event without a tile, and an event while the vector source is not loaded", async () => {
    const f = makeFakeMap(FULL_STYLE);
    attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    f.loaded.add(VECTOR_SOURCE);
    f.emit("sourcedata", { sourceId: "other", tile: {} });
    f.emit("sourcedata", { sourceId: VECTOR_SOURCE });
    f.loaded.delete(VECTOR_SOURCE);
    f.emit("sourcedata", tileEvent);
    expect(f.layoutChanges).toHaveLength(0);
    expect(f.active("sourcedata")).toHaveLength(1);
  });

  it("hides the three layers on the first counting event and removes the subscription", async () => {
    const f = makeFakeMap(FULL_STYLE);
    attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    f.loaded.add(VECTOR_SOURCE);
    f.emit("sourcedata", tileEvent);
    expect(f.layoutChanges).toEqual(
      WORLD_LAYERS.map((id) => ({ id, prop: "visibility", value: "none" })),
    );
    expect(f.active("sourcedata")).toHaveLength(0);
  });

  it("adds nothing when a counting event came before the data arrived", async () => {
    const f = makeFakeMap(FULL_STYLE);
    let resolve!: (w: WorldData) => void;
    attachWorldBase(f.map, () => new Promise<WorldData>((r) => (resolve = r)));
    f.loaded.add(VECTOR_SOURCE);
    f.emit("sourcedata", tileEvent);
    resolve(WORLD);
    await flush();
    expect(f.added).toHaveLength(0);
    expect(Object.keys(f.sources)).toHaveLength(0);
  });
});

describe("attachWorldBase: detaching", () => {
  it("adds nothing when detached before the data arrives", async () => {
    const f = makeFakeMap(FULL_STYLE);
    let resolve!: (w: WorldData) => void;
    const detach = attachWorldBase(f.map, () => new Promise<WorldData>((r) => (resolve = r)));
    detach();
    resolve(WORLD);
    await flush();
    expect(f.added).toHaveLength(0);
    expect(f.active("sourcedata")).toHaveLength(0);
  });

  it("removes the remaining subscriptions when detached after the layers were added", async () => {
    const f = makeFakeMap(FULL_STYLE);
    const detach = attachWorldBase(f.map, () => Promise.resolve(WORLD));
    await flush();
    expect(f.active("sourcedata")).toHaveLength(1);
    expect(f.active("render")).toHaveLength(1);
    detach();
    expect(f.active("sourcedata")).toHaveLength(0);
    expect(f.active("render")).toHaveLength(0);
  });
});

describe("loadWorld", () => {
  const okBody = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;
  const good = { source: "ne", ocean: fc(1), borders: fc(1), labels: fc(1) };

  async function fresh() {
    vi.resetModules();
    return import("./worldBase");
  }

  it("rejects on a response that is not OK", async () => {
    const { loadWorld } = await fresh();
    const fetcher = vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response));
    await expect(loadWorld(fetcher as unknown as typeof fetch)).rejects.toThrow();
  });

  it("rejects on a body that is not JSON", async () => {
    const { loadWorld } = await fresh();
    const bad = { ok: true, json: () => Promise.reject(new SyntaxError("x")) } as unknown as Response;
    await expect(loadWorld((() => Promise.resolve(bad)) as unknown as typeof fetch)).rejects.toThrow();
  });

  it("rejects on a response that is not OK even when its body is a valid world file", async () => {
    const { loadWorld } = await fresh();
    const res = { ok: false, status: 500, json: () => Promise.resolve(good) } as unknown as Response;
    await expect(loadWorld((() => Promise.resolve(res)) as unknown as typeof fetch)).rejects.toThrow();
  });

  it.each(["ocean", "borders", "labels"])("rejects when %s is not a FeatureCollection", async (key) => {
    const { loadWorld } = await fresh();
    const fetcher = vi.fn(() => Promise.resolve(okBody({ ...good, [key]: { type: "Feature" } })));
    await expect(loadWorld(fetcher as unknown as typeof fetch)).rejects.toThrow();
  });

  it("returns the same promise for two successful calls and fetches once", async () => {
    const { loadWorld } = await fresh();
    const fetcher = vi.fn(() => Promise.resolve(okBody(good)));
    const a = loadWorld(fetcher as unknown as typeof fetch);
    const b = loadWorld(fetcher as unknown as typeof fetch);
    expect(a).toBe(b);
    await expect(a).resolves.toMatchObject({ ocean: good.ocean });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fetches again after a failure", async () => {
    const { loadWorld, WORLD_URL } = await fresh();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce(okBody(good));
    await expect(loadWorld(fetcher as unknown as typeof fetch)).rejects.toThrow();
    await expect(loadWorld(fetcher as unknown as typeof fetch)).resolves.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith(WORLD_URL);
  });
});
