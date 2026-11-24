// frontend/investigator/src/lib/tooltip-words/lane.test.ts
// The sentences a lane says about itself. A tooltip says what a thing is and its
// values, never what to conclude. Every sentence follows the writing rules the Wikipedia article on
// Simplified Technical English states: the checks below are the part
// of those rules that a script can see (R4 to R9 and R11). The dictionary (R1) is not checked.
// The fixtures are generic: no word of one pack lives here.
import { describe, expect, it } from "vitest";
import { laneBarWords, laneFoldWords, laneScaleWords } from "./lane";

/** A title line (a name) and a value line (an hour and an amount) are labels, not sentences. The
 *  rest of a tooltip is sentences, one to a line or several to a line. */
const sentencesOf = (lines: readonly string[]): string[] =>
  lines
    .slice(1)
    .filter((line) => !line.includes(" · "))
    .flatMap((line) => line.split(/(?<=\.)\s+/))
    .filter((s) => s.trim() !== "");

const wordCount = (s: string): number => s.trim().split(/\s+/).length;

/** The script's part of the rules. Returns the problems of one sentence. */
function problems(sentence: string): string[] {
  const out: string[] = [];
  const instruction = /^Press\b/.test(sentence);
  if (wordCount(sentence) > (instruction ? 20 : 25)) out.push("R8 length");
  if (!/[.]$/.test(sentence)) out.push("R9 no full stop");
  if (/\b\w+ing\b/i.test(sentence)) out.push("R6 -ing form");
  if (/\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/i.test(sentence)) out.push("R7 passive");
  if (/\b(would|could|should|might|shall|can|must|may|has|have|had|do|does|did)\b/i.test(sentence)) out.push("R4 R5 verb form");
  if (instruction && /\b(and|then)\b/i.test(sentence)) out.push("R11 two instructions");
  return out;
}

const NAME = "Parcel · Weight";
const HOURS = "Mon Jun 8 · 5:00p to 6:00p";

describe("laneFoldWords", () => {
  it("names the lane, its unit and its step, and says that the bars add all rows", () => {
    const lines = laneFoldWords(NAME, "kg", "1H", undefined, true);
    expect(lines[0]).toBe(NAME);
    expect(lines).toContain("The unit is kg.");
    expect(lines.join(" ")).toContain("Each bar adds the values of all rows in one hour.");
  });

  it("names the soloed row and does not say that all rows are added", () => {
    const text = laneFoldWords(NAME, "kg", "1H", "Acme Co", true).join(" ");
    expect(text).toContain("Each bar shows the values of Acme Co alone in one hour.");
    expect(text).not.toMatch(/all rows/i);
  });

  it("says the step in words, and drops the unit line for a lane with no unit", () => {
    expect(laneFoldWords(NAME, "kg", "6H", undefined, true).join(" ")).toContain("in 6 hours");
    expect(laneFoldWords(NAME, "kg", "1D", undefined, true).join(" ")).toContain("in one day");
    expect(laneFoldWords(NAME, "", "1H", undefined, true).some((l) => l.startsWith("The unit"))).toBe(false);
  });

  it("gives one instruction, chosen by state", () => {
    expect(laneFoldWords(NAME, "kg", "1H", undefined, true).at(-1)).toBe("Press to fold the lane.");
    expect(laneFoldWords(NAME, "kg", "1H", undefined, false).at(-1)).toBe("Press to open the lane.");
  });
});

describe("laneScaleWords", () => {
  it("says the range, and the bars over it only when there are some", () => {
    expect(laneScaleWords("540 kg", 0, "540 kg")).toEqual(["The plot scale", "The plot runs from 0 to 540 kg."]);
    expect(laneScaleWords("540 kg", 2, "3,600 kg")).toEqual([
      "The plot scale",
      "The plot runs from 0 to 540 kg.",
      "2 bars are over that. The plot cuts them. The largest bar is 3,600 kg.",
    ]);
    expect(laneScaleWords("540 kg", 1, "3,600 kg")[2]).toBe("1 bar is over that. The plot cuts it. The largest bar is 3,600 kg.");
  });
});

describe("laneBarWords", () => {
  it("gives the lane's name, the row, the hour and the amount", () => {
    expect(laneBarWords(NAME, undefined, HOURS, "1,200 kg", null)).toEqual([NAME, "All rows", `${HOURS} · 1,200 kg`]);
    expect(laneBarWords(NAME, "Acme Co", HOURS, "1 kg", null)[1]).toBe("Acme Co");
  });

  it("says in a sentence that a cut bar is cut, with the top", () => {
    expect(laneBarWords(NAME, undefined, HOURS, "3,600 kg", "540 kg").at(-1)).toBe("The plot cuts this bar at 540 kg.");
  });
});

describe("the writing rules a script can check", () => {
  const cutLine = laneBarWords(NAME, undefined, HOURS, "3,600 kg", "540 kg").at(-1) ?? "";
  // Each call's title line is its first line, so a call's lines are checked one call at a time.
  const calls = [
    laneFoldWords(NAME, "kg", "1H", undefined, true),
    laneFoldWords(NAME, "kg", "1H", undefined, false),
    laneFoldWords(NAME, "kg", "6H", "Acme Co", true),
    laneFoldWords(NAME, "", "1D", "Acme Co", false),
    laneScaleWords("540 kg", 2, "3,600 kg"),
    laneScaleWords("540 kg", 1, "3,600 kg"),
    ["", cutLine],
  ];

  it("finds sentences to check", () => {
    expect(sentencesOf(laneFoldWords(NAME, "kg", "1H", undefined, true))).toHaveLength(3);
    expect(sentencesOf(laneScaleWords("540 kg", 2, "3,600 kg"))).toHaveLength(4);
  });

  it("holds every sentence to R4 to R9 and R11, and the check sees a fault", () => {
    const found = calls.flatMap((c) => sentencesOf(c)).flatMap((s) => problems(s).map((p) => `${p}: ${s}`));
    expect(found).toEqual([]);
    expect(problems("The playhead is moved by the user and moving.")).toEqual(["R6 -ing form", "R7 passive"]);
  });

  it("uses no dash and holds no word of one pack", () => {
    const dashes = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
    for (const line of calls.flat()) {
      for (const dash of dashes) expect(line).not.toContain(dash);
      expect(line.toLowerCase()).not.toMatch(/usage|spend|usd/);
    }
  });
});
