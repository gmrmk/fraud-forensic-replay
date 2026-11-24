/**
 * The selected-band ref must be current when the bands arrive while the map is not ready
 * (mapLoadedRef false, e.g. a destructive theme swap). Nothing is queued on the map's `load`
 * event: GlobeMap's setup rebuild reads tzHighlightRef and repopulates the sources, so the
 * ref has to be set before the loaded check and nothing is written until the map is ready.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import { useSelection } from "../store/selection";
import { usePlayhead } from "../store/playhead";
import type { Entity } from "../lib/entity";

const square = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Position[] => [
  [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0],
];
const BANDS: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "+1" }, geometry: { type: "Polygon", coordinates: [square(0, 40, 10, 60)] } },
  ],
};
const fetchTzBands = vi.fn(() => Promise.resolve(BANDS));

vi.mock("../lib/globe/setupLayers", () => ({
  fetchTzBands: () => fetchTzBands(),
  terminatorFCs: () => ({
    night: { type: "FeatureCollection", features: [] },
    line: { type: "FeatureCollection", features: [] },
  }),
}));

const { useTimezoneOverlay } = await import("./useTimezoneOverlay");

const amsterdam: Entity = {
  id: "p1", kind: "order", timestamp: 0, coords: { lat: 52.37, lng: 4.9 }, fields: {},
  displayMetadata: { primaryLabel: "", secondaryLabel: "", paletteKind: "order", pivotableFields: [] },
};

const initialPlayhead = usePlayhead.getState().playhead;

afterEach(() => {
  useSelection.setState({ selected: null });
  usePlayhead.setState({ playhead: initialPlayhead });
  vi.restoreAllMocks();
});

describe("useTimezoneOverlay", () => {
  it("bands arriving mid-swap still update the selected-band ref for the rebuild", async () => {
    useSelection.setState({ selected: { kind: "entity", entity: amsterdam } });
    const map = { getSource: vi.fn(), getLayer: vi.fn(), once: vi.fn() } as unknown as maplibregl.Map;
    const tzBandsRef = { current: null as GeoJSON.FeatureCollection | null };
    const tzHighlightRef = { current: null as string | null };
    renderHook(() =>
      useTimezoneOverlay({
        mapRef: { current: map },
        mapLoadedRef: { current: false }, // a destructive swap is in flight
        tzBandsRef,
        tzHighlightRef,
        showTimezone: true,
      }),
    );
    await waitFor(() => expect(tzBandsRef.current).toBe(BANDS));
    expect(tzHighlightRef.current).toBe("+1");
    // Not ready: nothing is queued on load and nothing is written to the map.
    expect(map.once).not.toHaveBeenCalled();
    expect(map.getSource).not.toHaveBeenCalled();
    expect(map.getLayer).not.toHaveBeenCalled();
  });

  it("a ready map gets the bands and the visibility written at once", async () => {
    const setData = vi.fn();
    const setLayoutProperty = vi.fn();
    const known = {
      getSource: vi.fn(() => ({ setData })),
      getLayer: vi.fn(() => ({})),
      setLayoutProperty,
      once: vi.fn(),
    };
    // Any other map call the highlight sync makes (setFilter, setPaintProperty) is a no-op.
    const map = new Proxy(known, {
      get: (t, k) => (k in t ? t[k as keyof typeof t] : vi.fn()),
    }) as unknown as maplibregl.Map;
    renderHook(() =>
      useTimezoneOverlay({
        mapRef: { current: map },
        mapLoadedRef: { current: true },
        tzBandsRef: { current: null as GeoJSON.FeatureCollection | null },
        tzHighlightRef: { current: null as string | null },
        showTimezone: true,
      }),
    );
    await waitFor(() => expect(setData).toHaveBeenCalledWith(BANDS));
    expect(setLayoutProperty).toHaveBeenCalledWith(expect.any(String), "visibility", "visible");
    expect(map.once).not.toHaveBeenCalled();
  });

  it("a playhead change leaves a style-less map alone, and sets data again once the style is back", () => {
    const setNight = vi.fn();
    const setLine = vi.fn();
    const sources: Record<string, { setData: typeof setNight }> = {
      "ml-tz-night": { setData: setNight },
      "ml-tz-terminator": { setData: setLine },
    };
    // A map that is healthy at mount. Later its style goes null and getSource throws, as
    // MapLibre's does while a WebGL context is lost.
    const live = {
      style: {} as object | null,
      getSource: vi.fn((id: string) => sources[id]),
      getLayer: vi.fn(() => ({})),
      setLayoutProperty: vi.fn(),
      once: vi.fn(),
    };
    const map = new Proxy(live, {
      get: (t, k) => (k in t ? t[k as keyof typeof t] : vi.fn()),
    }) as unknown as maplibregl.Map;
    renderHook(() =>
      useTimezoneOverlay({
        mapRef: { current: map },
        mapLoadedRef: { current: true },
        tzBandsRef: { current: BANDS }, // already fetched: nothing lands mid-test
        tzHighlightRef: { current: null as string | null },
        showTimezone: true,
      }),
    );
    expect(setNight).toHaveBeenCalledTimes(1); // the initial push at mount

    // Move the clock past the 125 ms throttle so a playhead change pushes at once.
    let now = performance.now();
    vi.spyOn(performance, "now").mockImplementation(() => (now += 1000));

    live.style = null;
    live.getSource.mockImplementation(() => {
      throw new Error("style is not available");
    });
    expect(() => usePlayhead.setState({ playhead: initialPlayhead + 60_000 })).not.toThrow();
    expect(setNight).toHaveBeenCalledTimes(1);
    expect(setLine).toHaveBeenCalledTimes(1);

    live.style = {};
    live.getSource.mockImplementation((id: string) => sources[id]);
    usePlayhead.setState({ playhead: initialPlayhead + 120_000 });
    expect(setNight).toHaveBeenCalledTimes(2);
    expect(setLine).toHaveBeenCalledTimes(2);
  });

  it("a selection change leaves a style-less map alone, keeps the band for the rebuild, and writes again once the style is back", () => {
    const setFilter = vi.fn();
    const live = {
      style: {} as object | null,
      getSource: vi.fn(() => ({ setData: vi.fn() })),
      getLayer: vi.fn(() => ({})),
      setFilter,
      once: vi.fn(),
    };
    const map = new Proxy(live, {
      get: (t, k) => (k in t ? t[k as keyof typeof t] : vi.fn()),
    }) as unknown as maplibregl.Map;
    const tzHighlightRef = { current: null as string | null };
    renderHook(() =>
      useTimezoneOverlay({
        mapRef: { current: map },
        mapLoadedRef: { current: true },
        tzBandsRef: { current: BANDS }, // already fetched: nothing lands mid-test
        tzHighlightRef,
        showTimezone: true,
      }),
    );
    const atMount = setFilter.mock.calls.length;
    expect(atMount).toBeGreaterThan(0); // the highlight was written while the map was healthy

    // The style goes and getLayer throws, as MapLibre's does while a WebGL context is lost. The
    // selection subscriber runs outside React, so a throw here is caught by nothing.
    live.style = null;
    live.getLayer.mockImplementation(() => {
      throw new Error("style is not available");
    });
    expect(() => useSelection.setState({ selected: { kind: "entity", entity: amsterdam } })).not.toThrow();
    expect(setFilter).toHaveBeenCalledTimes(atMount);
    expect(tzHighlightRef.current).toBe("+1"); // the rebuilt map reads this ref

    live.style = {};
    live.getLayer.mockImplementation(() => ({}));
    useSelection.setState({ selected: null });
    expect(setFilter).toHaveBeenCalledTimes(atMount + 1);
    expect(tzHighlightRef.current).toBeNull();
  });
});
