// frontend/investigator/src/theme/legibility.ts
//
// WCAG contrast + a hue-preserving luminance clamp. The risk-ramp slots
// (entity-mapping.ts) are luminance-tuned for the GLOBE substrate - markers on
// the dark ocean/atmosphere. Reused verbatim as text/dots on the instrument
// PANEL they can collapse to ~1.1:1 (deuteranopia auth navy on the near-black
// panel). `legibleOnPanel` lightens (dark panel) or darkens (light panel) a slot
// color, holding its hue, until it clears a contrast floor - so a kind color can
// be mode-aware AND panel-legible. Pure functions; no fs, no Vite imports.

import { hexToRgb01 } from "./to-rgb";

type Rgb01 = [number, number, number];

/** WCAG relative luminance for an sRGB color in 0..1 channels. */
export function relativeLuminance([r, g, b]: Rgb01): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1..21), order-independent. */
export function contrastRatio(a: Rgb01, b: Rgb01): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// ── HSL round-trip (operating on 0..1 rgb) ──────────────────────────────────
export function rgbToHsl([r, g, b]: Rgb01): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgb01 {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (pp: number, qq: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return pp + (qq - pp) * 6 * tt;
    if (tt < 1 / 2) return qq;
    if (tt < 2 / 3) return pp + (qq - pp) * (2 / 3 - tt) * 6;
    return pp;
  };
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

export function rgb01ToHex([r, g, b]: Rgb01): string {
  const ch = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

const STEP = 0.01; // lightness increment per iteration (~2.5 of 255)

/** Source-over composite of an opaque `fg` painted at `alpha` over an opaque
 * `bg` (both 0..1 rgb). Used to model the ticker's breathing-pulse tint
 * (`rgb(var(--slot-rgb) / 0.10)`) painted over the instrument panel, so the
 * legibility clamp targets the surface as actually rendered, not the bare panel. */
export function compositeOver(fg: Rgb01, alpha: number, bg: Rgb01): Rgb01 {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

/**
 * Return a hex color derived from `fgHex` by holding its hue/saturation and
 * stepping its HSL lightness toward the panel-contrasting end (lighten on a dark
 * panel, darken on a light one) until it clears `minContrast` against `bg`. A
 * color that already clears the floor is returned unchanged (only normalized to
 * lower #rrggbb) - so vivid neon/alarm colors keep their punch and only the dim
 * CVD ramps get pulled into legibility.
 *
 * Guarantee: the returned hex clears `minContrast` for any REACHABLE floor. The
 * max contrast achievable against any background bottoms out at ~4.58:1 (a
 * mid-luminance bg, where neither white nor black is far), so WCAG AA (4.5) is
 * always reachable. For an unreachable floor (e.g. AAA 7:1 on a mid-luminance
 * bg) the loop exhausts at pure white/black and returns that best-achievable
 * extreme - which may be BELOW `minContrast`. Callers needing a hard AAA
 * guarantee must re-check `contrastRatio` on the result.
 *
 * @param fgHex  the slot color, e.g. "#00316F"
 * @param bg     the worst-case rendered background in 0..1 rgb - the worst panel
 *               gradient stop (dark→panelTop, light→panelFloor) with the pulse
 *               tint composited on, so every lighter/darker stop and pulse phase
 *               also clears the floor
 */
export function legibleOnPanel(fgHex: string, bg: Rgb01, minContrast = 4.5): string {
  const fg = hexToRgb01(fgHex);
  if (contrastRatio(fg, bg) >= minContrast) return rgb01ToHex(fg);

  const lighten = relativeLuminance(bg) < 0.5;
  const [h, s, l0] = rgbToHsl(fg);
  let l = l0;
  for (let i = 0; i < 110; i++) {
    l = lighten ? Math.min(1, l + STEP) : Math.max(0, l - STEP);
    // Evaluate contrast on the QUANTIZED hex (not the float): rounding to 8-bit
    // can shave contrast just under the floor, so the returned color must be the
    // one actually measured.
    const hex = rgb01ToHex(hslToRgb(h, s, l));
    if (contrastRatio(hexToRgb01(hex), bg) >= minContrast) return hex;
    if (l <= 0 || l >= 1) break;
  }
  // Hit the luminance bound (pure white/black) - return the extreme best effort.
  return rgb01ToHex(hslToRgb(h, s, l));
}
