// frontend/investigator/src/components/GlobeMap.solo.test.ts
// GlobeMap takes the soloed arrays, mounts the globe's two hooks (the camera's room
// above the bar and the tooltip) and writes the selected record's screen point. GlobeMap needs
// WebGL, so MapLibre is replaced by a fake map that records what the component and the hooks ask
// of it; the pieces that draw (layer setup, pulses, badges, the label cap) are replaced by stubs.
// The fake is linear and says nothing about the real globe: the real camera needs a manual check.
import { createElement } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobeMap } from "./GlobeMap";
import { HOME_MOVE } from "../hooks/useBarPadding";
import globeSource from "./GlobeMap.tsx?raw";
import { useLayers } from "../store/layers";
import { useSelection } from "../store/selection";
import type { LoginEvent, Transaction } from "../types";

type Pad = { top: number; left: number; right: number; bottom: number };
interface Fake {
  zoom: number;
  padding: Pad;
  paddings: Pad[];
  zooms: number[];
  handlers: Map<string, { fn: (e?: unknown) => void; once: boolean }[]>;
  sources: Map<string, { setData: ReturnType<typeof vi.fn> }>;
  container: HTMLElement;
  fire: (type: string, e?: unknown) => void;
  queryHits: { properties: { id: string } }[];
  getZoom: () => number;
  jumpTo: (o: { center: [number, number]; zoom: number }, eventData?: object) => void;
}
// `link` is the opening link's camera; a case that builds the map at a link's camera fills it.
const registry = vi.hoisted(() => ({
  maps: [] as unknown[],
  shown: [] as unknown[][],
  link: {} as { center?: [number, number]; zoom?: number },
}));
const fakes = (): Fake[] => registry.maps as Fake[];

vi.mock("maplibre-gl", () => {
  class FakeMap {
    zoom: number;
    lng: number;
    lat: number;
    padding: Pad = { top: 0, left: 0, right: 0, bottom: 0 };
    paddings: Pad[] = [];
    zooms: number[] = [];
    handlers = new Map<string, { fn: (e?: unknown) => void; once: boolean }[]>();
    sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    container: HTMLElement;
    canvas: HTMLCanvasElement;
    queryHits: { properties: { id: string } }[] = [];
    constructor(o: { container: HTMLElement; zoom: number; center: [number, number] }) {
      this.zoom = o.zoom;
      [this.lng, this.lat] = o.center;
      this.container = o.container;
      const box = (left: number, top: number) => () =>
        ({ left, top, right: left + 1280, bottom: top + 720, width: 1280, height: 720, x: left, y: top }) as DOMRect;
      o.container.getBoundingClientRect = box(10, 20);
      this.canvas = document.createElement("canvas");
      Object.defineProperty(this.canvas, "clientHeight", { value: 720 });
      this.canvas.getBoundingClientRect = box(10, 20);
      registry.maps.push(this);
    }
    on(type: string, fn: (e?: unknown) => void) {
      this.handlers.set(type, [...(this.handlers.get(type) ?? []), { fn, once: false }]);
      return this;
    }
    once(type: string, fn: (e?: unknown) => void) {
      this.handlers.set(type, [...(this.handlers.get(type) ?? []), { fn, once: true }]);
      return this;
    }
    off(type: string, fn: (e?: unknown) => void) {
      this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => h.fn !== fn));
      return this;
    }
    fire(type: string, e?: unknown) {
      const list = [...(this.handlers.get(type) ?? [])];
      this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => !h.once));
      for (const h of list) h.fn(e);
    }
    getSource(id: string) {
      if (!this.sources.has(id)) this.sources.set(id, { setData: vi.fn() });
      return this.sources.get(id);
    }
    getLayer() {
      return undefined;
    }
    getStyle() {
      return { layers: [{ id: "ml-auths-dot", type: "circle", source: "ml-auths" }] };
    }
    queryRenderedFeatures() {
      return this.queryHits;
    }
    getCanvas() {
      return this.canvas;
    }
    getZoom() {
      return this.zoom;
    }
    getCenter() {
      return { lng: this.lng, lat: this.lat };
    }
    setZoom(z: number) {
      this.zoom = z;
      this.zooms.push(z);
      this.fire("moveend");
    }
    setPadding(p: Pad) {
      this.padding = p;
      this.paddings.push(p);
      this.fire("moveend");
    }
    // As MapLibre does, the jump's event data is copied onto the `moveend` it fires.
    jumpTo(o: { center: [number, number]; zoom: number }, eventData?: object) {
      [this.lng, this.lat] = o.center;
      this.zoom = o.zoom;
      this.fire("moveend", { ...eventData });
    }
    // A linear stand-in: east and north move the point, the bottom padding lifts the centre.
    project([lng, lat]: [number, number]) {
      return { x: 640 + lng * 10, y: 360 - lat * 10 - this.padding.bottom / 2 };
    }
    get transform() {
      return { worldSize: 512 * 2 ** this.zoom, cameraToCenterDistance: 1.5 * 720 };
    }
    setLayoutProperty() {}
    setFeatureState() {}
    triggerRepaint() {}
    setStyle() {}
    remove() {}
  }
  return { default: { Map: FakeMap } };
});
vi.mock("../hooks/useShareLink", () => ({ openingLink: registry.link }));
vi.mock("./useRadarPulse", () => ({ useRadarPulse: () => {} }));
vi.mock("./useBloomPulse", () => ({ useBloomPulse: () => {} }));
vi.mock("./useTimezoneOverlay", () => ({ useTimezoneOverlay: () => {} }));
vi.mock("./verdict/GlobeBadgeLayer", () => ({ GlobeBadgeLayer: () => null }));
vi.mock("../hooks/useLabelCap", () => ({ useLabelCap: () => <T>(run: () => T) => run() }));
vi.mock("../lib/globe/eyesHarness", () => ({ wireEyesHarness: () => {} }));
vi.mock("../lib/globe/generic-markers", async (orig) => ({ ...(await orig<object>()), bindGenericMarkers: () => () => {} }));
vi.mock("../lib/globe/autoPitch", async (orig) => ({ ...(await orig<object>()), wireAutoPitch: () => () => {} }));
vi.mock("../lib/globe/setupLayers", async (orig) => ({
  ...(await orig<object>()),
  setupLayers: () => () => {},
  repopulateGlobeSources: () => {},
}));
vi.mock("./ui/Tip", () => ({
  showTipAt: (...a: unknown[]) => registry.shown.push(a),
}));

const tx = (id: string, fraud: boolean, lat: number, lng: number): Transaction =>
  ({
    id,
    timestamp: "2026-05-21T14:00:00Z",
    merchant_lat: lat,
    merchant_lng: lng,
    merchant_name: `Shop ${id}`,
    mcc: "5411",
    merchant_country: "NG",
    amount: 12.5,
    is_fraud: fraud,
  }) as unknown as Transaction;

type Home = { lat: number; lng: number; zoom: number };
type Props = { transactions: Transaction[]; logins: LoginEvent[]; scenarioHome: Home };
const WORLD: Home = { lat: 20, lng: -40, zoom: 2 };
const CITY: Home = { lat: 29.76, lng: -95.37, zoom: 4.2 };
// One empty list serves every render.
const NONE: never[] = [];
const props = (p: Partial<Props> = {}) => ({
  transactions: NONE,
  logins: NONE,
  places: NONE,
  paths: NONE,
  scenarioHome: WORLD,
  ...p,
});
const STACK = "--bottom-stack-h";
// happy-dom does not report `style.setProperty` to a MutationObserver (the hook's own test notes the
// same), so the stack's height is written as the attribute.
const setStack = (px: number | null) => {
  if (px === null) document.documentElement.removeAttribute("style");
  else document.documentElement.setAttribute("style", `${STACK}: ${px}px;`);
};
/** Mounts the component and plays the map's first style load. */
function mount(p: Partial<Props> = {}) {
  const view = render(createElement(GlobeMap, props(p)));
  const map = fakes()[fakes().length - 1];
  act(() => map.fire("style.load"));
  return { map, view, again: (next: Partial<Props>) => view.rerender(createElement(GlobeMap, props(next))) };
}
const ids = (call: unknown[]): string[] =>
  ((call[0] as GeoJSON.FeatureCollection).features as GeoJSON.Feature[]).map((f) => String(f.properties?.id));

beforeEach(() => {
  registry.maps.length = 0;
  registry.shown.length = 0;
  delete registry.link.center;
  delete registry.link.zoom;
  useSelection.getState().clear();
  useLayers.setState({ barSize: "open" });
  setStack(null);
});
afterEach(() => setStack(null));

describe("GlobeMap takes the soloed arrays", () => {
  const a = tx("a", false, 6.45, 3.4);
  const b = tx("b", true, 6.5, 3.5);
  const c = tx("c", false, 6.6, 3.6);

  // These two pin today's behaviour: the lists keep their identity while their members are the same
  // (`useStableList`), and the one effect sends every source once for each change of any list. They
  // are green at the tip and stay green; INT-2 already narrows what App passes.
  it("sends a source its data once for each change of the list, and not for a copy of the same members", () => {
    const { map, again } = mount({ transactions: [a, b, c] });
    again({ transactions: [a, b, c].slice() });
    expect(map.sources.size).toBe(0);
    again({ transactions: [b] });
    const auths = map.sources.get("ml-auths")!.setData;
    expect(auths).toHaveBeenCalledTimes(1);
    expect(ids(auths.mock.calls[0])).toEqual(["b"]);
    again({ transactions: [b].slice() });
    expect(auths).toHaveBeenCalledTimes(1);
  });

  it("sends the fraud source the soloed fraud records, once", () => {
    const { map, again } = mount({ transactions: [a, b] });
    again({ transactions: [a] });
    expect(map.sources.get("ml-fraud")!.setData).toHaveBeenCalledTimes(1);
    expect(ids(map.sources.get("ml-fraud")!.setData.mock.calls[0])).toEqual([]);
    expect(map.sources.get("ml-logins")!.setData).toHaveBeenCalledTimes(1);
  });
});

describe("GlobeMap mounts the camera's room", () => {
  it("pads the map by the bottom stack while the bar is open in a case, and clears it when the bar folds", () => {
    setStack(300);
    const { map } = mount();
    expect(map.padding.bottom).toBe(300);
    act(() => useLayers.setState({ barSize: "line" }));
    expect(map.padding.bottom).toBe(0);
    act(() => useLayers.setState({ barSize: "middle" }));
    expect(map.padding.bottom).toBe(300);
  });

  it("zooms out to fit a story that opens on the whole globe", () => {
    setStack(300);
    const { map } = mount({ scenarioHome: WORLD });
    expect(map.zooms.length).toBeGreaterThan(0);
    expect(map.getZoom()).toBeLessThan(2);
  });

  it("leaves the zoom alone for a story that opens close in", () => {
    setStack(300);
    const { map } = mount({ scenarioHome: CITY });
    expect(map.paddings.at(-1)?.bottom).toBe(300);
    expect(map.zooms).toEqual([]);
  });

  // A page reloaded while zoomed in: the address names the camera, so the map is built there, and the
  // fit read at the first style load is off. The marked home move (Reset view) must turn it on.
  it("fits a whole-globe story above the bar after the marked home move on a map built zoomed in", () => {
    setStack(300);
    Object.assign(registry.link, { center: [-95.37, 29.76], zoom: 6.76 });
    const { map } = mount({ scenarioHome: WORLD });
    expect(map.getZoom()).toBe(6.76);
    expect(map.zooms).toEqual([]);
    act(() => map.jumpTo({ center: [WORLD.lng, WORLD.lat], zoom: WORLD.zoom }, { [HOME_MOVE]: true }));
    expect(map.getZoom()).toBeLessThan(WORLD.zoom);
    // One fitting zoom call, under the same padding, to the zoom a freshly opened page is fitted to.
    expect(map.zooms.length).toBe(1);
    expect(map.padding.bottom).toBe(300);
    const fitted = map.getZoom();
    delete registry.link.center;
    delete registry.link.zoom;
    const fresh = mount({ scenarioHome: WORLD }).map;
    expect(fitted).toBe(fresh.getZoom());
  });

  it("leaves a close-in story unfitted after the marked home move on a map built zoomed in", () => {
    setStack(300);
    Object.assign(registry.link, { center: [-95.37, 29.76], zoom: 6.76 });
    const { map } = mount({ scenarioHome: CITY });
    act(() => map.jumpTo({ center: [CITY.lng, CITY.lat], zoom: CITY.zoom }, { [HOME_MOVE]: true }));
    expect(map.getZoom()).toBe(CITY.zoom);
    expect(map.zooms).toEqual([]);
  });

  it("uses no timer", () => {
    expect(globeSource).not.toMatch(/setInterval/);
  });
});

describe("GlobeMap writes the selected record's screen point", () => {
  const point = (el: HTMLElement) => el.getAttribute("data-selected-point");
  const lagos = tx("lagos", false, 3.04, 1.26);

  it("writes none while nothing is selected", () => {
    const { map } = mount({ transactions: [lagos] });
    expect(point(map.container)).toBeNull();
  });

  it("writes the point in viewport pixels, rounded, once a record with a place is selected and the camera stops", () => {
    const { map } = mount({ transactions: [lagos] });
    act(() => useSelection.getState().selectTransaction(lagos));
    act(() => map.fire("moveend"));
    // container left 10 + 640 + 1.26 * 10 = 662.6, top 20 + 360 - 30.4 = 349.6
    expect(point(map.container)).toBe("663,350");
  });

  it("writes it again after a padding change, since the map's padding moves the centre", () => {
    setStack(300);
    const { map } = mount({ transactions: [lagos], scenarioHome: CITY });
    act(() => useSelection.getState().selectTransaction(lagos));
    act(() => map.fire("moveend"));
    expect(point(map.container)).toBe("663,200"); // 20 + 360 - 30.4 - 150 = 199.6
    act(() => useLayers.setState({ barSize: "line" }));
    expect(point(map.container)).toBe("663,350");
  });

  it("removes it when the selection clears or the record has no place", () => {
    const { map } = mount({ transactions: [lagos] });
    act(() => useSelection.getState().selectTransaction(lagos));
    act(() => map.fire("moveend"));
    expect(point(map.container)).not.toBeNull();
    act(() => useSelection.getState().selectAccountEvent({ id: "ae" } as never));
    expect(point(map.container)).toBeNull();
    act(() => useSelection.getState().selectTransaction(lagos));
    act(() => map.fire("moveend"));
    act(() => useSelection.getState().clear());
    expect(point(map.container)).toBeNull();
  });
});

describe("GlobeMap mounts the globe's tooltip", () => {
  it("binds the pointer listeners once the map has loaded, and words the mark under the pointer", () => {
    const shop = tx("shop", false, 6.5, 3.5);
    const { map } = mount({ transactions: [shop] });
    expect(map.handlers.get("mousemove")).toHaveLength(1);
    map.queryHits = [{ properties: { id: "shop" } }];
    act(() => map.fire("mousemove", { point: { x: 5, y: 6 } }));
    const [at, lines] = registry.shown.at(-1) as [{ x: number; y: number }, string[]];
    expect(at).toEqual({ x: 15, y: 26 });
    expect(lines.join("\n")).toContain("Shop shop");
  });
});
