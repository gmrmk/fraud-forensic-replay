/**
 * The words the rows' tooltips say. Each function returns the lines of one tooltip, first line first.
 * What a thing is is said from the manifest's own words (the heading, a row's name, a kind's label,
 * the member's label), which come in as arguments and are printed unchanged. Times and amounts come
 * in already formatted, so this file holds no zone, no clock and no unit. A tooltip says what a thing
 * is and gives its values; it never says what to conclude. Sections and lines fold and open.
 */

type Counted = readonly (readonly [string, number])[];

/** A bar sum, already formatted, and the name the bars go by. */
export interface BarSum {
  barName: string;
  amount: string;
}

const kindsText = (kinds: Counted): string => kinds.map(([kind, n]) => `${kind} ${n}`).join(" · ");

/** The rows' fold button: the heading and how many named rows there are. */
export function rowsFoldWords(heading: string, named: number): string[] {
  const count = `${named} ${named === 1 ? "row" : "rows"}`;
  // With no heading the words say nothing of the grouping: no coined name for it, and no "for each".
  return heading
    ? [`${heading}: ${count}`, "Each row has one name. The row with the most events is first. Press to fold or open the rows."]
    : [count, "The row with the most events is first. Press to fold or open the rows."];
}

/** A named row's name: the heading, the whole name (it may be cut on screen), its events by kind, and
 *  the bars' sum when the row has bars. */
export function rowWords(heading: string, name: string, kinds: Counted, bars: BarSum | null): string[] {
  return [heading, name, kindsText(kinds), bars ? `${bars.barName} in all: ${bars.amount}` : ""].filter((line) => line !== "");
}

/** A rest row: its kind's label, why it has a row of its own, and its events by kind. */
export function restRowWords(name: string, heading: string, kinds: Counted): string[] {
  return heading
    ? [name, `These events have no ${heading}. They have a row of their own.`, kindsText(kinds)]
    : [name, kindsText(kinds)];
}

/** A row's triangle: a row opens into lines and closes them. */
export function rowOpenWords(name: string, memberLabel: string, isOpen: boolean): string[] {
  return [name, isOpen ? "Press to fold its lines." : `Press to open it. It shows a line for each ${memberLabel}.`];
}

/** A member line: its label, the member's value, its events (each already a line) and its bars' sum. */
export function memberLineWords(memberLabel: string, value: string, events: readonly string[], bars: BarSum | null): string[] {
  return [memberLabel, value, ...events, bars ? `${bars.barName} in all: ${bars.amount}` : ""].filter((line) => line !== "");
}

/** A row's bar that is drawn cut; `top` is already formatted. */
export function rowCutWords(top: string): string {
  return `The rows cut this bar at ${top}.`;
}
