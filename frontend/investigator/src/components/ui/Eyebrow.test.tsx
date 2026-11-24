import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Eyebrow } from "./Eyebrow";

describe("Eyebrow", () => {
  it("renders its children", () => {
    render(<Eyebrow>Decisions</Eyebrow>);
    expect(screen.getByText("Decisions")).toBeInTheDocument();
  });

  it("renders a span by default", () => {
    const { container } = render(<Eyebrow>Label</Eyebrow>);
    expect((container.firstElementChild as HTMLElement).tagName).toBe("SPAN");
  });

  it("is uppercase and tracked", () => {
    const { container } = render(<Eyebrow>Label</Eyebrow>);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("uppercase");
    expect(cls).toContain("tracking-widest");
  });

  it("supports the 'as' polymorphism (div / h3 / h4)", () => {
    const { container: div } = render(<Eyebrow as="div">L</Eyebrow>);
    expect((div.firstElementChild as HTMLElement).tagName).toBe("DIV");
    const { container: h3 } = render(<Eyebrow as="h3">L</Eyebrow>);
    expect((h3.firstElementChild as HTMLElement).tagName).toBe("H3");
    const { container: h4 } = render(<Eyebrow as="h4">L</Eyebrow>);
    expect((h4.firstElementChild as HTMLElement).tagName).toBe("H4");
  });

  it("applies the default muted tone color", () => {
    const { container } = render(<Eyebrow>L</Eyebrow>);
    expect((container.firstElementChild as HTMLElement).style.color).toBe("var(--text-muted)");
  });

  it("maps each tone to its exact theme var (muted / dim / accent)", () => {
    const { container: muted } = render(<Eyebrow tone="muted">L</Eyebrow>);
    const { container: dim } = render(<Eyebrow tone="dim">L</Eyebrow>);
    const { container: accent } = render(<Eyebrow tone="accent">L</Eyebrow>);
    expect((muted.firstElementChild as HTMLElement).style.color).toBe("var(--text-muted)");
    expect((dim.firstElementChild as HTMLElement).style.color).toBe("var(--text-faint)");
    expect((accent.firstElementChild as HTMLElement).style.color).toBe("var(--r1)");
  });

  it("maps the text tone to the full text var", () => {
    const { container } = render(<Eyebrow tone="text">L</Eyebrow>);
    expect((container.firstElementChild as HTMLElement).style.color).toBe("var(--text)");
  });

  it("renders the xs size by default and sm when asked (different font-size class)", () => {
    const { container: xs } = render(<Eyebrow size="xs">L</Eyebrow>);
    const { container: sm } = render(<Eyebrow size="sm">L</Eyebrow>);
    const clsXs = (xs.firstElementChild as HTMLElement).className;
    const clsSm = (sm.firstElementChild as HTMLElement).className;
    expect(clsXs).not.toBe(clsSm);
  });

  it("merges a positioning className", () => {
    const { container } = render(<Eyebrow className="mb-2">L</Eyebrow>);
    expect((container.firstElementChild as HTMLElement).className).toContain("mb-2");
  });
});
