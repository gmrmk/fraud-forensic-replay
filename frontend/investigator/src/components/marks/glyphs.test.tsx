/**
 * The shared small drawings: each glyph's markup (hidden from readers, tagged, sized, painted in the
 * text colour only), the 9 and 12 unit forms, the picked upright pin, the disposition glyph's tone and
 * the globe lens's geometry. It checks markup, not looks: the drawings are not rendered here.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BUTTON_GLYPH_PX, DispositionGlyph, GlobeLens, MARK_GLYPH_PX, MARK_INK, MarkGlyph } from "./glyphs";
import type { GlyphName } from "./glyphs";
import { GLYPH_PATHS, P12, P9, STROKE, lensGeometry } from "./glyph-paths";
import { Glyph } from "../notes/NotesLayer";
import { TONE_STYLE } from "../verdict/tone-style";

const NAMES: GlyphName[] = ["check", "cross", "hourglass", "pin", "lens"];
const PAINT = new Set(["none", "currentColor"]);

function svgOf(name: GlyphName, size?: number): SVGSVGElement {
  const { container } = render(<MarkGlyph name={name} size={size} />);
  return container.querySelector("svg") as SVGSVGElement;
}

describe("MarkGlyph", () => {
  it.each(NAMES)("%s renders one svg, hidden from readers, tagged, at the size asked", (name) => {
    const svg = svgOf(name);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("data-glyph")).toBe(name);
    expect(svg.getAttribute("width")).toBe(String(MARK_GLYPH_PX));
    expect(svg.getAttribute("height")).toBe(String(MARK_GLYPH_PX));
    expect(svg.textContent).toBe("");
    const big = svgOf(name, 14);
    expect(big.getAttribute("width")).toBe("14");
    expect(big.getAttribute("height")).toBe("14");
  });

  it.each(NAMES)("%s paints with the text colour only", (name) => {
    for (const size of [9, 12]) {
      const svg = svgOf(name, size);
      for (const el of Array.from(svg.querySelectorAll("*"))) {
        for (const attr of ["fill", "stroke"]) {
          const v = el.getAttribute(attr);
          if (v !== null) expect(PAINT.has(v), `${name} ${attr}=${v}`).toBe(true);
        }
      }
    }
  });

  it("uses the 9 unit box below 12 px and the 12 unit box from 12 px, except the pin", () => {
    for (const name of ["check", "cross", "hourglass", "lens"] as const) {
      expect(svgOf(name, 11).getAttribute("viewBox")).toBe("0 0 9 9");
      expect(svgOf(name, 12).getAttribute("viewBox")).toBe("0 0 12 12");
      expect(svgOf(name, 16).getAttribute("viewBox")).toBe("0 0 12 12");
    }
    for (const size of [9, 12, 16]) expect(svgOf("pin", size).getAttribute("viewBox")).toBe("0 0 9 9");
  });

  it("draws the check and the cross from the paths the notes layer cuts out today", () => {
    const { container } = render(<Glyph decision="pass" size={9} />);
    expect(container.querySelector("path")?.getAttribute("d")).toBe(GLYPH_PATHS.check);
    const cross = render(<Glyph decision="fail" size={9} />);
    expect(cross.container.querySelector("path")?.getAttribute("d")).toBe(GLYPH_PATHS.cross);
    expect(svgOf("check").querySelector("path")?.getAttribute("d")).toBe(GLYPH_PATHS.check);
    expect(svgOf("cross").querySelector("path")?.getAttribute("d")).toBe(GLYPH_PATHS.cross);
    expect(svgOf("check", 12).querySelector("path")?.getAttribute("d")).toBe(P12.check);
    expect(svgOf("cross", 12).querySelector("path")?.getAttribute("d")).toBe(P12.cross);
  });

  it("draws the picked, upright pin at every size, with no needle", () => {
    for (const size of [9, 12]) {
      const paths = Array.from(svgOf("pin", size).querySelectorAll("path"));
      expect(paths.map((p) => p.getAttribute("d"))).toEqual([P9.pinUpright]);
      expect(paths[0].getAttribute("fill")).toBe("currentColor");
    }
    expect(P9.pinUpright).toBe("M3 0h3v1H3zM2 1h5v3H2zM1 4h7v1H1zM4 5h1v4H4z");
    // The leaning drawing is kept for glyph sheet G1 and is not what ships.
    expect(P9.pinLeaning).not.toBe(P9.pinUpright);
    expect(P9.pinNeedle).toBe("M3 6L0.5 8.5");
  });

  it("holds the sizes and the ink the plan fixes", () => {
    expect(MARK_GLYPH_PX).toBe(9);
    expect(BUTTON_GLYPH_PX).toBe(12);
    expect(MARK_INK).toBe("var(--text)");
    expect(STROKE.check9).toBe(1.6);
    expect(STROKE.cross9).toBe(1.6);
    expect(STROKE.globeHandle).toBe(2.5);
  });
});

describe("DispositionGlyph", () => {
  it.each([
    ["pass", "check"],
    ["fail", "cross"],
    ["wait", "hourglass"],
  ] as const)("%s draws the %s in its tone", (d, glyph) => {
    const { container } = render(<DispositionGlyph disposition={d} size={9} />);
    const span = container.querySelector("span") as HTMLSpanElement;
    expect(span.style.color).toBe(TONE_STYLE[d].text);
    expect(span.querySelector("svg")?.getAttribute("data-glyph")).toBe(glyph);
  });

  it("draws the check and the cross at stroke 1.6 (the plate's cure: the check was the thinnest glyph), from the same paths", () => {
    const check = render(<DispositionGlyph disposition="pass" size={9} />).container.querySelector("path") as SVGPathElement;
    expect(check.getAttribute("stroke-width")).toBe("1.6");
    expect(check.getAttribute("d")).toBe(GLYPH_PATHS.check);
    const cross = render(<DispositionGlyph disposition="fail" size={9} />).container.querySelector("path") as SVGPathElement;
    expect(cross.getAttribute("stroke-width")).toBe("1.6");
    expect(cross.getAttribute("d")).toBe(GLYPH_PATHS.cross);
  });
});

describe("GlobeLens and lensGeometry", () => {
  it("is a square svg centred on the ring, with the handle up and left", () => {
    const { container } = render(<GlobeLens ring={14} handle={6} />);
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.getAttribute("width")).toBe("30");
    expect(svg.getAttribute("height")).toBe("30");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    const circle = svg.querySelector("circle") as SVGCircleElement;
    expect(circle.getAttribute("r")).toBe("7");
    expect(circle.getAttribute("cx")).toBe("15");
    expect(circle.getAttribute("cy")).toBe("15");
    const lines = svg.querySelectorAll("line");
    expect(lines).toHaveLength(1);
    const line = lines[0];
    const x2 = Number(line.getAttribute("x2"));
    const y2 = Number(line.getAttribute("y2"));
    expect(x2).toBeLessThan(15);
    expect(y2).toBeLessThan(15);
  });

  it("puts the handle's end 13 from the centre, up and left", () => {
    const g = lensGeometry(14, 6);
    expect(g.box).toBe(30);
    expect(g.c).toBe(15);
    expect(g.r).toBe(7);
    expect(g.to.x).toBeLessThan(g.c);
    expect(g.to.y).toBeLessThan(g.c);
    expect(Math.hypot(g.c - g.to.x, g.c - g.to.y)).toBeCloseTo(13, 9);
    expect(Math.hypot(g.c - g.from.x, g.c - g.from.y)).toBeCloseTo(7, 9);
  });
});
