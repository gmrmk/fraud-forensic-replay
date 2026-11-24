// The camera a page opens at, decided once so the map is built there instead of being built at a
// fixed view and moved. Pure: the link, the scenario's home camera and the fixed fallback in, one
// camera out. Order: a camera named by the link, else the scenario's home, else the fallback.
import type { ScenarioHome } from "../scenarios";
import { CITY_PITCH, CITY_ZOOM_IN } from "./autoPitch";
import { hasCameraOverride, type DeepLinkParams } from "./deepLink";

export interface Camera {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export type LinkCamera = Pick<DeepLinkParams, "center" | "zoom" | "pitch" | "bearing">;

/** True when the opening camera can be decided: the link names a camera axis, or the scenario is
 *  known (`null` = known to have no home camera, `undefined` = not known yet). */
export function cameraKnown(link: LinkCamera, home: ScenarioHome | null | undefined): boolean {
  return hasCameraOverride(link) || home !== undefined;
}

/** A map built directly at city zoom sees no zoom gesture, so autoPitch never tilts it; apply the
 *  same tilt here when the link names no pitch. */
const pitchAt = (zoom: number, fallback: number): number => (zoom >= CITY_ZOOM_IN ? CITY_PITCH : fallback);

export function openingCamera(fallback: Camera, link: LinkCamera, home: ScenarioHome | null): Camera {
  if (hasCameraOverride(link)) {
    const zoom = link.zoom ?? fallback.zoom;
    return {
      center: [...(link.center ?? fallback.center)],
      zoom,
      pitch: link.pitch ?? pitchAt(zoom, fallback.pitch),
      bearing: link.bearing ?? fallback.bearing,
    };
  }
  if (home) {
    return {
      center: [home.lng, home.lat],
      zoom: home.zoom,
      pitch: pitchAt(home.zoom, fallback.pitch),
      bearing: fallback.bearing,
    };
  }
  return { ...fallback, center: [...fallback.center] };
}
