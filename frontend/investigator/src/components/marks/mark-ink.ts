/**
 * What the plate draws in when it is not at rest: the decision glyph fitted to the inverted ground, and
 * the opacity a dimmed part is drawn at. At rest the plate keeps its theme variables untouched; this
 * file is read only when the plate is open or dimmed.
 *
 * The inverted plate's ground is the text colour, the far end from the panel the tone colours are
 * clamped to, so each decision glyph is stepped (the app's own `legibleOnPanel`: hue held, lightness
 * moved) to OPEN_GLYPH_TARGET over that ground. A dimmed part is drawn at the least opacity at which
 * it still measures DIM_TARGET over its ground, so it reads dimmer than the part at rest and never
 * under the 3 to 1 a graphical object needs. A pile's sign and figure are drawn in the muted ink at
 * rest, a dimmer ink than the lens, so they have an opacity of their own (`pileCount`); open they
 * take the open ink and the lens's opacity.
 *
 * Limits: the ground a dimmed part is measured over is the page background (the plate is that colour
 * at 0.9 over whatever is behind it, so the real ground moves by a tenth of the difference at most);
 * a part that already reads DIM_TARGET or less at rest has nothing to dim toward and keeps full
 * opacity. What this file does not do: it holds no words, no store, no clock and no colour token.
 */
import { contrastRatio, legibleOnPanel } from "../../theme/legibility";
import { resolvePalette } from "../../theme/resolve";
import { hexToRgb01 } from "../../theme/to-rgb";
import type { ColorMode, Theme } from "../../theme/axes";
import type { Disposition } from "../../lib/marks/types";

type Rgb01 = [number, number, number];

/** The contrast the decision glyph reaches on the inverted ground: above the 3 to 1 floor, so a dimmed one has room to read dimmer. */
export const OPEN_GLYPH_TARGET = 4.5;
/** The contrast a dimmed part reaches over its ground: between the 3 to 1 floor and the 4.5 a part at rest clears. */
export const DIM_TARGET = 4.0;
/** The least opacity a dimmed part is drawn at. */
const DIM_FLOOR = 0.2;

const ONPANEL_OF = { pass: "pass", fail: "alarm", wait: "wait" } as const;

/** `ink` painted at `alpha` over `under`, in 8-bit channels as a browser rounds them. */
function over(ink: Rgb01, alpha: number, under: Rgb01): Rgb01 {
  return ink.map((c, i) => Math.round((c * alpha + under[i] * (1 - alpha)) * 255) / 255) as Rgb01;
}

/**
 * The least opacity (to 0.01) at which `ink` over `fill` still measures `target`, or 1 when it does
 * not read `target` at full opacity. Contrast falls as opacity falls, so the first step that
 * reaches the target is the least.
 */
export function dimOpacity(ink: Rgb01, fill: Rgb01, target: number = DIM_TARGET): number {
  if (contrastRatio(ink, fill) <= target) return 1;
  for (let step = Math.round(DIM_FLOOR * 100); step < 100; step++) {
    if (contrastRatio(over(ink, step / 100, fill), fill) >= target) return step / 100;
  }
  return 1;
}

export interface PlateInk {
  /** The decision glyph's colour on the inverted plate (a #rrggbb); null at rest, where the glyph keeps its tone variable. */
  glyph: string | null;
  /** The opacity of a dimmed lens or count. */
  plain: number;
  /** The opacity of a dimmed decision glyph. */
  decision: number;
  /**
   * The opacity of a dimmed pile's sign and figure. Open, the same as `plain` (the sign takes the open
   * ink, as the lens does); at rest it is fitted to the muted ink the sign is drawn in there.
   */
  pileCount: number;
}

/** The plate's inks in one state of the theme, for the disposition it draws (none draws no glyph). */
export function plateInk(theme: Theme, color: ColorMode, disposition: Disposition, open: boolean): PlateInk {
  const { neutral, onPanel } = resolvePalette(theme, color);
  const bg = hexToRgb01(neutral.bg);
  const text = hexToRgb01(neutral.text);
  const fill = open ? text : bg;
  const plain = dimOpacity(open ? bg : text, fill);
  const pileCount = open ? plain : dimOpacity(hexToRgb01(neutral.textMuted), fill);
  if (disposition === "none") return { glyph: null, plain, decision: 1, pileCount };
  const tone = onPanel[ONPANEL_OF[disposition]];
  const glyphHex = open ? legibleOnPanel(tone, text, OPEN_GLYPH_TARGET) : tone;
  return { glyph: open ? glyphHex : null, plain, decision: dimOpacity(hexToRgb01(glyphHex), fill), pileCount };
}
