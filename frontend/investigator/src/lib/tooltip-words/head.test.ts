// frontend/investigator/src/lib/tooltip-words/head.test.ts
// The sentences the head's parts say about themselves. A tooltip says what a thing
// is and its values, never what to conclude. The noun for a node and the part a fold opens are
// arguments, so no word of one pack lives here. Every sentence follows the writing rules the
// Wikipedia article on Simplified Technical English lists. R1, the
// approved dictionary, is not checked. A title line and the `hour · value` line are labels.
import { describe, expect, it } from "vitest";
import { remaining } from "../time-words";
import { barFoldWords, foldTail, foldedClockWords, headTabWords, laneFigureWords, timeLeftWords } from "./head";

const LEFT = remaining(17 * 3_600_000 + 2 * 60_000);

describe("headTabWords", () => {
  it("says what the tab is, how to move it, and the time left with its seconds", () => {
    const lines = headTabWords(LEFT, null, "event");
    expect(lines[0]).toBe("The playhead");
    expect(lines[1]).toBe("The tab shows the playhead's date and hour in Houston time. Drag the tab to move the playhead.");
    expect(lines[2]).toBe("The time from the playhead to the last event is 0 days, 17 hours, 2 minutes, 0 seconds.");
    expect(lines).toHaveLength(3);
  });

  it("takes the node noun as an argument", () => {
    expect(headTabWords(LEFT, null, "transaction")[2]).toContain("the last transaction is");
  });

  it("says which edge the tab waits at when the playhead is outside the window", () => {
    const before = headTabWords(LEFT, "before", "event");
    const after = headTabWords(LEFT, "after", "event");
    expect(before[3]).toBe("The playhead is before what the Timeline shows. The tab stays at the left edge.");
    expect(after[3]).toBe("The playhead is after what the Timeline shows. The tab stays at the right edge.");
  });
});

describe("foldedClockWords and timeLeftWords", () => {
  it("print the same digits as remaining()", () => {
    expect(foldedClockWords(LEFT, "event")).toEqual([
      "The moment being replayed",
      "The clock shows the playhead's date and hour in Houston time.",
      `The time from the playhead to the last event is ${LEFT}.`,
    ]);
    expect(timeLeftWords(LEFT, "event")).toEqual(["Time left in the case", `The time from the playhead to the last event is ${LEFT}.`]);
    expect(LEFT).toContain("17 hours, 2 minutes, 0 seconds");
  });
});

describe("barFoldWords", () => {
  it("names the Timeline when open and when folded, and says what a press does", () => {
    // INT-5b: a press on the open Timeline folds it to a line for each section on a pack with
    // sections, and to one line on a pack with none, so the words name neither.
    expect(barFoldWords(false)).toEqual(["Timeline", "Press to fold it. The clock, the whole case and the transport stay."]);
    expect(barFoldWords(true)).toEqual(["Timeline, folded to one line", "Press to open the track, the rows and the lane."]);
    expect(barFoldWords(true, "line")).toEqual(barFoldWords(true));
  });

  it("says in a line for each section what a press does there: it folds the Timeline to one line", () => {
    expect(barFoldWords(true, "stack")).toEqual(["Timeline, folded to a line for each section", "Press to fold it to one line."]);
    // A press there opens nothing, so no sentence of the stack says "open".
    expect(barFoldWords(true, "stack").join(" ")).not.toMatch(/\bopen\b/);
  });
});

describe("foldTail", () => {
  it("ends the name with the sentences of its state, naming the part by argument", () => {
    const part = "the track, the rows and the lane";
    expect(foldTail("open", part)).toBe("It is open. Press to fold the track, the rows and the lane.");
    expect(foldTail("small", part)).toBe("It is folded. It shows a small version. Press to open the track, the rows and the lane.");
    expect(foldTail("name", part)).toBe("It is folded. It shows its name alone. Press to open the track, the rows and the lane.");
  });

  it("says what each folded state of the Timeline shows, and what a press does there", () => {
    expect(foldTail("stack", "the Timeline")).toBe("It is folded. It shows a line for each section. Press to fold the Timeline to one line.");
    expect(foldTail("line", "the Timeline")).toBe("It is folded. It shows the clock, the whole case and the transport. Press to open the Timeline.");
    // The one line shows no small version of a section, so it does not say so.
    expect(foldTail("line", "the Timeline")).not.toContain("small version");
  });
});

describe("laneFigureWords", () => {
  it("names the lane, then the hour and the value", () => {
    expect(laneFigureWords("Lane A", "Mon Jun 8 · 5:00p to 6:00p", "4,061.71 units")).toEqual([
      "Lane A at the playhead",
      "Mon Jun 8 · 5:00p to 6:00p · 4,061.71 units",
    ]);
  });
});

// The part of the writing rules a script can see: R8 length (20 words in an instruction, 25 in a
// description), R6 no -ing form, R4 and R5 no modal or auxiliary verb, and no dash. The title
// line of a call and its `hour · value` line are labels, so a line is a sentence line when it ends
// with a full stop.
describe("the writing rules a script can check", () => {
  const PART = "the track, the rows and the lane";
  const calls: string[][] = [
    headTabWords(LEFT, null, "event"),
    headTabWords(LEFT, "before", "transaction"),
    headTabWords(LEFT, "after", "event"),
    foldedClockWords(LEFT, "event"),
    timeLeftWords(LEFT, "event"),
    barFoldWords(false),
    barFoldWords(true),
    barFoldWords(true, "stack"),
    [foldTail("open", PART), foldTail("small", PART), foldTail("name", PART), foldTail("stack", PART), foldTail("line", PART)],
  ];
  const sentences = calls
    .flat()
    .filter((line) => line.endsWith("."))
    .flatMap((line) => line.split(/(?<=\.)\s+/));
  const words = (s: string): number => s.trim().split(/\s+/).length;

  it("finds the sentences to check", () => {
    expect(sentences.length).toBeGreaterThanOrEqual(20);
    expect(sentences).toContain("Drag the tab to move the playhead.");
  });

  it("holds every sentence to R8, R6, R4 and R5, and uses no dash", () => {
    const dashes = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
    for (const s of sentences) {
      const instruction = /^(Press|Drag)\b/.test(s);
      expect(words(s), s).toBeLessThanOrEqual(instruction ? 20 : 25);
      expect(s, s).not.toMatch(/\b\w+ing\b/i);
      expect(s, s).not.toMatch(/\b(would|could|should|might|shall|can|must|may|has|have|had|do|does|did|been|being)\b/i);
      for (const dash of dashes) expect(s).not.toContain(dash);
    }
  });
});
