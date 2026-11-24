/**
 * The map side of the investigator's paths: the one source, the four layers and the clearance image
 * (ensureCustomPathLayers), the colour repaint (paintCustomPath) and the line's tooltip (bindLineTip).
 * The map is a fake that keeps what it is given, so these tests say what is asked of the map and in
 * what order, not how the real globe draws it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CPATH, ensureCustomPathLayers, paintCustomPath, bindLineTip, hasCustomPathLayers, pathData, type LineHover } from "./custom-path-map";
import { LINE, PLATE } from "./path-geometry";
import { lineTip } from "../../lib/tooltip-words/paths";

const tips = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("../ui/Tip", () => ({ showTipAt: (...a: unknown[]) => tips.calls.push(a) }));

const INK = { text: "#e0e0e0", bg: "#101010" };
const NEW_INK = { text: "#202020", bg: "#f0f0f0" };

interface Layer {
  id: string;
  type: string;
  source?: string;
  filter?: unknown;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  beforeId?: string;
}

function fakeMap(loaded = true) {
  const log: string[] = [];
  const state = {
    loaded,
    sources: new Map<string, { spec: unknown; setData: ReturnType<typeof vi.fn> }>(),
    layers: [] as Layer[],
    images: new Map<string, { width: number; height: number; data: Uint8Array }>(),
    paint: [] as [string, string, unknown][],
  };
  const map = {
    isStyleLoaded: () => state.loaded,
    getSource: (id: string) => state.sources.get(id),
    addSource: (id: string, spec: unknown) => {
      log.push(`addSource ${id}`);
      state.sources.set(id, { spec, setData: vi.fn() });
    },
    getLayer: (id: string) => state.layers.find((l) => l.id === id),
    addLayer: (spec: Layer, beforeId?: string) => {
      log.push(`addLayer ${spec.id}`);
      state.layers.push({ ...spec, beforeId });
    },
    setPaintProperty: (layer: string, name: string, value: unknown) => {
      log.push(`paint ${layer} ${name}`);
      state.paint.push([layer, name, value]);
    },
    hasImage: (id: string) => state.images.has(id),
    addImage: (id: string, image: { width: number; height: number; data: Uint8Array }) => {
      log.push(`addImage ${id}`);
      state.images.set(id, image);
    },
  };
  return { map, state, log };
}

const EMPTY = pathData([], []);
const layerOf = (s: ReturnType<typeof fakeMap>["state"], id: string) => s.layers.find((l) => l.id === id)!;

describe("ensureCustomPathLayers", () => {
  it("answers false and adds nothing while the style is not loaded", () => {
    const f = fakeMap(false);
    expect(ensureCustomPathLayers(f.map, EMPTY, INK)).toBe(false);
    expect(f.log).toEqual([]);
  });

  it("adds the source once, the image once and the four layers in order, on top of the stack", () => {
    const f = fakeMap();
    expect(ensureCustomPathLayers(f.map, EMPTY, INK)).toBe(true);
    expect([...f.state.sources.keys()]).toEqual([CPATH.source]);
    expect(f.log.filter((l) => l.startsWith("addImage"))).toEqual([`addImage ${CPATH.image}`]);
    expect(f.state.layers.map((l) => l.id)).toEqual([CPATH.casing, CPATH.line, CPATH.hit, CPATH.clear]);
    expect(f.state.layers.every((l) => l.beforeId === undefined)).toBe(true);
    expect(f.state.layers.every((l) => l.source === CPATH.source)).toBe(true);
    // The source before every layer that reads it, the image before the layer that names it.
    expect(f.log.indexOf(`addSource ${CPATH.source}`)).toBeLessThan(f.log.indexOf(`addLayer ${CPATH.casing}`));
    expect(f.log.indexOf(`addImage ${CPATH.image}`)).toBeLessThan(f.log.indexOf(`addLayer ${CPATH.clear}`));
  });

  it("draws the casing: width 4 in the plate-ground ink at 0.55 of the path's strength, the runs only", () => {
    const f = fakeMap();
    ensureCustomPathLayers(f.map, EMPTY, INK);
    const casing = layerOf(f.state, CPATH.casing);
    expect(casing.type).toBe("line");
    expect(casing.filter).toEqual(["==", ["get", "role"], "run"]);
    expect(casing.paint).toMatchObject({
      "line-width": LINE.globe.casingWidth,
      "line-color": INK.bg,
      "line-opacity": ["*", LINE.globe.casingOpacity, ["get", "op"]],
    });
    expect(LINE.globe.casingWidth).toBe(4);
    expect(LINE.globe.casingOpacity).toBe(0.55);
    expect(casing.layout).toMatchObject({ "line-cap": "butt", "line-join": "miter" });
  });

  it("draws the line: width 2, dashes 4 and 1.5, the theme's text ink at 0.9 of the strength, the runs only", () => {
    const f = fakeMap();
    ensureCustomPathLayers(f.map, EMPTY, INK);
    const line = layerOf(f.state, CPATH.line);
    expect(line.type).toBe("line");
    expect(line.filter).toEqual(["==", ["get", "role"], "run"]);
    expect(line.paint).toMatchObject({
      "line-width": 2,
      "line-dasharray": [4, 1.5],
      "line-color": INK.text,
      "line-opacity": ["*", 0.9, ["get", "op"]],
    });
    expect(line.layout).toMatchObject({ "line-cap": "butt", "line-join": "miter" });
  });

  it("holds an invisible hit line 10 px wide over the stretches", () => {
    const f = fakeMap();
    ensureCustomPathLayers(f.map, EMPTY, INK);
    const hit = layerOf(f.state, CPATH.hit);
    expect(hit.type).toBe("line");
    expect(hit.filter).toEqual(["==", ["get", "role"], "seg"]);
    expect(hit.paint).toMatchObject({ "line-width": LINE.globe.hitWidth, "line-opacity": 0 });
    expect(LINE.globe.hitWidth).toBe(10);
  });

  it("holds the clearance symbols: an invisible icon at each first plate that keeps its place against labels", () => {
    const f = fakeMap();
    ensureCustomPathLayers(f.map, EMPTY, INK);
    const clear = layerOf(f.state, CPATH.clear);
    expect(clear.type).toBe("symbol");
    expect(clear.filter).toEqual(["==", ["get", "role"], "plate"]);
    expect(clear.layout).toMatchObject({
      "icon-image": CPATH.image,
      "icon-anchor": "right",
      "icon-offset": [PLATE.globe.offsetX, 0],
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
    });
    expect(PLATE.globe.offsetX).toBe(-12);
  });

  it("adds a transparent image 24 by 13 px", () => {
    const f = fakeMap();
    ensureCustomPathLayers(f.map, EMPTY, INK);
    const image = f.state.images.get(CPATH.image)!;
    expect(image.width).toBe(24);
    expect(image.height).toBe(13);
    expect(image.data).toHaveLength(24 * 13 * 4);
    expect([...image.data].every((v) => v === 0)).toBe(true);
  });

  it("sets the data and adds nothing on a second call", () => {
    const f = fakeMap();
    ensureCustomPathLayers(f.map, EMPTY, INK);
    f.log.length = 0;
    const next = pathData([], []);
    expect(ensureCustomPathLayers(f.map, next, INK)).toBe(true);
    expect(f.log).toEqual([]);
    expect(f.state.sources.get(CPATH.source)!.setData).toHaveBeenCalledWith(next);
  });

  it("sets the data on a source that is in place even while the style is busy (tiles loading, an update pending)", () => {
    // maplibre's isStyleLoaded is false while any source's tiles load or an update is pending, as during
    // a camera fly: a data change made then must still reach the source, and nothing is added.
    const f = fakeMap();
    ensureCustomPathLayers(f.map, EMPTY, INK);
    f.log.length = 0;
    f.state.loaded = false;
    const next = pathData([], []);
    expect(ensureCustomPathLayers(f.map, next, INK)).toBe(true);
    expect(f.log).toEqual([]);
    expect(f.state.sources.get(CPATH.source)!.setData).toHaveBeenCalledWith(next);
  });

  it("adds nothing while the style is busy even with the source in place and a layer missing, and says so", () => {
    const f = fakeMap();
    ensureCustomPathLayers(f.map, EMPTY, INK);
    f.state.layers.pop();
    f.log.length = 0;
    f.state.loaded = false;
    const next = pathData([], []);
    expect(ensureCustomPathLayers(f.map, next, INK)).toBe(false);
    expect(f.log).toEqual([]);
    expect(f.state.sources.get(CPATH.source)!.setData).toHaveBeenCalledWith(next);
  });

  it("puts back what a style swap wiped, and only that", () => {
    const f = fakeMap();
    ensureCustomPathLayers(f.map, EMPTY, INK);
    // setStyle with no diff wipes the source, the layers and the images.
    f.state.sources.clear();
    f.state.layers.length = 0;
    f.state.images.clear();
    f.log.length = 0;
    expect(ensureCustomPathLayers(f.map, EMPTY, INK)).toBe(true);
    expect(f.log).toEqual([
      `addSource ${CPATH.source}`,
      `addImage ${CPATH.image}`,
      `addLayer ${CPATH.casing}`,
      `addLayer ${CPATH.line}`,
      `addLayer ${CPATH.hit}`,
      `addLayer ${CPATH.clear}`,
    ]);
  });
});

describe("hasCustomPathLayers", () => {
  it("is true only with the source and all four layers", () => {
    const f = fakeMap();
    expect(hasCustomPathLayers(f.map)).toBe(false);
    ensureCustomPathLayers(f.map, EMPTY, INK);
    expect(hasCustomPathLayers(f.map)).toBe(true);
    f.state.layers.pop();
    expect(hasCustomPathLayers(f.map)).toBe(false);
  });
});

describe("paintCustomPath", () => {
  it("sets the casing's and the line's colours", () => {
    const f = fakeMap();
    ensureCustomPathLayers(f.map, EMPTY, INK);
    f.state.paint.length = 0;
    paintCustomPath(f.map, NEW_INK);
    expect(f.state.paint).toEqual([
      [CPATH.casing, "line-color", NEW_INK.bg],
      [CPATH.line, "line-color", NEW_INK.text],
    ]);
  });

  it("does nothing when the layers are not there (never added, or wiped by a style swap)", () => {
    const f = fakeMap();
    paintCustomPath(f.map, NEW_INK);
    ensureCustomPathLayers(f.map, EMPTY, INK);
    f.state.loaded = false;
    f.state.layers.length = 0;
    paintCustomPath(f.map, NEW_INK);
    expect(f.state.paint).toEqual([]);
  });

  it("sets the colours on layers that are in place even while the style is busy", () => {
    const f = fakeMap();
    ensureCustomPathLayers(f.map, EMPTY, INK);
    f.state.paint.length = 0;
    f.state.loaded = false;
    paintCustomPath(f.map, NEW_INK);
    expect(f.state.paint).toEqual([
      [CPATH.casing, "line-color", NEW_INK.bg],
      [CPATH.line, "line-color", NEW_INK.text],
    ]);
  });
});

describe("pathData", () => {
  it("is one feature collection of the lines' features, then the plates'", () => {
    const run = {
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: [[0, 0], [1, 1]] as [number, number][] },
      properties: { role: "run" as const, pathId: "p", name: "Path 1", op: 1 },
    };
    const plate = {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [0, 0] as [number, number] },
      properties: { role: "plate" as const, pathId: "p", slot: 0 },
    };
    const fc = pathData([run], [plate]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toEqual([run, plate]);
  });
});

type Handler = (e: LineHover) => void;
function tipMap() {
  const bound: { type: string; layer: string | null; fn: Handler }[] = [];
  const map = {
    on: (type: string, a: string | Handler, b?: Handler) => {
      bound.push(typeof a === "string" ? { type, layer: a, fn: b! } : { type, layer: null, fn: a });
    },
    off: (type: string, a: string | Handler, b?: Handler) => {
      const fn = typeof a === "string" ? b! : a;
      const at = bound.findIndex((h) => h.type === type && h.fn === fn);
      if (at >= 0) bound.splice(at, 1);
    },
    getCanvas: () => ({ getBoundingClientRect: () => ({ left: 10, top: 20 }) }),
  };
  const fire = (type: string, e?: unknown) => [...bound].filter((h) => h.type === type).forEach((h) => h.fn(e as LineHover));
  return { map, bound, fire };
}
const move = (props: Record<string, unknown>) => ({ point: { x: 100, y: 50 }, features: [{ properties: props }] });

describe("bindLineTip", () => {
  beforeEach(() => {
    tips.calls.length = 0;
  });

  it("binds mousemove and mouseleave on the hit layer and movestart on the map", () => {
    const t = tipMap();
    bindLineTip(t.map, lineTip);
    expect(t.bound.map((h) => `${h.type} ${h.layer}`).sort()).toEqual([`mouseleave ${CPATH.hit}`, `mousemove ${CPATH.hit}`, "movestart null"]);
  });

  it("shows the stretch's words beside the pointer, the canvas offset added", () => {
    const t = tipMap();
    bindLineTip(t.map, lineTip);
    t.fire("mousemove", move({ name: "Path 1", from: 2, to: 3 }));
    expect(tips.calls).toEqual([[{ x: 110, y: 70 }, ["Your path, Path 1", "Stop 2 to stop 3"]]]);
  });

  it("names the stops a stretch joins across a stop that is not drawn", () => {
    const t = tipMap();
    bindLineTip(t.map, lineTip);
    t.fire("mousemove", move({ name: "Path 1", from: 1, to: 3 }));
    expect(tips.calls[0][1]).toEqual(["Your path, Path 1", "Stop 1 to stop 3"]);
  });

  it("hides what it showed on leaving and on the map's move, and only that", () => {
    const t = tipMap();
    bindLineTip(t.map, lineTip);
    t.fire("mouseleave");
    t.fire("movestart");
    expect(tips.calls).toEqual([]);
    t.fire("mousemove", move({ name: "Path 1", from: 1, to: 2 }));
    tips.calls.length = 0;
    t.fire("mouseleave");
    expect(tips.calls).toEqual([[null]]);
    t.fire("movestart");
    expect(tips.calls).toEqual([[null]]);
    t.fire("mousemove", move({ name: "Path 1", from: 1, to: 2 }));
    tips.calls.length = 0;
    t.fire("movestart");
    expect(tips.calls).toEqual([[null]]);
  });

  it("shows nothing for a move with no stretch under the pointer", () => {
    const t = tipMap();
    bindLineTip(t.map, lineTip);
    t.fire("mousemove", { point: { x: 1, y: 1 }, features: [] });
    t.fire("mousemove", { point: { x: 1, y: 1 } });
    expect(tips.calls).toEqual([]);
  });

  it("unbinds all three and hides when the returned function is called", () => {
    const t = tipMap();
    const unbind = bindLineTip(t.map, lineTip);
    t.fire("mousemove", move({ name: "Path 1", from: 1, to: 2 }));
    tips.calls.length = 0;
    unbind();
    expect(t.bound).toEqual([]);
    expect(tips.calls).toEqual([[null]]);
  });
});
