// The text size: one saved preference of four steps, and the one place that holds the factor.
// It is a UI preference only (the share link never carries it; `lib/share-link.ts` is an allowlist
// and does not name it). The steps and the first visit are starting values.
//
// The chrome is zoomed by this factor (the CSS `zoom` property, set from `--ts` on the root). A
// length that crosses from the window into the chrome is divided by it, and one that crosses out is
// multiplied. These two functions are the only arithmetic; every crossing in the code calls one.

/** Where the step is saved, beside `ffr.barsize`. The only place the key is spelled. */
export const TEXT_SIZE_KEY = "ffr.textsize";

export const TEXT_SIZES = [90, 100, 112, 125] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const DEFAULT_TEXT_SIZE: TextSize = 100;

/** The step a saved string names; anything but an exact match gives the default. Compared by array
 *  membership, so "constructor" and "__proto__" are not steps. */
export function parseTextSize(raw: string | null | undefined): TextSize {
  return TEXT_SIZES.find((s) => String(s) === raw) ?? DEFAULT_TEXT_SIZE;
}

/** The nearest step to a number; the default for a number that is not finite. */
export function clampTextSize(n: number): TextSize {
  if (!Number.isFinite(n)) return DEFAULT_TEXT_SIZE;
  return TEXT_SIZES.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best));
}

/** One step larger; the largest step stays. */
export function nextTextSize(size: TextSize): TextSize {
  return TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, TEXT_SIZES.indexOf(size) + 1)];
}

/** One step smaller; the smallest step stays. */
export function prevTextSize(size: TextSize): TextSize {
  return TEXT_SIZES[Math.max(0, TEXT_SIZES.indexOf(size) - 1)];
}

/** The scale of the chrome: the step over 100. Exactly 1 at the default, so nothing moves there. */
export function textFactor(size: TextSize): number {
  return size / 100;
}

/** A length in window pixels, as the chrome's own pixels (it enters the zoomed tree). */
export function windowToChrome(px: number, size: TextSize): number {
  return px / textFactor(size);
}

/** A length in the chrome's own pixels, as window pixels (it leaves the zoomed tree). */
export function chromeToWindow(px: number, size: TextSize): number {
  return px * textFactor(size);
}

/** The saved step. Never throws: a blocked or absent storage gives the default. The default
 *  storage is resolved inside the try, because merely touching `localStorage` can throw. */
export function readTextSize(storage?: Pick<Storage, "getItem">): TextSize {
  try {
    return parseTextSize((storage ?? localStorage).getItem(TEXT_SIZE_KEY));
  } catch {
    return DEFAULT_TEXT_SIZE;
  }
}

/** Save the step. Best-effort: a blocked or full storage is ignored, the step still holds for this
 *  session. */
export function writeTextSize(size: TextSize, storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? localStorage).setItem(TEXT_SIZE_KEY, String(size));
  } catch {
    /* best-effort: the step still holds for this session */
  }
}
