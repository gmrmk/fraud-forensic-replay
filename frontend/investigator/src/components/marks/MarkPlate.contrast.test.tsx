/**
 * The plate's contrast, reckoned the way a reader sees it (the fix log FIX-2026-11-21-mark-plate-
 * contrast-inverted-and-dimmed): the colour a glyph or digit is drawn in, at the opacity it is drawn
 * at, over the fill it sits on, by the WCAG formula written out here (not imported from the code under
 * test). Four states (at rest, dimmed, inverted, dimmed and inverted), both themes, every colour mode.
 *
 * What is read from the rendered plate: each part's colour and the opacity of the part and of every
 * element above it. What is modelled, because this DOM drops a colour holding rgb(var(...)) (the plate's
 * own fill at rest, `rgb(var(--bg-rgb) / 0.9)`, and the open ink, `rgb(var(--bg-rgb))`): the fill at
 * rest is the page background at 0.9 over each backdrop the plate can sit on, and the open plain ink is
 * the page background. Colours given as var(--x) resolve against the theme's own generated CSS block.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MarkPlate } from "./MarkPlate";
import { useTheme } from "../../store/theme";
import { PALETTES } from "../../theme/tokens";
import { paletteToCssBlock } from "../../theme/css-gen";
import { COLOR_MODES, THEMES, type ColorMode, type Theme } from "../../theme/axes";
import type { Disposition } from "../../lib/marks/types";

type Rgb = [number, number, number];
type Props = Parameters<typeof MarkPlate>[0];

// ---- the WCAG formula, written out here ----
const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `ink` painted at `alpha` over `under`, in 8-bit channels as a browser does. */
const over = (ink: Rgb, alpha: number, under: Rgb): Rgb =>
  ink.map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha))) as Rgb;

// ---- resolving what the page draws ----
const hex = (s: string): Rgb => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as Rgb;
const triplet = (s: string): Rgb => s.trim().split(/\s+/).map(Number) as Rgb;

function varsOf(theme: Theme, color: ColorMode): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of paletteToCssBlock(PALETTES[theme][color]).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

/** A colour string as this DOM reads it back (a var(), a hex, or rgb(r, g, b)); null when it is empty. */
function colourOf(s: string, vars: Map<string, string>): Rgb | null {
  const t = s.trim();
  if (t === "") return null;
  const v = /^var\((--[a-z0-9-]+)\)$/.exec(t);
  if (v) {
    const next = vars.get(v[1]);
    if (next === undefined) throw new Error(`unresolved ${t}`);
    return colourOf(next, vars);
  }
  if (t.startsWith("#")) return hex(t.length === 4 ? `#${[...t.slice(1)].map((c) => c + c).join("")}` : t);
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(t);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  throw new Error(`unreadable colour ${t}`);
}

/** The opacity a part is drawn at: its own times that of every element above it up to the plate. */
function opacityOf(el: HTMLElement, root: HTMLElement): number {
  let o = 1;
  for (let e: HTMLElement | null = el; e; e = e.parentElement) {
    if (e.style.opacity !== "") o *= Number(e.style.opacity);
    if (e === root) break;
  }
  return o;
}

// The fills a rest plate can sit on: the plate is the page background at 0.9 over what is behind it,
// which is the page, one of the panel's three surfaces, or a basemap as dark as black or as light as
// white (the plate's 0.9 is there so that a tone keeps its contrast over any basemap).
function backdrops(theme: Theme, color: ColorMode): Rgb[] {
  const p = PALETTES[theme][color];
  return [
    hex(p.neutral.bg),
    triplet(p.material.panelTop),
    triplet(p.material.panelBase),
    triplet(p.material.panelFloor),
    [0, 0, 0],
    [255, 255, 255],
  ];
}
function fills(theme: Theme, color: ColorMode, open: boolean): Rgb[] {
  const p = PALETTES[theme][color];
  if (open) return [hex(p.neutral.text)];
  return backdrops(theme, color).map((b) => over(hex(p.neutral.bg), 0.9, b));
}

// ---- drawing and reading the plate ----
const NAMES = ["lens", "count", "check", "cross", "hourglass", "pin"] as const;
type Name = (typeof NAMES)[number];
const GLYPH_OF: Record<Name, Disposition | null> = { lens: null, count: null, check: "pass", cross: "fail", hourglass: "wait", pin: null };

interface Drawn {
  /** The colour and the opacity of a part as drawn; the colour is null where this DOM keeps none. */
  colour: Record<Name, Rgb | null>;
  raw: Record<Name, string>;
  opacity: Record<Name, number>;
}

function draw(theme: Theme, color: ColorMode, dim: boolean, open: boolean): Drawn {
  useTheme.setState({ theme, color });
  const vars = varsOf(theme, color);
  const colour = {} as Drawn["colour"];
  const raw = {} as Drawn["raw"];
  const opacity = {} as Drawn["opacity"];
  for (const name of NAMES) {
    const d = GLYPH_OF[name];
    const props: Props = {
      lens: true,
      notes: 3,
      disposition: d ?? "pass",
      pinned: true,
      dim,
      open,
    };
    const { container } = render(<MarkPlate {...props} />);
    const root = container.querySelector("[data-mark-plate]") as HTMLElement;
    const part = root.querySelector(`[data-part="${d ? "disposition" : name}"]`) as HTMLElement;
    const holder = d ? (part.querySelector("span") as HTMLElement) : part;
    raw[name] = holder.style.color;
    colour[name] = colourOf(holder.style.color, vars);
    opacity[name] = opacityOf(holder, root);
    cleanup();
  }
  return { colour, raw, opacity };
}

/** The colour of a part. Open plain ink is the page background, which this DOM drops: only those parts may be empty. */
function inkOf(drawn: Drawn, name: Name, bg: Rgb, open: boolean): Rgb {
  const c = drawn.colour[name];
  if (c) return c;
  expect(open && !GLYPH_OF[name], `${name} has a colour this DOM keeps`).toBe(true);
  return bg;
}

/** Each part's ratio over each fill of the state. */
function ratios(theme: Theme, color: ColorMode, dim: boolean, open: boolean): Record<Name, number[]> {
  const drawn = draw(theme, color, dim, open);
  const bg = hex(PALETTES[theme][color].neutral.bg);
  const out = {} as Record<Name, number[]>;
  for (const name of NAMES) {
    const ink = inkOf(drawn, name, bg, open);
    out[name] = fills(theme, color, open).map((f) => ratio(over(ink, drawn.opacity[name], f), f));
  }
  return out;
}

const CELLS = THEMES.flatMap((theme) => COLOR_MODES.map((color) => [theme, color] as const));

beforeEach(() => {
  cleanup();
});

describe("the calibration: this test's reckoning reproduces the measured figures of the fix log for the drawing as it was", () => {
  // The drawing before the fix, modelled from the palette alone (no code under test): each tone's own
  // variable over the inverted ground, and the contents of a rest plate at the one opacity 0.45.
  // neon; the measured fills were 12,15,20 and 250,251,252, a shade from the page colours used here.
  const tone = (t: Theme, key: "pass" | "alarm" | "wait") => hex(PALETTES[t].neon.onPanel[key]);
  const text = (t: Theme) => hex(PALETTES[t].neon.neutral.text);
  const bg = (t: Theme) => hex(PALETTES[t].neon.neutral.bg);
  it("dark, inverted: check about 1.19, cross about 2.42, hourglass about 1.28", () => {
    expect(ratio(tone("dark", "pass"), text("dark"))).toBeCloseTo(1.19, 1);
    expect(ratio(tone("dark", "alarm"), text("dark"))).toBeCloseTo(2.42, 1);
    expect(ratio(tone("dark", "wait"), text("dark"))).toBeCloseTo(1.28, 1);
  });
  it("light, inverted: check about 2.87, cross about 2.81, hourglass about 2.33", () => {
    expect(ratio(tone("light", "pass"), text("light"))).toBeCloseTo(2.87, 1);
    expect(ratio(tone("light", "alarm"), text("light"))).toBeCloseTo(2.81, 1);
    expect(ratio(tone("light", "wait"), text("light"))).toBeCloseTo(2.33, 1);
  });
  it("dimmed at rest, at 0.45: dark lens about 3.95, cross about 2.17; light lens about 2.96, check about 2.07", () => {
    expect(ratio(over(text("dark"), 0.45, bg("dark")), bg("dark"))).toBeCloseTo(3.95, 0);
    expect(ratio(over(tone("dark", "alarm"), 0.45, bg("dark")), bg("dark"))).toBeCloseTo(2.17, 0);
    expect(ratio(over(text("light"), 0.45, bg("light")), bg("light"))).toBeCloseTo(2.96, 0);
    expect(ratio(over(tone("light", "pass"), 0.45, bg("light")), bg("light"))).toBeCloseTo(2.07, 0);
  });
});

describe.each(CELLS)("the plate in the %s theme, %s colours", (theme, color) => {
  it("at rest: every glyph and digit reads 3 to 1 or more on every ground", () => {
    for (const [name, rs] of Object.entries(ratios(theme, color, false, false))) {
      for (const r of rs) expect(r, `${name} at rest`).toBeGreaterThanOrEqual(3);
    }
  });

  it("inverted: every glyph and digit reads 3 to 1 or more", () => {
    for (const [name, rs] of Object.entries(ratios(theme, color, false, true))) {
      for (const r of rs) expect(r, `${name} inverted`).toBeGreaterThanOrEqual(3);
    }
  });

  it("dimmed at rest and dimmed inverted: every part reads 3 to 1 or more", () => {
    for (const open of [false, true]) {
      for (const [name, rs] of Object.entries(ratios(theme, color, true, open))) {
        for (const r of rs) expect(r, `${name} dimmed${open ? " and inverted" : ""}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("a dimmed part reads dimmer than the same part undimmed, and never over 4.5 where the undimmed reads 4.5 or more", () => {
    for (const open of [false, true]) {
      const full = ratios(theme, color, false, open);
      const dimmed = ratios(theme, color, true, open);
      for (const name of NAMES) {
        if (name === "pin") continue;
        full[name].forEach((f, i) => {
          const d = dimmed[name][i];
          expect(d, `${name} dimmed ${d.toFixed(2)} against ${f.toFixed(2)}`).toBeLessThanOrEqual(f + 1e-9);
          if (f >= 4.5) expect(d, `${name} dimmed ${d.toFixed(2)} where the full reads ${f.toFixed(2)}`).toBeLessThanOrEqual(4.5);
        });
      }
    }
  });

  it("the pin keeps its full ink when the contents dim", () => {
    for (const open of [false, true]) {
      const full = draw(theme, color, false, open);
      const dimmed = draw(theme, color, true, open);
      expect(dimmed.raw.pin).toBe(full.raw.pin);
      expect(dimmed.opacity.pin).toBe(1);
      expect(full.opacity.pin).toBe(1);
    }
  });

  it("the decision glyphs on the inverted plate keep the hue of their tone", () => {
    const rest = draw(theme, color, false, false);
    const inv = draw(theme, color, false, true);
    const hue = ([r, g, b]: Rgb) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return 0;
      const d = max - min;
      const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return h * 60;
    };
    for (const name of ["check", "cross", "hourglass"] as const) {
      const a = rest.colour[name] as Rgb;
      const b = inv.colour[name] as Rgb;
      const sat = (Math.max(...a) - Math.min(...a)) / 255;
      // A grey tone has no hue to keep; a coloured one keeps it within a few degrees of 8-bit rounding.
      if (sat > 0.15) {
        const diff = Math.abs(hue(a) - hue(b));
        expect(Math.min(diff, 360 - diff), `${name} hue ${hue(a).toFixed(0)} to ${hue(b).toFixed(0)}`).toBeLessThanOrEqual(8);
      }
    }
  });
});

// ---- the pile plate ----
// No picture of a pile was drawn in the light theme, so these computed floors are its proof. A pile
// carries the sign and figure (muted ink at rest, the open ink inverted), each decision glyph it holds
// and the pin; each glyph dims on its own flag and the contents of a dim pile dim together.
const PILE_NAMES = ["lens", "pile", "check", "cross", "hourglass", "pin"] as const;
type PileName = (typeof PILE_NAMES)[number];
const PILE_DISPOSITION: Record<"check" | "cross" | "hourglass", "pass" | "fail" | "wait"> = {
  check: "pass",
  cross: "fail",
  hourglass: "wait",
};

interface PileState {
  /** The pile's contents dim (lens, sign and figure). */
  dim: boolean;
  /** Which glyphs dim, by the decision they show. */
  glyphDim: Record<"pass" | "fail" | "wait", boolean>;
  open: boolean;
}
const LIT = { pass: false, fail: false, wait: false };
const DIMMED = { pass: true, fail: true, wait: true };

interface DrawnPile {
  raw: Record<PileName, string>;
  colour: Record<PileName, Rgb | null>;
  opacity: Record<PileName, number>;
}

function drawPile(theme: Theme, color: ColorMode, s: PileState): DrawnPile {
  useTheme.setState({ theme, color });
  const vars = varsOf(theme, color);
  const props: Props = {
    lens: true,
    notes: 0,
    disposition: "none",
    pinned: true,
    dim: s.dim,
    open: s.open,
    pile: {
      records: 3,
      glyphs: (["pass", "fail", "wait"] as const).map((d) => ({ disposition: d, dim: s.glyphDim[d] })),
    },
  };
  const { container } = render(<MarkPlate {...props} />);
  const root = container.querySelector("[data-mark-plate]") as HTMLElement;
  const raw = {} as DrawnPile["raw"];
  const colour = {} as DrawnPile["colour"];
  const opacity = {} as DrawnPile["opacity"];
  for (const name of PILE_NAMES) {
    const d = name === "check" || name === "cross" || name === "hourglass" ? PILE_DISPOSITION[name] : null;
    const part = root.querySelector(d ? `[data-part="disposition"][data-disposition="${d}"]` : `[data-part="${name}"]`) as HTMLElement;
    const holder = d ? (part.querySelector("span") as HTMLElement) : part;
    raw[name] = holder.style.color;
    colour[name] = colourOf(holder.style.color, vars);
    opacity[name] = opacityOf(holder, root);
  }
  cleanup();
  return { raw, colour, opacity };
}

/** Each part's ratio over each fill of the state. Open plain ink is the page background, which this DOM drops. */
function pileRatios(theme: Theme, color: ColorMode, s: PileState): Record<PileName, number[]> {
  const drawn = drawPile(theme, color, s);
  const bg = hex(PALETTES[theme][color].neutral.bg);
  const out = {} as Record<PileName, number[]>;
  for (const name of PILE_NAMES) {
    let ink = drawn.colour[name];
    if (!ink) {
      expect(s.open && (name === "lens" || name === "pile" || name === "pin"), `${name} has a colour this DOM keeps`).toBe(true);
      ink = bg;
    }
    out[name] = fills(theme, color, s.open).map((f) => ratio(over(ink as Rgb, drawn.opacity[name], f), f));
  }
  return out;
}

describe.each(CELLS)("the pile plate in the %s theme, %s colours", (theme, color) => {
  it("at rest: the sign and figure, each glyph and the pin read 3 to 1 or more on every ground", () => {
    for (const [name, rs] of Object.entries(pileRatios(theme, color, { dim: false, glyphDim: LIT, open: false }))) {
      for (const r of rs) expect(r, `${name} at rest`).toBeGreaterThanOrEqual(3);
    }
  });

  it("inverted: the sign and figure, each glyph and the pin read 3 to 1 or more", () => {
    for (const [name, rs] of Object.entries(pileRatios(theme, color, { dim: false, glyphDim: LIT, open: true }))) {
      for (const r of rs) expect(r, `${name} inverted`).toBeGreaterThanOrEqual(3);
    }
  });

  it("dimmed, at rest and inverted: every dimmed part reads 3 to 1 or more", () => {
    for (const open of [false, true]) {
      for (const [name, rs] of Object.entries(pileRatios(theme, color, { dim: true, glyphDim: DIMMED, open }))) {
        for (const r of rs) expect(r, `${name} dimmed${open ? " and inverted" : ""}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("a dimmed part reads no brighter than the same part at rest, and at most 4.5 where the rest reads 4.5 or more", () => {
    for (const open of [false, true]) {
      const full = pileRatios(theme, color, { dim: false, glyphDim: LIT, open });
      const dimmed = pileRatios(theme, color, { dim: true, glyphDim: DIMMED, open });
      for (const name of PILE_NAMES) {
        if (name === "pin") continue;
        full[name].forEach((f, i) => {
          const d = dimmed[name][i];
          expect(d, `${name} dimmed ${d.toFixed(2)} against ${f.toFixed(2)}`).toBeLessThanOrEqual(f + 1e-9);
          if (f >= 4.5) expect(d, `${name} dimmed ${d.toFixed(2)} where the full reads ${f.toFixed(2)}`).toBeLessThanOrEqual(4.5);
        });
      }
    }
  });

  it("a dim glyph and a lit glyph on one plate: the dim one reads lower than its own lit self, the lit one is unmoved, both 3 or more", () => {
    for (const open of [false, true]) {
      const allLit = pileRatios(theme, color, { dim: false, glyphDim: LIT, open });
      const mixed = pileRatios(theme, color, { dim: false, glyphDim: { pass: true, fail: false, wait: true }, open });
      for (const name of ["check", "hourglass"] as const) {
        mixed[name].forEach((m, i) => {
          expect(m, `${name} dim ${m.toFixed(2)} against its lit self ${allLit[name][i].toFixed(2)}`).toBeLessThan(allLit[name][i]);
          expect(m, name).toBeGreaterThanOrEqual(3);
        });
      }
      mixed.cross.forEach((m, i) => {
        expect(m).toBeCloseTo(allLit.cross[i], 9);
        expect(m).toBeGreaterThanOrEqual(3);
      });
      // The lens and the figure of a pile that is not dim are whole.
      for (const name of ["lens", "pile", "pin"] as const) mixed[name].forEach((m, i) => expect(m).toBeCloseTo(allLit[name][i], 9));
    }
  });

  it("the pin keeps its full ink when the pile's contents dim", () => {
    for (const open of [false, true]) {
      const full = drawPile(theme, color, { dim: false, glyphDim: LIT, open });
      const dimmed = drawPile(theme, color, { dim: true, glyphDim: DIMMED, open });
      expect(dimmed.raw.pin).toBe(full.raw.pin);
      expect(dimmed.opacity.pin).toBe(1);
      expect(full.opacity.pin).toBe(1);
    }
  });

  it("the sign and figure at rest are the muted ink, and inverted the same ink as the lens", () => {
    const rest = drawPile(theme, color, { dim: false, glyphDim: LIT, open: false });
    expect(rest.raw.pile).toBe("var(--text-muted)");
    expect(rest.raw.lens).toBe("var(--text)");
    const open = drawPile(theme, color, { dim: false, glyphDim: LIT, open: true });
    expect(open.raw.pile).toBe(open.raw.lens);
  });
});

describe("the plate at rest is as it was", () => {
  it.each(CELLS)("%s, %s: the colours are the same strings, no part dims, the pin is the text colour", (theme, color) => {
    const rest = draw(theme, color, false, false);
    expect(rest.raw.lens).toBe("var(--text)");
    expect(rest.raw.count).toBe("var(--text)");
    expect(rest.raw.pin).toBe("var(--text)");
    expect(rest.raw.check).toBe("var(--verdict-pass-on-panel)");
    expect(rest.raw.cross).toBe("var(--alarm-on-panel)");
    expect(rest.raw.hourglass).toBe("var(--verdict-wait-on-panel)");
    for (const name of NAMES) expect(rest.opacity[name], name).toBe(1);
  });

  // The rest ratios over the page background, from the code as it stood before the fix (2 decimals).
  const PINNED: Record<string, Record<string, number>> = {
    "dark/rainbow": { lens: 16.01, count: 16.01, check: 8.76, cross: 6.98, hourglass: 9.93, pin: 16.01 },
    "dark/neon": { lens: 16.01, count: 16.01, check: 13.44, cross: 6.6, hourglass: 12.5, pin: 16.01 },
    "dark/deuteranopia": { lens: 16.01, count: 16.01, check: 11.41, cross: 6.98, hourglass: 15.64, pin: 16.01 },
    "dark/protanopia": { lens: 16.01, count: 16.01, check: 11.41, cross: 6.98, hourglass: 15.64, pin: 16.01 },
    "dark/tritanopia": { lens: 16.01, count: 16.01, check: 12.32, cross: 6.98, hourglass: 10.1, pin: 16.01 },
    "dark/monochrome": { lens: 16.01, count: 16.01, check: 13.69, cross: 19.33, hourglass: 7.94, pin: 16.01 },
    "light/rainbow": { lens: 17.84, count: 17.84, check: 6.08, cross: 6.34, hourglass: 7.73, pin: 17.84 },
    "light/neon": { lens: 17.84, count: 17.84, check: 6.22, cross: 6.34, hourglass: 7.66, pin: 17.84 },
    "light/deuteranopia": { lens: 17.84, count: 17.84, check: 6.31, cross: 6.34, hourglass: 7.77, pin: 17.84 },
    "light/protanopia": { lens: 17.84, count: 17.84, check: 6.31, cross: 6.34, hourglass: 7.77, pin: 17.84 },
    "light/tritanopia": { lens: 17.84, count: 17.84, check: 6.14, cross: 6.34, hourglass: 7.63, pin: 17.84 },
    "light/monochrome": { lens: 17.84, count: 17.84, check: 14.73, cross: 20.44, hourglass: 7.73, pin: 17.84 },
  };

  it.each(CELLS)("%s, %s: the ratios over the page match the pinned values", (theme, color) => {
    const r = ratios(theme, color, false, false);
    const got: Record<string, number> = {};
    for (const name of NAMES) got[name] = Math.round(r[name][0] * 100) / 100;
    expect(got, `${theme}/${color}`).toEqual(PINNED[`${theme}/${color}`] ?? { missing: 0 });
  });
});
