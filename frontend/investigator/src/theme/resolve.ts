// frontend/investigator/src/theme/resolve.ts
import { PALETTES, type ThemePalette } from "./tokens";
import type { Theme, ColorMode } from "./axes";
import { slotFor, type RampSlot } from "./entity-mapping";
import { hexToRgb01 } from "./to-rgb";

/**
 * Return the full ThemePalette for the given theme × color-mode combination.
 */
export function resolvePalette(theme: Theme, color: ColorMode): ThemePalette {
  return PALETTES[theme][color];
}

/**
 * Resolve a palette slot to a concrete hex string within a given palette.
 *
 * - `"alarm"` → the dedicated alarm channel (colorblind-safe)
 * - `"textFaint"` → the neutral text-faint token
 * - `"r0"` .. `"r4"` → the corresponding ramp entry
 */
export function colorForSlot(slot: RampSlot, p: ThemePalette): string {
  if (slot === "alarm") return p.alarm;
  if (slot === "textFaint") return p.neutral.textFaint;
  return p.ramp[slot];
}

/**
 * Resolve the hex color for an entity `kind` in the active (theme × color) palette.
 */
export function resolveEntityColorHex(
  kind: string,
  theme: Theme,
  color: ColorMode,
): string {
  return colorForSlot(slotFor(kind), resolvePalette(theme, color));
}

/**
 * Resolve the entity color as [r, g, b] in 0..1 range - suitable for WebGL uniforms.
 */
export function resolveEntityColorRgb01(
  kind: string,
  theme: Theme,
  color: ColorMode,
): [number, number, number] {
  return hexToRgb01(resolveEntityColorHex(kind, theme, color));
}
