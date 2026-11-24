// frontend/investigator/src/lib/geo.ts
/**
 * Great-circle geometry on [lng, lat] points (pure). Used by the Paths
 * builder to densify long jumps into spherical arcs. Replaces the prior
 * backend pyproj geodesics - visually identical on a 3px ribbon at globe scale.
 */
type LngLat = [number, number];

function toVec([lng, lat]: LngLat): [number, number, number] {
  const la = (lat * Math.PI) / 180;
  const lo = (lng * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

function toLngLat([x, y, z]: [number, number, number]): LngLat {
  const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
  const lng = (Math.atan2(y, x) * 180) / Math.PI;
  return [lng, lat];
}

/** Spherical-linear interpolation along the great circle from a to b. */
export function slerpPoint(a: LngLat, b: LngLat, t: number): LngLat {
  const va = toVec(a);
  const vb = toVec(b);
  let dot = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2];
  dot = Math.max(-1, Math.min(1, dot));
  const omega = Math.acos(dot);
  if (omega < 1e-9) return [...a];
  const s = Math.sin(omega);
  const k0 = Math.sin((1 - t) * omega) / s;
  const k1 = Math.sin(t * omega) / s;
  return toLngLat([
    va[0] * k0 + vb[0] * k1,
    va[1] * k0 + vb[1] * k1,
    va[2] * k0 + vb[2] * k1,
  ]);
}

/** [a, ...nIntermediate interior points..., b] along the great circle. */
export function greatCircleDensify(a: LngLat, b: LngLat, nIntermediate: number): LngLat[] {
  const out: LngLat[] = [a];
  for (let i = 1; i <= nIntermediate; i++) {
    out.push(slerpPoint(a, b, i / (nIntermediate + 1)));
  }
  out.push(b);
  return out;
}
