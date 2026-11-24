import { afterEach, describe, it, expect, vi } from "vitest";
import { createArcLayer, pathBlend } from "./arc-layer-3d";
import { usePlayhead } from "../store/playhead";
import type { Path } from "../store/paths";

// Additive light vanishes on a light basemap: the fraud path drew as a near-invisible pale line in
// the light theme. Light mode composites normally, keeps a readable walked thread, and drops the
// white tip (white on a light map is invisible); dark mode keeps the neon look unchanged.
describe("pathBlend", () => {
  it("dark keeps the additive neon glow", () => {
    expect(pathBlend("dark")).toEqual({ additive: true, baseAlpha: 0.08, tipMix: 1, widthScale: 1 });
  });
  it("light composites normally so the path stays visible on a light map", () => {
    const b = pathBlend("light");
    expect(b.additive).toBe(false);
    expect(b.baseAlpha).toBeGreaterThanOrEqual(0.3);
    expect(b.tipMix).toBe(0);
    expect(b.widthScale).toBeGreaterThan(1);
  });
});

// MapLibre can draw one more frame between the moment a WebGL context is lost and the moment it
// hears about it. If that frame needs the program rebuilt (the projection variant changes where
// the globe hands over to mercator, at zoom 12), compile() runs on the lost context, where the
// compile status reads false, and the layer throws inside MapLibre's frame.
describe("createArcLayer on a lost WebGL context", () => {
  const arc: Path = {
    kind: "fraud",
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
    territory: false,
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

  /** A gl stub that behaves like the real thing on this point: a lost context reports a failed
   *  compile with no log; a live one compiles and links. The calls that matter are counted. */
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
      TRIANGLE_STRIP: 5,
      drawingBufferWidth: 800,
      drawingBufferHeight: 600,
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: () => !lost,
      getShaderInfoLog: () => null,
      deleteShader: vi.fn(),
      createProgram: () => ({}),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: () => !lost,
      getProgramInfoLog: () => null,
      deleteProgram: vi.fn(),
      getAttribLocation: () => 0,
      getUniformLocation: () => ({}),
      createVertexArray: () => ({}),
      createBuffer: () => ({}),
      deleteVertexArray: vi.fn(),
      deleteBuffer: vi.fn(),
      bindVertexArray: vi.fn(),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      uniformMatrix4fv: vi.fn(),
      uniform4fv: vi.fn(),
      uniform1f: vi.fn(),
      uniform2f: vi.fn(),
      uniform3f: vi.fn(),
      enable: vi.fn(),
      blendFunc: vi.fn(),
      depthMask: vi.fn(),
    };
    return { gl, calls };
  }

  const paths = [arc];
  const makeLayer = () =>
    createArcLayer(
      () => paths,
      () => 1,
    );

  it("a frame on a lost context builds no program, draws nothing and does not throw", () => {
    const { gl, calls } = fakeGl(true);
    expect(() => makeLayer().render!(gl as never, args as never)).not.toThrow();
    expect(calls.createShader).not.toHaveBeenCalled();
    expect(calls.useProgram).not.toHaveBeenCalled();
    expect(calls.drawArrays).not.toHaveBeenCalled();
  });

  it("a frame on a live context still builds the program and draws the path", () => {
    const { gl, calls } = fakeGl(false);
    makeLayer().render!(gl as never, args as never);
    expect(calls.createShader).toHaveBeenCalledTimes(2);
    expect(calls.useProgram).toHaveBeenCalledTimes(1);
    expect(calls.drawArrays).toHaveBeenCalledTimes(1);
  });

  it("a layer that sat out a lost frame builds its program on the next live frame", () => {
    const layer = makeLayer();
    const dead = fakeGl(true);
    layer.render!(dead.gl as never, args as never);
    const live = fakeGl(false);
    layer.render!(live.gl as never, args as never);
    expect(dead.calls.createShader).not.toHaveBeenCalled();
    expect(live.calls.createShader).toHaveBeenCalledTimes(2);
    expect(live.calls.drawArrays).toHaveBeenCalledTimes(1);
  });

  // A paused map is left still: the path's frontier moves only with the playhead, and the globe
  // already asks for a repaint at every playhead change, so the layer asks for its own repaint
  // only while the playhead is playing.
  describe("its own repaint request", () => {
    afterEach(() => {
      usePlayhead.setState({ isPlaying: false });
    });

    function drawOneFrame() {
      const triggerRepaint = vi.fn();
      const layer = makeLayer();
      layer.onAdd!({ triggerRepaint } as never, fakeGl(false).gl as never);
      layer.render!(fakeGl(false).gl as never, args as never);
      return triggerRepaint;
    }

    it("makes no triggerRepaint call while paused", () => {
      usePlayhead.setState({ isPlaying: false });
      expect(drawOneFrame()).not.toHaveBeenCalled();
    });

    it("makes one triggerRepaint call a frame while playing", () => {
      usePlayhead.setState({ isPlaying: true });
      expect(drawOneFrame()).toHaveBeenCalledTimes(1);
    });
  });
});
