/**
 * The tag menu's words (PLAN-tag-menu part 7, C1.5), pinned as literals. Every name is at most three
 * words (a name that carries a value counts its fixed part), every tooltip is one sentence, no string
 * holds a long dash (built from code points here), and none holds a stem of the conclusion list of
 * BUILD-PLAN C9.4. The strings the menu reuses (ADD_ROW.visible, OPENER, GROUP, pressTip, heldTip,
 * FAIL_CATEGORY, the STATUS lines) are not repeated in this module.
 */
import { describe, expect, it } from "vitest";
import * as W from "./tag-menu";

const DASHES = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
/** BUILD-PLAN C9.4's stems: a word on screen never states a conclusion about a record. */
const STEMS = ["fraud", "suspicious", "takeover", "compromised", "stolen", "attack", "abuse", "malicious", "anomal", "unusual", "risk", "threat", "bot"];

const words = (s: string): number => s.trim().split(/\s+/).length;
/** One sentence: one terminal period, no newline, and any clause inside it joined by a semicolon. */
const oneSentence = (s: string): boolean => /^[^.\n]+\.$/.test(s);

const everyString = (): string[] => [
  W.MENU_NAME("Key event: key viewed"),
  W.HEAD_TIP,
  W.timeLine("10:04:11"),
  W.notesLine(2),
  W.PIN_ROW.pin,
  W.PIN_ROW.unpin,
  W.PIN_TIP.pin,
  W.PIN_TIP.unpin,
  W.ADD_TIP,
  W.lockedTip("FAIL"),
  W.LIST_NAME,
  W.LIST_ROW_TIP,
];

describe("tag menu words, pinned to part 7", () => {
  it("the menu's accessible name and the head", () => {
    expect(W.MENU_NAME("Key event: key viewed")).toBe("Your mark: Key event: key viewed");
    expect(W.HEAD_TIP).toBe("The record this menu marks.");
    expect(W.timeLine("10:04:11")).toBe("Time: 10:04:11");
    expect(W.notesLine(2)).toBe("Notes: 2");
  });

  it("the pin row", () => {
    expect(W.PIN_ROW).toEqual({ pin: "Pin", unpin: "Unpin" });
    expect(W.PIN_TIP).toEqual({
      pin: "Pin the record so it stays drawn and leads your marks.",
      unpin: "Unpin the record.",
    });
  });

  it("Add a note and the lock", () => {
    expect(W.ADD_TIP).toBe("Add a note linked to this record.");
    expect(W.lockedTip("FAIL")).toBe("Your mark is FAIL; change it in your window for this record.");
    expect(W.lockedTip("WAITING")).toBe("Your mark is WAITING; change it in your window for this record.");
  });

  it("the short list's words (part D uses them; they land here)", () => {
    expect(W.LIST_NAME).toBe("Records here");
    expect(W.LIST_ROW_TIP).toBe("A record at this point; a press opens its menu.");
  });

  it("holds exactly these exports, so a word added later is added to this test too", () => {
    expect(Object.keys(W).sort()).toEqual(
      ["ADD_TIP", "HEAD_TIP", "LIST_NAME", "LIST_ROW_TIP", "MENU_NAME", "PIN_ROW", "PIN_TIP", "lockedTip", "notesLine", "timeLine"].sort(),
    );
  });
});

describe("tag menu words, checked by rule", () => {
  it("every name is at most three words (the menu's name counts its fixed part)", () => {
    expect(words(W.MENU_NAME("").replace(/:\s*$/, ""))).toBeLessThanOrEqual(3);
    for (const n of [W.PIN_ROW.pin, W.PIN_ROW.unpin, W.LIST_NAME]) expect(words(n), n).toBeLessThanOrEqual(3);
  });

  it("every tooltip is one sentence", () => {
    for (const s of [W.HEAD_TIP, W.PIN_TIP.pin, W.PIN_TIP.unpin, W.ADD_TIP, W.lockedTip("FAIL"), W.LIST_ROW_TIP]) {
      expect(oneSentence(s), s).toBe(true);
    }
  });

  it("a value line is a label, a colon and its value: no sentence, no period", () => {
    for (const s of [W.timeLine("10:04:11"), W.notesLine(2)]) {
      expect(s.includes("."), s).toBe(false);
      expect(s.includes("\n"), s).toBe(false);
    }
  });

  it("no string holds a long dash", () => {
    for (const s of everyString()) for (const d of DASHES) expect(s.includes(d), s).toBe(false);
  });

  it("every string is plain ASCII", () => {
    for (const s of everyString()) expect(/^[\x20-\x7e]*$/.test(s), s).toBe(true);
  });

  it("none holds a stem of a conclusion word", () => {
    for (const s of everyString()) for (const stem of STEMS) expect(s.toLowerCase().includes(stem), `${s} / ${stem}`).toBe(false);
  });
});
