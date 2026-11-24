/**
 * The shared small drawings of the investigator's marks, as data: every path string, the stroke
 * widths, and the lens's geometry. Plain constants and one pure function, so any file may read them
 * (a `.tsx` file may not export objects beside its components under the project's refresh rule, so
 * they live here and `glyphs.tsx` draws them).
 *
 * What this file does not do: it draws nothing, holds no colour and no words, and reads no store.
 * Every shape is on whole or half pixels. The 9 unit forms are for a plate (9 px); the 12 unit
 * forms are for a button (12 px).
 */
export type GlyphName = "check" | "cross" | "hourglass" | "pin" | "lens";

/** Stroke widths. The marks piece may tune these (the findings of the ring and the plate checks). */
export const STROKE = {
  check9: 1.6,
  cross9: 1.6,
  lensRing9: 1,
  lensHandle9: 1.6,
  needle9: 1,
  check12: 1.5,
  cross12: 1.5,
  lensRing12: 1.2,
  lensHandle12: 1.6,
  globeRing: 1.5,
  globeHandle: 2.5,
} as const;

/** The check and the cross the notes layer's `Glyph` cuts out of a diamond today. */
export const GLYPH_PATHS = {
  check: "M2 4.8l1.8 1.8L7 3.1",
  cross: "M2.6 2.6l3.8 3.8M6.4 2.6L2.6 6.4",
} as const;

/** The 9 unit forms (a plate). The hourglass and the pins are filled; the lens is stroked. */
export const P9 = {
  hourglass: "M1 0h7v1H1zM1 8h7v1H1zM2 1h5L4.5 4.5zM2 8h5L4.5 4.5z",
  lensRing: "M1 3.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0z",
  lensHandle: "M5.3 5.3L8.5 8.5",
  /** The pin as picked: upright, filled, no needle. This is the one `MarkGlyph` draws. */
  pinUpright: "M3 0h3v1H3zM2 1h5v3H2zM1 4h7v1H1zM4 5h1v4H4z",
  /**
   * The pin leaning 45 degrees, filled: head, body and collar. Kept beside the upright one as an
   * alternative; nothing ships it. Its needle is `pinNeedle`, stroked at
   * `STROKE.needle9`.
   */
  pinLeaning: "M5 1L8 4L7 5L4 2ZM4.5 2.5L6.5 4.5L5 6L3 4ZM2 3L6 7L5 8L1 4Z",
  pinNeedle: "M3 6L0.5 8.5",
} as const;

/** The 12 unit forms (a button). The pin has none: it is drawn from `P9` at every size. */
export const P12 = {
  check: "M2.5 6.5L5 9L9.5 3.5",
  cross: "M3 3l6 6M9 3l-6 6",
  hourglass: "M1.5 1h9v1.5h-9zM1.5 9.5h9V11h-9zM2.5 2.5h7L6 6zM2.5 9.5h7L6 6z",
  lensRing: "M1.5 5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0z",
  lensHandle: "M7.5 7.5L10.5 10.5",
} as const;

export interface LensGeometry {
  /** The side of the square the lens is drawn in. */
  box: number;
  /** The ring's centre, on both axes. */
  c: number;
  /** The ring's radius. */
  r: number;
  /** Where the handle leaves the ring. */
  from: { x: number; y: number };
  /** The handle's far end, up and left of the centre at the ring's radius plus the handle. */
  to: { x: number; y: number };
}

/** The globe lens: a ring of diameter `ring` and a handle of length `handle` up and left at 135 degrees. */
export function lensGeometry(ring: number, handle: number): LensGeometry {
  const r = ring / 2;
  const box = 2 * (r + handle) + 4;
  const c = box / 2;
  const a = c - r * Math.SQRT1_2;
  const b = c - (r + handle) * Math.SQRT1_2;
  return { box, c, r, from: { x: a, y: a }, to: { x: b, y: b } };
}
