// frontend/investigator/src/lib/tooltip-words/lane.ts
// The sentences a lane says about itself. Each function
// returns the lines for `tip()`: a title line first, then its values or sentences. A tooltip never
// says what to conclude. The lane's name, unit, step, the soloed row and every figure are
// arguments, so no word of one pack is written here.
//
// Every sentence follows the Simplified Technical English writing
// rules as the Wikipedia article states them. A tag beside a sentence lists the rules it meets:
//   R3 no noun cluster of more than three words      R4 and R5 simple present only, no auxiliary
//   R6 no -ing form                                  R7 active voice
//   R8 at most 20 words in an instruction, 25 in a description
//   R9 a subject, a verb and its articles            R11 one instruction in a sentence
// R1 (the approved dictionary) and R2 are not checked: the dictionary is not at hand. The title
// line (a name) and the value line (an hour and an amount) are labels and not sentences.

/** A lane's step as the model prints it ("1H", "6H", "1D") in words: "one hour", "6 hours". */
function stepSpan(step: string): string {
  const m = /^(\d+)([DHMS])$/.exec(step);
  if (!m) return "one step";
  const unit = { D: "day", H: "hour", M: "minute", S: "second" }[m[2] as "D" | "H" | "M" | "S"];
  return m[1] === "1" ? `one ${unit}` : `${m[1]} ${unit}s`;
}

/** The lane's fold button. `whose` is the name of the one row shown alone, if there is one: the
 *  words then do not say that all rows are added. `open` picks the one instruction. */
export function laneFoldWords(name: string, unit: string, step: string, whose: string | undefined, open: boolean): string[] {
  return [
    name,
    // R4 R6 R7 R8 R9: simple present, 4 words.
    unit ? `The unit is ${unit}.` : "",
    // R3 R4 R6 R7 R8 R9: simple present, active, 11 words for all rows and 10 for one row, plus the row's name.
    whose ? `Each bar shows the values of ${whose} alone in ${stepSpan(step)}.` : `Each bar adds the values of all rows in ${stepSpan(step)}.`,
    // R2 R4 R8 R9 R11: one imperative, 5 words.
    open ? "Press to fold the lane." : "Press to open the lane.",
  ].filter((line) => line !== "");
}

/** The plot's scale: its range, and the bars over the top when there are some. */
export function laneScaleWords(top: string, above: number, max: string): string[] {
  const one = above === 1;
  return [
    "The plot scale",
    // R4 R6 R7 R8 R9: simple present, active, 8 words and the figure.
    `The plot runs from 0 to ${top}.`,
    // R4 R6 R7 R8 R9 R11: three short sentences in simple present, none with an -ing form or a passive.
    above > 0 ? `${above} ${one ? "bar is" : "bars are"} over that. The plot cuts ${one ? "it" : "them"}. The largest bar is ${max}.` : "",
  ].filter((line) => line !== "");
}

/** One bar: the lane's name, the row (one row's name, or all rows), the hour and the amount, and a
 *  sentence when the plot cuts the bar at `cutTop`. `hour` is the hour as the clock's form writes
 *  it and `value` the amount with its unit. */
export function laneBarWords(name: string, whose: string | undefined, hour: string, value: string, cutTop: string | null): string[] {
  return [
    name,
    whose ?? "All rows",
    `${hour} · ${value}`,
    // R4 R6 R7 R8 R9: simple present, active, 9 words and the figure.
    cutTop ? `The plot cuts this bar at ${cutTop}.` : "",
  ].filter((line) => line !== "");
}
