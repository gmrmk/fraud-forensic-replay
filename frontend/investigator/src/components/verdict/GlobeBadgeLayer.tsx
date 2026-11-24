/**
 * Decision capsules and queued-event flags on the globe (owner request 2026-10-05). Decision
 * kinds (a manifest node with a decision mapping) draw here instead of as dots: each reached
 * decision at its place and, for the selected record, every decision carried by a record sharing
 * one of its values, lit at that record. Each event a reached rule decision queued flies a flag at
 * the event until a reached decision works it. Badges on one spot merge into a pile. Piles
 * recompute on moveend, not per frame. The Layers switches act here: a switched-off kind or value
 * draws no capsule and no flag. A solo draws only the capsules of decisions it holds (`decisionInSolo`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type maplibregl from "maplibre-gl";
import { BadgeMarker } from "./BadgeMarker";
import { VerdictCapsule } from "./VerdictCapsule";
import { QueueFlag } from "./QueueFlag";
import { badgeName, badgeSources, lastCrossing } from "./badge-sources";
import { openBadge } from "./open-badge";
import { drawRecordOf, isShown } from "../../lib/marks/draw";
import { decisionInSolo } from "../../lib/solo";
import { overlaysOf } from "../../lib/verdicts";
import { useSoloIds } from "../../hooks/useSoloIds";
import { pileItems, type Pile } from "../../lib/verdict-piles";
import { isOccludedByGlobe } from "../../lib/node-anchor";
import { useDecisionData } from "../../store/decision-data";
import { useShowInputs } from "../../store/marks";
import { useSchema } from "../../store/schema";
import { usePivotData } from "../../store/pivot-data";
import { usePlayhead } from "../../store/playhead";
import { useSelection } from "../../store/selection";

const REACH = { x: 44, y: 16 };

export function GlobeBadgeLayer({ map }: { map: maplibregl.Map | null }) {
  const nodes = useSchema((s) => s.nodes);
  const entities = usePivotData((s) => s.entities);
  const queued = useDecisionData((s) => s.reached);
  const playhead = usePlayhead((s) => s.playhead);
  const windowed = usePlayhead((s) => s.maxTime > s.minTime);
  const selected = useSelection((s) => (s.selected?.kind === "entity" ? s.selected.entity : null));
  // The camera centre after the last move: a new value re-projects the piles.
  const [center, setCenter] = useState<{ lng: number; lat: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    const onMoveEnd = () => {
      const c = map.getCenter();
      setCenter({ lng: c.lng, lat: c.lat });
    };
    map.on("moveend", onMoveEnd);
    return () => { map.off("moveend", onMoveEnd); };
  }, [map]);

  // The Layers switches act here: a switched-off kind or value draws no capsule, and no flag flies at an
  // event the switches hide (the one function, lib/marks/draw). The list itself with nothing hidden.
  const show = useShowInputs();
  const shownEntities = useMemo(() => {
    const kept = entities.filter((entity) => isShown(drawRecordOf({ kind: "entity", entity }), show));
    return kept.length === entities.length ? entities : kept;
  }, [entities, show]);
  const decisions = useMemo(() => overlaysOf(shownEntities, nodes), [shownEntities, nodes]);
  // Membership only changes when the playhead crosses a timestamp: key the sources on that. The
  // crossing reads the whole list, so a switch moves no step.
  const at = windowed ? lastCrossing(entities, playhead) : Infinity;
  // A solo takes the capsules of other rows' decisions off the globe, as it takes their dots (the flags
  // and the clearing of a flag by a decision are left as they were: the sources are built from every decision).
  const solo = useSoloIds();
  const sources = useMemo(() => {
    const all = badgeSources(decisions, queued, selected, shownEntities, at);
    if (solo === null) return all;
    const kept = new Set(decisions.filter((d) => decisionInSolo(solo, d)).map((d) => d.id));
    return all.filter((s) => s.family !== "decision" || kept.has(s.countKey));
  }, [decisions, queued, selected, shownEntities, at, solo]);
  const anyLit = sources.some((s) => s.lit);

  const piles = useMemo(() => {
    if (!map) return [];
    const c = center ?? map.getCenter();
    const items = sources
      .filter((s) => !isOccludedByGlobe({ lng: c.lng, lat: c.lat }, s.lngLat))
      .map((s) => {
        const p = map.project([s.lngLat.lng, s.lngLat.lat]);
        return { ...s, x: p.x, y: p.y };
      });
    return pileItems(items, REACH);
  }, [map, sources, center]);

  const activate = useCallback((pile: Pile, trigger: HTMLElement) => openBadge(pile, trigger, nodes), [nodes]);

  if (!map) return null;
  return (
    <>
      {piles.map((pile) => {
        const decision = pile.family === "decision";
        return (
          <BadgeMarker
            key={pile.key}
            map={map}
            lng={pile.anchor.lngLat.lng}
            lat={pile.anchor.lngLat.lat}
            anchor={decision ? "top" : "bottom-left"}
            offsetY={decision ? 7 : -2}
            name={badgeName(pile, nodes)}
            onActivate={(trigger) => activate(pile, trigger)}
          >
            {decision
              ? <VerdictCapsule segments={pile.segments} lit={pile.lit} dim={anyLit && !pile.lit} />
              : <QueueFlag text={pile.anchor.word} count={pile.members.length} />}
          </BadgeMarker>
        );
      })}
    </>
  );
}
