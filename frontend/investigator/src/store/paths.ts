// frontend/investigator/src/store/paths.ts
/**
 * usePaths - builds one Path per visible kind from the loaded entity arrays.
 * Replaces the old /api/arcs fetch (store/arcs.ts): Paths are computed client-
 * side from Entity[], so any kind in the store gets a Path for free. The caller
 * must memoize `entitiesByKind` (stable reference) to avoid rebuild churn.
 *
 * Theme-aware: subscribes to useTheme so a mode flip yields a new Path[] array
 * identity → arc-layer-3d rebuilds its meshes → arcs recolor without any
 * manual repaint call.
 */
import { useMemo } from "react";
import type { Entity } from "../lib/entity";
import { buildPaths, type Path } from "../lib/paths";
import { KIND_SLOT } from "../theme/entity-mapping";
import { useLayers } from "./layers";
import { useStoryInk } from "./kind-ink";
import { useSchema } from "./schema";
import { useTheme } from "./theme";

export function usePaths(entitiesByKind: Record<string, Entity[]>): Path[] {
  const pathKinds = useLayers((s) => s.pathKinds);
  const theme = useTheme((s) => s.theme);
  const color = useTheme((s) => s.color);
  const nodes = useSchema((s) => s.nodes);
  const ink = useStoryInk();
  return useMemo(() => {
    const out: Path[] = [];
    for (const kind of Object.keys(entitiesByKind)) {
      if (!pathKinds[kind]) continue;
      // A kind the theme maps to no slot (a manifest-declared one) takes its story ink (its mark in the live
      // theme and mode), else its node colour.
      const node = nodes.find((n) => n.kind === kind);
      const hex = kind in KIND_SLOT ? undefined : (ink.get(kind)?.mark ?? node?.palette);
      out.push(...buildPaths(entitiesByKind[kind], kind, node?.pathBy, { theme, color, hex, territory: node?.territory }));
    }
    return out;
  }, [entitiesByKind, pathKinds, theme, color, nodes, ink]);
}

export type { Path } from "../lib/paths";
