/**
 * The judgment of the map's shape for the self-check and the static crawl (scripts/shape-check.mjs):
 * the rules run here on facts, and the page reader runs on a page built from the attributes the app
 * draws. The table at the foot pins each name the reader holds to the source file that draws it, on
 * code lines only, so a reader that asks for an element the app does not draw turns it red.
 */
import { describe, expect, it } from "vitest";
import shapeMarkSource from "./globe/shapeMark.ts?raw";
import buttonSource from "../components/MapModeButton.tsx?raw";
import globeSource from "../components/GlobeMap.tsx?raw";
import crawlSource from "../../scripts/static-crawl.mjs?raw";
import { codeOf, holdsToken } from "./code-text";
import { MAP_KEY as STORE_KEY } from "../store/map-mode";
import {
  MAP_KEY,
  angleBetween,
  capsuleVerdict,
  markProblems,
  pressProblems,
  readShape,
  resetProblems,
  switchProblems,
  worldZoom,
  type ShapeRead,
} from "../../scripts/shape-check.mjs";

/** A reading of a page 1,440 px wide. */
const read = (over: Partial<ShapeRead> = {}): ShapeRead => ({
  shape: "flat",
  world: [-300, 1748],
  width: 1440,
  next: "globe",
  stored: null,
  ...over,
});
const rules = (problems: { rule: string }[]) => problems.map((p) => p.rule);

describe("the sixth signal: the mark names the shape the address asked for", () => {
  it("passes a globe cell that writes no world edges", () => {
    expect(markProblems(read({ shape: "globe", world: null, next: "flat" }), "globe")).toEqual([]);
  });

  it("fails a mark of the other shape, or no mark, in either kind of cell", () => {
    expect(rules(markProblems(read({ shape: "flat" }), "globe"))).toEqual(["shape-mark"]);
    expect(rules(markProblems(read({ shape: "globe", world: null }), "flat"))).toEqual(["shape-mark", "world-fills-window"]);
    expect(rules(markProblems(read({ shape: null, world: null }), "globe"))).toEqual(["shape-mark"]);
  });

  it("passes a flat cell whose world reaches both sides of the map within 1 px", () => {
    expect(markProblems(read({ world: [1, 1439] }), "flat")).toEqual([]);
    expect(markProblems(read({ world: [-500, 2000] }), "flat")).toEqual([]);
  });

  it("fails a flat cell with a strip outside the world on either side, or with no world edges", () => {
    expect(rules(markProblems(read({ world: [2, 2000] }), "flat"))).toEqual(["world-fills-window"]);
    expect(rules(markProblems(read({ world: [-500, 1438] }), "flat"))).toEqual(["world-fills-window"]);
    expect(rules(markProblems(read({ world: null }), "flat"))).toEqual(["world-fills-window"]);
  });
});

describe("the button names the other shape", () => {
  it("passes a button that goes to the other shape and fails one that does not, or a missing one", () => {
    expect(switchProblems(read({ shape: "flat", next: "globe" }))).toEqual([]);
    expect(switchProblems(read({ shape: "globe", next: "flat" }))).toEqual([]);
    expect(rules(switchProblems(read({ shape: "flat", next: "flat" })))).toEqual(["shape-switch"]);
    expect(rules(switchProblems(read({ shape: "globe", next: null })))).toEqual(["shape-switch"]);
  });
});

describe("a press from the globe to the flat map", () => {
  // A world of 2,048 px is zoom 2: 512 px times 2 to the power of the zoom.
  it("reads the zoom from the world's width", () => {
    expect(worldZoom(2048)).toBe(2);
    expect(worldZoom(512)).toBe(0);
  });

  it("passes a press that keeps the zoom and the centre", () => {
    // Centre -40 at the middle of 1,440 px: longitude -180 is 140 degrees, 796 px, to its left.
    expect(pressProblems({ lng: -40, zoom: 2 }, read({ world: [-76, 1972] }))).toEqual([]);
  });

  it("passes a press that slides the world as little as fills the window", () => {
    // From centre -40 at zoom 1.6 and 1,280 px the world would start 36 px in from the left side; it slid to it.
    expect(pressProblems({ lng: -40, zoom: 1.6 }, read({ width: 1280, world: [0, 1552] }))).toEqual([]);
  });

  it("fails a slide that leaves neither edge of the world at a side of the window", () => {
    expect(rules(pressProblems({ lng: -40, zoom: 2 }, read({ world: [-150, 1898] })))).toEqual(["press-slide"]);
  });

  it("fails a change of zoom when the world was as wide as the window", () => {
    expect(rules(pressProblems({ lng: -40, zoom: 2 }, read({ world: [-291, 2309] })))).toEqual(["press-zoom"]);
  });

  it("asks a world narrower than the window to be made as wide as the window, and no wider", () => {
    // Zoom 1.4 is a world of 1,351 px, narrower than 1,440 px.
    expect(pressProblems({ lng: -40, zoom: 1.4 }, read({ world: [0, 1440] }))).toEqual([]);
    expect(rules(pressProblems({ lng: -40, zoom: 1.4 }, read({ world: [-100, 1540] })))).toEqual(["press-zoom", "press-slide"]);
  });

  it("fails a press after which the page writes no world edges", () => {
    expect(rules(pressProblems({ lng: -40, zoom: 2 }, read({ world: null })))).toEqual(["press-world"]);
  });
});

describe("the capsules of a story on the flat map and on the globe", () => {
  it("fails a flat map that draws fewer capsules than the globe", () => {
    expect(capsuleVerdict({ flat: 1, globe: 2, far: true }).problem).toMatch(/fewer/);
  });

  it("passes more capsules on the flat map, and equal counts when a place lies beyond a quarter turn of the home", () => {
    expect(capsuleVerdict({ flat: 3, globe: 2, far: true })).toEqual({ note: "flat 3, globe 2" });
    expect(capsuleVerdict({ flat: 2, globe: 2, far: true })).toEqual({ note: "flat 2, globe 2" });
  });

  it("says not tested for equal counts when no place lies that far, so it never passes on nothing", () => {
    expect(capsuleVerdict({ flat: 2, globe: 2, far: false })).toEqual({ note: "not tested: no place lies beyond 90 degrees of the home" });
  });

  it("measures the angle between two places on the sphere", () => {
    expect(angleBetween({ lng: 0, lat: 0 }, { lng: 90, lat: 0 })).toBeCloseTo(90, 6);
    expect(angleBetween({ lng: -40, lat: 20 }, { lng: -40, lat: 20 })).toBeCloseTo(0, 6);
    expect(angleBetween({ lng: 0, lat: 90 }, { lng: 0, lat: -90 })).toBeCloseTo(180, 6);
  });
});

describe("Reset view on a flat page opened with a camera in its address", () => {
  const home = { lng: -40, lat: 20, zoom: 1.94 };
  it("passes a camera that settles on the camera the page opens on with none", () => {
    expect(resetProblems(home, { lng: -40.004, lat: 20.002, zoom: 1.97 })).toEqual([]);
  });

  it("fails a camera away from it, or no camera", () => {
    expect(rules(resetProblems(home, { lng: -95.37, lat: 29.76, zoom: 6 }))).toEqual(["reset-view"]);
    expect(rules(resetProblems(home, { lng: null, lat: null, zoom: null }))).toEqual(["reset-view"]);
  });
});

describe("the reader of the page", () => {
  const page = (attrs: Record<string, string>, next: string | null) => {
    document.body.innerHTML = "";
    const box = document.createElement("div");
    box.setAttribute("data-testid", "globe-map");
    for (const [k, v] of Object.entries(attrs)) box.setAttribute(k, v);
    box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1440, height: 900, right: 1440, bottom: 900, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.append(box);
    if (next !== null) {
      const button = document.createElement("button");
      button.setAttribute("data-map-switch", next);
      document.body.append(button);
    }
  };

  it("reads the mark, the world's edges, the map's width, the button and the stored choice", () => {
    page({ "data-map-shape": "flat", "data-world-x": "-300,1748" }, "globe");
    localStorage.setItem(MAP_KEY, "flat");
    expect(readShape({ key: MAP_KEY })).toEqual({ shape: "flat", world: [-300, 1748], width: 1440, next: "globe", stored: "flat" });
    localStorage.removeItem(MAP_KEY);
  });

  it("reads a missing part as null", () => {
    page({ "data-map-shape": "globe" }, null);
    expect(readShape({ key: MAP_KEY })).toEqual({ shape: "globe", world: null, width: 1440, next: null, stored: null });
    document.body.innerHTML = "";
    expect(readShape({ key: MAP_KEY })).toEqual({ shape: null, world: null, width: null, next: null, stored: null });
  });

  it("uses nothing outside itself, as a page function", () => {
    page({ "data-map-shape": "flat", "data-world-x": "0,1440" }, "globe");
    const alone = new Function(`return (${readShape.toString()})`)() as typeof readShape;
    expect(alone({ key: MAP_KEY }).world).toEqual([0, 1440]);
  });

  it("reads the stored choice under the store's own key", () => {
    expect(MAP_KEY).toBe(STORE_KEY);
  });
});

describe("each name the reader holds, against the source that draws it", () => {
  const sources: Record<string, string> = {
    "data-testid": globeSource,
    "data-map-shape": shapeMarkSource,
    "data-world-x": shapeMarkSource,
    "data-map-switch": buttonSource,
  };
  const held = [...new Set(readShape.toString().match(/data-[a-z-]+/g) ?? [])].sort();

  it("has a source for every name the reader holds", () => {
    expect(held).toEqual(Object.keys(sources).sort());
  });

  it.each(Object.entries(sources))("draws %s, on a code line and as a whole name", (name, source) => {
    expect(holdsToken(codeOf(source), name)).toBe(true);
  });

  it("is run by the crawl", () => {
    expect(codeOf(crawlSource)).toMatch(/import \{[^}]*\bcrawlShapes\b[^}]*\} from '\.\/shape-check\.mjs'/);
    expect(holdsToken(codeOf(crawlSource), "crawlShapes")).toBe(true);
  });
});
