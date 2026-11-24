/**
 * The record window's words, pinned as literals.
 * Every name and label is at most three words, every tooltip and state line is one sentence, and no
 * string holds a long dash. The middle dot is built from its code point.
 */
import { describe, it, expect } from "vitest";
import * as W from "./record-window";

const MID = String.fromCharCode(0xb7);
const DASHES = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];

const collect = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) collect(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) collect(x, out);
  return out;
};
const words = (s: string): number => s.trim().split(/\s+/).length;
const oneSentence = (s: string): boolean => /^[^.\n]+\.$/.test(s);

describe("record window words, pinned to the plan", () => {
  it("the opener in the Inspector's header", () => {
    expect(W.OPENER).toEqual({
      name: "Open your mark",
      tip: "Open your window for this record, with its pin, your mark and your notes.",
    });
  });

  it("the title is the record id, a middle dot and Your mark", () => {
    expect(W.MID).toBe(MID);
    expect(W.WINDOW_TITLE("rs-0002")).toBe(`rs-0002 ${MID} Your mark`);
    expect(W.WINDOW_TITLE("rs-0002")).toHaveLength(19);
  });

  it("the frame's pin is the record's pin: a name and a tooltip for each state", () => {
    expect(W.PIN.unpinned).toEqual({
      name: "Pin the record",
      tip: "Pin the record so it stays drawn, leads your marks and keeps this window open.",
    });
    expect(W.PIN.pinned).toEqual({
      name: "Unpin the record",
      tip: "Unpin the record; the next window opened then replaces this one.",
    });
  });

  it("the group of three buttons and their tooltips", () => {
    expect(W.GROUP).toEqual({ name: "Your mark", tip: "Your own mark on this record, which the app never sets." });
    expect(W.pressTip("PASS")).toBe("Mark this record PASS.");
    expect(W.pressTip("FAIL")).toBe("Mark this record FAIL.");
    expect(W.pressTip("WAITING")).toBe("Mark this record WAITING.");
    expect(W.heldTip("PASS")).toBe("Your mark is PASS; press again to clear it.");
    expect(W.heldTip("WAITING")).toBe("Your mark is WAITING; press again to clear it.");
  });

  it("the state lines", () => {
    expect(W.MISSING).toBe("This record is not in the data.");
    expect(W.STATUS).toEqual({
      backingFailed: "Not saved: the backend did not answer.",
      limitReached: "Not saved: this scenario is at its limit of marked records.",
      refused: "Not saved: the backend refused it.",
      categoryLimit: "Not saved: the list is at its limit of fail categories.",
    });
  });

  // Four of these rows do not say "for this scenario": a typed Fail category is shared by every
  // story, so a sentence that names one scenario would be false.
  it("the Fail category list's words", () => {
    expect(W.FAIL_CATEGORY).toEqual({ name: "Fail category", tip: "The category of your FAIL mark." });
    expect(W.TYPE_ROW).toEqual({ name: "Type a category", tip: "Type a category of your own." });
    expect(W.STORY_WORD_TIP).toBe("An outcome word of a FAIL decision in the data.");
    expect(W.TYPED_TIP).toBe("A category you typed.");
    expect(W.CHOSEN_TIP).toBe("Your chosen category; press again to clear it.");
    expect(W.NONE_CHOSEN).toBe("-");
    expect(W.FIELD_TIP).toBe("The name of a new fail category.");
    expect(W.ADD_TIP).toBe("Add this name to the list and choose it.");
    expect(W.CANCEL_TIP).toBe("Close the field and keep the list as it is.");
  });

  it("no Fail category word names one scenario, since the typed list is shared by every story", () => {
    const all = [...collect(W.FAIL_CATEGORY), ...collect(W.TYPE_ROW), W.STORY_WORD_TIP, W.TYPED_TIP, W.CHOSEN_TIP,
      W.FIELD_TIP, W.ADD_TIP, W.CANCEL_TIP, W.STATUS.categoryLimit];
    for (const s of all) expect(/scenario/i.test(s), s).toBe(false);
  });

  it("every name and label is at most three words", () => {
    const labels = [W.OPENER.name, W.PIN.unpinned.name, W.PIN.pinned.name, W.GROUP.name, W.FAIL_CATEGORY.name, W.TYPE_ROW.name];
    for (const l of labels) expect(words(l), l).toBeLessThanOrEqual(3);
  });

  it("every tooltip and state line is one sentence", () => {
    const sentences = [
      W.OPENER.tip,
      W.PIN.unpinned.tip,
      W.PIN.pinned.tip,
      W.GROUP.tip,
      W.pressTip("PASS"),
      W.heldTip("PASS"),
      W.MISSING,
      ...Object.values(W.STATUS),
      W.FAIL_CATEGORY.tip,
      W.TYPE_ROW.tip,
      W.STORY_WORD_TIP,
      W.TYPED_TIP,
      W.CHOSEN_TIP,
      W.FIELD_TIP,
      W.ADD_TIP,
      W.CANCEL_TIP,
    ];
    for (const s of sentences) expect(oneSentence(s), s).toBe(true);
  });

  it("no string holds a long dash", () => {
    const all = [...collect(W.OPENER), ...collect(W.PIN), ...collect(W.GROUP), ...collect(W.STATUS), W.MISSING,
      W.WINDOW_TITLE("x"), W.pressTip("PASS"), W.heldTip("PASS"), ...collect(W.FAIL_CATEGORY), ...collect(W.TYPE_ROW),
      W.STORY_WORD_TIP, W.TYPED_TIP, W.CHOSEN_TIP, W.NONE_CHOSEN, W.FIELD_TIP, W.ADD_TIP, W.CANCEL_TIP];
    for (const s of all) for (const d of DASHES) expect(s.includes(d), s).toBe(false);
  });
});
