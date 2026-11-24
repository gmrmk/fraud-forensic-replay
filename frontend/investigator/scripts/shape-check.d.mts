/** Types for shape-check.mjs, so a test under src/ can import the reader and the rules with `tsc -b` clean. */

export const SHAPE_ATTR: string;
export const WORLD_ATTR: string;
export const SWITCH_ATTR: string;
export const MAP_BOX: string;
export const MAP_KEY: string;

export type Shape = "globe" | "flat";

export interface ShapeRead {
  /** The mark on the map's element, or null when there is none. */
  shape: string | null;
  /** The pixels of longitude -180 and 180 from the map's left side, or null when not written. */
  world: [number, number] | number[] | null;
  /** The map element's width in pixels, or null when there is no map element. */
  width: number | null;
  /** The shape a press of the button goes to, or null when there is no button. */
  next: string | null;
  /** The stored choice, null when none, or "blocked" when the storage throws. */
  stored: string | null;
}
export function readShape(args: { key: string }): ShapeRead;

export interface Place {
  lng: number;
  lat: number;
}
export function readPlaces(args: { nodes: readonly { kind: string; coords?: { lat: string; lng: string } }[] }): Promise<Place[]>;

export interface ShapeProblem {
  rule: string;
  what: string;
}
export function markProblems(read: ShapeRead, want: Shape): ShapeProblem[];
export function switchProblems(read: ShapeRead): ShapeProblem[];
export function worldZoom(px: number): number;
export function pressProblems(before: { lng: number; zoom: number }, after: ShapeRead): ShapeProblem[];
export function angleBetween(a: Place, b: Place): number;
export function capsuleVerdict(counts: { flat: number; globe: number; far: boolean }): { problem?: string; note?: string };
export function resetProblems(
  home: { lng: number; lat: number; zoom: number },
  got: { lng: number | null; lat: number | null; zoom: number | null },
): ShapeProblem[];

export function crawlShapes(browser: unknown, scenarios: unknown[], kit: Record<string, unknown>): Promise<void>;
