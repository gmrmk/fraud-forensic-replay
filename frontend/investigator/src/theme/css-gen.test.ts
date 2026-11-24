// frontend/investigator/src/theme/css-gen.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PALETTES, tagFillOf } from "./tokens";
import { THEMES, COLOR_MODES } from "./axes";
import { paletteToCssBlock, allBlocksCss } from "./css-gen";

describe("paletteToCssBlock", () => {
  it("starts with the correct selector for dark.neon", () => {
    const block = paletteToCssBlock(PALETTES.dark.neon);
    expect(block.trimStart()).toMatch(/^\[data-theme="dark"\]\[data-color="neon"\]/);
  });

  it("dark.neon contains --r4: #FFFFFF;", () => {
    const block = paletteToCssBlock(PALETTES.dark.neon);
    expect(block).toContain("--r4: #FFFFFF;");
  });

  it("dark.neon contains --alarm: #FF3D2E;", () => {
    const block = paletteToCssBlock(PALETTES.dark.neon);
    expect(block).toContain("--alarm: #FF3D2E;");
  });

  it("dark.neon emits the Tailwind-bridge triplet --r1-rgb: 0 229 255;", () => {
    const block = paletteToCssBlock(PALETTES.dark.neon);
    expect(block).toContain("--r1-rgb: 0 229 255;");
  });

  it("dark.neon emits --alarm-rgb (space-separated) for opacity utilities", () => {
    const block = paletteToCssBlock(PALETTES.dark.neon);
    // #FF3D2E -> 255 61 46
    expect(block).toContain("--alarm-rgb: 255 61 46;");
  });

  it("dark.neon contains --glass-fill: 0.74;", () => {
    const block = paletteToCssBlock(PALETTES.dark.neon);
    expect(block).toContain("--glass-fill: 0.74;");
  });

  it("dark.rainbow contains --alarm: #FF6B35;", () => {
    const block = paletteToCssBlock(PALETTES.dark.rainbow);
    expect(block).toContain("--alarm: #FF6B35;");
  });

  it("dark.rainbow contains --glass-fill: 0.52;", () => {
    const block = paletteToCssBlock(PALETTES.dark.rainbow);
    expect(block).toContain("--glass-fill: 0.52;");
  });

  it("emits the panel-legible kind vars (Slice 2-H) matching the palette onPanel", () => {
    // deuteranopia dark is a cell where the clamp actually fires (the raw auth
    // navy slot is illegible), so this also pins that emission != raw slot.
    const block = paletteToCssBlock(PALETTES.dark.deuteranopia);
    const op = PALETTES.dark.deuteranopia.onPanel;
    expect(block).toContain(`--r1-on-panel: ${op.r1};`);
    expect(block).toContain(`--r2-on-panel: ${op.r2};`);
    expect(block).toContain(`--r3-on-panel: ${op.r3};`);
    expect(block).toContain(`--alarm-on-panel: ${op.alarm};`);
    expect(block).toContain(`--text-faint-on-panel: ${op.textFaint};`);
    expect(block).toContain(`--ticker-status-on-panel: ${op.tickerStatus};`);
    // C2c: the 8 px captions' token and the ticker's four kind-label tokens (transfer reads auth's).
    expect(block).toContain(`--caption-on-glass: ${op.caption};`);
    expect(block).toContain(`--ticker-kind-fraud: ${op.tickerKind.fraud};`);
    expect(block).toContain(`--ticker-kind-auth: ${op.tickerKind.auth};`);
    expect(block).toContain(`--ticker-kind-login: ${op.tickerKind.login};`);
    expect(block).toContain(`--ticker-kind-account-event: ${op.tickerKind.account_event};`);
    // Light-theme tokens the clamp moves; dark keeps the raw muted colour for the captions.
    expect(PALETTES.dark.deuteranopia.onPanel.caption).toBe(PALETTES.dark.deuteranopia.neutral.textMuted);
    expect(op.tickerKind.auth).not.toBe(op.r1);
    // C2c: the 8 px captions' token and the ticker's four kind-label tokens (transfer reads auth's).
    expect(block).toContain(`--caption-on-glass: ${op.caption};`);
    expect(block).toContain(`--ticker-kind-fraud: ${op.tickerKind.fraud};`);
    expect(block).toContain(`--ticker-kind-auth: ${op.tickerKind.auth};`);
    expect(block).toContain(`--ticker-kind-login: ${op.tickerKind.login};`);
    expect(block).toContain(`--ticker-kind-account-event: ${op.tickerKind.account_event};`);
    // Light-theme tokens the clamp moves; dark keeps the raw muted colour for the captions.
    expect(PALETTES.dark.deuteranopia.onPanel.caption).toBe(PALETTES.dark.deuteranopia.neutral.textMuted);
    expect(op.tickerKind.auth).not.toBe(op.r1);
    // The clamp moved the auth slot off its raw value (legibility, not identity).
    expect(op.r1).not.toBe(PALETTES.dark.deuteranopia.ramp.r1);
  });

  it("does NOT emit globe vars", () => {
    const block = paletteToCssBlock(PALETTES.dark.neon);
    expect(block).not.toContain("--sky:");
    expect(block).not.toContain("--horizon:");
    expect(block).not.toContain("--heat");
  });
});

describe("allBlocksCss", () => {
  it("contains dark.neon selector", () => {
    const css = allBlocksCss(PALETTES);
    expect(css).toContain('[data-theme="dark"][data-color="neon"]');
  });

  it("contains light.monochrome selector", () => {
    const css = allBlocksCss(PALETTES);
    expect(css).toContain('[data-theme="light"][data-color="monochrome"]');
  });

  it("light.monochrome block contains --alarm: #000000;", () => {
    const css = allBlocksCss(PALETTES);
    // Find the light/monochrome block and check it contains #000000 alarm
    // The block appears after [data-theme="light"][data-color="monochrome"]
    const idx = css.indexOf('[data-theme="light"][data-color="monochrome"]');
    expect(idx).toBeGreaterThan(-1);
    const blockSlice = css.slice(idx, idx + 1000);
    expect(blockSlice).toContain("--alarm: #000000;");
  });

  it("contains exactly 12 occurrences of [data-theme=", () => {
    const css = allBlocksCss(PALETTES);
    const matches = css.match(/\[data-theme=/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(12);
  });
});

describe("paletteToCssBlock narrative time (C2, the margin on the grey texts)", () => {
  it("emits --narrative-time as its own line: the darkened muted colour in light, today's muted colour in dark", () => {
    expect(paletteToCssBlock(PALETTES.light.neon)).toContain("\n  --narrative-time: #333a45;");
    expect(paletteToCssBlock(PALETTES.dark.neon)).toContain("\n  --narrative-time: #B6C0CE;");
  });
});

describe("paletteToCssBlock tag fill", () => {
  it("emits --tag-fill (the Inspector's value) and --tag-fill-card (the matches rule card's) in every cell, as whole percents", () => {
    for (const theme of THEMES) for (const color of COLOR_MODES) {
      const p = PALETTES[theme][color];
      const f = tagFillOf(p);
      const block = paletteToCssBlock(p);
      expect(block, `${theme}.${color}`).toContain(`--tag-fill: ${f.panel}%;`);
      expect(block, `${theme}.${color}`).toContain(`--tag-fill-card: ${f.card}%;`);
    }
  });

  it("dark deuteranopia: 13 on the panel and 11 on the card", () => {
    const block = paletteToCssBlock(PALETTES.dark.deuteranopia);
    expect(block).toContain("--tag-fill: 13%;");
    expect(block).toContain("--tag-fill-card: 11%;");
  });

  it("the plate's line and fill are the tag's own colour: .tag-plate mixes currentColor at 60 percent and at --tag-fill", () => {
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    const rule = css.match(/\.tag-plate\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/border-color:\s*color-mix\(in srgb, currentColor 60%, transparent\);/);
    expect(rule![1]).toMatch(/background-color:\s*color-mix\(in srgb, currentColor var\(--tag-fill\), transparent\);/);
    // no raw colour value anywhere in the rule
    expect(rule![1]).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb\(|hsl\(/);
  });

  it("the matches window's rule card takes its own value of the same property, from index.css", () => {
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    expect(css).toMatch(/\[aria-label="Matches workspace"\]\s*\{\s*--tag-fill:\s*var\(--tag-fill-card\);\s*\}/);
  });
});

describe("paletteToCssBlock verdict vars", () => {
  it("dark.neon emits the raw, triplet and on-panel verdict vars", () => {
    const css = paletteToCssBlock(PALETTES.dark.neon);
    expect(css).toContain("--verdict-pass: #39F58A;");
    expect(css).toContain("--verdict-queue-rgb: 61 139 255;");
    expect(css).toContain("--verdict-wait-on-panel:");
  });
});
