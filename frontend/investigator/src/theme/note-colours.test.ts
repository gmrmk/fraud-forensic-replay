/**
 * The two new on-panel colours a note can take, --r0-on-panel and --r4-on-panel (the design,
 * section 3, Colour). Only r1, r2, r3 and the faint grey had one. Both are built with
 * legibleOnPanel as the three existing slots are, and tested in all 12 theme and colour cells
 * against the same surfaces the existing kind colours are tested on: the three panel stops with
 * the pulse tint, at 4.5 to 1. A note's mark also sits on the bar's glass, so the six slots are
 * measured there at 3 to 1 (a graphic, WCAG 1.4.11).
 */
import { describe, it, expect } from "vitest";
import { PALETTES, type ThemePalette } from "./tokens";
import { THEMES, COLOR_MODES } from "./axes";
import { contrastRatio, compositeOver } from "./legibility";
import { hexToRgb01 } from "./to-rgb";
import { paletteToCssBlock } from "./css-gen";

const triplet01 = (t: string): [number, number, number] => {
  const [r, g, b] = t.split(/\s+/).map((n) => parseInt(n, 10) / 255);
  return [r, g, b];
};
const PULSE_PEAK_ALPHA = 0.1;
const CELLS = THEMES.flatMap((t) => COLOR_MODES.map((c) => [t, c] as const));
const cssHex = (block: string, name: string): string | null => new RegExp(`${name}: (#[0-9a-fA-F]{6});`).exec(block)?.[1] ?? null;

describe("note colours: --r0-on-panel and --r4-on-panel", () => {
  it.each(CELLS)("%s %s: both are hex values in the palette", (theme, color) => {
    const op = PALETTES[theme][color].onPanel as unknown as Record<string, string>;
    expect(op.r0).toMatch(/^#[0-9a-f]{6}$/i);
    expect(op.r4).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(CELLS)("%s %s: both clear 4.5 to 1 on the three panel stops with the pulse tint", (theme, color) => {
    const p: ThemePalette = PALETTES[theme][color];
    const op = p.onPanel as unknown as Record<string, string>;
    const stops = [p.material.panelTop, p.material.panelBase, p.material.panelFloor].map(triplet01);
    const failures: string[] = [];
    for (const slot of ["r0", "r4"] as const) {
      const fg = hexToRgb01(op[slot]);
      for (const stop of stops) {
        const tinted = compositeOver(hexToRgb01(p.ramp[slot]), PULSE_PEAK_ALPHA, stop);
        const c = contrastRatio(fg, tinted);
        if (c < 4.5) failures.push(`${slot} ${c.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it.each(CELLS)("%s %s: the stylesheet block emits both, on a line of its own", (theme, color) => {
    const p = PALETTES[theme][color];
    const op = p.onPanel as unknown as Record<string, string>;
    const block = paletteToCssBlock(p);
    expect(cssHex(block, "--r0-on-panel")).toBe(op.r0);
    expect(cssHex(block, "--r4-on-panel")).toBe(op.r4);
    // The three existing on-panel variables keep their line, byte for byte.
    expect(block).toContain(`--r1-on-panel: ${p.onPanel.r1}; --r2-on-panel: ${p.onPanel.r2}; --r3-on-panel: ${p.onPanel.r3};`);
  });

  it.each(CELLS)("%s %s: the six slots a note can take read at 3 to 1 on the bar's glass", (theme, color) => {
    const p = PALETTES[theme][color];
    const m = p.material;
    const glass =
      theme === "dark"
        ? triplet01(m.panelTop)
        : compositeOver(triplet01(m.glassTint), m.glassFill, [0, 0, 0]);
    const op = p.onPanel as unknown as Record<string, string>;
    const slots = { r0: op.r0, r1: op.r1, r2: op.r2, r3: op.r3, r4: op.r4, muted: op.textFaint };
    const low = Object.entries(slots)
      .map(([k, hex]) => [k, contrastRatio(hexToRgb01(hex), glass)] as const)
      .filter(([, c]) => c < 3)
      .map(([k, c]) => `${k} ${c.toFixed(2)}`);
    expect(low).toEqual([]);
  });
});
