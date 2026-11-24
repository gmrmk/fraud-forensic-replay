// frontend/investigator/src/theme/inspector-text-colour.test.ts
//
// BACKLOG item 16: the Inspector's texts that took a raw palette colour (--r1 as text-accent, --r2
// as text-identity, --r3 as text-elevated, --alarm as text-signal) read under 4.5 against the
// Inspector's panel in several theme and palette cells (the red run, 2026-11-19: --r3 1.44, --r2
// 2.19, --r1 1.40, --alarm 4.88). The rule: every text colour the Inspector takes from the palette
// reads 4.5 or more, computed against the Inspector's own surface (the .instrument panel's flat
// fill, --panel-base) in all 12 cells; marks that are not text keep the raw palette colour.
//
// The test reads the class each Inspector component file actually carries, resolves it to the
// colour it paints in each cell, and measures that colour on the panel. It prints one line for each
// text colour: the colour in light neon and dark neon, from and to, and the lowest ratio of the
// new colour over the 12 cells.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLOR_MODES, THEMES } from "./axes";
import { paletteToCssBlock } from "./css-gen";
import { compositeOver, contrastRatio, legibleOnPanel } from "./legibility";
import { hexToRgb01 } from "./to-rgb";
import { INSPECTOR_TEXT_TARGET, PALETTES, inspectorSurfaceOf, inspectorTextOf, type ThemePalette } from "./tokens";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "..");

/** The Inspector and its sections: the shell, then every component of the folder that is not a test. */
const FILES = [
  "components/Inspector.tsx",
  ...readdirSync(resolve(SRC, "components/inspector"))
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    .map((f) => `components/inspector/${f}`),
];

/** A file's code without its comments, so a comment that names a class is not read as a use of it. */
const code = (file: string): string =>
  readFileSync(resolve(SRC, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

type Slot = "r1" | "r2" | "r3" | "alarm";
const slotColour = (p: ThemePalette, slot: Slot): string => (slot === "alarm" ? p.alarm : p.ramp[slot]);
const CELLS = THEMES.flatMap((theme) => COLOR_MODES.map((color) => PALETTES[theme][color]));

/** The Inspector's own surface, as a cell paints it. */
const panel = (p: ThemePalette) => inspectorSurfaceOf(p);

describe("the Inspector's text colours, in every theme and palette", () => {
  for (const p of CELLS) {
    it(`${p.theme} ${p.color}: each slot is legibleOnPanel at the target on the panel, and reads it`, () => {
      const ink = inspectorTextOf(p);
      for (const slot of ["r1", "r2", "r3", "alarm"] as const) {
        expect(ink[slot], slot).toBe(legibleOnPanel(slotColour(p, slot), panel(p), INSPECTOR_TEXT_TARGET));
        const reads = contrastRatio(hexToRgb01(ink[slot]), panel(p));
        expect(reads, `${slot} reads ${reads.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        expect(reads, `${slot} reads ${reads.toFixed(2)}`).toBeGreaterThanOrEqual(INSPECTOR_TEXT_TARGET);
      }
    });
  }

  it("the target is the sweep rule's 6.0 and clears the 4.5 floor with margin", () => {
    expect(INSPECTOR_TEXT_TARGET).toBe(6.0);
  });

  // The margin moves a colour that already read 4.5 (the cost of 6.0 over 4.5); the test prints which,
  // so that the cost can be weighed. One constant reverses it.
  it("prints the colours that read 4.5 on the panel as they were and moved on the margin alone", () => {
    const moved: string[] = [];
    for (const p of CELLS) {
      for (const slot of ["r1", "r2", "r3", "alarm"] as const) {
        const raw = slotColour(p, slot);
        const was = contrastRatio(hexToRgb01(raw), panel(p));
        if (was >= 4.5 && inspectorTextOf(p)[slot].toLowerCase() !== raw.toLowerCase()) {
          moved.push(`${p.theme} ${p.color} ${slot} ${raw} ${was.toFixed(2)} to ${inspectorTextOf(p)[slot]}`);
        }
      }
    }
    console.log(`INSPECTOR-TEXT moved on the margin alone (${moved.length}): ${moved.join("; ")}`);
    expect(moved.length).toBeGreaterThanOrEqual(0);
  });

  it("the panel surface is the panel's flat fill, --panel-base", () => {
    expect(panel(PALETTES.light.neon)).toEqual(
      PALETTES.light.neon.material.panelBase.split(/\s+/).map((n) => parseInt(n, 10) / 255),
    );
  });

  it("moves the colours the sweep named and leaves the ones that already read it", () => {
    // light tritanopia --r3 read 1.44 and --r2 2.19 as text; both move.
    expect(inspectorTextOf(PALETTES.light.tritanopia).r3.toLowerCase()).not.toBe(PALETTES.light.tritanopia.ramp.r3.toLowerCase());
    expect(inspectorTextOf(PALETTES.light.tritanopia).r2.toLowerCase()).not.toBe(PALETTES.light.tritanopia.ramp.r2.toLowerCase());
    // dark neon cyan reads over 6.0 on the dark panel as it is.
    expect(inspectorTextOf(PALETTES.dark.neon).r1.toLowerCase()).toBe(PALETTES.dark.neon.ramp.r1.toLowerCase());
  });
});

// The Inspector's grey. The captions under values, the "none" lines,
// the list dates and the secondary-template fields took text-dim, the raw --text-faint: 4.96 to 1 on
// the light panel (6.19 on the dark one). The grey margin's rule is 6.0 computed on the text's own
// surface. --text-faint-on-panel is not it: its dark value was clamped on panelTop, so it would move a
// dark text that already clears. The Inspector's own token is the faint colour clamped on this panel.
describe("the Inspector's grey, --text-faint-on-inspector", () => {
  const LIGHT_GREY = "#505865";
  for (const p of CELLS) {
    it(`${p.theme} ${p.color}: the faint colour clamped to 6.0 on the panel, and it reads it`, () => {
      const ink = inspectorTextOf(p).textFaint;
      expect(ink).toBe(legibleOnPanel(p.neutral.textFaint, panel(p), INSPECTOR_TEXT_TARGET));
      const reads = contrastRatio(hexToRgb01(ink), panel(p));
      expect(reads, `reads ${reads.toFixed(2)}`).toBeGreaterThanOrEqual(6.0);
      if (p.theme === "dark") expect(ink.toLowerCase(), "dark clears as it is").toBe(p.neutral.textFaint.toLowerCase());
      else expect(ink.toLowerCase()).toBe(LIGHT_GREY);
    });
  }

  it("the raw faint colour is the one that fell short: under 6.0 in every light cell", () => {
    for (const p of CELLS.filter((c) => c.theme === "light")) {
      expect(contrastRatio(hexToRgb01(p.neutral.textFaint), panel(p))).toBeLessThan(6.0);
    }
  });

  it("is emitted on its own line in every cell, and --text-faint-on-panel keeps its value", () => {
    for (const p of CELLS) {
      const block = paletteToCssBlock(p);
      expect(block).toContain(`\n  --text-faint-on-inspector: ${inspectorTextOf(p).textFaint};\n`);
      expect(block).toContain(`--text-faint-on-panel: ${p.onPanel.textFaint};`);
    }
  });

  it("no Inspector component paints a text in the raw faint colour (text-dim); the pop-out glyph is a control", () => {
    const found: string[] = [];
    for (const file of FILES) {
      for (const m of code(file).matchAll(/(?:[a-z-]+:)?text-dim(?![\w-])/g)) found.push(`${file}: ${m[0]}`);
    }
    expect(found).toEqual([]);
    // The glyph of the pop-out button keeps the raw faint colour: a control glyph is held to 3 to 1 (it
    // reads 4.96 in light), as the narrative panel's chevron is.
    expect(code("components/inspector/PopOutButton.tsx")).toContain("text-[color:var(--text-faint)]");
  });

  it("reads 6.0 or more in all 12 cells for every use, and prints the table", () => {
    const uses = new Set<string>();
    for (const file of FILES) {
      if (code(file).includes("text-[color:var(--text-faint-on-inspector)]")) uses.add(file.replace("components/", ""));
    }
    expect(uses.size).toBeGreaterThan(0);
    const lows = CELLS.map((p) => contrastRatio(hexToRgb01(inspectorTextOf(p).textFaint), panel(p)));
    console.log(
      `INSPECTOR-TEXT --text-faint-on-inspector [${[...uses].join(", ")}] from light #5D6776 4.96 to light ${inspectorTextOf(PALETTES.light.neon).textFaint} dark ${inspectorTextOf(PALETTES.dark.neon).textFaint} lowest ${Math.min(...lows).toFixed(2)}`,
    );
    expect(Math.min(...lows)).toBeGreaterThanOrEqual(6.0);
  });
});

describe("the theme emits the Inspector's text colours", () => {
  for (const p of CELLS) {
    it(`${p.theme} ${p.color}: --<slot>-on-inspector for r1, r2, r3 and alarm`, () => {
      const block = paletteToCssBlock(p);
      const ink = inspectorTextOf(p);
      expect(block).toContain(`--r1-on-inspector: ${ink.r1};`);
      expect(block).toContain(`--r2-on-inspector: ${ink.r2};`);
      expect(block).toContain(`--r3-on-inspector: ${ink.r3};`);
      expect(block).toContain(`--alarm-on-inspector: ${ink.alarm};`);
    });
  }

  it("leaves every existing on-panel variable as it was", () => {
    const block = paletteToCssBlock(PALETTES.light.neon);
    const op = PALETTES.light.neon.onPanel;
    expect(block).toContain(`--r1-on-panel: ${op.r1}; --r2-on-panel: ${op.r2}; --r3-on-panel: ${op.r3};`);
    expect(block).toContain(`--alarm-on-panel: ${op.alarm};`);
  });
});

describe("the Inspector's component files", () => {
  it("carry no raw palette colour as a text colour", () => {
    const found: string[] = [];
    for (const file of FILES) {
      for (const m of code(file).matchAll(/(?:[a-z-]+:)?text-(accent|identity|elevated|signal)(?![\w-])/g)) {
        found.push(`${file}: ${m[0]}`);
      }
    }
    expect(found).toEqual([]);
  });

  const VAR_CLASS = /(?:[a-z-]+:)?text-\[color:var\(--(r1|r2|r3|alarm)-on-inspector\)\]/g;

  it("read every Inspector text colour at 4.5 or more in all 12 cells, and print the table", () => {
    const rows = new Map<string, { slot: Slot; files: Set<string> }>();
    for (const file of FILES) {
      for (const m of code(file).matchAll(VAR_CLASS)) {
        const row = rows.get(m[0]) ?? { slot: m[1] as Slot, files: new Set<string>() };
        row.files.add(file.replace("components/", ""));
        rows.set(m[0], row);
      }
    }
    expect(rows.size).toBeGreaterThan(0);
    for (const [cls, { slot, files }] of rows) {
      let low = Infinity;
      let lowFrom = Infinity;
      let lowCell = "";
      for (const p of CELLS) {
        const to = contrastRatio(hexToRgb01(inspectorTextOf(p)[slot]), panel(p));
        lowFrom = Math.min(lowFrom, contrastRatio(hexToRgb01(slotColour(p, slot)), panel(p)));
        if (to < low) {
          low = to;
          lowCell = `${p.theme} ${p.color}`;
        }
      }
      const from = (p: ThemePalette) => slotColour(p, slot);
      const to = (p: ThemePalette) => inspectorTextOf(p)[slot];
      console.log(
        `INSPECTOR-TEXT ${cls} [${[...files].join(", ")}] from light ${from(PALETTES.light.neon)} dark ${from(PALETTES.dark.neon)} (lowest ${lowFrom.toFixed(2)}) to light ${to(PALETTES.light.neon)} dark ${to(PALETTES.dark.neon)} lowest ${low.toFixed(2)} (${lowCell})`,
      );
      expect(low, `${cls} lowest ${lowCell}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keep the raw palette colour on the marks that are not text: a ring, a border, a tint and a plate", () => {
    const session = code("components/inspector/SessionField.tsx");
    expect(session).toContain("border-accent/60");
    expect(session).toContain("hover:border-accent/50");
    expect(session).toContain("focus-visible:ring-accent");
    expect(session).toContain("bg-[rgb(var(--r1-rgb)/0.12)]");
    expect(session).toContain("bg-[rgb(var(--r1-rgb)/0.06)]");
    expect(code("components/inspector/ManifestFieldsSection.tsx")).toContain("focus-visible:ring-accent");
    // The BLOCKED plate (the transfer's own status alone; an account event has none): its fill is
    // the raw alarm colour, its ink a fixed dark colour.
    expect(code("components/inspector/TransferInspector.tsx")).toContain("bg-signal");
  });

  // The session chip's text sits on its own tint (the raw --r1 at 0.12 when the thread is open or
  // the chip is hovered), not on the bare panel. It is the only touched text with a fill under it
  // (no other file of the folder paints a fill beneath a palette text).
  it("the session chip's r1 text reads 4.5 or more on its own tint in all 12 cells", () => {
    const rows: string[] = [];
    let low = Infinity;
    for (const p of CELLS) {
      const tint = compositeOver(hexToRgb01(p.ramp.r1), 0.12, panel(p));
      const ratio = contrastRatio(hexToRgb01(inspectorTextOf(p).r1), tint);
      rows.push(`${p.theme} ${p.color} ${ratio.toFixed(2)}`);
      low = Math.min(low, ratio);
    }
    console.log(`INSPECTOR-TEXT session chip r1 on its 0.12 tint lowest ${low.toFixed(2)}; ${rows.join("; ")}`);
    expect(low).toBeGreaterThanOrEqual(4.5);
  });

  it("never paint a fill, a border or a ring with the text colour", () => {
    for (const file of FILES) {
      expect(code(file), file).not.toMatch(/(?:bg|border|ring|fill|stroke)-\[?[^\s"'`]*on-inspector/);
    }
  });

  // A FINDING, not a fix: the BLOCKED plate's text is a fixed dark ink on the raw alarm fill, which is
  // the plate (a mark) and keeps its colour here. In the six light cells the word reads 3.57 (light
  // monochrome 1.04, where the alarm is #000000); the six dark cells read over 4.5. The test prints
  // the cells and pins what was read, so a change to the plate or the ink turns it red and the
  // finding is looked at again.
  it("records the BLOCKED plate's ink on the raw alarm fill, where it is under 4.5 in the light cells", () => {
    const ink = hexToRgb01("#0b0608");
    const under = CELLS.filter((p) => contrastRatio(ink, hexToRgb01(p.alarm)) < 4.5).map(
      (p) => `${p.theme} ${p.color} ${contrastRatio(ink, hexToRgb01(p.alarm)).toFixed(2)}`,
    );
    console.log(`INSPECTOR-TEXT plate ink #0b0608 on --alarm under 4.5: ${under.join("; ")}`);
    expect(under).toEqual([
      "light rainbow 3.57",
      "light neon 3.57",
      "light deuteranopia 3.57",
      "light protanopia 3.57",
      "light tritanopia 3.57",
      "light monochrome 1.04",
    ]);
  });
});
