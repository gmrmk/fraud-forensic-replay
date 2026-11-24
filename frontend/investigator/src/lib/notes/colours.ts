/**
 * A note's colour is one of six slot names. It becomes a CSS value only through the fixed table
 * below, never by building a string from the stored value, so a stored colour cannot carry a
 * url(), an expression or any text of its own into a style.
 *
 * The values are the on-panel variables of the active palette (theme/css-gen.ts). Today only
 * r1, r2, r3 and the faint grey have one. The piece that draws the notes (P4) adds
 * --r0-on-panel and --r4-on-panel the same way (legibleOnPanel); until then those two slots
 * resolve to nothing in CSS.
 *
 * Lookups go through a switch, never through an object indexed by the value: an object returns
 * a function for "constructor" and "toString".
 */
import type { ColourSlot } from "./types";

export const COLOUR_CSS: Readonly<Record<ColourSlot, string>> = Object.freeze({
  r0: "var(--r0-on-panel)",
  r1: "var(--r1-on-panel)",
  r2: "var(--r2-on-panel)",
  r3: "var(--r3-on-panel)",
  r4: "var(--r4-on-panel)",
  muted: "var(--text-faint-on-panel)",
});

/** The slot a value names, or null when it names none of the six. */
export function colourSlot(v: unknown): ColourSlot | null {
  switch (v) {
    case "r0":
    case "r1":
    case "r2":
    case "r3":
    case "r4":
    case "muted":
      return v;
    default:
      return null;
  }
}

/** The CSS value for a stored colour, or null when it is not a slot name. */
export function colourCss(v: unknown): string | null {
  const slot = colourSlot(v);
  switch (slot) {
    case "r0":
      return COLOUR_CSS.r0;
    case "r1":
      return COLOUR_CSS.r1;
    case "r2":
      return COLOUR_CSS.r2;
    case "r3":
      return COLOUR_CSS.r3;
    case "r4":
      return COLOUR_CSS.r4;
    case "muted":
      return COLOUR_CSS.muted;
    default:
      return null;
  }
}
