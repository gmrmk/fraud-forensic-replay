import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { memberLineWords, restRowWords, rowCutWords, rowOpenWords, rowsFoldWords, rowWords } from "./rows";

const kinds = [["Stop", 3], ["Visit", 1]] as const;

describe("the rows' words", () => {
  it("words the fold button with the heading and the count of named rows", () => {
    expect(rowsFoldWords("Squad", 30)).toEqual(["Squad: 30 rows", "Each row has one name. The row with the most events is first. Press to fold or open the rows."]);
    expect(rowsFoldWords("Squad", 1)[0]).toBe("Squad: 1 row");
  });

  it("says nothing of the grouping where there is no heading: no coined word for it", () => {
    expect(rowsFoldWords("", 2)).toEqual(["2 rows", "The row with the most events is first. Press to fold or open the rows."]);
    expect(rowsFoldWords("", 1)[0]).toBe("1 row");
    expect(restRowWords("Stop", "", kinds)).toEqual(["Stop", "Stop 3 · Visit 1"]);
    for (const s of [...rowsFoldWords("", 2), ...restRowWords("Stop", "", kinds)]) expect(s).not.toMatch(/Rows:|grouping value/);
  });

  it("words a row's name with the heading, the whole name, its events by kind and the bars' sum", () => {
    expect(rowWords("Squad", "A Very Long Squad Name That Is Cut On Screen", kinds, { barName: "Load · Weight", amount: "9 kg" })).toEqual([
      "Squad",
      "A Very Long Squad Name That Is Cut On Screen",
      "Stop 3 · Visit 1",
      "Load · Weight in all: 9 kg",
    ]);
  });

  it("leaves the bars' line out when the row has no bars, and the heading out when there is none", () => {
    expect(rowWords("Squad", "Alpha", kinds, null)).toHaveLength(3);
    expect(rowWords("", "Alpha", kinds, null)[0]).toBe("Alpha");
  });

  it("words a rest row from its kind's label, unchanged, and says why it has a row of its own", () => {
    const lines = restRowWords("Stop", "Squad", kinds);
    expect(lines[0]).toBe("Stop");
    expect(lines[1]).toBe("These events have no Squad. They have a row of their own.");
    expect(lines[2]).toBe("Stop 3 · Visit 1");
  });

  it("words a row's triangle: a row opens into lines, and closes", () => {
    expect(rowOpenWords("Alpha", "Bay", false)).toEqual(["Alpha", "Press to open it. It shows a line for each Bay."]);
    expect(rowOpenWords("Alpha", "Bay", true)).toEqual(["Alpha", "Press to fold its lines."]);
  });

  it("words a member line with its label, its value, its events and its bars' sum", () => {
    expect(memberLineWords("Bay", "k-9", ["Mon Jun 8 · 9:00a · note"], { barName: "Load · Weight", amount: "9 kg" })).toEqual([
      "Bay",
      "k-9",
      "Mon Jun 8 · 9:00a · note",
      "Load · Weight in all: 9 kg",
    ]);
    expect(memberLineWords("Bay", "k-9", [], null)).toEqual(["Bay", "k-9"]);
  });

  it("words a cut bar with the rows' top", () => {
    expect(rowCutWords("55 kg")).toBe("The rows cut this bar at 55 kg.");
  });

  it("says fold and open for a section and for a line, never unfold, close, expand or collapse, and never what to conclude", () => {
    const sections = [...rowsFoldWords("Squad", 3), ...rowWords("Squad", "Alpha", kinds, null), ...restRowWords("Stop", "Squad", kinds)];
    const lines = [...rowOpenWords("Alpha", "Bay", false), ...rowOpenWords("Alpha", "Bay", true), ...memberLineWords("Bay", "k", [], null)];
    for (const s of [...sections, ...lines]) expect(s).not.toMatch(/\b(unfold|close|closed|expand|collapse)/i);
    expect(rowsFoldWords("Squad", 3)[1]).toMatch(/\bfold\b.*\bopen\b/i);
    expect(rowOpenWords("Alpha", "Bay", true)[1]).toMatch(/\bfold\b/i);
    expect(rowOpenWords("Alpha", "Bay", false)[1]).toMatch(/\bopen\b/i);
    for (const s of [...sections, ...lines]) expect(s).not.toMatch(/suspicious|fraud|risk|anomal|bad|unusual/i);
  });
});

describe("rows.ts source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, "rows.ts"), "utf8");

  it("holds no word of one pack and no zone or clock", () => {
    for (const word of ["org_id", "org_name", "merchant_name", "credential_id", "API key", "Organisation", "Merchant", "network", "Houston", "America/Chicago", "Date.now"]) {
      expect(source).not.toContain(word);
    }
  });
});
