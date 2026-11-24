import { describe, expect, it } from "vitest";
import { textSizeWords } from "./text-size";

const words = (s: string): number => s.trim().split(/\s+/).length;

describe("the text size sentences", () => {
  it("name each part on line 1, with no full stop", () => {
    expect(textSizeWords("smaller", 100)[0]).toBe("Smaller text");
    expect(textSizeWords("larger", 100)[0]).toBe("Larger text");
    expect(textSizeWords("figure", 112)[0]).toBe("Text size");
  });
  it("say what a press does and the next size", () => {
    expect(textSizeWords("smaller", 100)[1]).toBe("Press to make the text smaller. The next size is 90 percent.");
    expect(textSizeWords("larger", 100)[1]).toBe("Press to make the text larger. The next size is 112 percent.");
    expect(textSizeWords("larger", 90)[1]).toBe("Press to make the text larger. The next size is 100 percent.");
  });
  it("say the end of the range in one description", () => {
    expect(textSizeWords("smaller", 90)[1]).toBe("The text is at its smallest size, 90 percent.");
    expect(textSizeWords("larger", 125)[1]).toBe("The text is at its largest size, 125 percent.");
  });
  it("describe the figure", () => {
    expect(textSizeWords("figure", 112)[1]).toBe("The text is at 112 percent of the default size.");
  });
  it("keep every sentence at 20 words or fewer, with no dash, no symbol for a unit and no modal", () => {
    for (const part of ["smaller", "larger", "figure"] as const) {
      for (const size of [90, 100, 112, 125] as const) {
        const [, line] = textSizeWords(part, size);
        for (const sentence of line.split(/(?<=\.)\s+/)) expect(words(sentence)).toBeLessThanOrEqual(20);
        expect(line).not.toMatch(new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "%]|\\b(should|would|could|may|might|can|will|must)\\b|ing\\b"));
      }
    }
  });
});
