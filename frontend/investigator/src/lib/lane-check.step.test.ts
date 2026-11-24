/**
 * The lanes section on a pack with no place.
 * Such a pack opens with the playhead on the last instant of the case and nothing selected, so the step
 * key `.` has nothing after it and selects nothing; the crawl then waited for an address that never
 * came. `stepKey` says which key chooses a record, `inapplicableLegs` says which leg of the bar rule a
 * page cannot give, and `passNote` prints that leg with its reason. The crawl itself needs a served
 * site and is run separately; its pins read code lines only.
 */
import { describe, expect, it } from "vitest";
import crawlSource from "../../scripts/static-crawl.mjs?raw";
import { codeOf, holdsToken } from "./code-text";
import { inapplicableLegs, passNote, stepKey } from "../../scripts/lane-check.mjs";

const END = 1_794_387_600_000;

describe("stepKey", () => {
  it("steps back when the playhead is at the end of the case and nothing is selected", () => {
    expect(stepKey({ now: END, max: END, selected: false })).toBe(",");
  });

  it("keeps the forward key whenever a record is selected, as the packs that have a place open", () => {
    expect(stepKey({ now: END, max: END, selected: true })).toBe(".");
    expect(stepKey({ now: END - 1, max: END, selected: true })).toBe(".");
  });

  it("keeps the forward key when the playhead is before the end", () => {
    expect(stepKey({ now: END - 1, max: END, selected: false })).toBe(".");
  });

  it("keeps the forward key when the slider's numbers were not read", () => {
    expect(stepKey({ now: Number.NaN, max: END, selected: false })).toBe(".");
    expect(stepKey({ now: END, max: Number.NaN, selected: false })).toBe(".");
  });
});

describe("inapplicableLegs", () => {
  it("names the marker leg, with its reason, when every reading is of a record with no place", () => {
    expect(inapplicableLegs([{ placed: false }, { placed: false }, { placed: false }])).toEqual([
      { leg: "selected marker", reason: "the selected record has no place" },
    ]);
  });

  it("names none when any reading has a place or does not know it, or when none was read", () => {
    expect(inapplicableLegs([{ placed: false }, { placed: true }])).toEqual([]);
    expect(inapplicableLegs([{ placed: false }, { placed: null }])).toEqual([]);
    expect(inapplicableLegs([{ placed: false }, null])).toEqual([]);
    expect(inapplicableLegs([])).toEqual([]);
  });
});

describe("passNote with a leg that does not apply", () => {
  const skipped = inapplicableLegs([{ placed: false }]);

  it("counts the legs that held without it, and says why it was not judged", () => {
    expect(passNote([], skipped)).toBe("bar covers: three legs held, the selected marker leg does not apply (the selected record has no place)");
  });

  it("counts a waiting leg and a leg that does not apply apart", () => {
    const waits = [{ rule: "bar-covers-nothing", leg: "map credit", reason: "x" }];
    expect(passNote(waits, skipped)).toBe("bar covers: two legs held, one waits, the selected marker leg does not apply (the selected record has no place)");
  });

  it("is the line it was for a page that gives every leg", () => {
    expect(passNote([])).toBe("bar covers: four legs held");
    expect(passNote([], [])).toBe("bar covers: four legs held");
  });
});

describe("the crawl's lanes reader", () => {
  const body = (from: string, to: string) => codeOf(crawlSource.slice(crawlSource.indexOf(from), crawlSource.indexOf(to)));

  it("presses the key stepKey names, from the slider's own numbers and whether an Inspector is in the page", () => {
    const text = body("async function gatherBar", "async function crawlLanes");
    expect(text).toContain("page.keyboard.press(stepKey(");
    expect(holdsToken(text, "aria-valuemax")).toBe(true);
    expect(holdsToken(text, "aside[aria-label=\"Inspector\"]")).toBe(true);
    expect(holdsToken(text, "page.keyboard.press('.')")).toBe(false);
  });

  it("presses the step key only when no record is selected, so a story that opens on a record is read as it opens", () => {
    const text = body("async function gatherBar", "async function crawlLanes");
    expect(text).toContain("if (!slider.selected) await page.keyboard.press(stepKey(");
  });

  it("prints the leg that does not apply in the section's line, from every reading the section took", () => {
    const text = body("async function crawlLanes", "async function crawlCustomerAlone");
    expect(holdsToken(text, "inapplicableLegs(")).toBe(true);
    expect(text.split("passNote(waits, ").length - 1).toBe(2);
    expect(holdsToken(text, "passNote(waits)")).toBe(false);
  });

  it("takes the pointer off the bar before each click that follows a layout change", () => {
    const text = body("async function foldRows", "async function crawlLanes");
    expect(holdsToken(text, "clickClear")).toBe(true);
    expect(text).not.toMatch(/\.click\(\)/);
    expect(body("const clickClear", "const addControls")).toContain("page.mouse.move(0, 0)");
  });

  it("stays under the file cap", () => {
    expect(crawlSource.split("\n").length).toBeLessThan(800);
  });
});
