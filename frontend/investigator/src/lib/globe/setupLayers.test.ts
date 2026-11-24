import { describe, it, expect, vi } from "vitest";
import {
  styleFor,
  txFC,
  loginFC,
  placeFC,
  repopulateGlobeSources,
  hideBusinessPois,
  setupLayers,
  type GlobeSourceData,
} from "./setupLayers";
import { basemapStyle } from "./basemap";
import { resolvePalette } from "../../theme/resolve";
import { tzBandOpacity } from "./tzBands";
import { createPropertyExpression, latest } from "@maplibre/maplibre-gl-style-spec";
import {
  ML_DOT_RADIUS,
  ML_HALO_RADIUS,
  ML_MAGNITUDE_MAX_RADIUS,
  TZ_BAND_FILL_OPACITY,
  TZ_BAND_HIGHLIGHT_OPACITY,
} from "./constants";
import type { LoginEvent, Place, Transaction } from "../../types";
import type maplibregl from "maplibre-gl";

// No test here may fetch the world file: the world layer is a spy.
vi.mock("./worldBase", () => ({ attachWorldBase: vi.fn(() => vi.fn()) }));

// The FC builders read only a few fields, so partial fixtures keep the test
// focused; the cast documents that the rest of the entity is irrelevant here.
const tx = (id: string, lng: number, lat: number, fraud = false): Transaction =>
  ({ id, merchant_lng: lng, merchant_lat: lat, is_fraud: fraud ? 1 : 0 }) as Transaction;
const login = (id: string, lng: number, lat: number): LoginEvent =>
  ({ id, ip_lng: lng, ip_lat: lat }) as LoginEvent;
const place = (id: string, lng: number, lat: number): Place =>
  ({ id, lng, lat }) as Place;

describe("styleFor (the site's own basemap style)", () => {
  const shapes = [
    ["globe", { type: "globe" }],
    ["flat", { type: "mercator" }],
  ] as const;
  describe.each(shapes)("for the %s", (shape, projection) => {
    it.each(["light", "dark", "anything-else"])("%s -> the bundled basemap style built for the shape", (theme) => {
      const style = styleFor(theme, shape);
      expect(style).toEqual(basemapStyle(undefined, shape));
      expect(style.projection).toEqual(projection);
    });
    it("returns a fresh object on every call", () => {
      expect(styleFor("dark", shape)).not.toBe(styleFor("dark", shape));
    });
  });
});

// ── FC builders ───────────────────────────────────────────────────────────────
describe("txFC", () => {
  it("promotes id to a feature property and stamps is_fraud 0/1", () => {
    const fc = txFC([tx("t1", -95, 29, true), tx("t2", 3, 6, false)]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].properties).toEqual({ id: "t1", is_fraud: 1 });
    expect(fc.features[1].properties).toEqual({ id: "t2", is_fraud: 0 });
    expect(fc.features[0].geometry).toEqual({ type: "Point", coordinates: [-95, 29] });
  });
});

describe("loginFC / placeFC", () => {
  it("login uses ip_lng/ip_lat and carries only id", () => {
    const fc = loginFC([login("l1", 10, 20)]);
    expect(fc.features[0].geometry).toEqual({ type: "Point", coordinates: [10, 20] });
    expect(fc.features[0].properties).toEqual({ id: "l1" });
  });
  it("place uses lng/lat and carries only id", () => {
    const fc = placeFC([place("p1", 30, 40)]);
    expect(fc.features[0].geometry).toEqual({ type: "Point", coordinates: [30, 40] });
    expect(fc.features[0].properties).toEqual({ id: "p1" });
  });
});

// ── repopulateGlobeSources (the teardown contract) ──────────────────────────────
// A destructive setStyle recreates every source EMPTY; this helper must re-push
// ALL of them and re-apply visibility. We mock the map's source/layer surface and
// assert on the recorded setData / setLayoutProperty calls (no WebGL needed).
describe("repopulateGlobeSources", () => {
  function makeMockMap() {
    const sources: Record<string, { setData: ReturnType<typeof vi.fn> }> = {};
    const getSource = vi.fn((id: string) => {
      sources[id] ??= { setData: vi.fn() };
      return sources[id];
    });
    const map = {
      getSource,
      getLayer: vi.fn(() => ({})),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      setFilter: vi.fn(),
    } as unknown as maplibregl.Map;
    return { map, sources, getSource };
  }

  // A fixed UTC instant for the playhead-derived tz geometry (2026-06-18 12:00Z).
  const FIXED_PLAYHEAD_MS = Date.UTC(2026, 5, 18, 12, 0, 0);

  const baseData: GlobeSourceData = {
    transactions: [tx("t1", -95, 29, true)],
    logins: [login("l1", 10, 20)],
    places: [place("p1", 30, 40)],
    fraudTransactions: [tx("t1", -95, 29, true)],
    showAuths: true,
    showLogins: true,
    showPlaces: true,
    showTimezone: false,
    tzBands: null,
    playhead: FIXED_PLAYHEAD_MS,
  };

  it("re-pushes data into every globe source after a swap", () => {
    const { map, sources } = makeMockMap();
    repopulateGlobeSources(map, baseData);
    for (const id of ["ml-auths", "ml-logins", "ml-places", "ml-fraud"]) {
      expect(sources[id]?.setData, `${id} should be re-pushed`).toBeDefined();
      expect(sources[id].setData).toHaveBeenCalledTimes(1);
    }
  });

  it("re-pushes the playhead-derived night + terminator tz sources after a swap", () => {
    const { map, sources } = makeMockMap();
    // Night + terminator are recomputed from the snapshot playhead unconditionally
    // (their geometry is playhead-derived, wiped by setStyle), so the rebuild
    // lands the current solar position regardless of the overlay show flag.
    repopulateGlobeSources(map, baseData);
    expect(sources["ml-tz-night"].setData).toHaveBeenCalledTimes(1);
    expect(sources["ml-tz-terminator"].setData).toHaveBeenCalledTimes(1);
  });

  it("re-pushes the offset bands only when the cached FC is present", () => {
    // No cached bands -> ml-tz-bands is not touched (nothing to re-push).
    const a = makeMockMap();
    repopulateGlobeSources(a.map, baseData);
    expect(a.sources["ml-tz-bands"]).toBeUndefined();
    // Cached bands -> re-pushed (no second network fetch on a swap).
    const b = makeMockMap();
    const bands: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    repopulateGlobeSources(b.map, { ...baseData, tzBands: bands });
    expect(b.sources["ml-tz-bands"].setData).toHaveBeenCalledTimes(1);
    expect(b.sources["ml-tz-bands"].setData).toHaveBeenCalledWith(bands);
  });

  it("tz layers visible only when showTimezone", () => {
    const calls = (map: maplibregl.Map) =>
      (map.setLayoutProperty as ReturnType<typeof vi.fn>).mock.calls;
    const vis = (map: maplibregl.Map, id: string) =>
      calls(map).find((c: unknown[]) => c[0] === id)?.[2];
    // case + on -> visible
    const on = makeMockMap();
    repopulateGlobeSources(on.map, { ...baseData, showTimezone: true });
    expect(vis(on.map, "ml-tz-night-layer")).toBe("visible");
    expect(vis(on.map, "ml-tz-band-layer")).toBe("visible");
    expect(vis(on.map, "ml-tz-terminator-layer")).toBe("visible");
    // case + off -> hidden
    const off = makeMockMap();
    repopulateGlobeSources(off.map, baseData);
    expect(vis(off.map, "ml-tz-night-layer")).toBe("none");
  });

  it("the band fill, highlight and label layers follow the same tz visibility gate", () => {
    const calls = (map: maplibregl.Map) =>
      (map.setLayoutProperty as ReturnType<typeof vi.fn>).mock.calls;
    const vis = (map: maplibregl.Map, id: string) =>
      calls(map).find((c: unknown[]) => c[0] === id && c[1] === "visibility")?.[2];
    const ids = ["ml-tz-band-fill-layer", "ml-tz-band-highlight-layer", "ml-tz-band-label-layer"];
    const on = makeMockMap();
    repopulateGlobeSources(on.map, { ...baseData, showTimezone: true });
    for (const id of ids) expect(vis(on.map, id), id).toBe("visible");
  });

  it("re-applies the selected-record band highlight after a swap", () => {
    const { map } = makeMockMap();
    repopulateGlobeSources(map, { ...baseData, tzHighlight: "-6" });
    expect(map.setFilter).toHaveBeenCalledWith("ml-tz-band-highlight-layer", ["==", ["get", "name"], "-6"]);
  });

  // The Authorizations and Logins switches act on the data App hands the globe (the one function in
  // lib/marks/draw), so a selected record of a switched-off kind stays drawn: no call hides these
  // layers, which stay as they were created (visible), and the Places switch alone still hides its layers.
  const markerLayerCalls = (map: maplibregl.Map) =>
    (map.setLayoutProperty as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) =>
      /^ml-(auths|logins|fraud-ping|generic)/.test(String(c[0])),
    );

  it("markers visible whatever the switches", () => {
    const { map } = makeMockMap();
    repopulateGlobeSources(map, baseData);
    const calls = (map.setLayoutProperty as ReturnType<typeof vi.fn>).mock.calls;
    expect(markerLayerCalls(map)).toEqual([]);
    expect(calls.find((c: unknown[]) => c[0] === "ml-places-dot")?.[2]).toBe("visible");
  });

  it("the Logins switch off leaves the login layers visible, as the data alone carries it", () => {
    const { map } = makeMockMap();
    repopulateGlobeSources(map, { ...baseData, showLogins: false });
    expect(markerLayerCalls(map)).toEqual([]);
  });

  it("the Authorizations switch off leaves the authorization layers and the fraud pings visible", () => {
    const { map } = makeMockMap();
    repopulateGlobeSources(map, { ...baseData, showAuths: false });
    expect(markerLayerCalls(map)).toEqual([]);
  });

  it("the Places switch still hides its own layers", () => {
    const { map } = makeMockMap();
    repopulateGlobeSources(map, { ...baseData, showPlaces: false });
    const calls = (map.setLayoutProperty as ReturnType<typeof vi.fn>).mock.calls;
    const vis = (id: string) => calls.find((c: unknown[]) => c[0] === id)?.[2];
    expect(vis("ml-places-dot")).toBe("none");
    expect(vis("ml-places-halo")).toBe("none");
    expect(markerLayerCalls(map)).toEqual([]);
  });
});

// ── setupLayers: timezone layer stack ─────────────────────────────────────────
// A mock map that honours addLayer's beforeId, so the assertion is on the real
// draw order maplibre would build (bottom first), not on call order.
describe("setupLayers timezone layer stack", () => {
  function orderedMap() {
    const order: { id: string; type: string; source?: string }[] = [];
    const map = {
      setProjection: vi.fn(),
      setSky: vi.fn(),
      getLayer: vi.fn((id: string) => order.find((l) => l.id === id)),
      getStyle: vi.fn(() => ({ layers: [] })),
      getSource: vi.fn(() => undefined),
      addSource: vi.fn(),
      addLayer: vi.fn((l: { id: string; type: string; source?: string }, before?: string) => {
        const i = before ? order.findIndex((x) => x.id === before) : -1;
        if (i >= 0) order.splice(i, 0, l);
        else order.push(l);
      }),
      getCanvas: vi.fn(() => ({ style: {} })),
      on: vi.fn(() => ({ unsubscribe: () => {} })),
    } as unknown as maplibregl.Map;
    return { map, order };
  }
  const deps = {
    markerHandlersRef: { current: null },
    pathsRef: { current: [] },
  } as unknown as Parameters<typeof setupLayers>[1];

  it("never sets the projection: the style carries it, and one module applies the shape", () => {
    const { map } = orderedMap();
    setupLayers(map, deps, resolvePalette("dark", "neon"));
    expect(map.setProjection).not.toHaveBeenCalled();
  });

  it("adds no cluster source or layer", () => {
    const { map } = orderedMap();
    setupLayers(map, deps, resolvePalette("dark", "neon"));
    const sources = (map.addSource as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    const layers = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => (c[0] as { id?: string }).id);
    expect(sources).not.toContain("ml-cluster");
    expect(layers).not.toContain("ml-cluster-layer");
  });

  it("adds no heat source or layer", () => {
    const { map } = orderedMap();
    setupLayers(map, deps, resolvePalette("dark", "neon"));
    const sources = (map.addSource as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    const layers = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => (c[0] as { id?: string }).id);
    expect(sources).not.toContain("ml-heat");
    expect(layers).not.toContain("ml-heat-layer");
  });

  it("seats the band fill + highlight under the night fill and the labels on top of the tz stack, all under the markers", () => {
    const { map, order } = orderedMap();
    setupLayers(map, deps, resolvePalette("dark", "neon"));
    const ids = order.map((l) => l.id);
    const tz = ids.filter((id) => id.startsWith("ml-tz-"));
    expect(tz).toEqual([
      "ml-tz-band-fill-layer",
      "ml-tz-band-highlight-layer",
      "ml-tz-night-layer",
      "ml-tz-band-layer",
      "ml-tz-terminator-layer",
      "ml-tz-band-label-layer",
    ]);
    const lastTz = ids.indexOf("ml-tz-band-label-layer");
    for (const above of ["ml-auths-dot", "ml-logins-dot", "ml-generic-dot"]) {
      expect(ids.indexOf(above), above).toBeGreaterThan(lastTz);
    }
  });

  it("the new layers have the right types, read the band source and start hidden", () => {
    const { map, order } = orderedMap();
    setupLayers(map, deps, resolvePalette("light", "neon"));
    const byId = (id: string) => order.find((l) => l.id === id) as unknown as maplibregl.LayerSpecification & {
      source: string;
      layout: Record<string, unknown>;
    };
    expect(byId("ml-tz-band-fill-layer").type).toBe("fill");
    expect(byId("ml-tz-band-highlight-layer").type).toBe("fill");
    expect(byId("ml-tz-band-label-layer").type).toBe("symbol");
    for (const id of ["ml-tz-band-fill-layer", "ml-tz-band-highlight-layer", "ml-tz-band-label-layer"]) {
      expect(byId(id).source, id).toBe("ml-tz-bands");
      expect(byId(id).layout.visibility, id).toBe("none");
    }
    // Labels use the basemap's own glyph stack (OpenFreeMap liberty declares Noto Sans).
    expect(byId("ml-tz-band-label-layer").layout["text-font"]).toEqual(["Noto Sans Regular"]);
    expect(byId("ml-tz-band-label-layer").layout["text-field"]).toEqual(["get", "label"]);
  });

  it("generic markers keep today's radii without a scale and grow with one (run through MapLibre's own evaluator)", () => {
    const { map, order } = orderedMap();
    setupLayers(map, deps, resolvePalette("dark", "neon"));
    const radius = (id: string) => {
      const layer = order.find((l) => l.id === id) as unknown as { paint: Record<string, unknown> };
      const compiled = createPropertyExpression(layer.paint["circle-radius"], latest.paint_circle["circle-radius"]);
      if (compiled.result !== "success") throw new Error(`${id}: ${JSON.stringify(compiled.value)}`);
      return (properties: Record<string, unknown>, state: Record<string, unknown> = {}): number =>
        compiled.value.evaluate({ zoom: 2 }, { type: 1, properties } as never, state);
    };
    const dot = radius("ml-generic-dot");
    const halo = radius("ml-generic-halo");
    // A kind with no magnitude carries no scale: the sizes every pack has today.
    expect([dot({}), halo({})]).toEqual([ML_DOT_RADIUS, ML_HALO_RADIUS]);
    // The pack's largest value draws at the largest radius; a scale of one half at half of it.
    expect([dot({ scale: 1 }), dot({ scale: 0.5 })]).toEqual([ML_MAGNITUDE_MAX_RADIUS, ML_MAGNITUDE_MAX_RADIUS / 2]);
    // A small or absent value never draws smaller than the plain dot.
    expect([dot({ scale: 0.01 }), dot({ scale: 0 })]).toEqual([ML_DOT_RADIUS, ML_DOT_RADIUS]);
    // The halo keeps its margin around the dot (it is the click target), and selection still enlarges the dot.
    expect(halo({ scale: 1 }) - dot({ scale: 1 })).toBe(ML_HALO_RADIUS - ML_DOT_RADIUS);
    expect(dot({ scale: 1 }, { sel: 1.5 })).toBe(ML_MAGNITUDE_MAX_RADIUS * 1.5);
  });

  it("the band fill and highlight fade out by city zoom (a navigate() must not wash the screen in one band)", () => {
    for (const theme of ["dark", "light"] as const) {
      const { map, order } = orderedMap();
      setupLayers(map, deps, resolvePalette(theme, "neon"));
      const opacity = (id: string) =>
        (order.find((l) => l.id === id) as unknown as { paint: Record<string, unknown> }).paint["fill-opacity"];
      expect(opacity("ml-tz-band-fill-layer"), theme).toEqual(tzBandOpacity(TZ_BAND_FILL_OPACITY[theme]));
      expect(opacity("ml-tz-band-highlight-layer"), theme).toEqual(tzBandOpacity(TZ_BAND_HIGHLIGHT_OPACITY[theme]));
    }
  });

  it("labels the globe overview only: the label layer stops below city zoom, the fills do not", () => {
    // A tiled GeoJSON source places one label per tile-clipped polygon part, so without a
    // maxzoom every visible tile at city zoom gets its own "UTC−6" over the street names.
    const { map, order } = orderedMap();
    setupLayers(map, deps, resolvePalette("dark", "neon"));
    const byId = (id: string) => order.find((l) => l.id === id) as { maxzoom?: number };
    expect(byId("ml-tz-band-label-layer").maxzoom).toBe(5);
    expect(byId("ml-tz-band-fill-layer").maxzoom).toBeUndefined();
    expect(byId("ml-tz-band-highlight-layer").maxzoom).toBeUndefined();
  });
});

// Owner rule: every business on screen is fictional. Liberty's POI layers name real businesses from
// z15 (banks, restaurants), so they are hidden; transit stops and everything else stay.
describe("hideBusinessPois", () => {
  it("hides the basemap's business POI layers and nothing else", () => {
    const layers = [
      { id: "poi_r1", type: "symbol", "source-layer": "poi" },
      { id: "poi_r7", type: "symbol", "source-layer": "poi" },
      { id: "poi_r20", type: "symbol", "source-layer": "poi" },
      { id: "poi_transit", type: "symbol", "source-layer": "poi" },
      { id: "road_label", type: "symbol", "source-layer": "transportation_name" },
    ];
    const setLayoutProperty = vi.fn();
    hideBusinessPois({ getStyle: () => ({ layers }), setLayoutProperty } as unknown as maplibregl.Map);
    expect(setLayoutProperty.mock.calls).toEqual([
      ["poi_r1", "visibility", "none"],
      ["poi_r7", "visibility", "none"],
      ["poi_r20", "visibility", "none"],
    ]);
  });
});
