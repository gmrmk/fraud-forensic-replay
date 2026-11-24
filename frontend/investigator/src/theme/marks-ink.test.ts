// frontend/investigator/src/theme/marks-ink.test.ts
//
// Marks ink: the ribbon and the band take the ink form of
// their palette colour, the form legibleOnPanel gives for the record's target.
//
// The nine hexes in RECORD are literals recorded when the form was chosen; they are NOT derived from tokens.ts, so a later change to the
// target or the surface turns this red. The other nine cells, and r3 and textFaint, have no
// recorded value: for those the test pins the rule (the one call, and that it reads at the target
// or is the slot itself), not a hex.
import { describe, expect, it } from "vitest";
import { COLOR_MODES, THEMES, type ColorMode, type Theme } from "./axes";
import { paletteToCssBlock } from "./css-gen";
import { contrastRatio, legibleOnPanel } from "./legibility";
import { hexToRgb01, hexToRgbTriplet } from "./to-rgb";
import { PALETTES, RIBBON_SURFACE, RIBBON_TARGET, marksInkOf } from "./tokens";

type Cell = { theme: Theme; color: ColorMode };

/** The record's C values: ribbon ordinary and band auth (r1), band login (r2), ribbon alarm and band fraud (alarm). */
const RECORD: { cell: Cell; r1: string; r2: string; alarm: string }[] = [
  { cell: { theme: "light", color: "neon" }, r1: "#00535c", r2: "#910e6a", alarm: "#971a14" },
  { cell: { theme: "light", color: "deuteranopia" }, r1: "#31446b", r2: "#4b4d53", alarm: "#971a14" },
  { cell: { theme: "dark", color: "neon" }, r1: "#00e5ff", r2: "#ff5ce8", alarm: "#ff5548" },
];

const SLOTS = ["r1", "r2", "r3", "alarm", "textFaint"] as const;

describe("the marks' ink target and surface", () => {
  it("the target is the record's 5.5", () => {
    expect(RIBBON_TARGET).toBe(5.5);
  });

  it("the surface is the record's glass reading, per theme", () => {
    expect(RIBBON_SURFACE.light.toLowerCase()).toBe("#cfd4db");
    expect(RIBBON_SURFACE.dark.toLowerCase()).toBe("#111824");
  });
});

describe("the built ink equals the record's value for C", () => {
  for (const { cell, r1, r2, alarm } of RECORD) {
    it(`${cell.theme} ${cell.color}: r1 ${r1}, r2 ${r2}, alarm ${alarm}`, () => {
      const ink = marksInkOf(PALETTES[cell.theme][cell.color]);
      expect(ink.r1.toLowerCase()).toBe(r1);
      expect(ink.r2.toLowerCase()).toBe(r2);
      expect(ink.alarm.toLowerCase()).toBe(alarm);
    });
  }
});

describe("the rule, in every theme and palette", () => {
  for (const theme of THEMES) {
    for (const color of COLOR_MODES) {
      it(`${theme} ${color}: each slot is legibleOnPanel at the target, and reads it or is the slot itself`, () => {
        const p = PALETTES[theme][color];
        const ink = marksInkOf(p);
        const surface = hexToRgb01(RIBBON_SURFACE[theme]);
        const slotHex: Record<(typeof SLOTS)[number], string> = {
          r1: p.ramp.r1,
          r2: p.ramp.r2,
          r3: p.ramp.r3,
          alarm: p.alarm,
          textFaint: p.neutral.textFaint,
        };
        for (const slot of SLOTS) {
          expect(ink[slot], `${slot}`).toBe(legibleOnPanel(slotHex[slot], surface, RIBBON_TARGET));
          const reads = contrastRatio(hexToRgb01(ink[slot]), surface);
          const isSlot = ink[slot].toLowerCase() === slotHex[slot].toLowerCase();
          const isExtreme = /^#(000000|ffffff)$/i.test(ink[slot]);
          expect(reads >= RIBBON_TARGET || isSlot || isExtreme, `${slot} reads ${reads.toFixed(2)}`).toBe(true);
        }
      });
    }
  }

  it("the ink moves the light neon ribbon colour (the point of the pick) and leaves dark neon's alone", () => {
    expect(marksInkOf(PALETTES.light.neon).r1.toLowerCase()).not.toBe(PALETTES.light.neon.ramp.r1.toLowerCase());
    expect(marksInkOf(PALETTES.dark.neon).r1.toLowerCase()).toBe(PALETTES.dark.neon.ramp.r1.toLowerCase());
    expect(marksInkOf(PALETTES.light.deuteranopia).r1.toLowerCase()).toBe(
      PALETTES.light.deuteranopia.ramp.r1.toLowerCase(),
    );
  });
});

describe("the theme emits the ink as rgb triplets the marks read", () => {
  for (const theme of THEMES) {
    for (const color of COLOR_MODES) {
      it(`${theme} ${color}: --<slot>-mark-rgb for r1, r2, r3, alarm and text-faint`, () => {
        const p = PALETTES[theme][color];
        const block = paletteToCssBlock(p);
        const ink = marksInkOf(p);
        expect(block).toContain(`--r1-mark-rgb: ${hexToRgbTriplet(ink.r1)};`);
        expect(block).toContain(`--r2-mark-rgb: ${hexToRgbTriplet(ink.r2)};`);
        expect(block).toContain(`--r3-mark-rgb: ${hexToRgbTriplet(ink.r3)};`);
        expect(block).toContain(`--alarm-mark-rgb: ${hexToRgbTriplet(ink.alarm)};`);
        expect(block).toContain(`--text-faint-mark-rgb: ${hexToRgbTriplet(ink.textFaint)};`);
      });
    }
  }

  it("the light neon block carries the record's teal for the ribbon (0 83 92)", () => {
    expect(paletteToCssBlock(PALETTES.light.neon)).toContain("--r1-mark-rgb: 0 83 92;");
  });
});
