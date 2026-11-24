// frontend/investigator/src/lib/arc-cascade.ts
/**
 * Pure playhead → draw-fraction map for a Path's cascade. Piecewise-linear in
 * time across the Path's node timestamps, so the ribbon tip snaps to each
 * event's point as the playhead reaches it - forward and reverse by construction.
 */
import type { PathNode } from "./paths";

export function cascadeDrawFrac(playheadMs: number, nodes: PathNode[]): number {
  if (nodes.length === 0) return 0;
  if (nodes.length === 1) return playheadMs >= nodes[0].ts ? nodes[0].frac : 0;
  if (playheadMs <= nodes[0].ts) return 0;
  const last = nodes[nodes.length - 1];
  if (playheadMs >= last.ts) return 1;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];
    if (playheadMs < b.ts) {
      const span = b.ts - a.ts;
      const u = span <= 0 ? 1 : (playheadMs - a.ts) / span;
      return a.frac + (b.frac - a.frac) * u;
    }
  }
  return 1;
}
