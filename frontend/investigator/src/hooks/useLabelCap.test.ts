/**
 * The label cap's wiring: the filters are set when the style loads, at
 * the destination of a move the app begins through `capMove`, and at the end of every other move
 * (`moveend`); they are set again after a theme switch replaces the style; the listeners go on
 * unmount. A fake map stands in for MapLibre, and a scripted `run` stands in for a flight.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { StyleSpecification } from "maplibre-gl";
import { useLabelCap, installLabelCap, type LabelCapMap } from "./useLabelCap";
import { labelCapLayers, LABEL_CAP_DEG, capPolygon } from "../lib/globe/labelCap";
import libertyText from "../lib/globe/basemap/liberty.json?raw";
import capSource from "../lib/globe/labelCap.ts?raw";
import hookSource from "./useLabelCap.ts?raw";
import globeSource from "../components/GlobeMap.tsx?raw";
import cameraSource from "../components/useCameraMoves.ts?raw";

const shippedStyle = (): StyleSpecification => JSON.parse(libertyText) as StyleSpecification;
const SHIPPED = new Map(labelCapLayers(shippedStyle()).map((l) => [l.id, l.filter]));

const HOUSTON = { lng: -95.37, lat: 29.76 };
const LAGOS = { lng: 3.38, lat: 6.52 };

type Listener = () => void;

/** A map with the calls the hook makes. `swapStyle` is a destructive setStyle: every layer is
 *  back to its shipped filter and `style.load` fires. `setCamera` moves the camera with no event;
 *  `move` ends a move: the camera is set, the map is at rest and `moveend` fires. `flip` changes
 *  the projection the map reports and fires `projectiontransition`, as the library does. */
function fakeMap(opts: { center?: { lng: number; lat: number }; zoom?: number; flat?: boolean } = {}) {
  let center = opts.center ?? { lng: 10, lat: 20 };
  let zoom = opts.zoom ?? 2;
  let moving = false;
  let layersPresent = true;
  let flat = opts.flat ?? false;
  const filters = new Map<string, unknown>(SHIPPED);
  const listeners = new Map<string, Set<Listener>>();
  const setFilter = vi.fn((id: string, f: unknown) => {
    filters.set(id, f ?? undefined);
  });
  const map: LabelCapMap = {
    getCenter: () => center,
    getZoom: () => zoom,
    isMoving: () => moving,
    getLayer: (id) => (layersPresent && filters.has(id) ? { id } : undefined),
    setFilter,
    getProjection: () => ({ type: flat ? "mercator" : "globe" }),
    on: vi.fn((type: string, fn: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    }),
    off: vi.fn((type: string, fn: Listener) => {
      listeners.get(type)?.delete(fn);
    }),
  };
  const emit = (type: string) => [...(listeners.get(type) ?? [])].forEach((fn) => fn());
  const setCamera = (lng: number, lat: number, z?: number) => {
    center = { lng, lat };
    if (z !== undefined) zoom = z;
  };
  return {
    map,
    setFilter,
    filters,
    emit,
    listeners,
    setCamera,
    setMoving: (v: boolean) => {
      moving = v;
    },
    move: (lng: number, lat: number, z?: number) => {
      setCamera(lng, lat, z);
      moving = false;
      emit("moveend");
    },
    wipeStyle: () => SHIPPED.forEach((f, id) => filters.set(id, f)),
    swapStyle: () => {
      SHIPPED.forEach((f, id) => filters.set(id, f));
      emit("style.load");
    },
    setLayersPresent: (v: boolean) => {
      layersPresent = v;
    },
    flip: (toFlat: boolean) => {
      flat = toFlat;
      emit("projectiontransition");
    },
  };
}
type Fake = ReturnType<typeof fakeMap>;

/** A flight begun: the map is moving, no frame has run, no event has fired. */
const startFlight = (m: Fake) => (): void => m.setMoving(true);

/** A flight that stops the one in flight first, as `flyTo` and `easeTo` do on entry: the
 *  interrupted move's `moveend` fires inside the call with the camera part-way, then the new
 *  flight begins. */
const interruptingFlight = (m: Fake, partWay: [number, number]) => (): void => {
  m.move(partWay[0], partWay[1]);
  m.setMoving(true);
};

const withinOf = (m: Fake, id = "label_city"): unknown => (m.filters.get(id) as unknown[])[2];
const expectShipped = (m: Fake) => {
  for (const [id, shipped] of SHIPPED) expect(m.filters.get(id), id).toEqual(shipped);
};

/** Ray casting in the plane of longitude and latitude, as a `within` filter reads a polygon. */
function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function capHolds(within: unknown, lng: number, lat: number): boolean {
  const mp = (within as [string, GeoJSON.MultiPolygon])[1];
  return mp.coordinates.some((poly) => inRing(lng, lat, poly[0]));
}

/** Each layer's filter is its shipped filter, or the shipped filter plus exactly one cap. */
function expectAtMostOneCap(filters: Map<string, unknown>) {
  for (const [id, shipped] of SHIPPED) {
    const f = filters.get(id);
    if (JSON.stringify(f) === JSON.stringify(shipped)) continue;
    expect(Array.isArray(f) && f[0] === "all", `${id} is all(shipped, cap)`).toBe(true);
    const parts = f as unknown[];
    expect(parts).toHaveLength(3);
    expect(parts[1]).toEqual(shipped);
    expect((parts[2] as unknown[])[0]).toBe("within");
    expect(JSON.stringify(f).match(/"within"/g)).toHaveLength(1);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLabelCap", () => {
  it("sets the cap on the ten layers when it is given the loaded map, from the camera's centre", () => {
    const m = fakeMap({ center: { lng: 175, lat: 5 }, zoom: 2 });
    renderHook(() => useLabelCap(m.map, shippedStyle));
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expect([...m.filters.keys()].sort()).toEqual([...SHIPPED.keys()].sort());
    const f = m.filters.get("label_city") as unknown[];
    expect(f[0]).toBe("all");
    expect(f[1]).toEqual(SHIPPED.get("label_city"));
    expect(f[2]).toEqual(["within", capPolygon(175, 5, LABEL_CAP_DEG)]);
    // water_name_point_label has a filter of its own too; a layer with none gets the cap alone
    expect(m.filters.get("label_state")).toBeDefined();
  });

  it("sets the filters at a moveend more than 1 degree from the last cap, and not within 1 degree (a drag)", () => {
    const m = fakeMap();
    renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    m.move(-100, 30);
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expect(withinOf(m, "label_town")).toEqual(["within", capPolygon(-100, 30, LABEL_CAP_DEG)]);
    m.setFilter.mockClear();
    m.move(-100, 30.9); // 0.9 degree from the last set
    expect(m.setFilter).not.toHaveBeenCalled();
    m.move(-100, 31.1); // 1.1 degrees from the last set: the comparison is to the last set, not the last move
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expect(withinOf(m, "label_town")).toEqual(["within", capPolygon(-100, 31.1, LABEL_CAP_DEG)]);
  });

  it("listens to style.load, moveend and projectiontransition and to nothing else, and clears all three on unmount", () => {
    const m = fakeMap();
    const { unmount } = renderHook(() => useLabelCap(m.map, shippedStyle));
    expect([...m.listeners.keys()].sort()).toEqual(["moveend", "projectiontransition", "style.load"]);
    for (const t of ["move", "movestart", "render"]) expect(m.listeners.has(t)).toBe(false);
    expect(m.listeners.get("moveend")!.size).toBe(1);
    expect(m.listeners.get("projectiontransition")!.size).toBe(1);
    expect(m.listeners.get("style.load")!.size).toBe(1);
    unmount();
    expect(m.listeners.get("moveend")!.size).toBe(0);
    expect(m.listeners.get("projectiontransition")!.size).toBe(0);
    expect(m.listeners.get("style.load")!.size).toBe(0);
    m.setFilter.mockClear();
    m.emit("moveend");
    m.emit("projectiontransition");
    m.emit("style.load");
    expect(m.setFilter).not.toHaveBeenCalled();
  });

  it("does nothing while it has no map: capMove calls run once and returns its value", () => {
    const { result } = renderHook(() => useLabelCap(null, shippedStyle));
    const run = vi.fn(() => 42);
    expect(result.current(run, { lng: 1, lat: 2, zoom: 8 })).toBe(42);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("sets the filters again after a theme switch replaces the style (style.load after setStyle)", () => {
    const m = fakeMap({ center: { lng: 30, lat: 40 }, zoom: 2 });
    renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    m.wipeStyle(); // the swap wipes the caps: every layer is back to its shipped filter
    expect(m.filters.get("label_city")).toEqual(SHIPPED.get("label_city"));
    expect(m.setFilter).not.toHaveBeenCalled(); // nothing sets them until the new style has loaded
    m.emit("style.load");
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expect((m.filters.get("label_city") as unknown[])[2]).toEqual(["within", capPolygon(30, 40, LABEL_CAP_DEG)]);
    expectAtMostOneCap(m.filters);
  });

  it("sets all ten at style.load even when the state equals the last one set (forced)", () => {
    const m = fakeMap({ center: { lng: 30, lat: 40 }, zoom: 2 });
    renderHook(() => useLabelCap(m.map, shippedStyle));
    m.move(30.2, 40); // within 1 degree: nothing set, the state stays the one set at install
    m.setFilter.mockClear();
    m.swapStyle();
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expectAtMostOneCap(m.filters);
    expect(withinOf(m)).toEqual(["within", capPolygon(30.2, 40, LABEL_CAP_DEG)]);
  });

  it("never nests the cap: two moves in a row, and a move from below zoom 6 to above it and back", () => {
    const m = fakeMap({ zoom: 2 });
    renderHook(() => useLabelCap(m.map, shippedStyle));
    expectAtMostOneCap(m.filters);
    m.move(5, 5);
    m.move(50, -20);
    expectAtMostOneCap(m.filters);
    m.move(50, -20, 8); // above zoom 6: the shipped filters, exactly
    expectShipped(m);
    m.move(51, -21, 3); // back below
    expectAtMostOneCap(m.filters);
    expect(m.filters.get("label_city")).not.toEqual(SHIPPED.get("label_city"));
    m.swapStyle();
    m.move(1, 1);
    expectAtMostOneCap(m.filters);
  });

  it("reads the shipped filters from the style document, so a re-run of the effect cannot nest a cap", () => {
    const m = fakeMap();
    const first = renderHook(() => useLabelCap(m.map, shippedStyle));
    first.unmount();
    renderHook(() => useLabelCap(m.map, shippedStyle)); // as React strict mode runs an effect twice
    expectAtMostOneCap(m.filters);
    for (const f of m.filters.values()) expect(JSON.stringify(f).match(/"within"/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("skips a layer the style does not have, and does not throw, during a swap", () => {
    const m = fakeMap();
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    m.setLayersPresent(false);
    // a move of more than 1 degree: the missing layers, not the 1 degree rule, keep setFilter uncalled
    expect(() => m.move(-100, 30)).not.toThrow();
    expect(m.setFilter).not.toHaveBeenCalled();
    expect(() => result.current(startFlight(m), { lng: 100, lat: -30 })).not.toThrow();
    expect(m.setFilter).not.toHaveBeenCalled();
  });

  it("is installed by a plain function that returns its own disposer and the capMove helper", () => {
    const m = fakeMap();
    const { dispose, capMove } = installLabelCap(m.map, shippedStyle());
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expect(typeof capMove).toBe("function");
    dispose();
    expect(m.listeners.get("moveend")!.size).toBe(0);
  });

  it("names no layer id: the layers come from the style, in both sources", () => {
    const ids = [...SHIPPED.keys()];
    expect(ids).toHaveLength(10);
    // Plain includes on the full id: the sources may name the `water_name` source layer.
    const named = (src: string): string[] => ids.filter((id) => src.includes(id));
    expect(named(`const L = ["${ids[0]}"];`)).toEqual([ids[0]]); // the check can fail
    expect(named(capSource)).toEqual([]);
    expect(named(hookSource)).toEqual([]);
  });

  it("reads no clock: the camera's centre and zoom are its only inputs", () => {
    const now = vi.spyOn(Date, "now");
    const perf = vi.spyOn(performance, "now");
    const m = fakeMap();
    // The function itself, not through React: React's scheduler reads the clock on its own.
    const { capMove } = installLabelCap(m.map, shippedStyle());
    m.move(1, 2);
    capMove(startFlight(m), { lng: 80, lat: -10, zoom: 9 });
    m.move(80, -10, 9);
    m.swapStyle();
    expect(m.setFilter).toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(perf).not.toHaveBeenCalled();
    for (const src of [capSource, hookSource]) {
      expect(src).not.toMatch(/Date\.now|new Date|performance\.now|setTimeout|setInterval|requestAnimationFrame/);
    }
  });
});

// On the flat map no name runs off a sphere, so every layer keeps its shipped filter.
describe("the label cap on the flat map", () => {
  it("sets no cap when it is installed on the flat map", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2, flat: true });
    renderHook(() => useLabelCap(m.map, shippedStyle));
    expectShipped(m);
  });

  it("hands back the shipped filters at a flip to the flat map, and caps round the camera at a flip back", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    renderHook(() => useLabelCap(m.map, shippedStyle));
    expect(withinOf(m)).toEqual(["within", capPolygon(HOUSTON.lng, HOUSTON.lat, LABEL_CAP_DEG)]);
    m.flip(true);
    expectShipped(m);
    m.flip(false);
    expect(withinOf(m)).toEqual(["within", capPolygon(HOUSTON.lng, HOUSTON.lat, LABEL_CAP_DEG)]);
    expectAtMostOneCap(m.filters);
  });

  it("sets no cap after a theme swap on the flat map", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2, flat: true });
    renderHook(() => useLabelCap(m.map, shippedStyle));
    m.swapStyle();
    expectShipped(m);
  });

  it("sets no cap at a move's destination or at its end on the flat map", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2, flat: true });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    result.current(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat });
    expectShipped(m);
    m.move(LAGOS.lng, LAGOS.lat);
    expectShipped(m);
  });
});

describe("capMove: the cap is set at the move's destination", () => {
  it("1. sets the cap round the target before the move's first frame, not round where the camera is", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    result.current(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat });
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    for (const id of SHIPPED.keys()) {
      const f = m.filters.get(id) as unknown[];
      const within = f[0] === "within" ? f : f[2];
      expect(capHolds(within, LAGOS.lng, LAGOS.lat), `${id} holds the target`).toBe(true);
      expect(capHolds(within, HOUSTON.lng, HOUSTON.lat), `${id} drops the start`).toBe(false);
    }
  });

  it("passes the return value of run through and sets the cap only after run has been called", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    let setsDuringRun = -1;
    const out = result.current(
      () => {
        setsDuringRun = m.setFilter.mock.calls.length;
        m.setMoving(true);
        return "ran";
      },
      { lng: LAGOS.lng, lat: LAGOS.lat },
    );
    expect(out).toBe("ran");
    expect(setsDuringRun).toBe(0);
  });

  it("2a. a flight from zoom 2 to zoom 12 caps at the call and hands back exactly the shipped filters at moveend", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    result.current(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat, zoom: 12 });
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expect(withinOf(m)).toEqual(["within", capPolygon(LAGOS.lng, LAGOS.lat, LABEL_CAP_DEG)]);
    m.setFilter.mockClear();
    m.move(LAGOS.lng, LAGOS.lat, 12);
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expectShipped(m);
  });

  it("2b. a flight from zoom 12 to zoom 12 sets nothing at the call and nothing at moveend", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 12 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    result.current(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat, zoom: 12 });
    m.move(LAGOS.lng, LAGOS.lat, 12);
    expect(m.setFilter).not.toHaveBeenCalled();
  });

  it("2c. a flight from zoom 12 to zoom 3 caps at the call and sets nothing at moveend", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 12 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    result.current(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat, zoom: 3 });
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expect(withinOf(m)).toEqual(["within", capPolygon(LAGOS.lng, LAGOS.lat, LABEL_CAP_DEG)]);
    m.setFilter.mockClear();
    m.move(LAGOS.lng, LAGOS.lat, 3);
    expect(m.setFilter).not.toHaveBeenCalled();
  });

  it("2d. a flight with no named zoom at zoom 12 sets nothing", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 12 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    result.current(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat });
    m.move(LAGOS.lng, LAGOS.lat, 12);
    expect(m.setFilter).not.toHaveBeenCalled();
  });

  it("3. sets the filters once per move, not per frame: 60 move events and the arrival add nothing", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    result.current(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat });
    for (let i = 0; i < 60; i++) {
      m.setCamera(HOUSTON.lng + i * 1.6, HOUSTON.lat - i * 0.4);
      m.emit("move");
    }
    m.move(LAGOS.lng, LAGOS.lat);
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
  });

  it("3b. a call that falls through to a second capMove inside run is still ten calls", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    const to = { lng: LAGOS.lng, lat: LAGOS.lat };
    result.current(() => result.current(startFlight(m), to), to);
    m.move(LAGOS.lng, LAGOS.lat);
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
  });

  it("5. hands back once: a moveend at zoom 8 gives the shipped filters, a second sets nothing, back at zoom 3 caps", () => {
    const m = fakeMap({ zoom: 2 });
    renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    m.move(10, 20, 8);
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expectShipped(m);
    m.setFilter.mockClear();
    m.move(10, 20, 8);
    expect(m.setFilter).not.toHaveBeenCalled();
    m.move(10, 20, 3); // the zoom side changed, the centre did not
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expectAtMostOneCap(m.filters);
    expect(m.filters.get("label_city")).not.toEqual(SHIPPED.get("label_city"));
  });

  it("6. an interrupted move: the stopped flight's moveend inside run leaves the filters round the new target, one pass", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    const X = { lng: 60, lat: 10 };
    const Y = LAGOS;
    result.current(startFlight(m), X);
    m.setCamera(-30, 25); // part-way to X
    m.setFilter.mockClear();
    result.current(interruptingFlight(m, [-30, 25]), Y);
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expect(withinOf(m)).toEqual(["within", capPolygon(Y.lng, Y.lat, LABEL_CAP_DEG)]);
    expectAtMostOneCap(m.filters);
  });

  it("6b. a centre-less move started by the stopped flight's zoomend inside run leaves the filters round the target, one pass", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    const Y = LAGOS;
    result.current(startFlight(m), { lng: 60, lat: 10 });
    m.setCamera(-30, 25);
    m.setFilter.mockClear();
    result.current(() => {
      m.move(-30, 25); // the stopped flight's moveend, camera part-way
      // its zoomend starts a pitch-only ease (no centre), which ends at once at the same centre
      m.setMoving(true);
      m.move(-30, 25);
      m.setMoving(true); // the new flight begins
    }, Y);
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expect(withinOf(m)).toEqual(["within", capPolygon(Y.lng, Y.lat, LABEL_CAP_DEG)]);
  });

  it("7. a move already over: a jump that fires its own moveend at zoom 12 leaves the shipped filters, one pass at most", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    m.setFilter.mockClear();
    result.current(
      () => m.move(LAGOS.lng, LAGOS.lat, 12), // jumpTo: movestart, move and moveend inside the call
      { lng: LAGOS.lng, lat: LAGOS.lat, zoom: 12 },
    );
    expect(m.setFilter.mock.calls.length).toBeLessThanOrEqual(SHIPPED.size);
    expectShipped(m);
  });

  it("8a. style.load in flight (named zoom 4, camera at zoom 2): the ten filters are set round the target", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    result.current(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat, zoom: 4 });
    m.setCamera(-50, 20); // part-way
    m.setFilter.mockClear();
    m.swapStyle();
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    expect(withinOf(m)).toEqual(["within", capPolygon(LAGOS.lng, LAGOS.lat, LABEL_CAP_DEG)]);
    expectAtMostOneCap(m.filters);
  });

  it("8b. style.load late in a flight from zoom 2 to 12 (camera at zoom 10): the shipped filters, and moveend sets nothing", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    result.current(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat, zoom: 12 });
    m.setCamera(LAGOS.lng, LAGOS.lat, 10);
    m.setFilter.mockClear();
    m.swapStyle();
    expectShipped(m);
    m.setFilter.mockClear();
    m.move(LAGOS.lng, LAGOS.lat, 12);
    expect(m.setFilter).not.toHaveBeenCalled();
  });

  it("9. a capMove whose run throws leaves the depth at zero: a later moveend still sets", () => {
    const m = fakeMap();
    const { result } = renderHook(() => useLabelCap(m.map, shippedStyle));
    expect(() =>
      result.current(() => {
        throw new Error("camera call failed");
      }, { lng: 100, lat: -30 }),
    ).toThrow("camera call failed");
    m.setFilter.mockClear();
    m.move(-100, 30);
    expect(m.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
  });

  it("10. in the globe's camera code every flyTo and easeTo call is the body of a capMove arrow, there are three, and GlobeMap holds none", () => {
    // The calls live in useCameraMoves; GlobeMap is read too, so that a camera call added there is seen.
    const source = globeSource + cameraSource;
    const wrapped = source.match(/capMove\(\(\) => \w+\.(flyTo|easeTo)\(/g) ?? [];
    const calls = source.match(/\.(flyTo|easeTo)\(/g) ?? [];
    expect(calls).toHaveLength(3);
    expect(wrapped).toHaveLength(calls.length);
    expect(globeSource.match(/\.(flyTo|easeTo)\(/g) ?? []).toHaveLength(0);
  });

  it("11. reads no clock through a capMove sequence", () => {
    const now = vi.spyOn(Date, "now");
    const perf = vi.spyOn(performance, "now");
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { capMove } = installLabelCap(m.map, shippedStyle());
    capMove(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat, zoom: 12 });
    m.swapStyle();
    m.move(LAGOS.lng, LAGOS.lat, 12);
    expect(now).not.toHaveBeenCalled();
    expect(perf).not.toHaveBeenCalled();
  });

  it("12. capMove is one function across a rerender, a map arriving and a re-install, and acts through the current install only", () => {
    const a = fakeMap({ center: HOUSTON, zoom: 2 });
    const b = fakeMap({ center: HOUSTON, zoom: 2 });
    const { result, rerender, unmount } = renderHook(({ map }: { map: LabelCapMap | null }) => useLabelCap(map, shippedStyle), {
      initialProps: { map: null as LabelCapMap | null },
    });
    const first = result.current;
    rerender({ map: null });
    expect(result.current).toBe(first);
    rerender({ map: a.map });
    expect(result.current).toBe(first);
    a.setFilter.mockClear();
    first(startFlight(a), { lng: LAGOS.lng, lat: LAGOS.lat });
    expect(a.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    // a re-install on another map: the helper stays, and acts through the new install only
    rerender({ map: b.map });
    expect(result.current).toBe(first);
    a.setFilter.mockClear();
    b.setFilter.mockClear();
    first(startFlight(b), { lng: LAGOS.lng, lat: LAGOS.lat });
    expect(a.setFilter).not.toHaveBeenCalled();
    expect(b.setFilter).toHaveBeenCalledTimes(SHIPPED.size);
    // with no install it calls run once and sets nothing
    rerender({ map: null });
    expect(result.current).toBe(first);
    b.setFilter.mockClear();
    const run = vi.fn();
    first(run, { lng: 1, lat: 1 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(b.setFilter).not.toHaveBeenCalled();
    unmount();
  });
});

describe("the options each setFilter call carries (T1)", () => {
  // MapLibre's setFilter(layerId, filter, options) serialises the whole style and validates the
  // filter against it on every call unless options.validate is false (Style._validate). The cap's
  // filters are built here and pinned against MapLibre's own validator in labelCap.test.ts, so each
  // call turns the check off. Nothing else about a call changes: the ten calls and their order.
  it("passes { validate: false } as the third argument of every call, on every path that sets", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { capMove } = installLabelCap(m.map, shippedStyle());
    capMove(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat, zoom: 9 }); // a move the app begins
    m.move(-60, 40, 2); // the moveend of a move the app did not begin
    m.setCamera(-40, 10);
    m.swapStyle(); // a style load
    m.move(0, 60, 8); // across zoom 6: the shipped filters come back
    const calls = m.setFilter.mock.calls as unknown[][];
    expect(calls.length).toBeGreaterThanOrEqual(SHIPPED.size * 4);
    for (const call of calls) expect(call[2], `${String(call[0])} carries the options`).toEqual({ validate: false });
  });

  it("keeps the ten calls of a pass in the style's layer order", () => {
    const m = fakeMap({ center: HOUSTON, zoom: 2 });
    const { capMove } = installLabelCap(m.map, shippedStyle());
    m.setFilter.mockClear();
    capMove(startFlight(m), { lng: LAGOS.lng, lat: LAGOS.lat });
    expect(m.setFilter.mock.calls.map((c) => c[0])).toEqual([...SHIPPED.keys()]);
  });
});
