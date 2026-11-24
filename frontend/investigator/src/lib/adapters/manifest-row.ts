/**
 * Generic adapter: a manifest node + one /api/entities row -> Entity.
 * The manifest (ScenarioNode) is the only schema this knows, so a pack whose
 * kinds are not the six concrete ones (organisations, sign-ins, usage...) boots
 * through here with no per-kind code.
 */
import type { Entity } from "../entity";
import type { ScenarioNode } from "../scenarios";
import { resolveTemplate } from "../ticker-stream";

/** The kinds the app boots through its dedicated endpoints and adapters. */
const CONCRETE_KINDS: ReadonlySet<string> = new Set([
  "auth", "fraud", "login", "place", "account_event", "transfer",
]);

export function isGenericNode(node: ScenarioNode): boolean {
  // sql nodes and file-backed json nodes both arrive as rows from /api/entities.
  return (node.source === "sql" || node.source === "json") && !CONCRETE_KINDS.has(node.kind);
}

export function manifestRowToEntity(node: ScenarioNode, row: Record<string, unknown>): Entity {
  const lat = node.coords ? row[node.coords.lat] : null;
  const lng = node.coords ? row[node.coords.lng] : null;
  const ts = node.timestamp ? Date.parse(String(row[node.timestamp])) : NaN;
  return {
    id: String(row.id),
    kind: node.kind,
    timestamp: Number.isFinite(ts) ? ts : 0,
    coords:
      typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)
        ? { lat, lng }
        : null,
    fields: row,
    displayMetadata: {
      primaryLabel: resolveTemplate(node.primary, row),
      secondaryLabel: resolveTemplate(node.secondary, row),
      paletteKind: node.kind,
      pivotableFields: node.pivotable ?? [],
    },
  };
}

export interface Bounds {
  min: number;
  max: number;
}

/** The time span of the timestamped entities (timestamp 0 = timeless), or null. */
export function entityBounds(entities: readonly Entity[]): Bounds | null {
  let min = Infinity;
  let max = -Infinity;
  for (const e of entities) {
    if (e.timestamp <= 0) continue;
    if (e.timestamp < min) min = e.timestamp;
    if (e.timestamp > max) max = e.timestamp;
  }
  return min <= max ? { min, max } : null;
}

/** The span covering both (either may be null). */
export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
}
