// frontend/investigator/src/theme/tokens.test.ts
import { describe, it, expect } from "vitest";
import { PALETTES, tagFillOf, tagSurfacesOf, TAG_FILL_MAX } from "./tokens";
import { THEMES, COLOR_MODES } from "./axes";
import { contrastRatio, compositeOver } from "./legibility";
import { hexToRgb01 } from "./to-rgb";
import { KIND_SLOT, slotFor } from "./entity-mapping";

// The tags' fill (the count and the ML tag): the tag's own
// colour at a percent per palette cell, the largest whole percent (at most TAG_FILL_MAX) at which
// every tag text still holds 4.5 to 1 over its own fill over the surface it sits on. Two
// surfaces: the Inspector's panel (also the trace window's body) and the matches window's rule card.
describe("tag fill token", () => {
  const q8 = (c: number) => Math.round(c * 255) / 255;
  const over = (text: [number, number, number], pct: number, surface: [number, number, number]) => {
    const [r, g, b] = compositeOver(text, pct / 100, surface);
    return [q8(r), q8(g), q8(b)] as [number, number, number];
  };

  it("holds 4.5 to 1 for every tag text over its fill over every surface, in all 12 cells, and never exceeds 13 percent", () => {
    expect(TAG_FILL_MAX).toBe(13);
    const failures: string[] = [];
    for (const theme of THEMES) for (const color of COLOR_MODES) {
      const p = PALETTES[theme][color];
      const fill = tagFillOf(p);
      const surfaces = tagSurfacesOf(p);
      // The count's two colours (r1, alarm) and every colour the ML tag can take (the action
      // slots: alarm for DECLINE, r3 for FLAG, STEP-UP and REVIEW, r1 for ALLOW).
      const texts = { r1: p.onPanel.r1, alarm: p.onPanel.alarm, r3: p.onPanel.r3 };
      for (const [surfaceName, pct] of [["panel", fill.panel], ["card", fill.card]] as const) {
        expect(pct, `${theme}.${color} ${surfaceName}`).toBeLessThanOrEqual(13);
        expect(pct, `${theme}.${color} ${surfaceName}`).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(pct)).toBe(true);
        for (const [name, hex] of Object.entries(texts)) {
          const text = hexToRgb01(hex);
          const surface = surfaces[surfaceName];
          const c = contrastRatio(text, over(text, pct, surface));
          if (c < 4.5) failures.push(`${theme}.${color} ${name} on ${surfaceName} at ${pct}% = ${c.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("is the largest such percent: one more percent fails for some tag text, unless the cap is reached", () => {
    for (const theme of THEMES) for (const color of COLOR_MODES) {
      const p = PALETTES[theme][color];
      const fill = tagFillOf(p);
      const surfaces = tagSurfacesOf(p);
      for (const [surfaceName, pct] of [["panel", fill.panel], ["card", fill.card]] as const) {
        if (pct >= 13) continue;
        const worst = Math.min(
          ...[p.onPanel.r1, p.onPanel.alarm, p.onPanel.r3].map((hex) => {
            const t = hexToRgb01(hex);
            return contrastRatio(t, over(t, pct + 1, surfaces[surfaceName]));
          }),
        );
        expect(worst, `${theme}.${color} ${surfaceName} at ${pct + 1}%`).toBeLessThan(4.5);
      }
    }
  });

  it("is per surface because the card pulls an Inspector cell down by more than 1 point in some cell", () => {
    // The decision rule (FILL-TABLE.md): a surface that would pull an Inspector cell down by more
    // than 1 point gets its own value. Dark deuteranopia and protanopia: 13 on the panel, 11 on
    // the card. If this ever fails, one token would do.
    const cells = THEMES.flatMap((t) => COLOR_MODES.map((c) => tagFillOf(PALETTES[t][c])));
    expect(cells.some((f) => f.panel - f.card > 1)).toBe(true);
  });
});

describe("PALETTES completeness", () => {
  it("has an entry for every theme × color combination", () => {
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        expect(PALETTES[theme][color]).toBeDefined();
        expect(PALETTES[theme][color].theme).toBe(theme);
        expect(PALETTES[theme][color].color).toBe(color);
      }
    }
  });

  it("every cell has non-empty ramp strings r0..r4", () => {
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const { ramp } = PALETTES[theme][color];
        expect(ramp.r0).toBeTruthy();
        expect(ramp.r1).toBeTruthy();
        expect(ramp.r2).toBeTruthy();
        expect(ramp.r3).toBeTruthy();
        expect(ramp.r4).toBeTruthy();
      }
    }
  });

  it("every cell has a non-empty alarm string", () => {
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        expect(PALETTES[theme][color].alarm).toBeTruthy();
      }
    }
  });
});

describe("PALETTES spot values - ramps", () => {
  it("dark.neon ramp matches spec", () => {
    expect(PALETTES.dark.neon.ramp).toEqual({
      r0: "#0A2A38",
      r1: "#00E5FF",
      // r2 (the login / identity slot) is magenta in neon by user preference
      // (2026-06-17): login nodes read magenta in the vivid mode, as they did
      // before entities became mode-aware ramp slots. Neon is non-CVD, so this
      // does not touch the colorblind-safe ramps (deut/prot/trit/mono keep r2).
      r2: "#FF5CE8",
      // r3 is decoupled from the alarm channel: neon's r3 used to equal
      // its --alarm red (#FF3D2E), so a DECLINE pill (alarm) and a REVIEW pill
      // (r3) rendered pixel-identical in neon (the default mode). r3 is now a
      // vivid orange - the "elevated" severity slot, distinct from the red alarm.
      r3: "#FF7A1A",
      r4: "#FFFFFF",
    });
  });

  it("dark.neon r3 (elevated) differs from the neon alarm channel", () => {
    expect(PALETTES.dark.neon.ramp.r3).not.toBe(PALETTES.dark.neon.alarm);
    expect(PALETTES.light.neon.ramp.r3).not.toBe(PALETTES.light.neon.alarm);
  });
});

describe("PALETTES spot values - alarm overrides", () => {
  it("dark.neon alarm is #FF3D2E (override)", () => {
    expect(PALETTES.dark.neon.alarm).toBe("#FF3D2E");
  });

  it("dark.rainbow alarm is #FF6B35 (base dark)", () => {
    expect(PALETTES.dark.rainbow.alarm).toBe("#FF6B35");
  });

  it("dark.monochrome alarm is #FFFFFF (override)", () => {
    expect(PALETTES.dark.monochrome.alarm).toBe("#FFFFFF");
  });

  it("light.monochrome alarm is #000000 (override)", () => {
    expect(PALETTES.light.monochrome.alarm).toBe("#000000");
  });

  it("light.deuteranopia alarm is #C9221A (base light, AA-deepened M2 step A)", () => {
    // Deepened from #D62719 to #C9221A so the
    // shared fraud+alarm channel clears WCAG AA as panel TEXT on every light panel
    // stop (panelFloor was 4.10:1 at #D62719 -> 4.58:1). neon/monochrome override.
    expect(PALETTES.light.deuteranopia.alarm).toBe("#C9221A");
  });
});

describe("PALETTES spot values - glass firm-up", () => {
  it("dark.neon.material.glassFill === 0.74 (firm-up applied)", () => {
    expect(PALETTES.dark.neon.material.glassFill).toBe(0.74);
  });

  it("dark.rainbow.material.glassFill === 0.52 (base, no firm-up)", () => {
    expect(PALETTES.dark.rainbow.material.glassFill).toBe(0.52);
  });

  it("light.tritanopia.material.glassBlur === '9px' (firm-up applied)", () => {
    expect(PALETTES.light.tritanopia.material.glassBlur).toBe("9px");
  });
});

describe("PALETTES on-panel kind legibility (Slice 2-H)", () => {
  // The ticker dot/label resolve --kind-token to --<slot>-on-panel. Every kind
  // color must clear WCAG AA (4.5:1) against the instrument panel in EVERY cell -
  // the literal globe slots failed 39/72 cells (deuteranopia auth navy = 1.15:1)
  // because they are tuned for the dark globe, not panel text. The panel is a
  // gradient (panelTop..panelBase..panelFloor), so test the worst case: all stops.
  const triplet01 = (t: string): [number, number, number] => {
    const [r, g, b] = t.split(/\s+/).map((n) => parseInt(n, 10) / 255);
    return [r, g, b];
  };

  it("exposes an onPanel color for every slot a kind maps to", () => {
    const slots = new Set(Object.values(KIND_SLOT));
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const { onPanel } = PALETTES[theme][color];
        for (const slot of slots) {
          expect(onPanel[slot as keyof typeof onPanel]).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it("exposes the caption colour and the four ticker kind-label colours as hex in every cell (C2c)", () => {
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const { onPanel } = PALETTES[theme][color];
        expect(onPanel.caption, `${theme}.${color} caption`).toMatch(/^#[0-9a-f]{6}$/i);
        for (const kind of ["fraud", "auth", "login", "account_event"] as const) {
          expect(onPanel.tickerKind[kind], `${theme}.${color} ${kind}`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  it("exposes the caption colour and the four ticker kind-label colours as hex in every cell (C2c)", () => {
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const { onPanel } = PALETTES[theme][color];
        expect(onPanel.caption, `${theme}.${color} caption`).toMatch(/^#[0-9a-f]{6}$/i);
        for (const kind of ["fraud", "auth", "login", "account_event"] as const) {
          expect(onPanel.tickerKind[kind], `${theme}.${color} ${kind}`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  // The .event row paints the kind tint (rgb(var(--slot-rgb) / 0.10) at the pulse
  // peak) OVER the instrument panel, and the dot/label sit on THAT composited
  // surface - not the bare panel. So the legibility floor must hold against
  // panel-stop ⊕ rawSlot@0.10, the surface the user actually sees every 2.4s.
  const PULSE_PEAK_ALPHA = 0.1;
  const rawSlotHex = (
    p: (typeof PALETTES)["dark"]["rainbow"],
    slot: ReturnType<typeof slotFor>,
  ): string =>
    slot === "alarm"
      ? p.alarm
      : slot === "textFaint"
        ? p.neutral.textFaint
        : p.ramp[slot];

  it("leaves an already-legible vivid slot unclamped (neon cyan auth = no-op)", () => {
    // The clamp is a no-op when the raw slot already clears the floor - vivid
    // neon/rainbow keep their punch; only the dim CVD ramps get pulled.
    expect(PALETTES.dark.neon.onPanel.r1.toLowerCase()).toBe("#00e5ff");
  });

  it("every kind's on-panel color clears 4.5:1 against the pulse-tinted panel in all 12 cells", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const p = PALETTES[theme][color];
        const stops = [p.material.panelTop, p.material.panelBase, p.material.panelFloor].map(triplet01);
        for (const kind of Object.keys(KIND_SLOT)) {
          const slot = slotFor(kind);
          const onPanel = hexToRgb01(p.onPanel[slot as Exclude<keyof typeof p.onPanel, "tickerKind">]);
          const rawSlot = hexToRgb01(rawSlotHex(p, slot));
          for (const stop of stops) {
            const tinted = compositeOver(rawSlot, PULSE_PEAK_ALPHA, stop);
            const c = contrastRatio(onPanel, tinted);
            if (c < 4.5) failures.push(`${theme}/${color}/${kind} = ${c.toFixed(2)}:1 (pulse-tinted)`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("PALETTES panel-text token legibility (light theme)", () => {
  // Panel TEXT reads the RAW tokens, not the ticker-only onPanel clamp:
  // text-dim → --text-faint-rgb = neutral.textFaint, and text-signal / bg-signal
  // → --alarm-rgb = alarm (css-gen.ts). So the raw light tokens must themselves
  // clear WCAG AA (4.5:1) as small text on the panel. The panel is a gradient and
  // panelFloor is the darkest (worst-case) light stop - the same convention
  // legibility.ts uses. This guards the gap that let textFaint (#6C7686 = 3.73:1
  // on panelFloor) and alarm (#D62719 = 4.10:1) ship as sub-AA panel text
  // (M2 step A, 2026-06-20).
  const triplet01 = (t: string): [number, number, number] => {
    const [r, g, b] = t.split(/\s+/).map((n) => parseInt(n, 10) / 255);
    return [r, g, b];
  };
  const light = PALETTES.light.rainbow; // base-light cell: no alarm override, no glass firm-up
  const lightSurfaces = (): [number, number, number][] => [
    triplet01(light.material.panelTop),
    triplet01(light.material.panelBase),
    triplet01(light.material.panelFloor), // darkest stop - the worst case
    hexToRgb01(light.neutral.bg),
    hexToRgb01(light.neutral.surface),
  ];

  it("light textFaint clears 4.5:1 on every light panel surface", () => {
    const fg = hexToRgb01(light.neutral.textFaint);
    for (const bg of lightSurfaces()) {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("EVERY light color-mode's alarm clears 4.5:1 as panel text on every light surface", () => {
    // alarm is consumed as panel TEXT (text-signal: StalenessBanner, loadError) via the
    // raw --alarm-rgb, in WHATEVER color-mode is active - incl. the DEFAULT (neon). A
    // base-only fix left neon-light at its #D62719 override (sub-AA). This loops all 6
    // light modes so the default mode can't silently keep a sub-AA alarm-text gap.
    const failures: string[] = [];
    for (const color of COLOR_MODES) {
      const cell = PALETTES.light[color];
      const surfaces: [number, number, number][] = [
        triplet01(cell.material.panelTop),
        triplet01(cell.material.panelBase),
        triplet01(cell.material.panelFloor),
        hexToRgb01(cell.neutral.bg),
        hexToRgb01(cell.neutral.surface),
      ];
      const fg = hexToRgb01(cell.alarm);
      for (const bg of surfaces) {
        const c = contrastRatio(fg, bg);
        if (c < 4.5) failures.push(`${color} alarm ${cell.alarm} = ${c.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("PALETTES verdict colours (decision capsules and queue flags)", () => {
  const triplet01 = (t: string): [number, number, number] => {
    const [r, g, b] = t.split(/\s+/).map((n) => parseInt(n, 10) / 255);
    return [r, g, b];
  };

  it("every cell carries pass, wait and queue verdict colours, distinct from each other and from alarm", () => {
    for (const theme of THEMES) for (const color of COLOR_MODES) {
      const p = PALETTES[theme][color];
      const four = [p.alarm, p.verdict.pass, p.verdict.wait, p.verdict.queue].map((h) => h.toLowerCase());
      expect(new Set(four).size, `${theme}.${color}`).toBe(4);
    }
  });

  it("the verdict on-panel colours clear 4.5:1 on the worst panel stop and on the tinted capsule fill in all 12 cells", () => {
    const failures: string[] = [];
    for (const theme of THEMES) for (const color of COLOR_MODES) {
      const p = PALETTES[theme][color];
      const worst = triplet01(theme === "dark" ? p.material.panelTop : p.material.panelFloor);
      for (const slot of ["pass", "wait", "queue"] as const) {
        const fg = hexToRgb01(p.onPanel[slot]);
        // Capsules and flags paint the tone at 0.14 over the page background.
        const capsule = compositeOver(hexToRgb01(p.verdict[slot]), 0.14, hexToRgb01(p.neutral.bg));
        for (const [where, bg] of [["panel", worst], ["capsule", capsule]] as const) {
          const c = contrastRatio(fg, bg);
          if (c < 4.5) failures.push(`${theme}.${color}.${slot} on ${where} = ${c.toFixed(2)}:1`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
