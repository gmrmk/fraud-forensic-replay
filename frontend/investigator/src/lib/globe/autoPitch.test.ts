import { describe, it, expect, vi } from "vitest";
import { wireAutoPitch, CITY_ZOOM_IN, GLOBE_ZOOM_OUT, CITY_PITCH } from "./autoPitch";
import type { Map as MapLibreMap } from "maplibre-gl";

// Minimal fake map: a settable zoom, a zoomend listener registry, and a spy easeTo.
function fakeMap(initialZoom: number) {
  let zoom = initialZoom;
  const handlers: Array<() => void> = [];
  const easeTo = vi.fn();
  const map = {
    getZoom: () => zoom,
    on: (ev: string, fn: () => void) => { if (ev === "zoomend") handlers.push(fn); },
    off: (ev: string, fn: () => void) => {
      if (ev === "zoomend") {
        const i = handlers.indexOf(fn);
        if (i >= 0) handlers.splice(i, 1);
      }
    },
    easeTo,
  };
  const setZoom = (z: number) => { zoom = z; handlers.forEach((h) => h()); };
  return { map: map as unknown as MapLibreMap, easeTo, setZoom, handlerCount: () => handlers.length };
}

describe("wireAutoPitch", () => {
  it("tilts to the city pitch when zooming into city range", () => {
    const { map, easeTo, setZoom } = fakeMap(2);
    wireAutoPitch(map);
    setZoom(CITY_ZOOM_IN); // cross the tilt-in threshold
    expect(easeTo).toHaveBeenCalledWith({ pitch: CITY_PITCH, duration: expect.any(Number) });
  });

  it("flattens back to pitch 0 when zooming out to globe overview", () => {
    const { map, easeTo, setZoom } = fakeMap(16); // start already in city range
    wireAutoPitch(map);
    setZoom(GLOBE_ZOOM_OUT); // cross the flatten-out threshold
    expect(easeTo).toHaveBeenCalledWith({ pitch: 0, duration: expect.any(Number) });
  });

  it("does not re-fire the tilt while staying in city range (single ease)", () => {
    const { map, easeTo, setZoom } = fakeMap(2);
    wireAutoPitch(map);
    setZoom(15);
    setZoom(16);
    setZoom(17);
    expect(easeTo).toHaveBeenCalledTimes(1);
  });

  it("does nothing in the hysteresis band between the two thresholds", () => {
    const { map, easeTo, setZoom } = fakeMap(2);
    wireAutoPitch(map);
    setZoom((CITY_ZOOM_IN + GLOBE_ZOOM_OUT) / 2); // 12.5 - below tilt-in, above flatten-out
    expect(easeTo).not.toHaveBeenCalled();
  });

  it("disposer removes the zoomend listener", () => {
    const { map, setZoom, easeTo, handlerCount } = fakeMap(2);
    const dispose = wireAutoPitch(map);
    expect(handlerCount()).toBe(1);
    dispose();
    expect(handlerCount()).toBe(0);
    setZoom(16);
    expect(easeTo).not.toHaveBeenCalled();
  });
});
