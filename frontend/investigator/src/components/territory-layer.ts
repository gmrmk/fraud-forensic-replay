/**
 * Walking-territory fill as a maplibre CustomLayerInterface.
 *
 * A path's "territory" is the convex hull of the nodes it has walked so far
 * (territoryHull, ts <= playhead). The hull POLYGON welds to the globe - each vertex
 * projected by MapLibre's injected globe prelude `projectTileWithElevation(a_merc, 0)`
 * (drape on the surface; same proven weld + limb-clip path as arc-layer-3d.ts). The FILL
 * is a per-kind diagonal HATCH computed in SCREEN space (gl_FragCoord rotated by the
 * kind's angle), so overlapping territories weave into a legible cross-hatch and the
 * pattern stays crisp under rotate/tilt instead of shimmering on the curved surface.
 *
 * Playhead-true: the hull is a pure function of {nodes with ts <= playhead}, recomputed
 * each frame, so it grows forward and retracts on rewind with no animation state.
 *
 * SPIKE SCOPE (validate first): fill + hatch only. The kind-colored border (a ring
 * ribbon) is a follow-up once the hatch-on-globe is eyes-certified under adversarial
 * rotation. If the hatch shimmers/detaches, the fallback is a maplibre fill-pattern
 * raster sprite per kind (drift sacrificed).
 */
import { MercatorCoordinate } from "maplibre-gl";
import type { CustomLayerInterface, Map as MlMap } from "maplibre-gl";
import { territoryHull, type TerritoryNode } from "../lib/territory";
import type { Path } from "../lib/paths";
import { prefersReducedMotion } from "../lib/tween";
import { PLAYBACK_DURATION_MS } from "./timeline/usePlaybackDriver";

/** Per-kind hatch line direction (radians). Distinct angles so overlapping territories
 *  cross-hatch and stay distinguishable by direction (the cartographic zone convention). */
const HATCH_ANGLE_BY_KIND: Record<string, number> = {
  fraud: (45 * Math.PI) / 180,
  auth: (135 * Math.PI) / 180,
  login: 0,
  transfer: (22 * Math.PI) / 180,
};
const DEFAULT_HATCH_ANGLE = (75 * Math.PI) / 180;

const SPACING_PX = 9; // device px between hatch lines
const LINE_HALF_PX = 1.1; // half-width of a hatch line
const DRIFT_PX_PER_MS = 0.004; // hatch drift speed at 1x playback (px per ms of scrub time)
const FILL_ALPHA = 0.1; // faint territory tint between the hatch lines
const HATCH_ALPHA = 0.5; // hatch line alpha

/**
 * Hatch drift in px, derived from the playhead (the single source of truth), never a
 * clock. One full scrub of the window lasts PLAYBACK_DURATION_MS at 1x, so this matches
 * the old wall-clock drift at 1x and scales with the playback rate. Rewinding reverses
 * it; a paused playhead freezes it. Reduced motion (or an empty window) is a static 0.
 */
export function hatchPhasePx(
  playhead: number,
  minTime: number,
  maxTime: number,
  reducedMotion: boolean,
): number {
  const span = maxTime - minTime;
  if (reducedMotion || span <= 0) return 0;
  const drift = ((playhead - minTime) / span) * PLAYBACK_DURATION_MS * DRIFT_PX_PER_MS;
  return ((drift % SPACING_PX) + SPACING_PX) % SPACING_PX;
}

const VERT_SRC = (prelude: string, define: string): string => `#version 300 es
${prelude}
${define}
in vec2 a_merc;      // hull vertex web-mercator XY in [0..1]
out float v_depth;   // NDC depth, for the limb discard
void main() {
  vec4 clip = projectTileWithElevation(a_merc, 0.0); // drape flat on the surface
  v_depth = clip.z / clip.w;
  gl_Position = clip;
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in float v_depth;
out vec4 fragColor;
uniform vec3  u_color;
uniform float u_hatchAngle; // radians (line normal direction)
uniform float u_spacing;    // px between hatch lines
uniform float u_lineHalf;   // px half-width of a hatch line
uniform float u_phase;      // px drift along the hatch normal
uniform float u_fillAlpha;
uniform float u_hatchAlpha;
void main() {
  if (v_depth > 1.0) discard; // far side of the globe (limb-culled)
  float c = cos(u_hatchAngle);
  float s = sin(u_hatchAngle);
  float coord = gl_FragCoord.x * c + gl_FragCoord.y * s + u_phase; // projection onto the normal
  float d = mod(coord, u_spacing);
  float lineDist = min(d, u_spacing - d);                 // distance to the nearest hatch line
  float line = 1.0 - smoothstep(u_lineHalf - 1.0, u_lineHalf + 1.0, lineDist);
  float a = u_fillAlpha + line * u_hatchAlpha;
  fragColor = vec4(u_color, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("territory shader compile failed: " + log);
  }
  return s;
}

/** Resolve a Path's nodes to {ts,lng,lat} positions (the node's [lng,lat] is points[frac]). */
function territoryNodes(path: Path): TerritoryNode[] {
  const last = path.points.length - 1;
  return path.nodes.map((nd) => {
    const idx = last <= 0 ? 0 : Math.round(nd.frac * last);
    const [lng, lat] = path.points[idx];
    return { ts: nd.ts, lng, lat };
  });
}

/** Flatten a hull's triangles to an interleaved [mercX, mercY] vertex array. */
function buildHullVertices(triangles: [number, number][][]): Float32Array {
  const data = new Float32Array(triangles.length * 3 * 2);
  let o = 0;
  for (const tri of triangles) {
    for (const [lng, lat] of tri) {
      const m = MercatorCoordinate.fromLngLat({ lng, lat });
      data[o++] = m.x;
      data[o++] = m.y;
    }
  }
  return data;
}

/**
 * Build the walking-territory custom layer.
 * @param getPaths    current baked Paths (read each frame).
 * @param getPlayhead current playhead in epoch-ms (the single source of truth).
 * @param getTimeline the playhead window + play state (pass () => usePlayhead.getState());
 *                    drives the hatch drift and gates the per-frame repaint to playback.
 */
export function createTerritoryLayer(
  getPaths: () => Path[],
  getPlayhead: () => number,
  getTimeline: () => { minTime: number; maxTime: number; isPlaying: boolean },
): CustomLayerInterface {
  let mapRef: MlMap | null = null;
  let program: WebGLProgram | null = null;
  let builtVariant: string | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let vbo: WebGLBuffer | null = null;
  let aMercLoc = -1;
  const uniform: Record<string, WebGLUniformLocation | null> = {};

  function buildProgram(gl: WebGL2RenderingContext, prelude: string, define: string): void {
    if (program) gl.deleteProgram(program);
    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC(prelude, define));
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error("territory program link failed: " + log);
    }
    program = prog;
    aMercLoc = gl.getAttribLocation(prog, "a_merc");
    for (const u of [
      "u_projection_matrix",
      "u_projection_tile_mercator_coords",
      "u_projection_clipping_plane",
      "u_projection_transition",
      "u_projection_fallback_matrix",
      "u_color",
      "u_hatchAngle",
      "u_spacing",
      "u_lineHalf",
      "u_phase",
      "u_fillAlpha",
      "u_hatchAlpha",
    ]) {
      uniform[u] = gl.getUniformLocation(prog, u);
    }
  }

  return {
    id: "territory-fill",
    type: "custom",
    renderingMode: "3d",

    onAdd(map: MlMap) {
      mapRef = map;
    },

    onRemove(_map: MlMap, glIn: WebGLRenderingContext | WebGL2RenderingContext) {
      const gl = glIn as WebGL2RenderingContext;
      if (vao) gl.deleteVertexArray(vao);
      if (vbo) gl.deleteBuffer(vbo);
      if (program) gl.deleteProgram(program);
      vao = null;
      vbo = null;
      program = null;
      builtVariant = null;
      mapRef = null;
    },

    render(glIn, args) {
      const gl = glIn as WebGL2RenderingContext;
      const paths = getPaths();
      if (paths.length === 0) return;
      // A lost context cannot compile a shader: compile() would throw inside MapLibre's frame.
      // Draw nothing; the program is built on the first frame after a context is live again.
      if (gl.isContextLost()) return;
      const playhead = getPlayhead();
      const { minTime, maxTime, isPlaying } = getTimeline();
      const reducedMotion = prefersReducedMotion();

      const variant = args.shaderData.variantName;
      if (!program || builtVariant !== variant) {
        buildProgram(gl, args.shaderData.vertexShaderPrelude, args.shaderData.define);
        builtVariant = variant;
      }
      if (!program) return;
      if (!vao) vao = gl.createVertexArray();
      if (!vbo) vbo = gl.createBuffer();

      const pd = args.defaultProjectionData;
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniform["u_projection_matrix"], false, pd.mainMatrix as Float32List);
      gl.uniform4fv(uniform["u_projection_tile_mercator_coords"], pd.tileMercatorCoords as Float32List);
      gl.uniform4fv(uniform["u_projection_clipping_plane"], pd.clippingPlane as Float32List);
      gl.uniform1f(uniform["u_projection_transition"], pd.projectionTransition);
      gl.uniformMatrix4fv(uniform["u_projection_fallback_matrix"], false, pd.fallbackMatrix as Float32List);
      gl.uniform1f(uniform["u_spacing"], SPACING_PX);
      gl.uniform1f(uniform["u_lineHalf"], LINE_HALF_PX);
      gl.uniform1f(uniform["u_fillAlpha"], FILL_ALPHA);
      gl.uniform1f(uniform["u_hatchAlpha"], HATCH_ALPHA);
      gl.uniform1f(uniform["u_phase"], hatchPhasePx(playhead, minTime, maxTime, reducedMotion));

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // alpha-over: a tinted region, not a glow
      gl.depthMask(false);

      let anyDrawn = false;
      for (const path of paths) {
        if (!path.territory) continue; // a route (an access path) claims no territory
        const hull = territoryHull(territoryNodes(path), playhead);
        if (!hull) continue; // < 3 walked nodes: no territory yet
        const verts = buildHullVertices(hull.triangles);
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(aMercLoc);
        gl.vertexAttribPointer(aMercLoc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform3f(uniform["u_color"], path.color[0], path.color[1], path.color[2]);
        gl.uniform1f(uniform["u_hatchAngle"], HATCH_ANGLE_BY_KIND[path.kind] ?? DEFAULT_HATCH_ANGLE);
        gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
        anyDrawn = true;
      }
      gl.bindVertexArray(null);
      gl.depthMask(true);
      // Repaint continuously only while the hatch can move; a paused or reduced-motion
      // globe repaints on playhead/camera changes alone.
      if (anyDrawn && isPlaying && !reducedMotion) mapRef?.triggerRepaint();
    },
  };
}
