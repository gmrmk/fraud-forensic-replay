// frontend/investigator/src/theme/css-gen.ts
// Pure functions - no side effects, no fs, no Vite imports.
// Generates CSS custom-property blocks from the PALETTES table so that
// [data-theme="..."][data-color="..."] attribute combos on <html> resolve
// the right design tokens for UI components.
// Globe tokens are intentionally excluded - the WebGL globe reads PALETTES
// directly from JS; emitting them here would be dead CSS.

import { PALETTES, marksInkOf, inspectorTextOf, tagFillOf, type ThemePalette, type PaletteTable } from "./tokens";
import { THEMES, COLOR_MODES } from "./axes";
import { hexToRgbTriplet } from "./to-rgb";

/**
 * Produces one CSS rule-block for a single theme×color palette cell.
 * The selector is `[data-theme="<theme>"][data-color="<color>"]`.
 * Only ramp, alarm, neutral, and material vars are emitted - no globe.
 */
export function paletteToCssBlock(p: ThemePalette): string {
  const { theme, color, ramp, alarm, neutral, material, onPanel, verdict } = p;
  const tri = hexToRgbTriplet;
  const marks = marksInkOf(p);
  const inspector = inspectorTextOf(p);
  const tagFill = tagFillOf(p);

  const lines: string[] = [
    `[data-theme="${theme}"][data-color="${color}"] {`,
    // ── Ramp ──────────────────────────────────────────────────────────
    `  --r0: ${ramp.r0}; --r1: ${ramp.r1}; --r2: ${ramp.r2}; --r3: ${ramp.r3}; --r4: ${ramp.r4};`,
    // ── Alarm ─────────────────────────────────────────────────────────
    `  --alarm: ${alarm};`,
    // ── Neutral ───────────────────────────────────────────────────────
    `  --bg: ${neutral.bg}; --surface: ${neutral.surface}; --surface-raised: ${neutral.surfaceRaised};`,
    `  --hairline: ${neutral.hairline}; --text: ${neutral.text}; --text-muted: ${neutral.textMuted};`,
    `  --text-faint: ${neutral.textFaint}; --ink-900: ${neutral.ink900}; --ink-800: ${neutral.ink800};`,
    `  --ink-700: ${neutral.ink700}; --ink-600: ${neutral.ink600}; --ink-500: ${neutral.ink500};`,
    // ── Material ──────────────────────────────────────────────────────
    `  --panel-top: ${material.panelTop}; --panel-base: ${material.panelBase}; --panel-floor: ${material.panelFloor};`,
    `  --edge-light: ${material.edgeLight}; --edge-light-op: ${material.edgeLightOp};`,
    `  --edge-contact: ${material.edgeContact}; --edge-contact-op: ${material.edgeContactOp};`,
    `  --panel-hairline: ${material.panelHairline};`,
    `  --elev-ambient: ${material.elevAmbient}; --elev-raised: ${material.elevRaised}; --elev-focal: ${material.elevFocal};`,
    `  --panel-grain-op: ${material.panelGrainOp}; --panel-grain-blend: ${material.panelGrainBlend};`,
    `  --glass-tint: ${material.glassTint}; --glass-tint-lit: ${material.glassTintLit};`,
    `  --glass-fill: ${material.glassFill}; --glass-blur: ${material.glassBlur}; --glass-sat: ${material.glassSat};`,
    `  --glass-edge: ${material.glassEdge}; --glass-shadow: ${material.glassShadow}; --scrim-shadow: ${material.scrimShadow};`,
    // ── RGB triplets - the Tailwind bridge. Repointed config colors read these
    //    as `rgb(var(--x-rgb) / <alpha-value>)` so every existing utility
    //    (text-accent, bg-panel-bg, border-panel-border, ...) recolors per cell. ──
    `  --r0-rgb: ${tri(ramp.r0)}; --r1-rgb: ${tri(ramp.r1)}; --r2-rgb: ${tri(ramp.r2)}; --r3-rgb: ${tri(ramp.r3)}; --r4-rgb: ${tri(ramp.r4)};`,
    `  --alarm-rgb: ${tri(alarm)};`,
    `  --bg-rgb: ${tri(neutral.bg)}; --surface-rgb: ${tri(neutral.surface)}; --surface-raised-rgb: ${tri(neutral.surfaceRaised)}; --hairline-rgb: ${tri(neutral.hairline)};`,
    `  --text-rgb: ${tri(neutral.text)}; --text-muted-rgb: ${tri(neutral.textMuted)}; --text-faint-rgb: ${tri(neutral.textFaint)};`,
    // ── Panel-legible kind colors. Each kind-slot color clamped to
    //    clear WCAG AA on the instrument panel; the ticker dot/label read these as
    //    --kind-token so a kind is mode-aware AND legible (the raw globe slots are
    //    tuned for the dark globe and drop to ~1.1:1 as panel text). ──
    `  --r1-on-panel: ${onPanel.r1}; --r2-on-panel: ${onPanel.r2}; --r3-on-panel: ${onPanel.r3};`,
    `  --alarm-on-panel: ${onPanel.alarm}; --text-faint-on-panel: ${onPanel.textFaint};`,
    // The two slots a custom note can take beside r1 to r3, built the same way (legibleOnPanel).
    `  --r0-on-panel: ${onPanel.r0}; --r4-on-panel: ${onPanel.r4};`,
    // The clock readout's text colour (C2): r1 clamped against the playbar glass's own surface.
    `  --r1-readout: ${onPanel.readout};`,
    // The bar's 8 px captions (C2c): --text-muted darkened in light on the bar's darkest glass.
    `  --caption-on-glass: ${onPanel.caption};`,
    // The NARRATIVE header's text colour (C2): --text in light, the faint colour in dark.
    `  --narrative-header: ${onPanel.narrativeHeader};`,
    // The narrative row time's text colour (C2 margin): --text-muted darkened in light.
    `  --narrative-time: ${onPanel.narrativeTime};`,
    // The ticker's status time and count (C2 ticker margin): textFaint clamped on the row's pulse-peak tint.
    `  --ticker-status-on-panel: ${onPanel.tickerStatus};`,
    // The ticker's kind label (C2c): each kind's on-panel colour stepped on its own pulse-peak surface.
    // The row's --kind-label reads these; the dot keeps --kind-token. transfer reads --ticker-kind-auth.
    `  --ticker-kind-fraud: ${onPanel.tickerKind.fraud}; --ticker-kind-auth: ${onPanel.tickerKind.auth};`,
    `  --ticker-kind-login: ${onPanel.tickerKind.login}; --ticker-kind-account-event: ${onPanel.tickerKind.account_event};`,
    // ── Decision layer: PASS, WAITING and a model's queue flag (FAIL reads --alarm). ──
    `  --verdict-pass: ${verdict.pass}; --verdict-wait: ${verdict.wait}; --verdict-queue: ${verdict.queue};`,
    `  --verdict-pass-rgb: ${tri(verdict.pass)}; --verdict-wait-rgb: ${tri(verdict.wait)}; --verdict-queue-rgb: ${tri(verdict.queue)};`,
    `  --verdict-pass-on-panel: ${onPanel.pass}; --verdict-wait-on-panel: ${onPanel.wait}; --verdict-queue-on-panel: ${onPanel.queue};`,
    // ── The marks' ink (MARKS-INK): the ribbon and the band read these, each slot's colour clamped
    //    to RIBBON_TARGET on the ribbon's glass. Triplets, composed as rgb(var(--x-mark-rgb) / alpha). ──
    `  --r1-mark-rgb: ${tri(marks.r1)}; --r2-mark-rgb: ${tri(marks.r2)}; --r3-mark-rgb: ${tri(marks.r3)};`,
    `  --alarm-mark-rgb: ${tri(marks.alarm)}; --text-faint-mark-rgb: ${tri(marks.textFaint)};`,
    // ── The Inspector's text (BACKLOG item 16): each palette colour the Inspector prints as text,
    //    clamped to INSPECTOR_TEXT_TARGET on its panel. Hex, read as color: var(--x-on-inspector). ──
    `  --r1-on-inspector: ${inspector.r1}; --r2-on-inspector: ${inspector.r2}; --r3-on-inspector: ${inspector.r3}; --alarm-on-inspector: ${inspector.alarm};`,
    // The Inspector's grey: the faint neutral clamped to the same target on the same panel.
    `  --text-faint-on-inspector: ${inspector.textFaint};`,
    // -- The tags' fill: the count and the ML tag fill with their own colour at
    //    this percent. --tag-fill is the Inspector's (and the windows') value; the matches window's
    //    rule card sets --tag-fill from --tag-fill-card in index.css. --
    `  --tag-fill: ${tagFill.panel}%; --tag-fill-card: ${tagFill.card}%;`,
    `}`,
  ];

  return lines.join("\n");
}

/**
 * Concatenates all 12 (2 themes × 6 color-modes) CSS blocks in THEMES × COLOR_MODES order,
 * separated by a blank line for readability.
 */
export function allBlocksCss(table: PaletteTable): string {
  const blocks: string[] = [];
  for (const theme of THEMES) {
    for (const color of COLOR_MODES) {
      blocks.push(paletteToCssBlock(table[theme][color]));
    }
  }
  return blocks.join("\n\n");
}

// Re-export the canonical table so callers can do:
//   import { allBlocksCss, PALETTES } from "./css-gen";
// without touching tokens.ts directly (optional convenience).
export { PALETTES };
