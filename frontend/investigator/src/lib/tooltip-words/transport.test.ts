// frontend/investigator/src/lib/tooltip-words/transport.test.ts
// The words of the transport's tooltips (skip to start, slower, play, pause, faster, the speed and
// the clock's switch). Each sentence is pinned as written under the
// Simplified Technical English rules as the Wikipedia article states them.
import { describe, expect, it } from "vitest";
import { SPEED_CHIPS } from "../../components/timeline/speed-chips";
import source from "./transport.ts?raw";
import { clockSwitch, faster, pause, play, slower, speed, toStart } from "./transport";

// Built from code points, so that this file holds no dash of either kind.
const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const TIMES = String.fromCodePoint(0xd7);

const ALL = (): string[] => [
  ...toStart(),
  ...slower(),
  ...play(60_000),
  ...pause(),
  ...faster(),
  ...speed(60_000),
  ...clockSwitch(false),
  ...clockSwitch(true),
];

describe("the transport's sentences", () => {
  it("skip to start says what it is and what it does", () => {
    expect(toStart()).toEqual(["Back to the start", "Press to move the playhead to the start of what the Timeline shows."]);
  });

  it("slower names the speeds below the current one, in the order they are taken", () => {
    expect(slower()).toEqual([
      "Slower",
      `Press to change to the next slower speed. The order is 16${TIMES}, 4${TIMES}, 1${TIMES}, 0.5${TIMES}, 0.25${TIMES}, stopped, then backwards.`,
    ]);
  });

  it("faster names the speeds above, in the order they are taken", () => {
    expect(faster()).toEqual([
      "Faster",
      `Press to change to the next faster speed. The order is 0.25${TIMES}, 0.5${TIMES}, 1${TIMES}, 4${TIMES}, 16${TIMES}.`,
    ]);
  });

  it("the speeds in both sentences are the ones the speed set holds", () => {
    // A speed added to or taken from SPEED_CHIPS changes the sentence with it.
    const positives = SPEED_CHIPS.filter((r) => r > 0);
    for (const r of positives) {
      expect(slower()[1]).toContain(`${r}${TIMES}`);
      expect(faster()[1]).toContain(`${r}${TIMES}`);
    }
    expect(positives.length).toBeGreaterThan(0);
    expect(slower()[1].indexOf(`${positives[positives.length - 1]}${TIMES}`)).toBeLessThan(
      slower()[1].indexOf(`${positives[0]}${TIMES}`),
    );
  });

  it("play and the speed say how long the case takes at 1x, from the duration they are given", () => {
    expect(play(60_000)).toEqual(["Play", `At 1${TIMES} the whole case plays in 60 seconds.`]);
    expect(speed(60_000)).toEqual(["Playback speed", `At 1${TIMES} the whole case plays in 60 seconds.`]);
    expect(play(30_000)[1]).toBe(`At 1${TIMES} the whole case plays in 30 seconds.`);
    expect(speed(1_000)[1]).toBe(`At 1${TIMES} the whole case plays in 1 second.`);
  });

  it("pause says what it does", () => {
    expect(pause()).toEqual(["Pause", "Press to stop the playhead where it is."]);
  });

  it("the clock's switch says what it is, its form now and what a press does", () => {
    expect(clockSwitch(false)).toEqual([
      "The clock's form",
      "The clock shows the 12 hour form. Press to show the 24 hour form.",
    ]);
    expect(clockSwitch(true)).toEqual([
      "The clock's form",
      "The clock shows the 24 hour form. Press to show the 12 hour form.",
    ]);
  });
});

describe("the transport's words follow the document's rules", () => {
  it("every sentence is a line of text with no dash of either kind", () => {
    for (const line of ALL()) {
      expect(line.trim().length).toBeGreaterThan(0);
      expect(line).not.toContain(EM_DASH);
      expect(line).not.toContain(EN_DASH);
    }
  });

  it("each sentence stays inside the machine-checkable rules: 20 words, no -ing form, no modal or perfect", () => {
    // Line 0 of each tooltip is a title (a label, not a sentence); the lines after it are sentences.
    const bodies = [toStart(), slower(), play(60_000), pause(), faster(), speed(60_000), clockSwitch(false), clockSwitch(true)].map(
      (lines) => lines[1],
    );
    for (const body of bodies) {
      for (const sentence of body.split(/(?<=\.) /)) {
        expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(20);
      }
      expect(body).not.toMatch(/\b\w+ing\b/);
      // "is" and "are" stay allowed: each is the main verb of its clause, not an auxiliary.
      expect(body).not.toMatch(/\b(would|could|might|should|shall|has|have|had|been|can|must|will|do|does|did)\b/i);
    }
  });

  it("says nothing of a pack, and names no state as a conclusion", () => {
    const text = ALL().join("\n");
    expect(text).not.toMatch(/api key|network|organisation|merchant|card|token|spend|usd|suspicious|fraud/i);
  });

  it("uses the pair of words the document keeps: a button is pressed, and the panel is not 'the transport'", () => {
    const text = ALL().join("\n");
    expect(text).not.toMatch(/\bclick/i);
    expect(text).not.toMatch(/\btransport\b/i);
    expect(text).not.toMatch(/\btrack\b/i);
    expect(clockSwitch(false)[1]).toContain("Press");
  });

  it("the file writes no zone, no duration of its own and no clock", () => {
    expect(source).not.toContain("America/Chicago");
    expect(source).not.toMatch(/60_?000/);
    expect(source).not.toMatch(/Date\.now|setInterval|setTimeout|performance\.now/);
  });
});
