/**
 * A scan of the Layers menu's pure files: the words of its switches and the Yours row's counts. They may read no clock of their own
 * (the playhead is the one clock) and keep nothing in the browser's stores (SQLite is the system of
 * record; the browser keeps interface preferences only, and these words keep none). The words are built
 * from parts, so this file does not hold them. The scan fails when a named file is missing, so a move or
 * a rename cannot leave it scanning nothing. The Yours row's pure file (its counts) is in the list too.
 *
 * SHORTCUT (its limit): a plain text search of each file, comments included. A clock reached through an
 * alias (a destructured function, a wrapper in another file) is not seen.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const w = (...parts: string[]) => parts.join("");

const FILES = ["lib/tooltip-words/layers.ts", "lib/yours-counts.ts"];

const WORDS: [string, RegExp][] = [
  [w("Date", ".now"), new RegExp(`\\b${w("Date")}\\s*\\.\\s*${w("now")}\\b`)],
  [w("new ", "Date("), new RegExp(`\\b${w("new")}\\s+${w("Date")}\\s*\\(`)],
  [w("performance", ".now"), new RegExp(`\\b${w("performance")}\\s*\\.\\s*${w("now")}\\b`)],
  [w("local", "Storage"), new RegExp(`\\b${w("local", "Storage")}\\b`)],
  [w("session", "Storage"), new RegExp(`\\b${w("session", "Storage")}\\b`)],
  [w("indexed", "DB"), new RegExp(`\\b${w("indexed", "DB")}\\b`, "i")],
];

describe("the Layers menu's pure files read no clock and keep nothing in the browser", () => {
  it("finds every named file, so the scan cannot pass on nothing", () => {
    for (const f of FILES) expect(existsSync(join(SRC, f)), `${f} is missing`).toBe(true);
  });

  it.each(WORDS.map(([name, re]) => [name, re] as const))("no file holds %s", (name, re) => {
    for (const f of FILES) {
      const path = join(SRC, f);
      // A missing file is a failure of its own, not a pass.
      expect(existsSync(path), `${f} is missing`).toBe(true);
      expect(re.test(readFileSync(path, "utf8")), `${name} found in ${f}`).toBe(false);
    }
  });
});
