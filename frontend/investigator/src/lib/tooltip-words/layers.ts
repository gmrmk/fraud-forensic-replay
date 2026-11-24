/**
 * The words the Layers menu says about its switches. A tooltip says what a thing is or does, never what
 * to conclude; a label or a value is the manifest's or the data's, printed as it is. Each function gives
 * the lines for `tip()`: a title first (a label, no full stop), then one plain sentence.
 *
 * The Yours row's words are here too: its label, its two tooltip forms (it says nothing is held yet while
 * it is off and nothing is touched), its chevron and the six facets. PASS, FAIL and WAITING are the
 * disposition's own words (lib/marks/words).
 *
 * What this file does not hold: the Timeline control's words (lib/tooltip-words/kinds.ts), any state, or
 * any word of one pack; kind labels, filter labels and values come in as arguments.
 */
import { DISPOSITION_WORD } from "../marks/words";
import type { YoursFacet } from "../marks/types";

/** How a missing or empty value reads in a value list. */
export const EMPTY_VALUE = "-";

/** A manifest kind's switch, and the Authorizations and Logins switches: the row's label, then what the switch does. */
export function kindSwitchWords(label: string): string[] {
  return [label, "Shows or hides the records of this kind on the map and the Timeline."];
}

/** One value's switch: the value as the data holds it (a dash for none), then whose records it shows or hides. */
export function valueSwitchWords(kindLabel: string, filterLabel: string, value: string): string[] {
  if (value === "") return [EMPTY_VALUE, `Shows or hides the ${kindLabel} records with no ${filterLabel}.`];
  return [value, `Shows or hides the ${kindLabel} records whose ${filterLabel} is ${value}.`];
}

/** The chevron that opens or folds a kind's value switches. */
export function valuesFoldWords(kindLabel: string, filterLabel: string, open: boolean): string[] {
  return [`${kindLabel} by ${filterLabel}`, open ? "Press to fold the values." : "Press to open the values."];
}

/** The last row of a value list that is cut: it lists the rest in place. `n` is two or more. */
export function moreWords(n: number): string[] {
  return [`${n} more`, `Lists the other ${n} values.`];
}

/** The Dispositions switch's label. */
export const YOURS_LABEL = "Dispositions";

/** The Yours switch: what it does, or that nothing is held yet while it is off and nothing is touched. */
export function yoursWords(touched: number, on: boolean): string[] {
  if (touched === 0 && !on) return [YOURS_LABEL, "Nothing is pinned, marked, noted or in a path yet."];
  return [YOURS_LABEL, "Show only the records you pinned, marked, noted or put in a path."];
}

/** The Yours chevron: it opens or folds the six facet switches. */
export function yoursFoldWords(open: boolean): string[] {
  return [YOURS_LABEL, open ? "Press to fold its six switches." : "Press to open its six switches."];
}

/** The six facet labels; PASS, FAIL and WAITING are the disposition's own words. */
export const FACET_LABEL: Readonly<Record<YoursFacet, string>> = {
  pinned: "Pinned",
  pass: DISPOSITION_WORD.pass,
  fail: DISPOSITION_WORD.fail,
  wait: DISPOSITION_WORD.wait,
  noted: "Noted",
  inPath: "In a path",
};

const FACET_KEEPS: Readonly<Record<YoursFacet, string>> = {
  pinned: "the records you pinned",
  pass: "the records you marked PASS",
  fail: "the records you marked FAIL",
  wait: "the records you marked WAITING",
  noted: "the records your notes link to",
  inPath: "the records in your paths",
};

/** One facet's switch: its label, then what it keeps while the row named by YOURS_LABEL is on. */
export function facetWords(facet: YoursFacet): string[] {
  return [FACET_LABEL[facet], `With ${YOURS_LABEL} on, keeps ${FACET_KEEPS[facet]}.`];
}
