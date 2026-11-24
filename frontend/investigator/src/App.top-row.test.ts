import { describe, it, expect } from "vitest";
import appSource from "./App.tsx?raw";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import bannerSource from "./components/StalenessBanner.tsx?raw";
import inspectorSource from "./components/Inspector.tsx?raw";

// jsdom draws no layout, so the pixels of the top row are proved by the browser probe
// (the TOPROW.md table). These hold the classes and rules that carry them: one zoomed wrapper
// holds the title card and the menu group as grid columns, the Inspector's width is reserved
// from the third column while it is open, and the row clears the restart banner.

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "index.css"), "utf8");

/** The class list of the opening tag that holds a marker. */
function classesOf(source: string, marker: string): string[] {
  const at = source.indexOf(marker);
  expect(at, `${marker} is in the source`).toBeGreaterThan(-1);
  const open = source.lastIndexOf("<", at);
  const tag = source.slice(open, source.indexOf(">", at));
  const m = tag.match(/className="([^"]*)"/);
  expect(m, `${marker} has a className`).not.toBeNull();
  return m![1].split(/\s+/);
}

const rule = (selector: string): string => {
  const at = css.indexOf(selector);
  expect(at, `${selector} is in index.css`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at) + 1);
};

describe("App: the top row", () => {
  const wrapper = classesOf(appSource, "top-row ");

  it("is one zoomed wrapper, placed by the window's gutters, that takes no pointer and makes no stacking context", () => {
    for (const c of ["top-row", "chrome-zoom", "absolute", "left-3", "right-3", "grid", "items-start", "pointer-events-none"]) {
      expect(wrapper, c).toContain(c);
    }
    expect(wrapper.some((c) => /^z-/.test(c))).toBe(false);
  });

  it("holds the title card in column 1 and the menu group in column 2, neither zoomed on its own", () => {
    const title = classesOf(appSource, "col-start-1");
    for (const c of ["col-start-1", "row-start-1", "z-30", "relative", "min-w-0", "max-w-full", "justify-self-start", "pointer-events-auto"]) {
      expect(title, `title card ${c}`).toContain(c);
    }
    expect(title).not.toContain("chrome-zoom");
    const menu = classesOf(appSource, "col-start-2");
    for (const c of ["col-start-2", "row-start-1", "z-40", "relative", "flex", "items-stretch", "pointer-events-auto"]) {
      expect(menu, `menu group ${c}`).toContain(c);
    }
    expect(menu).not.toContain("chrome-zoom");
    expect(menu).not.toContain("items-center");
  });

  it("puts the name line's label in a cell that gives way (min-w-0 truncate)", () => {
    const tag = appSource.match(/<Eyebrow[^>]*>Fraud Forensic Replay/)?.[0] ?? "";
    expect(tag).toMatch(/\bmin-w-0\b/);
    expect(tag).toMatch(/\btruncate\b/);
    // the whole name stays in a tooltip
    expect(appSource).toMatch(/\{\.\.\.tip\(\["Fraud Forensic Replay"\]\)\}/);
  });

  it("tells the row when the Inspector is open, from the selection", () => {
    expect(appSource).toMatch(/import \{ useSelection \} from "\.\/store\/selection";/);
    expect(appSource).toMatch(/useSelection\(\(s\) => s\.selected !== null\)/);
    expect(appSource).toMatch(/data-inspector=\{inspectorOpen \? "open" : undefined\}/);
  });
});

describe("index.css: the top row", () => {
  it("lays out three columns: the title gives way, the menu keeps its own width, the third reserves the Inspector", () => {
    const base = rule(".top-row {");
    expect(base).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(var\(--reserve\),\s*1fr\)/);
    expect(base).toMatch(/--reserve:\s*0px/);
    expect(base).toMatch(/column-gap:\s*0\.75rem/);
    expect(base).toMatch(/top:\s*0\.75rem/);
  });

  it("reserves exactly the Inspector's width while it is open", () => {
    // w-80 is 20rem. The Inspector and the reserve are both in the chrome's own units.
    expect(inspectorSource).toContain("w-80");
    expect(rule('.top-row[data-inspector="open"]')).toMatch(/--reserve:\s*20rem/);
  });

  it("drops the menu group below the restart banner, clear of it and of the Narrative rail, and moves nothing else", () => {
    expect(bannerSource).toContain("stale-banner");
    expect(classesOf(bannerSource, "stale-banner")).toContain("h-8"); // 2rem
    expect(classesOf(appSource, "col-start-2")).toContain("top-row-menu");
    // the row starts at 0.75rem; the group's top is then 0.75 + margin rem, its foot 2.3125rem (its 37px) lower
    const margin = Number(rule(":root:has(.stale-banner) .top-row-menu").match(/margin-top:\s*([\d.]+)rem/)?.[1]);
    expect(0.75 + margin, "the group starts at or below the banner's foot (2rem)").toBeGreaterThanOrEqual(2);
    expect(0.75 + margin + 37 / 16, "and its foot stays above the Narrative rail (5rem)").toBeLessThan(5);
    // the title card stays: a drop would put it over the Narrative rail's header
    expect(css).not.toMatch(/:root:has\(\.stale-banner\)\s+\.top-row\s*\{/);
  });

  it("writes no font size", () => {
    for (const s of [".top-row {", '.top-row[data-inspector="open"]', ":root:has(.stale-banner) .top-row-menu"]) {
      expect(rule(s)).not.toMatch(/font-size/);
    }
  });
});
