// frontend/investigator/src/components/timeline/ClockSwitch.test.tsx
// The clock's switch on the bar, after the speed (calls 5, 11 and 12). It reads "12h" or "24h",
// names its state and its action, and turns the one value of the clock's form.
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CLOCK_KEY, useClockForm } from "../../store/clock-form";
import source from "./ClockSwitch.tsx?raw";
import { ClockSwitch } from "./ClockSwitch";

beforeEach(() => {
  try {
    localStorage.removeItem(CLOCK_KEY);
  } catch {
    /* storage blocked: the store still holds the form */
  }
  useClockForm.setState({ h24: false });
});

const button = (): HTMLElement => screen.getByRole("button");

describe("ClockSwitch", () => {
  it("opens on the 12 hour form: it reads 12h and offers 24 hour", () => {
    render(<ClockSwitch />);
    expect(button()).toHaveTextContent("12h");
    expect(button()).toHaveAccessibleName("12h. The clock shows the 12 hour form. Press to show the 24 hour form.");
  });

  it("reads 24h and offers 12 hour when the form is 24 hour", () => {
    useClockForm.setState({ h24: true });
    render(<ClockSwitch />);
    expect(button()).toHaveTextContent("24h");
    expect(button()).toHaveAccessibleName("24h. The clock shows the 24 hour form. Press to show the 12 hour form.");
  });

  it("the name begins with exactly the text the button shows (WCAG 2.5.3, label in name)", () => {
    // No folding of case, spaces or words: the name starts with the rendered text as it is.
    for (const h24 of [false, true]) {
      useClockForm.setState({ h24 });
      const { unmount } = render(<ClockSwitch />);
      const visible = button().textContent ?? "";
      const name = button().getAttribute("aria-label") ?? "";
      expect(visible).toMatch(/^(12|24)h$/);
      expect(name.startsWith(visible)).toBe(true);
      expect(name).toBe(visible + ". The clock shows the " + (h24 ? "24" : "12") + " hour form. Press to show the " + (h24 ? "12" : "24") + " hour form.");
      unmount();
    }
  });

  it("a press turns the form: the text, the name and the one shared value", () => {
    render(<ClockSwitch />);
    fireEvent.click(button());
    expect(useClockForm.getState().h24).toBe(true);
    expect(button()).toHaveTextContent("24h");
    expect(button()).toHaveAccessibleName("24h. The clock shows the 24 hour form. Press to show the 12 hour form.");
    fireEvent.click(button());
    expect(useClockForm.getState().h24).toBe(false);
    expect(button()).toHaveTextContent("12h");
  });

  it("a press is saved as the preference, beside the theme", () => {
    render(<ClockSwitch />);
    fireEvent.click(button());
    expect(localStorage.getItem(CLOCK_KEY)).toBe("24");
  });

  it("carries its tooltip on the button and no native title", () => {
    const { container } = render(<ClockSwitch />);
    expect(container.querySelectorAll("[data-tip]")).toHaveLength(1);
    expect(button().getAttribute("data-tip")).toBe(
      "The clock's form\nThe clock shows the 12 hour form. Press to show the 24 hour form.",
    );
    expect(button().getAttribute("aria-description")).toBe(
      "The clock's form. The clock shows the 12 hour form. Press to show the 24 hour form.",
    );
    expect(button().parentElement?.hasAttribute("data-tip")).toBe(false);
    expect(container.querySelector("[title]")).toBeNull();
    fireEvent.click(button());
    expect(button().getAttribute("data-tip")).toBe(
      "The clock's form\nThe clock shows the 24 hour form. Press to show the 12 hour form.",
    );
  });

  it("sits in the speed's shape: the md pill at 28 px", () => {
    render(<ClockSwitch />);
    const cl = button().classList;
    expect(cl.contains("h-7")).toBe(true);
    expect(cl.contains("!tracking-normal")).toBe(true);
    expect(cl.contains("tabular-nums")).toBe(true);
    // The pill rests in the text token, as the speed does.
    expect(button().style.color).toBe("var(--text)");
  });

  it("reads no clock of its own, adds no key handler and sets no type size", () => {
    expect(source).not.toMatch(/Date\.now|setInterval|setTimeout|performance\.now/);
    expect(source).not.toMatch(/onKey|keydown|Escape/);
    expect(source).not.toMatch(/text-\[\d/);
    expect(source).not.toContain("America/Chicago");
  });
});
