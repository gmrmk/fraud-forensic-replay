// frontend/investigator/src/hooks/useGlobeTips.test.ts
// The globe's tooltip as a hook. The map's marks are not elements, so the pointer's
// place is asked of the map: one mark under it gives that record's own lines, several give a count
// by kind. A fake map stands in for MapLibre and the tooltip layer's `showTipAt` is a spy. The
// listeners go on unmount, the tooltip goes with them, and no timer is read: the hook binds the
// moment it is given a map, because a layer that is not there yet is simply not asked about.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import { showTipAt } from "../components/ui/Tip";
import { buildGlobeTipIndex } from "../lib/globe-tip";
import { recordLines } from "../lib/time-words";
import { useClockForm } from "../store/clock-form";
import type { Entity } from "../lib/entity";
import { installGlobeTips, useGlobeTips, type GlobeTipMap } from "./useGlobeTips";
import hookSource from "./useGlobeTips.ts?raw";

vi.mock("../components/ui/Tip", () => ({ showTipAt: vi.fn() }));

// The real map is a GlobeTipMap: a type check that fails the build when the hook's narrow type and
// MapLibre's differ, so INT-3 can pass the map it holds.
export const asTipMap = (m: maplibregl.Map): GlobeTipMap => m;

const T0 = Date.parse("2026-06-08T22:37:00Z");
const entity = (id: string, kind: string, fields: Record<string, unknown> = {}): Entity => ({
  id,
  kind,
  timestamp: T0,
  coords: { lat: 1, lng: 2 },
  fields,
  displayMetadata: { primaryLabel: `head ${id}`, secondaryLabel: `second ${id}`, paletteKind: kind, pivotableFields: [] },
});
const NODES = [
  { kind: "usage", label: "Token usage", magnitude: "usd", magnitudeUnit: "USD" },
  { kind: "signin", label: "Console sign-in" },
];
const INDEX = buildGlobeTipIndex([entity("a", "signin"), entity("b", "signin"), entity("u", "usage", { usd: 5 })], NODES);
const accentFor = (kind: string): string => `accent-${kind}`;
const SOURCES = ["ml-auths", "ml-logins", "ml-fraud", "ml-generic"];

type Handler = (e: { point: { x: number; y: number } }) => void;

function fakeMap(layers: { id: string; type: string; source?: string }[], hits: { id: string }[] = []) {
  const handlers = new Map<string, Set<Handler>>();
  const queried: { box: unknown; layers: string[] }[] = [];
  let features = hits;
  const map: GlobeTipMap = {
    getStyle: () => ({ layers }),
    queryRenderedFeatures: (box, opts) => {
      queried.push({ box, layers: [...opts.layers] });
      return features.map((f) => ({ properties: { id: f.id } }));
    },
    getCanvas: () => ({ getBoundingClientRect: () => ({ left: 100, top: 40 }) }),
    on: (type: string, fn: Handler) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(fn);
    },
    off: (type: string, fn: Handler) => {
      handlers.get(type)?.delete(fn);
    },
  } as GlobeTipMap;
  const emit = (type: string, point = { x: 10, y: 20 }) => handlers.get(type)?.forEach((h) => h({ point }));
  const count = () => [...handlers.values()].reduce((n, s) => n + s.size, 0);
  return { map, emit, count, queried, setHits: (h: { id: string }[]) => (features = h) };
}

const LAYERS = [
  { id: "ml-auths-halo", type: "circle", source: "ml-auths" },
  { id: "ml-logins-dot", type: "circle", source: "ml-logins" },
  { id: "ml-places-dot", type: "circle", source: "ml-places" },
  { id: "ml-fraud-label", type: "symbol", source: "ml-fraud" },
  { id: "ml-generic-dot", type: "circle", source: "ml-generic" },
];

const read = () => ({ index: INDEX, accentFor, sources: SOURCES, form: "12h" as const });
const spy = vi.mocked(showTipAt);

beforeEach(() => {
  spy.mockClear();
  useClockForm.setState({ h24: false });
});
afterEach(() => {
  useClockForm.setState({ h24: false });
});

describe("installGlobeTips", () => {
  it("asks only the circle layers of the given sources, in a box of 3 px round the pointer", () => {
    const f = fakeMap(LAYERS, [{ id: "a" }]);
    installGlobeTips(f.map, read);
    f.emit("mousemove", { x: 10, y: 20 });
    expect(f.queried).toEqual([
      { box: [[7, 17], [13, 23]], layers: ["ml-auths-halo", "ml-logins-dot", "ml-generic-dot"] },
    ]);
  });

  it("shows one mark's own lines beside the pointer, as the canvas sits on the page", () => {
    const f = fakeMap(LAYERS, [{ id: "a" }]);
    installGlobeTips(f.map, read);
    f.emit("mousemove", { x: 10, y: 20 });
    expect(spy).toHaveBeenCalledWith(
      { x: 110, y: 60 },
      recordLines("Console sign-in", "head a", "second a", T0, [], "12h"),
      "accent-signin",
    );
  });

  it("counts a mark once however many layers draw it", () => {
    const f = fakeMap(LAYERS, [{ id: "a" }, { id: "a" }, { id: "a" }]);
    installGlobeTips(f.map, read);
    f.emit("mousemove");
    expect(spy.mock.calls[0][1]).toEqual(recordLines("Console sign-in", "head a", "second a", T0, [], "12h"));
  });

  it("counts several marks by kind, with the sum for a kind that has an amount", () => {
    const f = fakeMap(LAYERS, [{ id: "a" }, { id: "b" }, { id: "u" }]);
    installGlobeTips(f.map, read);
    f.emit("mousemove");
    expect(spy.mock.calls[0][1]).toEqual(["3 marks at this place", "Console sign-in 2", "Token usage 1 · 5 USD in all"]);
    expect(spy.mock.calls[0][2]).toBeNull();
  });

  it("hides the tooltip it showed when the pointer moves on to bare globe", () => {
    const f = fakeMap(LAYERS, [{ id: "a" }]);
    installGlobeTips(f.map, read);
    f.emit("mousemove");
    f.setHits([{ id: "not-in-the-index" }]);
    f.emit("mousemove");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(null);
  });

  it("leaves a tooltip it did not show alone: bare globe, mouseout, movestart and dispose send nothing", () => {
    // A tooltip that keyboard focus holds on a node is the layer's, and `showTipAt(null)` would
    // clear it whoever set it (Tip.tsx). Nothing was shown here, so nothing is hidden.
    const f = fakeMap(LAYERS, [{ id: "not-in-the-index" }]);
    const dispose = installGlobeTips(f.map, read);
    f.emit("mousemove");
    f.emit("mouseout");
    f.emit("movestart");
    dispose();
    expect(spy).not.toHaveBeenCalled();
  });

  it("hides once, not again, after it has hidden what it showed", () => {
    const f = fakeMap(LAYERS, [{ id: "a" }]);
    installGlobeTips(f.map, read);
    f.emit("mousemove");
    f.emit("mouseout");
    f.emit("movestart");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("asks nothing and shows nothing while the style holds no layer of those sources", () => {
    const f = fakeMap([{ id: "x", type: "fill", source: "ml-auths" }], [{ id: "a" }]);
    installGlobeTips(f.map, read);
    f.emit("mousemove");
    expect(f.queried).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("hides the tooltip it showed when the pointer leaves the map, and again for a move that starts", () => {
    const f = fakeMap(LAYERS, [{ id: "a" }]);
    installGlobeTips(f.map, read);
    f.emit("mousemove");
    f.emit("mouseout");
    f.emit("mousemove");
    f.emit("movestart");
    expect(spy.mock.calls.map((c) => c[0] === null)).toEqual([false, true, false, true]);
  });

  it("removes every listener, and hides the tooltip it showed, when disposed", () => {
    const f = fakeMap(LAYERS, [{ id: "a" }]);
    const dispose = installGlobeTips(f.map, read);
    f.emit("mousemove");
    expect(f.count()).toBe(3);
    dispose();
    expect(f.count()).toBe(0);
    expect(spy).toHaveBeenLastCalledWith(null);
  });

  it("reads the index, the colour and the clock's form again at each move", () => {
    const f = fakeMap(LAYERS, [{ id: "a" }]);
    let form: "12h" | "24h" = "12h";
    installGlobeTips(f.map, () => ({ ...read(), form }));
    f.emit("mousemove");
    form = "24h";
    f.emit("mousemove");
    expect(spy.mock.calls[0][1]).not.toEqual(spy.mock.calls[1][1]);
    expect(spy.mock.calls[1][1]).toEqual(recordLines("Console sign-in", "head a", "second a", T0, [], "24h"));
  });
});

describe("useGlobeTips", () => {
  it("binds nothing while there is no map, and binds when one is given", () => {
    const f = fakeMap(LAYERS, [{ id: "a" }]);
    const { rerender } = renderHook(({ map }) => useGlobeTips(map, { index: INDEX, accentFor, sources: SOURCES }), {
      initialProps: { map: null as GlobeTipMap | null },
    });
    expect(f.count()).toBe(0);
    rerender({ map: f.map });
    expect(f.count()).toBe(3);
  });

  it("unbinds on unmount and when the map changes", () => {
    const a = fakeMap(LAYERS);
    const b = fakeMap(LAYERS);
    const { rerender, unmount } = renderHook(({ map }) => useGlobeTips(map, { index: INDEX, accentFor, sources: SOURCES }), {
      initialProps: { map: a.map },
    });
    rerender({ map: b.map });
    expect(a.count()).toBe(0);
    expect(b.count()).toBe(3);
    unmount();
    expect(b.count()).toBe(0);
  });

  it("does not bind again when the index changes, and the next move reads the new one", () => {
    const f = fakeMap(LAYERS, [{ id: "c" }]);
    const { rerender } = renderHook(({ index }) => useGlobeTips(f.map, { index, accentFor, sources: SOURCES }), {
      initialProps: { index: INDEX },
    });
    const next = buildGlobeTipIndex([entity("c", "usage", { usd: 7 })], NODES);
    rerender({ index: next });
    expect(f.count()).toBe(3);
    f.emit("mousemove");
    expect(spy.mock.calls[0][1]?.[0]).toBe("Token usage");
  });

  it("prints the time in the form the clock's switch holds", () => {
    const f = fakeMap(LAYERS, [{ id: "a" }]);
    renderHook(() => useGlobeTips(f.map, { index: INDEX, accentFor, sources: SOURCES }));
    f.emit("mousemove");
    useClockForm.setState({ h24: true });
    f.emit("mousemove");
    expect(spy.mock.calls[0][1]).toEqual(recordLines("Console sign-in", "head a", "second a", T0, [], "12h"));
    expect(spy.mock.calls[1][1]).toEqual(recordLines("Console sign-in", "head a", "second a", T0, [], "24h"));
  });
});

describe("the hook's source", () => {
  it("holds no timer and no clock, and no word of a pack", () => {
    expect(hookSource).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|Date\.now|performance\.now/);
    expect(hookSource).not.toMatch(/Marcus|Priya|credential|transaction|login/i);
  });
});
