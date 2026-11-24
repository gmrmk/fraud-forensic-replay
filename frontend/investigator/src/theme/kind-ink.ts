// frontend/investigator/src/theme/kind-ink.ts
//
// The colours of a story's own kinds, for every theme and colour mode: option B of the theme-colour
// design, "the story's own colours, carried". A manifest declares one palette hex for each of its kinds
// (an organisation, a sign-in, a key event). Nothing mapped such a kind to a theme and mode, so it drew
// its fixed hex everywhere. This resolver gives each one a MARK colour (a dot, a swatch, a line: 3 to 1 on
// the surfaces a mark sits on) and a TEXT ink (4.5 to 1 on the panel and the window header).
//
// What it does: neon carries the manifest colour (dark: as declared; light: stepped to 3 to 1, and on
// again until it stands apart from a kind listed before it); a colour-vision mode gives each kind the
// colour of that mode's own ramp that is nearest to its manifest colour as that viewer sees it, with the
// two themes decided together; monochrome gives each kind a step of an equal-ratio grey ladder.
//
// What it does not do: a kind that has a palette slot (entity-mapping.ts KIND_SLOT) never enters it, and
// it holds no store, no DOM and no time. The hook that reads the stores is store/kind-ink.ts.
//
// Port of the designer's engine (the engine's constants are kept to the digit). Two departures:
// dark neon returns the manifest hex without the engine's step-on (the default look does
// not change), and in the light theme the floors are measured on the active mode's own glass (rainbow's
// glass is lighter-filled than the other five, so its marks are held to its own, darker, surface).
// The exported `atContrast` and `INK_BINDING_HEX` keep the firmed modes' surface; inside `storyInk` each
// mode's own surface is used.

import type { ScenarioNode } from "../lib/scenarios";
import { COLOR_MODES, THEMES, type ColorMode, type Theme } from "./axes";
import { KIND_SLOT } from "./entity-mapping";
import {
  compositeOver,
  contrastRatio,
  hslToRgb,
  legibleOnPanel,
  relativeLuminance,
  rgb01ToHex,
  rgbToHsl,
} from "./legibility";
import { hexToRgb01 } from "./to-rgb";
import { INSPECTOR_TEXT_TARGET, PALETTES, inspectorSurfaceOf } from "./tokens";

type Rgb01 = [number, number, number];

/** One kind's two colours, both lower-case #rrggbb. */
export interface KindInk {
  readonly mark: string;
  readonly text: string;
}
export type InkNode = Pick<ScenarioNode, "kind" | "palette" | "decision">;

/** Two kinds closer than this (OKLab, or the viewer's own distance) read as one. The engine's TH. */
const SEPARATION = 0.08;
/** A candidate this close to a verdict colour is dropped. The engine's VG. */
const VERDICT_GUARD = 0.04;
/** Where a colour-vision mode samples its ramp: the five stops and the mean of each neighbouring pair. */
const SAMPLES = ["r0", "r0|r1", "r1", "r1|r2", "r2", "r2|r3", "r3", "r3|r4", "r4"] as const;
/** How a sample is taken: as a mark (3 to 1), or stepped to a stated contrast. A colour-vision mode spends
 *  lightness, so five policies; neon spends hue and never builds candidates. */
const POLICIES = ["mark", 4, 5.5, 7.5, 10] as const;

// --- the surfaces (the engine's constants; the light glass is each mode's own, see the header) ---

const parseTriplet01 = (triplet: string): Rgb01 => {
  const [r, g, b] = triplet.split(/\s+/).map((n) => parseInt(n, 10) / 255);
  return [r, g, b];
};
const quantize8 = ([r, g, b]: Rgb01): Rgb01 => [
  Math.round(r * 255) / 255,
  Math.round(g * 255) / 255,
  Math.round(b * 255) / 255,
];

/** The surface a mark must clear 3 to 1 on, in one theme and mode: the lightest of the theme's four
 *  surfaces in dark (panelTop), the darkest in light (the glass tint at its fill over black, in 8 bits:
 *  the Timeline's glass, the readout's reference, tokens.ts `readoutSurface`). The glass is the mode's own. */
function bindingOf(theme: Theme, color: ColorMode): Rgb01 {
  const m = PALETTES[theme][color].material;
  return theme === "dark"
    ? parseTriplet01(m.panelTop)
    : quantize8(compositeOver(parseTriplet01(m.glassTint), m.glassFill, [0, 0, 0]));
}
const BINDING: Record<Theme, Record<ColorMode, Rgb01>> = {
  dark: Object.fromEntries(COLOR_MODES.map((c) => [c, bindingOf("dark", c)])) as Record<ColorMode, Rgb01>,
  light: Object.fromEntries(COLOR_MODES.map((c) => [c, bindingOf("light", c)])) as Record<ColorMode, Rgb01>,
};

/** The binding surface of the firmed modes (neon and the four others with the same glass fill), as hex. */
export const INK_BINDING_HEX: Readonly<Record<Theme, string>> = {
  dark: rgb01ToHex(BINDING.dark.neon),
  light: rgb01ToHex(BINDING.light.neon),
};

// --- colour arithmetic ported from the engine ---

const markOf = (hex: string, theme: Theme, color: ColorMode): string =>
  legibleOnPanel(hex, BINDING[theme][color], 3);

const textOf = (markHex: string, theme: Theme, color: ColorMode): string =>
  legibleOnPanel(markHex, inspectorSurfaceOf(PALETTES[theme][color]), INSPECTOR_TEXT_TARGET);

/** The colour with hue and saturation held at the least lightness step (0.01) from the end of the
 *  lightness range that reaches contrast `c` on `bg`: lighter than `bg` in dark, darker in light. The
 *  float accumulation of the loop is the engine's, kept as it is. A different stepper from `markOf`'s. */
function atContrastOn(hex: string, theme: Theme, c: number, bg: Rgb01): string {
  const [h, s] = rgbToHsl(hexToRgb01(hex));
  const at = (l: number) => rgb01ToHex(hslToRgb(h, s, l));
  const bgLum = relativeLuminance(bg);
  if (theme === "dark") {
    for (let l = 0; l <= 1.0001; l += 0.01) {
      const x = at(Math.min(1, l));
      const rgb = hexToRgb01(x);
      if (relativeLuminance(rgb) > bgLum && contrastRatio(rgb, bg) >= c) return x;
    }
    return at(1);
  }
  for (let l = 1; l >= -0.0001; l -= 0.01) {
    const x = at(Math.max(0, l));
    const rgb = hexToRgb01(x);
    if (relativeLuminance(rgb) < bgLum && contrastRatio(rgb, bg) >= c) return x;
  }
  return at(0);
}

/** `hex` stepped to contrast `c` on the binding surface of the firmed modes (INK_BINDING_HEX). */
export function atContrast(hex: string, theme: Theme, c: number): string {
  return atContrastOn(hex, theme, c, BINDING[theme].neon);
}

const mixHex = (a: string, b: string): string => {
  const p = hexToRgb01(a);
  const q = hexToRgb01(b);
  return rgb01ToHex([p[0] * 0.5 + q[0] * 0.5, p[1] * 0.5 + q[1] * 0.5, p[2] * 0.5 + q[2] * 0.5]);
};

/** A ramp stop of the mode ("r2"), or the mean of two neighbours ("r2|r3"). */
function sampleRaw(color: ColorMode, theme: Theme, name: string): string {
  const ramp = PALETTES[theme][color].ramp as unknown as Record<string, string>;
  const [a, b] = name.split("|");
  return b === undefined ? ramp[a] : mixHex(ramp[a], ramp[b]);
}

// OKLab (Ottosson 2020), sRGB in. The linearisation threshold is the sRGB standard's 0.04045 (not the
// 0.03928 of relativeLuminance): the engine has both, as the two standards have them.
const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function oklabLin([r, g, b]: readonly number[]): Rgb01 {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}
const oklab = (hex: string): Rgb01 => oklabLin(hexToRgb01(hex).map(lin));
const dE = (a: string, b: string): number => {
  const p = oklab(a);
  const q = oklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

/** The deuteranopia matrix as the designer recalled it (Machado 2009, severity 1.0), on linear rgb. It
 *  was recalled, not checked against its paper; kept as written. */
const DEUTERANOPIA_MATRIX: readonly (readonly number[])[] = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];
function simDeut(hex: string): Rgb01 {
  const v = hexToRgb01(hex).map(lin);
  const o = DEUTERANOPIA_MATRIX.map((r) => Math.min(1, Math.max(0, r[0] * v[0] + r[1] * v[1] + r[2] * v[2])));
  return oklabLin(o);
}
/** The distance as a red-green blind viewer sees it: the lower of two signals, a proxy that drops the
 *  OKLab a axis and the OKLab distance after the deuteranopia matrix. */
function dEdeut(a: string, b: string): number {
  const p = oklab(a);
  const q = oklab(b);
  const proxy = Math.hypot(p[0] - q[0], p[2] - q[2]);
  const s = simDeut(a);
  const t = simDeut(b);
  const sim = Math.hypot(s[0] - t[0], s[1] - t[1], s[2] - t[2]);
  return Math.min(proxy, sim);
}

/** How far apart two colours read in a mode: the contrast ratio in monochrome, the red-green blind
 *  viewer's distance in deuteranopia and protanopia (the designer's note: protanopia's ramp, alarm and
 *  verdict colours equal deuteranopia's, so one model serves both), and OKLab otherwise. There is no
 *  tritan model, so tritanopia and rainbow read by OKLab too. */
export function inkDistance(a: string, b: string, color: ColorMode): number {
  if (color === "monochrome") return contrastRatio(hexToRgb01(a), hexToRgb01(b));
  if (color === "deuteranopia" || color === "protanopia") return dEdeut(a, b);
  return dE(a, b);
}

const verdictMarks = (color: ColorMode, theme: Theme): string[] => {
  const v = PALETTES[theme][color].verdict;
  return [v.pass, v.wait, v.queue].map((h) => markOf(h, theme, color));
};

/** `n` greys, equal in contrast ratio from the extreme (white in dark, black in light) down to the floor
 *  grey: the engine's ladder. */
function ladder(n: number, theme: Theme, color: ColorMode): string[] {
  const ext = theme === "dark" ? "#ffffff" : "#000000";
  const floorGrey = markOf(theme === "dark" ? "#1a1a1a" : "#f2f2f2", theme, color);
  const le = relativeLuminance(hexToRgb01(ext)) + 0.05;
  const lf = relativeLuminance(hexToRgb01(floorGrey)) + 0.05;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out.push(floorGrey);
      break;
    }
    const y = Math.max(0, le * Math.pow(lf / le, i / (n - 1)) - 0.05);
    const c = y <= 0.0031308 ? y * 12.92 : 1.055 * Math.pow(y, 1 / 2.4) - 0.055;
    out.push(rgb01ToHex([c, c, c]));
  }
  return out;
}

// --- the rule ---

interface InkKind {
  kind: string;
  hex: string;
  decision: boolean;
}

/** The kinds that enter the rule, in manifest order: a node outside the palette slots with a #rrggbb
 *  palette. A slot kind never enters it (in the card story only `decision` does). */
export function inkKindsOf(nodes: readonly InkNode[]): InkKind[] {
  return nodes
    .filter((n) => !Object.prototype.hasOwnProperty.call(KIND_SLOT, n.kind) && /^#[0-9a-f]{6}$/i.test(n.palette))
    .map((n) => ({ kind: n.kind, hex: n.palette.toLowerCase(), decision: n.decision !== undefined }));
}

type Marks = Record<Theme, Map<string, string>>;
const newMarks = (): Marks => ({ dark: new Map(), light: new Map() });

/** Monochrome: a decision takes the mode's alarm; the others take the ladder in the order of their own
 *  manifest colour's luminance (lightest first in dark, darkest first in light). The index counts the
 *  decision places too, as the engine does. */
function monochromeMarks(K: InkKind[]): Marks {
  const out = newMarks();
  for (const theme of THEMES) {
    const st = ladder(K.length, theme, "monochrome");
    const rest = K.filter((k) => !k.decision).sort(
      (a, b) => relativeLuminance(hexToRgb01(b.hex)) - relativeLuminance(hexToRgb01(a.hex)),
    );
    if (theme === "light") rest.reverse();
    [...K.filter((k) => k.decision), ...rest].forEach((k, i) => {
      out[theme].set(k.kind, k.decision ? PALETTES[theme].monochrome.alarm.toLowerCase() : st[i]);
    });
  }
  return out;
}

/** Neon: dark carries the manifest colour as declared. Light steps it to 3 to 1, and on to
 *  higher contrast, half a step at a time up to 13, until it stands SEPARATION from every kind listed
 *  before it. */
function neonMarks(K: InkKind[]): Marks {
  const out = newMarks();
  for (const k of K) out.dark.set(k.kind, k.hex);
  const given: string[] = [];
  const near = (hex: string): number => (given.length ? Math.min(...given.map((g) => dE(hex, g))) : 99);
  for (const k of K) {
    let m = markOf(k.hex, "light", "neon");
    if (near(m) < SEPARATION) {
      let c = 3;
      while (near(m) < SEPARATION && c < 13) {
        c += 0.5;
        m = atContrastOn(k.hex, "light", c, BINDING.light.neon);
      }
    }
    given.push(m);
    out.light.set(k.kind, m);
  }
  return out;
}

interface Candidate {
  hex: Record<Theme, string>;
}

/** Rainbow, deuteranopia, protanopia and tritanopia: the two themes are decided together. A decision
 *  takes the mode's alarm. Every other kind takes, greedily and nearest first, a candidate colour from the
 *  mode's own ramp that stands SEPARATION from the alarm, the text colour and the kinds already given, and
 *  VERDICT_GUARD from the three verdict colours, in both themes. */
function nearestMarks(K: InkKind[], color: ColorMode): Marks {
  const out = newMarks();
  const d = (a: string, b: string) => inkDistance(a, b, color);
  const minTo = (hex: string, list: readonly string[]): number => (list.length ? Math.min(...list.map((h) => d(hex, h))) : 99);

  const reserved: Record<Theme, string[]> = { dark: [], light: [] };
  for (const k of K.filter((x) => x.decision)) {
    for (const t of THEMES) {
      const m = markOf(PALETTES[t][color].alarm, t, color);
      reserved[t].push(m);
      out[t].set(k.kind, m);
    }
  }
  const text: Record<Theme, string[]> = {
    dark: [PALETTES.dark[color].neutral.text],
    light: [PALETTES.light[color].neutral.text],
  };
  const verdict: Record<Theme, string[]> = { dark: verdictMarks(color, "dark"), light: verdictMarks(color, "light") };

  const C: Candidate[] = [];
  for (const name of SAMPLES) {
    for (const pol of POLICIES) {
      const at = (t: Theme) => {
        const raw = sampleRaw(color, t, name);
        return pol === "mark" ? markOf(raw, t, color) : atContrastOn(raw, t, pol, BINDING[t][color]);
      };
      const hex = { dark: at("dark"), light: at("light") };
      if (THEMES.some((t) => minTo(hex[t], verdict[t]) < VERDICT_GUARD)) continue;
      C.push({ hex });
    }
  }

  const left = K.filter((k) => !k.decision);
  while (left.length) {
    const clear = (c: Candidate) => THEMES.every((t) => minTo(c.hex[t], [...reserved[t], ...text[t]]) >= SEPARATION);
    const ok = C.filter(clear);
    let bestKind: InkKind | null = null;
    let bestCand: Candidate | null = null;
    let bd = 99;
    for (const k of left) {
      for (const c of ok) {
        const dd = d(k.hex, c.hex.dark) + d(k.hex, c.hex.light);
        if (dd < bd) {
          bd = dd;
          bestKind = k;
          bestCand = c;
        }
      }
    }
    if (!bestKind) {
      // None clears the guards: the first kind left takes the candidate farthest from them.
      bestKind = left[0];
      let best = -1;
      for (const c of C) {
        const dd = Math.min(...THEMES.map((t) => minTo(c.hex[t], [...reserved[t], ...text[t]])));
        if (dd > best) {
          best = dd;
          bestCand = c;
        }
      }
    }
    // A shortcut with a limit: with no candidate at all (every sample dropped by the verdict guard) the
    // kind keeps its own mark colour. No shipped mode drops them all.
    const hex: Record<Theme, string> = bestCand
      ? bestCand.hex
      : { dark: markOf(bestKind.hex, "dark", color), light: markOf(bestKind.hex, "light", color) };
    for (const t of THEMES) {
      out[t].set(bestKind.kind, hex[t]);
      reserved[t].push(hex[t]);
    }
    left.splice(left.indexOf(bestKind), 1);
  }
  return out;
}

type Both = Record<Theme, ReadonlyMap<string, KindInk>>;

function computeBoth(K: InkKind[], color: ColorMode): Both {
  const marks = color === "monochrome" ? monochromeMarks(K) : color === "neon" ? neonMarks(K) : nearestMarks(K, color);
  const own = (theme: Theme): ReadonlyMap<string, KindInk> => {
    // Built in manifest order, whatever order the marks were decided in.
    const m = new Map<string, KindInk>();
    for (const k of K) {
      const mark = marks[theme].get(k.kind);
      if (mark !== undefined) m.set(k.kind, { mark, text: textOf(mark, theme, color) });
    }
    return m;
  };
  return { dark: own("dark"), light: own("light") };
}

// A memo of a pure function: a new manifest is a new array and so a new entry, and an array that is
// edited in place after it was resolved would keep its first answer (a manifest is never edited in place).
const MEMO = new WeakMap<readonly InkNode[], Map<ColorMode, Both>>();

/** The marks and text inks of the story's own kinds in one theme and colour mode, in manifest order. Both
 *  themes of the mode are computed in one pass (the colour-vision rule is joint over them). */
export function storyInk(nodes: readonly InkNode[], theme: Theme, color: ColorMode): ReadonlyMap<string, KindInk> {
  let byColor = MEMO.get(nodes);
  if (!byColor) {
    byColor = new Map();
    MEMO.set(nodes, byColor);
  }
  let both = byColor.get(color);
  if (!both) {
    both = computeBoth(inkKindsOf(nodes), color);
    byColor.set(color, both);
  }
  return both[theme];
}
