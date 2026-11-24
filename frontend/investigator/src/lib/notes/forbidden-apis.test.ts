/**
 * Nothing the notes pieces ship may hold an HTML sink, a code runner or a browser store. The
 * pure model and the store hold no wall clock, timer or network call either. The scan reads
 * every source file (not the test files: they name the words on purpose) under the notes
 * folders as they exist, so later pieces are covered as they land. The words are built from
 * parts so that this file does not hold them.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const w = (...parts: string[]) => parts.join("");
const word = (...parts: string[]): [string, RegExp] => [w(...parts), new RegExp(`\\b${w(...parts)}\\b`)];

/** Every notes folder: the brief's list, plus the review's outer and set HTML sinks. */
const EVERYWHERE: [string, RegExp][] = [
  word("inner", "HTML"),
  word("dangerously", "SetInnerHTML"),
  word("insertAdjacent", "HTML"),
  word("outer", "HTML"),
  [w("set", "HTML"), new RegExp(`\\.${w("set", "HTML")}\\s*\\(`)],
  [w("document", ".write"), new RegExp(`\\b${w("document")}\\s*\\.\\s*${w("write")}\\b`)],
  [w("ev", "al("), new RegExp(`\\b${w("ev", "al")}\\s*\\(`)],
  [w("new Fun", "ction"), new RegExp(`\\b${w("new")}\\s+${w("Fun", "ction")}\\b`)],
  word("local", "Storage"),
  word("session", "Storage"),
  [w("indexed", "DB"), new RegExp(`\\b${w("indexed", "DB")}\\b`, "i")],
];

/**
 * lib/notes and store/notes.ts only: no wall clock, no timer, no network call. The backing and
 * the file piece (lib/notes-io) must call the network, so these do not apply to it.
 */
const PURE_ONLY: [string, RegExp][] = [
  [w("Date", ".now"), new RegExp(`\\b${w("Date")}\\s*\\.\\s*${w("now")}\\b`)],
  [w("new Da", "te"), new RegExp(`\\b${w("new")}\\s+${w("Da", "te")}\\b`)],
  [w("performance", ".now"), new RegExp(`\\b${w("performance")}\\s*\\.\\s*${w("now")}\\b`)],
  word("set", "Timeout"),
  word("set", "Interval"),
  [w("fet", "ch("), new RegExp(`\\b${w("fet", "ch")}\\s*\\(`)],
  word("XMLHttp", "Request"),
];

const PURE_ROOTS = ["lib/notes", "store/notes.ts", "lib/marks", "store/marks.ts"].map((p) => join(SRC, p));
const LATER_ROOTS = ["lib/notes-io", "components/notes", "components/notes-menu", "components/marks"].map((p) => join(SRC, p));

function sources(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => sources(join(path, name)));
}

const pureFiles = PURE_ROOTS.flatMap(sources);
const allFiles = [...pureFiles, ...LATER_ROOTS.flatMap(sources)];
const rel = (f: string) => f.slice(SRC.length + 1).replaceAll("\\", "/");

describe("forbidden APIs in the notes sources", () => {
  it("scans the files of this piece", () => {
    const names = pureFiles.map(rel);
    for (const must of ["lib/notes/guard.ts", "lib/notes/schema.ts", "lib/notes/file.ts", "store/notes.ts"]) {
      expect(names).toContain(must);
    }
  });

  it("scans the files of the investigator's node model (the pure ones, the store and the drawings)", () => {
    const pure = pureFiles.map(rel);
    for (const must of ["types.ts", "words.ts", "schema.ts", "facts.ts", "select.ts", "draw.ts", "move.ts"].map((f) => `lib/marks/${f}`)) {
      expect(pure).toContain(must);
    }
    expect(pure).toContain("store/marks.ts");
    const all = allFiles.map(rel);
    for (const must of ["components/marks/glyph-paths.ts", "components/marks/glyphs.tsx"]) expect(all).toContain(must);
  });

  it.each(EVERYWHERE.map(([name, re]) => [name, re] as const))("no notes source file holds %s", (name, re) => {
    const hits = allFiles.filter((f) => re.test(readFileSync(f, "utf8"))).map(rel);
    expect(hits, `${name} found in ${hits.join(", ")}`).toEqual([]);
  });

  it.each(PURE_ONLY.map(([name, re]) => [name, re] as const))("the pure model and the store hold no %s", (name, re) => {
    const hits = pureFiles.filter((f) => re.test(readFileSync(f, "utf8"))).map(rel);
    expect(hits, `${name} found in ${hits.join(", ")}`).toEqual([]);
  });

  it("the patterns catch a word and spare near words (a self test on text, not on the files)", () => {
    for (const [, re] of [...EVERYWHERE, ...PURE_ONLY]) expect(re.test("plain text")).toBe(false);
    expect(EVERYWHERE[0][1].test("el." + w("inner", "HTML") + " = x")).toBe(true);
    expect(EVERYWHERE[6][1].test(w("ev", "al") + "(code)")).toBe(true);
    expect(EVERYWHERE[6][1].test("retrieval(x)")).toBe(false);
    expect(PURE_ONLY[5][1].test(w("fet", "ch") + "(url)")).toBe(true);
  });
});
