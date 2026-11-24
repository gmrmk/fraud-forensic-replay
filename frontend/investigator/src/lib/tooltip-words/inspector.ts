// frontend/investigator/src/lib/tooltip-words/inspector.ts
// The words of a record link in the Inspector:
// a field whose value names a record of the case prints that record's name, and the name opens the
// record. The id is not printed on such a value, so the tooltip is where it is read. Each function
// returns the lines for `tip()`: a title first, then its lines. A tooltip says what a thing is and
// gives its values; it never says what to conclude. The kind's label, the record's name and id and
// the time come in as arguments, so no word of one pack is written here, and the kind's label is the
// manifest's, printed as it is.
//
// The sentence follows the Simplified Technical English writing rules as
// the Wikipedia article states them. A tag beside a sentence names the rules it meets:
//   R2 one clear instruction                         R3 no noun cluster of more than three words
//   R4 and R5 imperative or simple present, no auxiliary   R6 no -ing form
//   R7 active voice                                  R8 at most 20 words in an instruction
//   R9 a verb, an object and its article             R11 one instruction in a sentence
// R1 (the approved dictionary) is not checked: the dictionary is not at hand. A title line, the id
// line and the time line are labels, not sentences, and keep their words. The full stop ends the
// sentence, as it does in the Timeline's tooltips.
import { when, when24, type TimeForm } from "../time-words";

/** The control's accessible name. It holds the visible text, the record's name (WCAG 2.5.3), after
 *  what a press does and the kind's label. A label, not a sentence: no full stop. */
export function recordRefName(kindLabel: string, name: string): string {
  return `Open ${kindLabel} ${name}`;
}

/** The control's tooltip: the kind's label, the record's id, the time when the record has one, and
 *  what a press does. `timeMs` is null for a record with no time. */
export function recordRefWords(kindLabel: string, id: string, timeMs: number | null, form: TimeForm = "12h"): string[] {
  return [
    kindLabel,
    `Record ${id}`,
    timeMs === null ? "" : `Time ${form === "24h" ? when24(timeMs) : when(timeMs)}`,
    // R2 R3 R4 R6 R7 R8 R9 R11: one imperative, 6 words.
    "Press to open this record.",
  ].filter((line) => line !== "");
}

// The words of the Inspector's Shared values section (the last section of a manifest record's body):
// one row for each kind that holds other records with the same value in a field the record's kind lets
// an investigator pivot on. The kind's label and the field's label come in as arguments, printed as the
// manifest and the field's key give them, so no word of one pack is written here.

/** The section's title. */
export const SHARED_VALUES = "Shared values";

/** A row's accessible name: the kind's label, the field's label and the count as "r of n". The row
 *  prints "r / n", so the name holds the visible text (WCAG 2.5.3). A label, not a sentence: no full stop. */
export function sharedRowName(kindLabel: string, fieldLabel: string, reached: number, total: number): string {
  return `${kindLabel} ${fieldLabel} ${reached} of ${total}`;
}

/** A pivot row's tooltip: the kind's label, the field's label and the shared value, the count before the
 *  playhead, and what a press does. */
export function sharedRowWords(
  kindLabel: string,
  fieldLabel: string,
  value: string,
  reached: number,
  total: number,
): string[] {
  return [
    kindLabel,
    `${fieldLabel} ${value}`,
    `Before the playhead: ${reached} of ${total}`,
    // R2 R3 R4 R6 R7 R8 R9 R11: one imperative, 5 words.
    "Press to find the matches.",
  ];
}

/** A decision row's tooltip: the kind's label, the field's label and the record's id, then the decision's
 *  own lines as a record link gives them (its id, its time, what a press does) without the kind line,
 *  which this row has already said. `timeMs` is null for a decision with no time. */
export function sharedDecisionWords(
  kindLabel: string,
  fieldLabel: string,
  recordId: string,
  decisionId: string,
  timeMs: number | null,
  form: TimeForm = "12h",
): string[] {
  return [kindLabel, `${fieldLabel} ${recordId}`, ...recordRefWords(kindLabel, decisionId, timeMs, form).slice(1)];
}

/** The accessible name of a foldable section's title control, for what a press does now: `open` is
 *  whether the section is open at this moment. A label: no full stop. */
export function sectionFoldName(title: string, open: boolean): string {
  return open ? `Fold the ${title} section` : `Open the ${title} section`;
}

/** The same control's tooltip: the section's title, then what a press does. */
export function sectionFoldWords(title: string, open: boolean): string[] {
  // R2 R3 R4 R6 R7 R8 R9 R11: one imperative, 5 words each.
  return [title, open ? "Press to fold this section." : "Press to open this section."];
}

// The words of an attribute row's label, so that hovering anything explains it: the
// attribute's name, as the row's label prints it. The label comes in as an argument, so no word of one
// pack is written here. A label, not a sentence: no full stop.

/** An attribute row's tooltip: the attribute's name, as the label prints it. */
export function fieldRowWords(label: string): string[] {
  return [label];
}
