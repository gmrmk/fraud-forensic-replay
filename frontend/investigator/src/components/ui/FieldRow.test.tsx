import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldRow } from "./FieldRow";

describe("FieldRow", () => {
  it("renders label and value", () => {
    render(<FieldRow label="Amount" value="$1,200" />);
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("$1,200")).toBeInTheDocument();
  });

  it("renders ReactNode label and value", () => {
    render(<FieldRow label={<em>Geo</em>} value={<b>Tokyo</b>} />);
    expect(screen.getByText("Geo")).toBeInTheDocument();
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
  });

  it("uses the mono face when valueTier='mono'", () => {
    render(<FieldRow label="L" value="42" valueTier="mono" />);
    const valueEl = screen.getByText("42");
    expect(valueEl.style.fontFamily).toBe("var(--mono)");
  });

  it("uses the display face when valueTier='display'", () => {
    render(<FieldRow label="L" value="42" valueTier="display" />);
    const valueEl = screen.getByText("42");
    expect(valueEl.style.fontFamily).toBe("var(--display)");
  });

  it("does not force a font face for the body tier (default)", () => {
    render(<FieldRow label="L" value="body val" />);
    const valueEl = screen.getByText("body val");
    expect(valueEl.style.fontFamily).toBe("");
  });

  it("applies valueTone as the value color", () => {
    render(<FieldRow label="L" value="hot" valueTone="var(--alarm)" />);
    const valueEl = screen.getByText("hot");
    expect(valueEl.style.color).toBe("var(--alarm)");
  });

  it("renders a secondary line when provided", () => {
    render(<FieldRow label="L" value="V" secondary="2 hours ago" />);
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
  });

  it("does not render a secondary line when omitted", () => {
    render(<FieldRow label="L" value="V" />);
    expect(screen.queryByText("2 hours ago")).toBeNull();
  });

  it("uses a between (row) layout by default", () => {
    const { container } = render(<FieldRow label="L" value="V" />);
    const row = container.querySelector('[data-align="between"]');
    expect(row).not.toBeNull();
  });

  it("uses a stacked layout when align='stacked'", () => {
    const { container } = render(<FieldRow label="L" value="V" align="stacked" />);
    const row = container.querySelector('[data-align="stacked"]');
    expect(row).not.toBeNull();
  });
});
