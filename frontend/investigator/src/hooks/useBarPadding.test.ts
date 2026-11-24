// frontend/investigator/src/hooks/useBarPadding.test.ts
// The camera's room above the open bar, as a hook (the camera zooms out to fit). While the bar is open the map's bottom padding follows
// the measured `--bottom-stack-h`, and, when the caller turns the fit on, the camera zooms out
// until the whole disk stands between the top of the screen and the top of the bottom stack,
// centred, with no margin. It acts only while the camera is at the zoom it opened on or the zoom
// this code set, never zooms in, and fits again when the stack or the window changes. A fake map stands in
// for MapLibre; the disk's figures are measured: 651.6, 683 and 564 px across, and 0.784 and 1.348 levels for 300 and 420 px of bar.
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import {
  diskAcross,
  fitZoom,
  HOME_MOVE,
  installBarPadding,
  jumpHome,
  useBarPadding,
  type BarPaddingMap,
} from "./useBarPadding";
import hookSource from "./useBarPadding.ts?raw";

// The real map is a BarPaddingMap: a type check that fails the build when the hook's narrow type
// and MapLibre's differ, so the caller can pass the map it holds.
export const asBarMap = (m: maplibregl.Map): BarPaddingMap => m;

const STACK = "--bottom-stack-h";
// App writes the height with `style.setProperty`, which a browser reports to a MutationObserver as
// a change of the `style` attribute. happy-dom does not report that route (probed: setAttribute
// fires the observer, setProperty does not), so the tests write the attribute. The browser route
// is checked on the served app.
const setStack = (px: number | null): void => {
  const root = document.documentElement;
  if (px === null) root.removeAttribute("style");
  else root.setAttribute("style", `${STACK}: ${px}px;`);
};

afterEach(() => setStack(null));

type Pad = { top: number; left: number; right: number; bottom: number };
type FakeMap = BarPaddingMap & {
  jumpTo(options: { center: [number, number]; zoom: number }, eventData?: object): void;
};

/** A map with the calls the hook makes. The globe's numbers follow the camera as MapLibre's do:
 *  the world is 512 px wide at zoom 0 and the camera's distance is 1.5 times the canvas height. */
function fakeMap(opts: { zoom?: number; lat?: number; height?: number } = {}) {
  let zoom = opts.zoom ?? 2;
  let height = opts.height ?? 720;
  let lat = opts.lat ?? 42;
  const listeners = new Map<string, Set<(ev: object) => void>>();
  const pads: Pad[] = [];
  const zooms: number[] = [];
  const emit = (type: string, ev: object = {}): void => listeners.get(type)?.forEach((fn) => fn(ev));
  // MapLibre fires movestart, move and moveend for every camera change, and copies a jump's
  // `eventData` onto each event (maplibre-gl 5.24.1, `Event`: `extend(this, data)`).
  const jumpCalls: { center: [number, number]; zoom: number; eventData?: object }[] = [];
  const map: FakeMap = {
    getZoom: () => zoom,
    getCenter: () => ({ lat }),
    setZoom: (z: number) => {
      zoom = z;
      zooms.push(z);
      emit("moveend"); // the hook's own move ends too: it must not start a loop
    },
    jumpTo: (o: { center: [number, number]; zoom: number }, eventData?: object) => {
      jumpCalls.push({ ...o, eventData });
      lat = o.center[1];
      zoom = o.zoom;
      emit("moveend", { ...eventData });
    },
    setPadding: (p: Pad) => {
      pads.push(p);
    },
    getCanvas: () => ({ clientHeight: height }),
    transform: {
      get worldSize() {
        return 512 * 2 ** zoom;
      },
      get cameraToCenterDistance() {
        return 1.5 * height;
      },
    },
    on: (type: string, fn: (ev: object) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    off: (type: string, fn: (ev: object) => void) => {
      listeners.get(type)?.delete(fn);
    },
  } as unknown as FakeMap;
  return {
    map,
    pads,
    zooms,
    jumpCalls,
    emit,
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    /** A person's own zoom: the camera moves with no call from the hook. */
    userZoom: (z: number) => {
      zoom = z;
    },
    /** A person's pan to another latitude: an ordinary move, its `moveend` carries no mark. */
    pan: (toLat: number) => {
      lat = toLat;
      emit("moveend");
    },
    resize: (h: number) => {
      height = h;
    },
    /** The disk's diameter now, by the figures written out in the test. */
    across: () => {
      const c = 1.5 * height;
      const R = (512 * 2 ** zoom) / (2 * Math.PI) / Math.cos((lat * Math.PI) / 180);
      return (2 * c * R) / Math.sqrt((c + R) * (c + R) - R * R);
    },
  };
}

describe("the globe's size on screen", () => {
  const view = (height: number, latitude: number, zoom = 2) => ({
    zoom,
    worldSize: 512 * 2 ** zoom,
    cameraDistance: 1.5 * height,
    latitude,
  });

  it("is 651.6 px across at 1280 by 720, 683 at 1440 by 900 and 564 for a centre at 20 N, at zoom 2", () => {
    expect(diskAcross(view(720, 42), 2)).toBeCloseTo(651.6, 0);
    expect(diskAcross(view(900, 42), 2)).toBeCloseTo(683, 0);
    expect(diskAcross(view(900, 20), 2)).toBeCloseTo(564.3, 0);
  });

  it("fits a free height by the levels the round measured: 0.784 for a 300 px bar and 1.348 for a 420 px bar", () => {
    const v = view(720, 42);
    expect(2 - fitZoom(v, 720 - 300)).toBeCloseTo(0.784, 2);
    expect(2 - fitZoom(v, 720 - 420)).toBeCloseTo(1.348, 2);
  });

  it("gives a disk as wide as the free height at the zoom it returns", () => {
    const v = view(900, 20);
    expect(diskAcross(v, fitZoom(v, 517))).toBeCloseTo(517, 1);
  });
});

describe("installBarPadding: the padding", () => {
  it("sets the bottom padding to the measured stack height as soon as it is given the map", () => {
    setStack(300);
    const f = fakeMap();
    installBarPadding(f.map, { open: true, fit: false });
    expect(f.pads).toEqual([{ top: 0, left: 0, right: 0, bottom: 300 }]);
  });

  it("sets none while the stack has no height, and none twice for the same height", () => {
    const f = fakeMap();
    const bar = installBarPadding(f.map, { open: true, fit: false });
    expect(f.pads).toEqual([]);
    setStack(300);
    bar.apply();
    bar.apply();
    expect(f.pads).toHaveLength(1);
  });

  it("follows the measured height when the stack changes", async () => {
    setStack(300);
    const f = fakeMap();
    installBarPadding(f.map, { open: true, fit: false });
    setStack(420);
    await waitFor(() => expect(f.pads.at(-1)?.bottom).toBe(420));
    expect(f.pads.map((p) => p.bottom)).toEqual([300, 420]);
  });

  it("clears on fold, and sets again on open", () => {
    setStack(300);
    const f = fakeMap();
    const bar = installBarPadding(f.map, { open: true, fit: false });
    bar.update({ open: false, fit: false });
    expect(f.pads.at(-1)).toEqual({ top: 0, left: 0, right: 0, bottom: 0 });
    bar.update({ open: true, fit: false });
    expect(f.pads.at(-1)).toEqual({ top: 0, left: 0, right: 0, bottom: 300 });
  });

  it("changes no zoom when the fit is off", () => {
    setStack(420);
    const f = fakeMap();
    installBarPadding(f.map, { open: true, fit: false });
    expect(f.zooms).toEqual([]);
  });

  it("applies again on the map's load, and the second apply changes nothing", () => {
    setStack(300);
    const f = fakeMap();
    installBarPadding(f.map, { open: true, fit: true });
    const pads = f.pads.length;
    const zooms = f.zooms.length;
    f.emit("load");
    expect(f.pads).toHaveLength(pads);
    expect(f.zooms).toHaveLength(zooms);
  });
});

describe("installBarPadding: the fit", () => {
  it("zooms out until the disk is as wide as the free height, between the top of the screen and the top of the stack", () => {
    setStack(300);
    const f = fakeMap({ zoom: 2, lat: 42, height: 720 });
    installBarPadding(f.map, { open: true, fit: true });
    expect(f.across()).toBeCloseTo(720 - 300, 0);
    expect(f.pads.at(-1)).toEqual({ top: 0, left: 0, right: 0, bottom: 300 });
  });

  it("fits again when the stack changes, and returns up to the zoom it opened on and no further", async () => {
    setStack(300);
    const f = fakeMap({ zoom: 2, height: 720 });
    installBarPadding(f.map, { open: true, fit: true });
    const at300 = f.map.getZoom();
    setStack(420);
    await waitFor(() => expect(f.map.getZoom()).toBeLessThan(at300));
    expect(f.across()).toBeCloseTo(300, 0);
    setStack(5);
    await waitFor(() => expect(f.map.getZoom()).toBe(2));
    expect(f.zooms.every((z) => z <= 2)).toBe(true);
  });

  it("never zooms in: a stack too small to crop the disk leaves the zoom where it opened", () => {
    setStack(10);
    const f = fakeMap({ zoom: 2, height: 720 });
    installBarPadding(f.map, { open: true, fit: true });
    expect(f.map.getZoom()).toBe(2);
    expect(f.zooms).toEqual([]);
  });

  it("acts only while the camera is at the zoom it opened on or the zoom it set", () => {
    setStack(300);
    const f = fakeMap({ zoom: 2, height: 720 });
    const bar = installBarPadding(f.map, { open: true, fit: true });
    const set = f.zooms.length;
    f.userZoom(6);
    setStack(420);
    bar.apply();
    expect(f.zooms).toHaveLength(set);
    expect(f.map.getZoom()).toBe(6);
  });

  it("acts again once a person's zoom returns to a zoom it holds", () => {
    setStack(300);
    const f = fakeMap({ zoom: 2, height: 720 });
    const bar = installBarPadding(f.map, { open: true, fit: true });
    f.userZoom(2);
    setStack(420);
    bar.apply();
    expect(f.across()).toBeCloseTo(300, 0);
  });

  it("returns the camera to the zoom it opened on when the bar folds", () => {
    setStack(300);
    const f = fakeMap({ zoom: 2, height: 720 });
    const bar = installBarPadding(f.map, { open: true, fit: true });
    expect(f.map.getZoom()).toBeLessThan(2);
    bar.update({ open: false, fit: true });
    expect(f.map.getZoom()).toBe(2);
  });

  it("returns the camera when the fit is turned off, and leaves a person's zoom alone", () => {
    setStack(300);
    const f = fakeMap({ zoom: 2, height: 720 });
    const bar = installBarPadding(f.map, { open: true, fit: true });
    bar.update({ open: true, fit: false });
    expect(f.map.getZoom()).toBe(2);
    f.userZoom(5);
    bar.update({ open: true, fit: true });
    expect(f.map.getZoom()).toBe(5);
  });

  it("fits again when the map is resized", () => {
    setStack(300);
    const f = fakeMap({ zoom: 2, height: 720 });
    installBarPadding(f.map, { open: true, fit: true });
    f.resize(900);
    f.emit("resize");
    expect(f.across()).toBeCloseTo(900 - 300, 0);
  });

  it("leaves the zoom alone when the stack leaves no free height", () => {
    setStack(800);
    const f = fakeMap({ zoom: 2, height: 720 });
    installBarPadding(f.map, { open: true, fit: true });
    expect(f.zooms).toEqual([]);
  });

  it("fits on a card story's centre at 20 N at 1440 by 900 as well", () => {
    setStack(382);
    const f = fakeMap({ zoom: 2, lat: 20, height: 900 });
    installBarPadding(f.map, { open: true, fit: true });
    expect(f.across()).toBeCloseTo(900 - 382, 0);
  });
});

// FITFIX: three things happen at open: the map is handed to the hook (M), the bar's height is
// published (H) and the app jumps the camera to the scenario home (J). The app's jump is an opening
// of the camera: the hook takes the zoom it leaves as the zoom the camera opened on, and fits from
// there, whatever the order. An ordinary move is not an opening and fits nothing.
describe("installBarPadding: the app's jump to the scenario home", () => {
  // The card story at 1440 by 900: the map is built at its home, centre 20 N, zoom 2.
  const HOME = { lng: -40, lat: 20, zoom: 2 };
  const BAR = 354;
  const opened = () => fakeMap({ zoom: 2, lat: 20, height: 900 });

  type Step = "map" | "height" | "jump";
  const ORDERS: Step[][] = [
    ["map", "height", "jump"],
    ["map", "jump", "height"],
    ["height", "map", "jump"],
    ["height", "jump", "map"],
    ["jump", "map", "height"],
    ["jump", "height", "map"],
  ];

  it.each(ORDERS)("ends at the fitted zoom in the order %s, %s, %s", (...order) => {
    const f = opened();
    let bar: ReturnType<typeof installBarPadding> | undefined;
    for (const step of order) {
      if (step === "map") bar = installBarPadding(f.map, { open: true, fit: true });
      else if (step === "height") {
        setStack(BAR);
        bar?.apply(); // what the root's style observer does when the height is published
      } else jumpHome(f.map, HOME);
    }
    expect(f.map.getZoom()).toBeLessThan(2);
    expect(f.across()).toBeCloseTo(900 - BAR, 0);
    expect(f.pads.at(-1)).toEqual({ top: 0, left: 0, right: 0, bottom: BAR });
  });

  it("fits through the hook when the jump comes after the fit", () => {
    setStack(BAR);
    const f = opened();
    renderHook(() => useBarPadding(f.map, { open: true, fit: true }));
    expect(f.map.getZoom()).toBeLessThan(2);
    jumpHome(f.map, HOME);
    expect(f.across()).toBeCloseTo(900 - BAR, 0);
  });

  it("marks the jump: the home's centre and zoom, and the mark as the event data", () => {
    const f = opened();
    expect(jumpHome(f.map, HOME)).toBe(true);
    expect(f.jumpCalls).toEqual([{ center: [-40, 20], zoom: 2, eventData: { [HOME_MOVE]: true } }]);
  });

  it("jumps nowhere while the camera lock is set, as before", () => {
    const w = window as unknown as { __ffrCameraLock?: boolean };
    w.__ffrCameraLock = true;
    try {
      const f = opened();
      expect(jumpHome(f.map, HOME)).toBe(false);
      expect(f.jumpCalls).toEqual([]);
    } finally {
      delete w.__ffrCameraLock;
    }
  });

  it("leaves a person's zoom after the opening alone", () => {
    setStack(BAR);
    const f = opened();
    const bar = installBarPadding(f.map, { open: true, fit: true });
    jumpHome(f.map, HOME);
    const calls = f.zooms.length;
    f.userZoom(5);
    f.emit("moveend");
    setStack(420);
    bar.apply();
    expect(f.zooms).toHaveLength(calls);
    expect(f.map.getZoom()).toBe(5);
  });

  it("makes no setZoom call when a move ends at another latitude at the fitted zoom", () => {
    setStack(BAR);
    const f = opened();
    installBarPadding(f.map, { open: true, fit: true });
    jumpHome(f.map, HOME);
    const calls = f.zooms.length;
    f.pan(60);
    f.pan(-30);
    f.pan(20);
    expect(f.zooms).toHaveLength(calls);
  });

  it("makes no setZoom call when an ordinary move ends with the camera back on the zoom it opened on", () => {
    setStack(BAR);
    const f = opened();
    installBarPadding(f.map, { open: true, fit: true });
    jumpHome(f.map, HOME);
    const calls = f.zooms.length;
    f.userZoom(2);
    f.emit("moveend");
    expect(f.zooms).toHaveLength(calls);
  });

  it("takes an unmarked jump (the share link's) as no opening", () => {
    setStack(BAR);
    const f = opened();
    installBarPadding(f.map, { open: true, fit: true });
    const calls = f.zooms.length;
    f.map.jumpTo({ center: [10, 30], zoom: 2 });
    expect(f.zooms).toHaveLength(calls);
    expect(f.map.getZoom()).toBe(2);
  });

  it("fits a jump to another whole-globe home from that home's own zoom and latitude, and folds back to it", () => {
    setStack(BAR);
    const f = opened();
    const bar = installBarPadding(f.map, { open: true, fit: true });
    jumpHome(f.map, { lng: -22, lat: 42, zoom: 1.9 });
    expect(f.across()).toBeCloseTo(900 - BAR, 0);
    bar.update({ open: false, fit: true });
    expect(f.map.getZoom()).toBeCloseTo(1.9, 6);
  });

  it("does not zoom a zoomed-in home out: only a story that opens on the whole globe is fitted", () => {
    setStack(BAR);
    const f = opened();
    installBarPadding(f.map, { open: true, fit: true });
    jumpHome(f.map, { lng: -95, lat: 31, zoom: 4 });
    const calls = f.zooms.length;
    expect(f.map.getZoom()).toBe(4);
    f.emit("resize");
    expect(f.zooms).toHaveLength(calls);
    expect(f.pads.at(-1)?.bottom).toBe(BAR);
  });

  it("does not fit a marked jump while the caller's fit is off", () => {
    setStack(BAR);
    const f = opened();
    installBarPadding(f.map, { open: true, fit: false });
    jumpHome(f.map, HOME);
    expect(f.zooms).toEqual([]);
  });
});

describe("installBarPadding: dispose", () => {
  it("removes its listeners and stops watching the stack", async () => {
    setStack(300);
    const f = fakeMap();
    const bar = installBarPadding(f.map, { open: true, fit: false });
    expect(f.listenerCount()).toBeGreaterThan(0);
    bar.dispose();
    expect(f.listenerCount()).toBe(0);
    const pads = f.pads.length;
    setStack(420);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.pads).toHaveLength(pads);
  });
});

describe("useBarPadding", () => {
  it("does nothing while there is no map, and acts when it is given one", () => {
    setStack(300);
    const f = fakeMap();
    const { rerender } = renderHook(({ map }) => useBarPadding(map, { open: true, fit: false }), {
      initialProps: { map: null as BarPaddingMap | null },
    });
    expect(f.pads).toEqual([]);
    rerender({ map: f.map });
    expect(f.pads.at(-1)?.bottom).toBe(300);
  });

  it("follows the open flag and the fit flag, keeping the zoom it opened on across a fold", () => {
    setStack(300);
    const f = fakeMap({ zoom: 2, height: 720 });
    const { rerender } = renderHook(({ open, fit }) => useBarPadding(f.map, { open, fit }), {
      initialProps: { open: true, fit: true },
    });
    const fitted = f.map.getZoom();
    expect(fitted).toBeLessThan(2);
    rerender({ open: false, fit: true });
    expect(f.map.getZoom()).toBe(2);
    expect(f.pads.at(-1)?.bottom).toBe(0);
    rerender({ open: true, fit: true });
    expect(f.map.getZoom()).toBeCloseTo(fitted, 6);
  });

  it("watches the stack through the hook, and stops on unmount and on a new map", async () => {
    setStack(300);
    const a = fakeMap();
    const b = fakeMap();
    const { rerender, unmount } = renderHook(({ map }) => useBarPadding(map, { open: true, fit: false }), {
      initialProps: { map: a.map },
    });
    rerender({ map: b.map });
    expect(a.listenerCount()).toBe(0);
    setStack(380);
    await waitFor(() => expect(b.pads.at(-1)?.bottom).toBe(380));
    expect(a.pads.at(-1)?.bottom).toBe(300);
    unmount();
    expect(b.listenerCount()).toBe(0);
    act(() => setStack(450));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(b.pads.at(-1)?.bottom).toBe(380);
  });
});

describe("the hook's source", () => {
  it("holds no timer, no frame callback and no clock", () => {
    expect(hookSource).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|Date\.now|performance\.now/);
  });

  it("does not write --bottom-stack-h; App keeps the one writer", () => {
    expect(hookSource).not.toMatch(/setProperty\(\s*["']--bottom-stack-h/);
  });

  it("leaves no handle on the window", () => {
    expect(hookSource).not.toMatch(/window\.__/);
  });
});
