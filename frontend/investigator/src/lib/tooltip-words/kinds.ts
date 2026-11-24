// frontend/investigator/src/lib/tooltip-words/kinds.ts
// The sentences the Timeline's kind lines say about themselves.
// Each function returns the lines for `tip()`: a title first, then its sentences. A tooltip
// says what a thing is and gives its values; it never says what to conclude. The noun for an event,
// a kind's label and every figure come in as arguments, so no word of one pack is written here. A
// kind's label is the manifest's and is printed as it is, a label that names a verdict included.
//
// Every sentence follows the Simplified Technical English writing rules
// as the Wikipedia article states them. A tag beside a sentence names the rules it meets:
//   R3 no noun cluster of more than three words     R4 and R5 simple present or imperative, no auxiliary
//   R6 no -ing form                                 R7 active voice
//   R8 at most 20 words in an instruction, 25 in a description
//   R9 a subject, a verb and its articles           R11 one instruction in a sentence
// R1 (the approved dictionary) is not checked: the dictionary is not at hand. R2 is a judgment. A
// title line is a label, not a sentence, and keeps its words.
// Words follow the one vocabulary: "fold" and "open" for a section, "event" (by argument), "alone"
// for a row that is soloed, "case". The term table keeps "line" for a member line; the design's own
// name for this part is "kind line", which is a second meaning, and it is not used in a sentence
// here. The plural of the noun is the noun with an "s", which is right for a regular noun and is the
// limit of this module.
//
// The Layers switches (C3 c, C5 b): when a switched-off kind or value hides events of the track, the
// control's name and tooltip read "Total Events: <shown> / <all>" (its drawn label is the short
// `totalLabel`, "Events: <shown> / <all>"), its tooltip adds one line that says how many the
// menu hides, and a kind line's tooltip says what the track draws. With nothing hidden every function
// reads as it did before.

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (noun: string, n: number): string => (n === 1 ? noun : `${noun}s`);

/** What a press opens or folds, in the plural whatever the count. R3 R9: a noun phrase of four short
 *  words with its article, for `foldTail`-style sentences. */
export function kindsPart(noun: string): string {
  return `the ${noun}s by kind`;
}

/** The rail's visible label: the whole case, with the word Total
 *  ("Total Events: 417"). The count is the events the lines hold, which is the whole case
 *  with no row alone and the row's own events with one. A label: no full stop. */
export function totalText(noun: string, count: number, all: number = count): string {
  if (all === count) return `Total ${cap(plural(noun, count))}: ${count}`;
  // The Layers switches hide some events: the control reads shown over all, the plural by the total.
  return `Total ${cap(plural(noun, all))}: ${count} / ${all}`;
}

/** The label the rail DRAWS in a column about 148 px wide, where "Total Events: 87 / 231" is cut by its
 *  ellipsis. With nothing hidden it reads what `totalText` reads. While the switches hide events it
 *  drops the word Total: "Events: 87 / 231", the plural by the total, which holds 19 characters for a
 *  four-digit count out of a four-digit total. The control's accessible name and tooltip keep
 *  `totalText`, so the full words stay there. A label: no full stop. */
export function totalLabel(noun: string, count: number, all: number = count): string {
  if (all === count) return totalText(noun, count, all);
  return `${cap(plural(noun, all))}: ${count} / ${all}`;
}

/** The sentence about what the Layers switches hid, or null when they hid nothing. R3 R4 R6 R7 R8 R9:
 *  simple present, active, 8 words and two figures. */
function hideLine(noun: string, count: number, all: number): string | null {
  return all > count ? `The Layers menu hides ${all - count} of the ${all} ${plural(noun, all)}.` : null;
}

/** The title of the list the control opens. A title: no full stop. */
export function kindsGroupName(noun: string): string {
  return `${cap(noun)}s by kind`;
}

/** The sentence about what the count covers. R3 R4 R6 R7 R8 R9: simple present, active, 5 words and
 *  8 words. */
const coverLine = (soloName: string | null): string =>
  soloName !== null ? "The count covers the row that is alone." : "The count covers the whole case.";

/** The control's accessible name. It begins with its visible text (WCAG 2.5.3), then gives its state
 *  and what a press does. R4 R6 R7 R8 R9: simple present, active, 3 words; R2 R3 R4 R6 R8 R9 R11:
 *  one imperative, 6 words. */
export function kindsFoldName(noun: string, count: number, open: boolean, all: number = count): string {
  const press = open ? `Press to fold ${kindsPart(noun)}.` : `Press to open ${kindsPart(noun)}.`;
  return `${totalText(noun, count, all)}. ${open ? "It is open." : "It is folded."} ${press}`;
}

/** The control's tooltip: its label, what the count covers, then what a press does. `soloName` is
 *  the name of the row that is alone, or null; the row's name is not printed in a sentence. */
export function kindsFoldWords(noun: string, count: number, open: boolean, soloName: string | null, all: number = count): string[] {
  const hidden = hideLine(noun, count, all);
  return [
    totalText(noun, count, all),
    coverLine(soloName),
    ...(hidden === null ? [] : [hidden]),
    // R2 R3 R4 R6 R8 R9 R11: one imperative, 6 words.
    open ? `Press to fold ${kindsPart(noun)}.` : `Press to open ${kindsPart(noun)}.`,
  ];
}

/** A kind's name cell: its label, then its count and what the track draws. The title is the
 *  manifest's label, unchanged. While the Layers switches hide events (`hidden`), the track no longer
 *  draws "the same events" as the case holds, so the cell says what the track draws: two lines. */
export function kindLineWords(name: string, count: number, noun: string, soloName: string | null, hidden = false): string[] {
  if (hidden) {
    // R3 R4 R6 R7 R8 R9: simple present, active, 8 words and the figure.
    return [name, `The track draws ${count} ${plural(noun, count)} of this kind${soloName !== null ? " in the row that is alone" : ""}.`];
  }
  return [
    name,
    // R3 R4 R6 R7 R8 R9: simple present, active, 7 words and the figure.
    `This kind has ${count} ${plural(noun, count)} ${soloName !== null ? "in the row that is alone" : "in the case"}.`,
    // R3 R4 R6 R7 R8 R9: simple present, active, 6 words.
    `The track draws the same ${noun}s.`,
  ];
}
