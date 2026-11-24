import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { soloClearName, soloClearWords, soloWords } from "./solo";

describe("the solo words", () => {
  it("tells an ordinary row's reader what a press does", () => {
    expect(soloWords(false)).toEqual(["Press to show this row alone."]);
  });

  it("tells a soloed row's reader that it is alone and what a press does", () => {
    expect(soloWords(true)).toEqual(["This row is alone.", "Press to show every row."]);
  });

  it("names the clear control for the row's name first, so the name holds the words that are drawn", () => {
    expect(soloClearName("Ostwick Logic")).toBe("Ostwick Logic is alone. Press to show every row.");
    expect(soloClearName("Ostwick Logic").startsWith("Ostwick Logic")).toBe(true);
  });

  it("words the clear control's tooltip with the row's whole name first", () => {
    expect(soloClearWords("Ostwick Logic")).toEqual(["Ostwick Logic is alone", "Press to show every row."]);
  });

  it("uses the one vocabulary: row, alone, show, and no fold or open for a row's solo", () => {
    const all = [...soloWords(false), ...soloWords(true), ...soloClearWords("X"), soloClearName("X")].join(" ");
    expect(all).not.toMatch(/\b(fold|unfold|open|close|line|bar)\b/i);
    expect(all).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
  });

  it("keeps every sentence inside the 20 word limit of an instruction and the 25 of a description", () => {
    for (const s of [...soloWords(false), ...soloWords(true)]) expect(s.split(/\s+/).length).toBeLessThanOrEqual(20);
  });

  it("names no pack word and holds no zone or clock", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "solo.ts"), "utf8");
    expect(source).not.toMatch(/Date\.now|America\/Chicago|setTimeout|API key|Organisation|Merchant|network/);
  });
});
