// frontend/investigator/src/theme/grey-margin-colour.test.ts
//
// The margin on the grey texts. Four values move: onPanel.textFaint, onPanel.narrativeHeader
// (dark), the new onPanel.narrativeTime, and the light onPanel.wait. Each is the readout's rule
// (legibleOnPanel, GREY_TARGET 6.0) run on a named reference surface.
//
// The surfaces below are LITERALS, not imports from tokens.ts, so a wrong reference in the build
// shows as a failed ratio. The pinned hex values are fixed here (the five light WAITING colours
// outside neon are derived by arithmetic).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLATE_ALPHA } from "../components/verdict/tone-style";
import { COLOR_MODES, THEMES, type ColorMode, type Theme } from "./axes";
import { paletteToCssBlock } from "./css-gen";
import { contrastRatio } from "./legibility";
import { hexToRgb01 } from "./to-rgb";
import {
  CAPTION_TARGET,
  GREY_PLATE_ALPHA,
  GREY_TARGET,
  NARRATIVE_FLOOR,
  PALETTES,
  TICKER_KIND_PAGE_TARGET,
  TICKER_KIND_PAGE_TARGET_CELLS,
  TICKER_KIND_TARGET,
} from "./tokens";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const CELLS: Array<[Theme, ColorMode]> = THEMES.flatMap((t) =>
  COLOR_MODES.map((c) => [t, c] as [Theme, ColorMode]),
);
const lc = (s: string) => s.toLowerCase();

// ── Pinned values (the design, section 4) ───────────────────────────────────

const FAINT = { light: "#505865", dark: "#a1aab5" };
const HEADER = { light: "#10151c", dark: "#a1aab5" }; // light is --text, built by C2's second part
const TIME = { light: "#333a45", dark: "#b6c0ce" }; // dark is the unchanged --text-muted
const WAIT_LIGHT: Record<ColorMode, string> = {
  neon: "#704a00",
  rainbow: "#6c4b00",
  deuteranopia: "#5c5100",
  protanopia: "#5c5100",
  tritanopia: "#93275a",
  monochrome: "#515151",
};
// Dark WAITING is unchanged: the verdict colour already clears the dark clamp, so the token is the
// verdict colour itself (checked against the palette before this item; no dark option was built).
const WAIT_DARK: Record<ColorMode, string> = {
  neon: "#ffc83d",
  rainbow: "#e3b341",
  deuteranopia: "#ffe946",
  protanopia: "#ffe946",
  tritanopia: "#ff9ec8",
  monochrome: "#a6a6a6",
};

// ── Measured surfaces (literals with provenance) ────────────────────────────

const TICKER_LIGHT = "#ebeff5"; // panelBase, the ticker row and identity card in light (MARGIN.md s4)
const TICKER_DARK = "#222a36"; // panelTop, the lightest modelled dark stop (luminance 0.02262)
const CARD_LIGHT_DARKEST = "#bbbfc3"; // the narrative card, darkest measured pixel surface, light
const CARD_DARK_SURFACES = ["#23272f", "#1b212a"]; // the narrative card, lightest measured (city) and overview, dark
const WAIT_PLATE_LIGHT = "#e2e3e4"; // --bg #fbfcfd at 0.9 over black, measured at the late zoom 10 camera
const FLOOR_RULE = 6.0;

const ratio = (a: string, b: string) => contrastRatio(hexToRgb01(a), hexToRgb01(b));

// ── The tokens, 12 cells each ───────────────────────────────────────────────

describe("the margin constants", () => {
  it("GREY_TARGET is the readout's 6.0 and NARRATIVE_FLOOR is the measured card literal", () => {
    expect(GREY_TARGET).toBe(6.0);
    expect(lc(String(NARRATIVE_FLOOR))).toBe(CARD_LIGHT_DARKEST);
  });

  it("the plate alpha the wait clamp uses equals PLATE_ALPHA in components/verdict/tone-style.ts", () => {
    expect(GREY_PLATE_ALPHA).toBe(PLATE_ALPHA);
  });
});

describe("the margin colours, pinned in all 12 cells", () => {
  it.each(CELLS)("%s %s: textFaint", (theme, color) => {
    expect(lc(PALETTES[theme][color].onPanel.textFaint)).toBe(FAINT[theme]);
  });

  it.each(CELLS)("%s %s: narrativeHeader", (theme, color) => {
    expect(lc(PALETTES[theme][color].onPanel.narrativeHeader)).toBe(HEADER[theme]);
  });

  it.each(CELLS)("%s %s: narrativeTime", (theme, color) => {
    expect(lc(String(PALETTES[theme][color].onPanel.narrativeTime))).toBe(TIME[theme]);
  });

  it.each(CELLS)("%s %s: wait", (theme, color) => {
    const want = theme === "light" ? WAIT_LIGHT[color] : WAIT_DARK[color];
    expect(lc(PALETTES[theme][color].onPanel.wait)).toBe(want);
  });

  it("the raw --text-faint, --text-muted and --text keep their values (they feed the rgb bridge and the globe)", () => {
    expect(PALETTES.light.neon.neutral.textFaint.toLowerCase()).toBe("#5d6776");
    expect(PALETTES.dark.neon.neutral.textFaint.toLowerCase()).toBe("#909aa8");
    expect(PALETTES.light.neon.neutral.textMuted.toLowerCase()).toBe("#444e5c");
    expect(PALETTES.dark.neon.neutral.textMuted.toLowerCase()).toBe("#b6c0ce");
  });
});

// ── The rule on the literal measured surfaces ───────────────────────────────

describe("the margin colours clear 6.0 computed on their own measured surface", () => {
  it.each(CELLS)("%s %s: Scenario and Synthetic data, the switcher button (textFaint, bare panel)", (theme, color) => {
    const surface = theme === "light" ? TICKER_LIGHT : TICKER_DARK;
    const hex = PALETTES[theme][color].onPanel.textFaint;
    expect(ratio(hex, surface), `${hex} on ${surface}`).toBeGreaterThanOrEqual(FLOOR_RULE);
  });

  it.each(CELLS)("%s %s: NARRATIVE header", (theme, color) => {
    const surfaces = theme === "light" ? [CARD_LIGHT_DARKEST] : CARD_DARK_SURFACES;
    const hex = PALETTES[theme][color].onPanel.narrativeHeader;
    for (const s of surfaces) expect(ratio(hex, s), `${hex} on ${s}`).toBeGreaterThanOrEqual(FLOOR_RULE);
  });

  it.each(CELLS)("%s %s: narrative row time", (theme, color) => {
    const surfaces = theme === "light" ? [CARD_LIGHT_DARKEST] : CARD_DARK_SURFACES;
    const hex = String(PALETTES[theme][color].onPanel.narrativeTime);
    for (const s of surfaces) expect(ratio(hex, s), `${hex} on ${s}`).toBeGreaterThanOrEqual(FLOOR_RULE);
  });

  it.each(CELLS.filter(([t]) => t === "light"))("%s %s: WAITING on the light plate", (theme, color) => {
    const hex = PALETTES[theme][color].onPanel.wait;
    expect(ratio(hex, WAIT_PLATE_LIGHT), `${hex} on ${WAIT_PLATE_LIGHT}`).toBeGreaterThanOrEqual(FLOOR_RULE);
  });
});

describe("what is left of the grey hierarchy", () => {
  it.each(CELLS)("%s %s: faint stays below muted and muted below text on the opaque panel", (theme, color) => {
    const p = PALETTES[theme][color];
    const surface = theme === "light" ? TICKER_LIGHT : "#141922";
    const faint = ratio(p.onPanel.textFaint, surface);
    const muted = ratio(p.neutral.textMuted, surface);
    const text = ratio(p.neutral.text, surface);
    expect(faint).toBeLessThan(muted);
    expect(muted).toBeLessThan(text);
  });
});

// ── The emitted css lines ───────────────────────────────────────────────────

describe("css-gen emits the margin tokens", () => {
  it.each(CELLS)("%s %s: --text-faint-on-panel, --narrative-header, --narrative-time, --verdict-wait-on-panel", (theme, color) => {
    const p = PALETTES[theme][color];
    const block = lc(paletteToCssBlock(p));
    expect(block).toContain(`--text-faint-on-panel: ${FAINT[theme]};`);
    expect(block).toContain(`--narrative-header: ${HEADER[theme]};`);
    expect(block).toContain(`--narrative-time: ${TIME[theme]};`);
    expect(block).toContain(
      `--verdict-wait-on-panel: ${theme === "light" ? WAIT_LIGHT[color] : WAIT_DARK[color]};`,
    );
  });

  it("--narrative-time sits on its own line beside --narrative-header", () => {
    const block = paletteToCssBlock(PALETTES.light.neon);
    expect(block).toMatch(/\n {2}--narrative-header: [^;]+;\r?\n {2}--narrative-time: [^;]+;\r?\n/);
  });
});

// ── The four components carry the new classes (read from source) ────────────

/** The opening tag (attributes) of the element whose children text starts with `anchor`. */
function openingTagBefore(source: string, anchor: string): string {
  const at = source.indexOf(anchor);
  expect(at, `anchor ${anchor}`).toBeGreaterThan(-1);
  const open = source.lastIndexOf("<", at);
  const close = source.indexOf(">", open);
  return source.slice(open, close + 1);
}
const classOf = (tag: string): string => {
  const m = /className="([^"]*)"/.exec(tag);
  expect(m, `a className in ${tag}`).not.toBeNull();
  return (m as RegExpExecArray)[1];
};
const tokens = (cls: string) => cls.split(/\s+/);
const FAINT_CLASS = "text-[color:var(--text-faint-on-panel)]";
const TICKER_STATUS_CLASS = "text-[color:var(--ticker-status-on-panel)]";
const TICKER_STATUS_ANCHORS = ["{formatTickerTime(current.ms)}", "{currentIndex + 1} / {sorted.length}"];

describe("the call sites (source)", () => {
  it("TickerBar: the status time and the count take --ticker-status-on-panel, not the faint token or text-dim", () => {
    const src = read("../components/TickerBar.tsx");
    for (const anchor of TICKER_STATUS_ANCHORS) {
      const cls = tokens(classOf(openingTagBefore(src, anchor)));
      expect(cls, anchor).toContain(TICKER_STATUS_CLASS);
      expect(cls, anchor).not.toContain(FAINT_CLASS);
      expect(cls, anchor).not.toContain("text-dim");
    }
  });

  it("ScenarioSwitcher: the button takes --text-faint-on-panel, keeps hover:text-muted, not text-dim", () => {
    const src = read("../components/ScenarioSwitcher.tsx");
    // The button's attributes hold `=>` (onClick), so the tag cannot be cut at the first `>`:
    // read the className that follows the aria-haspopup attribute instead.
    const from = src.indexOf('aria-haspopup="listbox"');
    expect(from).toBeGreaterThan(-1);
    const cls = tokens(classOf(src.slice(from, src.indexOf(">", src.indexOf("className=", from)))));
    expect(cls).toContain(FAINT_CLASS);
    expect(cls).toContain("hover:text-muted");
    expect(cls).not.toContain("text-dim");
  });

  it("MapCredit: the container takes text-muted, the copyright mark takes --text", () => {
    const src = read("../components/MapCredit.tsx");
    const container = tokens(classOf(openingTagBefore(src, "data-map-credit")));
    expect(container).toContain("text-muted");
    expect(container).not.toContain("text-dim");
    expect(tokens(classOf(openingTagBefore(src, "©</span>")))).toContain("text-[color:var(--text)]");
  });

  it("NarrativeLog: the row time takes --narrative-time, not --text-muted", () => {
    const src = read("../components/NarrativeLog.tsx");
    const cls = tokens(classOf(openingTagBefore(src, 'formatTs(e.kind === "login"')));
    expect(cls).toContain("text-[color:var(--narrative-time)]");
    expect(cls).not.toContain("text-[color:var(--text-muted)]");
  });

  it("the token sources read no clock", () => {
    for (const file of ["tokens.ts", "css-gen.ts"]) {
      const text = read(file);
      expect(text).not.toContain("Date.now");
      expect(text).not.toContain("new Date");
    }
  });
});

// ── The ticker's status time and count, on the ticker row's own surface at the pulse peak ───────
//
// TICKER.md (the deriver's record of 2026-11-19, 98 page cells, 0 failed assertions) and SWEEP2.md
// ("The ticker at its pulse peak"): the two spans sit on the kind's tint, rgb(slot / 0.10) over
// panelBase at the peak, not on the bare panel. The literals below are the hexes the deriver read
// for each kind in each cell (its surface table, 8-bit as the page composites them), not values
// imported from tokens.ts. Kinds, by slot: fraud on alarm, auth and transfer on r1, login on r2,
// account_event on r3, place on --text-faint-rgb. The pulse's low (0.04) lies between the bare
// panel and the peak and is never the worst for a text that clears the peak.
const BARE_PANEL = { light: "#ebeff5", dark: "#141922" };
const TICKER_PEAK_SURFACES: Record<
  Theme,
  Record<ColorMode, { fraud: string; auth: string; login: string; account_event: string; transfer: string; place: string }>
> = {
  light: {
    rainbow: { fraud: "#e8dbdf", auth: "#dee5ea", login: "#e4e4e3", account_event: "#e6e2e1", transfer: "#dee5ea", place: "#dde1e8" },
    neon: { fraud: "#e8dbdf", auth: "#d3e8ef", login: "#e7d9eb", account_event: "#e7dfde", transfer: "#d3e8ef", place: "#dde1e8" },
    deuteranopia: { fraud: "#e8dbdf", auth: "#d8dee7", login: "#dee2e8", account_event: "#e4e7e6", transfer: "#d8dee7", place: "#dde1e8" },
    protanopia: { fraud: "#e8dbdf", auth: "#d8dee7", login: "#dee2e8", account_event: "#e4e7e6", transfer: "#d8dee7", place: "#dde1e8" },
    tritanopia: { fraud: "#e8dbdf", auth: "#d8e5f0", login: "#dfe8f1", account_event: "#e6ebf3", transfer: "#d8e5f0", place: "#dde1e8" },
    monochrome: { fraud: "#d3d7dd", auth: "#dce0e5", login: "#e2e5eb", account_event: "#e7eaf0", transfer: "#dce0e5", place: "#dde1e8" },
  },
  dark: {
    rainbow: { fraud: "#2c2124", auth: "#20272f", login: "#262729", account_event: "#282426", transfer: "#20272f", place: "#20262f" },
    neon: { fraud: "#2c1d23", auth: "#122d38", login: "#2c2036", account_event: "#2c2321", transfer: "#122d38", place: "#20262f" },
    deuteranopia: { fraud: "#2c2124", auth: "#121b2a", login: "#1e222a", account_event: "#262929", transfer: "#121b2a", place: "#20262f" },
    protanopia: { fraud: "#2c2124", auth: "#121b2a", login: "#1e222a", account_event: "#262929", transfer: "#121b2a", place: "#20262f" },
    tritanopia: { fraud: "#2c2124", auth: "#12202d", login: "#172532", account_event: "#1e2733", transfer: "#12202d", place: "#20262f" },
    monochrome: { fraud: "#2c3038", auth: "#252a32", login: "#20252d", account_event: "#1b1f28", transfer: "#252a32", place: "#20262f" },
  },
};

// The deriver's values, each measured on the page (TICKER.md, "chosen values and their ratios"):
// the pinned record. Light monochrome is #424954 because its target-6.0 value (#454c57) read 5.99
// on the page; dark monochrome moves from C2's #a1aab5 because that read 5.62 on the dark fraud tint.
const TICKER_STATUS_PINNED: Record<Theme, Record<ColorMode, string>> = {
  light: {
    neon: "#474e5a",
    rainbow: "#474e5a",
    deuteranopia: "#474e5a",
    protanopia: "#474e5a",
    tritanopia: "#474e5a",
    monochrome: "#424954",
  },
  dark: {
    neon: "#a1aab5",
    rainbow: "#a1aab5",
    deuteranopia: "#a1aab5",
    protanopia: "#a1aab5",
    tritanopia: "#a1aab5",
    monochrome: "#aab2bc",
  },
};

/** The css custom property a ticker status span takes, read from its class in TickerBar.tsx. */
function tickerStatusVar(anchor: string): string {
  const cls = tokens(classOf(openingTagBefore(read("../components/TickerBar.tsx"), anchor)));
  const hit = cls.map((c) => /^text-\[color:var\((--[a-z0-9-]+)\)\]$/.exec(c)).find((m) => m !== null);
  expect(hit, `a text-[color:var(--x)] class on ${anchor}`).toBeTruthy();
  return (hit as RegExpExecArray)[1];
}

/** The hex a css block gives a custom property. */
function cssHex(block: string, name: string): string {
  const m = new RegExp(`${name}: (#[0-9a-fA-F]{6});`).exec(block);
  expect(m, `${name} in the block`).not.toBeNull();
  return lc((m as RegExpExecArray)[1]);
}

describe("the ticker's status time and count, on the row's own tinted surface at the pulse peak", () => {
  it.each(CELLS)("%s %s: the colour the spans take clears 6.0 on every kind's peak surface and the bare panel", (theme, color) => {
    const block = paletteToCssBlock(PALETTES[theme][color]);
    const surfaces = { bare: BARE_PANEL[theme], ...TICKER_PEAK_SURFACES[theme][color] };
    for (const anchor of TICKER_STATUS_ANCHORS) {
      const name = tickerStatusVar(anchor);
      const hex = cssHex(block, name);
      for (const [kind, surface] of Object.entries(surfaces)) {
        expect(ratio(hex, surface), `${name} ${hex} on ${kind} ${surface}`).toBeGreaterThanOrEqual(FLOOR_RULE);
      }
    }
  });

  it.each(CELLS)("%s %s: onPanel.tickerStatus is the deriver's measured value, emitted as --ticker-status-on-panel", (theme, color) => {
    const p = PALETTES[theme][color];
    expect(lc(p.onPanel.tickerStatus)).toBe(TICKER_STATUS_PINNED[theme][color]);
    expect(cssHex(paletteToCssBlock(p), "--ticker-status-on-panel")).toBe(TICKER_STATUS_PINNED[theme][color]);
  });

  it("the faint token keeps C2's values: the scenario line, the switcher chevron, the dark header and the place label still read it", () => {
    for (const [theme, color] of CELLS) {
      expect(lc(PALETTES[theme][color].onPanel.textFaint)).toBe(FAINT[theme]);
    }
  });
});

// ── The bar's captions and the ticker's kind label ───
//
// Two families move. (a) The 8 px captions on the bar's glass take
// onPanel.caption (--caption-on-glass); light only, dark already clears. (b) The ticker's kind label
// takes onPanel.tickerKind.<kind> (--ticker-kind-<kind>, through the row's --kind-label); the dot and
// every other reader of --kind-token keep the five --x-on-panel tokens. Every pinned hex below is a
// value injected on the built site and read back (computed 6.0 or more AND pixel mean
// over 4.5 on every element of every cell of its group), not a value derived by this build.
type TickerKind = "fraud" | "auth" | "login" | "account_event";
const KINDS: TickerKind[] = ["fraud", "auth", "login", "account_event"];

const CAPTION_PINNED: Record<Theme, Record<ColorMode, string>> = {
  light: {
    neon: "#2a3039",
    rainbow: "#262b33",
    deuteranopia: "#2a3039",
    protanopia: "#2a3039",
    tritanopia: "#2a3039",
    monochrome: "#2a3039",
  },
  dark: {
    neon: "#b6c0ce",
    rainbow: "#b6c0ce",
    deuteranopia: "#b6c0ce",
    protanopia: "#b6c0ce",
    tritanopia: "#b6c0ce",
    monochrome: "#b6c0ce",
  },
};

const TICKER_KIND_PINNED: Record<Theme, Record<ColorMode, Record<TickerKind, string>>> = {
  light: {
    neon: { fraud: "#9c1a14", auth: "#005c67", login: "#960f6d", account_event: "#883a08" },
    rainbow: { fraud: "#9c1a14", auth: "#435452", login: "#624e25", account_event: "#73461e" },
    deuteranopia: { fraud: "#9c1a14", auth: "#31446b", login: "#4d5055", account_event: "#5c5331" },
    protanopia: { fraud: "#9c1a14", auth: "#31446b", login: "#4d5055", account_event: "#5c5331" },
    tritanopia: { fraud: "#9c1a14", auth: "#1b5877", login: "#2a597b", account_event: "#3d5585" },
    monochrome: { fraud: "#000000", auth: "#4f4f4f", login: "#525252", account_event: "#565656" },
  },
  dark: {
    neon: { fraud: "#ff766b", auth: "#00e5ff", login: "#ff66e9", account_event: "#ff8024" },
    rainbow: { fraud: "#ff7a49", auth: "#95a8a5", login: "#c9a86a", account_event: "#dc925b" },
    deuteranopia: { fraud: "#ff7a49", auth: "#4b9bff", login: "#9f9f9f", account_event: "#c6b66b" },
    protanopia: { fraud: "#ff7a49", auth: "#4b9bff", login: "#9f9f9f", account_event: "#c6b66b" },
    tritanopia: { fraud: "#ff7a49", auth: "#13a3f8", login: "#61abd2", account_event: "#78abd0" },
    monochrome: { fraud: "#ffffff", auth: "#bfbfbf", login: "#a3a3a3", account_event: "#9e9e9e" },
  },
};

// The five --x-on-panel tokens as built before this item: the dot, the FFR mark, the speed menu,
// PathPanel and CaseTimelineLayer still read them, so they must not move (the deriver's "from").
const TICKER_KIND_FROM: Record<Theme, Record<ColorMode, Record<TickerKind, string>>> = {
  light: {
    neon: { fraud: "#b71f18", auth: "#006a76", login: "#ad117e", account_event: "#a0440a" },
    rainbow: { fraud: "#b71f18", auth: "#516562", login: "#755d2c", account_event: "#8b5524" },
    deuteranopia: { fraud: "#b71f18", auth: "#31446b", login: "#5c5f65", account_event: "#6d623a" },
    protanopia: { fraud: "#b71f18", auth: "#31446b", login: "#5c5f65", account_event: "#6d623a" },
    tritanopia: { fraud: "#b71f18", auth: "#20678c", login: "#31678e", account_event: "#48659e" },
    monochrome: { fraud: "#000000", auth: "#595959", login: "#616161", account_event: "#636363" },
  },
  dark: {
    neon: { fraud: "#ff6357", auth: "#00e5ff", login: "#ff5ce8", account_event: "#ff7a1a" },
    rainbow: { fraud: "#ff6f3a", auth: "#8fa3a0", login: "#c9a86a", account_event: "#d98a4e" },
    deuteranopia: { fraud: "#ff6f3a", auth: "#3c92ff", login: "#9a9a9a", account_event: "#c6b66b" },
    protanopia: { fraud: "#ff6f3a", auth: "#3c92ff", login: "#9a9a9a", account_event: "#c6b66b" },
    tritanopia: { fraud: "#ff6f3a", auth: "#079cf5", login: "#55a5cf", account_event: "#74a9cf" },
    monochrome: { fraud: "#ffffff", auth: "#bfbfbf", login: "#9b9b9b", account_event: "#969696" },
  },
};

// The bar's glass at its darkest in light (the glass tint at its fill over black, as the clock
// readout's reference), and panelTop in dark: literals from the sweep, not imports.
const GLASS_DARKEST: Record<ColorMode, string> = {
  neon: "#d0d3d8",
  rainbow: "#c9ccd1",
  deuteranopia: "#d0d3d8",
  protanopia: "#d0d3d8",
  tritanopia: "#d0d3d8",
  monochrome: "#d0d3d8",
};
const CAPTION_FLOOR = 8.6;

describe("the caption and kind-label constants", () => {
  it("CAPTION_TARGET is 8.6, the kind label's target is the margin's 6.0, the page-read retry is 6.1", () => {
    expect(CAPTION_TARGET).toBe(CAPTION_FLOOR);
    expect(TICKER_KIND_TARGET).toBe(GREY_TARGET);
    expect(TICKER_KIND_PAGE_TARGET).toBe(6.1);
  });

  it("the retry applies to exactly the three light login cells whose 6.0 value read 5.99 on the page", () => {
    expect([...TICKER_KIND_PAGE_TARGET_CELLS].sort()).toEqual([
      "light.deuteranopia.login",
      "light.monochrome.login",
      "light.protanopia.login",
    ]);
  });
});

describe("the 8 px captions on the bar's glass (onPanel.caption, --caption-on-glass)", () => {
  it.each(CELLS)("%s %s: pinned to the deriver's measured value and emitted", (theme, color) => {
    const p = PALETTES[theme][color];
    expect(lc(p.onPanel.caption)).toBe(CAPTION_PINNED[theme][color]);
    expect(cssHex(paletteToCssBlock(p), "--caption-on-glass")).toBe(CAPTION_PINNED[theme][color]);
  });

  it.each(CELLS)("%s %s: clears its target computed on the bar's darkest glass", (theme, color) => {
    const hex = PALETTES[theme][color].onPanel.caption;
    const surface = theme === "light" ? GLASS_DARKEST[color] : TICKER_DARK;
    const floor = theme === "light" ? CAPTION_FLOOR : FLOOR_RULE;
    expect(ratio(hex, surface), `${hex} on ${surface}`).toBeGreaterThanOrEqual(floor);
  });

  it("dark keeps --text-muted itself (it reads 10.13 computed and 7.66 by pixels as built)", () => {
    for (const color of COLOR_MODES) {
      expect(lc(PALETTES.dark[color].onPanel.caption)).toBe(lc(PALETTES.dark[color].neutral.textMuted));
    }
  });

  it("light is darker than --text-muted and lighter than --text in every palette", () => {
    for (const color of COLOR_MODES) {
      const p = PALETTES.light[color];
      const lum = (h: string) => contrastRatio(hexToRgb01(h), [1, 1, 1]);
      expect(lum(p.onPanel.caption)).toBeGreaterThan(lum(p.neutral.textMuted));
      expect(lum(p.onPanel.caption)).toBeLessThan(lum(p.neutral.text));
    }
  });
});

describe("the ticker's kind label (onPanel.tickerKind, --ticker-kind-<kind>)", () => {
  it.each(CELLS)("%s %s: the four kinds are pinned to the deriver's measured values and emitted", (theme, color) => {
    const p = PALETTES[theme][color];
    const block = paletteToCssBlock(p);
    for (const kind of KINDS) {
      expect(lc(p.onPanel.tickerKind[kind]), kind).toBe(TICKER_KIND_PINNED[theme][color][kind]);
      expect(cssHex(block, `--ticker-kind-${kind.replace("_", "-")}`), kind).toBe(TICKER_KIND_PINNED[theme][color][kind]);
    }
  });

  it.each(CELLS)("%s %s: each kind's colour clears 6.0 computed on its own peak surface; transfer shares auth's", (theme, color) => {
    const p = PALETTES[theme][color];
    const surfaces = TICKER_PEAK_SURFACES[theme][color];
    for (const kind of KINDS) {
      const hex = p.onPanel.tickerKind[kind];
      expect(ratio(hex, surfaces[kind]), `${kind} ${hex} on ${surfaces[kind]}`).toBeGreaterThanOrEqual(FLOOR_RULE);
    }
    expect(ratio(p.onPanel.tickerKind.auth, surfaces.transfer)).toBeGreaterThanOrEqual(FLOOR_RULE);
  });

  it.each(CELLS)("%s %s: a kind that already cleared keeps its colour, a kind that did not moves toward the text colour", (theme, color) => {
    const p = PALETTES[theme][color];
    for (const kind of KINDS) {
      const from = TICKER_KIND_FROM[theme][color][kind];
      const to = lc(p.onPanel.tickerKind[kind]);
      if (to === from) continue;
      // Darker in light, lighter in dark; the hue is held, so only the direction is pinned.
      const lum = (h: string) => contrastRatio(hexToRgb01(h), [1, 1, 1]);
      if (theme === "light") expect(lum(to), `${kind} ${from} to ${to}`).toBeGreaterThan(lum(from));
      else expect(lum(to), `${kind} ${from} to ${to}`).toBeLessThan(lum(from));
    }
  });
});

describe("what the caption and kind-label change leaves alone", () => {
  it.each(CELLS)("%s %s: the raw --text-muted and the five --x-on-panel tokens keep their values", (theme, color) => {
    const p = PALETTES[theme][color];
    const block = lc(paletteToCssBlock(p));
    expect(lc(p.neutral.textMuted)).toBe(theme === "light" ? "#444e5c" : "#b6c0ce");
    expect(block).toContain(`--text-muted: ${theme === "light" ? "#444e5c" : "#b6c0ce"};`);
    expect(lc(p.onPanel.alarm)).toBe(TICKER_KIND_FROM[theme][color].fraud);
    expect(lc(p.onPanel.r1)).toBe(TICKER_KIND_FROM[theme][color].auth);
    expect(lc(p.onPanel.r2)).toBe(TICKER_KIND_FROM[theme][color].login);
    expect(lc(p.onPanel.r3)).toBe(TICKER_KIND_FROM[theme][color].account_event);
    expect(lc(p.onPanel.textFaint)).toBe(FAINT[theme]);
    expect(block).toContain(`--alarm-on-panel: ${TICKER_KIND_FROM[theme][color].fraud};`);
    expect(block).toContain(`--r1-on-panel: ${TICKER_KIND_FROM[theme][color].auth};`);
    expect(block).toContain(`--r2-on-panel: ${TICKER_KIND_FROM[theme][color].login};`);
    expect(block).toContain(`--r3-on-panel: ${TICKER_KIND_FROM[theme][color].account_event};`);
    expect(lc(p.onPanel.tickerStatus)).toBe(TICKER_STATUS_PINNED[theme][color]);
  });

  it("the caption token sits on its own line beside --r1-readout", () => {
    const block = paletteToCssBlock(PALETTES.light.neon);
    expect(block).toMatch(/\n {2}--r1-readout: [^;]+;\r?\n {2}--caption-on-glass: [^;]+;\r?\n/);
  });
});

// ── The call sites (source) ─────────────────────────────────────────────────

/** The class string of the first className="..." after `anchor` in `source`. */
function classAfter(source: string, anchor: string): string[] {
  const at = source.indexOf(anchor);
  expect(at, `anchor ${anchor}`).toBeGreaterThan(-1);
  const m = /className="([^"]*)"/.exec(source.slice(at));
  expect(m, `a className after ${anchor}`).not.toBeNull();
  return tokens((m as RegExpExecArray)[1]);
}
const CAPTION_CLASS = "text-[color:var(--caption-on-glass)]";
const CAPTION_SITES: Array<[string, string, string]> = [
  ["the lane's scale caption", "../components/timeline/MagnitudeLane.tsx", "data-magnitude-scale"],
  ["a folded lane's small caption", "../components/timeline/LaneSmall.tsx", "data-lane-small-range"],
  ["the lane lines' second line", "../components/timeline/LaneLines.tsx", "data-lane-lines-second"],
  ["the rows' small version's caption", "../components/timeline/rows/RowsSmall.tsx", "data-small-label"],
];

describe("the call sites of the captions and the kind label (source)", () => {
  it.each(CAPTION_SITES)("%s takes --caption-on-glass, not text-muted", (_name, file, anchor) => {
    const cls = classAfter(read(file), anchor);
    expect(cls).toContain(CAPTION_CLASS);
    expect(cls).not.toContain("text-muted");
  });

  it("the four captions keep their sizes, tracking and wrapping classes (no type change)", () => {
    expect(classAfter(read("../components/timeline/MagnitudeLane.tsx"), "data-magnitude-scale")).toEqual(
      expect.arrayContaining(["shrink-0", "whitespace-nowrap"]),
    );
    expect(classAfter(read("../components/timeline/LaneSmall.tsx"), "data-lane-small-range")).toEqual(
      expect.arrayContaining(["h-3", "truncate", "whitespace-nowrap", "pl-[11px]", "leading-3"]),
    );
    expect(classAfter(read("../components/timeline/LaneLines.tsx"), "data-lane-lines-second")).toEqual(
      expect.arrayContaining(["max-w-full", "truncate"]),
    );
    expect(classAfter(read("../components/timeline/rows/RowsSmall.tsx"), "data-small-label")).toEqual(
      expect.arrayContaining(["h-3", "truncate", "whitespace-nowrap", "leading-3", "tracking-[0.17em]"]),
    );
  });

  it("TickerBar: the secondary text (5411 · US, 9 px) keeps text-muted and the kind label keeps its class", () => {
    const src = read("../components/TickerBar.tsx");
    const secondary = tokens(classOf(openingTagBefore(src, "{current.item.secondary}")));
    expect(secondary).toContain("text-muted");
    expect(secondary).not.toContain(CAPTION_CLASS);
    const label = tokens(classOf(openingTagBefore(src, "{current.item.node.label.toUpperCase()}")));
    expect(label).toContain("ticker-kind-label");
    expect(label).toContain("text-[10px]");
  });

  it("index.css: each ticker kind rule sets --kind-label to its --ticker-kind var; the label reads it first; place and the dot do not", () => {
    const css = read("../index.css");
    const rule = (kind: string) => {
      const m = new RegExp(`\\.ticker-event-pulse\\.kind-${kind}\\s*\\{([^}]*)\\}`).exec(css);
      expect(m, `.kind-${kind} rule`).not.toBeNull();
      return (m as RegExpExecArray)[1];
    };
    const want: Record<string, string> = {
      fraud: "--ticker-kind-fraud",
      auth: "--ticker-kind-auth",
      login: "--ticker-kind-login",
      account_event: "--ticker-kind-account-event",
      transfer: "--ticker-kind-auth",
    };
    for (const [kind, name] of Object.entries(want)) {
      expect(rule(kind), kind).toContain(`--kind-label: var(${name});`);
      expect(rule(kind), kind).toContain("--kind-token: var(--");
    }
    expect(rule("place")).not.toContain("--kind-label");
    expect(css).toMatch(/\.ticker-kind-label\s*\{\s*color: var\(--kind-label, var\(--kind-token, var\(--kind-fallback\)\)\);\s*\}/);
    expect(css).toMatch(/\.ticker-kind-dot\s*\{\s*background-color: var\(--kind-token, var\(--kind-fallback\)\);\s*\}/);
  });
});
