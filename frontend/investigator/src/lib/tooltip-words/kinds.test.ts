// frontend/investigator/src/lib/tooltip-words/kinds.test.ts
// The sentences the Timeline's kind lines say about themselves. The rules are the
// Simplified Technical English rules as the Wikipedia article states them,
// checked here in the part a script can check: a full stop, at most 25 words, no -ing form, no dash,
// and the one vocabulary (fold and open for a section, "event" by argument, no word the term table
// replaces). R1, the approved dictionary, is not checked, and R2 is a judgment.
import { describe, expect, it } from "vitest";
import { kindLineWords, kindsFoldName, kindsFoldWords, kindsGroupName, kindsPart, totalLabel, totalText } from "./kinds";

const NOUN = "event";

/** The lines that are sentences: the others are titles and keep their words. */
const sentences = (lines: readonly string[], titles: number): string[] => lines.slice(titles);

const ALL = [
  ...sentences(kindsFoldWords(NOUN, 417, false, null), 1),
  ...sentences(kindsFoldWords(NOUN, 417, true, null), 1),
  ...sentences(kindsFoldWords(NOUN, 3, false, "Group 2"), 1),
  ...sentences(kindLineWords("Parcel scan", 396, NOUN, null), 1),
  ...sentences(kindLineWords("Parcel scan", 3, NOUN, "Group 2"), 1),
  kindsFoldName(NOUN, 417, false),
  kindsFoldName(NOUN, 417, true),
  // The Layers switches: the ratio form, the hide line and the hidden kind line.
  ...sentences(kindsFoldWords(NOUN, 19, false, null, 99), 1),
  ...sentences(kindsFoldWords(NOUN, 3, false, "Group 2", 5), 1),
  kindsFoldName(NOUN, 19, false, 99),
  ...sentences(kindLineWords("Sign-in", 6, NOUN, null, true), 1),
  ...sentences(kindLineWords("Sign-in", 1, NOUN, "Group 2", true), 1),
];

describe("the rail's label", () => {
  it("reads the whole case with the word Total, as the owner typed it", () => {
    expect(totalText(NOUN, 417)).toBe("Total Events: 417");
  });

  it("reads in the singular for one and in the plural for none", () => {
    expect(totalText(NOUN, 1)).toBe("Total Event: 1");
    expect(totalText(NOUN, 0)).toBe("Total Events: 0");
  });

  it("takes the noun by argument, so a pack's own word shows", () => {
    expect(totalText("scan", 12)).toBe("Total Scans: 12");
  });
});

describe("the fold control's name and tooltip", () => {
  it("begins its accessible name with its visible text (WCAG 2.5.3) and ends with the state and the press", () => {
    expect(kindsFoldName(NOUN, 417, false)).toBe("Total Events: 417. It is folded. Press to open the events by kind.");
    expect(kindsFoldName(NOUN, 417, true)).toBe("Total Events: 417. It is open. Press to fold the events by kind.");
    expect(kindsFoldName(NOUN, 417, false).startsWith(totalText(NOUN, 417))).toBe(true);
  });

  it("names the part a press opens in the plural, whatever the count", () => {
    expect(kindsPart(NOUN)).toBe("the events by kind");
  });

  it("gives a title, what the count covers, then what a press does", () => {
    expect(kindsFoldWords(NOUN, 417, false, null)).toEqual([
      "Total Events: 417",
      "The count covers the whole case.",
      "Press to open the events by kind.",
    ]);
    expect(kindsFoldWords(NOUN, 417, true, null)[2]).toBe("Press to fold the events by kind.");
  });

  it("says that the count is the row's own while a row is alone, and names no row in it", () => {
    const lines = kindsFoldWords(NOUN, 3, false, "Group 2");
    expect(lines[1]).toBe("The count covers the row that is alone.");
    expect(lines.join("\n")).not.toContain("Group 2");
  });

  it("titles the list the control opens", () => {
    expect(kindsGroupName(NOUN)).toBe("Events by kind");
  });
});

describe("a kind line's tooltip", () => {
  it("has the manifest's label, unchanged, for its title", () => {
    expect(kindLineWords("Fraud", 7, NOUN, null)[0]).toBe("Fraud");
  });

  it("gives the kind's count for the case, and says the track draws the same events", () => {
    expect(kindLineWords("Parcel scan", 396, NOUN, null)).toEqual([
      "Parcel scan",
      "This kind has 396 events in the case.",
      "The track draws the same events.",
    ]);
  });

  it("reads in the singular for one event", () => {
    expect(kindLineWords("Parcel scan", 1, NOUN, null)[1]).toBe("This kind has 1 event in the case.");
  });

  it("counts the row's own events while a row is alone", () => {
    expect(kindLineWords("Parcel scan", 3, NOUN, "Group 2")[1]).toBe("This kind has 3 events in the row that is alone.");
  });
});

describe("the Layers switches in the control's words", () => {
  it("reads shown over all while the switches hide events, the plural following the total", () => {
    expect(totalText(NOUN, 19, 99)).toBe("Total Events: 19 / 99");
    expect(totalText(NOUN, 1, 99)).toBe("Total Events: 1 / 99");
    expect(totalText(NOUN, 0, 99)).toBe("Total Events: 0 / 99");
  });

  it("reads today's text when nothing is hidden, with the total given or not", () => {
    expect(totalText(NOUN, 417, 417)).toBe("Total Events: 417");
    expect(totalText(NOUN, 417)).toBe("Total Events: 417");
  });

  it("adds the hide line to the tooltip and says what the switches hid", () => {
    expect(kindsFoldWords(NOUN, 19, false, null, 99)).toEqual([
      "Total Events: 19 / 99",
      "The count covers the whole case.",
      "The Layers menu hides 80 of the 99 events.",
      "Press to open the events by kind.",
    ]);
    expect(kindsFoldWords(NOUN, 3, false, "Group 2", 5)[2]).toBe("The Layers menu hides 2 of the 5 events.");
  });

  it("leaves the tooltip as it was when nothing is hidden", () => {
    expect(kindsFoldWords(NOUN, 417, false, null, 417)).toEqual(kindsFoldWords(NOUN, 417, false, null));
    expect(kindsFoldWords(NOUN, 417, false, null)).toHaveLength(3);
  });

  it("begins the accessible name with the visible ratio", () => {
    expect(kindsFoldName(NOUN, 19, false, 99)).toBe("Total Events: 19 / 99. It is folded. Press to open the events by kind.");
    expect(kindsFoldName(NOUN, 19, true, 99).startsWith(totalText(NOUN, 19, 99))).toBe(true);
  });

  it("gives a hidden kind line two lines: the name, then what the track draws", () => {
    expect(kindLineWords("Sign-in", 6, NOUN, null, true)).toEqual(["Sign-in", "The track draws 6 events of this kind."]);
    expect(kindLineWords("Sign-in", 1, NOUN, "Group 2", true)[1]).toBe("The track draws 1 event of this kind in the row that is alone.");
  });

  it("keeps today's three lines for a kind line when `hidden` is omitted or false", () => {
    expect(kindLineWords("Parcel scan", 396, NOUN, null)).toHaveLength(3);
    expect(kindLineWords("Parcel scan", 396, NOUN, null, false)).toEqual(kindLineWords("Parcel scan", 396, NOUN, null));
  });
});

describe("the rail's drawn label", () => {
  it("reads exactly what totalText reads while nothing is hidden", () => {
    expect(totalLabel(NOUN, 231, 231)).toBe("Total Events: 231");
    expect(totalLabel(NOUN, 231)).toBe("Total Events: 231");
    expect(totalLabel(NOUN, 231, 231)).toBe(totalText(NOUN, 231, 231));
    expect(totalLabel(NOUN, 1, 1)).toBe("Total Event: 1");
    expect(totalLabel(NOUN, 0, 0)).toBe(totalText(NOUN, 0, 0));
  });

  it("drops the word Total and keeps the ratio while the switches hide events, the plural following the total", () => {
    expect(totalLabel(NOUN, 87, 231)).toBe("Events: 87 / 231");
    expect(totalLabel(NOUN, 19, 99)).toBe("Events: 19 / 99");
    expect(totalLabel(NOUN, 0, 24)).toBe("Events: 0 / 24");
    expect(totalLabel(NOUN, 0, 1)).toBe("Event: 0 / 1");
    expect(totalLabel("scan", 3, 12)).toBe("Scans: 3 / 12");
  });

  it("holds at most 19 characters for a four-digit count out of a four-digit total", () => {
    expect(totalLabel(NOUN, 1234, 5678).length).toBeLessThanOrEqual(19);
  });

  it("leaves the control's full words to totalText", () => {
    expect(totalText(NOUN, 87, 231)).toBe("Total Events: 87 / 231");
    expect(kindsFoldName(NOUN, 87, false, 231).startsWith("Total Events: 87 / 231.")).toBe(true);
    expect(kindsFoldWords(NOUN, 87, false, null, 231)[0]).toBe("Total Events: 87 / 231");
  });
});

describe("the writing rules a script can check", () => {
  it("keeps the drawn label free of an -ing form, a dash and a word the term table replaces", () => {
    for (const s of [totalLabel(NOUN, 87, 231), totalLabel(NOUN, 231, 231), totalLabel(NOUN, 0, 1)]) {
      expect(s, s).not.toMatch(/\b[a-z]+ing\b/i);
      expect(s, s).not.toMatch(new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]"));
      expect(s, s).not.toMatch(/\b(busiest|largest|dot|unfold|close|closed|moment|replay)\b/i);
    }
  });

  it("ends every sentence with a full stop and keeps each within 25 words", () => {
    for (const s of ALL) {
      expect(s.endsWith("."), s).toBe(true);
      const words = s.replace(/\d[\d,]*/g, "N").split(/\s+/).length;
      expect(words, s).toBeLessThanOrEqual(25);
    }
  });

  it("uses no -ing form, no dash and no word the term table replaces", () => {
    for (const s of ALL) {
      expect(s, s).not.toMatch(/\b[a-z]+ing\b/i);
      expect(s, s).not.toMatch(new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]"));
      expect(s, s).not.toMatch(/\b(busiest|largest|dot|unfold|close|closed|moment|replay)\b/i);
    }
  });

  it("uses fold and open for a section, and a full word for the count's noun", () => {
    expect(ALL.some((s) => /\bfold\b/.test(s))).toBe(true);
    expect(ALL.some((s) => /\bopen\b/.test(s))).toBe(true);
  });
});
