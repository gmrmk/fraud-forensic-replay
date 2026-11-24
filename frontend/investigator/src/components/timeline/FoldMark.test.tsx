// frontend/investigator/src/components/timeline/FoldMark.test.tsx
// The one mark of a fold in the playbar: a filled triangle drawn as a small picture, pointing right
// closed and turned a quarter turn open, so the two states are the same size. These tests read the
// DOM (jsdom draws no layout); the size on screen needs a manual check on the built site. The
// last test scans the timeline's sources, so a fold that goes back to printing a text character
// fails here. Neither triangle character is typed in this file: each is built from its code point.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FoldMark } from "./FoldMark";

const RIGHT = String.fromCodePoint(0x25b8);
const DOWN = String.fromCodePoint(0x25be);
/** The one triangle every fold of the playbar draws, as it stood in the outline mark's box. */
const TRIANGLE_D = "M1.25 3L5 5.5L1.25 8Z";

const mark = (open: boolean, className?: string) => {
  const { container } = render(<FoldMark open={open} className={className} />);
  return container.querySelector<HTMLElement>("[data-fold-mark]")!;
};
const pathOf = (root: HTMLElement) => root.querySelector("svg")!.querySelector("path")!;

describe("FoldMark", () => {
  it("closed: one svg, the closed state named on the root, and no turn", () => {
    const root = mark(false);
    expect(root.getAttribute("data-fold-mark")).toBe("closed");
    expect(root.querySelectorAll("svg")).toHaveLength(1);
    expect(root.querySelectorAll("path")).toHaveLength(1);
    expect(pathOf(root).hasAttribute("transform")).toBe(false);
  });

  it("open: the same path string as closed, with the quarter turn clockwise about the middle of the box", () => {
    const closed = mark(false);
    const open = mark(true);
    expect(open.getAttribute("data-fold-mark")).toBe("open");
    expect(open.querySelectorAll("svg")).toHaveLength(1);
    expect(pathOf(open).getAttribute("d")).toBe(pathOf(closed).getAttribute("d"));
    // The viewBox is 5.8 by 12, so its middle is (2.9, 6).
    expect(pathOf(open).getAttribute("transform")).toBe("rotate(90 2.9 6)");
  });

  it("draws the one triangle, filled with the control's colour and with no stroke, in both states", () => {
    for (const open of [false, true]) {
      const shape = pathOf(mark(open));
      expect(shape.getAttribute("d")).toBe(TRIANGLE_D);
      expect(shape.getAttribute("fill")).toBe("currentColor");
      expect(shape.hasAttribute("stroke")).toBe(false);
    }
  });

  it("keeps every point of the triangle inside the glyph's box", () => {
    const numbers = TRIANGLE_D.match(/[\d.]+/g)!.map(Number);
    for (let i = 0; i < numbers.length; i += 2) {
      expect(numbers[i]).toBeGreaterThanOrEqual(0);
      expect(numbers[i]).toBeLessThanOrEqual(5.8);
      expect(numbers[i + 1]).toBeGreaterThanOrEqual(0);
      expect(numbers[i + 1]).toBeLessThanOrEqual(12);
    }
  });

  it("takes the box of the glyph it replaces: 5.8 by 12 px, laid over the span, and not the outline's attribute", () => {
    for (const open of [false, true]) {
      const root = mark(open);
      const svg = root.querySelector("svg")!;
      expect(svg.getAttribute("width")).toBe("5.8");
      expect(svg.getAttribute("height")).toBe("12");
      expect(svg.getAttribute("viewBox")).toBe("0 0 5.8 12");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.hasAttribute("data-fold-svg")).toBe(false);
      expect(svg.style.position).toBe("absolute");
      expect(svg.style.visibility).toBe("visible");
      expect(root.style.position).toBe("relative");
    }
  });

  it("keeps the right-pointing character in the span, hidden, in both states, so the box does not move", () => {
    for (const open of [false, true]) {
      const root = mark(open);
      expect(root.textContent).toBe(RIGHT);
      expect(root.textContent).not.toContain(DOWN);
      expect(root.style.visibility).toBe("hidden");
      expect(root.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("has the call sites' own classes, or the one the caller passes", () => {
    expect(mark(false).className).toBe("mr-1 shrink-0");
    expect(mark(true).className).toBe("mr-1 shrink-0");
    expect(mark(true, "ml-1").className).toBe("ml-1");
  });

  it("has no motion: no transition and no animation on the span or the picture", () => {
    const root = mark(true);
    const svg = root.querySelector("svg")!;
    for (const el of [root, svg, pathOf(root)]) {
      expect(el.style.transition).toBe("");
      expect(el.style.animation).toBe("");
      expect(el.querySelector("animate, animateTransform")).toBeNull();
    }
  });
});

/** The `.ts` and `.tsx` sources under `components/timeline/`, tests left out. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("the playbar's sources", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)));
  const files = sources(root).map((p) => ({ name: relative(root, p).split("\\").join("/"), text: readFileSync(p, "utf8") }));
  // The one file that holds the right-pointing character, as the hidden glyph under the picture (it
  // builds it from its code point, so it holds no typed one either).
  const MAY_HOLD_RIGHT = ["FoldMark.tsx"];

  it("finds the files it is meant to scan", () => {
    const names = files.map((f) => f.name);
    for (const must of [...MAY_HOLD_RIGHT, "KindLines.tsx", "LaneLines.tsx", "MagnitudeLane.tsx", "LaneSmall.tsx", "head/BarFold.tsx", "rows/RowsSmall.tsx", "rows/TrackHeader.tsx", "rows/TrackRows.tsx", "rows/GroupBy.tsx"]) {
      expect(names).toContain(must);
    }
  });

  it("prints a down-pointing triangle character in no file, and a right-pointing one only in the files allowed (FoldMark.tsx alone)", () => {
    const withDown = files.filter((f) => f.text.includes(DOWN)).map((f) => f.name);
    const withRight = files.filter((f) => f.text.includes(RIGHT)).map((f) => f.name);
    expect(withDown).toEqual([]);
    expect(withRight.filter((n) => !MAY_HOLD_RIGHT.includes(n))).toEqual([]);
  });

  it("draws no outline triangle in any file: no data-fold-svg attribute and no outline constant", () => {
    // Every fold state, the small versions' included, draws FoldMark, so no element carrying the
    // outline's attribute can exist in the playbar in any state.
    const outline = files.filter((f) => f.text.includes("data-fold-svg") || f.text.includes("SMALL_VERSION_MARK")).map((f) => f.name);
    expect(outline).toEqual([]);
  });
});
