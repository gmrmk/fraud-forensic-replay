// frontend/investigator/src/lib/territory.ts
/**
 * Territory hull (pure). A path's "territory" is the convex hull of the nodes it has
 * walked so far (ts <= playhead) - the region the path has claimed. Because it is a pure
 * function of {nodes with ts <= playhead}, it grows as the playhead crosses nodes and
 * retracts on rewind with NO animation state to desync (the playhead stays the single
 * source of truth). Computed in flat [lng,lat]; the territory-layer projects each vertex
 * onto the globe so the flat hull drapes onto the sphere. Fan-triangulated (convex => a
 * fan from vertex 0 needs no earcut dependency).
 */
export interface TerritoryNode {
  ts: number; // epoch-ms of the event
  lng: number;
  lat: number;
}

export interface TerritoryHull {
  /** Convex-hull boundary ring, CCW, [lng,lat], no repeated closing point. */
  ring: [number, number][];
  /** Fan triangulation of the ring (each entry is 3 [lng,lat] vertices). */
  triangles: [number, number][][];
}

// 2D cross product of OA x OB: > 0 left turn (CCW), < 0 right turn, 0 collinear.
function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// Andrew's monotone-chain convex hull. Returns a CCW ring (no collinear vertices, no
// repeated closing point) or null when the points have no area (< 3 distinct, or collinear).
function convexHull(points: [number, number][]): [number, number][] | null {
  const uniq = Array.from(new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values());
  if (uniq.length < 3) return null;
  uniq.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const half = (src: [number, number][]): [number, number][] => {
    const out: [number, number][] = [];
    for (const p of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out;
  };
  const lower = half(uniq);
  const upper = half([...uniq].reverse());
  const ring = lower.slice(0, -1).concat(upper.slice(0, -1));
  return ring.length < 3 ? null : ring;
}

/**
 * The territory hull of `nodes` walked by `playheadMs` (those with ts <= playheadMs), or
 * null when fewer than 3 walked nodes have area (degenerate: < 3 distinct points, or
 * collinear). The ring is CCW; `triangles` is its fan triangulation for a WebGL fill mesh.
 */
export function territoryHull(nodes: TerritoryNode[], playheadMs: number): TerritoryHull | null {
  const points = nodes
    .filter((nd) => nd.ts <= playheadMs)
    .map((nd) => [nd.lng, nd.lat] as [number, number]);
  const ring = convexHull(points);
  if (!ring) return null;
  const triangles: [number, number][][] = [];
  for (let i = 1; i < ring.length - 1; i += 1) {
    triangles.push([ring[0], ring[i], ring[i + 1]]);
  }
  return { ring, triangles };
}
