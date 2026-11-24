// frontend/investigator/src/theme/tokens.ts
import type { Theme, ColorMode } from "./axes";
import { THEMES, COLOR_MODES } from "./axes";
import { hexToRgb01 } from "./to-rgb";
import { legibleOnPanel, compositeOver, relativeLuminance, contrastRatio } from "./legibility";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface RiskRamp {
  r0: string;
  r1: string;
  r2: string;
  r3: string;
  r4: string;
}

export interface MaterialTokens {
  /** space-separated RGB triplets e.g. "34 42 54" */
  panelTop: string;
  panelBase: string;
  panelFloor: string;
  edgeLight: string;
  edgeLightOp: number;
  edgeContact: string;
  edgeContactOp: number;
  panelHairline: number;
  elevAmbient: string;
  elevRaised: string;
  elevFocal: string;
  panelGrainOp: number;
  panelGrainBlend: string;
  glassTint: string;
  glassTintLit: string;
  glassFill: number;
  glassBlur: string;
  glassSat: string;
  glassEdge: string;
  glassShadow: string;
  scrimShadow: string;
}

export interface NeutralTokens {
  bg: string;
  surface: string;
  surfaceRaised: string;
  hairline: string;
  text: string;
  textMuted: string;
  textFaint: string;
  ink900: string;
  ink800: string;
  ink700: string;
  ink600: string;
  ink500: string;
}

export interface GlobeTokens {
  sky: string;
  horizon: string;
  fog: string;
  atmoCore: string;
  atmoRim: string;
  discFill: string;
}

/**
 * Panel-legible kind colors. Each is the corresponding kind-slot
 * color (entity-mapping.ts: auth→r1, login→r2, account_event→r3, fraud→alarm,
 * place→textFaint) luminance-clamped to clear WCAG AA on the instrument panel.
 * The globe slots themselves are tuned for the dark globe substrate and read as
 * low as 1.1:1 as panel text; these are the panel-substrate variant. Keyed by
 * the five slots every entity kind maps to.
 */
export interface OnPanelTokens {
  r1: string;
  r2: string;
  r3: string;
  /** The two ramp slots a note can take beside r1 to r3 (custom notes): the slot clamped on the
   *  same surface as the three above. Emitted as --r0-on-panel and --r4-on-panel. */
  r0: string;
  r4: string;
  alarm: string;
  textFaint: string;
  /** Decision and queue words (capsules, flags, linked counts) at panel legibility. */
  pass: string;
  wait: string;
  queue: string;
  /** The clock readout's text colour: the r1 slot clamped, hue held, against the playbar
   *  glass's own darkest surface (see READOUT_TARGET). Emitted as --r1-readout. */
  readout: string;
  /** The NARRATIVE header's text colour: the body text
   *  colour in light (the faint colour read 3.1 to 1 on the card), today's faint colour in
   *  dark (it passes). Emitted as --narrative-header. */
  narrativeHeader: string;
  /** The narrative row time's text colour: the muted
   *  colour darkened in light to GREY_TARGET on the card's darkest measured surface; dark keeps
   *  the muted colour. Emitted as --narrative-time. */
  narrativeTime: string;
  /** The ticker's status time and count: textFaint clamped on the
   *  ticker row's own surface at the pulse peak (see TICKER_STATUS_TARGET). Emitted as
   *  --ticker-status-on-panel. */
  tickerStatus: string;
  /** The bar's 8 px captions: the muted colour darkened
   *  in light to CAPTION_TARGET on the bar's darkest glass; dark keeps the muted colour. Emitted as
   *  --caption-on-glass. */
  caption: string;
  /** The ticker's kind label: each kind's on-panel colour (the dot keeps it) stepped to
   *  TICKER_KIND_TARGET on that kind's own surface at the pulse peak. Emitted as
   *  --ticker-kind-<kind>; transfer reads auth's, place keeps --text-faint-on-panel. */
  tickerKind: { fraud: string; auth: string; login: string; account_event: string };
}

/** The decision layer's colours beside --alarm (FAIL): PASS green, WAITING amber, a model's
 *  queue flag blue. The word always carries the meaning; colour reinforces it. */
export interface VerdictTokens {
  pass: string;
  wait: string;
  queue: string;
}

export interface ThemePalette {
  theme: Theme;
  color: ColorMode;
  ramp: RiskRamp;
  alarm: string;
  material: MaterialTokens;
  neutral: NeutralTokens;
  globe: GlobeTokens;
  onPanel: OnPanelTokens;
  verdict: VerdictTokens;
}

export type PaletteTable = Record<Theme, Record<ColorMode, ThemePalette>>;

// ─── Neutral tokens ───────────────────────────────────────────────────────────

const NEUTRAL_DARK: NeutralTokens = {
  bg: "#0B0E13",
  // Kill-dull (M2-U1, 2026-06-19): surface/surfaceRaised lifted for real chromatic separation from
  // bg (was shadow-only, ~1.16:1); textMuted/textFaint raised to clear WCAG AA on the dark panels
  // (were 4.2:1 and 1.95:1 -> ~7:1 and ~4.5:1). Cool blue-grey hue held; light theme untouched.
  surface: "#181F2B",
  surfaceRaised: "#232C3B",
  hairline: "#2C343F",
  text: "#E6EAF0",
  textMuted: "#B6C0CE",
  textFaint: "#909AA8",
  ink900: "#0B0E13",
  ink800: "#141922",
  ink700: "#1C232E",
  ink600: "#232b37",
  ink500: "#2C343F",
};

const NEUTRAL_LIGHT: NeutralTokens = {
  bg: "#FBFCFD",
  surface: "#F2F4F7",
  surfaceRaised: "#FFFFFF",
  hairline: "#D7DCE3",
  text: "#10151C",
  // Darkened 2026-06-18: the prior muted/faint greys read as washed-out on the
  // light panels (faint #97A1AF was ~2:1). textFaint darkened again 2026-06-20
  // (M2 step A): #6C7686 still failed AA as panel text on the light panel stops
  // (4.31:1 panelTop, 3.73:1 panelFloor); #5D6776 clears 4.5:1 on the worst stop
  // (panelFloor 4.65:1). Guarded by tokens.test.ts panel-text legibility (light).
  textMuted: "#444E5C",
  textFaint: "#5D6776",
  ink900: "#FBFCFD",
  ink800: "#F2F4F7",
  ink700: "#FFFFFF",
  ink600: "#E7EBF0",
  ink500: "#DCE1E8",
};

const NEUTRAL_BY_THEME: Record<Theme, NeutralTokens> = {
  dark: NEUTRAL_DARK,
  light: NEUTRAL_LIGHT,
};

// ─── Material tokens ──────────────────────────────────────────────────────────

const MATERIAL_DARK: MaterialTokens = {
  panelTop: "34 42 54",
  panelBase: "20 25 34",
  panelFloor: "14 18 25",
  edgeLight: "255 255 255",
  edgeLightOp: 0.10,
  edgeContact: "0 0 0",
  edgeContactOp: 0.42,
  panelHairline: 0.10,
  elevAmbient:
    "0 1px 2px -1px rgba(0,0,0,0.50), 0 8px 20px -10px rgba(0,0,0,0.55)",
  elevRaised:
    "0 2px 4px -2px rgba(0,0,0,0.55), 0 18px 38px -14px rgba(0,0,0,0.62)",
  elevFocal:
    "0 3px 8px -2px rgba(0,0,0,0.60), 0 44px 84px -22px rgba(0,0,0,0.74)",
  panelGrainOp: 0.05,
  panelGrainBlend: "soft-light",
  glassTint: "20 25 34",
  glassTintLit: "34 46 68",
  glassFill: 0.52,
  glassBlur: "18px",
  glassSat: "150%",
  glassEdge: "255 255 255",
  glassShadow: "0 0 0",
  scrimShadow: "0 1px 2px rgba(0,0,0,0.45)",
};

const MATERIAL_LIGHT: MaterialTokens = {
  // Tinted light-gray cards (not pure white): the positron basemap is near-white
  // (#FBFCFD), so white panels vanished into it. A clear gray step separates the
  // card from the map (the macOS/Apple-Maps light idiom) (2026-06-18).
  panelTop: "245 248 251",
  panelBase: "235 239 245",
  panelFloor: "227 232 240",
  edgeLight: "255 255 255",
  edgeLightOp: 0.85,
  edgeContact: "40 54 74",
  edgeContactOp: 0.10,
  panelHairline: 0.10,
  // Light-mode panels are white cards on a near-white basemap; the bevel idiom
  // (white inset highlight) carries no weight here, so separation rides on the
  // drop shadow. Strengthened 2026-06-18 so the cards visibly float (the prior
  // 0.16-0.18 alphas read as washed-out / invisible on the positron basemap).
  elevAmbient:
    "0 1px 3px -1px rgba(40,54,74,0.20), 0 10px 24px -10px rgba(40,54,74,0.26)",
  elevRaised:
    "0 2px 6px -2px rgba(40,54,74,0.24), 0 22px 44px -16px rgba(40,54,74,0.34)",
  elevFocal:
    "0 4px 12px -3px rgba(40,54,74,0.28), 0 44px 86px -26px rgba(40,54,74,0.44)",
  panelGrainOp: 0.035,
  panelGrainBlend: "multiply",
  // Gray-tinted glass so the over-globe chrome reads as a surface, not clear
  // glass over a white map (matches the tinted instrument cards above).
  glassTint: "236 240 246",
  glassTintLit: "245 248 252",
  // 0.58 let the pale basemap bleed through the glass; 0.85 reads as a solid
  // light surface (the rainbow mode uses this base; firmed-up modes override).
  glassFill: 0.85,
  glassBlur: "16px",
  glassSat: "160%",
  glassEdge: "255 255 255",
  glassShadow: "40 54 74",
  scrimShadow: "0 1px 1px rgba(255,255,255,0.5)",
};

const MATERIAL_BY_THEME: Record<Theme, MaterialTokens> = {
  dark: MATERIAL_DARK,
  light: MATERIAL_LIGHT,
};

// ─── Glass firm-up overrides ──────────────────────────────────────────────────

/** Colors that receive the firm-up glass treatment (rainbow is excluded). */
const GLASS_FIRM_UP_COLORS = new Set<ColorMode>([
  "neon",
  "deuteranopia",
  "protanopia",
  "tritanopia",
  "monochrome",
]);

const GLASS_FIRM_UP_DARK: Partial<MaterialTokens> = {
  glassFill: 0.74,
  glassBlur: "11px",
  glassSat: "130%",
};

const GLASS_FIRM_UP_LIGHT: Partial<MaterialTokens> = {
  glassFill: 0.88,
  glassBlur: "9px",
  glassSat: "140%",
};

const GLASS_FIRM_UP_BY_THEME: Record<Theme, Partial<MaterialTokens>> = {
  dark: GLASS_FIRM_UP_DARK,
  light: GLASS_FIRM_UP_LIGHT,
};

// ─── Ramps ────────────────────────────────────────────────────────────────────

const RAMPS: Record<ColorMode, Record<Theme, RiskRamp>> = {
  rainbow: {
    dark: { r0: "#6E8BB0", r1: "#8FA3A0", r2: "#C9A86A", r3: "#D98A4E", r4: "#D7503A" },
    light: { r0: "#4E6E96", r1: "#6E8A86", r2: "#A9863F", r3: "#B8702F", r4: "#B23B28" },
  },
  neon: {
    // r2 (the login / identity slot) is MAGENTA in neon: login nodes
    // read magenta in the vivid mode, as they did
    // before entities became mode-aware ramp slots. r3 (elevated) is a vivid
    // orange, decoupled from the red --alarm channel - it used to
    // equal the neon alarm (#FF3D2E dark / #D62719 light), which made a DECLINE
    // pill and a REVIEW pill render identical in neon. Both are neon-only tweaks;
    // the CVD-safe ramps (deut/prot/trit/mono) are untouched, so login + the
    // verdict trio stay luminance-distinct where it matters.
    dark: { r0: "#0A2A38", r1: "#00E5FF", r2: "#FF5CE8", r3: "#FF7A1A", r4: "#FFFFFF" },
    light: { r0: "#0A2A38", r1: "#00A6B8", r2: "#C4138F", r3: "#C2520C", r4: "#1A1A1A" },
  },
  deuteranopia: {
    dark: { r0: "#00204D", r1: "#00316F", r2: "#767676", r3: "#C6B66B", r4: "#FFE946" },
    light: { r0: "#00204D", r1: "#31446B", r2: "#666970", r3: "#A99A5F", r4: "#FFE945" },
  },
  protanopia: {
    dark: { r0: "#00204D", r1: "#00316F", r2: "#767676", r3: "#C6B66B", r4: "#FFE946" },
    light: { r0: "#00204D", r1: "#31446B", r2: "#666970", r3: "#A99A5F", r4: "#FFE945" },
  },
  tritanopia: {
    dark: { r0: "#023858", r1: "#045A8D", r2: "#3690C0", r3: "#74A9CF", r4: "#D0D1E6" },
    light: { r0: "#045A8D", r1: "#2B8CBE", r2: "#74A9CF", r3: "#BDC9E1", r4: "#F1EEF6" },
  },
  monochrome: {
    dark: { r0: "#F2F2F2", r1: "#BFBFBF", r2: "#8C8C8C", r3: "#595959", r4: "#1A1A1A" },
    light: { r0: "#1A1A1A", r1: "#595959", r2: "#8C8C8C", r3: "#BFBFBF", r4: "#F2F2F2" },
  },
};

// ─── Alarm values ─────────────────────────────────────────────────────────────

const ALARM_BASE: Record<Theme, string> = {
  dark: "#FF6B35",
  // Nudged #D55E00 -> #D62719 so alarm TEXT (StalenessBanner, loadError)
  // clears WCAG AA. #D62719 still failed AA as panel text on
  // the lower light panel stops (4.37:1 panelBase, 4.10:1 panelFloor); nudged to
  // #C9221A, which clears 4.5:1 on every light panel surface (panelFloor 4.58:1).
  // --alarm is the shared fraud+alarm channel, so this also reshades light-mode fraud
  // markers to the slightly deeper red (verify the light globe markers + BLOCKED pill).
  light: "#C9221A",
};

const ALARM_OVERRIDES: Partial<Record<ColorMode, Partial<Record<Theme, string>>>> = {
  // neon-light alarm override (#D62719) DROPPED M2 step A (2026-06-20): on the
  // post-2026-06-18 darker light panels it was sub-AA as panel text (4.37:1 panelBase,
  // 4.10:1 panelFloor), and neon is the DEFAULT color mode - so the most-seen view kept
  // a sub-AA alarm-text gap. It now falls back to ALARM_BASE.light (#C9221A, AA-clear on
  // every light stop). neon-DARK keeps its vivid #FF3D2E (bright red on the dark panel).
  neon: { dark: "#FF3D2E" },
  monochrome: { dark: "#FFFFFF", light: "#000000" },
};

function resolveAlarm(color: ColorMode, theme: Theme): string {
  return ALARM_OVERRIDES[color]?.[theme] ?? ALARM_BASE[theme];
}

// ─── Verdict colours ──────────────────────────────────────────────────────────
// The CVD rows keep the four verdicts (with --alarm) luminance- or hue-separated where that mode
// can see it; in monochrome the word carries the meaning, as with DECLINE / REVIEW / ALLOW.

const VERDICT: Record<ColorMode, Record<Theme, VerdictTokens>> = {
  rainbow: {
    dark: { pass: "#7DBE7A", wait: "#E3B341", queue: "#5E9BE0" },
    light: { pass: "#2F7D32", wait: "#9A6B00", queue: "#2A62B0" },
  },
  neon: {
    dark: { pass: "#39F58A", wait: "#FFC83D", queue: "#3D8BFF" },
    light: { pass: "#0B8A3C", wait: "#A86F00", queue: "#1557C9" },
  },
  deuteranopia: {
    dark: { pass: "#9CCBFF", wait: "#FFE946", queue: "#7A7CFF" },
    light: { pass: "#24609E", wait: "#857500", queue: "#4A43C4" },
  },
  protanopia: {
    dark: { pass: "#9CCBFF", wait: "#FFE946", queue: "#7A7CFF" },
    light: { pass: "#24609E", wait: "#857500", queue: "#4A43C4" },
  },
  tritanopia: {
    dark: { pass: "#5FE3D0", wait: "#FF9EC8", queue: "#A9B9FF" },
    light: { pass: "#0A7A6E", wait: "#B3306E", queue: "#3F55C8" },
  },
  monochrome: {
    dark: { pass: "#D9D9D9", wait: "#A6A6A6", queue: "#8C8C8C" },
    light: { pass: "#262626", wait: "#595959", queue: "#737373" },
  },
};

// ─── Globe tokens ─────────────────────────────────────────────────────────────

interface GlobeBase {
  sky: string;
  horizon: string;
  fog: string;
  atmoCore: string;
  atmoRim: string;
  discFill: string;
}

const GLOBE_BY_THEME: Record<Theme, GlobeBase> = {
  dark: {
    sky: "#000814",
    horizon: "#001a33",
    fog: "#000814",
    atmoCore: "rgba(96,170,235,0.62)",
    atmoRim: "rgba(150,205,255,0.90)",
    discFill: "#0E141C",
  },
  // Light theme keeps DARK space tokens - "lit planet on dark space" (Apple-Maps /
  // Google-Earth model); space is theme-independent. NOTE (verified by live probe
  // 2026-06-18): under GLOBE projection maplibre's setSky sky/horizon/fog colors are
  // INERT (issue #5230) - the off-globe void is whatever sits BEHIND the transparent
  // canvas, and is fixed by the .globe-space CSS backdrop (index.css + App.tsx), NOT
  // by these tokens. The earlier pale daytime-blue (#CFE0F2…) was a red herring: it
  // never painted the void; the near-white bg-ground page showing through did. These
  // dark values are kept as the correct semantic + a Mercator-projection fallback
  // (where setSky IS honored). atmoCore/atmoRim are a latent rim-light seam (unused);
  // discFill is unused.
  light: {
    sky: "#050B18",
    horizon: "#0E2A52",
    fog: "#050B18",
    atmoCore: "rgba(90,150,220,0.46)",
    atmoRim: "rgba(120,175,235,0.80)",
    discFill: "#DDE6F0",
  },
};

// ─── Builder ──────────────────────────────────────────────────────────────────

/** The ticker breathing-pulse peak alpha - must match the `--ticker-pulse-high`
 *  declarations in index.css (rgb(var(--slot-rgb) / 0.10)). The on-panel kind
 *  colors are clamped against the panel with this much kind-tint composited on. */
const PULSE_PEAK_ALPHA = 0.1;

/** The contrast target of the clock readout, the one constant behind --r1-readout. The readout is 10 px text at weight 500
 *  read by pixels: antialiasing lowers the pixel ratio to as little as 0.769 of the computed
 *  one (dark text on light, the sweep's lowest proportion), so a computed 4.5 / 0.769 = 5.85
 *  is the least that holds both signals, and a coverage model fitted to the sweep's own rows
 *  predicts every cell above 4.5 at 6.0.
 *  The clamp runs against the bar's own darkest surface, not the opaque panel's. */
const READOUT_TARGET = 6.0;

/** The contrast target of the grey texts: the readout's rule on each
 *  text's own surface, 6.0 computed. The pixel reading was measured, not modelled: every colour
 *  built on it was injected on the built site and read over 4.5 by pixel mean in every camera
 *  except the light copyright mark, which takes --text for that reason, and the ticker's status
 *  time and count, which the sweep found under it at the pulse peak (TICKER_STATUS_TARGET). A
 *  colour is the least lightness step from today's token (hue and saturation held) that clears
 *  it, by legibleOnPanel, on a MEASURED surface named below, not the pulse-tinted worst stop. */
export const GREY_TARGET = 6.0;

/** The contrast target of the ticker's status time and count: the
 *  grey margin's 6.0 on the row's own surface at the pulse peak, by the same derivation. The row
 *  paints its kind's slot at PULSE_PEAK_ALPHA over panelBase, so the clamp against the bare panel
 *  (GREY_TARGET) read 5.30 to 5.65 on the light tints. The derivation, in full: start from
 *  the grey texts' value (onPanel.textFaint) and take the least further lightness step (legibleOnPanel; hue
 *  and saturation held, darker in light, lighter in dark) that reaches 6.0 on the darkest (light)
 *  or lightest (dark) of the six kinds' peak surfaces, each surface rounded to the 8-bit channels
 *  the page composites in. The rounding is what makes a target of 6.0 enough: on the float
 *  surface light monochrome keeps #454c57, which reads 5.99 on the page (the 8-bit fraud tint
 *  #d3d7dd), and a guard of 0.1 on the float surface instead overshoots dark neon to #a4adb7.
 *  This gives all twelve values the deriver measured on the page (98 cells, 0 failed
 *  assertions); grey-margin-colour.test.ts pins them. */
export const TICKER_STATUS_TARGET = GREY_TARGET;

/** The contrast target of the bar's 8 px captions in light, the one constant behind
 *  --caption-on-glass: the lane's scale caption, a folded lane's and the rows' small version's caption,
 *  and the lane lines' second line. They are 8 px text at weight 500 on the bar's glass over the map, and
 *  the pixel leg binds, not the computed one: thin 8 px type loses about 45 percent of its ratio to
 *  antialiasing, so a value that reads 7.6 computed (#333a45) still read 4.0 to 4.2 by pixel mean in the
 *  solo state. The derivation: start from the muted colour (neutral.textMuted, #444E5C) and take the
 *  least further lightness step (legibleOnPanel; hue and saturation held) that reaches 8.6 computed on
 *  the glass at its darkest (the clock readout's reference, readoutSurface below). The deriver read that
 *  value on the built site over 4.5 by pixel mean on all 32 caption elements of its 12 cells in every
 *  palette (CAPTIONS.md section 2a, 156 page cells, 0 failed assertions): the words clear 4.5 first at
 *  #2a3039 (8.84 computed, 4.64 by pixels), and the one-digit lane count at #2a3039 too in five
 *  palettes and at #262b33 in rainbow, whose glass is darker (#c9ccd1), so 8.6 lands one rung lower
 *  there. Dark keeps --text-muted: it already reads 10.13 computed and 7.66 by pixels as built. The raw
 *  --text-muted is not changed: it also colours `5411 · US` (9 px), the kinds note, the arrows and the
 *  Tailwind -rgb bridge. */
export const CAPTION_TARGET = 8.6;

/** The contrast target of the ticker's kind label (AUTHORIZATION, FRAUD, LOGIN,
 *  ACCOUNT EVENT and the rest, 10 px, weight 500, tracking 0.18em): the grey margin's 6.0 computed on the
 *  label's own surface, which is the kind's slot at PULSE_PEAK_ALPHA over panelBase in 8 bits, the same
 *  surface the status time and count take (TICKER_STATUS_TARGET). One value per kind, because each kind
 *  has its own token; it starts from that kind's on-panel colour (the --x-on-panel value the dot keeps)
 *  and takes the least further lightness step (legibleOnPanel; hue and saturation held, darker in light,
 *  lighter in dark). A colour that already clears is returned unchanged: light deuteranopia and
 *  protanopia auth, light monochrome fraud, dark neon and monochrome auth, dark monochrome fraud, dark
 *  rainbow login and dark deuteranopia and protanopia account_event. The deriver read every value on the
 *  built site at 6.0 computed or more and over 4.5 by pixel mean in all 156 cells (the lowest 4.69, light
 *  tritanopia auth). */
export const TICKER_KIND_TARGET = GREY_TARGET;

/** The one exception to TICKER_KIND_TARGET: login in light deuteranopia, protanopia and monochrome. The
 *  model puts the 6.0 value (#505258, #505258, #545454) at 6.006, 6.006 and 6.001 on the peak surface, but
 *  the page read them at 5.99, 5.99 and 5.985, under the rule's 6.0, so the deriver took the next rung of
 *  its ladder, target 6.1 (#4d5055, #4d5055, #525252: 6.21, 6.21 and 6.18 computed, 5.02 pixel mean at the
 *  lowest). The cells are named here, not found by a margin rule, because the page's reading is the
 *  record and the model cannot predict a 0.01 shortfall. */
export const TICKER_KIND_PAGE_TARGET = 6.1;
export const TICKER_KIND_PAGE_TARGET_CELLS: ReadonlySet<string> = new Set([
  "light.deuteranopia.login",
  "light.protanopia.login",
  "light.monochrome.login",
]);

/** The light narrative card's darkest measured pixel surface (late cameras). The card's material
 *  model (panelFloor at 0.86 over black, `#c3c8ce`) is lighter than this, so a material-derived
 *  reference would under-clamp. A literal, copied from the sweep (MARGIN.md section 4); it holds
 *  only while the card's fill and the void behind it are as measured. */
export const NARRATIVE_FLOOR = "#BBBFC3";

/** The alpha of the plate behind a globe mark's words (the WAITING tag): equal to PLATE_ALPHA in
 *  components/verdict/tone-style.ts, which this file cannot import. grey-margin-colour.test.ts
 *  pins that the two agree. */
export const GREY_PLATE_ALPHA = 0.9;

/** Parse a "r g b" material triplet (0..255) into 0..1 rgb for the contrast math. */
function parseTriplet01(triplet: string): [number, number, number] {
  const [r, g, b] = triplet.split(/\s+/).map((n) => parseInt(n, 10) / 255);
  return [r, g, b];
}

/** Round a 0..1 rgb colour to the 8-bit channels a browser composites in. */
function quantize8([r, g, b]: [number, number, number]): [number, number, number] {
  return [Math.round(r * 255) / 255, Math.round(g * 255) / 255, Math.round(b * 255) / 255];
}

function buildCell(theme: Theme, color: ColorMode): ThemePalette {
  const ramp = RAMPS[color][theme];
  const alarm = resolveAlarm(color, theme);
  const verdict = VERDICT[color][theme];

  const baseMaterial = MATERIAL_BY_THEME[theme];
  const material: MaterialTokens = GLASS_FIRM_UP_COLORS.has(color)
    ? { ...baseMaterial, ...GLASS_FIRM_UP_BY_THEME[theme] }
    : { ...baseMaterial };

  const neutral = NEUTRAL_BY_THEME[theme];

  const globe: GlobeTokens = { ...GLOBE_BY_THEME[theme] };

  // Panel-legible kind colors: clamp each kind-slot color toward the
  // panel-contrasting end until it clears WCAG AA on the rendered ticker surface.
  // The panel is a gradient (panelTop..panelFloor); the worst stop per theme
  // (dark→panelTop is the lightest, light→panelFloor the darkest) governs, and
  // every other stop clears with more margin. panelTop/panelFloor are unaffected
  // by the glass firm-up. The .event row also paints the breathing-pulse tint
  // (the kind slot at up to 0.10 alpha) OVER the panel, and the dot/label sit on
  // THAT - so clamp against the composited surface (panel ⊕ slot@0.10), not the
  // bare panel, or the pulse peak dips the label under AA (review 2026-06-17).
  const worstStop = parseTriplet01(theme === "dark" ? material.panelTop : material.panelFloor);
  const tintedBg = (slotHex: string) =>
    compositeOver(hexToRgb01(slotHex), PULSE_PEAK_ALPHA, worstStop);
  // The clock readout sits on the .glass bar over the map canvas, not on the opaque panel. Its
  // darkest surface in light is the glass tint at its fill over black (a backdrop cannot be
  // darker: `#c9ccd1` for rainbow, `#d0d3d8` for the firmed modes); in dark the lightest
  // modelled stop, panelTop (`#222a36`). Both are measured (the sweep) and neither lets
  // legibleOnPanel's own direction rule (luminance under 0.5 lightens) pick the wrong end.
  const readoutSurface =
    theme === "dark"
      ? parseTriplet01(material.panelTop)
      : compositeOver(parseTriplet01(material.glassTint), material.glassFill, [0, 0, 0]);
  // The grey margin. textFaint is clamped on a MEASURED surface, not the pulse-tinted
  // worst stop: panelBase in light (the identity card, `#ebeff5`), panelTop in dark (`#222a36`, the
  // lightest modelled stop). The ticker's status time and count are NOT on those surfaces at the
  // pulse peak and take tickerStatus below. The dark narrative header takes this value.
  const faintOnPanel = legibleOnPanel(
    neutral.textFaint,
    parseTriplet01(theme === "dark" ? material.panelTop : material.panelBase),
    GREY_TARGET,
  );
  // The ticker's status time and count (the ticker's margin). The row paints the kind's slot at the
  // pulse peak over panelBase (not the bare panel, not tintedBg's panelFloor or panelTop), the page
  // composites it in 8 bits, and the one token must hold on every kind: the darkest of the six
  // peak surfaces in light, the lightest in dark. place tints with --text-faint-rgb.
  const peakSurface = (slotHex: string) =>
    quantize8(compositeOver(hexToRgb01(slotHex), PULSE_PEAK_ALPHA, parseTriplet01(material.panelBase)));
  const tickerSlots = [alarm, ramp.r1, ramp.r2, ramp.r3, neutral.textFaint];
  const tickerSurfaces = tickerSlots.map(peakSurface);
  const tickerSurface = tickerSurfaces.reduce((a, b) =>
    (relativeLuminance(b) < relativeLuminance(a)) === (theme === "light") ? b : a,
  );
  const tickerStatus = legibleOnPanel(faintOnPanel, tickerSurface, TICKER_STATUS_TARGET);
  // WAITING in light sits on the plate (--bg at the plate alpha over black, `#e2e3e4`), the darkest
  // the globe's tag can be; dark keeps the existing panel clamp (it reads 9.86 or more).
  const waitOnPanel =
    theme === "light"
      ? legibleOnPanel(
          verdict.wait,
          compositeOver(hexToRgb01(neutral.bg), GREY_PLATE_ALPHA, [0, 0, 0]),
          GREY_TARGET,
        )
      : legibleOnPanel(verdict.wait, tintedBg(verdict.wait));
  const r1OnPanel = legibleOnPanel(ramp.r1, tintedBg(ramp.r1));
  const r2OnPanel = legibleOnPanel(ramp.r2, tintedBg(ramp.r2));
  const r3OnPanel = legibleOnPanel(ramp.r3, tintedBg(ramp.r3));
  const alarmOnPanel = legibleOnPanel(alarm, tintedBg(alarm));
  // The ticker's kind label. It steps from the kind's on-panel colour (what the dot keeps) to
  // TICKER_KIND_TARGET on the kind's own peak surface, not on tintedBg's panelFloor or panelTop.
  // transfer reads auth's colour, as the stylesheet maps both kinds to r1.
  const kindLabel = (kind: string, slotHex: string, fromHex: string) =>
    legibleOnPanel(
      fromHex,
      peakSurface(slotHex),
      TICKER_KIND_PAGE_TARGET_CELLS.has(`${theme}.${color}.${kind}`) ? TICKER_KIND_PAGE_TARGET : TICKER_KIND_TARGET,
    );
  const onPanel: OnPanelTokens = {
    r1: r1OnPanel,
    r2: r2OnPanel,
    r3: r3OnPanel,
    r0: legibleOnPanel(ramp.r0, tintedBg(ramp.r0)),
    r4: legibleOnPanel(ramp.r4, tintedBg(ramp.r4)),
    alarm: alarmOnPanel,
    textFaint: faintOnPanel,
    pass: legibleOnPanel(verdict.pass, tintedBg(verdict.pass)),
    wait: waitOnPanel,
    queue: legibleOnPanel(verdict.queue, tintedBg(verdict.queue)),
    readout: legibleOnPanel(ramp.r1, readoutSurface, READOUT_TARGET),
    // Light: --text clears 9.9 to 1 on the card's darkest surface (#bbbfc3). Dark: the margin's
    // faint colour, lightened to 6.0 on panelTop.
    narrativeHeader: theme === "light" ? neutral.text : faintOnPanel,
    // Light: the muted colour darkened to 6.0 on the card's darkest measured surface. Dark keeps it.
    narrativeTime:
      theme === "light"
        ? legibleOnPanel(neutral.textMuted, hexToRgb01(NARRATIVE_FLOOR), GREY_TARGET)
        : neutral.textMuted,
    tickerStatus,
    // Light: the muted colour darkened to CAPTION_TARGET on the bar's darkest glass (the readout's
    // reference). Dark keeps it: it reads 10.13 computed and 7.66 by pixels as built.
    caption:
      theme === "light" ? legibleOnPanel(neutral.textMuted, readoutSurface, CAPTION_TARGET) : neutral.textMuted,
    tickerKind: {
      fraud: kindLabel("fraud", alarm, alarmOnPanel),
      auth: kindLabel("auth", ramp.r1, r1OnPanel),
      login: kindLabel("login", ramp.r2, r2OnPanel),
      account_event: kindLabel("account_event", ramp.r3, r3OnPanel),
    },
  };

  return { theme, color, ramp, alarm, material, neutral, globe, onPanel, verdict };
}

// ─── Assemble the full 2×6 table ─────────────────────────────────────────────

function buildPaletteTable(): PaletteTable {
  const table = {} as PaletteTable;
  for (const theme of THEMES) {
    table[theme] = {} as Record<ColorMode, ThemePalette>;
    for (const color of COLOR_MODES) {
      table[theme][color] = buildCell(theme, color);
    }
  }
  return table;
}

export const PALETTES: PaletteTable = buildPaletteTable();

// ─── The marks' ink ───
// One block, apart from OnPanelTokens: the ribbon (the day strip at the top of the Timeline) and the
// band (the ambient gradient behind the whole-case track) are marks, not text. Each keeps its alpha
// ramp, so the count is still the brightness, and takes the form of its palette colour that
// legibleOnPanel gives for RIBBON_TARGET on RIBBON_SURFACE.

/** The contrast target of the ribbon and the band's colour. The lowest target at which the busiest ordinary ribbon day reads 3.0 by
 *  pixels in every cell the record measured: light neon first reaches 3.0 at 5.50 (5.45 read 2.96),
 *  and light deuteranopia (3.16) and dark neon (5.79) already read over 3.0 as built, so they put
 *  no constraint on it. The same target for every slot, so a band of mixed kinds stays one family. */
export const RIBBON_TARGET = 5.5;

/** The surface the ribbon's colours are clamped against: the ribbon's glass, the darkest (light) or
 *  lightest (dark) of the 31 segments' glass readings by pixels. A literal, copied from the record
 *  (MARKS-VARIANTS.md): `#cfd4db` in light neon and light deuteranopia, `#111824` in dark neon. It
 *  holds only while the glass is as measured; the other palettes (rainbow's glass has another fill)
 *  were not read. */
export const RIBBON_SURFACE: Record<Theme, string> = { light: "#cfd4db", dark: "#111824" };

/** The ink of each slot a kind maps to (entity-mapping.ts), as hex. Emitted by css-gen.ts as
 *  --<slot>-mark-rgb triplets. */
export interface MarksInk {
  r1: string;
  r2: string;
  r3: string;
  alarm: string;
  textFaint: string;
}

/** The marks' ink in one palette cell: each slot colour through legibleOnPanel at RIBBON_TARGET on
 *  the theme's RIBBON_SURFACE. A slot that already reads it is returned as it is (dark neon's cyan
 *  and magenta, light deuteranopia's blue). */
export function marksInkOf(p: Pick<ThemePalette, "theme" | "ramp" | "alarm" | "neutral">): MarksInk {
  const surface = hexToRgb01(RIBBON_SURFACE[p.theme]);
  const ink = (slotHex: string) => legibleOnPanel(slotHex, surface, RIBBON_TARGET);
  return {
    r1: ink(p.ramp.r1),
    r2: ink(p.ramp.r2),
    r3: ink(p.ramp.r3),
    alarm: ink(p.alarm),
    textFaint: ink(p.neutral.textFaint),
  };
}

// ─── The Inspector's text (BACKLOG item 16, 2026-11-19) ───
// One block, apart from OnPanelTokens. The Inspector's texts that took a raw palette colour (--r1,
// --r2, --r3, --alarm) read under 4.5 on its panel in several cells (--r3 as low as 1.44, --r2 as
// low as 2.19, --r1 as low as 1.40, --alarm 4.88). Each text takes the form of its palette colour
// that legibleOnPanel gives for INSPECTOR_TEXT_TARGET on the Inspector's own surface. A mark (a
// dot, a rule, a plate's edge) keeps the raw colour; only text reads these.

/** The contrast target of the Inspector's palette texts: 6.0 computed on the panel, the sweep rule
 *  (a swept cell is a finding at or
 *  under 4.5 by pixels or under 6.0 computed) and the same figure as the readout and the greys
 *  (GREY_TARGET). The Inspector's texts are 9 to 11 px, where antialiasing lowers the pixel ratio
 *  below the computed one (the alarm texts read 4.88 computed and 4.27 to 4.38 by pixel mean as
 *  built), so a target of exactly 4.5 would leave the pixel reading under the floor. Its own
 *  constant, so that a later change to the grey margin does not move the Inspector. */
export const INSPECTOR_TEXT_TARGET = 6.0;

/** The ink of each palette colour the Inspector prints as text, as hex. Emitted by css-gen.ts as
 *  --<slot>-on-inspector. */
export interface InspectorText {
  r1: string;
  r2: string;
  r3: string;
  alarm: string;
  /** The Inspector's grey: the faint neutral clamped to the same target on the same surface. Read as
   *  --text-faint-on-inspector by the captions, the "none" lines, the list dates and the fields only
   *  the manifest's secondary template names. Raw --text-faint (text-dim) reads 4.96 on the light
   *  panel; --text-faint-on-panel is not used because its dark value was clamped on panelTop. */
  textFaint: string;
}

/** The Inspector's surface: the .instrument panel is flat and takes --panel-base (index.css). */
export function inspectorSurfaceOf(p: Pick<ThemePalette, "material">): [number, number, number] {
  return parseTriplet01(p.material.panelBase);
}

/** The Inspector's text colours in one palette cell: each slot through legibleOnPanel at
 *  INSPECTOR_TEXT_TARGET on the panel. A slot that already reads it is returned as it is. */
export function inspectorTextOf(p: Pick<ThemePalette, "ramp" | "alarm" | "material" | "neutral">): InspectorText {
  const surface = inspectorSurfaceOf(p);
  const ink = (slotHex: string) => legibleOnPanel(slotHex, surface, INSPECTOR_TEXT_TARGET);
  return {
    r1: ink(p.ramp.r1),
    r2: ink(p.ramp.r2),
    r3: ink(p.ramp.r3),
    alarm: ink(p.alarm),
    textFaint: ink(p.neutral.textFaint),
  };
}

// --- The tags' fill ---
// The count (MatchBadge) and the ML tag (DecisionPill) are plates: a 1 px line in the tag's own
// colour at 60 percent, and a fill of that colour. A fill lowers the text's contrast, and how much
// it can take differs per palette cell, so the fill's strength is a token: the largest whole
// percent, at most TAG_FILL_MAX, at which every tag text keeps TAG_TEXT_FLOOR over its own fill
// over the surface it sits on.

/** The most a tag's fill may take: the neon strength, in both themes. */
export const TAG_FILL_MAX = 13;

/** The floor of every tag text over its fill: WCAG AA for small text. */
export const TAG_TEXT_FLOOR = 4.5;

/** The tag fill in one palette cell, as whole percents. `panel` is the default, emitted as
 *  --tag-fill: the Inspector's flat panel, which is also the body of every window (the rule trace).
 *  `card` is the matches window's rule card (bg-panel-bg, the --surface neutral), emitted as
 *  --tag-fill-card and applied by an index.css rule on that window. */
export interface TagFill {
  panel: number;
  card: number;
}

/** The two surfaces a tag sits on, in 0..1 rgb (8-bit channels). The panel grain is ignored. */
export function tagSurfacesOf(p: Pick<ThemePalette, "material" | "neutral">): {
  panel: [number, number, number];
  card: [number, number, number];
} {
  return { panel: inspectorSurfaceOf(p), card: hexToRgb01(p.neutral.surface) };
}

/** The tag fill of one palette cell. The tag texts are the count's two colours (r1 and alarm,
 *  on-panel) and every colour the ML tag takes, the action word's: alarm for DECLINE, r3 for FLAG,
 *  STEP-UP and REVIEW, r1 for ALLOW (lib/decisions.ts actionTextColor). The fill is the text colour
 *  at p percent over the surface, composited in 8 bits as the browser does. */
export function tagFillOf(p: Pick<ThemePalette, "onPanel" | "material" | "neutral">): TagFill {
  const texts = [p.onPanel.r1, p.onPanel.alarm, p.onPanel.r3].map(hexToRgb01);
  const surfaces = tagSurfacesOf(p);
  const largest = (surface: [number, number, number]): number => {
    let best = 0;
    for (let pct = 1; pct <= TAG_FILL_MAX; pct++) {
      const holds = texts.every(
        (t) => contrastRatio(t, quantize8(compositeOver(t, pct / 100, surface))) >= TAG_TEXT_FLOOR,
      );
      if (!holds) break;
      best = pct;
    }
    return best;
  };
  return { panel: largest(surfaces.panel), card: largest(surfaces.card) };
}
