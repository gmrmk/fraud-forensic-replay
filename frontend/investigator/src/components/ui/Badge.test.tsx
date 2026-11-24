import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>×3</Badge>);
    expect(screen.getByText("×3")).toBeInTheDocument();
  });

  it("renders a span (non-interactive tag)", () => {
    const { container } = render(<Badge>LIVE</Badge>);
    expect((container.firstElementChild as HTMLElement).tagName).toBe("SPAN");
  });

  it("maps each tone to a distinct theme-var color (mode-aware, not the stale Tailwind palette)", () => {
    const { container: cyan } = render(<Badge tone="cyan">c</Badge>);
    const { container: alarm } = render(<Badge tone="alarm">a</Badge>);
    const { container: muted } = render(<Badge tone="muted">m</Badge>);
    const cCyan = (cyan.firstElementChild as HTMLElement).style.color;
    const cAlarm = (alarm.firstElementChild as HTMLElement).style.color;
    const cMuted = (muted.firstElementChild as HTMLElement).style.color;
    expect(cCyan).toContain("var(--");
    expect(cCyan).not.toBe(cAlarm);
    expect(cCyan).not.toBe(cMuted);
    expect(cAlarm).not.toBe(cMuted);
  });

  it("sets the --panel-accent var from the accent prop", () => {
    const { container } = render(<Badge accent="#ffb347">7</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.getPropertyValue("--panel-accent")).toBe("#ffb347");
  });

  it("does not set --panel-accent when accent is omitted", () => {
    const { container } = render(<Badge>7</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.getPropertyValue("--panel-accent")).toBe("");
  });

  it("defaults to the muted tone", () => {
    const { container: dflt } = render(<Badge>d</Badge>);
    const { container: muted } = render(<Badge tone="muted">m</Badge>);
    expect((dflt.firstElementChild as HTMLElement).style.color).toBe(
      (muted.firstElementChild as HTMLElement).style.color,
    );
  });
});
