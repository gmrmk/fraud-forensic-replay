/**
 * The investigator's plate: its parts and their order, the ground that never dims, the pin that stays
 * bright when the contents dim, the inverted open form, and the type size. happy-dom drops a colour
 * holding rgb(var(...) / a), so PLATE is swapped for a plain colour to make the wiring observable (as
 * the capsule's plate test does); a probe says what this DOM reads back for a colour.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MarkPlate } from "./MarkPlate";
import { MARK_INK } from "./glyphs";
import { plateInk } from "./mark-ink";
import type { PileGlyph } from "./mark-piles";
import { useTheme } from "../../store/theme";
import { TONE_STYLE } from "../verdict/tone-style";

vi.mock("../verdict/tone-style", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../verdict/tone-style")>();
  return { ...actual, PLATE: "#102030" };
});

/** What this DOM reads back for a colour assigned to a property. */
function reads(prop: "background" | "color", colour: string): string {
  const probe = document.createElement("span");
  probe.style[prop] = colour;
  return probe.style[prop];
}

type Props = Parameters<typeof MarkPlate>[0];
const FULL: Props = { lens: true, notes: 12, disposition: "pass", pinned: true, dim: false, open: false };

function draw(over: Partial<Props> = {}) {
  const { container } = render(<MarkPlate {...FULL} {...over} />);
  const root = container.querySelector("[data-mark-plate]") as HTMLElement;
  const parts = Array.from(root.querySelectorAll<HTMLElement>("[data-part]"));
  const part = (name: string) => parts.find((p) => p.getAttribute("data-part") === name) as HTMLElement;
  return { root, parts, part, names: parts.map((p) => p.getAttribute("data-part")) };
}

describe("MarkPlate parts", () => {
  it("draws the lens, the count, the disposition glyph and the pin, in that order", () => {
    expect(draw().names).toEqual(["lens", "count", "disposition", "pin"]);
  });

  it("draws the count as its digits in mono 8 px with tabular figures", () => {
    const count = draw().part("count");
    expect(count.textContent).toBe("12");
    expect(count.className).toMatch(/\btext-\[8px\]/);
    expect(count.className).toMatch(/\bfont-mono\b/);
    expect(count.className).toMatch(/\btabular-nums\b/);
  });

  it("draws no part that is absent: no lens, no count at 0, no glyph for none, no pin when unpinned", () => {
    expect(draw({ lens: false }).names).toEqual(["count", "disposition", "pin"]);
    expect(draw({ notes: 0 }).names).toEqual(["lens", "disposition", "pin"]);
    expect(draw({ disposition: "none" }).names).toEqual(["lens", "count", "pin"]);
    expect(draw({ pinned: false }).names).toEqual(["lens", "count", "disposition"]);
    expect(draw({ lens: false, notes: 0, disposition: "none", pinned: true }).names).toEqual(["pin"]);
  });

  it("draws the disposition glyph from the disposition, in its tone", () => {
    for (const [d, glyph] of [["pass", "check"], ["fail", "cross"], ["wait", "hourglass"]] as const) {
      const part = draw({ disposition: d }).part("disposition");
      expect(part.querySelector("svg")?.getAttribute("data-glyph")).toBe(glyph);
      expect((part.querySelector("span") as HTMLElement).style.color).toBe(TONE_STYLE[d].text);
    }
  });

  it("draws the lens and the pin as 9 px glyphs", () => {
    const { part } = draw();
    for (const name of ["lens", "pin"]) {
      const svg = part(name).querySelector("svg") as SVGSVGElement;
      expect(svg.getAttribute("data-glyph")).toBe(name);
      expect(svg.getAttribute("width")).toBe("9");
    }
  });
});

describe("MarkPlate ground", () => {
  it("is PLATE, with 2 px padding and a 2 px gap, and nothing in it is rounded", () => {
    const { root } = draw();
    expect(root.style.background).toBe(reads("background", "#102030"));
    expect(root.style.background).not.toBe("");
    expect(root.style.padding).toBe("2px");
    expect(root.style.gap).toBe("2px");
    for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
      expect(el.style.borderRadius, el.outerHTML).toBe("");
      expect(String(el.getAttribute("class") ?? ""), el.outerHTML).not.toMatch(/\brounded/);
    }
  });
});

describe("MarkPlate dim", () => {
  it("dims lens, count and glyph, each to its own opacity, and leaves the pin at full ink and the ground whole", () => {
    const { root, part } = draw({ dim: true });
    const group = root.querySelector("[data-dim-group]") as HTMLElement;
    // The group itself no longer carries one opacity of 0.45: each part is dimmed to the opacity at
    // which it still reads 3 to 1 or more (mark-ink.ts; the ratios are in MarkPlate.contrast.test.tsx).
    expect(group.style.opacity).toBe("1");
    for (const name of ["lens", "count", "disposition"]) {
      expect(group.contains(part(name)), name).toBe(true);
      const o = Number(part(name).style.opacity);
      expect(o, name).toBeLessThan(1);
      expect(o, name).toBeGreaterThanOrEqual(0.2);
    }
    expect(group.contains(part("pin"))).toBe(false);
    expect(part("pin").style.opacity).toBe("1");
    expect(root.style.opacity === "" || Number(root.style.opacity) === 1).toBe(true);
  });

  it("does not dim when not dim", () => {
    const { root, parts } = draw({ dim: false });
    const group = root.querySelector("[data-dim-group]") as HTMLElement;
    expect(group.style.opacity === "" || Number(group.style.opacity) === 1).toBe(true);
    for (const p of parts) expect(p.style.opacity === "" || Number(p.style.opacity) === 1, String(p.getAttribute("data-part"))).toBe(true);
  });

  it("keeps a pin-only plate whole: no empty group", () => {
    const { root } = draw({ lens: false, notes: 0, disposition: "none", pinned: true, dim: true });
    expect(root.querySelector("[data-dim-group]")).toBeNull();
  });
});

describe("MarkPlate open", () => {
  it("probes: the ground and the rest ink are colours this DOM keeps, so the checks below are not void", () => {
    expect(reads("background", "#102030")).not.toBe("");
    expect(reads("background", "var(--text)")).not.toBe("");
    expect(reads("color", MARK_INK)).not.toBe("");
    // This DOM drops rgb(var(--bg-rgb)) (the open ink), so only "differs from the rest ink" is checked
    // for it below; its value needs a real render to check.
  });

  it("inverts: the ground is the text colour, lens, count and pin take the background colour, the glyph is its tone fitted to that ground", () => {
    const rest = draw();
    const open = draw({ open: true });
    expect(open.root.getAttribute("data-open")).toBe("true");
    expect(rest.root.getAttribute("data-open")).toBe("false");
    expect(open.root.style.background).toBe(reads("background", "var(--text)"));
    expect(open.root.style.background).not.toBe(rest.root.style.background);
    // Rest ink is MARK_INK; open ink is the page background, so it differs from rest on every plain part.
    expect(rest.part("lens").style.color).toBe(reads("color", MARK_INK));
    for (const name of ["lens", "count", "pin"]) expect(open.part(name).style.color, name).not.toBe(rest.part(name).style.color);
    // The glyph is no longer the tone's panel variable (that colour reads 1.19 to 1 on the inverted
    // ground in dark): it is the tone's hue fitted to the ground, a hex. The ratios are in
    // MarkPlate.contrast.test.tsx. The rest plate keeps the variable.
    const glyph = open.part("disposition").querySelector("span") as HTMLElement;
    expect(glyph.style.color).toMatch(/^(#[0-9a-f]{6}|rgb\(\d+, ?\d+, ?\d+\))$/i);
    expect(glyph.style.color).not.toBe(TONE_STYLE.pass.text);
    expect((rest.part("disposition").querySelector("span") as HTMLElement).style.color).toBe(TONE_STYLE.pass.text);
  });
});

// ---- the pile form ----
// The multiplication sign, built from its code point (no source file holds it typed).
const TIMES = String.fromCharCode(0xd7);
const GLYPHS: PileGlyph[] = [
  { disposition: "pass", dim: false },
  { disposition: "fail", dim: false },
  { disposition: "wait", dim: false },
];

function drawPile(over: Partial<Props> = {}, glyphs: PileGlyph[] = GLYPHS, records = 3) {
  const { container } = render(<MarkPlate {...FULL} pile={{ records, glyphs }} {...over} />);
  const root = container.querySelector("[data-mark-plate]") as HTMLElement;
  const parts = Array.from(root.querySelectorAll<HTMLElement>("[data-part]"));
  const part = (name: string) => parts.find((p) => p.getAttribute("data-part") === name) as HTMLElement;
  const glyph = (d: string) =>
    parts.find((p) => p.getAttribute("data-part") === "disposition" && p.getAttribute("data-disposition") === d) as HTMLElement;
  return { root, parts, part, glyph, names: parts.map((p) => p.getAttribute("data-part")) };
}

describe("MarkPlate pile form", () => {
  it("draws the lens, the pile part, one disposition part per glyph in the order given, and the pin", () => {
    const p = drawPile();
    expect(p.names).toEqual(["lens", "pile", "disposition", "disposition", "disposition", "pin"]);
    expect(p.parts.filter((x) => x.getAttribute("data-part") === "disposition").map((x) => x.getAttribute("data-disposition"))).toEqual([
      "pass",
      "fail",
      "wait",
    ]);
    for (const [d, glyph] of [["pass", "check"], ["fail", "cross"], ["wait", "hourglass"]] as const) {
      expect(p.glyph(d).querySelector("svg")?.getAttribute("data-glyph")).toBe(glyph);
    }
  });

  it("leaves out the lens when asked, the pin when unpinned, and a glyph that is not carried", () => {
    expect(drawPile({ lens: false }).names).toEqual(["pile", "disposition", "disposition", "disposition", "pin"]);
    expect(drawPile({ pinned: false }).names).toEqual(["lens", "pile", "disposition", "disposition", "disposition"]);
    expect(drawPile({}, [{ disposition: "wait", dim: false }]).names).toEqual(["lens", "pile", "disposition", "pin"]);
    expect(drawPile({}, []).names).toEqual(["lens", "pile", "pin"]);
  });

  it("the pile part is the multiplication sign then the figure, mono 8 px with tabular figures", () => {
    const part = drawPile({}, GLYPHS, 12).part("pile");
    expect(part.textContent).toBe(`${TIMES}12`);
    expect(part.className).toMatch(/\btext-\[8px\]/);
    expect(part.className).toMatch(/\bfont-mono\b/);
    expect(part.className).toMatch(/\btabular-nums\b/);
  });

  it("holds no count part and no single disposition part, whatever notes and disposition say", () => {
    for (const over of [{ notes: 12, disposition: "pass" as const }, { notes: 0, disposition: "none" as const }, { notes: 5, disposition: "fail" as const }]) {
      const p = drawPile(over);
      expect(p.names, JSON.stringify(over)).not.toContain("count");
      // Every disposition part is one of the pile's own glyphs, and the pile's glyphs are the only ones.
      expect(p.names.filter((n) => n === "disposition")).toHaveLength(3);
      expect(p.parts.every((x) => x.getAttribute("data-part") !== "disposition" || x.getAttribute("data-disposition") !== null)).toBe(true);
    }
    expect(drawPile({ notes: 12 }).root.textContent).toBe(`${TIMES}3`);
  });

  it("holds no text larger than 9 px", () => {
    const { root } = drawPile();
    for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
      for (const m of String(el.getAttribute("class") ?? "").matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)) {
        expect(Number(m[1]), el.outerHTML).toBeLessThanOrEqual(9);
      }
      const inline = /^(\d+(?:\.\d+)?)px$/.exec(el.style.fontSize);
      if (inline) expect(Number(inline[1]), el.outerHTML).toBeLessThanOrEqual(9);
    }
  });

  it("at rest the pile part is drawn in the muted ink; open, in the page background (the open ink)", () => {
    expect(reads("color", "var(--text-muted)")).not.toBe("");
    expect(drawPile().part("pile").style.color).toBe(reads("color", "var(--text-muted)"));
    const open = drawPile({ open: true }).part("pile");
    // This DOM drops rgb(var(--bg-rgb)), so the open ink reads back as that and, above all, not as the rest ink.
    expect(open.style.color).toBe(reads("color", "rgb(var(--bg-rgb))"));
    expect(open.style.color).not.toBe(reads("color", "var(--text-muted)"));
  });

  it("the lens and the pin keep the plain ink at rest, as on a single plate", () => {
    const p = drawPile();
    expect(p.part("lens").style.color).toBe(reads("color", MARK_INK));
    expect(p.part("pin").style.color).toBe(reads("color", MARK_INK));
  });

  it("a dim glyph is below full opacity and a lit glyph is at full opacity on the same plate", () => {
    const p = drawPile({}, [
      { disposition: "pass", dim: true },
      { disposition: "fail", dim: false },
      { disposition: "wait", dim: true },
    ]);
    expect(Number(p.glyph("pass").style.opacity)).toBeLessThan(1);
    expect(Number(p.glyph("wait").style.opacity)).toBeLessThan(1);
    expect(p.glyph("fail").style.opacity === "" || Number(p.glyph("fail").style.opacity) === 1).toBe(true);
    // The pile itself is not dim, so its lens, figure and pin are whole.
    for (const name of ["lens", "pile", "pin"]) {
      expect(p.part(name).style.opacity === "" || Number(p.part(name).style.opacity) === 1, name).toBe(true);
    }
  });

  it("a glyph dims to the opacity the single plate dims that decision to, and a dim pile dims the lens and the figure to their own", () => {
    const { theme, color } = useTheme.getState();
    const p = drawPile({ dim: true }, GLYPHS.map((g) => ({ ...g, dim: true })));
    for (const g of GLYPHS) {
      expect(Number(p.glyph(g.disposition).style.opacity), g.disposition).toBe(plateInk(theme, color, g.disposition, false).decision);
    }
    const ink = plateInk(theme, color, "none", false);
    expect(Number(p.part("lens").style.opacity)).toBe(ink.plain);
    expect(Number(p.part("pile").style.opacity)).toBe(ink.pileCount);
    expect(Number(p.part("lens").style.opacity)).toBeLessThan(1);
    expect(Number(p.part("pile").style.opacity)).toBeLessThan(1);
    expect(p.part("pin").style.opacity).toBe("1");
  });

  it("a dim pile whose glyphs are lit keeps those glyphs whole (a glyph's own flag decides)", () => {
    const p = drawPile({ dim: true });
    for (const g of GLYPHS) {
      expect(p.glyph(g.disposition).style.opacity === "" || Number(p.glyph(g.disposition).style.opacity) === 1, g.disposition).toBe(true);
    }
  });

  it("open: the ground is the text colour, each glyph is its tone fitted to that ground, and the figure and the lens take the open ink", () => {
    const { theme, color } = useTheme.getState();
    const rest = drawPile();
    const p = drawPile({ open: true });
    expect(p.root.getAttribute("data-open")).toBe("true");
    expect(p.root.style.background).toBe(reads("background", "var(--text)"));
    for (const g of GLYPHS) {
      const holder = p.glyph(g.disposition).querySelector("span") as HTMLElement;
      const fitted = plateInk(theme, color, g.disposition, true).glyph as string;
      expect(holder.style.color).toBe(reads("color", fitted));
      expect(holder.style.color).not.toBe(TONE_STYLE[g.disposition].text);
      expect((rest.glyph(g.disposition).querySelector("span") as HTMLElement).style.color).toBe(TONE_STYLE[g.disposition].text);
    }
    for (const name of ["lens", "pile", "pin"]) expect(p.part(name).style.color, name).not.toBe(rest.part(name).style.color);
  });

  it("a dim open pile dims the figure to the open plain opacity and keeps the pin whole", () => {
    const { theme, color } = useTheme.getState();
    const p = drawPile({ dim: true, open: true }, GLYPHS.map((g) => ({ ...g, dim: true })));
    const ink = plateInk(theme, color, "none", true);
    expect(Number(p.part("pile").style.opacity)).toBe(ink.pileCount);
    expect(ink.pileCount).toBe(ink.plain);
    expect(p.part("pin").style.opacity).toBe("1");
  });

  it("carries no border, no outline and no shadow: the plate has no edge line (the owner's rule)", () => {
    for (const over of [{}, { dim: true }, { open: true }]) {
      const { root } = drawPile(over);
      for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
        for (const prop of ["border", "borderWidth", "outline", "outlineWidth", "boxShadow"] as const) {
          expect(el.style[prop], `${prop} on ${el.outerHTML}`).toBe("");
        }
        expect(String(el.getAttribute("class") ?? ""), el.outerHTML).not.toMatch(/\b(border|outline|shadow|ring)\b/);
        expect(String(el.getAttribute("class") ?? ""), el.outerHTML).not.toMatch(/\brounded/);
      }
    }
  });

  it("without pile the plate is as before: the count and the single glyph, no pile part", () => {
    const p = draw();
    expect(p.names).toEqual(["lens", "count", "disposition", "pin"]);
    expect(p.parts.some((x) => x.getAttribute("data-part") === "pile")).toBe(false);
    expect(p.part("disposition").hasAttribute("data-disposition")).toBe(false);
  });
});

describe("MarkPlate type", () => {
  it("holds no text larger than 9 px", () => {
    const { root } = draw();
    for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
      for (const m of String(el.getAttribute("class") ?? "").matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)) {
        expect(Number(m[1]), el.outerHTML).toBeLessThanOrEqual(9);
      }
      const inline = /^(\d+(?:\.\d+)?)px$/.exec(el.style.fontSize);
      if (inline) expect(Number(inline[1]), el.outerHTML).toBeLessThanOrEqual(9);
    }
  });
});
