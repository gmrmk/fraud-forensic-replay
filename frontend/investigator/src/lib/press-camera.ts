/**
 * What a press on a record does with the camera (pure). From a view below zoom 11 a press turns the
 * globe at the present zoom until the record is at the centre; once the centre is at the record's
 * place, a press flies in to the record's zoom. From zoom 11 or more every press flies, since a turn
 * there is a pan at street level. On the flat map a second press on the same record also flies. The
 * hook in components/useCameraMoves.ts makes the move.
 */
import { greatCircleDeg, type LngLat } from "./playback-follow";

/** Below this zoom a press turns the globe first. */
export const TURN_BELOW_ZOOM = 11;
/** A centre within this many degrees of a record counts as at the record. */
export const AT_RECORD_DEG = 0.5;

/**
 * "turn" or "fly" for a press on `record` with the camera where it is now. `sameRecord` is whether
 * this press's record is the one the last press was on. Under the default reading, "place", a press
 * flies when the centre is at the record's place, whichever record was pressed before; under
 * "record" only a second press on the very same record flies. On the flat map (`flat`) a second
 * press on the same record flies wherever the centre is: the world shown once holds a centre-only
 * move as near to the record as the world allows, so a record far from the world's middle never
 * comes to the centre below zoom 11.
 */
export function pressMove(
  camera: LngLat & { zoom: number },
  record: LngLat,
  sameRecord: boolean,
  reading: "place" | "record" = "place",
  flat = false,
): "turn" | "fly" {
  if (camera.zoom >= TURN_BELOW_ZOOM) return "fly";
  if (flat && sameRecord) return "fly";
  const atRecord = greatCircleDeg(camera, record) <= AT_RECORD_DEG;
  return atRecord && (reading === "place" || sameRecord) ? "fly" : "turn";
}

/** A zoom within this much of a press's zoom counts as at that zoom. */
export const AT_RECORD_ZOOM = 0.05;

/**
 * Whether the camera still rests where a press left it: the centre within 0.5 degrees of the
 * pressed record and the zoom within 0.05 of the zoom kept with it, the record's own zoom.
 */
export function restsAtPress(camera: LngLat & { zoom: number }, press: LngLat & { zoom: number }): boolean {
  return greatCircleDeg(camera, press) <= AT_RECORD_DEG && Math.abs(camera.zoom - press.zoom) <= AT_RECORD_ZOOM;
}
