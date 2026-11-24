// frontend/investigator/src/lib/tooltip-words/transport.ts
// The words of the transport's tooltips: skip to start, slower, play, pause, faster, the speed
// and the clock's switch. Each returns the lines of one tooltip, a first line that says what the
// thing is and a second that gives its values or its press; none says what to conclude. The
// sentences follow the writing rules tagged below.
//
// Nothing here is a word of one pack. The speeds come from the speed set, and the length of a full
// scrub comes from the caller, which reads it from the playback driver's one constant.
import { SPEED_CHIPS } from "../../components/timeline/speed-chips";

const TIMES = "×"; // the multiplication sign, as the speed's own label prints it

/** A speed as the speed readout prints it, for a positive rate: "0.25×", "16×". */
const rateWords = (rate: number): string => `${rate}${TIMES}`;

/** The forward speeds of the set, slowest first. */
const FORWARD = SPEED_CHIPS.filter((r) => r > 0);

/** "60 seconds", "1 second": a length of time from milliseconds, rounded to whole seconds. */
const secondsWords = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${s} ${s === 1 ? "second" : "seconds"}`;
};

// A tag beside a sentence lists the rules it meets, as the Wikipedia article on Simplified
// Technical English states them (the same form as lane.ts):
//   R3 no noun cluster of more than three words   R4 and R5 simple present, no auxiliary
//   R6 no -ing form      R7 active voice          R8 at most 20 words in an instruction, 25 in a description
//   R9 a subject, a verb and its articles         R11 one instruction in a sentence
// R1 (the approved dictionary) is not checked: the dictionary is not at hand. A title line (a name)
// is a label and not a sentence, so it keeps its words.

export const toStart = (): string[] => [
  "Back to the start",
  // Instruction, 13 words. R2 R3 R4 R6 R7 R8 R9 R11. "the Timeline" is the whole bar, as in the term table.
  "Press to move the playhead to the start of what the Timeline shows.",
];

export const slower = (): string[] => [
  "Slower",
  // An instruction of 8 words and a description with the speeds. R2 R4 R6 R7 R8 R9 R11.
  `Press to change to the next slower speed. The order is ${[...FORWARD].reverse().map(rateWords).join(", ")}, stopped, then backwards.`,
];

export const faster = (): string[] => [
  "Faster",
  // An instruction of 8 words and a description with the speeds. R2 R4 R6 R7 R8 R9 R11.
  `Press to change to the next faster speed. The order is ${FORWARD.map(rateWords).join(", ")}.`,
];

/** `scrubMs` is the wall-clock length of one full scrub at 1x. */
export const play = (scrubMs: number): string[] => [
  "Play",
  // Description, 9 words. R3 R4 R6 R7 R8 R9 R11. Kept as it was: it already meets the rules.
  `At 1${TIMES} the whole case plays in ${secondsWords(scrubMs)}.`,
];

export const pause = (): string[] => [
  "Pause",
  // Instruction, 8 words. R2 R4 R6 R7 R8 R9 R11.
  "Press to stop the playhead where it is.",
];

export const speed = (scrubMs: number): string[] => [
  "Playback speed",
  // Description, 9 words. R3 R4 R6 R7 R8 R9 R11. Kept as it was: it already meets the rules.
  `At 1${TIMES} the whole case plays in ${secondsWords(scrubMs)}.`,
];

/** The clock's switch: its form now, and what a press does. */
export const clockSwitch = (h24: boolean): string[] => [
  "The clock's form",
  // A description and an instruction, 7 words each. R3 ("24 hour form" is three words) R4 R6 R7 R8 R9 R11.
  h24
    ? "The clock shows the 24 hour form. Press to show the 12 hour form."
    : "The clock shows the 12 hour form. Press to show the 24 hour form.",
];
