/**
 * The safety review's change A5: the forbidden-API scan covers the folders this piece adds and
 * the lines it adds to App.tsx and useShareLink.ts. No HTML sink, no code runner, no tooltip
 * that returns HTML. The words are built from parts, so this file does not hold them. The
 * browser-store words apply to the notes folders (the two big files hold other stores of the
 * app's own preferences, which are not notes).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const w = (...parts: string[]) => parts.join("");
const word = (...parts: string[]): [string, RegExp] => [w(...parts), new RegExp(`\\b${w(...parts)}\\b`)];

const SINKS: [string, RegExp][] = [
  word("inner", "HTML"),
  word("dangerously", "SetInnerHTML"),
  word("insertAdjacent", "HTML"),
  word("outer", "HTML"),
  [w("set", "HTML"), new RegExp(`\\.${w("set", "HTML")}\\s*\\(`)],
  [w("document", ".write"), new RegExp(`\\b${w("document")}\\s*\\.\\s*${w("write")}\\b`)],
  [w("ev", "al("), new RegExp(`\\b${w("ev", "al")}\\s*\\(`)],
  [w("new Fun", "ction"), new RegExp(`\\b${w("new")}\\s+${w("Fun", "ction")}\\b`)],
  [w("get", "Tooltip"), new RegExp(`\\b${w("get", "Tooltip")}\\b`)],
];
const STORES: [string, RegExp][] = [
  word("local", "Storage"),
  word("session", "Storage"),
  [w("indexed", "DB"), new RegExp(`\\b${w("indexed", "DB")}\\b`, "i")],
];

function sources(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => sources(join(path, name)));
}
const rel = (f: string) => f.slice(SRC.length + 1).replaceAll("\\", "/");

const FOLDERS = ["lib/notes-io", "components/notes-menu"].flatMap((p) => sources(join(SRC, p)));
const EDITED = ["App.tsx", "hooks/useShareLink.ts"].map((p) => join(SRC, p));

describe("forbidden APIs in this piece's sources", () => {
  it("scans real files", () => {
    expect(FOLDERS.length).toBeGreaterThan(6);
    expect(FOLDERS.map(rel)).toContain("lib/notes-io/apiBacking.ts");
    expect(FOLDERS.map(rel)).toContain("components/notes-menu/NotesMenu.tsx");
  });

  for (const [name, re] of SINKS) {
    it(`no ${name} in the notes-io and notes-menu folders, App.tsx or useShareLink.ts`, () => {
      const hits = [...FOLDERS, ...EDITED].filter((f) => re.test(readFileSync(f, "utf8"))).map(rel);
      expect(hits).toEqual([]);
    });
  }
  for (const [name, re] of STORES) {
    it(`no ${name} in the notes-io and notes-menu folders`, () => {
      const hits = FOLDERS.filter((f) => re.test(readFileSync(f, "utf8"))).map(rel);
      expect(hits).toEqual([]);
    });
  }

  it("the menu draws no HTML from data: no dangerous prop in the menu's source", () => {
    const menu = FOLDERS.filter((f) => rel(f).startsWith("components/notes-menu")).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(menu).not.toMatch(/dangerously/i);
    expect(menu).not.toMatch(/\bstyle=\{\{[^}]*(note|colour)/);
  });
});
