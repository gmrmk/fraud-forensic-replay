/**
 * The words of a row's solo: what a press on a row does, and the control that clears it. A
 * row's name comes in as an argument, from the manifest, and is printed unchanged. These sentences
 * follow the writing rules of the Simplified Technical English article:
 *   R2 R4 R5 R6 R7 R11   one imperative or one simple present statement, active, no -ing form
 *   R8                   under 20 words each
 *   R9                   every sentence has its verb, its object and its article where one is needed
 * The dictionary (R1) is not at hand, so "alone" and "show" are not checked against it. The
 * vocabulary is the one table: row, alone, show.
 */

/** The lines of a named row's tooltip that tell what a press does, after the row's own words. */
export function soloWords(soloed: boolean): string[] {
  return soloed ? ["This row is alone.", "Press to show every row."] : ["Press to show this row alone."];
}

/** The clear control's accessible name. It starts with the row's name, which is what is drawn. */
export function soloClearName(rowName: string): string {
  return `${rowName} is alone. Press to show every row.`;
}

/** The clear control's tooltip: the whole name of the row, that it is alone, and what a press does. */
export function soloClearWords(rowName: string): string[] {
  return [`${rowName} is alone`, "Press to show every row."];
}
