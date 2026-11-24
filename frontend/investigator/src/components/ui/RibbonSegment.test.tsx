import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RibbonSegment } from "./RibbonSegment";

describe("RibbonSegment", () => {
  it("renders its label and fires onClick", () => {
    const onClick = vi.fn();
    render(<RibbonSegment onClick={onClick}>Geo-velocity</RibbonSegment>);
    fireEvent.click(screen.getByRole("button", { name: /Geo-velocity/ }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("marks the active segment via aria-pressed", () => {
    render(
      <RibbonSegment onClick={() => {}} active>
        Active rule
      </RibbonSegment>,
    );
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("renders a per-kind accent dot when accentHex is given", () => {
    const { container } = render(<RibbonSegment accentHex="#ff3d2e">Fraud</RibbonSegment>);
    const dot = container.querySelector('span[aria-hidden="true"]');
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).style.backgroundColor).toBeTruthy();
  });

  it("dims when not relevant", () => {
    render(<RibbonSegment dimmed>Irrelevant</RibbonSegment>);
    expect(screen.getByRole("button").className).toContain("opacity-50");
  });

  it("omits the leading divider on the first segment, keeps it otherwise", () => {
    const { rerender } = render(<RibbonSegment first>One</RibbonSegment>);
    expect(screen.getByRole("button").className).not.toContain("border-l");
    rerender(<RibbonSegment>Two</RibbonSegment>);
    expect(screen.getByRole("button").className).toContain("border-l");
  });
});
