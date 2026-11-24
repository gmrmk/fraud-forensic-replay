import { useEffect, useMemo, useReducer } from "react";
import type maplibregl from "maplibre-gl";
import { usePivotStore, type WorkspaceWindow } from "../../store/pivot";
import { usePlayhead } from "../../store/playhead";
import { DetailWindow } from "./DetailWindow";
import { RuleTraceWindow } from "./RuleTraceWindow";
import { NoteWindow } from "../notes/NoteWindow";
import { lookupFromContext } from "../notes/record-lookup";
import { RecordWindow } from "../record-window/RecordWindow";
import { recordAccent, recordColourKind } from "../record-window/record-window";
import { useStoryInk } from "../../store/kind-ink";
import { nodeOf } from "../../lib/marks/select";
import { useMarksStore } from "../../store/marks";
import { entityLngLat, isOccludedByGlobe } from "../../lib/node-anchor";
import { mapIsFlat } from "../../lib/globe/projection";
import { COLLAPSED_BAR_HEIGHT } from "../../lib/window-dims";
import { takeInitialFocus } from "../../lib/window-focus";
import { paletteFor } from "../../lib/entity-palette";
import { resolveEntityRef } from "../../lib/decision-entities";
import type { Decision } from "../../lib/decisions";
import type { PivotContext } from "../../lib/matches";
import type { Entity } from "../../lib/entity";

interface Props {
  map: maplibregl.Map | null;
  decisions: Decision[];
  context: PivotContext;
}

/** Renders all workspace windows. Node-anchored (flagged) windows follow
 *  map.project(lngLat) + tether offset, re-projected on every camera move
 *  (event-driven; no rAF loop, no clock). Also draws the flag stems.
 *
 *  Z-AUTHORITY NOTE: this layer and the docked MatchesTable breakout are
 *  both z-30; within the layer, windows stack by the store's z (nextZ>=20).
 *  Mounted AFTER MatchesTable in App's case block, so floating evidence
 *  paints over the docked breakout at equal z - the "floating = evidence
 *  being assembled" reading. The rule-mode breakout closes itself before
 *  summoning a trace (MatchesTable), so the common path never stacks them. */
export function PivotWindowsLayer({ map, decisions, context }: Props) {
  const windows = usePivotStore((s) => s.windows);
  const flagToNode = usePivotStore((s) => s.flagToNode);
  const unflag = usePivotStore((s) => s.unflag);
  const updateOffset = usePivotStore((s) => s.updateOffset);
  const setRecordPinned = usePivotStore((s) => s.setRecordPinned);
  const playhead = usePlayhead((s) => s.playhead);
  const nodes = useMarksStore((s) => s.nodes);
  const ink = useStoryInk();

  // The record's own window finds its record here: one lookup (and its index) for the case, rebuilt
  // only when the context is.
  const lookup = useMemo(() => lookupFromContext(context), [context]);

  // A record window's pin is its record's pin, whatever changed the node (a press in the window, a
  // press on a mark, a loaded notes file, the first marks load). Writes only where the two differ,
  // so the window list settles after one pass.
  useEffect(() => {
    for (const w of windows) {
      if (w.kind !== "record") continue;
      const want = nodeOf(nodes, w.record)?.pinned ?? false;
      if (w.pinned !== want) setRecordPinned(w.record, want);
    }
  }, [windows, nodes, setRecordPinned]);

  // Re-render on camera change so projections recompute. forceRender is a
  // camera-event counter, not state derived from any clock.
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const anyFlagged = useMemo(
    () => windows.some((w) => w.anchor.type === "node"),
    [windows]
  );

  // Subscribe only while something is node-anchored: screen windows never
  // consume projection output, so camera events would re-render for nothing
  // (Task 6 review M2).
  // A change of shape moves no camera, so the library's projectiontransition re-projects the
  // windows too. Not "render": the ambient pulse fires it on every frame at rest.
  useEffect(() => {
    if (!map || !anyFlagged) return;
    map.on("move", forceRender);
    map.on("projectiontransition", forceRender);
    return () => {
      map.off("move", forceRender);
      map.off("projectiontransition", forceRender);
    };
  }, [map, anyFlagged]);

  // The store places a new popout from the free area around its pin; only this layer can
  // project. This layer paints over the Inspector (z-20) and the case bottom stack, so the area
  // ends at the Inspector's left edge and at the stack's top (App publishes --bottom-stack-h).
  const setPinRoom = usePivotStore((s) => s.setPinRoom);
  useEffect(() => {
    if (!map) return;
    setPinRoom((ll) => {
      const p = map.project([ll.lng, ll.lat]);
      const inspector = document.querySelector('aside[aria-label="Inspector"]');
      const stack = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bottom-stack-h"));
      return {
        pinX: p.x,
        pinY: p.y,
        right: inspector ? inspector.getBoundingClientRect().left : window.innerWidth,
        bottom: window.innerHeight - (Number.isFinite(stack) ? stack : 0),
      };
    });
    return () => setPinRoom(null);
  }, [map, setPinRoom]);

  // Manifest entities by kind, for the pile popout's member list (the same data App's
  // genericByKind holds; the layer already receives it flattened in context.entities).
  const byKind = useMemo(() => {
    const m: Record<string, Entity[]> = {};
    for (const e of context.entities ?? []) (m[e.kind] ??= []).push(e);
    return m;
  }, [context.entities]);

  function windowLngLat(w: WorkspaceWindow): { lng: number; lat: number } | null {
    if (w.kind === "detail") return entityLngLat(w.entity);
    if (w.kind === "note") return null; // a note window is never flagged to a node
    if (w.kind === "record") return lookup(w.record)?.lngLat ?? null; // no flag control: read by nothing but the tether's own anchor
    const d = decisions.find((x) => x.id === w.decisionId);
    if (!d) return null;
    for (const id of d.triggerEntityIds) {
      const m = resolveEntityRef(id, context);
      const ll = m && entityLngLat(m);
      if (ll) return ll;
    }
    return null;
  }

  function projected(w: WorkspaceWindow): { x: number; y: number; occluded: boolean } | null {
    if (w.anchor.type !== "node" || !map) return null;
    const p = map.project([w.anchor.lngLat.lng, w.anchor.lngLat.lat]);
    const center = map.getCenter();
    // The flat map has no far side, so no window hides there.
    const occluded = !mapIsFlat(map) && isOccludedByGlobe(
      { lng: center.lng, lat: center.lat },
      w.anchor.lngLat
    );
    return { x: p.x + w.anchor.offset.dx, y: p.y + w.anchor.offset.dy, occluded };
  }

  function entityTs(w: WorkspaceWindow): number | null {
    // A record window dims by its record's own time (null for a place, an untimed record, or a record
    // the data does not hold: those never dim).
    if (w.kind === "record") return lookup(w.record)?.time ?? null;
    if (w.kind !== "detail") return null;
    const e = w.entity;
    switch (e.kind) {
      case "auth":
      case "fraud":
        return Date.parse(e.tx.timestamp);
      case "login":
        return Date.parse(e.login.timestamp);
      case "account_event":
        return Date.parse(e.event.timestamp);
      case "transfer":
        return Date.parse(e.transfer.timestamp);
      case "entity":
        return e.entity.timestamp > 0 ? e.entity.timestamp : null;
      case "place":
        return null;
    }
  }

  function toggleFlag(w: WorkspaceWindow) {
    if (w.anchor.type === "node") {
      // Unflag releases at the CURRENT projected position so the window
      // does not jump (Task 1 review note M3).
      const p = projected(w);
      // Fallback lands the window near the top-left workspace area if the
      // projection is unavailable (map torn down mid-toggle).
      unflag(w.id, p ? { x: p.x, y: p.y } : { x: 120, y: 120 });
      return;
    }
    const ll = windowLngLat(w);
    if (!ll || !map) return;
    const node = map.project([ll.lng, ll.lat]);
    // Preserve the window's current screen position as the tether offset.
    const cur = w.anchor; // type "screen" here
    flagToNode(w.id, ll, { dx: cur.x - node.x, dy: cur.y - node.y });
  }

  // A window whose node is behind the globe hides with it. A focus request it cannot take now is
  // dropped after the commit (render stays pure), so it never steals focus when the pin rotates
  // into view.
  const hiddenIds = windows.filter((w) => projected(w)?.occluded).map((w) => w.id).join(" ");
  useEffect(() => {
    for (const id of hiddenIds.split(" ")) if (id) takeInitialFocus(id);
  }, [hiddenIds]);

  if (windows.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {anyFlagged && map && (
        <svg aria-hidden className="absolute inset-0 w-full h-full">
          {windows.map((w) => {
            if (w.anchor.type !== "node") return null;
            const p = projected(w);
            if (!p || p.occluded) return null;
            const node = map.project([w.anchor.lngLat.lng, w.anchor.lngLat.lat]);
            // A story's own kind draws its tether in the colour its window's line has (the resolver's
            // mark); any other kind keeps the palette it has.
            const stroke =
              w.kind === "record"
                ? (ink.get(recordColourKind(lookup(w.record), w.record))?.mark ?? recordAccent(lookup(w.record), w.record))
                : w.kind === "detail"
                  ? (ink.get(w.entity.kind === "entity" ? w.entity.entity.kind : w.entity.kind)?.mark ?? paletteFor(w.entity).hex)
                  : "rgb(var(--alarm-rgb))";
            // Stem attaches near the window's top-left: half the header-bar
            // height vertically, a small fixed inset horizontally.
            return (
              <line
                key={w.id}
                x1={node.x} y1={node.y} x2={p.x + 20} y2={p.y + COLLAPSED_BAR_HEIGHT / 2}
                stroke={stroke} strokeWidth="1.5" strokeOpacity="0.55" strokeDasharray="4 3"
              />
            );
          })}
        </svg>
      )}
      {windows.map((w) => {
        // A node-anchored window has no screen position while there is no map (it stopped for
        // good), and the frame would fall back to the top left corner. Draw nothing; the store
        // keeps the window, so it returns when a map does. A screen-anchored window needs no map.
        if (w.anchor.type === "node" && !map) return null;
        const p = projected(w);
        if (p?.occluded) return null;
        const ts = entityTs(w);
        // Dim rides the WindowFrame's positioned outer div, never a wrapper:
        // opacity<1 on an unpositioned wrapper creates a stacking context
        // that traps the store z and defeats bringToFront (review I1).
        const dimmed = ts !== null && ts > playhead; // flag outlives the scrub, dimmed
        const anchor = w.anchor; // narrow once; closures capture the narrowed binding
        const common = {
          screenPos: p ? { x: p.x, y: p.y } : undefined,
          dimmed,
          onToggleFlag: () => toggleFlag(w),
          onDragTo:
            anchor.type === "node"
              ? (x: number, y: number) => {
                  if (!map) return;
                  const node = map.project([anchor.lngLat.lng, anchor.lngLat.lat]);
                  updateOffset(w.id, x - node.x, y - node.y);
                }
              : undefined,
        };
        if (w.kind === "note") return <NoteWindow key={w.id} window={w} context={context} {...common} />;
        if (w.kind === "record") return <RecordWindow key={w.id} window={w} lookup={lookup} {...common} />;
        return w.kind === "detail" ? (
          <DetailWindow key={w.id} window={w} byKind={byKind} {...common} />
        ) : (
          <RuleTraceWindow key={w.id} window={w} decisions={decisions} context={context} {...common} />
        );
      })}
    </div>
  );
}
