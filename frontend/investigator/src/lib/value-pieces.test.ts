import { describe, it, expect } from "vitest";
import { splitValue, firstPieceChars, spansText, KEEP_MAX } from "./value-pieces";

// Real strings of the four captured rules (the site's own decisions JSON).
const MID = String.fromCharCode(0xb7);
const SKIMMER =
  `4x chip-fallback-swipe - Tidewater Trust Bank ATM ${MID} Lekki / Tidewater Trust Bank ATM ${MID} Lekki / Garrmere Shopping Mall ${MID} Lekki / Heskford Lekki`;
const FACTOR = "large geographic jump from the prior swipe (geo_displacement_km=10501.92) -> +25.23 log-odds";
const CARD = "card-0080 visited 2026-05-04, 2 chip-fallback swipes 2026-05-27";
const SCORES = "940 / 942 / 967 / 981 (of 1000)";
const ALL = [
  SKIMMER, FACTOR, CARD, SCORES, "STIP - issuer offline, stand-in declined", `Alderlowe Fuel & Go ${MID} Pump 4`,
  "30/30 (100%)", "", " ", "a  b", " / ", "x / ",
];

describe("splitValue", () => {
  it.each(ALL)("gives the string back exactly, character for character: %j", (s) => {
    expect(spansText(splitValue(s))).toBe(s);
  });

  it("keeps every token that holds a hyphen whole, so a line never ends inside it", () => {
    const spans = splitValue(CARD);
    const nowrap = spans.filter((p) => p.nowrap).map((p) => p.text);
    expect(nowrap).toEqual(["card-0080", "2026-05-04,", "chip-fallback", "2026-05-27"]);
    // no plain span holds a hyphen
    for (const p of spans.filter((x) => !x.nowrap)) expect(p.text).not.toMatch(/-/);
  });

  it("keeps the arrow of a model factor whole, and a lone hyphen between spaces", () => {
    expect(splitValue(FACTOR).some((p) => p.nowrap && p.text === "->")).toBe(true);
    expect(splitValue("STIP - issuer offline").some((p) => p.nowrap && p.text === "-")).toBe(true);
  });

  it("leaves plain words as one run, so they can break at their spaces", () => {
    const spans = splitValue(`Alderlowe Fuel & Go ${MID} Pump 4`);
    expect(spans).toEqual([{ text: `Alderlowe Fuel & Go ${MID} Pump 4`, nowrap: false }]);
  });

  it("holds each item of a ' / ' list, with its trailing ' /', as one unbreakable piece", () => {
    const spans = splitValue(SCORES);
    expect(spans.filter((p) => p.nowrap).map((p) => p.text)).toEqual(["940 /", "942 /", "967 /", "981 (of 1000)"]);
    // the only breakable places are the spaces between the items
    expect(spans.filter((p) => !p.nowrap).map((p) => p.text)).toEqual([" ", " ", " "]);
  });

  it("breaks a list at ' / ' before it breaks inside an item that fits a line; an item wider than a line breaks at its spaces", () => {
    const spans = splitValue(SKIMMER);
    const nowrap = spans.filter((p) => p.nowrap).map((p) => p.text);
    expect(nowrap).toContain(`Tidewater Trust Bank ATM ${MID} Lekki /`);
    expect(nowrap).toContain(`Garrmere Shopping Mall ${MID} Lekki /`);
    expect(nowrap).toContain("Heskford Lekki");
    // the first item is longer than KEEP_MAX: its own tokens are the pieces, "chip-fallback-swipe" among them
    expect(nowrap).toContain("chip-fallback-swipe");
    expect(nowrap.every((t) => t.length <= KEEP_MAX)).toBe(true);
  });

  it("never marks a piece wider than a line unbreakable", () => {
    const long = "x".repeat(KEEP_MAX + 5) + "-" + "y".repeat(10);
    expect(splitValue(long)).toEqual([{ text: long, nowrap: false }]);
  });

  it("merges neighbouring plain runs", () => {
    expect(splitValue("a b c d")).toHaveLength(1);
  });
});

describe("firstPieceChars", () => {
  it("is the first unbreakable piece: a word, a hyphenated token, or a list item with its ' /'", () => {
    expect(firstPieceChars(CARD)).toBe("card-0080".length);
    expect(firstPieceChars("Alderlowe Fuel & Go")).toBe("Alderlowe".length);
    expect(firstPieceChars(SCORES)).toBe("940 /".length);
    expect(firstPieceChars("")).toBe(0);
  });
});
