// frontend/investigator/src/theme/axes.ts
export type Theme = "dark" | "light";
export type ColorMode =
  | "rainbow"
  | "neon"
  | "deuteranopia"
  | "protanopia"
  | "tritanopia"
  | "monochrome";

export const THEMES: readonly Theme[] = ["dark", "light"];
export const COLOR_MODES: readonly ColorMode[] = [
  "rainbow",
  "neon",
  "deuteranopia",
  "protanopia",
  "tritanopia",
  "monochrome",
];
export const DEFAULT_THEME: Theme = "dark";
// Default to the vivid "neon" ramp (bright cyan auth / amber / vivid red) so the
// app reads boldly in dark on first load. "rainbow" is the muted/editorial
// alternative, selectable via the switcher.
export const DEFAULT_COLOR: ColorMode = "neon";
