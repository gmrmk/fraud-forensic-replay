/**
 * The record's own window holds no HTML sink, no code runner, no browser store and no clock. The scan
 * reads every non-test source under `components/record-window` and the window's words file. The words
 * of the notes scan (`components/notes/forbidden-scan.test.ts`) apply here, and two clocks are added:
 * the playhead is the only clock. Words are built from parts, so that this file does not hold them.
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
  [w("get", "Tooltip"), new RegExp(`\\b${w("get", "Tooltip")}\\b`)],
  [w("Date", ".now"), new RegExp(`\\b${w("Date")}\\s*\\.\\s*${w("now")}\\b`)],
  [w("performance", ".now"), new RegExp(`\\b${w("performance")}\\s*\\.\\s*${w("now")}\\b`)],
];

function sources(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => sources(join(path, name)));
}
const rel = (f: string) => f.slice(SRC.length + 1).replaceAll("\\", "/");

const ROOTS = ["components/record-window", "lib/tooltip-words/record-window.ts"];

describe("forbidden words in the record window's sources", () => {
  const files = ROOTS.flatMap((p) => sources(join(SRC, p)));

  it("scans the window, its parts, its opener, its helpers and its words", () => {
    const names = files.map(rel);
    for (const must of [
      "components/record-window/RecordWindow.tsx",
      "components/record-window/DispositionButtons.tsx",
      "components/record-window/CategoryList.tsx",
      "components/record-window/RecordNotes.tsx",
      "components/record-window/RecordWindowOpener.tsx",
      "components/record-window/record-window.ts",
      "lib/tooltip-words/record-window.ts",
    ]) {
      expect(names, must).toContain(must);
    }
  });

  it.each(WORDS.map(([name, re]) => [name, re] as const))("no file holds %s", (name, re) => {
    for (const f of files) {
      expect(re.test(readFileSync(f, "utf8")), `${rel(f)} holds ${name}`).toBe(false);
    }
  });
});
