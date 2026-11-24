// frontend/investigator/src/theme/readout-colour.test.ts
//
// The clock readout on the playbar and
// the FFR mark in the header must clear 4.5 to 1 on the surfaces they really sit on.
//
// The test resolves the colour each element takes from its SOURCE (a class or a style, then
// the variable, then the palette), so a class that goes back to the raw data slot turns it
// red on numbers. The surfaces and floors below are literals, copied as hex from the text
// contrast sweep (the readout and FFR elements, 26 cells); they are NOT imported from tokens.ts, so a later change to the
// clamp's reference or target turns this red.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLOR_MODES, THEMES, type ColorMode, type Theme } from "./axes";
import { paletteToCssBlock } from "./css-gen";
import { contrastRatio } from "./legibility";
import { hexToRgb01 } from "./to-rgb";
import { PALETTES, type ThemePalette } from "./tokens";

type Rgb = [number, number, number];

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(resolve(here, rel), "utf8");

// ── The element's colour, read from its source ───────────────────────────────

/** The class string of the span that renders the delta: the span just before the
 *  `{span > 0 ? formatDelta(` expression. Found by that anchor, not by a line number. */
function readoutClass(timelineSource: string): string {
  const anchor = timelineSource.indexOf("{span > 0 ? formatDelta(");
  expect(anchor, "the formatDelta anchor in Timeline.tsx").toBeGreaterThan(-1);
  const open = timelineSource.lastIndexOf("<span", anchor);
  const tag = timelineSource.slice(open, anchor);
  const m = /className="([^"]*)"/.exec(tag);
  expect(m, "a className on the readout span").not.toBeNull();
  return (m as RegExpExecArray)[1];
}

/** The `color` of the inline style of the span whose text is `FFR`. */
function ffrColor(appSource: string): string {
  // Tempered pattern: the attributes of one span, never crossing into another span.
  const m = /<span\b((?:(?!<span)[\s\S])*?)>\s*FFR\s*<\/span>/.exec(appSource);
  expect(m, "the span that holds FFR in App.tsx").not.toBeNull();
  const c = /color:\s*"([^"]+)"/.exec((m as RegExpExecArray)[1]);
  expect(c, "an inline color on the FFR span").not.toBeNull();
  return (c as RegExpExecArray)[1];
}

/** Map a colour token to the palette hex it paints. Any other value fails the test. */
function paint(token: string, p: ThemePalette): string {
  switch (token) {
    case "text-accent": // tailwind.config.js: rgb(var(--r1-rgb))
    case "var(--r1)":
      return p.ramp.r1;
    case "text-[color:var(--r1-readout)]":
      return p.onPanel.readout;
    case "var(--r1-on-panel)":
      return p.onPanel.r1;
    default:
      throw new Error(`unknown colour token: ${token}`);
  }
}

const KNOWN_CLASS_COLOURS = ["text-accent", "text-[color:var(--r1-readout)]"];
function readoutToken(cls: string): string {
  const hit = cls.split(/\s+/).filter((t) => KNOWN_CLASS_COLOURS.includes(t));
  if (hit.length !== 1) throw new Error(`readout class carries no single known colour: "${cls}"`);
  return hit[0];
}

const timelineSource = src("../components/Timeline.tsx");
const appSource = src("../App.tsx");

// ── Surfaces (literals with provenance) and floors ───────────────────────────

const rgb = (hex: string): Rgb => hexToRgb01(hex);

// Readout, light: the glass over black is the darkest the bar can be (a backdrop cannot be
// darker than black). Rainbow's glass fill is 0.85 (`#c9ccd1`), the other five 0.88
// (`#cfd3d8`, derived `#d0d3d8`); pixel surfaces from the sweep follow, lighter in the city
// view. Dark: computed `#0a0d12` (rainbow) / `#0f1319`; pixel surfaces up to `#26292e`
// (city rainbow, the lightest measured). Glass over white (`#30343a` and lighter in dark) is
// not a view the app draws and is left out, as in the design.
const READOUT_SURFACES: Record<Theme, (color: ColorMode) => string[]> = {
  light: (color) =>
    color === "rainbow"
      ? ["#c9ccd1", "#cacdd4", "#e8eaed"]
      : ["#cfd3d8", "#d0d3d8", "#d0d4da", "#e8ecef"],
  dark: (color) =>
    color === "rainbow" ? ["#0a0d12", "#0c111b", "#26292e"] : ["#0f1319", "#10151d", "#1e2228"],
};

// FFR mark: the identity card, flat panel-base (`#141a23` dark, `#eaeef4` light) with the
// sweep's computed values beside them (`#141922`, `#ebeff5`) and the design's (`#141923`,
// `#eaeef3`).
const FFR_SURFACES: Record<Theme, string[]> = {
  dark: ["#141922", "#141923", "#141a23"],
  light: ["#ebeff5", "#eaeef3", "#eaeef4"],
};
const FFR_MEASURED_MIN = 5.3; // the design's measured minimum is 5.32 (light rainbow)
const FLOOR = 4.5;

// Pixel signal. A text pixel is the surface plus a coverage `a` times (true colour minus
// surface), per channel. Lowest `a` fitted on the sweep's 10 px weight 500 rows with a text
// over 3 characters and a true ratio over 2: 0.897 dark on light (n 122), 0.915 light on
// dark (n 120). The model's back-test error (it never predicts a ratio more than 0.021 above
// a measured one) is taken off, rounded to the design's 0.02.
const COVERAGE = { light: 0.897, dark: 0.915 } as const;
const MODEL_ERROR = 0.02;
// Strict reading: the lowest measured proportion of the pixel ratio to the computed one
// (10 px, weight 500): dark text on light 0.769, light text on dark 0.870.
const STRICT = { light: FLOOR / 0.769, dark: FLOOR / 0.87 } as const;

function predictedPixelRatio(text: Rgb, surface: Rgb, a: number): number {
  const pixel = text.map((t, i) => surface[i] + a * (t - surface[i])) as Rgb;
  return contrastRatio(pixel, surface) - MODEL_ERROR;
}

// ── Literals ─────────────────────────────────────────────────────────────────

const key = (theme: Theme, color: ColorMode) => `${theme}.${color}`;

// The data colour (`ramp.r1`) and the existing on-panel colour (`onPanel.r1`) of each cell:
// neither changes in C2.
const R1: Record<string, string> = {
  "light.rainbow": "#6e8a86",
  "light.neon": "#00a6b8",
  "light.deuteranopia": "#31446b",
  "light.protanopia": "#31446b",
  "light.tritanopia": "#2b8cbe",
  "light.monochrome": "#595959",
  "dark.rainbow": "#8fa3a0",
  "dark.neon": "#00e5ff",
  "dark.deuteranopia": "#00316f",
  "dark.protanopia": "#00316f",
  "dark.tritanopia": "#045a8d",
  "dark.monochrome": "#bfbfbf",
};
const R1_ON_PANEL: Record<string, string> = {
  "light.rainbow": "#516562",
  "light.neon": "#006a76",
  "light.deuteranopia": "#31446b",
  "light.protanopia": "#31446b",
  "light.tritanopia": "#20678c",
  "light.monochrome": "#595959",
  "dark.rainbow": "#8fa3a0",
  "dark.neon": "#00e5ff",
  "dark.deuteranopia": "#3c92ff",
  "dark.protanopia": "#3c92ff",
  "dark.tritanopia": "#079cf5",
  "dark.monochrome": "#bfbfbf",
};
// The target is 6.0. The 12 values
// pin the reference, its direction and the target at once: the surface checks cannot, because
// the measured dark surfaces are darker than `panelTop`, so a `panelBase` or `panelFloor`
// reference in dark, or a lower dark-only target, stays green against them.
const READOUT_A: Record<string, string> = {
  "light.rainbow": "#384644",
  "light.neon": "#004f57",
  "light.deuteranopia": "#31446b",
  "light.protanopia": "#31446b",
  "light.tritanopia": "#174c67",
  "light.monochrome": "#474747",
  "dark.rainbow": "#9aacaa",
  "dark.neon": "#00e5ff",
  "dark.deuteranopia": "#6aacff",
  "dark.protanopia": "#6aacff",
  "dark.tritanopia": "#36b1f9",
  "dark.monochrome": "#bfbfbf",
};

function hueOf(hex: string): number {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a: string, b: string) => {
  const d = Math.abs(hueOf(a) - hueOf(b));
  return Math.min(d, 360 - d);
};

const CELLS: Array<[Theme, ColorMode]> = THEMES.flatMap((t) =>
  COLOR_MODES.map((c) => [t, c] as [Theme, ColorMode]),
);

// ── The readout ──────────────────────────────────────────────────────────────

describe("clock readout colour (Timeline.tsx), as the source paints it", () => {
  const token = readoutToken(readoutClass(timelineSource));

  describe.each(CELLS)("%s %s", (theme, color) => {
    const p = PALETTES[theme][color];
    const text = () => paint(token, p);
    const surfaces = READOUT_SURFACES[theme](color);

    it("clears 4.5 computed on every measured surface", () => {
      for (const s of surfaces) {
        expect(contrastRatio(rgb(text()), rgb(s)), `${text()} on ${s}`).toBeGreaterThanOrEqual(
          FLOOR,
        );
      }
    });

    it("clears 4.5 by the pixel coverage model on every measured surface", () => {
      for (const s of surfaces) {
        expect(
          predictedPixelRatio(rgb(text()), rgb(s), COVERAGE[theme]),
          `${text()} on ${s}`,
        ).toBeGreaterThanOrEqual(FLOOR);
      }
    });

    it("clears the strict reading (class-minimum proportion) on every measured surface", () => {
      for (const s of surfaces) {
        expect(contrastRatio(rgb(text()), rgb(s)), `${text()} on ${s}`).toBeGreaterThanOrEqual(
          STRICT[theme],
        );
      }
    });
  });
});

describe("the readout colour token (onPanel.readout)", () => {
  it.each(CELLS)("%s %s equals option A's literal", (theme, color) => {
    expect(PALETTES[theme][color].onPanel.readout?.toLowerCase()).toBe(
      READOUT_A[key(theme, color)],
    );
  });

  it.each(CELLS)("%s %s holds the hue of ramp.r1 within 2.5 degrees", (theme, color) => {
    const p = PALETTES[theme][color];
    expect(hueGap(p.onPanel.readout, p.ramp.r1)).toBeLessThanOrEqual(2.5);
  });

  it.each(CELLS)("%s %s: the data colour and the on-panel colour do not change", (theme, color) => {
    const p = PALETTES[theme][color];
    expect(p.ramp.r1.toLowerCase()).toBe(R1[key(theme, color)]);
    expect(p.onPanel.r1.toLowerCase()).toBe(R1_ON_PANEL[key(theme, color)]);
  });
});

describe("css-gen emits the readout token", () => {
  it.each(CELLS)("%s %s: --r1-readout, --r1-on-panel and --r1-rgb", (theme, color) => {
    const p = PALETTES[theme][color];
    const block = paletteToCssBlock(p);
    expect(block).toContain(`--r1-readout: ${READOUT_A[key(theme, color)]};`);
    expect(block).toContain(`--r1-on-panel: ${R1_ON_PANEL[key(theme, color)]};`);
    expect(block).toContain("--r1-rgb: ");
    expect(block).toContain(`--r1: ${p.ramp.r1};`);
  });

  it("the token's sources read no clock", () => {
    for (const file of ["tokens.ts", "css-gen.ts"]) {
      const text = src(file);
      expect(text).not.toContain("Date.now");
      expect(text).not.toContain("new Date");
    }
  });
});

// ── The FFR mark ─────────────────────────────────────────────────────────────

describe("FFR mark colour (App.tsx), as the source paints it", () => {
  const token = ffrColor(appSource);

  describe.each(CELLS)("%s %s", (theme, color) => {
    const p = PALETTES[theme][color];
    const text = () => paint(token, p);

    it("clears 4.5 on the identity card's surfaces, and the measured 5.3", () => {
      for (const s of FFR_SURFACES[theme]) {
        const r = contrastRatio(rgb(text()), rgb(s));
        expect(r, `${text()} on ${s}`).toBeGreaterThanOrEqual(FLOOR);
        expect(r, `${text()} on ${s}`).toBeGreaterThanOrEqual(FFR_MEASURED_MIN);
      }
    });
  });
});
