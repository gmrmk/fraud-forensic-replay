// The sentences the text size row says about its parts. Each returns the lines for `tip()`: what
// the thing is first, then one sentence. A tooltip never says what to conclude. The sentences are
// new words.
//
// Every sentence follows the writing rules the Wikipedia article on Simplified Technical English
// lists. A tag beside a sentence names the rules it meets:
//   R3 no noun cluster of more than three words     R4 and R5 simple present or imperative, no auxiliary
//   R6 no -ing form                                 R7 active voice
//   R8 at most 20 words in an instruction, 25 in a description
//   R9 a subject, a verb and its articles           R11 one instruction in a sentence
// R1 (the approved dictionary) is not checked: the dictionary is not at hand. A title line (a name)
// is a label, not a sentence, and keeps its words. Words follow the term table: "percent" in full.
import { TEXT_SIZES, nextTextSize, prevTextSize, type TextSize } from "../text-size";

export type TextSizePart = "smaller" | "larger" | "figure";

const first = TEXT_SIZES[0];
const last = TEXT_SIZES[TEXT_SIZES.length - 1];

/** The lines for one part at the step now held. */
export function textSizeWords(part: TextSizePart, size: TextSize): string[] {
  if (part === "figure") {
    // R3 R4 R6 R7 R8 R9: simple present, active, 10 words.
    return ["Text size", `The text is at ${size} percent of the default size.`];
  }
  if (part === "smaller") {
    return [
      "Smaller text",
      size === first
        ? // R3 R4 R6 R7 R8 R9: simple present, active, 9 words.
          `The text is at its smallest size, ${size} percent.`
        : // R2 R3 R4 R5 R6 R8 R9 R11: one imperative of 6 words, then a description of 6.
          `Press to make the text smaller. The next size is ${prevTextSize(size)} percent.`,
    ];
  }
  return [
    "Larger text",
    size === last
      ? // R3 R4 R6 R7 R8 R9: simple present, active, 9 words.
        `The text is at its largest size, ${size} percent.`
      : // R2 R3 R4 R5 R6 R8 R9 R11: one imperative of 6 words, then a description of 6.
        `Press to make the text larger. The next size is ${nextTextSize(size)} percent.`,
  ];
}
