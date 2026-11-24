// frontend/investigator/vite-plugin-theme-css.ts
// Vite virtual-module plugin that serves all 12 theme×color CSS blocks
// as a side-effect import ("virtual:theme.css").
// The CSS is generated at build/serve time from the same PALETTES source of
// truth used by the WebGL globe - no committed generated artifact.

import type { Plugin } from "vite";
import { allBlocksCss } from "./src/theme/css-gen";
import { PALETTES } from "./src/theme/tokens";

const VIRTUAL_ID = "virtual:theme.css";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

export function themeCssPlugin(): Plugin {
  return {
    name: "ffr-theme-css",
    resolveId(id: string): string | null {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id: string): string | null {
      return id === RESOLVED_ID ? allBlocksCss(PALETTES) : null;
    },
  };
}
