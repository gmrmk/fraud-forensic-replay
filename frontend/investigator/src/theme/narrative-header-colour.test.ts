// frontend/investigator/src/theme/narrative-header-colour.test.ts
//
// The NARRATIVE header takes the body text colour in the LIGHT theme, where it read 3.14 to 1 as
// `--text-faint`. In dark it takes the margin's faint colour, pinned in grey-margin-colour.test.ts.
//
// The colour is resolved from the header's SOURCE (the class, then the variable, then the
// palette), so a class that goes back to `--text-faint` turns the light cells red on numbers.
// The light surfaces are literals copied as hex from the sweep and the design (the card over
// the void), not imports from tokens.ts. Dark carries no pixel margin: its pixel mean is
// 4.46 to 4.92 today.
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
const narrativeSource = readFileSync(resolve(here, "../components/NarrativeLog.tsx"), "utf8");

// ── The header's colour, read from its source ───────────────────────────────

/** The class string of the span whose text is `Narrative`, and of the collapse button. */
function headerClass(source: string): string {
  const m = /<span\b((?:(?!<span)[\s\S])*?)>\s*Narrative\s*<\/span>/.exec(source);
  expect(m, "the span that holds Narrative in NarrativeLog.tsx").not.toBeNull();
  const c = /className="([^"]*)"/.exec((m as RegExpExecArray)[1]);
  expect(c, "a className on the header span").not.toBeNull();
  return (c as RegExpExecArray)[1];
}
function chevronClass(source: string): string {
  const m = /<button\b((?:(?!<button)[\s\S])*?)>\s*\{collapsed \? "›" : "‹"\}\s*<\/button>/.exec(
    source,
  );
  expect(m, "the collapse button in NarrativeLog.tsx").not.toBeNull();
  const c = /className="([^"]*)"/.exec((m as RegExpExecArray)[1]);
  expect(c, "a className on the collapse button").not.toBeNull();
  return (c as RegExpExecArray)[1];
}

const KNOWN = ["text-[color:var(--text-faint)]", "text-[color:var(--narrative-header)]"];
function colourToken(cls: string): string {
  const hit = cls.split(/\s+/).filter((t) => KNOWN.includes(t));
  if (hit.length !== 1) throw new Error(`class carries no single known colour: "${cls}"`);
  return hit[0];
}
/** Map a colour class to the palette hex it paints. Any other value fails the test. */
function paint(token: string, p: ThemePalette): string {
  if (token === "text-[color:var(--text-faint)]") return p.neutral.textFaint;
  if (token === "text-[color:var(--narrative-header)]") return p.onPanel.narrativeHeader;
  throw new Error(`unknown colour token: ${token}`);
}

// ── Literals ─────────────────────────────────────────────────────────────────

const rgb = (hex: string): Rgb => hexToRgb01(hex);
const LIGHT_TEXT = "#10151c"; // NEUTRAL_LIGHT.text, the light --text
// The dark header takes the margin's faint colour: onPanel.textFaint, the faint grey lightened to 6.0 on panelTop. It was NEUTRAL_DARK's
// raw textFaint (#909aa8) before the margin.
const DARK_HEADER = "#a1aab5";

// The card over the void in light (sweep run2 cell files, header rows, and the design,
// section 3 of DESIGN-C2-CUT): `#bbbfc3` to `#bdc2c7` computed in the overview and late
// cells, `#bfc2c4` the computed surface, `#e5e7ea` in the city cells.
const LIGHT_SURFACES = ["#bbbfc3", "#bdc2c7", "#bfc2c4", "#e5e7ea"];
const FLOOR = 4.5;
// 9 px, weight 500 (the design, decision 3): lowest coverage 0.823 (dark on light), lowest
// proportion of the pixel ratio to the computed one 0.615, so the strict reading is 4.5 /
// 0.615 = 7.32. The model's back-test error (never more than 0.007 above a measured row for
// 9 px) is taken off as the design's 0.02.
const COVERAGE_LIGHT = 0.823;
const MODEL_ERROR = 0.02;
const STRICT_LIGHT = FLOOR / 0.615;

function predictedPixelRatio(text: Rgb, surface: Rgb, a: number): number {
  const pixel = text.map((t, i) => surface[i] + a * (t - surface[i])) as Rgb;
  return contrastRatio(pixel, surface) - MODEL_ERROR;
}

const CELLS: Array<[Theme, ColorMode]> = THEMES.flatMap((t) =>
  COLOR_MODES.map((c) => [t, c] as [Theme, ColorMode]),
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("NARRATIVE header call site (NarrativeLog.tsx)", () => {
  it("the header span takes --narrative-header and not --text-faint", () => {
    const cls = headerClass(narrativeSource);
    expect(cls).toContain("text-[color:var(--narrative-header)]");
    expect(cls).not.toContain("--text-faint");
  });

  it("the collapse chevron keeps --text-faint (a control glyph, not changed)", () => {
    expect(chevronClass(narrativeSource)).toContain("text-[color:var(--text-faint)]");
  });
});

describe("the header colour token (onPanel.narrativeHeader)", () => {
  it.each(CELLS)("%s %s: light is the light --text, dark is the margin's faint colour", (theme, color) => {
    const p = PALETTES[theme][color];
    const want = theme === "light" ? LIGHT_TEXT : DARK_HEADER;
    expect(p.onPanel.narrativeHeader?.toLowerCase()).toBe(want);
    expect(p.onPanel.narrativeHeader?.toLowerCase()).toBe(
      (theme === "light" ? p.neutral.text : p.onPanel.textFaint).toLowerCase(),
    );
  });

  it.each(CELLS)("%s %s: css-gen emits --narrative-header and keeps --text-faint", (theme, color) => {
    const p = PALETTES[theme][color];
    const block = paletteToCssBlock(p).toLowerCase();
    const want = theme === "light" ? LIGHT_TEXT : DARK_HEADER;
    expect(block).toContain(`--narrative-header: ${want};`);
    expect(block).toContain(`--text-faint: ${p.neutral.textFaint.toLowerCase()};`);
  });

  it("the token's sources read no clock", () => {
    for (const file of ["tokens.ts", "css-gen.ts"]) {
      const text = readFileSync(resolve(here, file), "utf8");
      expect(text).not.toContain("Date.now");
      expect(text).not.toContain("new Date");
    }
  });
});

describe("NARRATIVE header colour, as the source paints it, on the light card", () => {
  const token = colourToken(headerClass(narrativeSource));

  describe.each(CELLS.filter(([theme]) => theme === "light"))("%s %s", (theme, color) => {
    const text = () => paint(token, PALETTES[theme][color]);

    it("clears 4.5 computed on every measured light surface", () => {
      for (const s of LIGHT_SURFACES) {
        expect(contrastRatio(rgb(text()), rgb(s)), `${text()} on ${s}`).toBeGreaterThanOrEqual(FLOOR);
      }
    });

    it("clears 4.5 by the pixel coverage model on every measured light surface", () => {
      for (const s of LIGHT_SURFACES) {
        expect(
          predictedPixelRatio(rgb(text()), rgb(s), COVERAGE_LIGHT),
          `${text()} on ${s}`,
        ).toBeGreaterThanOrEqual(FLOOR);
      }
    });

    it("clears the strict reading (4.5 / 0.615) on every measured light surface", () => {
      for (const s of LIGHT_SURFACES) {
        expect(contrastRatio(rgb(text()), rgb(s)), `${text()} on ${s}`).toBeGreaterThanOrEqual(
          STRICT_LIGHT,
        );
      }
    });
  });
});
