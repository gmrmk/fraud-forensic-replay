/**
 * Every call to the map library about the shape of the map, and the only file that spells the
 * library's two words for it. The style is built with `projectionFor`, `applyMapShape` turns a
 * loaded map to a shape, and `mapIsFlat` asks a map which shape it has.
 */
import type { ProjectionSpecification } from "maplibre-gl";
import type { MapMode } from "../../store/map-mode";

const PROJECTION_TYPE: Record<MapMode, "globe" | "mercator"> = { globe: "globe", flat: "mercator" };

/** The two calls of the library's map that turn its shape; the library's map has both. */
interface ShapeMap {
  setProjection(projection: ProjectionSpecification): unknown;
  setRenderWorldCopies(renderWorldCopies: boolean): unknown;
}

/** The style's projection for a shape. A new object on every call. */
export function projectionFor(shape: MapMode): ProjectionSpecification {
  return { type: PROJECTION_TYPE[shape] };
}

/** The read of the map's projection; the library's map has it, and a narrow stand-in may not. */
interface ProjectionReadMap {
  getProjection?(): ProjectionSpecification | undefined;
}

/** True only when the map reports the flat projection. A map that cannot answer (no read, no
 *  projection, or a read that throws because its style is gone) counts as the globe. */
export function mapIsFlat(map: ProjectionReadMap): boolean {
  try {
    return typeof map.getProjection === "function" && map.getProjection()?.type === PROJECTION_TYPE.flat;
  } catch {
    return false;
  }
}

/** Turns a loaded map to a shape. Going flat, the world's copies go off before the flat projection,
 *  so the library moves the camera only as far as a world shown once needs; going back, the globe's
 *  projection comes first and then the copies. */
export function applyMapShape(map: ShapeMap, shape: MapMode): void {
  if (shape === "flat") {
    map.setRenderWorldCopies(false);
    map.setProjection(projectionFor(shape));
  } else {
    map.setProjection(projectionFor(shape));
    map.setRenderWorldCopies(true);
  }
}
