// The guard: in the Inspector a date or a time read from a record is
// a row of its own (a label and the timestamp), never a grey line under another value and never glued
// onto another value. InspectorField no longer has a `secondary` prop (every datum is a row of its own,
// so the type forbids it); this test stays as the second guard. It reads the source of every
// non-test file in this folder and fails when a `secondary` prop holds a date or a time, should one return:
// a call to toLocaleString, toLocaleTimeString or toLocaleDateString, a call to formatTs or
// formatHoustonDateTime, a `new Date(`, or a field named timestamp.
//
// SHORTCUT (its limit): the scan reads the text of the prop's expression. A time built in a const of the
// same file and handed to the prop by its name, or built by a function in another file, is not seen. The
// tests of each panel (FraudInspector, AuthInspector, LoginInspector) look at the rendered lines as well.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codeOf } from "../../lib/code-text";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The index just after the quote that closes the string or template starting at `i`. */
function endOfString(s: string, i: number): number {
  const quote = s[i];
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === "\\") j += 2;
    else if (quote === "`" && s[j] === "$" && s[j + 1] === "{") j = endOfGroup(s, j + 1);
    else if (s[j] === quote) return j + 1;
    else j++;
  }
  return s.length;
}

/** The index just after the bracket that closes the one opening at `i`, strings skipped. */
function endOfGroup(s: string, i: number): number {
  let depth = 0;
  for (let j = i; j < s.length; ) {
    const c = s[j];
    if (c === '"' || c === "'" || c === "`") {
      j = endOfString(s, j);
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

/** The text of every `secondary` prop in a source: the string, or the braces' content. */
export function secondaryProps(source: string): string[] {
  const code = codeOf(source);
  const out: string[] = [];
  for (const m of code.matchAll(/\bsecondary=(?!=)/g)) {
    const at = m.index + m[0].length;
    if (code[at] === '"' || code[at] === "'") out.push(code.slice(at, endOfString(code, at)));
    else if (code[at] === "{") out.push(code.slice(at + 1, endOfGroup(code, at) - 1));
  }
  return out;
}

/** What in a prop's text is a date or a time. */
const TIME_WORDS =
  /\btoLocale(?:Date|Time)?String\b|\bformatTs\b|\bformatHoustonDateTime\b|\bnew\s+Date\s*\(|\.timestamp\b|\btimestamp\b|\bwhen(?:24)?\s*\(/;

export function timesIn(prop: string): string | null {
  return TIME_WORDS.exec(prop)?.[0] ?? null;
}

/** The file names in this folder that carry code: no test, no story. */
const SOURCES = readdirSync(HERE).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));

describe("the date-in-a-secondary detector", () => {
  it("sees every shape a time under a value could take", () => {
    for (const src of [
      "<InspectorField label=\"From\" secondary={`${a.country} . ${new Date(a.timestamp).toLocaleString(\"en-US\", { hour12: true })}`} />",
      '<InspectorField secondary={new Date(t.at).toLocaleTimeString("en-US")} />',
      "<InspectorField secondary={t.at.toLocaleDateString()} />",
      "<InspectorField secondary={formatTs(a.at)} />",
      "<InspectorField secondary={a.timestamp} />",
      "<InspectorField secondary={when(a.at)} />",
      "<InspectorField secondary={<span>{formatHoustonDateTime(a.at)}</span>} />",
    ]) {
      expect(secondaryProps(src).map(timesIn), src).toEqual([expect.any(String)]);
    }
  });

  it("lets a place, a version and a country through", () => {
    for (const src of [
      "<InspectorField secondary={`${tx.merchant_country}`} />",
      "<InspectorField secondary={tx.ml_model_version ? `scorecard ${tx.ml_model_version}` : undefined} />",
      '<InspectorField secondary="x" />',
      "<InspectorField secondary={secondary} />",
    ]) {
      expect(secondaryProps(src).map(timesIn), src).toEqual([null]);
    }
  });

  it("reads past a comment and past a prop that is not a secondary", () => {
    expect(secondaryProps("// secondary={formatTs(a)}\n/* secondary={a.timestamp} */")).toEqual([]);
    expect(secondaryProps("<InspectorField value={formatTs(a.at)} label=\"Posted\" />")).toEqual([]);
  });
});

describe("the Inspector draws no date or time under another value", () => {
  it("scans the folder's source files", () => {
    expect(SOURCES.length).toBeGreaterThan(8);
    expect(SOURCES).toContain("FraudInspector.tsx");
    expect(SOURCES).toContain("AuthInspector.tsx");
  });

  for (const file of SOURCES) {
    it(`${file}: no secondary prop holds a date or a time`, () => {
      const source = readFileSync(resolve(HERE, file), "utf8");
      const found = secondaryProps(source)
        .map(timesIn)
        .filter((w): w is string => w !== null);
      expect(found, `${file} puts a date or a time in a secondary prop (a row of its own instead)`).toEqual([]);
    });
  }
});
