// frontend/investigator/src/lib/tooltip-words/lane-depth.ts
// The words of a lane's lines. Each function returns the
// lines for `tip()`: a title line first, then its sentences or values. A tooltip says what a thing
// is and gives its values, never what to conclude. The field's label comes in as an argument from
// the manifest and is printed unchanged, so no word of one pack is written here.
//
// Every sentence follows the Simplified Technical English writing
// rules as the Wikipedia article states them (see lane.ts for the tags). The vocabulary is the one
// table: "line" is one value of the field, "bar" is an hour's amount, "lane", "fold" and "open".
// R1 (the approved dictionary) and R2 are not checked. A title (a name) and a value line (a label,
// a middle dot and a value) are labels, not sentences, and keep their words.

import { DEPTH_MAX_LINES } from "../bar-metrics";

/** The two lines of the triangle, as they are printed: the quantity's label, and what opens with
 *  the field's label and the whole count of lines (not the number the block shows). */
export function laneDepthTexts(laneLabel: string, fieldLabel: string, count: number): { first: string; second: string } {
  return { first: laneLabel, second: `By ${fieldLabel} · ${count}` };
}

/** The block's accessible name: the quantity and the field. A name, with no full stop. */
export function laneDepthBlockName(laneLabel: string, fieldLabel: string): string {
  return `${laneLabel} by ${fieldLabel}`;
}

/** The triangle's tooltip. `whose` is the name of the one row shown alone, if there is one. `open`
 *  picks the one instruction. The sentence on scrolling is said only when there are more lines
 *  than the block shows. */
export function laneDepthWords(fieldLabel: string, count: number, whose: string | undefined, open: boolean): string[] {
  return [
    `By ${fieldLabel} · ${count}`,
    // R3 R4 R6 R7 R8 R9: simple present, active, 4 words and the label.
    `Each line shows one ${fieldLabel}.`,
    // R3 R4 R6 R7 R8 R9: simple present, active, 7 words and the label.
    `Each bar adds the values for that ${fieldLabel}.`,
    // R3 R4 R6 R7 R8 R9: simple present, active, 4 words and the row's name.
    whose ? `The lines show ${whose} alone.` : "",
    // R4 R6 R7 R8 R9: simple present, active, 4 words and the figure.
    count > DEPTH_MAX_LINES ? `The block shows ${DEPTH_MAX_LINES} lines.` : "",
    // R2 R4 R6 R8 R9 R11: one imperative, 6 words.
    count > DEPTH_MAX_LINES ? "Scroll to show the other lines." : "",
    // R2 R4 R6 R8 R9 R11: one imperative, 5 words.
    open ? "Press to fold the lines." : "Press to open the lines.",
  ].filter((line) => line !== "");
}

/** A line's name cell: the field's label, the line's whole name (the screen may cut it), and its
 *  sum over the case with the quantity's label. `total` is already formatted with its unit. */
export function laneLineWords(fieldLabel: string, name: string, laneLabel: string, total: string): string[] {
  return [fieldLabel, name, `${laneLabel} in all: ${total}`];
}
