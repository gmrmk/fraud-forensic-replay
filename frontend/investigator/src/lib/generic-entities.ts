/**
 * Boot for the kinds the app has no dedicated endpoint for: every sql node
 * outside the six concrete kinds is read through /api/entities?kind=K and
 * adapted by the manifest. Gated by node presence (not by manifest focal), so
 * a pack that declares only concrete kinds makes no extra request.
 */
import { useEffect, useState } from "react";
import type { Entity } from "./entity";
import { filterOf, type ScenarioNode } from "./scenarios";
import { isGenericNode, manifestRowToEntity } from "./adapters/manifest-row";
import { drawCounts, drawRecordOf, type DrawInputs } from "./marks/draw";
import { rowValue } from "./tracks";
import { decisionOf, type VerdictTone } from "./verdicts";

export async function fetchGenericEntities(
  nodes: readonly ScenarioNode[],
): Promise<Record<string, Entity[]>> {
  const generic = nodes.filter(isGenericNode);
  const lists = await Promise.all(
    generic.map(async (node) => {
      const r = await fetch(`/api/entities?kind=${encodeURIComponent(node.kind)}`);
      if (!r.ok) throw new Error(`${node.kind} HTTP ${r.status}`);
      const rows = (await r.json()) as Record<string, unknown>[];
      return rows.map((row) => manifestRowToEntity(node, row));
    }),
  );
  return Object.fromEntries(generic.map((node, i) => [node.kind, lists[i]]));
}

/** One value of a kind's filter field: the records holding it, reached and shown, over all of them. */
export interface ValueCount {
  /** The value as `rowValue` reads it; "" when the record has none. */
  value: string;
  visible: number;
  total: number;
  /** The tone of a decision status value (fail, pass, wait or unknown); null for any other value. */
  tone: VerdictTone | null;
}

export interface GenericCount {
  kind: string;
  label: string;
  palette: string;
  /** Records shown and reached by the playhead, by the one function. */
  visible: number;
  total: number;
  /** The kind's filter, as `filterOf` reads the manifest; null when it declares none. */
  filter: { field: string; label: string } | null;
  /** One entry per distinct value of the filter field; empty with no filter. */
  values: ValueCount[];
}

const asDrawRecord = (entity: Entity) => drawRecordOf({ kind: "entity", entity });

/**
 * Per declared generic kind (manifest order): records reached over all, by the one function
 * (lib/marks/draw), so the counts follow the Layers switches and the playhead together. A switched-off
 * kind or value reads 0 of its total. When the node declares a filter, one entry per distinct value of
 * its field, by total descending and then by value, each counted the same way. The values are grouped
 * in a Map, so a value named like an inherited key is an ordinary value. `windowed` (in `d`) is false
 * until the playhead bounds load, when everything counts.
 */
export function genericCounts(
  nodes: readonly ScenarioNode[],
  byKind: Record<string, Entity[]>,
  d: DrawInputs,
): GenericCount[] {
  return nodes.filter(isGenericNode).map((n) => {
    // Own keys only: a kind named like an inherited key (constructor) with no list yet is empty.
    const all = Object.hasOwn(byKind, n.kind) ? byKind[n.kind] : [];
    const c = drawCounts(all.map(asDrawRecord), d);
    const filter = filterOf(n);
    const values: ValueCount[] = [];
    if (filter !== null) {
      const groups = new Map<string, Entity[]>();
      for (const e of all) {
        const value = Object.hasOwn(e.fields, filter.field) ? rowValue(e.fields[filter.field]) : "";
        const held = groups.get(value);
        if (held) held.push(e);
        else groups.set(value, [e]);
      }
      // A decision kind's status field takes its tone from the decision mapping, read through decisionOf.
      const toned = n.decision !== undefined && n.decision.status === filter.field;
      for (const [value, group] of groups) {
        const g = drawCounts(group.map(asDrawRecord), d);
        values.push({ value, visible: g.reached, total: g.all, tone: toned ? (decisionOf(group[0], n)?.tone ?? null) : null });
      }
      values.sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
    }
    return { kind: n.kind, label: n.label, palette: n.palette, visible: c.reached, total: c.all, filter, values };
  });
}

// Stable reference so a scenario with no generic kinds never re-renders its consumers.
const NONE: Record<string, Entity[]> = {};

export function useGenericEntities(
  nodes: readonly ScenarioNode[],
  onError: (message: string) => void,
): Record<string, Entity[]> {
  const [byKind, setByKind] = useState(NONE);
  useEffect(() => {
    if (!nodes.some(isGenericNode)) return;
    let cancelled = false;
    fetchGenericEntities(nodes)
      .then((loaded) => {
        if (!cancelled) setByKind(loaded);
      })
      .catch((err: Error) => {
        if (!cancelled) onError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [nodes, onError]);
  return byKind;
}
