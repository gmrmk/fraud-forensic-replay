import { describe, it, expect } from "vitest";
import { COLOUR_CSS, colourCss, colourSlot } from "./colours";
import { COLOUR_SLOTS } from "./types";

describe("colours: a slot name becomes CSS only through one fixed table", () => {
  it("the table names the six slots and nothing else", () => {
    expect(Object.keys(COLOUR_CSS).sort()).toEqual([...COLOUR_SLOTS].sort());
  });
  it("maps each slot to the on-panel variable of the active palette", () => {
    expect(COLOUR_CSS).toEqual({
      r0: "var(--r0-on-panel)",
      r1: "var(--r1-on-panel)",
      r2: "var(--r2-on-panel)",
      r3: "var(--r3-on-panel)",
      r4: "var(--r4-on-panel)",
      muted: "var(--text-faint-on-panel)",
    });
  });
  it("every value is a bare var() reference: no url, no hex, no free text", () => {
    for (const v of Object.values(COLOUR_CSS)) expect(v).toMatch(/^var\(--[a-z0-9-]+\)$/);
  });
  it("returns the table value for a slot", () => {
    for (const s of COLOUR_SLOTS) expect(colourCss(s)).toBe(COLOUR_CSS[s]);
    expect(colourSlot("r2")).toBe("r2");
  });
  it("returns null for anything else, including names an object inherits", () => {
    for (const v of ["url(https://x.test/a.png)", "#fff", "red", "R1", "", "constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", 5, null, undefined, {}, ["r1"]]) {
      expect(colourSlot(v)).toBeNull();
      expect(colourCss(v)).toBeNull();
    }
  });
});
