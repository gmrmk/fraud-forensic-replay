/**
 * The investigator's marks keep out of HTML sinks, code runners and browser stores, and read no clock
 * but the playhead: the notes scan's words, plus the three ways to read a wall clock. Comments are
 * scanned too, so a header that names what the file does not do must not spell a word. Words are built
 * from parts so that this file does not hold them.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const w = (...parts: string[]) => parts.join("");

const WORDS: [string, RegExp][] = [
  [w("inner", "HTML"), new RegExp(`\\b${w("inner", "HTML")}\\b`)],
  [w("dangerously", "SetInnerHTML"), new RegExp(`\\b${w("dangerously", "SetInnerHTML")}\\b`)],
  [w("insertAdjacent", "HTML"), new RegExp(`\\b${w("insertAdjacent", "HTML")}\\b`)],
  [w("outer", "HTML"), new RegExp(`\\b${w("outer", "HTML")}\\b`)],
  [w("set", "HTML"), new RegExp(`\\.${w("set", "HTML")}\\s*\\(`)],
  [w("document", ".write"), new RegExp(`\\b${w("document")}\\s*\\.\\s*${w("write")}\\b`)],
  [w("ev", "al("), new RegExp(`\\b${w("ev", "al")}\\s*\\(`)],
  [w("new Fun", "ction"), new RegExp(`\\b${w("new")}\\s+${w("Fun", "ction")}\\b`)],
  [w("local", "Storage"), new RegExp(`\\b${w("local", "Storage")}\\b`)],
  [w("session", "Storage"), new RegExp(`\\b${w("session", "Storage")}\\b`)],
  [w("indexed", "DB"), new RegExp(`\\b${w("indexed", "DB")}\\b`, "i")],
  [w("html", ":"), new RegExp(`\\b${w("get", "Tooltip")}\\b`)],
  // The playhead is the only clock.
  [w("Date", ".now"), new RegExp(`\\b${w("Date")}\\s*\\.\\s*${w("now")}\\b`)],
  [w("new Da", "te("), new RegExp(`\\b${w("new")}\\s+${w("Da", "te")}\\s*\\(`)],
  [w("performance", ".now"), new RegExp(`\\b${w("performance")}\\s*\\.\\s*${w("now")}\\b`)],
];

function sources(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => sources(join(path, name)));
}
const rel = (f: string) => f.slice(SRC.length + 1).replaceAll("\\", "/");

const ROOTS = ["components/marks", "lib/tooltip-words/marks.ts"];
const files = ROOTS.flatMap((p) => sources(join(SRC, p)));

describe("forbidden words in the investigator's marks", () => {
  it("scans the plate, the two layers' marks, the views, the geometry, the pile model and the words", () => {
    const names = files.map(rel);
    for (const must of [
      "components/marks/MarkPlate.tsx",
      "components/marks/GlobeMarks.tsx",
      "components/marks/TimelineMark.tsx",
      "components/marks/mark-views.ts",
      "components/marks/geometry.ts",
      "components/marks/mark-piles.ts",
      "components/marks/useMarkViews.ts",
      "lib/tooltip-words/marks.ts",
    ]) {
      expect(names, must).toContain(must);
    }
  });

  it.each(WORDS.map(([name, re]) => [name, re] as const))("no file holds %s", (name, re) => {
    const hits = files.filter((f) => re.test(readFileSync(f, "utf8"))).map(rel);
    expect(hits, `${name} found in ${hits.join(", ")}`).toEqual([]);
  });
});
