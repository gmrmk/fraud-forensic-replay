// frontend/investigator/src/lib/tooltip-words/bar.test.ts
// The sentences the Timeline's frame says about itself. A tooltip says what a thing
// is and gives its values, never what to conclude. The node noun, the row's name and the two
// times are arguments, so no word of one pack lives here. Every sentence follows the writing rules
// the Wikipedia article on Simplified Technical English lists. The approved dictionary is not checked. A title line has no full stop and keeps its words.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BAR_PART, caseStripWords, soloClearName, soloClearWords } from "./bar";

const words = (s: string): number => s.trim().split(/\s+/).length;
/** A sentence is a line with a full stop; a title has none. */
const sentences = (lines: readonly string[]): string[] => lines.filter((l) => l.endsWith("."));

describe("caseStripWords", () => {
  const lines = caseStripWords("event", "May 25, 12:00 AM", "Jun 4, 12:00 AM");

  it("names the strip, says what a slice counts and gives the span", () => {
    expect(lines).toEqual([
      "The whole case",
      "Each slice counts the events in one part of the case.",
      "The case runs from May 25, 12:00 AM to Jun 4, 12:00 AM.",
    ]);
  });

  it("takes the node noun as an argument", () => {
    expect(caseStripWords("transaction", "a", "b")[1]).toBe("Each slice counts the transactions in one part of the case.");
  });

  it("keeps a description to 25 words and the title free of a full stop", () => {
    expect(lines[0].endsWith(".")).toBe(false);
    for (const s of sentences(lines)) expect(words(s)).toBeLessThanOrEqual(25);
  });
});

describe("the control that clears a row that is alone", () => {
  it("has a name that begins with the row's visible name", () => {
    expect(soloClearName("Ostwick Logic")).toBe("Ostwick Logic is alone. Press to show every row.");
    expect(soloClearName("Ostwick Logic").startsWith("Ostwick Logic")).toBe(true);
  });

  it("says what a press does in one imperative of 20 words or fewer", () => {
    const lines = soloClearWords("Ostwick Logic");
    expect(lines).toEqual(["Ostwick Logic is alone", "Press to show every row."]);
    expect(words(lines[1])).toBeLessThanOrEqual(20);
  });
});

describe("the part a fold opens", () => {
  it("is the Timeline, the bar's own name", () => {
    expect(BAR_PART).toBe("the Timeline");
  });
});

describe("the file", () => {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "bar.ts"), "utf8");

  it("writes no word of one pack, no -ing form in a sentence, and no dash", () => {
    const strings = [...source.matchAll(/`([^`]*)`|"([^"\n]*)"/g)].map((m) => m[1] ?? m[2]);
    const text = strings.join(" ");
    for (const banned of ["auth", "spend", "usd", "usage", "API key", "network", "Organisation", "Merchant", "Escape"]) {
      expect(text.toLowerCase()).not.toContain(banned.toLowerCase());
    }
    // The en and em dash, built from their code points so this file holds neither.
    const dashes = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
    expect(source).not.toMatch(dashes);
  });

  it("holds no word the vocabulary replaced", () => {
    const text = [...caseStripWords("event", "a", "b"), ...soloClearWords("X"), BAR_PART].join(" ");
    for (const old of ["moment", "replay", "unfold", "solo", "the bar", "track"]) {
      expect(text.toLowerCase()).not.toContain(old);
    }
  });
});
