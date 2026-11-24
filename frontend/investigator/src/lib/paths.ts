// frontend/investigator/src/lib/paths.ts
/**
 * Schema-agnostic Path builder (pure). A Path is one entity kind's events,
 * in time order, as a densified polyline + a node→point-fraction map. Computed
 * from only Entity.timestamp + Entity.coords, so any kind (current or future-
 * ingested) gets a Path with no per-kind code. See spec § Path primitive.
 */
import type { Entity } from "./entity";
import { haversineMiles } from "./entities";
import { greatCircleDensify } from "./geo";
import { resolveEntityColorRgb01 } from "../theme/resolve";
import type { Theme, ColorMode } from "../theme/axes";
import { DEFAULT_THEME, DEFAULT_COLOR } from "../theme/axes";

// Re-export so existing importers (paths.test.ts etc.) keep working.
import { hexToRgb01 } from "../theme/to-rgb";
export { hexToRgb01 };

export interface PathNode {
  ts: number; // epoch-ms of the event
  frac: number; // 0..1 position of the event along the points array
}

export interface Path {
  kind: string;
  color: [number, number, number]; // 0..1 rgb
  points: [number, number][]; // [lng, lat], chronological, densified
  nodes: PathNode[]; // one per source event
  /** Render config: lift the ribbon into a 3D arch (true) or drape it flat on the
   *  surface (false, default). Drape is investigation-safe - a lofted arc implies a
   *  route that isn't real. The arch machinery is retained; this flag is the per-path
   *  seam a future org-level render config / backend dash would drive. */
  loft: boolean;
  /** Draw the walking-territory hull under this path (false for routes such as access paths). */
  territory: boolean;
}

const LONG_JUMP_MI = 500; // ≥ this → densify into a great-circle arch
const COINCIDENT_MI = 1; // < this → collapse onto the previous point
const PTS_PER_1000MI = 20; // arch densification density

export interface BuildPathOpts {
  loft?: boolean;
  territory?: boolean;
  /** Explicit colour (a manifest node palette) for a kind the theme has no slot for. */
  hex?: string;
  theme?: Theme;
  color?: ColorMode;
}

export function buildPath(
  entities: Entity[],
  kind: string,
  opts?: BuildPathOpts,
): Path | null {
  // Only timeline-positioned events (places carry timestamp 0 sentinel) WITH
  // geography - behavioral entities (coords null) never join a globe path.
  const evs = entities
    .filter((e): e is Entity & { coords: { lat: number; lng: number } } =>
      e.timestamp > 0 && e.coords !== null,
    )
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);
  if (evs.length < 2) return null;

  const points: [number, number][] = [[evs[0].coords.lng, evs[0].coords.lat]];
  const nodeIdx: number[] = [0]; // point-index of each event

  for (let i = 1; i < evs.length; i++) {
    const a = evs[i - 1].coords;
    const b = evs[i].coords;
    const distMi = haversineMiles([a.lat, a.lng], [b.lat, b.lng]);
    if (distMi >= LONG_JUMP_MI) {
      const nInter = Math.max(8, Math.round((distMi / 1000) * PTS_PER_1000MI));
      const seg = greatCircleDensify([a.lng, a.lat], [b.lng, b.lat], nInter);
      for (let k = 1; k < seg.length; k++) points.push(seg[k]); // skip dup start
      nodeIdx.push(points.length - 1);
    } else if (distMi >= COINCIDENT_MI) {
      points.push([b.lng, b.lat]);
      nodeIdx.push(points.length - 1);
    } else {
      nodeIdx.push(points.length - 1); // coincident: collapse onto last point
    }
  }

  const last = points.length - 1;
  const nodes: PathNode[] = evs.map((e, i) => ({
    ts: e.timestamp,
    frac: last === 0 ? 0 : nodeIdx[i] / last,
  }));
  // Schema-agnostic: resolveEntityColorRgb01 uses slotFor(kind) which falls
  // back to textFaint for unregistered future-ingested kinds, so no crash.
  const rgb = opts?.hex
    ? hexToRgb01(opts.hex)
    : resolveEntityColorRgb01(kind, opts?.theme ?? DEFAULT_THEME, opts?.color ?? DEFAULT_COLOR);
  // loft defaults to false (drape). Opt-in per path; org render config can set it later.
  return { kind, color: rgb, points, nodes, loft: opts?.loft ?? false, territory: opts?.territory ?? true };
}

/** The Paths of one kind. With `pathBy` (a manifest node key naming who is moving), events are grouped by that
 *  field and each group becomes its own Path, so forty seats draw forty paths instead of one chain across
 *  the map; without it, the kind's events form the single chained Path as before. Groups with fewer than two
 *  positioned events draw nothing. */
export function buildPaths(
  entities: Entity[],
  kind: string,
  pathBy: string | undefined,
  opts?: BuildPathOpts,
): Path[] {
  if (!pathBy) {
    const p = buildPath(entities, kind, opts);
    return p ? [p] : [];
  }
  const groups = new Map<string, Entity[]>();
  for (const e of entities) {
    const key = String(e.fields[pathBy] ?? "");
    const g = groups.get(key);
    if (g) g.push(e);
    else groups.set(key, [e]);
  }
  const out: Path[] = [];
  for (const g of groups.values()) {
    const p = buildPath(g, kind, opts);
    if (p) out.push(p);
  }
  return out;
}
