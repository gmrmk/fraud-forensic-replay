// frontend/investigator/src/lib/tooltip-words/globe.test.ts
// The words of the globe's tooltip when several marks lie at one place. A tooltip
// says what a thing is and its values, never what to conclude. Both lines are labels with values
// (a title with a count, and a kind with a count and an amount), so they hold no sentence and keep
// their words; the lines of a single mark are the record's own lines from time-words.ts.
import { describe, expect, it } from "vitest";
import { globeKindLine, globeManyTitle } from "./globe";

describe("globeManyTitle", () => {
  it("counts the marks at the place", () => {
    expect(globeManyTitle(2)).toBe("2 marks at this place");
    expect(globeManyTitle(54)).toBe("54 marks at this place");
  });
});

describe("globeKindLine", () => {
  it("gives a kind's label and its count", () => {
    expect(globeKindLine("Authorization", 3, null)).toBe("Authorization 3");
  });

  it("adds the amount for a kind that has one, after a middle dot", () => {
    expect(globeKindLine("Token usage", 54, "22,797.25 USD")).toBe("Token usage 54 · 22,797.25 USD in all");
  });

  it("keeps a kind's label unchanged, whatever words it holds", () => {
    expect(globeKindLine("Fraud", 2, null)).toBe("Fraud 2");
  });
});

describe("the lines are labels", () => {
  it("hold no full stop, no dash and no verdict word", () => {
    const lines = [globeManyTitle(5), globeKindLine("Login", 4, null), globeKindLine("Spend", 2, "10 USD")];
    for (const line of lines) {
      expect(line).not.toMatch(/\./);
      expect(line).not.toContain(String.fromCodePoint(0x2013));
      expect(line).not.toContain(String.fromCodePoint(0x2014));
      expect(line).not.toMatch(/suspect|likely|probably|risk/i);
    }
  });
});
