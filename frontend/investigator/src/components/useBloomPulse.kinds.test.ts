/**
 * useBloomPulse: which maplibre source owns a clicked entity's ack (the kind to source map), where
 * the bloom is welded (the target's [lng, lat]), what tints it, and what gates it. The hook tests
 * in useBloomPulse.test.ts click plain auth transactions and one login only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBloomPulse, type MarkerHandlers } from "./useBloomPulse";
import { useNavigation } from "../store/navigation";
import { useSchema } from "../store/schema";
import { useTheme } from "../store/theme";
import { mlColors } from "../lib/globe/repaint";
import { resolvePalette } from "../theme/resolve";
import type { Entity } from "../lib/entity";
import type { LoginEvent, Place, Transaction } from "../types";
import type { ScenarioNode } from "../lib/scenarios";

const rawManifests = import.meta.glob<string>("../../../../backend/scenarios/*.scenario.json", {
  query: "?raw",
  import: "default",
  eager: true,
});
const platformNodes = (): ScenarioNode[] => {
  const found = Object.values(rawManifests)
    .map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[] })
    .find((m) => m.id === "platform-access");
  if (!found) throw new Error("no scenario file with id platform-access under backend/scenarios");
  return found.nodes;
};

const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
const realMatchMedia = window.matchMedia;

let frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
let clock = 0;

function fireFrame(): void {
  clock += 16;
  act(() => {
    const batch = [...frames.values()];
    frames.clear();
    for (const cb of batch) cb(clock);
  });
}

function makeMap() {
  const setData = vi.fn();
  return {
    style: {},
    getSource: vi.fn(() => ({ setData })),
    getLayer: vi.fn(() => ({ id: "layer" })),
    setFeatureState: vi.fn(),
    setPaintProperty: vi.fn(),
    setData,
  };
}
type FakeMap = ReturnType<typeof makeMap>;

const fraudTx = { id: "tx-fraud", merchant_lng: 11, merchant_lat: 22, is_fraud: 1 } as unknown as Transaction;
const authTx = { id: "tx-auth", merchant_lng: 33, merchant_lat: 44, is_fraud: 0 } as unknown as Transaction;
const login = { id: "lg-1", ip_lng: 55, ip_lat: 66 } as unknown as LoginEvent;
const place = { id: "pl-1", lng: 77, lat: 88 } as unknown as Place;
const generic = {
  id: "gen-1", kind: "shipment", timestamp: 0, coords: { lng: 99, lat: 12 }, fields: {},
  displayMetadata: { primaryLabel: "gen-1", secondaryLabel: "", paletteKind: "shipment", pivotableFields: [] },
} as unknown as Entity;

function mount(map: FakeMap, loaded = true, genericEntities: Entity[] = [generic]) {
  const handlers: MarkerHandlers = {
    transactions: [fraudTx, authTx],
    logins: [login],
    places: [place],
    genericEntities,
    navigate: vi.fn(),
  };
  return renderHook(() =>
    useBloomPulse({
      mapRef: { current: map as never },
      mapLoadedRef: { current: loaded },
      markerHandlersRef: { current: handlers },
    }),
  );
}

/** Click an entity, then run a few frames so the ack and the bloom have written. */
function click(id: string): void {
  act(() => {
    useNavigation.setState((s) => ({ pulseEntityId: id, pulseToken: s.pulseToken + 1 }));
  });
  for (let i = 0; i < 4; i++) fireFrame();
}

function ackSources(map: FakeMap, id: string): string[] {
  return map.setFeatureState.mock.calls
    .filter(([t]) => (t as { id: string }).id === id)
    .map(([t]) => (t as { source: string }).source);
}

beforeEach(() => {
  frames = new Map();
  frameId = 0;
  clock = 5_000;
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    frameId += 1;
    frames.set(frameId, cb);
    return frameId;
  };
  window.cancelAnimationFrame = (id: number): void => {
    frames.delete(id);
  };
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia;
  useNavigation.setState({ pulseEntityId: null, pulseToken: 0 });
  useSchema.setState({ nodes: [] });
});
afterEach(() => {
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCaf;
  window.matchMedia = realMatchMedia;
  useNavigation.setState({ pulseEntityId: null, pulseToken: 0 });
  useSchema.setState({ nodes: [] });
});

describe("useBloomPulse kind to source", () => {
  // kills Z12 (a fraud marker's ack goes to the login source); closes G12.
  it("acks a fraud transaction on the auth source, a login on logins, a place on places, a generic entity on generic", () => {
    const cases: Array<[string, string]> = [
      ["tx-fraud", "ml-auths"],
      ["tx-auth", "ml-auths"],
      ["lg-1", "ml-logins"],
      ["pl-1", "ml-places"],
      ["gen-1", "ml-generic"],
    ];
    for (const [id, source] of cases) {
      const map = makeMap();
      const view = mount(map);
      click(id);
      const sources = ackSources(map, id);
      expect(sources.length, `${id} wrote an ack`).toBeGreaterThan(0);
      expect(new Set(sources), id).toEqual(new Set([source]));
      view.unmount();
      act(() => useNavigation.setState({ pulseEntityId: null }));
    }
  });
});

describe("useBloomPulse bloom position and tint", () => {
  const { theme, color } = useTheme.getState();
  const palette = () => mlColors(resolvePalette(useTheme.getState().theme, useTheme.getState().color));

  it("welds the bloom at [lng, lat] of the clicked entity", () => {
    const wants: Array<[string, [number, number]]> = [
      ["tx-fraud", [11, 22]],
      ["lg-1", [55, 66]],
      ["pl-1", [77, 88]],
      ["gen-1", [99, 12]],
    ];
    for (const [id, coords] of wants) {
      const map = makeMap();
      const view = mount(map);
      click(id);
      expect(map.setData, id).toHaveBeenCalledTimes(1);
      const fc = map.setData.mock.calls[0][0] as GeoJSON.FeatureCollection;
      expect(fc.features, id).toHaveLength(1);
      expect((fc.features[0].geometry as GeoJSON.Point).coordinates, id).toEqual(coords);
      view.unmount();
      act(() => useNavigation.setState({ pulseEntityId: null }));
    }
    expect(useTheme.getState().theme).toBe(theme);
    expect(useTheme.getState().color).toBe(color);
  });

  it("tints the glow's circle-color and both rings' circle-stroke-color with the kind's colour", () => {
    const wants: Array<[string, string]> = [
      ["tx-fraud", palette().fraud],
      ["tx-auth", palette().auth],
      ["lg-1", palette().login],
      ["pl-1", palette().place],
      ["gen-1", "#808080"], // a generic kind with no schema node falls back to grey
    ];
    for (const [id, tint] of wants) {
      const map = makeMap();
      const view = mount(map);
      click(id);
      const tints = map.setPaintProperty.mock.calls.filter(([, prop]) => /color$/.test(prop as string));
      expect(tints.map(([layer, prop, value]) => [layer, prop, value]), id).toEqual([
        ["ml-bloom-glow", "circle-color", tint],
        ["ml-bloom-inner", "circle-stroke-color", tint],
        ["ml-bloom-outer", "circle-stroke-color", tint],
      ]);
      view.unmount();
      act(() => useNavigation.setState({ pulseEntityId: null }));
    }
    // A fraud and an auth bloom must not share a tint, or the kind test above proves nothing.
    expect(palette().fraud).not.toBe(palette().auth);
  });

  it("tints a generic entity with its schema node's palette", () => {
    useSchema.setState({
      nodes: [{ kind: "shipment", label: "Shipment", palette: "#ffb347", source: "sql", coords: null, timestamp: "at", primary: "${id}" }],
    });
    const map = makeMap();
    const view = mount(map);
    click("gen-1");
    const glow = map.setPaintProperty.mock.calls.find(([layer, prop]) => layer === "ml-bloom-glow" && prop === "circle-color");
    expect(glow?.[2]).toBe("#ffb347");
    view.unmount();
  });

  // Ruling T3: the bloom is the marker's own colour, so it takes the resolver's mark for the live theme and mode.
  it("tints a story kind's bloom with the resolver's mark in the live theme and mode", () => {
    const nodes = platformNodes();
    const signin = { ...generic, id: "gen-2", kind: "console_signin" } as Entity;
    const glowOf = (): unknown => {
      const map = makeMap();
      const view = mount(map, true, [signin]);
      click("gen-2");
      const glow = map.setPaintProperty.mock.calls.find(([layer, prop]) => layer === "ml-bloom-glow" && prop === "circle-color");
      view.unmount();
      act(() => useNavigation.setState({ pulseEntityId: null }));
      return glow?.[2];
    };
    useSchema.setState({ nodes });
    try {
      act(() => useTheme.getState().setTheme("dark"));
      expect(glowOf()).toBe("#7ee787");
      act(() => useTheme.getState().setTheme("light"));
      expect(glowOf()).toBe("#198522");
      act(() => useTheme.getState().setColor("deuteranopia"));
      expect(glowOf()).toBe("#29250a");
    } finally {
      act(() => {
        useTheme.getState().setTheme(theme);
        useTheme.getState().setColor(color);
      });
    }
  });
});

describe("useBloomPulse gates", () => {
  it("an unknown id welds no bloom and acks no marker", () => {
    const map = makeMap();
    const view = mount(map);
    click("no-such-entity");
    expect(frameId).toBeGreaterThan(0); // the pulse did run
    expect(map.setData).not.toHaveBeenCalled();
    expect(map.setFeatureState).not.toHaveBeenCalled();
    expect(map.setPaintProperty.mock.calls.filter(([, prop]) => /color$/.test(prop as string))).toHaveLength(0);
    view.unmount();
  });

  it("with the map not loaded, the bloom is neither positioned nor tinted", () => {
    const map = makeMap();
    const view = mount(map, false);
    click("tx-fraud");
    expect(frameId).toBeGreaterThan(0); // the pulse did run
    expect(map.setData).not.toHaveBeenCalled();
    expect(map.setPaintProperty.mock.calls.filter(([, prop]) => /color$/.test(prop as string))).toHaveLength(0);
    view.unmount();
  });
});
