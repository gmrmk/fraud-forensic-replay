// frontend/investigator/src/components/timeline/CaseTimelineLayer.marks-ink.test.ts
//
// Marks ink: the band, the ambient gradient behind the
// whole-case track, reads the theme's ink variable for its dominant kind, keeps its alpha ramp,
// and leaves the lane lines and the dots on the vivid slot.
//
// A source test for the reason TimelineShell.marks-ink.test.ts gives (happy-dom drops a
// `background` that carries var()), plus one that resolves the variable the source derives for
// every kind the layer knows to a variable the theme emits.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { kindRgbVar } from "../../lib/entity-palette";
import { COLOR_MODES, THEMES } from "../../theme/axes";
import { paletteToCssBlock } from "../../theme/css-gen";
import { KIND_SLOT } from "../../theme/entity-mapping";
import { PALETTES } from "../../theme/tokens";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "CaseTimelineLayer.tsx"), "utf8");

/** The ambient gradient's code: from its stops to its gradient string, found by those anchors. */
function ambient(): string {
  const start = source.indexOf("const ambientStops = ambientBuckets.map(");
  expect(start, "the ambient stops in CaseTimelineLayer.tsx").toBeGreaterThan(-1);
  const end = source.indexOf("const ambientGradient = ", start);
  expect(end, "the gradient string after them").toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("the band's colour", () => {
  it("a coded kind reads the ink variable derived from its slot's raw variable", () => {
    const code = ambient();
    expect(code).toContain('kindRgbVar(dom).replace(/-rgb$/, "-mark-rgb")');
    expect(code).toMatch(/rgb\(var\(\$\{inkVar\}\) \/ \$\{alpha\.toFixed\(3\)\}\)/);
  });

  it("a declared kind keeps its manifest colour through paint", () => {
    expect(ambient()).toContain("genericHex[dom] ? paint(dom, alpha.toFixed(3))");
  });

  it("names no raw slot and no colour literal", () => {
    // The empty bucket's transparent stop is not a colour of the palette; it is taken out first.
    const code = ambient().replace("rgba(0,0,0,0)", "");
    expect(code).not.toMatch(/--(r[0-4]|alarm|text-faint)-rgb/);
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(code).not.toMatch(/\brgba?\((?!var\()/);
  });

  it("the variable derived for every kind the layer knows is emitted by the theme in every cell", () => {
    const kinds = [...Object.keys(KIND_SLOT), "a-kind-with-no-slot"];
    for (const kind of kinds) {
      const name = kindRgbVar(kind).replace(/-rgb$/, "-mark-rgb");
      for (const theme of THEMES) {
        for (const color of COLOR_MODES) {
          expect(paletteToCssBlock(PALETTES[theme][color]), `${kind} ${theme} ${color} ${name}`).toContain(`${name}: `);
        }
      }
    }
  });
});

describe("the band's alpha ramp is as before", () => {
  it("the alpha is the bucket's total over five at 0.12 each, capped at 0.32", () => {
    expect(ambient()).toContain("const alpha = Math.min(0.32, (total / 5) * 0.12);");
  });

  it("a bucket with no event is transparent", () => {
    expect(ambient()).toContain("rgba(0,0,0,0) ${pct.toFixed(2)}%");
  });
});

describe("what stays on the vivid slot", () => {
  it("the lane lines still paint with the kind's raw colour", () => {
    expect(source).toContain("return `${paint(kind, alpha.toFixed(3))} ${pct.toFixed(2)}%`;");
  });

  it("the dot glow still paints with the kind's raw colour", () => {
    expect(source).toContain("0 0 ${5 - prominence}px ${paint(kind, 0.9 + prominence * 0.1)}");
  });
});
