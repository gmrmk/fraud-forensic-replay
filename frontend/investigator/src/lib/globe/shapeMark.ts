/**
 * The page's mark of the map's shape, for the checks. On the map's element it writes `data-map-shape`,
 * "globe" or "flat", from the map's own report of its projection, and, while the map is flat,
 * `data-world-x`: the pixels of longitude -180 and 180 from the element's left side, so a check can
 * see a strip of the window outside the world. It writes at bind, at each style load and at each
 * change of projection, and the world's edges again when a move ends on the flat map. Nothing in the
 * app reads the mark back. Bound once the map has loaded: before its first style the map reports no
 * projection, and the mark would name the globe on a map built flat.
 */
import type { ProjectionSpecification } from "maplibre-gl";
import { mapIsFlat } from "./projection";

type MarkEvent = "style.load" | "projectiontransition" | "moveend";

/** The calls the mark makes on the map (a MapLibre `Map` satisfies it; a test passes a stand-in). */
export interface ShapeMarkMap {
  getProjection?(): ProjectionSpecification;
  project(lngLat: [number, number]): { x: number };
  on(type: MarkEvent, listener: () => void): unknown;
  off(type: MarkEvent, listener: () => void): unknown;
}

/** Writes the mark on `el` and keeps it current. Returns the unbind, which also takes the mark off. */
export function bindShapeMark(map: ShapeMarkMap, el: HTMLElement): () => void {
  const write = (): void => {
    const flat = mapIsFlat(map);
    el.setAttribute("data-map-shape", flat ? "flat" : "globe");
    if (!flat) return el.removeAttribute("data-world-x");
    const x = (lng: number): number => Math.round(map.project([lng, 0]).x);
    el.setAttribute("data-world-x", `${x(-180)},${x(180)}`);
  };
  const onMoveEnd = (): void => {
    if (mapIsFlat(map)) write();
  };
  write();
  map.on("style.load", write);
  map.on("projectiontransition", write);
  map.on("moveend", onMoveEnd);
  return () => {
    map.off("style.load", write);
    map.off("projectiontransition", write);
    map.off("moveend", onMoveEnd);
    el.removeAttribute("data-map-shape");
    el.removeAttribute("data-world-x");
  };
}
