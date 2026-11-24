/**
 * The words of the Layers menu's kind, value and Yours switches: every function's exact lines, and the writing
 * rules a script can check (a full stop, at most 25 words, no long dash, no retired word, no word that
 * states a conclusion). The first line of a tooltip is a label, so the sentence rules read the lines after it.
 */
import { describe, it, expect } from "vitest";
import {
  EMPTY_VALUE,
  FACET_LABEL,
  YOURS_LABEL,
  facetWords,
  kindSwitchWords,
  moreWords,
  valueSwitchWords,
  valuesFoldWords,
  yoursFoldWords,
  yoursWords,
} from "./layers";
import { DISPOSITION_WORD } from "../marks/words";
import { YOURS_FACETS } from "../marks/types";

// The two dash characters are built from their code points so this file holds neither.
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("the kind switch's words", () => {
  it("names the row, then says what the switch does", () => {
    expect(kindSwitchWords("Sign-in")).toEqual([
      "Sign-in",
      "Shows or hides the records of this kind on the map and the Timeline.",
    ]);
  });

  it("prints the label as the manifest has it", () => {
    expect(kindSwitchWords("Limit reset")[0]).toBe("Limit reset");
    expect(kindSwitchWords("Authorizations")[0]).toBe("Authorizations");
  });
});

describe("the value switch's words", () => {
  it("names the value as the data holds it, then says whose records it shows or hides", () => {
    expect(valueSwitchWords("Sign-in", "Network type", "corporate")).toEqual([
      "corporate",
      "Shows or hides the Sign-in records whose Network type is corporate.",
    ]);
  });

  it("reads a missing value as a dash row with its own sentence", () => {
    expect(EMPTY_VALUE).toBe("-");
    expect(valueSwitchWords("Sign-in", "Network type", "")).toEqual([
      "-",
      "Shows or hides the Sign-in records with no Network type.",
    ]);
  });
});

describe("the value list's words", () => {
  it("names the chevron by kind and field, and says what a press does", () => {
    expect(valuesFoldWords("Sign-in", "Network type", false)).toEqual(["Sign-in by Network type", "Press to open the values."]);
    expect(valuesFoldWords("Sign-in", "Network type", true)).toEqual(["Sign-in by Network type", "Press to fold the values."]);
  });

  it("says how many values a press of the more row lists", () => {
    // The row is drawn only when a list is cut, which leaves two or more values behind it.
    expect(moreWords(5)).toEqual(["5 more", "Lists the other 5 values."]);
  });
});

describe("the Yours row's words", () => {
  it("names the row, then says what the switch does", () => {
    expect(YOURS_LABEL).toBe("Dispositions");
    expect(yoursWords(3, false)).toEqual(["Dispositions", "Show only the records you pinned, marked, noted or put in a path."]);
  });

  it("says nothing is held yet while the row is off and nothing is touched", () => {
    expect(yoursWords(0, false)).toEqual(["Dispositions", "Nothing is pinned, marked, noted or in a path yet."]);
  });

  it("keeps the switch's own sentence while the row is on, even with nothing touched", () => {
    expect(yoursWords(0, true)).toEqual(yoursWords(3, false));
  });

  it("names the chevron, and says what a press does", () => {
    expect(yoursFoldWords(false)).toEqual(["Dispositions", "Press to open its six switches."]);
    expect(yoursFoldWords(true)).toEqual(["Dispositions", "Press to fold its six switches."]);
  });

  it("labels the six facets, PASS, FAIL and WAITING in the disposition's own words", () => {
    expect(FACET_LABEL).toEqual({
      pinned: "Pinned",
      pass: DISPOSITION_WORD.pass,
      fail: DISPOSITION_WORD.fail,
      wait: DISPOSITION_WORD.wait,
      noted: "Noted",
      inPath: "In a path",
    });
    expect([FACET_LABEL.pass, FACET_LABEL.fail, FACET_LABEL.wait]).toEqual(["PASS", "FAIL", "WAITING"]);
  });

  it("says what each facet keeps while Dispositions is on", () => {
    expect(facetWords("pinned")).toEqual(["Pinned", "With Dispositions on, keeps the records you pinned."]);
    expect(facetWords("pass")).toEqual(["PASS", "With Dispositions on, keeps the records you marked PASS."]);
    expect(facetWords("fail")).toEqual(["FAIL", "With Dispositions on, keeps the records you marked FAIL."]);
    expect(facetWords("wait")).toEqual(["WAITING", "With Dispositions on, keeps the records you marked WAITING."]);
    expect(facetWords("noted")).toEqual(["Noted", "With Dispositions on, keeps the records your notes link to."]);
    expect(facetWords("inPath")).toEqual(["In a path", "With Dispositions on, keeps the records in your paths."]);
  });

  it("opens every facet sentence with the row's label", () => {
    for (const f of YOURS_FACETS) expect(facetWords(f)[1].startsWith(`With ${YOURS_LABEL} on, keeps `)).toBe(true);
  });
});

describe("the writing rules a script can check", () => {
  const all = [
    ...kindSwitchWords("Sign-in"),
    ...valueSwitchWords("Sign-in", "Network type", "corporate"),
    ...valueSwitchWords("Sign-in", "Network type", ""),
    ...valuesFoldWords("Sign-in", "Network type", false),
    ...valuesFoldWords("Sign-in", "Network type", true),
    ...moreWords(5),
    ...yoursWords(3, false),
    ...yoursWords(0, false),
    ...yoursFoldWords(false),
    ...yoursFoldWords(true),
    ...YOURS_FACETS.flatMap((f) => facetWords(f)),
  ];
  const sentences = [
    kindSwitchWords("Sign-in")[1],
    valueSwitchWords("Sign-in", "Network type", "corporate")[1],
    valueSwitchWords("Sign-in", "Network type", "")[1],
    valuesFoldWords("Sign-in", "Network type", false)[1],
    valuesFoldWords("Sign-in", "Network type", true)[1],
    moreWords(5)[1],
    yoursWords(3, false)[1],
    yoursWords(0, false)[1],
    yoursFoldWords(false)[1],
    yoursFoldWords(true)[1],
    ...YOURS_FACETS.map((f) => facetWords(f)[1]),
  ];

  it("ends every sentence with a full stop and keeps each within 25 words", () => {
    for (const s of sentences) {
      expect(s.endsWith("."), s).toBe(true);
      expect(s.split(/\s+/).length, s).toBeLessThanOrEqual(25);
    }
  });

  it("holds no long dash, no retired word and no word that states a conclusion", () => {
    for (const s of all) {
      expect(s, s).not.toMatch(DASH);
      expect(s, s).not.toMatch(/\b(unfold|close|closed)\b/i);
      expect(s, s).not.toMatch(/\b(fraud|suspicious|risk|cause|because)\b/i);
    }
  });

  it("calls the map the map on either shape: no line holds the word globe", () => {
    for (const s of all) expect(s, s).not.toMatch(/globe/i);
  });

  it("uses fold and open for a section", () => {
    expect(all.some((s) => /\bfold\b/.test(s))).toBe(true);
    expect(all.some((s) => /\bopen\b/.test(s))).toBe(true);
  });
});
