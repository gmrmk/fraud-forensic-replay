// frontend/investigator/src/theme/colour-var-forms.test.ts
// Guard for one family of silent faults: a CSS custom property used in the wrong colour form.
//
// css-gen.ts emits two kinds of colour variable. A TRIPLET (`--r1-rgb: 0 229 255`) is three
// numbers and is valid only inside a colour function: rgb(var(--r1-rgb)) or
// rgb(var(--r1-rgb) / 0.5). A COLOUR (`--r1-on-panel: #00E5FF`) is a whole colour and is read
// directly: var(--r1-on-panel). Either misuse is invalid at computed-value time, a browser
// drops the declaration, and jsdom and happy-dom do not validate colours, so no render test
// notices (FIX-2026-11-20-timeline-dots-not-painted).
//
// This test runs the generator for all twelve cells, classes every emitted property by its value,
// then reads every non-test .ts, .tsx and .css file under src/ and refuses:
//   (a) rgb( or rgba( around var(--NAME) where NAME is a COLOUR;
//   (b) a TRIPLET var(--NAME) read bare by a colour property (color, background, border and its
//       sides, box-shadow, fill, stroke, outline, in CSS, camelCase style keys or Tailwind
//       arbitrary classes).
// A name written as a template with a fixed ending (--${x}-on-panel) takes the class of that
// ending in the generator. The two functions of lib/entity-palette.ts are known by name:
// kindRgbVar returns a triplet's name and kindOnPanelVar a colour's name.
// Limit: a name held in a variable (var(${name})) cannot be classed and is skipped, except a
// const string in the same file.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PALETTES } from "./tokens";
import { THEMES, COLOR_MODES } from "./axes";
import { paletteToCssBlock } from "./css-gen";

type Cls = "triplet" | "colour" | "other";

const TRIPLET_RE = /^\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?){2}$/;
const COLOUR_RE = /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix|color)\(.*)$/i;

export function classOf(value: string): Cls {
  const v = value.trim();
  if (TRIPLET_RE.test(v)) return "triplet";
  if (COLOUR_RE.test(v)) return "colour";
  return "other";
}

/** Every property the generator emits, with its class in each of the twelve cells. */
function emittedClasses(): Map<string, Set<Cls>> {
  const out = new Map<string, Set<Cls>>();
  for (const theme of THEMES) {
    for (const color of COLOR_MODES) {
      const block = paletteToCssBlock(PALETTES[theme][color]);
      for (const m of block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
        const set = out.get(m[1]) ?? new Set<Cls>();
        set.add(classOf(m[2]));
        out.set(m[1], set);
      }
    }
  }
  return out;
}

/** One class per name; a name that changes class between cells is a hole in the guard. */
function settle(emitted: Map<string, Set<Cls>>): { names: Map<string, Cls>; split: string[] } {
  const names = new Map<string, Cls>();
  const split: string[] = [];
  for (const [name, set] of emitted) {
    if (set.size > 1) split.push(name);
    else names.set(name, [...set][0]);
  }
  return { names, split };
}

/** Aliases in css files (--kind-token: var(--r1-on-panel)) take the class of what they name. */
function addCssAliases(names: Map<string, Cls>, cssTexts: string[]): void {
  const defs: Array<[string, string]> = [];
  for (const text of cssTexts) {
    for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi)) defs.push([m[1], m[2].trim()]);
  }
  for (let pass = 0; pass < 6; pass++) {
    for (const [name, value] of defs) {
      if (names.has(name)) continue;
      const alias = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value);
      const cls: Cls = alias ? (names.get(alias[1]) ?? "other") : classOf(value);
      if (cls !== "other" && !names.has(name)) names.set(name, cls);
    }
  }
}

/** The class of a family of names written `--${x}ENDING`, from the generator's names with that ending. */
function endingClass(ending: string, names: Map<string, Cls>): Cls {
  const seen = new Set<Cls>();
  for (const [name, cls] of names) if (name.endsWith(ending) && name.length > ending.length + 2) seen.add(cls);
  return seen.size === 1 ? [...seen][0] : "other";
}

const KNOWN_FUNCTIONS: Record<string, Cls> = { kindRgbVar: "triplet", kindOnPanelVar: "colour" };

function nameClass(raw: string, names: Map<string, Cls>, consts: Map<string, string>): Cls {
  const name = raw.trim();
  if (/^--[a-z0-9-]+$/i.test(name)) return names.get(name) ?? "other";
  const fn = /^\$\{\s*(\w+)\(.*\)\s*\}$/s.exec(name);
  if (fn && KNOWN_FUNCTIONS[fn[1]]) return KNOWN_FUNCTIONS[fn[1]];
  const ident = /^\$\{\s*(\w+)\s*\}$/.exec(name);
  if (ident && consts.has(ident[1])) return names.get(consts.get(ident[1])!) ?? "other";
  const ending = /^(?:--)?(?:[a-z0-9-]*\$\{[^}]*\})+([a-z0-9-]*)$/i.exec(name);
  if (ending && ending[1]) return endingClass(ending[1], names);
  return "other";
}

const COLOUR_PROPS = new Set(
  [
    "color", "background", "background-color", "border", "border-color", "border-top", "border-right",
    "border-bottom", "border-left", "border-top-color", "border-right-color", "border-bottom-color",
    "border-left-color", "box-shadow", "text-shadow", "fill", "stroke", "outline", "outline-color",
    "caret-color", "text-decoration-color", "background-image", "stop-color", "drop-shadow",
  ],
);
const TW_PREFIX = /(?:^|[\s"'`:])(?:bg|text|border(?:-[trblxy])?|fill|stroke|shadow|ring|outline|from|to|via|decoration|caret|accent)-\[[^\]\s]*$/;

function kebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** True when the var( at `at` is read by a colour property (nearest `key:` before it, or a Tailwind arbitrary class). */
function inColourContext(text: string, at: number): boolean {
  const lead = text.slice(Math.max(0, at - 400), at);
  if (TW_PREFIX.test(lead.slice(lead.lastIndexOf("\n") + 1))) return true;
  const keys = [...lead.matchAll(/(?:^|[\s{;,"'`(])(--)?([A-Za-z][A-Za-z-]*)\s*:(?!:)/g)];
  if (!keys.length) return false;
  const last = keys[keys.length - 1];
  if (last[1]) return false; // a custom property definition: its class is settled by the alias pass
  return COLOUR_PROPS.has(kebab(last[2]));
}

/** Replace comments with spaces so a comment that shows the wrong form is not read, and line numbers hold. */
function blankComments(text: string): string {
  const blank = (s: string): string => s.replace(/[^\n]/g, " ");
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[\s;{},(])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));
}

/** `const NAME = "--some-var"`: the variable names a file holds in constants (LANE_EDGE_VAR is shared across files). */
function constsOf(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(/\bconst\s+(\w+)\s*(?::\s*string)?\s*=\s*["'`](--[a-z0-9-]+)["'`]/gi)) out.set(m[1], m[2]);
  return out;
}

export interface Fault {
  file: string;
  line: number;
  form: "rgb() around a colour" | "triplet read bare";
  text: string;
}

/** Scan one file's text; `names` is the settled class of every name. */
export function scan(file: string, source: string, names: Map<string, Cls>, shared = new Map<string, string>()): Fault[] {
  const text = blankComments(source);
  const consts = new Map(shared);
  for (const [k, v] of constsOf(text)) consts.set(k, v);
  const faults: Fault[] = [];
  for (const m of text.matchAll(/var\(/g)) {
    const start = m.index! + 4;
    let depth = 1;
    let i = start;
    let comma = -1;
    for (; i < text.length && depth > 0; i++) {
      const c = text[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 1 && comma < 0) comma = i;
    }
    if (depth !== 0) continue;
    const raw = text.slice(start, comma < 0 ? i - 1 : comma);
    const cls = nameClass(raw, names, consts);
    if (cls === "other") continue;
    const before = text.slice(0, m.index!);
    const wrapped = /rgba?\(\s*$/.test(before);
    const line = before.split("\n").length;
    const shown = text.slice(m.index!, i).replace(/\s+/g, " ");
    if (wrapped && cls === "colour") faults.push({ file, line, form: "rgb() around a colour", text: shown });
    else if (!wrapped && cls === "triplet" && inColourContext(text, m.index!)) {
      faults.push({ file, line, form: "triplet read bare", text: shown });
    }
  }
  return faults;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const here = dirname(fileURLToPath(import.meta.url));
// COLOUR_GUARD_ROOT points the walk at another copy of src/ (a scratch copy with a fault put back).
const ROOT = process.env.COLOUR_GUARD_ROOT ? resolve(process.env.COLOUR_GUARD_ROOT) : resolve(here, "..");

const emitted = emittedClasses();
const { names, split } = settle(emitted);
const files = walk(ROOT);
addCssAliases(
  names,
  files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(f, "utf8")),
);

describe("the generator's custom properties, by class", () => {
  it("every emitted property has one class in all twelve cells", () => {
    expect(split, `classes change between cells: ${split.join(", ")}`).toEqual([]);
  });

  it("holds both classes, and the families the source relies on", () => {
    const count = (c: Cls): number => [...names.values()].filter((v) => v === c).length;
    expect(count("triplet")).toBeGreaterThan(20);
    expect(count("colour")).toBeGreaterThan(20);
    for (const n of ["--r1-rgb", "--alarm-rgb", "--panel-base", "--glass-tint", "--edge-light"]) expect(names.get(n)).toBe("triplet");
    for (const n of ["--r0", "--r4", "--alarm", "--r1-on-panel", "--r1-on-inspector", "--caption-on-glass", "--text-faint-on-panel"]) {
      expect(names.get(n)).toBe("colour");
    }
    expect(names.get("--kind-token")).toBe("colour"); // an index.css alias of --r1-on-panel
    expect(names.get("--glass-fill")).toBe("other"); // a number is neither class
  });
});

describe("scan() on written examples", () => {
  const f = (src: string): string[] => scan("x.tsx", src, names).map((x) => x.form);
  it("refuses rgb() around a colour, literal, alias, template ending and function", () => {
    expect(f("a { background: rgb(var(--r1-on-panel)); }")).toEqual(["rgb() around a colour"]);
    expect(f("a { color: rgba(var(--r0) / 0.5); }")).toEqual(["rgb() around a colour"]);
    expect(f("a { color: rgb(var(--kind-token)); }")).toEqual(["rgb() around a colour"]);
    expect(f("const a = `rgb(var(--${k}-on-panel))`;")).toEqual(["rgb() around a colour"]);
    expect(f("const a = `rgb(var(--${k}-on-inspector) / 0.4)`;")).toEqual(["rgb() around a colour"]);
    expect(f("const a = `rgb(var(${kindOnPanelVar(kind)}))`;")).toEqual(["rgb() around a colour"]);
    expect(f('const V = "--r2-on-panel"; const a = `rgb(var(${V}))`;')).toEqual(["rgb() around a colour"]);
  });
  it("refuses a triplet read bare by a colour property", () => {
    expect(f("a { color: var(--r1-rgb); }")).toEqual(["triplet read bare"]);
    expect(f("a { box-shadow: 0 0 3px var(--alarm-rgb); }")).toEqual(["triplet read bare"]);
    expect(f("a { border-left: 1px solid var(--panel-base); }")).toEqual(["triplet read bare"]);
    expect(f("const s = { borderColor: `var(--${k}-rgb)` };")).toEqual(["triplet read bare"]);
    expect(f("const s = { background: `var(${kindRgbVar(kind)})` };")).toEqual(["triplet read bare"]);
    expect(f('const c = "bg-[var(--r1-rgb)]";')).toEqual(["triplet read bare"]);
  });
  it("passes the right forms, comments and names it cannot class", () => {
    expect(f("a { background: var(--r1-on-panel); color: var(--kind-token); }")).toEqual([]);
    expect(f("a { background: rgb(var(--r1-rgb) / 0.5); box-shadow: 0 0 4px rgb(var(--alarm-rgb) / 0.9); }")).toEqual([]);
    expect(f("const a = `rgb(var(${kindRgbVar(kind)}) / 0.3)`;")).toEqual([]);
    expect(f("const a = `var(${kindOnPanelVar(kind)})`;")).toEqual([]);
    expect(f("const a = `rgb(var(--${k}-rgb))`;")).toEqual([]);
    expect(f("a { --slot-rgb: var(--r1-rgb); }")).toEqual([]);
    expect(f("// rgb(var(--r1-on-panel)) is the wrong form\nconst a = 1;")).toEqual([]);
    expect(f("const a = `rgb(var(${name}))`;")).toEqual([]);
    expect(f("a { width: calc(var(--vh-c) - 2px); }")).toEqual([]);
  });
});

describe("the source under src/", () => {
  it("reads at least the app's own files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no rgb() around a colour variable and no triplet read as a colour", () => {
    const faults: Fault[] = [];
    const shared = new Map<string, string>();
    for (const file of files) for (const [k, v] of constsOf(readFileSync(file, "utf8"))) shared.set(k, v);
    for (const file of files) {
      faults.push(...scan(relative(ROOT, file).replace(/\\/g, "/"), readFileSync(file, "utf8"), names, shared));
    }
    const report = faults.map((x) => `${x.file}:${x.line}  ${x.form}  ${x.text}`);
    expect(report, `a browser drops these declarations:\n${report.join("\n")}`).toEqual([]);
  });
});
