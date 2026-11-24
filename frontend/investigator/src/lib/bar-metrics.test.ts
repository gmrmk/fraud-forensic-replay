// The open bar's numbers live in one module, and one test binds the type sizes of every bar file.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as metrics from "./bar-metrics";
import {
  BAR_FOCUS_RING,
  DEPTH_MAX_LINES,
  GUTTER,
  HEAD_RAIL,
  LINE,
  LIST_FLOOR_ROWS,
  OPEN,
  OWN_LINE,
  ROW,
  OPEN_BAR_SHARE,
} from "./bar-metrics";
import { COLOR_MODES, THEMES } from "../theme/axes";
import type { ColorMode, Theme } from "../theme/axes";
import { compositeOver, contrastRatio } from "../theme/legibility";
import { hexToRgb01 } from "../theme/to-rgb";
import { PALETTES } from "../theme/tokens";
import type { ThemePalette } from "../theme/tokens";

describe("layout numbers", () => {
  it("pins the gutter, the row pitch (call 53: 24 px apart) and the head's pieces", () => {
    expect(GUTTER).toBe(148);
    expect(ROW).toBe(24);
    expect(HEAD_RAIL).toBe(18);
    expect(OPEN).toBe(14);
    expect(LINE).toBe(18);
    expect(OWN_LINE).toBe(30);
  });

  it("holds the list's floor at three rows and a half, which is 84 px", () => {
    expect(LIST_FLOOR_ROWS).toBe(3.5);
    expect(LIST_FLOOR_ROWS * ROW).toBe(84);
  });

  it("shows at most six lines of a depth block", () => {
    expect(DEPTH_MAX_LINES).toBe(6);
  });

  it("holds the open bar's share as the owner's number under its own name", () => {
    expect(OPEN_BAR_SHARE).toBe(0.42);
    // The old placeholder name is gone.
    expect("WORKSHOP_BAR_SHARE" in metrics).toBe(false);
  });

  it("leaves out the four numbers that calls 13 and 15 decide in D13 and D15", () => {
    for (const name of ["SMALL_PLOT_PX", "STRIPE_PX", "MAX_STRIPES", "STACK_NAME_PX"]) {
      expect(name in metrics, name).toBe(false);
    }
  });

  // The rule for how many named rows the list shows: the bar is held to a share of the window's
  // inner height, after a fixed 176 px of other content (top row, day band, track, lane, dates,
  // padding) and the head's rail less the 8 px of margin the top row gives up. Those two are
  // named here, not exported.
  const WORKSHOP_CHROME_PX = 176;
  const WORKSHOP_TOP_ROW_MARGIN_PX = 8;
  function listHeight(innerHeight: number, namedRows: number, restRows: number, pitch: number): number {
    const chrome = WORKSHOP_CHROME_PX + (HEAD_RAIL - WORKSHOP_TOP_ROW_MARGIN_PX);
    const whole = Math.max(
      Math.floor(LIST_FLOOR_ROWS),
      Math.floor((innerHeight * OPEN_BAR_SHARE - chrome - restRows * pitch) / pitch),
    );
    return namedRows > whole ? whole * pitch + Math.round(pitch / 2) : namedRows * pitch;
  }

  it("gives the rows' list 204 px at 900 high, against 187 with the rows 22 px apart", () => {
    // Section 8, What exists today and Open questions: "204 px against 187 by the spike's rule".
    expect(listHeight(900, 30, 0, ROW)).toBe(204);
    expect(listHeight(900, 30, 0, 22)).toBe(187);
  });

  it("shows four whole rows at 720 high where 22 px rows showed five", () => {
    expect(listHeight(720, 30, 0, ROW)).toBe(4 * ROW + 12);
    expect(listHeight(720, 30, 0, 22)).toBe(5 * 22 + 11);
  });

  it("never takes the list under its floor, however many rest rows stand under it", () => {
    expect(listHeight(720, 30, 9, ROW)).toBe(3 * ROW + 12);
    expect(3 * ROW + ROW / 2).toBe(LIST_FLOOR_ROWS * ROW);
  });
});

// The ring: section 11, Accessibility, first Must. Every focus ring on the bar clears 3:1 in the
// twelve cells (six colour modes, two themes) on the surface it sits on, and uses one focus
// token, not the raw --r1-rgb.
describe("BAR_FOCUS_RING", () => {
  function triplet01(t: string): [number, number, number] {
    const [r, g, b] = t.split(/\s+/).map((n) => parseInt(n, 10) / 255);
    return [r, g, b];
  }

  // The surface under the ring: the glass tint at the glass fill over the theme's own ground
  // (dark: #0B0E13, light: the near-white map). This reproduces the review's raw-ring figures to
  // two places (checked below), so it is the surface the review measured on. Limit: a map
  // brighter than the theme's ground, such as white behind the dark theme, is not a view the app
  // draws and is not tested here.
  function glassSurface(p: ThemePalette): [number, number, number] {
    return compositeOver(triplet01(p.material.glassTint), p.material.glassFill, hexToRgb01(p.neutral.bg));
  }

  // The colour a Tailwind ring utility resolves to in a palette: accent is --r1-rgb, signal is
  // --alarm-rgb, text is --text-rgb (tailwind.config.js colours).
  function ringColour(name: string, p: ThemePalette): [number, number, number] {
    switch (name) {
      case "accent":
        return hexToRgb01(p.ramp.r1);
      case "signal":
        return hexToRgb01(p.alarm);
      case "text":
        return hexToRgb01(p.neutral.text);
      default:
        throw new Error(`ring colour "${name}" is not mapped in this test`);
    }
  }

  function ratio(name: string, theme: Theme, mode: ColorMode): number {
    const p = PALETTES[theme][mode];
    return contrastRatio(ringColour(name, p), glassSurface(p));
  }

  const ringName = /focus-visible:ring-([a-z-]+)(?:\s|$)/.exec(BAR_FOCUS_RING ?? "")?.[1] ?? "";

  it("is a focus-visible ring class that takes its colour from one named token", () => {
    expect(BAR_FOCUS_RING).toMatch(/\boutline-none\b/);
    expect(BAR_FOCUS_RING).toMatch(/\bfocus-visible:ring-1\b/);
    expect(ringName).not.toBe("");
    expect(ringName).not.toBe("accent"); // the raw --r1-rgb
  });

  it("reproduces the review's figures for the raw accent ring, so the surface is the one it measured", () => {
    expect(ratio("accent", "light", "neon")).toBeCloseTo(2.6, 1);
    expect(ratio("accent", "dark", "deuteranopia")).toBeCloseTo(1.44, 1);
    expect(ratio("accent", "dark", "protanopia")).toBeCloseTo(1.44, 1);
    expect(ratio("accent", "dark", "tritanopia")).toBeCloseTo(2.46, 1);
  });

  it("fails the raw accent ring in neon light and in deuteranopia dark", () => {
    expect(ratio("accent", "light", "neon")).toBeLessThan(3);
    expect(ratio("accent", "dark", "deuteranopia")).toBeLessThan(3);
  });

  it("clears 3:1 in all twelve cells", () => {
    const cells: string[] = [];
    for (const theme of THEMES) {
      for (const mode of COLOR_MODES) {
        const r = ratio(ringName, theme, mode);
        cells.push(`${theme}/${mode} ${r.toFixed(2)}`);
        expect(r, `${theme}/${mode}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(cells).toHaveLength(12);
  });
});

// The type guard: R-F, no type size is added or enlarged. Every text-[Npx] in a non-test file of
// the bar is one of the sizes the files hold at the tip (grep of 2026-11-17).
describe("type sizes of the bar's files", () => {
  const ALLOWED_PX = [8, 8.5, 9, 10];
  const COMPONENTS = resolve(dirname(fileURLToPath(import.meta.url)), "../components");

  /** Every `text-[Npx]` size in a source string, in order. */
  function textSizes(source: string): number[] {
    return [...source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
  }

  /** The bar's files: non-test .ts and .tsx files under components/timeline and the
   *  components/Timeline*.tsx files. A test file is skipped: TimelineControls.test.tsx holds the
   *  string `text-[12px]` on purpose. */
  function barFiles(): string[] {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(full);
      }
    };
    walk(join(COMPONENTS, "timeline"));
    for (const entry of readdirSync(COMPONENTS)) {
      if (/^Timeline.*\.tsx$/.test(entry) && !/\.test\./.test(entry)) files.push(join(COMPONENTS, entry));
    }
    return files;
  }

  it("finds a size outside the list and ignores the ones inside it", () => {
    expect(textSizes('className="text-[12px] text-[8px]"')).toEqual([12, 8]);
    expect(textSizes("text-[8.5px] text-[9px] text-[10px] text-xs")).toEqual([8.5, 9, 10]);
    expect(textSizes("text-[11px]").filter((n) => !ALLOWED_PX.includes(n))).toEqual([11]);
  });

  it("scans real files and finds sizes in them", () => {
    const files = barFiles();
    expect(files.some((f) => f.endsWith("Timeline.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("TimelineShell.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("TimelineControls.tsx"))).toBe(true);
    expect(files.some((f) => /\.test\./.test(f))).toBe(false);
    const found = files.flatMap((f) => textSizes(readFileSync(f, "utf8")));
    expect(found.length).toBeGreaterThan(0);
  });

  it("holds every text size of the bar's files to 8, 8.5, 9 and 10", () => {
    const offenders: string[] = [];
    for (const file of barFiles()) {
      for (const size of textSizes(readFileSync(file, "utf8"))) {
        if (!ALLOWED_PX.includes(size)) offenders.push(`${file}: text-[${size}px]`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
