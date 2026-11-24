// The text size store: the step the chrome is drawn at. It is a UI preference (this browser only,
// never the share link, never a clock). `applyTextSize` writes the factor to the root as `--ts`,
// which `index.css` turns into the zoom of every chrome root (`.chrome-zoom`) and into the two
// divided lengths `--vh-c` and `--bottom-stack-c`.
import { create } from "zustand";
import {
  chromeToWindow,
  readTextSize,
  textFactor,
  windowToChrome,
  writeTextSize,
  type TextSize,
} from "../lib/text-size";

/** Pure DOM side-effect: the factor on the root, the step beside it for a reader of the page. */
export function applyTextSize(size: TextSize): void {
  const el = document.documentElement;
  el.style.setProperty("--ts", String(textFactor(size)));
  el.setAttribute("data-text-size", String(size));
}

export interface TextSizeState {
  size: TextSize;
  setSize: (size: TextSize) => void;
}

export const useTextSize = create<TextSizeState>((set) => ({
  size: readTextSize(),
  setSize: (size) => {
    set({ size });
    applyTextSize(size);
    writeTextSize(size);
  },
}));

// Applied when this module loads, before any render, so the first measure is at the right scale.
applyTextSize(useTextSize.getState().size);

/** For code that is not a component: a window length as the chrome's pixels, at the step now held. */
export function windowToChromeNow(px: number): number {
  return windowToChrome(px, useTextSize.getState().size);
}

/** For code that is not a component: the chrome's pixels as a window length, at the step now held. */
export function chromeToWindowNow(px: number): number {
  return chromeToWindow(px, useTextSize.getState().size);
}
