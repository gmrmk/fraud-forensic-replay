/**
 * The scan of the investigator's paths (B29): no source of the piece reads a wall clock or a random
 * source, uses browser storage or sets HTML. It covers every non-test source under components/paths and
 * lib/tooltip-words/paths.ts, whatever is there when it runs, so a later group is covered as it lands.
 * The words are built from parts so that this file holds none of them. A scan that finds nothing in clean
 * files is green from its first run, so each pattern is also shown to bite on a sample built from parts.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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

/** Every non-test source file under a path (a file or a folder); none when it does not exist. */
function sources(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => sources(join(path, name)));
}
const rel = (f: string) => f.slice(SRC.length + 1).replaceAll("\\", "/");

/** The names of the patterns a text holds. */
const found = (text: string): string[] => PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);

const ROOTS = ["components/paths", "lib/tooltip-words/paths.ts"];
const files = ROOTS.flatMap((p) => sources(join(SRC, p)));

describe("the paths sources hold no clock, no random source, no browser store and no HTML sink", () => {
  it("scans the files of group G1 and every other source under the roots", () => {
    const names = files.map(rel);
    for (const must of ["components/paths/path-session.ts", "components/paths/path-lookup.ts", "lib/tooltip-words/paths.ts"]) {
      expect(names, must).toContain(must);
    }
  });

  it("no scanned file holds a forbidden word, comments included", () => {
    const hits = files.flatMap((f) => found(readFileSync(f, "utf8")).map((name) => `${rel(f)}: ${name}`));
    expect(hits).toEqual([]);
  });

  it("each pattern bites: a sample built from parts is found, and its neighbour is not", () => {
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
    for (const clean of ["const stamp = playhead;", "const updated = nodes.map(f);", "element.textContent = s;", "store.getState().paths"]) {
      expect(found(clean), clean).toEqual([]);
    }
  });
});
