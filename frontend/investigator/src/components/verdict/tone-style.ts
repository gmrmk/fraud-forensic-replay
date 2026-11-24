/** Theme-token colours for each verdict tone: legible text plus the triplet var for tints. */
import type { VerdictTone } from "../../lib/verdicts";
import type { PopoutView } from "../../store/pivot";

export const TONE_STYLE: Record<VerdictTone | "queue", { text: string; rgb: string }> = {
  fail: { text: "var(--alarm-on-panel)", rgb: "--alarm-rgb" },
  pass: { text: "var(--verdict-pass-on-panel)", rgb: "--verdict-pass-rgb" },
  wait: { text: "var(--verdict-wait-on-panel)", rgb: "--verdict-wait-rgb" },
  queue: { text: "var(--verdict-queue-on-panel)", rgb: "--verdict-queue-rgb" },
  unknown: { text: "var(--text-muted)", rgb: "--text-faint-rgb" },
};

/** The neutral plate behind a globe mark's words: the theme background at 0.9, so the on-panel
 *  tone colours keep 4.5:1 over any basemap (at 0.86 four words fell just short over black). */
export const PLATE_ALPHA = 0.9;
export const PLATE = `rgb(var(--bg-rgb) / ${PLATE_ALPHA})`;

/** The popout view that shows a decision's notes. */
export const NOTES_VIEW: PopoutView = { type: "notes", label: "Notes" };
