/**
 * Lifted-3D welded fraud-arc as a maplibre CustomLayerInterface.
 *
 * PATH B (the one that renders): the geodesic polyline (from /api/arcs) is drawn
 * as a thin **triangle-strip ribbon** expanded in screen space on the GPU. Each
 * vertex is projected by MapLibre's OWN injected globe shader via
 * `projectTileWithElevation(mercatorXY01, elevationMeters)` - the same prelude
 * path MapLibre's internal shaders use - so the ribbon:
 *   - WELDS to the sphere under full rotate/tilt (prelude owns the globe camera);
 *   - LIFTS by `liftHeights()` meters ONLY when `path.loft` is set (default false ->
 *     drapes FLAT on the surface); the arch machinery is retained for opt-in / org-config reuse;
 *   - CLIPS at the limb for free (`projectTileWithElevation` → `interpolateProjection`
 *     overwrites gl_Position.z with `globeComputeClippingZ·w`, far-side culled in
 *     clip space). NOT `projectTileFor3D`, which preserves Z and does NOT clip.
 *
 * VISUAL (glow-trail): a thin neon filament (bright core + soft bloom
 * via the cross-ribbon profile) whose brightness rides the per-path draw-on
 * frontier - a hot-white tip at `u_frac` tapering into a trailing glow, over a
 * faint walked-only base thread. Same additive neon grammar + semantic palette;
 * only the front is bright, so dense clusters read calm. Reversible: the frontier
 * (`drawFrac`) retracts on rewind. Replaced the marching chevrons.
 *
 * Why a ribbon, not a GL line: `gl.lineWidth` is capped at 1px in Chrome/ANGLE,
 * so a `LINE_STRIP` is an invisible hairline - the prior (Path A) bug.
 *
 * Contract verified against installed maplibre-gl 5.24 source (primary):
 *   - The custom-layer vertex prelude (`args.shaderData.vertexShaderPrelude`)
 *     defines `projectTileWithElevation` (plus the globe glsl).
 *   - Custom layers supply mercator coordinates in **[0..1]** (the library's own
 *     comment; globe path `tileMercatorCoords = [0,0,1,1]`). We use
 *     `MercatorCoordinate.fromLngLat` so the space is guaranteed to match.
 *   - MapLibre does NOT bind the projection uniforms to our program (it calls
 *     `setCustomLayerDefaults()` then `render()`), so we bind all five ourselves
 *     each frame from `args.defaultProjectionData`.
 *
 * Geometry is STATIC (baked once per arc-set; screen-space expansion happens in
 * the vertex shader after projection). The arc animates via the playhead: `render`
 * calls `map.triggerRepaint()` while paths draw and the playhead is playing, so the
 * advancing per-path `drawFrac` frontier (and its trailing glow) re-render each frame.
 * While paused the layer asks for nothing; GlobeMap requests one repaint at each
 * playhead change, which is all a scrub needs.
 *
 * Eyes-on certified (user, adversarial rotation): welds both endpoints, holds
 * under full rotate/tilt, limb behaviour clean. The glow-trail treatment renders
 * on top of that verified weld.
 */
import { MercatorCoordinate } from "maplibre-gl";
import type { CustomLayerInterface, Map as MlMap } from "maplibre-gl";
import { liftHeights } from "../lib/arc-geometry";
import type { Path } from "../store/paths";
import { usePlayhead } from "../store/playhead";

/** Single ribbon alpha for all Paths (toggle-only loudness - no hero split). */
const PATH_CORE_ALPHA = 0.9;

/** Half ribbon width in device px - a thin neon filament (the bloom does the rest). */
const HALF_WIDTH_PX = 3.5;
/** Glow-trail envelope constants (first-pass; calibrated on the eyes-on gate).
 *  All distances are in v_t units (0 = path start, 1 = path end). */
const TRAIL_LEN = 0.15; // trail persistence behind the frontier - "medium" (user pick B)
const TIP_WIDTH = 0.06; // width of the hot-white leading band at the frontier
const BASE_ALPHA = 0.08; // faint walked-only base thread so the walked path stays legible

/** How a Path composites per theme. Additive light vanishes on the light basemap (the fraud path
 *  drew as a near-invisible pale line), so light mode blends normally, keeps a readable walked
 *  thread and drops the white tip; dark mode keeps the neon glow. */
export function pathBlend(theme: string | null): { additive: boolean; baseAlpha: number; tipMix: number; widthScale: number } {
  return theme === "light"
    ? { additive: false, baseAlpha: 0.35, tipMix: 0, widthScale: 1.6 } // no bloom on light: a wider core carries it
    : { additive: true, baseAlpha: BASE_ALPHA, tipMix: 1, widthScale: 1 };
}

const VERT_SRC = (prelude: string, define: string): string => `#version 300 es
${prelude}
${define}
in vec2  a_merc;       // this point's web-mercator XY in [0..1]
in float a_elev;       // this point's lift in meters
in vec2  a_mercPrev;   // previous point (for central-difference tangent)
in float a_elevPrev;
in vec2  a_mercNext;    // next point
in float a_elevNext;
in float a_side;       // -1.0 / +1.0 ribbon edge
in float a_t;          // 0..1 along the arc (Houston=0, Lagos=1)

uniform vec2  u_viewport;     // [drawingBufferWidth, drawingBufferHeight] (device px)
uniform float u_halfWidthPx;  // max half ribbon width in device px (at the tip)
uniform float u_frac;         // this path's draw-on frontier in a_t units
uniform float u_trailLen;     // trail persistence (a_t units); guarded > 0
uniform float u_lift;         // 1 = lift by a_elev (fraud hero arc); 0 = flat drape

out float v_cross;            // -1..1 across the ribbon
out float v_t;                // 0..1 along the arc
out float v_depth;            // NDC depth, for the limb discard in the fragment

void main() {
    // Per-kind lift: u_lift=1 (fraud hero) arcs the ribbon over the horizon via
    // projectTileWithElevation (welds + lifts + horizon-clips); u_lift=0
    // (auth/login) zeroes the elevation so the line drapes FLAT on the globe.
    vec4 clipHere = projectTileWithElevation(a_merc, a_elev * u_lift);
    vec4 clipPrev = projectTileWithElevation(a_mercPrev, a_elevPrev * u_lift);
    vec4 clipNext = projectTileWithElevation(a_mercNext, a_elevNext * u_lift);

    v_cross = a_side;
    v_t = a_t;

    // Screen-space tangent with a degeneracy cascade (central -> forward -> back
    // -> collapse), each guarded on clip.w > 0, so near-coincident points and a
    // limb-crossing neighbour (w<=0 -> exploded NDC) can't whip the normal into a
    // spike. This is the "lightning off the planet" fix.
    vec2 ndcHere = clipHere.xy / clipHere.w;
    vec2 ndcPrev = clipPrev.xy / clipPrev.w;
    vec2 ndcNext = clipNext.xy / clipNext.w;
    bool okPrev = clipPrev.w > 1e-4;
    bool okNext = clipNext.w > 1e-4;
    vec2 d;
    if (okPrev && okNext && length((ndcNext - ndcPrev) * u_viewport) > 1e-4) {
        d = (ndcNext - ndcPrev) * u_viewport;             // central difference
    } else if (okNext && length((ndcNext - ndcHere) * u_viewport) > 1e-4) {
        d = (ndcNext - ndcHere) * u_viewport;             // forward one-sided
    } else if (okPrev && length((ndcHere - ndcPrev) * u_viewport) > 1e-4) {
        d = (ndcHere - ndcPrev) * u_viewport;             // backward one-sided
    } else {
        v_depth = 2.0;                                    // both degenerate ->
        gl_Position = clipHere;                           // force-discard, no spike
        return;
    }
    vec2 dir = normalize(d);
    vec2 nrm = vec2(-dir.y, dir.x);                       // 90deg rotate

    // Width tapers with the SAME trail envelope the fragment fades with, floored
    // so the tail stays a solid thin line (not sub-pixel shimmer).
    float behind = max(0.0, u_frac - a_t);
    float env = exp(-behind / max(u_trailLen, 1e-3));
    float halfW = max(0.75, u_halfWidthPx * env);

    // halfWidthPx -> NDC offset (x2 because NDC spans -1..1), re-multiply by w
    // so the constant-pixel offset survives the perspective divide.
    vec2 offsetNDC = a_side * (halfW * nrm) / u_viewport * 2.0;
    clipHere.xy += offsetNDC * clipHere.w;

    v_depth = clipHere.z / clipHere.w;
    gl_Position = clipHere;
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in float v_cross;   // -1..1 across the ribbon
in float v_t;       // 0..1 along the arc (path start=0, end=1)
in float v_depth;   // NDC depth from the vertex shader (limb discard)
out vec4 fragColor;

uniform float u_frac;       // this path's draw-on frontier in v_t units
uniform float u_trailLen;   // trail persistence (v_t units); guarded > 0
uniform float u_tipWidth;   // hot-white leading-band width (v_t units); guarded > 0
uniform float u_baseAlpha;  // faint walked-only base thread
uniform float u_tipMix;     // 1 = hot-white tip (dark), 0 = none (light: white vanishes)
uniform float u_coreAlpha;  // master alpha
uniform vec3  u_color;

void main() {
    if (v_depth > 1.0) discard;   // beyond the limb (far side of the globe)
    float ax = abs(v_cross);
    // Neon cross-profile: bright thin core, soft bloom to the edges (UNCHANGED).
    float tube = pow(1.0 - ax, 2.2);

    // Hot-tip + trail: brightest at the frontier (v_t == u_frac), tapering back
    // over the walked portion. behind >= 0 for every drawn fragment.
    float behind = max(0.0, u_frac - v_t);
    float trail  = exp(-behind / max(u_trailLen, 1e-3)); // guard trailLen>0 -> never NaN
    float bright = u_baseAlpha + trail;                  // faint base + bright trail
    float a = tube * bright * u_coreAlpha;
    if (a < 0.004) discard;

    // Hot-white ONLY in the leading band. edge0 < edge1 (tipWidth>0) -> safe smoothstep.
    float tip = smoothstep(u_frac - max(u_tipWidth, 1e-3), u_frac, v_t);
    vec3 col = mix(u_color, vec3(1.0, 0.93, 0.86), tube * tip * u_tipMix);
    fragColor = vec4(col, a);
}`;

/** Floats per vertex in the interleaved buffer (see attribute layout below). */
const FLOATS_PER_VERTEX = 11;
const STRIDE = FLOATS_PER_VERTEX * 4; // bytes

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("arc-3d shader compile failed: " + log);
  }
  return s;
}

interface ArcMesh {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  /** number of arc points (the strip has 2 vertices per point). */
  pointCount: number;
  color: [number, number, number];
}

/** Build the interleaved [a_merc, a_elev, a_mercPrev, a_elevPrev, a_mercNext,
 *  a_elevNext, a_side, a_t] vertex array for one arc (2 verts per point). */
function buildArcVertices(arc: Path): Float32Array {
  const n = arc.points.length;
  const merc = arc.points.map(([lng, lat]) => {
    const m = MercatorCoordinate.fromLngLat({ lng, lat });
    return [m.x, m.y] as [number, number];
  });
  const lifts = liftHeights(arc.points);
  const data = new Float32Array(n * 2 * FLOATS_PER_VERTEX);
  let o = 0;
  for (let i = 0; i < n; i++) {
    const prev = Math.max(0, i - 1);
    const next = Math.min(n - 1, i + 1);
    // pyproj npts divides the geodesic into equal segments, so index-fraction
    // is the normalized arc-length (Houston=0 -> Lagos=1). Used as v_t for the glow-trail.
    const t = n <= 1 ? 0 : i / (n - 1);
    for (const side of [-1, 1]) {
      data[o++] = merc[i][0];
      data[o++] = merc[i][1];
      data[o++] = lifts[i];
      data[o++] = merc[prev][0];
      data[o++] = merc[prev][1];
      data[o++] = lifts[prev];
      data[o++] = merc[next][0];
      data[o++] = merc[next][1];
      data[o++] = lifts[next];
      data[o++] = side;
      data[o++] = t;
    }
  }
  return data;
}

/**
 * Build the arc custom layer.
 * @param getPaths    returns the current baked Paths (read each frame).
 * @param getDrawFrac returns 0..1 draw-on fraction for a given Path.
 */
export function createArcLayer(
  getPaths: () => Path[],
  getDrawFrac: (path: Path) => number,
): CustomLayerInterface {
  let mapRef: MlMap | null = null;
  let program: WebGLProgram | null = null;
  let builtVariant: string | null = null;
  let builtPaths: Path[] | null = null;
  let meshes: ArcMesh[] = [];

  const attrib: Record<string, number> = {};
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
      throw new Error("arc-3d program link failed: " + log);
    }
    program = prog;
    for (const a of ["a_merc", "a_elev", "a_mercPrev", "a_elevPrev", "a_mercNext", "a_elevNext", "a_side", "a_t"]) {
      attrib[a] = gl.getAttribLocation(prog, a);
    }
    for (const u of [
      "u_projection_matrix",
      "u_projection_tile_mercator_coords",
      "u_projection_clipping_plane",
      "u_projection_transition",
      "u_projection_fallback_matrix",
      "u_viewport",
      "u_halfWidthPx",
      "u_frac",
      "u_trailLen",
      "u_tipWidth",
      "u_lift",
      "u_baseAlpha",
      "u_tipMix",
      "u_coreAlpha",
      "u_color",
    ]) {
      uniform[u] = gl.getUniformLocation(prog, u);
    }
  }

  function disposeMeshes(gl: WebGL2RenderingContext): void {
    for (const m of meshes) {
      gl.deleteVertexArray(m.vao);
      gl.deleteBuffer(m.vbo);
    }
    meshes = [];
  }

  function buildMeshes(gl: WebGL2RenderingContext, paths: Path[]): void {
    disposeMeshes(gl);
    for (const arc of paths) {
      // No skip for short paths - meshes must stay 1:1 with paths so meshes[mi]
      // aligns with paths[mi] in the draw loop. A degenerate ≤1-point path
      // produces vertexCount=2 which draws nothing via TRIANGLE_STRIP.
      const vao = gl.createVertexArray()!;
      const vbo = gl.createBuffer()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, buildArcVertices(arc), gl.STATIC_DRAW);
      // a_merc(2)@0 a_elev(1)@8 a_mercPrev(2)@12 a_elevPrev(1)@20
      // a_mercNext(2)@24 a_elevNext(1)@32 a_side(1)@36 a_t(1)@40
      const set = (name: string, size: number, offset: number) => {
        const loc = attrib[name];
        if (loc < 0) return;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE, offset);
      };
      set("a_merc", 2, 0);
      set("a_elev", 1, 8);
      set("a_mercPrev", 2, 12);
      set("a_elevPrev", 1, 20);
      set("a_mercNext", 2, 24);
      set("a_elevNext", 1, 32);
      set("a_side", 1, 36);
      set("a_t", 1, 40);
      gl.bindVertexArray(null);
      meshes.push({ vao, vbo, pointCount: arc.points.length, color: arc.color });
    }
  }

  return {
    id: "arc-3d",
    type: "custom",
    renderingMode: "3d",

    onAdd(map: MlMap) {
      mapRef = map;
    },

    onRemove(_map: MlMap, glIn: WebGLRenderingContext | WebGL2RenderingContext) {
      const gl = glIn as WebGL2RenderingContext;
      disposeMeshes(gl);
      if (program) gl.deleteProgram(program);
      program = null;
      builtVariant = null;
      builtPaths = null;
      mapRef = null;
    },

    render(glIn, args) {
      const gl = glIn as WebGL2RenderingContext;
      const paths = getPaths();
      if (paths.length === 0) return;
      // A lost context cannot compile a shader: compile() would throw inside MapLibre's frame.
      // Draw nothing; the program and the meshes are built on the first frame of a live context.
      if (gl.isContextLost()) return;

      // Lazy program build: the prelude is only available here (in render), not
      // onAdd, and must be rebuilt when the projection variant changes.
      const variant = args.shaderData.variantName;
      if (!program || builtVariant !== variant) {
        buildProgram(gl, args.shaderData.vertexShaderPrelude, args.shaderData.define);
        builtVariant = variant;
        builtPaths = null; // attrib locations changed → rebuild VAOs
      }
      if (builtPaths !== paths) {
        buildMeshes(gl, paths);
        builtPaths = paths;
      }
      if (!program || meshes.length === 0) return;

      const pd = args.defaultProjectionData;

      gl.useProgram(program);

      // Bind the five projection uniforms from defaultProjectionData (MapLibre
      // resets to custom-layer defaults before calling us, so we must set these).
      gl.uniformMatrix4fv(uniform["u_projection_matrix"], false, pd.mainMatrix as Float32List);
      gl.uniform4fv(uniform["u_projection_tile_mercator_coords"], pd.tileMercatorCoords as Float32List);
      gl.uniform4fv(uniform["u_projection_clipping_plane"], pd.clippingPlane as Float32List);
      gl.uniform1f(uniform["u_projection_transition"], pd.projectionTransition);
      gl.uniformMatrix4fv(uniform["u_projection_fallback_matrix"], false, pd.fallbackMatrix as Float32List);

      gl.uniform2f(uniform["u_viewport"], gl.drawingBufferWidth, gl.drawingBufferHeight);
      const blend = pathBlend(document.documentElement.getAttribute("data-theme"));
      gl.uniform1f(uniform["u_halfWidthPx"], HALF_WIDTH_PX * blend.widthScale);
      gl.uniform1f(uniform["u_trailLen"], TRAIL_LEN);
      gl.uniform1f(uniform["u_tipWidth"], TIP_WIDTH);
      gl.uniform1f(uniform["u_baseAlpha"], blend.baseAlpha);
      gl.uniform1f(uniform["u_tipMix"], blend.tipMix);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, blend.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); // neon over dark, normal over light
      // The far side is culled by the clip-Z that projectTileWithElevation writes;
      // don't write our clip-Z into MapLibre's depth buffer (restore after).
      gl.depthMask(false);

      let anyDrawn = false;
      for (let mi = 0; mi < meshes.length; mi++) {
        const mesh = meshes[mi];
        const drawFrac = Math.max(0, Math.min(1, getDrawFrac(paths[mi])));
        if (drawFrac <= 0.001) continue; // fully-retracted Path draws nothing
        anyDrawn = true;
        const pointsToDraw = Math.max(2, Math.ceil(mesh.pointCount * drawFrac));
        const vertexCount = Math.min(mesh.pointCount, pointsToDraw) * 2;
        gl.uniform3f(uniform["u_color"], mesh.color[0], mesh.color[1], mesh.color[2]);
        gl.uniform1f(uniform["u_coreAlpha"], PATH_CORE_ALPHA);
        gl.uniform1f(uniform["u_frac"], drawFrac); // frontier in v_t units -> hot tip here
        // Per-path render config (2026-06-03): u_lift is driven by path.loft, which
        // DEFAULTS to false -> the ribbon drapes FLAT on the surface. A lofted arc
        // implies a route that isn't real and can bias an investigation, so drape is
        // the honest default; loft is opt-in (path.loft=true) and the full arch
        // machinery (a_elev / liftHeights / projectTileWithElevation) is kept on hand
        // for reuse. This flag is the seam a future org-level render config / dash drives.
        gl.uniform1f(uniform["u_lift"], paths[mi].loft ? 1.0 : 0.0);
        gl.bindVertexArray(mesh.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexCount);
      }
      gl.bindVertexArray(null);
      gl.depthMask(true);
      // Ask for the next frame only while playing, when the frontier advances with the playhead.
      // A paused map stays still; GlobeMap already requests a repaint at each playhead change,
      // so a scrub still redraws the path.
      if (anyDrawn && usePlayhead.getState().isPlaying) mapRef?.triggerRepaint();
    },
  };
}
