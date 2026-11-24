// frontend/investigator/src/lib/tooltip-words/rows-small.ts
// The sentences the folded rows' small version says about itself. Each function returns the lines for `tip()`: a title line first, then its sentences or
// its values. A tooltip says what a thing is and gives its values; it never says what to conclude.
// The heading, a row's name, the hour and every figure come in as arguments, so no word of one
// pack is written here.
//
// Every sentence follows the Simplified Technical English writing
// rules as the Wikipedia article states them. A tag beside a sentence names the rules it meets:
//   R3 no noun cluster of more than three words     R4 and R5 simple present or imperative, no auxiliary
//   R6 no -ing form                                 R7 active voice
//   R8 at most 20 words in an instruction, 25 in a description
//   R9 a subject, a verb and its articles           R11 one instruction in a sentence
// R1 (the approved dictionary) is not checked: the dictionary is not at hand. R2 is a judgment. A
// title line and the `hour · value` line are labels, not sentences, and keep their words.
// Words follow the one vocabulary: "row", "bar" for a column of amounts, "event", "alone", "open".
import { HOU_TZ } from "../houston-day";
import { countFigureText } from "../rows-small";

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: HOU_TZ });

/** "Mon Jun 8": a day, for the bars of a story whose count steps by the day. */
export function dayWords(ms: number): string {
  return DAY_FORMAT.format(new Date(ms)).replace(",", "");
}

const UNITS: readonly (readonly [string, number])[] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
];

/** A bar's time in words: "one hour", "6 hours", "one day"; words that name no unit when the step is
 *  not a whole number of one. */
export function stepWords(ms: number): string {
  if (Number.isFinite(ms) && ms > 0 && ms % 1000 === 0) {
    for (const [unit, size] of UNITS) {
      if (ms % size === 0) return ms === size ? `one ${unit}` : `${ms / size} ${unit}s`;
    }
  }
  return "its own time";
}

/** The title of the count's tooltips: what the bars count, or whose events they count. */
const titleOf = (heading: string, soloName: string | null): string =>
  soloName !== null ? `${soloName}: events` : heading ? `${heading}: active rows` : "Active rows";

/** The button on the line that opens the folded rows: the heading and how many rows, then what a
 *  press does. The title is a label. */
export function rowsFoldSmallWords(heading: string, named: number): string[] {
  const count = `${named} ${named === 1 ? "row" : "rows"}`;
  return [
    heading ? `${heading}: ${count}` : count,
    // R3 R4 R6 R7 R8 R9: simple present, active, 9 words.
    "The small version shows how many rows are active.",
    // R2 R4 R8 R9 R11: one imperative, 5 words.
    "Press to open the rows.",
  ];
}

/** The name cell: what the bars count, the rule for an active row, and the scale. `stepMs` is a
 *  bar's time, `top` the largest count of the whole case and `named` how many named rows there are.
 *  `soloName` is the name of the row that is alone, or null. */
export function countLabelWords(heading: string, stepMs: number, top: number, named: number, soloName: string | null): string[] {
  const step = stepWords(stepMs);
  if (soloName !== null) {
    return [
      titleOf(heading, soloName),
      // R3 R4 R6 R7 R8 R9: simple present, active, 4 words and the time (2 words at most).
      `Each bar covers ${step}.`,
      // R4 R6 R9: simple present, 4 words.
      "This row is alone.",
      // R3 R4 R6 R7 R8 R9: simple present, active, 8 words.
      "Each bar counts its events in that time.",
      // R4 R6 R7 R8 R9: simple present, active, 7 words with the figure.
      `The plot runs from 0 to ${top}.`,
      // R4 R6 R7 R8 R9: simple present, active, 8 words with the figure.
      `At most ${top} ${top === 1 ? "event falls" : "events fall"} in one bar.`,
    ];
  }
  return [
    titleOf(heading, null),
    // R3 R4 R6 R7 R8 R9: simple present, active, 4 words and the time (2 words at most).
    `Each bar covers ${step}.`,
    // R4 R6 R7 R8 R9: simple present, active, 17 words. This is the rule as built. Here
    // "bar" means a row's bar of amounts, as in the one vocabulary; the sentences above and below
    // use it for the count's own bar.
    "A row is active when it shows an event or a bar over zero in that time.",
    // R4 R6 R7 R8 R9: simple present, active, 7 words with the figure.
    `The plot runs from 0 to ${top}.`,
    // R3 R4 R6 R7 R8 R9: simple present, active, 8 words with the figure. The round's new sentence.
    `At most ${top} ${top === 1 ? "row is" : "rows are"} active in one bar.`,
    // R4 R6 R9: simple present, 4 words with the figure.
    named === 1 ? "There is 1 row." : `There are ${named} rows.`,
  ];
}

/** One bar of the count: its title, then its time and its number. `when` is already in the clock's
 *  form. The value line is a label. */
export function countBarWords(heading: string, when: string, n: number, named: number, soloName: string | null): string[] {
  return [titleOf(heading, soloName), `${when} · ${countFigureText(n, named, soloName !== null)}`];
}

/** The number at the line: the same two lines, with the playhead in the title. */
export function countFigureWords(heading: string, when: string, n: number, named: number, soloName: string | null): string[] {
  return [`${titleOf(heading, soloName)} at the playhead`, `${when} · ${countFigureText(n, named, soloName !== null)}`];
}
