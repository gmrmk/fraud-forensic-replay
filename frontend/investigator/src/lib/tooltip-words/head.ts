// frontend/investigator/src/lib/tooltip-words/head.ts
// The sentences the head's parts say about themselves.
// Each returns the lines for `tip()`: what the thing is first, then its values. A tooltip never
// says what to conclude. The noun for a node and the part a fold opens are arguments, so no word
// of one pack is written here.
//
// Every sentence follows the writing rules the Wikipedia article on
// Simplified Technical English lists. A tag beside a sentence names the rules it meets:
//   R3 no noun cluster of more than three words     R4 and R5 simple present or imperative, no auxiliary
//   R6 no -ing form                                 R7 active voice
//   R8 at most 20 words in an instruction, 25 in a description (the time left counts as 8 words)
//   R9 a subject, a verb and its articles           R11 one instruction in a sentence
// R1 (the approved dictionary) is not checked: the dictionary is not at hand. R2 is a judgment.
// A title line (a name) and the `hour · value` line are labels, not sentences, and keep their words.
// Words follow B5's lane.ts and the rows' file: "playhead" for the moving time, "fold" and "open"
// for a control. "The Timeline" names the whole bar, because "bar" is a lane's bar in those files.

/** Which edge of the window the playhead has passed, or null while it is inside. */
export type HeadOutside = "before" | "after" | null;

/** What the folded Timeline draws: a line for each section, or the one line (the clock, the whole
 *  case and the transport). */
export type BarView = "stack" | "line";

/** What a fold control is showing: its whole self, a small version, its name alone, or, for the
 *  Timeline's own button, one of the two folded views. */
export type FoldState = "open" | "small" | "name" | BarView;

/** The time left, one sentence for the tab, the folded clock and the time-left tooltip.
 *  R3 R4 R6 R7 R8 R9: simple present, active, 10 words and the 8 of the time. */
const leftLine = (left: string, noun: string): string => `The time from the playhead to the last ${noun} is ${left}.`;

/** The tab that holds the clock. `left` is the time left in words, `noun` the app's word for one
 *  node ("event"). */
export function headTabWords(left: string, outside: HeadOutside, noun: string): string[] {
  return [
    "The playhead",
    // R3 R4 R6 R7 R8 R9: simple present, active, 11 words.
    // R2 R4 R6 R8 R9 R11: one imperative, 7 words.
    "The tab shows the playhead's date and hour in Houston time. Drag the tab to move the playhead.",
    leftLine(left, noun),
    // R3 R4 R6 R7 R8 R9: simple present, active, 8 words and 6 words, one idea each.
    outside ? `The playhead is ${outside} what the Timeline shows. The tab stays at the ${outside === "before" ? "left" : "right"} edge.` : "",
  ].filter((line) => line !== "");
}

/** The clock on the folded bar. The title is a label and keeps its words. */
export function foldedClockWords(left: string, noun: string): string[] {
  return [
    "The moment being replayed",
    // R3 R4 R6 R7 R8 R9: simple present, active, 8 words.
    "The clock shows the playhead's date and hour in Houston time.",
    leftLine(left, noun),
  ];
}

/** The time left, spelled out with its seconds. The title is a label and keeps its words. */
export function timeLeftWords(left: string, noun: string): string[] {
  return ["Time left in the case", leftLine(left, noun)];
}

/** The Timeline's fold button. `view` tells which folded view is drawn: left out, it is the one line.
 *  A press on the open Timeline folds it to a line for each section on a pack with sections and to
 *  one line on a pack with none, so the open words name neither. */
export function barFoldWords(folded: boolean, view: BarView = "line"): string[] {
  if (!folded) {
    return [
      "Timeline",
      // R2 R4 R6 R8 R9 R11: one imperative, 4 words.
      // R3 R4 R6 R7 R8 R9: simple present, active, 9 words.
      "Press to fold it. The clock, the whole case and the transport stay.",
    ];
  }
  // A title: a name, no full stop.
  if (view === "stack") return ["Timeline, folded to a line for each section", "Press to fold it to one line."]; // R2 R4 R6 R8 R9 R11: one imperative, 6 words.
  return [
    "Timeline, folded to one line",
    // R2 R3 R4 R6 R8 R9 R11: one imperative, 10 words.
    "Press to open the track, the rows and the lane.",
  ];
}

/** The sentences that end a fold control's accessible name, after its own words. `part` names
 *  what a press opens or folds, in words ("the rows"). Each state gives its state first and one
 *  instruction last. "Is folded" uses the past participle as an adjective, as R4 allows. */
export function foldTail(state: FoldState, part: string): string {
  // R4 R6 R7 R8 R9: simple present, active, 3 words.
  // R2 R3 R4 R6 R8 R9 R11: one imperative, 4 words and the part.
  if (state === "open") return `It is open. Press to fold ${part}.`;
  // R4 R6 R9: the state is the participle as an adjective, 3 words; R4 R6 R7 R8 R9: 5 words.
  if (state === "small") return `It is folded. It shows a small version. Press to open ${part}.`;
  // The Timeline's two folded views. The stack: R4 R6 R9: 3 words; R4 R6 R7 R8 R9: simple present,
  // active, 7 words; R2 R3 R4 R6 R8 R9 R11: one imperative, 4 words, the part and 3 words.
  if (state === "stack") return `It is folded. It shows a line for each section. Press to fold ${part} to one line.`;
  // The one line: R4 R6 R9: 3 words; R3 R4 R6 R7 R8 R9: simple present, active, 10 words; R2 R3 R4
  // R6 R8 R9 R11: one imperative, 3 words and the part.
  if (state === "line") return `It is folded. It shows the clock, the whole case and the transport. Press to open ${part}.`;
  // R4 R6 R9: 3 words; R4 R6 R7 R8 R9: simple present, active, 5 words.
  return `It is folded. It shows its name alone. Press to open ${part}.`;
}

/** The lane's number at the line: its name, then the hour and the value. Both lines are labels
 *  (no full stop), so they keep their words. */
export function laneFigureWords(name: string, hour: string, value: string): string[] {
  return [`${name} at the playhead`, `${hour} · ${value}`];
}
