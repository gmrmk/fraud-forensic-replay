// frontend/investigator/src/theme/to-rgb.ts

/**
 * Parse a CSS hex colour (#rrggbb or #rgb) into [r, g, b] 0..1 floats.
 * Throws on malformed input. Suitable for WebGL uniforms.
 */
export function hexToRgb01(hex: string): [number, number, number] {
  if (!hex.startsWith("#")) {
    throw new Error(`hexToRgb01: expected # prefix, got "${hex}"`);
  }
  const raw = hex.slice(1);
  let full: string;
  if (raw.length === 3) {
    // expand #rgb → #rrggbb
    full = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
  } else if (raw.length === 6) {
    full = raw;
  } else {
    throw new Error(
      `hexToRgb01: expected 3 or 6 hex digits after #, got "${raw}"`,
    );
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`hexToRgb01: non-hex characters in "${hex}"`);
  }
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Parse a hex colour and return "r, g, b" as 0..255 integers.
 * Suitable for use in CSS `rgba()` custom-property triplets.
 *
 * @example hexToRgbChannels("#00e5ff") // "0, 229, 255"
 */
export function hexToRgbChannels(hex: string): string {
  const [r, g, b] = hexToRgb01(hex);
  return `${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}`;
}

/**
 * Parse a hex colour and return "r g b" (space-separated 0..255 integers) - the
 * form CSS `rgb(R G B / <alpha>)` and Tailwind's `<alpha-value>` placeholder
 * require. Used to bridge the theme vars into the Tailwind palette so every
 * `text-accent`/`bg-panel-bg`/... utility recolors when the theme axis flips.
 *
 * @example hexToRgbTriplet("#00e5ff") // "0 229 255"
 */
export function hexToRgbTriplet(hex: string): string {
  const [r, g, b] = hexToRgb01(hex);
  return `${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`;
}

/**
 * Parse a hex colour and return an `rgba(r, g, b, a)` string.
 *
 * @example hexToRgba("#00e5ff", 0.5) // "rgba(0, 229, 255, 0.5)"
 */
export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb01(hex);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}
