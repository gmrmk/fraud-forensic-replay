import { describe, it, expect } from "vitest";
import { STARTER_CATEGORIES, categoryExists, categoryList, checkCategoryName, normalizeCategoryName, sameCategory } from "./categories";
import { VISA, makeNote } from "./test-fixtures";

describe("categories", () => {
  it("starts with the five names of the design", () => {
    expect(STARTER_CATEGORIES).toEqual(["Note", "Question", "Follow up", "Source", "Context"]);
  });
  it("normalizes to NFC and trims", () => {
    expect(normalizeCategoryName("  Cafe" + String.fromCodePoint(0x0301) + "  ")).toBe("Caf" + String.fromCodePoint(0x00e9));
  });
  it("accepts 1 to 24 characters", () => {
    expect(checkCategoryName("Lead")).toEqual({ ok: true, value: "Lead" });
    expect(checkCategoryName("x".repeat(24)).ok).toBe(true);
  });
  it("refuses empty, too long, untrimmed, control and format characters, and non strings", () => {
    expect(checkCategoryName("")).toMatchObject({ ok: false, code: "bad_request" });
    expect(checkCategoryName("x".repeat(25))).toMatchObject({ ok: false, code: "too_long" });
    for (const c of [" Lead", "Lead ", "a\nb", "a" + String.fromCodePoint(0x200b), "a" + String.fromCodePoint(0x202e), 5, null, undefined]) {
      expect(checkCategoryName(c).ok).toBe(false);
    }
  });
  it("refuses a name that looks like a card number, and does not echo it", () => {
    const r = checkCategoryName("4111 1111 1111 1111");
    expect(r).toMatchObject({ ok: false, code: "card_number" });
    expect(JSON.stringify(r)).not.toContain("4111");
    expect(checkCategoryName(VISA).ok).toBe(false);
  });
  it("is unique ignoring case", () => {
    expect(sameCategory("Source", "source")).toBe(true);
    expect(sameCategory("Source", "Sources")).toBe(false);
    expect(categoryExists(["Note", "Question"], "QUESTION")).toBe(true);
    expect(categoryExists(["Note"], "Lead")).toBe(false);
  });
  it("lists starters, custom names and any name a note uses, without repeats", () => {
    const notes = [makeNote({ category: "Lead" }), makeNote({ id: "note-" + "1".repeat(32), seq: 2, category: "note" }), makeNote({ id: "note-" + "2".repeat(32), seq: 3, category: "Odd one" })];
    expect(categoryList(["Lead", "Ring"], notes)).toEqual(["Note", "Question", "Follow up", "Source", "Context", "Lead", "Ring", "Odd one"]);
    expect(categoryList([], [])).toEqual([...STARTER_CATEGORIES]);
  });
});
