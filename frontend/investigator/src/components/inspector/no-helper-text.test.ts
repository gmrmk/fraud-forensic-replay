// The guard for the rule that the Inspector carries no helper text, and nothing
// replaces it. Every datum is a row of its own; nothing is printed as a small line under another value,
// and InspectorField no longer has a `secondary` prop at all. This
// test stays as the second guard: it reads the source of every non-test file in this folder and fails
// when a `secondary` is given a fixed sentence (should the prop ever come back), or when any file imports
// the old captions module.
//
// SHORTCUT (its limit): the scan reads the text of the prop's expression. A fixed sentence held in a
// const of the same file under a lower case name, or built by a function call, is not seen; an
// all-capitals name is taken for a constant and refused. The tests of each panel (FraudInspector,
// AuthInspector, PlaceInspector) look at the rendered lines as well.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codeOf } from "../../lib/code-text";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The index just after the quote that closes the string or template starting at `i`. */
function skipString(s: string, i: number): number {
  const quote = s[i];
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === "\\") {
      j += 2;
    } else if (quote === "`" && c === "$" && s[j + 1] === "{") {
      j = skipGroup(s, j + 1);
    } else if (c === quote) {
      return j + 1;
    } else {
      j++;
    }
  }
  return s.length;
}

/** The index just after the closer of the bracket opening at `i`, strings skipped. */
function skipGroup(s: string, i: number): number {
  let depth = 0;
  let j = i;
  while (j < s.length) {
    const c = s[j];
    if (c === '"' || c === "'" || c === "`") {
      j = skipString(s, j);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return j + 1;
    }
    j++;
  }
  return s.length;
}

/** What in a `secondary` expression is a fixed sentence: a plain string (not one a comparison tests), a
 *  template with no substitution, an all-capitals constant, or JSX text. Call arguments and index
 *  brackets are not read: they hold a format ("en-US"), not a line. */
export function fixedPieces(expr: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    const prev = expr.slice(0, i).trimEnd().slice(-1);
    if (c === '"' || c === "'") {
      const end = skipString(expr, i);
      if (!/(===|!==|==|!=)\s*$/.test(expr.slice(0, i))) out.push(expr.slice(i, end));
      i = end;
    } else if (c === "`") {
      const end = skipString(expr, i);
      const template = expr.slice(i, end);
      if (!template.includes("${")) out.push(template);
      i = end;
    } else if ((c === "(" || c === "[") && /[\w)\]]/.test(prev)) {
      i = skipGroup(expr, i);
    } else if (/[A-Za-z_$]/.test(c) && !/[\w$.]/.test(expr[i - 1] ?? "")) {
      let j = i;
      while (j < expr.length && /[\w$]/.test(expr[j])) j++;
      const name = expr.slice(i, j);
      if (/^[A-Z][A-Z0-9_]{2,}$/.test(name) && expr[j] !== ".") out.push(name);
      i = j;
    } else {
      i++;
    }
  }
  if (expr.trim().startsWith("<") && /<[^<>]*>[^<>{}]*[A-Za-z][^<>{}]*</.test(expr)) out.push("JSX text");
  return out;
}

/** Every fixed sentence given to a `secondary` prop in a source. */
export function fixedSecondaries(source: string): string[] {
  const code = codeOf(source);
  const out: string[] = [];
  for (const m of code.matchAll(/\bsecondary=(?!=)/g)) {
    const at = m.index + m[0].length;
    const c = code[at];
    if (c === '"' || c === "'") out.push(code.slice(at, skipString(code, at)));
    else if (c === "{") out.push(...fixedPieces(code.slice(at + 1, skipGroup(code, at) - 1)));
  }
  return out;
}

/** The file names in this folder that carry code: no test, no story. */
const SOURCES = readdirSync(HERE).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));

describe("the fixed-sentence detector", () => {
  it("refuses every shape the helper lines had", () => {
    for (const src of [
      '<InspectorField label="a" value="b" secondary="Running" />',
      '<InspectorField label="a" value="b" secondary={"not in txn DB"} />',
      '<InspectorField secondary={tx.auth_source === "stip" ? DEFINITION : "issuer-authorized"} />',
      '<InspectorField secondary={tx.pos_entry_mode === "chip_fallback_swipe" ? LINE : ""} />',
      "<InspectorField secondary={`rule line`} />",
      "<InspectorField secondary={SPEED_LINE} />",
      "<InspectorField secondary={<span>a gloss</span>} />",
    ]) {
      expect(fixedSecondaries(src), src).not.toEqual([]);
    }
  });

  it("lets a record's own detail through", () => {
    for (const src of [
      "<InspectorField secondary={`${a.country} . ${new Date(a.at).toLocaleString(\"en-US\", { hour12: true })}`} />",
      "<InspectorField secondary={`${tx.merchant_country}`} />",
      "<InspectorField secondary={tx.version ? `scorecard ${tx.version}` : undefined} />",
      "<InspectorField secondary={tx.name.replace(/_/g, \" \")} />",
      "<InspectorField secondary={secondary} />",
    ]) {
      expect(fixedSecondaries(src), src).toEqual([]);
    }
  });

  it("reads past a comment that holds a sentence", () => {
    expect(fixedSecondaries('// secondary="Running"\n/* secondary="x" */')).toEqual([]);
  });
});

describe("the Inspector prints no fixed line under a value", () => {
  it("scans the folder's source files", () => {
    expect(SOURCES.length).toBeGreaterThan(8);
    expect(SOURCES).toContain("FraudInspector.tsx");
    expect(SOURCES).toContain("AuthInspector.tsx");
    expect(SOURCES).toContain("PlaceInspector.tsx");
  });

  for (const file of SOURCES) {
    it(`${file}: no secondary prop is given a fixed sentence, and nothing imports the captions module`, () => {
      const source = readFileSync(resolve(HERE, file), "utf8");
      expect(fixedSecondaries(source), `${file} gives a secondary a fixed sentence`).toEqual([]);
      expect(codeOf(source), `${file} imports the captions module`).not.toMatch(/(from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*\/captions["']/);
    });
  }
});
