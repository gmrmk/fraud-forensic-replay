// frontend/investigator/src/lib/tooltip-words/lane-depth.test.ts
// The words of a lane's lines. A tooltip says what a thing is and gives its values,
// never what to conclude. Every sentence follows the writing rules the Wikipedia article on
// Simplified Technical English states; the checks below are the part
// of those rules that a script can see (R4 to R9 and R11). The dictionary (R1) is not checked. The
// field's label comes in as an argument, so the fixtures use a label that no pack has.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEPTH_MAX_LINES } from "../bar-metrics";
import { laneDepthBlockName, laneDepthTexts, laneDepthWords, laneLineWords } from "./lane-depth";

/** A title line (a name) and a value line (a label, a middle dot and a value, or a label, "in all"
 *  and a value) are labels, not sentences. The rest of a tooltip is sentences, one to a line or
 *  several to a line. */
const sentencesOf = (lines: readonly string[]): string[] =>
  lines
    .slice(1)
    .filter((line) => !line.includes(" · ") && !line.includes(" in all: "))
    .flatMap((line) => line.split(/(?<=\.)\s+/))
    .filter((s) => s.trim() !== "");

const wordCount = (s: string): number => s.trim().split(/\s+/).length;

/** The script's part of the rules. Returns the problems of one sentence. */
function problems(sentence: string): string[] {
  const out: string[] = [];
  const instruction = /^(Press|Scroll)\b/.test(sentence);
  if (wordCount(sentence) > (instruction ? 20 : 25)) out.push("R8 length");
  if (!/[.]$/.test(sentence)) out.push("R9 no full stop");
  if (/\b\w+ing\b/i.test(sentence)) out.push("R6 -ing form");
  if (/\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/i.test(sentence)) out.push("R7 passive");
  if (/\b(would|could|should|might|shall|can|must|may|has|have|had|do|does|did)\b/i.test(sentence)) out.push("R4 R5 verb form");
  if (instruction && /\b(and|then)\b/i.test(sentence)) out.push("R11 two instructions");
  return out;
}

const FIELD = "Carrier";
const LANE = "Weight";

describe("laneDepthTexts", () => {
  it("prints the quantity's label, and a second line with the field's label and the count", () => {
    expect(laneDepthTexts(LANE, FIELD, 6)).toEqual({ first: "Weight", second: "By Carrier · 6" });
  });

  it("prints the whole count, not the number of lines the block shows", () => {
    expect(laneDepthTexts(LANE, FIELD, 8).second).toBe("By Carrier · 8");
  });
});

describe("laneDepthWords", () => {
  it("opens with the title: the field's label and the count", () => {
    expect(laneDepthWords(FIELD, 6, undefined, false)[0]).toBe("By Carrier · 6");
  });

  it("says what a line shows, from the field's label", () => {
    const text = laneDepthWords(FIELD, 6, undefined, false).join(" ");
    expect(text).toContain("Each line shows one Carrier.");
    expect(text).toContain("Each bar adds the values for that Carrier.");
  });

  it("gives one instruction, chosen by state, and uses fold and open", () => {
    expect(laneDepthWords(FIELD, 6, undefined, false).at(-1)).toBe("Press to open the lines.");
    expect(laneDepthWords(FIELD, 6, undefined, true).at(-1)).toBe("Press to fold the lines.");
  });

  it("names the soloed row and says the lines show it alone", () => {
    expect(laneDepthWords(FIELD, 6, "Acme Co", true).join(" ")).toContain("The lines show Acme Co alone.");
    expect(laneDepthWords(FIELD, 6, undefined, true).join(" ")).not.toContain("alone");
  });

  it("says that the block scrolls only when there are more lines than it shows", () => {
    const few = laneDepthWords(FIELD, DEPTH_MAX_LINES, undefined, true).join(" ");
    expect(few).not.toMatch(/Scroll/);
    const many = laneDepthWords(FIELD, DEPTH_MAX_LINES + 2, undefined, true);
    expect(many.join(" ")).toContain(`The block shows ${DEPTH_MAX_LINES} lines.`);
    expect(many.join(" ")).toContain("Scroll to show the other lines.");
  });

  it("holds the rules in every sentence it can say", () => {
    const sets = [
      laneDepthWords(FIELD, 6, undefined, false),
      laneDepthWords(FIELD, 6, undefined, true),
      laneDepthWords(FIELD, 40, "Acme Co", true),
      laneDepthWords(FIELD, 40, "Acme Co", false),
    ];
    for (const lines of sets) {
      const sentences = sentencesOf(lines);
      expect(sentences.length).toBeGreaterThan(0);
      for (const s of sentences) expect(problems(s), s).toEqual([]);
    }
  });

  it("uses no word the term table forbids for these things", () => {
    const text = [true, false].map((o) => laneDepthWords(FIELD, 40, "Acme Co", o).join(" ")).join(" ");
    expect(text).not.toMatch(/\b(unfold|close|closed|collapse|expand|solo|moment|replay)\b/i);
  });
});

describe("laneLineWords", () => {
  it("gives the field's label, the line's whole name, and its sum", () => {
    expect(laneLineWords(FIELD, "C-ALFA", LANE, "12.5 kg")).toEqual(["Carrier", "C-ALFA", "Weight in all: 12.5 kg"]);
  });

  it("holds no sentence, so no rule is open to it: a label, a name and a value line, none with a full stop", () => {
    const lines = laneLineWords(FIELD, "C-ALFA", LANE, "12.5 kg");
    expect(lines).toHaveLength(3);
    expect(lines.some((l) => l.endsWith("."))).toBe(false);
    expect(lines[2]).toContain(" in all: ");
  });
});

describe("laneDepthBlockName", () => {
  it("names the block by the quantity and the field", () => {
    expect(laneDepthBlockName(LANE, FIELD)).toBe("Weight by Carrier");
  });
});

describe("what the words read", () => {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "lane-depth.ts"), "utf8");
  it("names no pack's field, kind or word", () => {
    expect(source).not.toMatch(/ip_asn|credential|org_id|network|spend|token/i);
  });
});
