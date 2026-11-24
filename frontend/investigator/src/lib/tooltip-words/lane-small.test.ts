// frontend/investigator/src/lib/tooltip-words/lane-small.test.ts
// The sentences the folded lane's name button says. A tooltip says what a thing is
// and its values, never what to conclude. Every sentence follows the writing rules the Wikipedia
// article on Simplified Technical English states; the checks below are
// the part of those rules a script can see (R4 to R9 and R11). The dictionary (R1) is not checked.
// The fixtures are generic: no word of one pack lives here.
import { describe, expect, it } from "vitest";
import { laneFoldWords, laneScaleWords } from "./lane";
import { LANE_PART, laneSmallWords } from "./lane-small";

/** A title line (a name) is a label, not a sentence. The rest is sentences, several to a line. */
const sentencesOf = (lines: readonly string[]): string[] =>
  lines
    .slice(1)
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

describe("laneSmallWords", () => {
  it("gives the name, the unit, what a bar adds, the plot's range and one instruction last", () => {
    const lines = laneSmallWords(NAME, "kg", "1H", undefined, "540 kg", 0, "540 kg");
    expect(lines[0]).toBe(NAME);
    expect(lines).toContain("The unit is kg.");
    expect(lines.join(" ")).toContain("Each bar adds the values of all rows in one hour.");
    expect(lines.join(" ")).toContain("The plot runs from 0 to 540 kg.");
    expect(lines.at(-1)).toBe("Press to open the lane.");
  });

  it("is made of the lane's own sentences, so the two cannot drift", () => {
    const lines = laneSmallWords(NAME, "kg", "1H", undefined, "540 kg", 6, "3,600 kg");
    const fold = laneFoldWords(NAME, "kg", "1H", undefined, false);
    const scale = laneScaleWords("540 kg", 6, "3,600 kg");
    expect(lines).toEqual([...fold.slice(0, -1), ...scale.slice(1), fold.at(-1)]);
  });

  it("says how many bars are over the top and the largest, only when there are some", () => {
    expect(laneSmallWords(NAME, "kg", "1H", undefined, "540 kg", 0, "540 kg").join(" ")).not.toMatch(/over that/);
    expect(laneSmallWords(NAME, "kg", "1H", undefined, "540 kg", 6, "3,600 kg").join(" ")).toContain(
      "6 bars are over that. The plot cuts them. The largest bar is 3,600 kg.",
    );
    expect(laneSmallWords(NAME, "kg", "1H", undefined, "540 kg", 1, "3,600 kg").join(" ")).toContain(
      "1 bar is over that. The plot cuts it. The largest bar is 3,600 kg.",
    );
  });

  it("names the row that is alone and does not say that all rows are added", () => {
    const text = laneSmallWords(NAME, "kg", "1H", "Acme Co", "540 kg", 0, "540 kg").join(" ");
    expect(text).toContain("Each bar shows the values of Acme Co alone in one hour.");
    expect(text).not.toMatch(/all rows/i);
  });

  it("drops the unit line for a lane with no unit and says a step of days in words", () => {
    const lines = laneSmallWords(NAME, "", "1D", undefined, "540", 0, "540");
    expect(lines.some((l) => l.startsWith("The unit"))).toBe(false);
    expect(lines.join(" ")).toContain("in one day");
  });

  it("follows the writing rules in every sentence, with and without cut bars and a row alone", () => {
    for (const whose of [undefined, "Acme Co"]) {
      for (const above of [0, 1, 6]) {
        const lines = laneSmallWords(NAME, "kg", "6H", whose, "540 kg", above, "3,600 kg");
        const sentences = sentencesOf(lines);
        expect(sentences.length).toBeGreaterThan(0);
        for (const s of sentences) expect(problems(s), s).toEqual([]);
      }
    }
  });

  it("names its part for the accessible name's tail, and the key word of a dismissal is not in it", () => {
    expect(LANE_PART).toBe("the lane");
    // The key's name is built from two halves, so that no file holds the word.
    const key = new RegExp(["Esc", "ape"].join(""), "i");
    expect(laneSmallWords(NAME, "kg", "1H", undefined, "540 kg", 6, "3,600 kg").join(" ")).not.toMatch(key);
  });
});
