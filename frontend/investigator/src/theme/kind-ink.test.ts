/**
 * The resolver of a story's own kinds (theme/kind-ink.ts), tests 1.1 to 1.8 of PLAN-theme-follow.md as
 * AMEND-theme-follow.md rules them. The expected tables (kind-ink.expected.ts) come from a run of the
 * designer's engine, not from the port; DRAWN below is the designer's table for the six drawn states,
 * typed from the plan, and the port must equal it to the hex.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ScenarioNode } from "../lib/scenarios";
import { COLOR_MODES, THEMES, type ColorMode, type Theme } from "./axes";
import { KIND_SLOT } from "./entity-mapping";
import { INK_BINDING_HEX, atContrast, inkDistance, inkKindsOf, storyInk, type InkNode } from "./kind-ink";
import { EXPECTED } from "./kind-ink.expected";
import { compositeOver, contrastRatio, legibleOnPanel, relativeLuminance } from "./legibility";
import { hexToRgb01 } from "./to-rgb";
import { PALETTES } from "./tokens";

const rawManifests = import.meta.glob<string>("../../../../backend/scenarios/*.scenario.json", {
  query: "?raw",
  import: "default",
  eager: true,
});
interface ManifestShape {
  id: string;
  nodes: ScenarioNode[];
}
const manifests = Object.values(rawManifests).map((raw) => JSON.parse(raw) as ManifestShape);
const manifestById = (id: string): ManifestShape => {
  const found = manifests.find((m) => m.id === id);
  if (!found) throw new Error(`no scenario file with id ${id} under backend/scenarios`);
  return found;
};

type StoryId = "platform-access" | "key-many-networks" | "card-fraud";
const STORIES: StoryId[] = ["platform-access", "key-many-networks", "card-fraud"];
const TWO_STORIES: StoryId[] = ["platform-access", "key-many-networks"];
const DRAWN_MODES: ColorMode[] = ["neon", "deuteranopia", "monochrome"];
const UNDRAWN_MODES: ColorMode[] = ["rainbow", "protanopia", "tritanopia"];

interface Row {
  kind: string;
  mark: string;
  text: string;
}
const rowsOf = (nodes: readonly InkNode[], theme: Theme, color: ColorMode): Row[] =>
  Array.from(storyInk(nodes, theme, color), ([kind, ink]) => ({ kind, mark: ink.mark, text: ink.text }));

// The designer's tables for the six drawn states of two stories (option B), mark/text in manifest order.
// A token with no slash is a mark whose text ink equals it.
const DRAWN: Record<string, string> = {
  "platform-access|dark|neon": "#4da3ff/#4da3ff #7ee787/#7ee787 #c4a1ff/#c4a1ff #f5a623/#f5a623 #ff6b6b/#ff6b6b",
  "platform-access|light|neon": "#0072eb/#0057b3 #198522/#13671a #8e4aff/#6508ff #a16707/#7a4e05 #ea0000/#b70000",
  "platform-access|dark|deuteranopia": "#61a3ff/#61a3ff #e8d978/#e8d978 #6b8bb3/#7f9bbd #d6bd24/#d6bd24 #ff6b35/#ff6b35",
  "platform-access|light|deuteranopia": "#0048ad/#0048ad #29250a/#29250a #55627c/#4d5870 #413b10/#413b10 #c9221a/#ae1d16",
  "platform-access|dark|monochrome": "#737373/#979797 #d4d4d4/#d4d4d4 #8f8f8f/#979797 #b0b0b0/#b0b0b0 #ffffff/#ffffff",
  "platform-access|light|monochrome": "#2a2a2a/#2a2a2a #757575/#595959 #434343/#434343 #5c5c5c/#595959 #000000/#000000",
  "key-many-networks|dark|neon": "#4da3ff #c4a1ff #7ee787 #f5a623 #ffd166 #ff9bd2 #a5d6ff #56d4dd #ff6b6b",
  "key-many-networks|light|neon":
    "#0072eb/#0057b3 #8e4aff/#6508ff #198522/#13671a #a16707/#7a4e05 #755200/#755200 #e2007d/#af0061 #0061b2/#0059a3 #1c8189/#156167 #ea0000/#b70000",
  "key-many-networks|dark|deuteranopia":
    "#61a3ff/#61a3ff #6b8bb3/#7f9bbd #e8d978/#e8d978 #d6bd24/#d6bd24 #a1a1a1/#a1a1a1 #0068fa/#4d97ff #918963/#9f9873 #abbdd4/#abbdd4 #ff6b35/#ff6b35",
  "key-many-networks|light|deuteranopia":
    "#0048ad/#0048ad #55627c/#4d5870 #29250a/#29250a #413b10/#413b10 #4b4e53/#4b4e53 #00204d/#00204d #686350/#5c5847 #323948/#323948 #c9221a/#ae1d16",
  "key-many-networks|dark|monochrome":
    "#737373/#979797 #818181/#989898 #d4d4d4/#d4d4d4 #8f8f8f/#979797 #e9e9e9/#e9e9e9 #9f9f9f/#9f9f9f #c1c1c1/#c1c1c1 #b0b0b0/#b0b0b0 #ffffff/#ffffff",
  "key-many-networks|light|monochrome":
    "#1a1a1a/#1a1a1a #2a2a2a/#2a2a2a #686868/#595959 #373737/#373737 #757575/#595959 #434343/#434343 #5c5c5c/#595959 #4f4f4f/#4f4f4f #000000/#000000",
};
const drawnTokens = (key: string): { mark: string; text: string }[] =>
  DRAWN[key].split(" ").map((t) => {
    const [mark, text = mark] = t.split("/");
    return { mark, text };
  });

const isOwnInk = (n: ScenarioNode): boolean =>
  !Object.prototype.hasOwnProperty.call(KIND_SLOT, n.kind) && /^#[0-9a-f]{6}$/i.test(n.palette);

describe("1.1 the six drawn states of two stories equal the designer's tables to the hex", () => {
  it("the oracle's expected tables equal the drawn tables, mark and text", () => {
    for (const story of TWO_STORIES) {
      for (const theme of THEMES) {
        for (const mode of DRAWN_MODES) {
          const key = `${story}|${theme}|${mode}`;
          const rows = EXPECTED[story][theme][mode];
          expect(rows.map((r) => ({ mark: r.mark, text: r.text })), key).toEqual(drawnTokens(key));
        }
      }
    }
  });

  it("storyInk of the real manifest nodes equals the expected tables: every kind, in manifest order", () => {
    for (const story of TWO_STORIES) {
      const nodes = manifestById(story).nodes;
      for (const theme of THEMES) {
        for (const mode of DRAWN_MODES) {
          expect(rowsOf(nodes, theme, mode), `${story} ${theme} ${mode}`).toEqual(EXPECTED[story][theme][mode]);
        }
      }
    }
  });
});

describe("1.2 the three modes that were not drawn", () => {
  it("rainbow, protanopia and tritanopia equal the expected tables for both stories and card-fraud, both themes", () => {
    for (const story of STORIES) {
      const nodes = manifestById(story).nodes;
      for (const theme of THEMES) {
        for (const mode of UNDRAWN_MODES) {
          expect(rowsOf(nodes, theme, mode), `${story} ${theme} ${mode}`).toEqual(EXPECTED[story][theme][mode]);
        }
      }
    }
  });

  it("card-fraud equals its one-row expected tables in all twelve cells", () => {
    const nodes = manifestById("card-fraud").nodes;
    for (const theme of THEMES) {
      for (const mode of COLOR_MODES) {
        const want = EXPECTED["card-fraud"][theme][mode];
        expect(want.length, `${theme} ${mode}`).toBe(1);
        expect(rowsOf(nodes, theme, mode), `${theme} ${mode}`).toEqual(want);
      }
    }
  });
});

describe("1.3 protanopia takes deuteranopia's tables (S2)", () => {
  it("for both stories and both themes the two modes give the same marks and texts", () => {
    for (const story of TWO_STORIES) {
      const nodes = manifestById(story).nodes;
      for (const theme of THEMES) {
        expect(rowsOf(nodes, theme, "protanopia"), `${story} ${theme}`).toEqual(rowsOf(nodes, theme, "deuteranopia"));
      }
    }
  });
});

describe("1.4 dark neon carries the manifest colour (ruling T1)", () => {
  it("every own kind of every manifest keeps its palette, lower-cased, as mark and as text", () => {
    let checked = 0;
    for (const m of manifests) {
      const own = m.nodes.filter(isOwnInk);
      const ink = storyInk(m.nodes, "dark", "neon");
      expect([...ink.keys()], m.id).toEqual(own.map((n) => n.kind));
      for (const n of own) {
        const hex = n.palette.toLowerCase();
        expect(ink.get(n.kind), `${m.id} ${n.kind}`).toEqual({ mark: hex, text: hex });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("a kind that lies close to an earlier one is not stepped in dark neon (S3), and is stepped on in light", () => {
    const near: InkNode[] = [
      { kind: "a", palette: "#ff6b6b" },
      { kind: "b", palette: "#ff6c6c" },
    ];
    const dark = storyInk(near, "dark", "neon");
    expect(dark.get("a")?.mark).toBe("#ff6b6b");
    expect(dark.get("b")?.mark).toBe("#ff6c6c");
    const light = storyInk(near, "light", "neon");
    expect(light.get("b")?.mark).not.toBe(light.get("a")?.mark);
  });
});

// The surfaces of a theme that a mark sits on, by the engine's list (four each). In the light theme the
// glass is the active mode's own: the glass tint at its fill over black, in 8 bits (AMEND part 3).
const DARK_SURFACES = ["#0b0e13", "#111824", "#222a36", "#141922"];
const triplet01 = (t: string): [number, number, number] => {
  const [r, g, b] = t.split(/\s+/).map((n) => parseInt(n, 10) / 255);
  return [r, g, b];
};
const q8 = (c: [number, number, number]): [number, number, number] => [
  Math.round(c[0] * 255) / 255,
  Math.round(c[1] * 255) / 255,
  Math.round(c[2] * 255) / 255,
];
const glassOf = (color: ColorMode): [number, number, number] => {
  const m = PALETTES.light[color].material;
  return q8(compositeOver(triplet01(m.glassTint), m.glassFill, [0, 0, 0]));
};
const surfacesOf = (theme: Theme, color: ColorMode): [number, number, number][] =>
  theme === "dark"
    ? DARK_SURFACES.map(hexToRgb01)
    : [hexToRgb01("#fbfcfd"), hexToRgb01("#cfd4db"), glassOf(color), hexToRgb01("#ebeff5")];
const panelBaseOf = (theme: Theme, color: ColorMode) => triplet01(PALETTES[theme][color].material.panelBase);
const headerOf = (theme: Theme, color: ColorMode) => {
  const m = PALETTES[theme][color].material;
  return q8(compositeOver(triplet01(m.panelFloor), 0.85, triplet01(m.panelBase)));
};

describe("1.5 the floors hold in every manifest, theme and mode", () => {
  it("the header surface is the one the window-ink test names, and rainbow's glass is its own", () => {
    expect(headerOf("light", "neon").map((c) => Math.round(c * 255))).toEqual([228, 233, 241]);
    expect(headerOf("dark", "neon").map((c) => Math.round(c * 255))).toEqual([15, 19, 26]);
    expect(glassOf("rainbow").map((c) => Math.round(c * 255))).toEqual([201, 204, 209]);
    expect(glassOf("neon").map((c) => Math.round(c * 255))).toEqual([208, 211, 216]);
  });

  it("each mark reaches 3:1 on the four surfaces, each text 4.5:1 on the panel and the header, and the menu step keeps the mark", () => {
    let checked = 0;
    for (const m of manifests) {
      for (const theme of THEMES) {
        for (const color of COLOR_MODES) {
          const ink = storyInk(m.nodes, theme, color);
          const base = panelBaseOf(theme, color);
          const header = headerOf(theme, color);
          for (const [kind, { mark, text }] of ink) {
            const where = `${m.id} ${theme} ${color} ${kind} ${mark} ${text}`;
            for (const s of surfacesOf(theme, color)) {
              expect(contrastRatio(hexToRgb01(mark), s), where).toBeGreaterThanOrEqual(3);
            }
            expect(contrastRatio(hexToRgb01(text), base), where).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(hexToRgb01(text), header), where).toBeGreaterThanOrEqual(4.5);
            expect(legibleOnPanel(mark, base, 3), where).toBe(mark);
            expect(mark, where).toMatch(/^#[0-9a-f]{6}$/);
            expect(text, where).toMatch(/^#[0-9a-f]{6}$/);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(400);
  });
});

describe("1.6 a slot kind and a colour that is not #rrggbb never enter the rule (ruling T3)", () => {
  it("card-fraud and priya-ato hold exactly one key, decision, in every cell", () => {
    for (const id of ["card-fraud", "priya-ato"]) {
      const nodes = manifestById(id).nodes;
      for (const theme of THEMES) {
        for (const color of COLOR_MODES) {
          expect([...storyInk(nodes, theme, color).keys()], `${id} ${theme} ${color}`).toEqual(["decision"]);
        }
      }
    }
  });

  it("a node with a palette that is not six hex digits has no entry, and inkKindsOf reads the rest in manifest order", () => {
    const nodes: InkNode[] = [
      { kind: "x", palette: "rebeccapurple" },
      { kind: "y", palette: "#ABCDEF" },
      { kind: "fraud", palette: "#ff3d2e" },
      { kind: "z", palette: "#123", decision: {} as unknown as ScenarioNode["decision"] },
      { kind: "constructor", palette: "#00ff00" },
    ];
    expect(storyInk(nodes, "dark", "neon").has("x")).toBe(false);
    expect(inkKindsOf(nodes)).toEqual([
      { kind: "y", hex: "#abcdef", decision: false },
      { kind: "constructor", hex: "#00ff00", decision: false },
    ]);
    expect(storyInk(nodes, "dark", "neon").has("fraud")).toBe(false);
  });

  it("a decision node of a story is flagged so, and takes the alarm outside neon", () => {
    const nodes = manifestById("card-fraud").nodes;
    expect(inkKindsOf(nodes)).toEqual([{ kind: "decision", hex: "#ff6b6b", decision: true }]);
    expect(storyInk(nodes, "dark", "deuteranopia").get("decision")?.mark).toBe("#ff6b35");
    expect(storyInk(nodes, "dark", "monochrome").get("decision")?.mark).toBe("#ffffff");
  });
});

describe("1.7 the binding surfaces", () => {
  it("INK_BINDING_HEX is the lightest dark and the darkest light surface of the firmed modes", () => {
    expect(INK_BINDING_HEX).toEqual({ dark: "#222a36", light: "#d0d3d8" });
    for (const theme of THEMES) {
      const lum = surfacesOf(theme, "neon").map((s) => relativeLuminance(s));
      const bound = relativeLuminance(hexToRgb01(INK_BINDING_HEX[theme]));
      expect(bound).toBe(theme === "dark" ? Math.max(...lum) : Math.min(...lum));
    }
  });

  it("in the light theme rainbow's own glass is darker than the firmed binding, so its marks are measured on it", () => {
    expect(relativeLuminance(glassOf("rainbow"))).toBeLessThan(relativeLuminance(hexToRgb01(INK_BINDING_HEX.light)));
    const nodes = manifestById("platform-access").nodes;
    for (const [kind, { mark }] of storyInk(nodes, "light", "rainbow")) {
      expect(contrastRatio(hexToRgb01(mark), glassOf("rainbow")), kind).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("the helpers the plan names", () => {
  it("atContrast steps toward the panel-contrasting end and reaches the contrast on the binding surface", () => {
    for (const theme of THEMES) {
      const bg = hexToRgb01(INK_BINDING_HEX[theme]);
      for (const c of [3, 4.5, 7]) {
        const hex = atContrast("#4da3ff", theme, c);
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
        expect(contrastRatio(hexToRgb01(hex), bg), `${theme} ${c}`).toBeGreaterThanOrEqual(c);
        const lighter = relativeLuminance(hexToRgb01(hex)) > relativeLuminance(bg);
        expect(lighter, `${theme} ${c}`).toBe(theme === "dark");
      }
    }
  });

  it("inkDistance: the contrast ratio in monochrome, one distance for protanopia and deuteranopia, OKLab otherwise", () => {
    const a = "#4da3ff";
    const b = "#f5a623";
    expect(inkDistance(a, b, "monochrome")).toBeCloseTo(contrastRatio(hexToRgb01(a), hexToRgb01(b)), 10);
    expect(inkDistance(a, b, "protanopia")).toBe(inkDistance(a, b, "deuteranopia"));
    expect(inkDistance(a, b, "neon")).toBe(inkDistance(a, b, "rainbow"));
    expect(inkDistance(a, b, "neon")).toBe(inkDistance(a, b, "tritanopia"));
    expect(inkDistance(a, a, "neon")).toBe(0);
    expect(inkDistance(a, b, "deuteranopia")).toBeLessThanOrEqual(inkDistance(a, b, "neon") + 1e-9);
  });

  it("storyInk of one manifest array is one answer: the same array gives the same map", () => {
    const nodes = manifestById("platform-access").nodes;
    expect(storyInk(nodes, "dark", "neon")).toBe(storyInk(nodes, "dark", "neon"));
    expect(storyInk(nodes, "dark", "neon")).not.toBe(storyInk(nodes, "light", "neon"));
    expect(storyInk([...nodes], "dark", "neon")).not.toBe(storyInk(nodes, "dark", "neon"));
  });
});

// 1.8 The source scan: the resolver and its hook hold no wall clock, no random source, no browser
// store and no HTML sink. The twelve patterns are those of the paths piece's scan, built from parts so
// that this file holds none of the words; that file is read by nobody here. A scan that finds nothing in
// clean files is green from its first run, so each pattern is also shown to bite on a sample.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const w = (...parts: string[]) => parts.join("");
const PATTERNS: [string, RegExp][] = [
  [w("Date", ".now"), new RegExp(`\\b${w("Date")}\\s*\\.\\s*${w("now")}\\b`)],
  [w("new ", "Date"), new RegExp(`\\b${w("new")}\\s+${w("Da", "te")}\\b`)],
  [w("performance", ".now"), new RegExp(`\\b${w("performance")}\\s*\\.\\s*${w("now")}\\b`)],
  [w("Math", ".random"), new RegExp(`\\b${w("Math")}\\s*\\.\\s*${w("random")}\\b`)],
  [w("crypto", ".random"), new RegExp(`\\b${w("crypto")}\\s*\\.\\s*${w("random")}`)],
  [w("local", "Storage"), new RegExp(`\\b${w("local", "Storage")}\\b`)],
  [w("session", "Storage"), new RegExp(`\\b${w("session", "Storage")}\\b`)],
  [w("indexed", "DB"), new RegExp(`\\b${w("indexed", "DB")}\\b`, "i")],
  [w("inner", "HTML"), new RegExp(`\\b${w("inner", "HTML")}\\b`)],
  [w("outer", "HTML"), new RegExp(`\\b${w("outer", "HTML")}\\b`)],
  [w("insertAdjacent", "HTML"), new RegExp(`\\b${w("insertAdjacent", "HTML")}\\b`)],
  [w("dangerously", "SetInnerHTML"), new RegExp(`\\b${w("dangerously", "SetInnerHTML")}\\b`)],
];
const found = (text: string): string[] => PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);

describe("1.8 the resolver and its hook hold no clock, no random source, no browser store and no HTML sink", () => {
  it("neither source file holds a forbidden word, comments included", () => {
    for (const file of ["theme/kind-ink.ts", "store/kind-ink.ts"]) {
      const text = readFileSync(join(SRC, file), "utf8");
      expect(text.length, file).toBeGreaterThan(200);
      expect(found(text), file).toEqual([]);
    }
  });

  it("each pattern bites: a sample built from parts is found, and clean text is not", () => {
    const samples: Record<string, string> = {
      [w("Date", ".now")]: w("const t = Da", "te.no", "w();"),
      [w("new ", "Date")]: w("const d = new", " Da", "te();"),
      [w("performance", ".now")]: w("performance", ".no", "w()"),
      [w("Math", ".random")]: w("Ma", "th.ran", "dom()"),
      [w("crypto", ".random")]: w("crypto.", "randomUU", "ID()"),
      [w("local", "Storage")]: w("window.local", "Stor", "age.getItem(k)"),
      [w("session", "Storage")]: w("session", "Stor", "age.setItem(k, v)"),
      [w("indexed", "DB")]: w("window.indexed", "DB.open(n)"),
      [w("inner", "HTML")]: w("el.inner", "HT", "ML = s"),
      [w("outer", "HTML")]: w("el.outer", "HT", "ML = s"),
      [w("insertAdjacent", "HTML")]: w("el.insertAdjacent", "HT", "ML(p, s)"),
      [w("dangerously", "SetInnerHTML")]: w("{ dangerously", "SetInner", "HTML: x }"),
    };
    expect(Object.keys(samples).sort()).toEqual(PATTERNS.map(([name]) => name).sort());
    for (const [name, text] of Object.entries(samples)) expect(found(text), name).toContain(name);
    for (const clean of ["const stamp = playhead;", "const updated = nodes.map(f);", "element.textContent = s;", "store.getState().nodes"]) {
      expect(found(clean), clean).toEqual([]);
    }
  });
});
