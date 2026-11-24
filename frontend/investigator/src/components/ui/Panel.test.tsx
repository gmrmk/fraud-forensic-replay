import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel } from "./Panel";

describe("Panel", () => {
  it("defaults to the instrument material on a div", () => {
    const { container } = render(<Panel>body</Panel>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el.className).toContain("instrument");
    expect(el.className).not.toContain("glass");
    expect(el.className).not.toContain("scrim");
  });

  it("emits the glass material class", () => {
    const { container } = render(<Panel material="glass">body</Panel>);
    expect((container.firstElementChild as HTMLElement).className).toContain("glass");
  });

  it("emits the scrim material class", () => {
    const { container } = render(<Panel material="scrim">body</Panel>);
    expect((container.firstElementChild as HTMLElement).className).toContain("scrim");
  });

  it("emits no elevation class for the ambient default", () => {
    const { container } = render(<Panel>body</Panel>);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).not.toContain("elev-raised");
    expect(cls).not.toContain("elev-focal");
  });

  it("emits elev-raised / elev-focal for raised / focal", () => {
    const { container: raised } = render(<Panel elevation="raised">b</Panel>);
    expect((raised.firstElementChild as HTMLElement).className).toContain("elev-raised");
    const { container: focal } = render(<Panel elevation="focal">b</Panel>);
    expect((focal.firstElementChild as HTMLElement).className).toContain("elev-focal");
  });

  it("does NOT emit a border-radius when radius is omitted (inherits material default)", () => {
    const { container } = render(<Panel>body</Panel>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.borderRadius).toBe("");
  });

  it("maps the radius prop to a var(--radius-*) inline style, never a Tailwind rounded class", () => {
    const { container } = render(<Panel radius="sm">body</Panel>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.borderRadius).toBe("var(--radius-sm)");
    expect(el.className).not.toMatch(/\brounded-(sm|md|lg)\b/);
  });

  it("maps radius md and lg to the matching vars", () => {
    const { container: md } = render(<Panel radius="md">b</Panel>);
    expect((md.firstElementChild as HTMLElement).style.borderRadius).toBe("var(--radius-md)");
    const { container: lg } = render(<Panel radius="lg">b</Panel>);
    expect((lg.firstElementChild as HTMLElement).style.borderRadius).toBe("var(--radius-lg)");
  });

  it("sets the --panel-accent custom property from the accent prop", () => {
    const { container } = render(<Panel accent="#ff5ce8">body</Panel>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.getPropertyValue("--panel-accent")).toBe("#ff5ce8");
  });

  it("does not set --panel-accent when accent is omitted", () => {
    const { container } = render(<Panel>body</Panel>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.getPropertyValue("--panel-accent")).toBe("");
  });

  it("supports the 'as' polymorphism (section / aside)", () => {
    const { container: section } = render(<Panel as="section">b</Panel>);
    expect((section.firstElementChild as HTMLElement).tagName).toBe("SECTION");
    const { container: aside } = render(<Panel as="aside">b</Panel>);
    expect((aside.firstElementChild as HTMLElement).tagName).toBe("ASIDE");
  });

  it("forwards role and aria-label", () => {
    render(
      <Panel role="region" aria-label="Inspector">
        body
      </Panel>,
    );
    const el = screen.getByRole("region", { name: "Inspector" });
    expect(el).toBeInTheDocument();
  });

  it("renders a grain child for instrument", () => {
    const { container } = render(<Panel>body</Panel>);
    const grain = container.querySelector(".grain");
    expect(grain).not.toBeNull();
    expect(grain!.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders no grain child for glass", () => {
    const { container } = render(<Panel material="glass">body</Panel>);
    expect(container.querySelector(".grain")).toBeNull();
  });

  // happy-dom does not apply index.css, so the flat-matte glass is pinned by reading the source.
  it("index.css holds the flat glass: one fill, an edge and the ambient elevation, no grain rule", () => {
    const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../index.css");
    const css = readFileSync(cssPath, "utf8");
    const start = css.indexOf(".glass {");
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start, css.indexOf("}", start));
    expect(block).not.toContain("linear-gradient");
    expect(block).not.toContain("inset 0 1px 0");
    expect(block).not.toContain("inset 0 -12px");
    expect(block).toContain("rgb(var(--glass-tint) / var(--glass-fill))");
    expect(block).toContain("inset 0 0 0 1px");
    expect(css).not.toContain(".glass > .grain");
  });

  it("does NOT render a grain child for scrim", () => {
    const { container } = render(<Panel material="scrim">body</Panel>);
    expect(container.querySelector(".grain")).toBeNull();
  });

  it("renders its children", () => {
    render(<Panel>hello world</Panel>);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("merges a positioning className", () => {
    const { container } = render(<Panel className="absolute inset-0">b</Panel>);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("absolute");
    expect(cls).toContain("inset-0");
  });

  it("forwards a data-testid so a surface can BE the Panel without a wrapper div", () => {
    const { container } = render(<Panel data-testid="queue-chrome">b</Panel>);
    expect((container.firstElementChild as HTMLElement).getAttribute("data-testid")).toBe(
      "queue-chrome",
    );
  });

  it("sets no data-testid attribute when the prop is omitted", () => {
    const { container } = render(<Panel>b</Panel>);
    expect((container.firstElementChild as HTMLElement).hasAttribute("data-testid")).toBe(false);
  });

  // ── Phase-1 keystone: accentBorder / accentFill (read the --panel-accent seam) ──
  // These let bespoke surfaces (DecisionConsole's per-decision accent borderTop +
  // tinted outcome box) adopt Panel instead of hand-rolling inline styles.

  it("emits the accent-border-top class for accentBorder='top'", () => {
    const { container } = render(<Panel accent="#abc" accentBorder="top">b</Panel>);
    expect((container.firstElementChild as HTMLElement).className).toContain("accent-border-top");
  });

  it("emits accent-border-left for accentBorder='left'", () => {
    const { container } = render(<Panel accentBorder="left">b</Panel>);
    expect((container.firstElementChild as HTMLElement).className).toContain("accent-border-left");
  });

  it("emits accent-border-all for accentBorder='all'", () => {
    const { container } = render(<Panel accentBorder="all">b</Panel>);
    expect((container.firstElementChild as HTMLElement).className).toContain("accent-border-all");
  });

  it("emits the accent-fill class for accentFill (color-mix recipe lives in index.css)", () => {
    const { container } = render(<Panel accentFill>b</Panel>);
    expect((container.firstElementChild as HTMLElement).className).toContain("accent-fill");
  });

  it("emits NO accent-border/accent-fill class when neither prop is set (existing Panels byte-identical)", () => {
    const { container } = render(<Panel accent="#abc">b</Panel>);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).not.toContain("accent-border");
    expect(cls).not.toContain("accent-fill");
  });
});
