import { describe, it, expect } from "vitest";
import { applyMapShape, mapIsFlat, projectionFor } from "./projection";

/** A stand-in map that records the two calls about the shape, in the order they are made. */
function recorder() {
  const calls: [string, unknown][] = [];
  const map = {
    setProjection: (p: unknown) => {
      calls.push(["setProjection", p]);
    },
    setRenderWorldCopies: (on: unknown) => {
      calls.push(["setRenderWorldCopies", on]);
    },
  };
  return { map, calls };
}

describe("projectionFor", () => {
  it("gives the globe's projection for the globe and the flat projection for the flat map", () => {
    expect(projectionFor("globe")).toEqual({ type: "globe" });
    expect(projectionFor("flat")).toEqual({ type: "mercator" });
  });

  it("returns a fresh object on every call", () => {
    expect(projectionFor("flat")).not.toBe(projectionFor("flat"));
  });
});

describe("applyMapShape", () => {
  it("going flat turns the world's copies off and then sets the flat projection", () => {
    const { map, calls } = recorder();
    applyMapShape(map, "flat");
    expect(calls).toEqual([
      ["setRenderWorldCopies", false],
      ["setProjection", { type: "mercator" }],
    ]);
  });

  it("going back sets the globe's projection and then turns the world's copies on", () => {
    const { map, calls } = recorder();
    applyMapShape(map, "globe");
    expect(calls).toEqual([
      ["setProjection", { type: "globe" }],
      ["setRenderWorldCopies", true],
    ]);
  });
});

describe("mapIsFlat", () => {
  it("is true for a map that reports the flat projection", () => {
    expect(mapIsFlat({ getProjection: () => ({ type: "mercator" }) })).toBe(true);
  });

  it("is false for a map that reports the globe", () => {
    expect(mapIsFlat({ getProjection: () => ({ type: "globe" }) })).toBe(false);
  });

  it("is false for a map that reports no projection, or has no read for it", () => {
    expect(mapIsFlat({ getProjection: () => ({}) })).toBe(false);
    expect(mapIsFlat({ getProjection: () => undefined as never })).toBe(false);
    expect(mapIsFlat({})).toBe(false);
  });

  it("is false for a map whose read throws, as the library's does once its style is gone", () => {
    const gone = {
      getProjection: (): never => {
        throw new TypeError("Cannot read properties of undefined (reading 'getProjection')");
      },
    };
    expect(mapIsFlat(gone)).toBe(false);
  });
});
