/**
 * The plate's fitted inks (mark-ink.ts): the dim opacity is the least that still reads the target, a
 * part that cannot reach the target keeps full opacity, and the plate's inks are none at rest for a
 * plate with no decision. The ratios of the drawn plate are in MarkPlate.contrast.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { DIM_TARGET, OPEN_GLYPH_TARGET, dimOpacity, plateInk } from "./mark-ink";
import { PALETTES } from "../../theme/tokens";
import { COLOR_MODES, THEMES } from "../../theme/axes";
import type { Disposition } from "../../lib/marks/types";

type Rgb01 = [number, number, number];

const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: Rgb01) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: Rgb01, b: Rgb01) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (ink: Rgb01, alpha: number, under: Rgb01) =>
  ink.map((c, i) => Math.round((c * alpha + under[i] * (1 - alpha)) * 255) / 255) as Rgb01;

const DARK_FILL: Rgb01 = [11 / 255, 14 / 255, 19 / 255];
const LIGHT_INK: Rgb01 = [230 / 255, 234 / 255, 240 / 255];

describe("dimOpacity", () => {
  it("is the least opacity at which the part still reads the target", () => {
    const a = dimOpacity(LIGHT_INK, DARK_FILL);
    expect(a).toBeLessThan(1);
    expect(ratio(over(LIGHT_INK, a, DARK_FILL), DARK_FILL)).toBeGreaterThanOrEqual(DIM_TARGET);
    expect(ratio(over(LIGHT_INK, a - 0.01, DARK_FILL), DARK_FILL)).toBeLessThan(DIM_TARGET);
  });

  it("keeps full opacity for a part that does not read the target at full opacity", () => {
    expect(dimOpacity([0.2, 0.2, 0.2], DARK_FILL, 4)).toBe(1);
  });

  it("a harder target needs a higher opacity", () => {
    expect(dimOpacity(LIGHT_INK, DARK_FILL, 6)).toBeGreaterThan(dimOpacity(LIGHT_INK, DARK_FILL, 3));
  });
});

describe("plateInk", () => {
  it("fits no glyph colour at rest and a hex on the inverted plate", () => {
    expect(plateInk("dark", "neon", "pass", false).glyph).toBeNull();
    expect(plateInk("dark", "neon", "pass", true).glyph).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("a plate with no decision has no glyph colour and a decision opacity of 1", () => {
    expect(plateInk("light", "neon", "none", true)).toMatchObject({ glyph: null, decision: 1 });
  });

  it("the inverted glyph reads its target over the text colour", () => {
    const text: Rgb01 = LIGHT_INK; // dark neon's text colour: the ground of the inverted plate
    const hex = plateInk("dark", "neon", "pass", true).glyph as string;
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb01;
    expect(ratio(rgb, text)).toBeGreaterThanOrEqual(OPEN_GLYPH_TARGET);
  });

  it("the targets sit between the 3 to 1 floor and the 4.5 a part clears at rest", () => {
    expect(DIM_TARGET).toBeGreaterThan(3);
    expect(DIM_TARGET).toBeLessThan(4.5);
    expect(OPEN_GLYPH_TARGET).toBeGreaterThanOrEqual(4.5);
  });
});

const CELLS = THEMES.flatMap((theme) => COLOR_MODES.map((color) => [theme, color] as const));
const DISPOSITIONS: Disposition[] = ["none", "pass", "fail", "wait"];
const rgb01 = (hex: string): Rgb01 => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb01;

describe("every field the single plate reads keeps its value (pinned before pileCount was added)", () => {
  // glyph | plain | decision, for each theme, colour mode, disposition, at rest and open. These are the
  // values of plateInk as it stood before the pile form: the single plate's fit must not move.
  const PINNED: Record<string, string> = {
    "dark/deuteranopia/fail/open": "#c43500|0.55|0.9",
    "dark/deuteranopia/fail/rest": "null|0.46|0.72",
    "dark/deuteranopia/none/open": "null|0.55|1",
    "dark/deuteranopia/none/rest": "null|0.46|1",
    "dark/deuteranopia/pass/open": "#0065d4|0.55|0.92",
    "dark/deuteranopia/pass/rest": "null|0.46|0.55",
    "dark/deuteranopia/wait/open": "#746600|0.55|0.91",
    "dark/deuteranopia/wait/rest": "null|0.46|0.47",
    "dark/monochrome/fail/open": "#696969|0.55|0.94",
    "dark/monochrome/fail/rest": "null|0.46|0.42",
    "dark/monochrome/none/open": "null|0.55|1",
    "dark/monochrome/none/rest": "null|0.46|1",
    "dark/monochrome/pass/open": "#696969|0.55|0.94",
    "dark/monochrome/pass/rest": "null|0.46|0.5",
    "dark/monochrome/wait/open": "#696969|0.55|0.94",
    "dark/monochrome/wait/rest": "null|0.46|0.66",
    "dark/neon/fail/open": "#d10f00|0.55|0.84",
    "dark/neon/fail/rest": "null|0.46|0.74",
    "dark/neon/none/open": "null|0.55|1",
    "dark/neon/none/rest": "null|0.46|1",
    "dark/neon/pass/open": "#067a38|0.55|0.93",
    "dark/neon/pass/rest": "null|0.46|0.5",
    "dark/neon/wait/open": "#896300|0.55|0.93",
    "dark/neon/wait/rest": "null|0.46|0.52",
    "dark/protanopia/fail/open": "#c43500|0.55|0.9",
    "dark/protanopia/fail/rest": "null|0.46|0.72",
    "dark/protanopia/none/open": "null|0.55|1",
    "dark/protanopia/none/rest": "null|0.46|1",
    "dark/protanopia/pass/open": "#0065d4|0.55|0.92",
    "dark/protanopia/pass/rest": "null|0.46|0.55",
    "dark/protanopia/wait/open": "#746600|0.55|0.91",
    "dark/protanopia/wait/rest": "null|0.46|0.47",
    "dark/rainbow/fail/open": "#c43500|0.55|0.9",
    "dark/rainbow/fail/rest": "null|0.46|0.72",
    "dark/rainbow/none/open": "null|0.55|1",
    "dark/rainbow/none/rest": "null|0.46|1",
    "dark/rainbow/pass/open": "#3c7539|0.55|0.93",
    "dark/rainbow/pass/rest": "null|0.46|0.63",
    "dark/rainbow/wait/open": "#826113|0.55|0.91",
    "dark/rainbow/wait/rest": "null|0.46|0.59",
    "dark/tritanopia/fail/open": "#c43500|0.55|0.9",
    "dark/tritanopia/fail/rest": "null|0.46|0.72",
    "dark/tritanopia/none/open": "null|0.55|1",
    "dark/tritanopia/none/rest": "null|0.46|1",
    "dark/tritanopia/pass/open": "#157668|0.55|0.93",
    "dark/tritanopia/pass/rest": "null|0.46|0.52",
    "dark/tritanopia/wait/open": "#d1005a|0.55|0.84",
    "dark/tritanopia/wait/rest": "null|0.46|0.58",
    "light/deuteranopia/fail/open": "#e5433b|0.42|0.93",
    "light/deuteranopia/fail/rest": "null|0.55|0.74",
    "light/deuteranopia/none/open": "null|0.42|1",
    "light/deuteranopia/none/rest": "null|0.55|1",
    "light/deuteranopia/pass/open": "#3481d1|0.42|0.92",
    "light/deuteranopia/pass/rest": "null|0.55|0.8",
    "light/deuteranopia/wait/open": "#948200|0.42|0.89",
    "light/deuteranopia/wait/rest": "null|0.55|0.74",
    "light/monochrome/fail/open": "#808080|0.42|0.91",
    "light/monochrome/fail/rest": "null|0.55|0.51",
    "light/monochrome/none/open": "null|0.42|1",
    "light/monochrome/none/rest": "null|0.55|1",
    "light/monochrome/pass/open": "#7f7f7f|0.42|0.92",
    "light/monochrome/pass/rest": "null|0.55|0.6",
    "light/monochrome/wait/open": "#7f7f7f|0.42|0.92",
    "light/monochrome/wait/rest": "null|0.55|0.74",
    "light/neon/fail/open": "#e5433b|0.42|0.93",
    "light/neon/fail/rest": "null|0.55|0.74",
    "light/neon/none/open": "null|0.42|1",
    "light/neon/none/rest": "null|0.55|1",
    "light/neon/pass/open": "#0c9440|0.42|0.91",
    "light/neon/pass/rest": "null|0.55|0.79",
    "light/neon/wait/open": "#ad7200|0.42|0.92",
    "light/neon/wait/rest": "null|0.55|0.74",
    "light/protanopia/fail/open": "#e5433b|0.42|0.93",
    "light/protanopia/fail/rest": "null|0.55|0.74",
    "light/protanopia/none/open": "null|0.42|1",
    "light/protanopia/none/rest": "null|0.55|1",
    "light/protanopia/pass/open": "#3481d1|0.42|0.92",
    "light/protanopia/pass/rest": "null|0.55|0.8",
    "light/protanopia/wait/open": "#948200|0.42|0.89",
    "light/protanopia/wait/rest": "null|0.55|0.74",
    "light/rainbow/fail/open": "#e5433b|0.42|0.93",
    "light/rainbow/fail/rest": "null|0.55|0.74",
    "light/rainbow/none/open": "null|0.42|1",
    "light/rainbow/none/rest": "null|0.55|1",
    "light/rainbow/pass/open": "#37933b|0.42|0.9",
    "light/rainbow/pass/rest": "null|0.55|0.81",
    "light/rainbow/wait/open": "#a97600|0.42|0.92",
    "light/rainbow/wait/rest": "null|0.55|0.74",
    "light/tritanopia/fail/open": "#e5433b|0.42|0.93",
    "light/tritanopia/fail/rest": "null|0.55|0.74",
    "light/tritanopia/none/open": "null|0.42|1",
    "light/tritanopia/none/rest": "null|0.55|1",
    "light/tritanopia/pass/open": "#0c9283|0.42|0.89",
    "light/tritanopia/pass/rest": "null|0.55|0.8",
    "light/tritanopia/wait/open": "#d0508c|0.42|0.92",
    "light/tritanopia/wait/rest": "null|0.55|0.71",
  };
  const snap = (theme: (typeof THEMES)[number], color: (typeof COLOR_MODES)[number], d: Disposition, open: boolean) => {
    const k = plateInk(theme, color, d, open);
    return `${k.glyph}|${k.plain}|${k.decision}`;
  };
  const got: Record<string, string> = {};
  for (const [theme, color] of CELLS) {
    for (const d of DISPOSITIONS) {
      for (const open of [false, true]) got[`${theme}/${color}/${d}/${open ? "open" : "rest"}`] = snap(theme, color, d, open);
    }
  }

  it("matches the pinned table for none, pass, fail and wait, open and not, in every theme and colour mode", () => {
    expect(got).toEqual(PINNED);
  });
});

describe("pileCount", () => {
  it.each(CELLS)("at rest in %s %s: the least opacity at which --text-muted still reads 4.0 over the rest ground", (theme, color) => {
    const { neutral } = PALETTES[theme][color];
    const bg = rgb01(neutral.bg);
    const muted = rgb01(neutral.textMuted);
    const a = plateInk(theme, color, "none", false).pileCount;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(1);
    if (a < 1) {
      expect(ratio(over(muted, a, bg), bg)).toBeGreaterThanOrEqual(DIM_TARGET);
      expect(ratio(over(muted, a - 0.01, bg), bg)).toBeLessThan(DIM_TARGET);
    } else {
      // Full opacity only where the muted ink does not read above the target at all.
      expect(ratio(muted, bg)).toBeLessThanOrEqual(DIM_TARGET);
    }
  });

  it.each(CELLS)("on the open plate in %s %s it equals plain, whatever the decision", (theme, color) => {
    for (const d of DISPOSITIONS) {
      const k = plateInk(theme, color, d, true);
      expect(k.pileCount, d).toBe(k.plain);
    }
  });

  it("does not depend on the disposition at rest", () => {
    for (const [theme, color] of CELLS) {
      const base = plateInk(theme, color, "none", false).pileCount;
      for (const d of DISPOSITIONS) expect(plateInk(theme, color, d, false).pileCount, `${theme}/${color}/${d}`).toBe(base);
    }
  });
});
