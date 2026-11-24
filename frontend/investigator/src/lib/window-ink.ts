// frontend/investigator/src/lib/window-ink.ts
// The one fit of a window's kind colour to its header: the colour the title is drawn in (a text) and the
// colour a lit control's mark is drawn in. Pure: it draws nothing, holds no state and reads no clock.
// It lives here, not beside the record window, because the window frame (components/pivot) fits its own
// title, lit pin and lit flag with it, and the record window's folder imports the frame (a circle).
// It does not fit a line, a spine or a dog-ear: they are not text and keep the raw accent.
import { compositeOver, legibleOnPanel } from "../theme/legibility";
import { resolvePalette } from "../theme/resolve";
import type { ColorMode, Theme } from "../theme/axes";
import type { KindInk } from "../theme/kind-ink";

/** The contrast a window's title reaches on its header (WCAG 1.4.3, a text) and a lit control's mark
 *  reaches (WCAG 1.4.11, the mark of a control). */
export const TITLE_CONTRAST = 4.5;
export const PIN_CONTRAST = 3;

/**
 * The colour a window's title or lit control is drawn in: the accent with its hue held, its lightness
 * stepped (by the app's own `legibleOnPanel`, the fit the Layers menu uses) until it reaches
 * `minContrast` on the window's header. The header is `--panel-floor` at 0.85 over `--panel-base`, in
 * 8-bit channels as painted; it is the darker of the two surfaces in light and the panel itself is the
 * lighter in dark, so the fit uses the worse one in each theme and clears both. A value that is not
 * #rrggbb passes through (a CSS variable is already fitted per theme by the palette). The frame's line
 * and dog-ear keep the raw accent: they are not text.
 */
export function windowInk(accent: string, theme: Theme, color: ColorMode, minContrast: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return accent;
  const { panelBase, panelFloor } = resolvePalette(theme, color).material;
  const triplet = (t: string) => t.split(/\s+/).map((n) => Number(n) / 255) as [number, number, number];
  const base = triplet(panelBase);
  const header = compositeOver(triplet(panelFloor), 0.85, base).map((c) => Math.round(c * 255) / 255) as [
    number,
    number,
    number,
  ];
  return legibleOnPanel(accent, theme === "dark" ? base : header, minContrast);
}

/**
 * A window's kind colours in one theme and colour mode: the line (frame, spine, underline, dog-ear) and
 * the title. A story's own kind (one the resolver holds an entry for) takes its mark for the line and its
 * text ink for the title. Any other kind, a kind that has a palette slot among them, keeps `fallback` for
 * the line and today's fit of it for the title, so nothing but a story's own kinds moves.
 */
export function windowKindColours(
  kind: string,
  theme: Theme,
  color: ColorMode,
  ink: ReadonlyMap<string, KindInk>,
  fallback: string,
): { line: string; title: string } {
  const own = ink.get(kind);
  if (own) return { line: own.mark, title: own.text };
  return { line: fallback, title: windowInk(fallback, theme, color, TITLE_CONTRAST) };
}
