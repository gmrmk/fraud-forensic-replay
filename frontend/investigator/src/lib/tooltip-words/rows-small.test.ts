// frontend/investigator/src/lib/tooltip-words/rows-small.test.ts
// The sentences the folded rows' small version says about itself. A tooltip says
// what a thing is and gives its values, never what to conclude. Every sentence follows the
// writing rules the Wikipedia article on Simplified Technical English states:
// the checks below are the part of those rules that a script can see (R4 to R9 and R11).
// The dictionary (R1) is not checked. The fixtures are generic: no word of one pack lives here.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { countBarWords, countFigureWords, countLabelWords, dayWords, rowsFoldSmallWords, stepWords } from "./rows-small";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A title line (a name) and a value line (an hour and a number) are labels, not sentences. The
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

const HEADING = "Group";
const ALL = [
  ...rowsFoldSmallWords(HEADING, 30),
  ...rowsFoldSmallWords("", 1),
  ...countLabelWords(HEADING, HOUR, 24, 30, null),
  ...countLabelWords(HEADING, DAY, 1, 1, null),
  ...countLabelWords(HEADING, 0, 9, 128, null),
  ...countLabelWords(HEADING, HOUR, 4, 30, "Group 7"),
  ...countLabelWords(HEADING, HOUR, 1, 30, "Group 7"),
  ...countBarWords(HEADING, "Tue Jun 2 · 5:00p to 6:00p", 15, 30, null),
  ...countFigureWords(HEADING, "Tue Jun 2 · 5:00p to 6:00p", 15, 30, null),
];

describe("every sentence", () => {
  it("meets the script's part of the rules", () => {
    const found: string[] = [];
    for (const lines of [
      rowsFoldSmallWords(HEADING, 30),
      rowsFoldSmallWords("", 1),
      countLabelWords(HEADING, HOUR, 24, 30, null),
      countLabelWords(HEADING, DAY, 1, 1, null),
      countLabelWords(HEADING, 0, 9, 128, null),
      countLabelWords(HEADING, HOUR, 4, 30, "Group 7"),
      countLabelWords(HEADING, HOUR, 1, 30, "Group 7"),
      countBarWords(HEADING, "Tue Jun 2 · 5:00p to 6:00p", 15, 30, null),
      countBarWords(HEADING, "Tue Jun 2 · 5:00p to 6:00p", 3, 30, "Group 7"),
      countFigureWords(HEADING, "Tue Jun 2 · 5:00p to 6:00p", 15, 30, null),
    ]) {
      for (const s of sentencesOf(lines)) for (const p of problems(s)) found.push(`${p}: ${s}`);
    }
    expect(found).toEqual([]);
  });

  it("uses the one vocabulary: no moment, replay, unfold, node or step, and no word of the option not picked", () => {
    const text = ALL.join(" ");
    expect(text).not.toMatch(/\b(moment|replay|unfold|close|node|step)s?\b/i);
    expect(text.toLowerCase()).not.toContain(["stri", "pe"].join(""));
  });

  it("draws no conclusion", () => {
    expect(ALL.join(" ")).not.toMatch(/\b(suspicious|fraud|risk|unusual|normal|alert|busy|quiet)\b/i);
  });
});

describe("stepWords", () => {
  it("says a step in whole units, as the lane's words do", () => {
    expect(stepWords(HOUR)).toBe("one hour");
    expect(stepWords(DAY)).toBe("one day");
    expect(stepWords(6 * HOUR)).toBe("6 hours");
    expect(stepWords(2 * DAY)).toBe("2 days");
  });

  it("falls back to words that name no unit when the step is not a whole unit", () => {
    expect(stepWords(0)).toBe("its own time");
    expect(stepWords(1500)).toBe("its own time");
  });
});

describe("dayWords", () => {
  it("prints the Houston date of an instant, with no time", () => {
    expect(dayWords(Date.parse("2026-06-08T17:00:00Z"))).toBe("Mon Jun 8");
  });

  it("holds to the Houston day near midnight, not the runner's", () => {
    // 03:30Z on June 9 is 10:30 PM on June 8 in Houston.
    expect(dayWords(Date.parse("2026-06-09T03:30:00Z"))).toBe("Mon Jun 8");
  });
});

describe("rowsFoldSmallWords", () => {
  it("names the heading and how many rows, and says what a press does", () => {
    const lines = rowsFoldSmallWords(HEADING, 30);
    expect(lines[0]).toBe("Group: 30 rows");
    expect(lines.at(-1)).toBe("Press to open the rows.");
  });

  it("says one row in the singular and leaves the heading out when there is none", () => {
    expect(rowsFoldSmallWords("", 1)[0]).toBe("1 row");
  });
});

describe("countLabelWords", () => {
  it("defines active on screen, and says the range and what the top is", () => {
    const lines = countLabelWords(HEADING, HOUR, 24, 30, null);
    expect(lines[0]).toBe("Group: active rows");
    const text = lines.join(" ");
    expect(text).toContain("A row is active when it shows an event or a bar over zero in that time.");
    expect(text).toContain("The plot runs from 0 to 24.");
    expect(text).toContain("At most 24 rows are active in one bar.");
    expect(text).toContain("Each bar covers one hour.");
    expect(text).toContain("There are 30 rows.");
  });

  it("says the singular where one row is the top", () => {
    const text = countLabelWords(HEADING, DAY, 1, 1, null).join(" ");
    expect(text).toContain("At most 1 row is active in one bar.");
    expect(text).toContain("There is 1 row.");
  });

  it("names the soloed row and counts its events, and does not say that rows are active", () => {
    const lines = countLabelWords(HEADING, HOUR, 4, 30, "Group 7");
    expect(lines[0]).toBe("Group 7: events");
    const text = lines.join(" ");
    expect(text).toContain("This row is alone.");
    expect(text).toContain("At most 4 events fall in one bar.");
    expect(text).not.toMatch(/active/i);
  });

  it("leaves the heading out of the title when there is none", () => {
    expect(countLabelWords("", HOUR, 24, 30, null)[0]).toBe("Active rows");
  });
});

describe("countBarWords and countFigureWords", () => {
  it("give a title line and a value line, out of all the named rows", () => {
    expect(countBarWords(HEADING, "Tue Jun 2 · 5:00p to 6:00p", 15, 30, null)).toEqual(["Group: active rows", "Tue Jun 2 · 5:00p to 6:00p · 15 of 30"]);
    expect(countFigureWords(HEADING, "Tue Jun 2 · 5:00p to 6:00p", 15, 30, null)).toEqual([
      "Group: active rows at the playhead",
      "Tue Jun 2 · 5:00p to 6:00p · 15 of 30",
    ]);
  });

  it("give the soloed row's own count alone", () => {
    expect(countBarWords(HEADING, "Tue Jun 2", 3, 30, "Group 7")).toEqual(["Group 7: events", "Tue Jun 2 · 3"]);
  });
});

describe("the module's source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "rows-small.ts"), "utf8");

  it("writes no zone and reads no clock", () => {
    expect(source).not.toContain("America/Chicago");
    expect(source).not.toMatch(/Date\.now|new Date\(\)|performance\.now|setInterval|setTimeout/);
  });

  it("holds no code of the option that was not picked", () => {
    expect(source.toLowerCase()).not.toContain(["stri", "pe"].join(""));
  });
});
