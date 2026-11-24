/**
 * Generic marker source: the GeoJSON for manifest-declared kinds (sign-ins, key events,
 * usage...) on the one `ml-generic` maplibre source. Colour is a feature
 * property: the story kind's mark for the live theme and mode (theme/kind-ink), else the node's
 * manifest palette, so a new kind needs no layer. Overlay kinds (a
 * decision mapping) draw as badges (components/verdict/GlobeBadgeLayer), not dots.
 */
import type maplibregl from "maplibre-gl";
import type { Entity } from "../entity";
import type { ScenarioNode } from "../scenarios";
import type { EntityMatch } from "../matches";
import { isOverlayNode } from "../verdicts";
import { magnitudeOf, markerScale } from "../magnitude";
import type { KindInk } from "../../theme/kind-ink";

const FALLBACK_COLOR = "#808080";
// No ink: every kind keeps its manifest palette (the call sites that predate the resolver).
const NO_INK: ReadonlyMap<string, KindInk> = new Map();

/** The entities the globe shows at `playhead`: those with a position whose event
 *  has happened. `windowed` is false until the playhead bounds load, when the
 *  globe shows everything rather than flash empty (same rule as the tx markers). */
export function visibleGeneric(
  entities: readonly Entity[],
  playhead: number,
  windowed: boolean,
): Entity[] {
  return entities.filter((e) => e.coords !== null && (!windowed || e.timestamp <= playhead));
}

/** `magnitudeMax` is the pack's largest value per magnitude kind (lib/magnitude's
 *  magnitudeMaxima over ALL the pack's entities, not the visible ones): a feature of such a
 *  kind carries `scale`, which the circle layers turn into a radius. Other kinds carry none. */
export function genericFC(
  entities: readonly Entity[],
  nodes: readonly ScenarioNode[],
  magnitudeMax: Readonly<Record<string, number>> = {},
  ink: ReadonlyMap<string, KindInk> = NO_INK,
): GeoJSON.FeatureCollection {
  const byKind = new Map(nodes.map((n) => [n.kind, n]));
  const features: GeoJSON.Feature[] = [];
  for (const e of entities) {
    const node = byKind.get(e.kind);
    if (!e.coords || (node && isOverlayNode(node))) continue;
    const properties: Record<string, unknown> = {
      id: e.id,
      kind: e.kind,
      color: ink.get(e.kind)?.mark ?? node?.palette ?? FALLBACK_COLOR,
    };
    if (node?.magnitude) properties.scale = markerScale(magnitudeOf(e, node), magnitudeMax[e.kind] ?? 0);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [e.coords.lng, e.coords.lat] },
      properties,
    });
  }
  return { type: "FeatureCollection", features };
}

/** The same collection with each feature of a kind that has ink carrying that kind's mark as `color`; a feature
 *  of any other kind is returned as it is. The map style rebuild (GlobeMap's runSetup) uses it to recolour
 *  the snapshot from live state without recomputing the features. */
export function recolourGenericFC(
  fc: GeoJSON.FeatureCollection,
  ink: ReadonlyMap<string, KindInk>,
): GeoJSON.FeatureCollection {
  return {
    ...fc,
    features: fc.features.map((f) => {
      const mark = ink.get(String(f.properties?.kind))?.mark;
      return mark ? { ...f, properties: { ...f.properties, color: mark } } : f;
    }),
  };
}

/** The live inputs the click bind reads, so the once-bound listener always sees current data. */
interface GenericClickDeps {
  current: { genericEntities?: Entity[]; navigate: (e: EntityMatch) => void } | null;
}

/**
 * Click + pointer-cursor binds for the `ml-generic-halo` layer. Kept out of
 * setupLayers (its listener count is pinned by the lifecycle test) and
 * returned as a teardown the caller runs before re-binding after a basemap swap,
 * for the same reason: delegated listeners survive setStyle({diff:false}).
 */
export function bindGenericMarkers(map: maplibregl.Map, deps: GenericClickDeps): () => void {
  const subs = [
    map.on("click", "ml-generic-halo", (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      const h = deps.current;
      const entity = id ? h?.genericEntities?.find((x) => x.id === id) : undefined;
      if (h && entity) h.navigate({ kind: "entity", entity });
    }),
    map.on("mouseenter", "ml-generic-halo", () => {
      map.getCanvas().style.cursor = "pointer";
    }),
    map.on("mouseleave", "ml-generic-halo", () => {
      map.getCanvas().style.cursor = "";
    }),
  ];
  return () => subs.forEach((s) => s.unsubscribe());
}
