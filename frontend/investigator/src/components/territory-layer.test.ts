import { describe, it, expect, vi } from "vitest";
import { createTerritoryLayer, hatchPhasePx } from "./territory-layer";
import type { Path } from "../lib/paths";

// The walking-territory custom layer. These tests pin
// its CustomLayerInterface contract + the playhead-as-truth wiring WITHOUT a
// WebGL context: render() must early-return (touch no GL) when there are no
// paths, so the factory can be constructed and registered in setupLayers and
// proven inert until paths exist. The pixel correctness (welded hull, hatch on
// the limb) is checked by eye on a screenshot, not by a unit test.

const timeline = () => ({ minTime: 0, maxTime: 10_000, isPlaying: false });

const path = (kind: string): Path => ({
  kind,
  color: [1, 0.24, 0.18],
  points: [
    [-95.55, 29.78],
    [3.397, 6.536],
  ],
  nodes: [
    { ts: 1000, frac: 0 },
    { ts: 2000, frac: 1 },
  ],
  loft: false,
  territory: true,
});

describe("createTerritoryLayer", () => {
  it("is a 3d maplibre custom layer with the territory-fill id", () => {
    const layer = createTerritoryLayer(
      () => [],
      () => 0,
      timeline,
    );
    expect(layer.id).toBe("territory-fill");
    expect(layer.type).toBe("custom");
    expect(layer.renderingMode).toBe("3d");
  });

  it("render() touches no GL when there are no paths (inert until paths exist)", () => {
    const layer = createTerritoryLayer(
      () => [],
      () => 0,
      timeline,
    );
    // A Proxy that throws on ANY property access would fail if render touched gl;
    // the empty-paths guard returns before any gl call.
    const gl = new Proxy(
      {},
      {
        get() {
          throw new Error("render must not touch GL when paths are empty");
        },
      },
    );
    expect(() =>
      // args is never reached (the empty-paths guard returns first).
      layer.render!(gl as never, {} as never),
    ).not.toThrow();
  });

  it("reads paths + the playhead each call (playhead-as-truth, not a captured value)", () => {
    let playhead = 0;
    const getPlayhead = vi.fn(() => playhead);
    const getPaths = vi.fn(() => [path("fraud")]);
    const layer = createTerritoryLayer(getPaths, getPlayhead, timeline);
    // A minimal gl mock that lets render run far enough to read paths + playhead,
    // then throw at the first real GL program call so we don't need a full WebGL
    // context. We only assert the getters were consulted live on each frame.
    const gl = {
      isContextLost: () => false,
      createVertexArray: () => ({}),
      createBuffer: () => ({}),
      createShader: () => {
        throw new Error("stop after the live reads");
      },
    };
    const args = {
      shaderData: { variantName: "globe", vertexShaderPrelude: "", define: "" },
      defaultProjectionData: {},
    };
    try {
      layer.render!(gl as never, args as never);
    } catch {
      // expected: we deliberately abort at the shader compile step
    }
    playhead = 5000;
    try {
      layer.render!(gl as never, args as never);
    } catch {
      // expected
    }
    expect(getPaths).toHaveBeenCalled();
    expect(getPlayhead).toHaveBeenCalled();
  });
});

describe("createTerritoryLayer on a lost WebGL context", () => {
  // Three non-collinear walked nodes, so the hull has area and a live frame reaches drawArrays.
  const hullPath: Path = {
    kind: "fraud",
    color: [1, 0.24, 0.18],
    points: [
      [0, 0],
      [10, 0],
      [5, 10],
    ],
    nodes: [
      { ts: 1000, frac: 0 },
      { ts: 2000, frac: 0.5 },
      { ts: 3000, frac: 1 },
    ],
    loft: false,
    territory: true,
  };
  const args = {
    shaderData: { variantName: "globe", vertexShaderPrelude: "", define: "" },
    defaultProjectionData: {
      mainMatrix: new Float32Array(16),
      tileMercatorCoords: new Float32Array(4),
      clippingPlane: new Float32Array(4),
      projectionTransition: 0,
      fallbackMatrix: new Float32Array(16),
    },
  };

  /** A gl stub whose compile and link succeed; every call it receives is counted. */
  function fakeGl(lost: boolean) {
    const calls = {
      createShader: vi.fn(() => ({})),
      useProgram: vi.fn(),
      drawArrays: vi.fn(),
    };
    const gl = {
      isContextLost: () => lost,
      ...calls,
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      LINK_STATUS: 4,
      TRIANGLES: 5,
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: () => true,
      deleteShader: vi.fn(),
      createProgram: () => ({}),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: () => true,
      getAttribLocation: () => 0,
      getUniformLocation: () => ({}),
      createVertexArray: () => ({}),
      createBuffer: () => ({}),
      uniformMatrix4fv: vi.fn(),
      uniform4fv: vi.fn(),
      uniform1f: vi.fn(),
      uniform3f: vi.fn(),
      enable: vi.fn(),
      blendFunc: vi.fn(),
      depthMask: vi.fn(),
      bindVertexArray: vi.fn(),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
    };
    return { gl, calls };
  }

  const makeLayer = () =>
    createTerritoryLayer(
      () => [hullPath],
      () => 5000,
      timeline,
    );

  it("a frame on a lost context builds no program, draws nothing and does not throw", () => {
    const { gl, calls } = fakeGl(true);
    expect(() => makeLayer().render!(gl as never, args as never)).not.toThrow();
    expect(calls.createShader).not.toHaveBeenCalled();
    expect(calls.useProgram).not.toHaveBeenCalled();
    expect(calls.drawArrays).not.toHaveBeenCalled();
  });

  it("a frame on a live context still builds the program and draws the hull", () => {
    const { gl, calls } = fakeGl(false);
    makeLayer().render!(gl as never, args as never);
    expect(calls.createShader).toHaveBeenCalled();
    expect(calls.useProgram).toHaveBeenCalledTimes(1);
    expect(calls.drawArrays).toHaveBeenCalledTimes(1);
  });
});

describe("hatchPhasePx (D8: the hatch drifts with the playhead, never the wall clock)", () => {
  it("is a pure function of the playhead: same playhead, same phase", () => {
    expect(hatchPhasePx(3_000, 0, 10_000, false)).toBe(hatchPhasePx(3_000, 0, 10_000, false));
  });

  it("moves with the playhead and reverses on rewind", () => {
    const a = hatchPhasePx(1_000, 0, 10_000, false);
    const b = hatchPhasePx(1_100, 0, 10_000, false);
    expect(b).not.toBe(a);
    expect(hatchPhasePx(1_000, 0, 10_000, false)).toBe(a);
  });

  it("stays inside one hatch period for any playhead, including before the window", () => {
    for (const t of [-5_000, 0, 1, 4_999, 10_000, 123_456]) {
      const ph = hatchPhasePx(t, 0, 10_000, false);
      expect(ph).toBeGreaterThanOrEqual(0);
      expect(ph).toBeLessThan(9);
    }
  });

  it("is static under prefers-reduced-motion and on an empty window", () => {
    expect(hatchPhasePx(3_000, 0, 10_000, true)).toBe(0);
    expect(hatchPhasePx(3_000, 5, 5, false)).toBe(0);
  });
});
