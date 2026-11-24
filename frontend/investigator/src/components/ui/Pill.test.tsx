import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Pill } from "./Pill";

describe("Pill", () => {
  it("renders a non-interactive span by default", () => {
    const { container } = render(<Pill>Tokyo</Pill>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("SPAN");
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
  });

  it("renders a <button> when onClick is provided", () => {
    const onClick = vi.fn();
    render(<Pill onClick={onClick}>Click me</Pill>);
    const btn = screen.getByRole("button", { name: "Click me" });
    expect(btn.tagName).toBe("BUTTON");
  });

  it("fires onClick", () => {
    const onClick = vi.fn();
    render(<Pill onClick={onClick}>Go</Pill>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a <button> when an interactive role is supplied even without onClick", () => {
    render(
      <Pill role="radio" aria-checked={false}>
        1x
      </Pill>,
    );
    const el = screen.getByRole("radio");
    expect(el.tagName).toBe("BUTTON");
  });

  it("stays a non-interactive span for a non-interactive role", () => {
    const { container } = render(<Pill role="listitem">item</Pill>);
    expect((container.firstElementChild as HTMLElement).tagName).toBe("SPAN");
  });

  it("forwards aria-checked for the radiogroup pattern", () => {
    render(
      <Pill role="radio" aria-checked onClick={() => {}}>
        1x
      </Pill>,
    );
    expect(screen.getByRole("radio").getAttribute("aria-checked")).toBe("true");
  });

  it("forwards aria-pressed", () => {
    render(
      <Pill aria-pressed onClick={() => {}}>
        Toggle
      </Pill>,
    );
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("forwards tabIndex (roving tabindex)", () => {
    render(
      <Pill role="radio" tabIndex={-1} onClick={() => {}}>
        4x
      </Pill>,
    );
    expect(screen.getByRole("radio").getAttribute("tabindex")).toBe("-1");
  });

  it("forwards aria-label", () => {
    render(
      <Pill aria-label="Play at 4x forward" onClick={() => {}}>
        4x
      </Pill>,
    );
    expect(screen.getByRole("button", { name: "Play at 4x forward" })).toBeInTheDocument();
  });

  it("reflects the active state via a data attribute on the interactive pill", () => {
    render(
      <Pill active onClick={() => {}}>
        Active
      </Pill>,
    );
    expect(screen.getByRole("button").getAttribute("data-active")).toBe("true");
  });

  it("sets no --panel-accent var without an accent (the tone only colours the text)", () => {
    const { container } = render(<Pill tone="alarm">x</Pill>);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--panel-accent")).toBe("");
  });

  it("sets the --panel-accent var from the accent prop", () => {
    const { container } = render(<Pill accent="#00e5ff">Cyan</Pill>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.getPropertyValue("--panel-accent")).toBe("#00e5ff");
  });

  it("maps each tone to a distinct theme-var color (mode-aware)", () => {
    const { container: neutral } = render(<Pill tone="neutral">n</Pill>);
    const { container: alarm } = render(<Pill tone="alarm">a</Pill>);
    const cN = (neutral.firstElementChild as HTMLElement).style.color;
    const cA = (alarm.firstElementChild as HTMLElement).style.color;
    expect(cN).toContain("var(--");
    expect(cN).not.toBe(cA);
  });

  // A full text-tier tone for primary controls (nav chips).
  // The ramp slots (--r0..--r4) are luminance-stepped for globe-heatmap CVD
  // discriminability, NOT for legible small text on a panel - so nav text must
  // ride --text, the actual text tier, to clear WCAG AA across the color modes.
  it('maps tone="text" to the full text tier (var(--text))', () => {
    const { container } = render(<Pill tone="text">nav</Pill>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.color).toBe("var(--text)");
  });

  it("applies size classes that differ per size", () => {
    const { container: xs } = render(<Pill size="xs">x</Pill>);
    const { container: md } = render(<Pill size="md">m</Pill>);
    expect((xs.firstElementChild as HTMLElement).className).not.toBe(
      (md.firstElementChild as HTMLElement).className,
    );
  });

  it("uses the pill radius (radius-pill / 9999) on the chip", () => {
    const { container } = render(<Pill>round</Pill>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("rounded-pill");
  });

  // The tooltip layer reads `data-tip` and `data-tip-accent`, and a description for assistive
  // technology rides `aria-description`; the pill carries them on its button and nowhere else.
  describe("tooltip attributes on the button", () => {
    it("a pill given none of them carries exactly the attributes it carried before", () => {
      const { container } = render(<Pill onClick={() => {}}>Go</Pill>);
      const el = container.firstElementChild as HTMLElement;
      expect(el.getAttributeNames().sort()).toEqual(["class", "style", "type"]);
      const { container: radio } = render(
        <Pill role="radio" aria-checked={false} tabIndex={-1}>
          1x
        </Pill>,
      );
      expect((radio.firstElementChild as HTMLElement).getAttributeNames().sort()).toEqual([
        "aria-checked",
        "class",
        "role",
        "style",
        "tabindex",
        "type",
      ]);
    });

    it("a pill given them carries each on its button", () => {
      render(
        <Pill onClick={() => {}} data-tip={"Name\nValue"} data-tip-accent="#00e5ff" aria-description="Name. Value">
          Go
        </Pill>,
      );
      const btn = screen.getByRole("button");
      expect(btn.getAttribute("data-tip")).toBe("Name\nValue");
      expect(btn.getAttribute("data-tip-accent")).toBe("#00e5ff");
      expect(btn.getAttribute("aria-description")).toBe("Name. Value");
    });
  });
});
