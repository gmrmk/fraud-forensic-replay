/**
 * The digit table reaches the page from inside the app root. digit-table-data.ts is generated from
 * backend/tests/note_digit_table.json (the file the backend guard reads); this test fails when the
 * two differ. It also pins the fault it closes: no notes source file imports a path outside src.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DIGIT_TABLE_DATA } from "./digit-table-data";
import { digitValue, isFormatCp } from "./digits";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../..");
const BACKEND_JSON = resolve(HERE, "../../../../../backend/tests/note_digit_table.json");

describe("digit-table-data.ts and the backend table", () => {
  const file = JSON.parse(readFileSync(BACKEND_JSON, "utf8")) as {
    unicode_version: string;
    digit_zeros: number[];
    format_ranges: number[][];
  };

  it("holds the same Unicode version, digit zeros and format ranges as the backend file", () => {
    expect(DIGIT_TABLE_DATA.unicode_version).toBe(file.unicode_version);
    expect([...DIGIT_TABLE_DATA.digit_zeros]).toEqual(file.digit_zeros);
    expect(DIGIT_TABLE_DATA.format_ranges.map((r) => [...r])).toEqual(file.format_ranges);
  });

  it("the guard's digit lookups answer from that table", () => {
    for (const z of file.digit_zeros) {
      expect(digitValue(z)).toBe(0);
      expect(digitValue(z + 9)).toBe(9);
    }
    expect(digitValue(0x41)).toBe(-1);
    for (const [a, b] of file.format_ranges) {
      expect(isFormatCp(a)).toBe(true);
      expect(isFormatCp(b)).toBe(true);
    }
    expect(isFormatCp(0x61)).toBe(false);
  });
});

function sources(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => sources(join(path, name)));
}

describe("no notes source file reaches outside the app's root", () => {
  const roots = ["lib/notes", "store/notes.ts", "components/notes", "lib/tooltip-words/notes.ts"].map((p) => join(SRC, p));
  const files = roots.flatMap(sources);

  it("scans the notes files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("no import names the backend folder or climbs out of src", () => {
    const bad: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        const spec = m[1];
        if (/backend\//.test(spec)) bad.push(`${f}: ${spec}`);
        else if (spec.startsWith(".")) {
          const target = resolve(dirname(f), spec);
          if (!target.startsWith(SRC)) bad.push(`${f}: ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
