// frontend/investigator/src/lib/globe/shapeMark.test.ts
// The page's mark of the map's shape: written on the map's container from the map's own report, at
// bind and at each event that can change it, and taken off at unbind. A stand-in map answers the
// projection read and places a longitude on a straight line, so the world's edges are known numbers.
import { describe, expect, it } from "vitest";
import { bindShapeMark } from "./shapeMark";
import globeSource from "../../components/GlobeMap.tsx?raw";
import { codeOf, holdsToken } from "../code-text";

class StandIn {
  projection: { type: string } | undefined;
  /** The pixel of longitude 0; one degree is 5 px, so the world is 1,800 px wide. */
  origin = 700;
  handlers = new Map<string, (() => void)[]>();
  throws = false;
  constructor(type: string | undefined) {
    this.projection = type === undefined ? undefined : { type };
  }
  getProjection() {
    if (this.throws) throw new Error("the style is gone");
    return this.projection as never;
  }
  project([lng]: [number, number]) {
    return { x: this.origin + lng * 5, y: 0 };
  }
  on(type: string, fn: () => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  off(type: string, fn: () => void) {
    this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => h !== fn));
  }
  fire(type: string) {
    for (const h of [...(this.handlers.get(type) ?? [])]) h();
  }
  listening() {
    return [...this.handlers.values()].reduce((n, list) => n + list.length, 0);
  }
}

const shapeOf = (el: HTMLElement) => el.getAttribute("data-map-shape");
const worldOf = (el: HTMLElement) => el.getAttribute("data-world-x");

describe("bindShapeMark", () => {
  it("marks a globe at bind and writes no world edges", () => {
    const el = document.createElement("div");
    bindShapeMark(new StandIn("globe"), el);
    expect(shapeOf(el)).toBe("globe");
    expect(worldOf(el)).toBeNull();
  });

  it("marks a flat map at bind with the pixels of longitude -180 and 180, rounded", () => {
    const el = document.createElement("div");
    const map = new StandIn("mercator");
    map.origin = 700.4;
    bindShapeMark(map, el);
    expect(shapeOf(el)).toBe("flat");
    expect(worldOf(el)).toBe("-200,1600");
  });

  it("writes the mark again from the map's report at each style load and each change of projection", () => {
    const el = document.createElement("div");
    const map = new StandIn("globe");
    bindShapeMark(map, el);
    map.projection = { type: "mercator" };
    map.fire("projectiontransition");
    expect(shapeOf(el)).toBe("flat");
    expect(worldOf(el)).toBe("-200,1600");
    map.projection = { type: "globe" };
    map.fire("projectiontransition");
    expect(shapeOf(el)).toBe("globe");
    expect(worldOf(el)).toBeNull();
    map.projection = { type: "mercator" };
    map.fire("style.load");
    expect(shapeOf(el)).toBe("flat");
  });

  it("writes the world's edges again when a move ends on the flat map, and nothing on the globe", () => {
    const el = document.createElement("div");
    const map = new StandIn("mercator");
    bindShapeMark(map, el);
    map.origin = 600;
    map.fire("moveend");
    expect(worldOf(el)).toBe("-300,1500");
    map.projection = { type: "globe" };
    map.fire("projectiontransition");
    map.fire("moveend");
    expect(worldOf(el)).toBeNull();
    expect(shapeOf(el)).toBe("globe");
  });

  it("marks the globe when the map cannot say which shape it has", () => {
    const el = document.createElement("div");
    const map = new StandIn("mercator");
    map.throws = true;
    bindShapeMark(map, el);
    expect(shapeOf(el)).toBe("globe");
    expect(worldOf(el)).toBeNull();
  });

  it("leaves nothing after unbinding: no mark and no listener", () => {
    const el = document.createElement("div");
    const map = new StandIn("mercator");
    const unbind = bindShapeMark(map, el);
    expect(map.listening()).toBe(3);
    unbind();
    expect(map.listening()).toBe(0);
    expect(shapeOf(el)).toBeNull();
    expect(worldOf(el)).toBeNull();
    map.fire("projectiontransition");
    expect(shapeOf(el)).toBeNull();
  });

  it("is called by the map component", () => {
    expect(holdsToken(codeOf(globeSource), "bindShapeMark")).toBe(true);
  });
});
