/**
 * P1's forbidden-word scan covers src/components/notes, and this piece's other new and edited
 * sources are scanned here as well (the safety review, A5): no HTML sink, no code runner, no
 * browser store. Words are built from parts so that this file does not hold them.
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
  // A deck.gl tooltip that returns html.
  [w("html", ":"), new RegExp(`\\b${w("get", "Tooltip")}\\b`)],
];

function sources(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => sources(join(path, name)));
}
const rel = (f: string) => f.slice(SRC.length + 1).replaceAll("\\", "/");

const NEW_ROOTS = ["components/notes", "lib/tooltip-words/notes.ts", "lib/notes/digit-table-data.ts"];
/** Edited files that hold other code too: scanned whole, since none of them needs a word below. */
const EDITED = [
  "store/pivot.ts",
  "components/pivot/PivotWindowsLayer.tsx",
  "components/Timeline.tsx",
  "components/timeline/TimelineShell.tsx",
  "lib/use-timeline-scrub.ts",
];

describe("forbidden words in the notes component sources and the files this piece edits", () => {
  const files = [...NEW_ROOTS, ...EDITED].flatMap((p) => sources(join(SRC, p)));

  it("scans the editor, the window, the renderer, the layers and the edited files", () => {
    const names = files.map(rel);
    for (const must of [
      "components/notes/NoteEditor.tsx",
      "components/notes/NoteWindow.tsx",
      "components/notes/NoteBody.tsx",
      "components/notes/NotesLayer.tsx",
      "components/notes/NoteGlobeLayer.tsx",
      "components/notes/noteInspector.tsx",
      "components/notes/noteInspectorBody.ts",
      "components/notes/editor-input.ts",
      "lib/tooltip-words/notes.ts",
      "store/pivot.ts",
      "components/Timeline.tsx",
    ]) {
      expect(names, must).toContain(must);
    }
  });

  it.each(WORDS.map(([name, re]) => [name, re] as const))("no file holds %s", (name, re) => {
    // The files this piece only edits keep the comments they had (store/pivot.ts says in its header
    // that it uses no browser store), so their comments are left out of the scan; the new files are
    // scanned whole, comments included.
    const edited = new Set(EDITED.map((p) => join(SRC, p)));
    const text = (f: string) => {
      const raw = readFileSync(f, "utf8");
      return edited.has(f) ? raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "") : raw;
    };
    const hits = files.filter((f) => re.test(text(f))).map(rel);
    expect(hits, `${name} found in ${hits.join(", ")}`).toEqual([]);
  });

  it("P1's scan lists components/notes among its roots, so it covers this folder too", () => {
    const p1 = readFileSync(join(SRC, "lib/notes/forbidden-apis.test.ts"), "utf8");
    expect(p1).toContain("components/notes");
  });

  it("the editor's input module has no way to read HTML off the clipboard", () => {
    const input = readFileSync(join(SRC, "components/notes/editor-input.ts"), "utf8");
    // The only data type it may ask a clipboard for is text/plain.
    for (const m of input.matchAll(/getData\(\s*["']([^"']+)["']/g)) expect(m[1]).toBe("text/plain");
    expect(input).not.toMatch(/text\/html/);
  });
});
