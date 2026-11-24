// frontend/investigator/src/components/timeline/TimelineShell.marks-ink.test.ts
//
// The ribbon, the day strip at the top of the
// Timeline, reads the theme's ink variables and no colour of its own, and its alpha ramp (the
// day's count is still the brightness) keeps its figures.
//
// A source test, as readout-colour.test.ts is: happy-dom drops a `background` written as
// `rgb(var(--x) / a)` (TimelineShell.test.tsx's snapshots show the buttons with no background), so
// a render test would pass whatever the component painted. The theme's side (the values, the
// emitted variables) is pinned in theme/marks-ink.test.ts.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLOR_MODES, THEMES } from "../../theme/axes";
import { paletteToCssBlock } from "../../theme/css-gen";
import { PALETTES } from "../../theme/tokens";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "TimelineShell.tsx"), "utf8");

/** The ribbon's own code: from the day map to the button's title, found by those anchors. */
function ribbon(): string {
  const start = source.indexOf("dayDensity.map((c, i) => {");
  expect(start, "the dayDensity map in TimelineShell.tsx").toBeGreaterThan(-1);
  const end = source.indexOf("title={`${c.count} event", start);
  expect(end, "the button's title after it").toBeGreaterThan(start);
  return source.slice(start, end);
}

/** Every `var(--name)` the ribbon names. */
function varsNamed(code: string): string[] {
  return [...code.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
}

describe("the ribbon's colour", () => {
  it("an ordinary day reads the theme's r1 ink and a severe day its alarm ink", () => {
    const code = ribbon();
    expect(code).toContain("rgb(var(--alarm-mark-rgb) / ${Math.max(alpha, 0.55)})");
    expect(code).toContain("rgb(var(--r1-mark-rgb) / ${alpha.toFixed(3)})");
  });

  it("names no raw slot and no colour literal", () => {
    const code = ribbon();
    expect(varsNamed(code).sort()).toEqual(["--alarm-mark-rgb", "--r1-mark-rgb"]);
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(code).not.toMatch(/\brgba?\((?!var\()/);
    expect(code).not.toMatch(/\bhsla?\(/);
  });

  it("every variable it names is emitted by the theme in every cell", () => {
    for (const name of varsNamed(ribbon())) {
      for (const theme of THEMES) {
        for (const color of COLOR_MODES) {
          expect(paletteToCssBlock(PALETTES[theme][color]), `${theme} ${color} ${name}`).toContain(`${name}: `);
        }
      }
    }
  });
});

describe("the ribbon's alpha ramp is as before", () => {
  it("a day with no events is 0.04, a day with events 0.12 plus the count's share of 0.55", () => {
    expect(ribbon()).toContain("const alpha = c.count === 0 ? 0.04 : 0.12 + (c.count / max) * 0.55;");
  });

  it("the share is of the busiest day, and a severe day is never fainter than 0.55", () => {
    const code = ribbon();
    expect(code).toContain("const max = Math.max(...dayDensity.map((x) => x.count), 1);");
    expect(code).toContain("Math.max(alpha, 0.55)");
  });

  it("the ramp's figures, evaluated: 3 of 12 events is 0.26, 12 of 12 is 0.67, none is 0.04", () => {
    const ramp = (count: number, max: number) => (count === 0 ? 0.04 : 0.12 + (count / max) * 0.55);
    expect(ramp(3, 12)).toBeCloseTo(0.2575, 4);
    expect(ramp(12, 12)).toBeCloseTo(0.67, 4);
    expect(ramp(0, 12)).toBe(0.04);
  });
});
