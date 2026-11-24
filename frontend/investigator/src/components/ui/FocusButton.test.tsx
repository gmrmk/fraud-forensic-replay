import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FocusButton } from "./FocusButton";

describe("FocusButton", () => {
  it("defaults to type='button'", () => {
    render(<FocusButton>Go</FocusButton>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("lets an explicit type override the default", () => {
    render(<FocusButton type="submit">Submit</FocusButton>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("forwards native button attributes (aria-label, disabled)", () => {
    const onClick = vi.fn();
    render(
      <FocusButton onClick={onClick} aria-label="Dismiss" disabled>
        x
      </FocusButton>,
    );
    const btn = screen.getByRole("button", { name: "Dismiss" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    // disabled buttons swallow clicks
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires onClick when enabled", () => {
    const onClick = vi.fn();
    render(<FocusButton onClick={onClick}>Go</FocusButton>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies the variant class (default ghost)", () => {
    render(<FocusButton>Go</FocusButton>);
    expect(screen.getByRole("button").className).toContain("fb-ghost");
  });

  it("applies the chip variant class", () => {
    render(<FocusButton variant="chip">Go</FocusButton>);
    expect(screen.getByRole("button").className).toContain("fb-chip");
  });

  it("applies the icon variant class", () => {
    render(<FocusButton variant="icon">Go</FocusButton>);
    expect(screen.getByRole("button").className).toContain("fb-icon");
  });

  it("merges a caller className (positioning escape hatch)", () => {
    render(<FocusButton className="absolute top-0">Go</FocusButton>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("absolute");
    expect(btn.className).toContain("top-0");
  });
});
