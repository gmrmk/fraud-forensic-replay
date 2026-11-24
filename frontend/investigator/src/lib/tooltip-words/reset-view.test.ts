// frontend/investigator/src/lib/tooltip-words/reset-view.test.ts
// The words of the reset button's tooltip. A title that says
// what the button is, then one instruction written to the Simplified Technical English rules as the
// Wikipedia article states them: an imperative, no auxiliary verb, no
// -ing form, active voice, at most 20 words. The tooltip says what the thing does, never what to
// conclude.
import { describe, expect, it } from "vitest";
import source from "./reset-view.ts?raw";
import { resetViewWords } from "./reset-view";

// Built from code points, so that this file holds no dash of either kind.
const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);

describe("the reset button's sentences", () => {
  it("name the button, then say what a press does", () => {
    expect(resetViewWords()).toEqual([
      "Reset view",
      "Press to move the globe back to the opening view of this case.",
    ]);
  });

  it("title matches the button's accessible name", () => {
    expect(resetViewWords()[0]).toBe("Reset view");
  });

  it("the instruction is one sentence of at most 20 words, with no auxiliary verb and no -ing form", () => {
    const sentence = resetViewWords()[1];
    expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(20);
    expect(sentence.match(/\./g)).toHaveLength(1);
    expect(sentence.endsWith(".")).toBe(true);
    expect(sentence).not.toMatch(/\b(will|would|should|can|could|may|might|must|is|are|was|were|be|been|being|has|have|had|do|does|did)\b/i);
    // "opening view" is the project's name for the camera a case starts on: an -ing form as a modifier
    // in a technical noun, which rule R6 allows. No other -ing form is there.
    expect(sentence.replace(/\bopening view\b/g, "")).not.toMatch(/\b\w+ing\b/i);
  });

  it("hold no dash of either kind and no word that says what to conclude", () => {
    for (const line of resetViewWords()) {
      expect(line).not.toContain(EM_DASH);
      expect(line).not.toContain(EN_DASH);
      expect(line).not.toMatch(/suspect|likely|probably|risk|fraud/i);
    }
    expect(source).not.toContain(EM_DASH);
    expect(source).not.toContain(EN_DASH);
  });

  it("hold no word of one pack: the opening view is whatever the case's home is", () => {
    expect(resetViewWords().join(" ")).not.toMatch(/houston|lagos|card|marcus|priya/i);
  });
});
