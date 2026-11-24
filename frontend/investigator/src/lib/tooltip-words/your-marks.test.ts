/**
 * The words of the Your marks block in the Notes menu: every string is pinned, labels are plain names of
 * at most three words, a tooltip line is one sentence, and no string holds a dash character.
 */
import { describe, it, expect } from "vitest";
import { HEADING, PINNED, ROW_TIP, noteCount } from "./your-marks";

// The two dash characters are built from their code points so this file holds neither.
const EN = String.fromCharCode(0x2013);
const EM = String.fromCharCode(0x2014);
const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;

describe("Your marks words", () => {
  it("pins every string of the block", () => {
    expect(HEADING).toBe("Your marks");
    expect(ROW_TIP).toBe("A record you marked, pinned or noted.");
    expect(PINNED).toBe("Pinned");
  });

  it("counts notes: one note, then N notes", () => {
    expect(noteCount(1)).toBe("1 note");
    expect(noteCount(2)).toBe("2 notes");
    expect(noteCount(4)).toBe("4 notes");
  });

  it("labels are at most three words", () => {
    expect(words(HEADING)).toBeLessThanOrEqual(3);
    expect(words(PINNED)).toBeLessThanOrEqual(3);
  });

  it("the row tooltip is one sentence: one terminal period, no newline", () => {
    expect(ROW_TIP.endsWith(".")).toBe(true);
    expect(ROW_TIP.slice(0, -1)).not.toContain(".");
    expect(ROW_TIP).not.toContain("\n");
  });

  it("no string holds an en or em dash", () => {
    for (const s of [HEADING, ROW_TIP, PINNED, noteCount(1), noteCount(3)]) {
      expect(s.includes(EN)).toBe(false);
      expect(s.includes(EM)).toBe(false);
    }
  });
});
