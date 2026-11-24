// frontend/investigator/src/lib/tooltip-words/lane-small.ts
// The sentences the folded lane's name button says. The
// folded lane keeps its bars and its number on one line, and the words that the open lane prints
// beside its plot (the plot's range, and how many bars the plot cuts) are in this tooltip and in
// the button's description, so a keyboard reaches them by focus.
//
// The lines are the open lane's own sentences, put together, so the two cannot drift: the fold
// button's lines (name, unit, what a bar adds, and one instruction) with the plot scale's lines
// between them. Every sentence follows the Simplified Technical English
// writing rules as the Wikipedia article states them; the tags and the rules are in lane.ts. R1
// (the approved dictionary) is not checked. The words follow the one vocabulary: "lane", "bar" for
// a lane's column, "row", "alone", "fold" and "open".

import { laneFoldWords, laneScaleWords } from "./lane";

/** What a press on the folded lane's button opens, in words for `foldTail`. R3 R9: a noun phrase
 *  of two words, with its article. */
export const LANE_PART = "the lane";

/** The folded lane's name button. `name` is the lane's name, `whose` the one row shown alone, and
 *  `top`, `above` and `max` the plot's range, as `laneScaleWords` takes them. The instruction
 *  stays last, as the reader of the button meets it last. */
export function laneSmallWords(
  name: string,
  unit: string,
  step: string,
  whose: string | undefined,
  top: string,
  above: number,
  max: string,
): string[] {
  // The fold lines for a lane that is folded: the last line is the one instruction, "Press to open".
  const fold = laneFoldWords(name, unit, step, whose, false);
  const instruction = fold[fold.length - 1];
  // The scale's first line is its title, which the button does not need after its own.
  const scale = laneScaleWords(top, above, max).slice(1);
  return [...fold.slice(0, -1), ...scale, instruction];
}
