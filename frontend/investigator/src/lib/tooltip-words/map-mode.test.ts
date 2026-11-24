// frontend/investigator/src/lib/tooltip-words/map-mode.test.ts
// The words of the button that flips the map between the globe and the flat map: for each shape, a
// title that names where a press goes, then one sentence that says what a press does.
import { describe, expect, it } from "vitest";
import source from "./map-mode.ts?raw";
import { mapModeWords } from "./map-mode";

// Built from code points, so that this file holds no dash of either kind.
const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);

describe("the map shape button's words", () => {
  it("on the globe, name the flat map and say what a press does", () => {
    expect(mapModeWords("globe")).toEqual(["Flat map", "Press to show the map flat."]);
  });

  it("on the flat map, name the globe and say what a press does", () => {
    expect(mapModeWords("flat")).toEqual(["Globe", "Press to show the map as a globe."]);
  });

  it("give two lines for each shape, and the two titles differ", () => {
    expect(mapModeWords("globe")).toHaveLength(2);
    expect(mapModeWords("flat")).toHaveLength(2);
    expect(mapModeWords("globe")[0]).not.toBe(mapModeWords("flat")[0]);
  });

  it("hold no dash of either kind", () => {
    for (const line of [...mapModeWords("globe"), ...mapModeWords("flat")]) {
      expect(line).not.toContain(EM_DASH);
      expect(line).not.toContain(EN_DASH);
    }
    expect(source).not.toContain(EM_DASH);
    expect(source).not.toContain(EN_DASH);
  });
});
