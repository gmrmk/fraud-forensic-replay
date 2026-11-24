/**
 * setupLayers listener-lifecycle tests.
 *
 * THE BUG: setupLayers registers marker click + cursor listeners with
 * map.on(type, layerId, fn). Verified against the installed maplibre-gl@5.24.0
 * source:
 *   - Map#on(type, layerId, fn) is a DELEGATED listener: _createDelegatedListener
 *     builds a `delegate` closure and registers it via
 *     this.on(event, delegate) - a MAP-LEVEL (Evented base) listener stored in
 *     this._delegatedListeners on the MAP object, NOT on the style.
 *   - setStyle({diff:false}) -> _updateStyle rebuilds only
 *     this.style (this.style._remove(); this.style = new Style(...)). It NEVER
 *     touches this._delegatedListeners and removes NO map-level listeners.
 * So a destructive theme swap re-runs setupLayers and STACKS a fresh copy of
 * every delegated bind. Layer-scoped listeners leak exactly like top-level ones
 * because both are delegated map-level listeners. After N swaps a single marker
 * click fires its handler N+1 times.
 *
 * THE FIX (explicit lifecycle): setupLayers returns a teardown fn that removes
 * every listener it registered. GlobeMap calls the prior run's teardown before
 * re-running setupLayers on style.load. These tests use a mock map that models
 * maplibre's delegated-listener bookkeeping and assert the live count of
 * delegated listeners does not grow across swap cycles.
 */
import { describe, it, expect, vi } from "vitest";
import { setupLayers } from "./setupLayers";
import { attachWorldBase } from "./worldBase";
import { resolvePalette } from "../../theme/resolve";
import type { LoginEvent, Place, Transaction } from "../../types";
import type maplibregl from "maplibre-gl";
import { useNavigation } from "../../store/navigation";

// The world layer fetches a file; under test it is a spy that returns a spy, so no
// fetch happens and the world layer registers no listeners on the mock map.
vi.mock("./worldBase", () => ({ attachWorldBase: vi.fn(() => vi.fn()) }));

/**
 * Mock map modelling maplibre-gl@5.24's public surface that setupLayers touches,
 * with faithful delegated-listener bookkeeping:
 *   - on(type, layerId, fn) -> a delegated (layer-scoped) listener; tracked in
 *     `delegated`, returns a { unsubscribe } subscription (as maplibre does).
 *   - on(type, fn)          -> a base map-level listener; tracked in `base`.
 *   - off(...) removes the matching entry from whichever registry.
 * The delegated registry is what leaks: setStyle does NOT clear it, so a rebuild
 * without teardown grows it. `liveDelegated()` reports the current count.
 */
function makeMockMap() {
  interface Delegated {
    type: string;
    layerId: string;
    fn: (...a: unknown[]) => void;
  }
  const delegated: Delegated[] = [];
  const base: { type: string; fn: (...a: unknown[]) => void }[] = [];

  const on = vi.fn(
    (type: string, layerIdOrFn: unknown, fn?: (...a: unknown[]) => void) => {
      if (typeof layerIdOrFn === "string" && fn) {
        const entry = { type, layerId: layerIdOrFn, fn };
        delegated.push(entry);
        return {
          unsubscribe: () => {
            const i = delegated.indexOf(entry);
            if (i >= 0) delegated.splice(i, 1);
          },
        };
      }
      base.push({ type, fn: layerIdOrFn as (...a: unknown[]) => void });
      return { unsubscribe: () => {} };
    },
  );

  const off = vi.fn(
    (type: string, layerIdOrFn: unknown, fn?: (...a: unknown[]) => void) => {
      if (typeof layerIdOrFn === "string" && fn) {
        const i = delegated.findIndex(
          (d) => d.type === type && d.layerId === layerIdOrFn && d.fn === fn,
        );
        if (i >= 0) delegated.splice(i, 1);
      } else {
        const i = base.findIndex(
          (b) => b.type === type && b.fn === (layerIdOrFn as unknown),
        );
        if (i >= 0) base.splice(i, 1);
      }
      return map;
    },
  );

  const map = {
    setProjection: vi.fn(),
    setSky: vi.fn(),
    getLayer: vi.fn(() => undefined), // no "background" layer -> skip the void-fix block
    getPaintProperty: vi.fn(() => "#0a0f1a"),
    getStyle: vi.fn(() => ({ layers: [] })),
    getSource: vi.fn(() => undefined),
    getZoom: vi.fn(() => 2),
    getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getCanvas: vi.fn(() => ({ style: {} })),
    on,
    off,
  } as unknown as maplibregl.Map;

  return {
    map,
    on,
    off,
    delegated,
    base,
    liveDelegated: () => delegated.length,
    /** Fire a delegated click on a layer, counting how many handlers run. */
    fireClick: (layerId: string, feature: Record<string, unknown>) => {
      let fired = 0;
      for (const d of delegated) {
        if (d.type === "click" && d.layerId === layerId) {
          fired += 1;
          d.fn({ features: [{ properties: feature }] });
        }
      }
      return fired;
    },
  };
}

const tx = (id: string, lng: number, lat: number, fraud = false): Transaction =>
  ({ id, merchant_lng: lng, merchant_lat: lat, is_fraud: fraud ? 1 : 0 }) as Transaction;

function makeDeps(onTransactionClick: (t: Transaction) => void) {
  const markerHandlersRef = {
    current: {
      transactions: [tx("t1", -95, 29, true)],
      logins: [] as LoginEvent[],
      places: [] as Place[],
      onTransactionClick,
      navigate: useNavigation.getState().navigate,
    },
  };
  const pathsRef = { current: [] };
  return { markerHandlersRef, pathsRef } as unknown as Parameters<
    typeof setupLayers
  >[1];
}

const palette = resolvePalette("dark", "neon");

describe("setupLayers listener lifecycle (ERR-048 / H1)", () => {
  it("returns a teardown function", () => {
    const { map } = makeMockMap();
    const teardown = setupLayers(map, makeDeps(() => {}), palette);
    expect(typeof teardown).toBe("function");
  });

  it("attaches the world layer once with the map, and teardown detaches it once", () => {
    const m = makeMockMap();
    vi.mocked(attachWorldBase).mockClear();
    const teardown = setupLayers(m.map, makeDeps(() => {}), palette);
    expect(attachWorldBase).toHaveBeenCalledTimes(1);
    expect(attachWorldBase).toHaveBeenCalledWith(m.map);
    const detach = vi.mocked(attachWorldBase).mock.results[0]!.value as ReturnType<typeof vi.fn>;
    expect(detach).not.toHaveBeenCalled();
    teardown();
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it("registers delegated marker listeners on the first run", () => {
    const m = makeMockMap();
    setupLayers(m.map, makeDeps(() => {}), palette);
    // 3 marker binds (click+enter+leave = 9)
    expect(m.liveDelegated()).toBe(9);
  });

  it("teardown removes every delegated listener it registered", () => {
    const m = makeMockMap();
    const teardown = setupLayers(m.map, makeDeps(() => {}), palette);
    teardown();
    expect(m.liveDelegated()).toBe(0);
  });

  it("does NOT grow delegated listeners across swap cycles when teardown runs between rebuilds", () => {
    const m = makeMockMap();
    // Initial load.
    let teardown = setupLayers(m.map, makeDeps(() => {}), palette);
    const afterFirst = m.liveDelegated();
    // Three destructive theme swaps: teardown the prior run, then rebuild
    // (mirrors GlobeMap's swapBasemap -> style.load -> teardown + runSetup).
    for (let i = 0; i < 3; i++) {
      teardown();
      teardown = setupLayers(m.map, makeDeps(() => {}), palette);
    }
    expect(m.liveDelegated()).toBe(afterFirst);
  });

  it("a single marker click fires its handler exactly once after N swaps (the bug)", () => {
    const m = makeMockMap();
    const onTransactionClick = vi.fn();
    let teardown = setupLayers(m.map, makeDeps(onTransactionClick), palette);
    for (let i = 0; i < 4; i++) {
      teardown();
      teardown = setupLayers(m.map, makeDeps(onTransactionClick), palette);
    }
    const fired = m.fireClick("ml-auths-halo", { id: "t1" });
    expect(fired).toBe(1);
    expect(onTransactionClick).toHaveBeenCalledTimes(1);
  });
});
