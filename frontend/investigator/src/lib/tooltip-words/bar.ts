// frontend/investigator/src/lib/tooltip-words/bar.ts
// The sentences the Timeline's own frame says about itself: the case strip on the one line, the control that clears a row that is alone, and the
// part a fold opens. Each returns the lines for `tip()`: what the thing is first, then its values.
// A tooltip never says what to conclude. The noun for a node, the row's name and the two times are
// arguments, so no word of one pack is written here. Every sentence is new.
//
// Every sentence follows the writing rules the Wikipedia article on
// Simplified Technical English lists. A tag beside a sentence names the rules it meets:
//   R3 no noun cluster of more than three words     R4 and R5 simple present or imperative, no auxiliary
//   R6 no -ing form                                 R7 active voice
//   R8 at most 20 words in an instruction, 25 in a description (a time counts as 3 words)
//   R9 a subject, a verb and its articles           R11 one instruction in a sentence
// R1 (the approved dictionary) is not checked: the dictionary is not at hand. R2 is a judgment.
// A title line (a name) has no full stop and keeps its words.
// Words follow the one vocabulary: "Timeline" for the whole bar, "row", "playhead", "case",
// "fold" and "open", "alone" for a row that is soloed, "event" as the node noun that arrives by
// argument, and a full word for every unit.

/** What a press on the Timeline's fold button folds or opens, in words for `foldTail`. The bar's
 *  own name, because the button's visible name is "Timeline" and the part is the whole of it.
 *  R3 R9: a noun phrase of two words, with its article. */
export const BAR_PART = "the Timeline";

/** The case strip on the one line. `noun` is the app's word for one node ("event"), in the
 *  singular; the plural is that word with an "s", which is right for a regular noun and is the
 *  limit of this function. `from` and `to` are the first and last moments of the case, in the
 *  clock's form and written by the caller. */
export function caseStripWords(noun: string, from: string, to: string): string[] {
  return [
    // A title: a name, no full stop.
    "The whole case",
    // R3 R4 R6 R7 R8 R9: simple present, active, 11 words.
    `Each slice counts the ${noun}s in one part of the case.`,
    // R3 R4 R6 R7 R8 R9: simple present, active, 5 words and the 2 times.
    `The case runs from ${from} to ${to}.`,
  ];
}

/** The state the control reports: the row's name, then that it is alone. The row's name is data
 *  and keeps its words. R4 R6 R7 R9: a subject, a verb and its complement, 3 words and the name;
 *  no full stop, as it is a title. */
const aloneLine = (name: string): string => `${name} is alone`;

/** What a press does. R2 R4 R6 R8 R9 R11: one imperative, 5 words. */
const PRESS_LINE = "Press to show every row.";

/** The accessible name of the control that clears a row that is alone. It begins with the row's
 *  name, which is the control's visible text, so the visible text is in the name (WCAG 2.5.3); it
 *  gives the state, then the action, as the fold button's name does, so the name says what the
 *  control does. */
export function soloClearName(name: string): string {
  return `${aloneLine(name)}. ${PRESS_LINE}`;
}

/** The tooltip of that control: the state, then what a press does. */
export function soloClearWords(name: string): string[] {
  return [aloneLine(name), PRESS_LINE];
}
