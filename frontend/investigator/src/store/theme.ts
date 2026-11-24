// frontend/investigator/src/store/theme.ts
import { create } from "zustand";
import {
  THEMES,
  COLOR_MODES,
  DEFAULT_THEME,
  DEFAULT_COLOR,
  type Theme,
  type ColorMode,
} from "../theme/axes";

const THEME_KEY = "ffr.theme";
const COLOR_KEY = "ffr.color";

const isTheme = (v: string | null): v is Theme =>
  !!v && (THEMES as readonly string[]).includes(v);
const isColor = (v: string | null): v is ColorMode =>
  !!v && (COLOR_MODES as readonly string[]).includes(v);

/** Init precedence: URL query param > localStorage > default. */
export function initialTheme(): Theme {
  const q = new URLSearchParams(window.location.search).get("theme");
  if (isTheme(q)) return q;
  try {
    const s = localStorage.getItem(THEME_KEY);
    if (isTheme(s)) return s;
  } catch {
    /* private mode / storage disabled */
  }
  return DEFAULT_THEME;
}

export function initialColor(): ColorMode {
  const q = new URLSearchParams(window.location.search).get("color");
  if (isColor(q)) return q;
  try {
    const s = localStorage.getItem(COLOR_KEY);
    if (isColor(s)) return s;
  } catch {
    /* */
  }
  return DEFAULT_COLOR;
}

/** Pure DOM side-effect - sets the two attributes the generated CSS keys off. */
export function applyThemeAttrs(theme: Theme, color: ColorMode): void {
  const el = document.documentElement;
  el.setAttribute("data-theme", theme);
  el.setAttribute("data-color", color);
}

export interface ThemeState {
  theme: Theme;
  color: ColorMode;
  setTheme: (t: Theme) => void;
  setColor: (c: ColorMode) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: initialTheme(),
  color: initialColor(),
  setTheme: (theme) => {
    set({ theme });
    applyThemeAttrs(theme, useTheme.getState().color);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* best-effort */
    }
  },
  setColor: (color) => {
    set({ color });
    applyThemeAttrs(useTheme.getState().theme, color);
    try {
      localStorage.setItem(COLOR_KEY, color);
    } catch {
      /* best-effort */
    }
  },
}));
