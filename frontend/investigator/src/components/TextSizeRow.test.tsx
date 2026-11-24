import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TextSizeRow } from "./TextSizeRow";
import { useTextSize } from "../store/text-size";
import { ThemeSwitcher } from "./ThemeSwitcher";

beforeEach(() => {
  useTextSize.getState().setSize(100);
  localStorage.clear();
});

const smaller = (): HTMLElement => screen.getByRole("button", { name: "Smaller text" });
const larger = (): HTMLElement => screen.getByRole("button", { name: "Larger text" });
const figure = (): HTMLElement => document.querySelector("output") as HTMLElement;

describe("the Text size row", () => {
  it("is a group named Text size, with two buttons and the figure between them", () => {
    render(<TextSizeRow />);
    const group = screen.getByRole("group", { name: "Text size" });
    const kids = [...group.querySelectorAll("button, output")].map((e) => e.tagName);
    expect(kids).toEqual(["BUTTON", "OUTPUT", "BUTTON"]);
    expect(group.querySelector("output")?.textContent).toBe("100%");
  });

  it("draws the two letters at two sizes and states no conclusion in text", () => {
    const { container } = render(<TextSizeRow />);
    const letters = [...container.querySelectorAll("svg[data-letter]")];
    expect(letters.map((s) => s.getAttribute("data-letter"))).toEqual(["small", "large"]);
    const h = letters.map((s) => Number(s.getAttribute("height")));
    expect(h[0]).toBeLessThan(h[1]);
    // The glyphs are drawings, not text, so no type size is written for them.
    expect(container.querySelectorAll("svg text")).toHaveLength(0);
    for (const s of container.querySelectorAll("svg")) expect(s.getAttribute("aria-hidden")).toBe("true");
    // The only words are the row's name and the figure.
    expect(container.textContent).toBe("Text size100%");
  });

  it("steps up and down and shows the figure", () => {
    render(<TextSizeRow />);
    fireEvent.click(larger());
    expect(useTextSize.getState().size).toBe(112);
    expect(figure().textContent).toBe("112%");
    fireEvent.click(larger());
    expect(figure().textContent).toBe("125%");
    fireEvent.click(smaller());
    fireEvent.click(smaller());
    fireEvent.click(smaller());
    expect(figure().textContent).toBe("90%");
  });

  it("marks the end of the range aria-disabled, ignores the press, and keeps focus on the button", () => {
    render(<TextSizeRow />);
    smaller().focus();
    fireEvent.click(smaller());
    expect(useTextSize.getState().size).toBe(90);
    expect(smaller().getAttribute("aria-disabled")).toBe("true");
    expect(larger().getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(smaller());
    expect(useTextSize.getState().size).toBe(90);
    expect(document.activeElement).toBe(smaller());
    // Not the native attribute: a native disabled button drops focus and its tooltip.
    expect((smaller() as HTMLButtonElement).disabled).toBe(false);
    useTextSize.getState().setSize(125);
  });

  it("marks the large end the same way", () => {
    useTextSize.getState().setSize(125);
    render(<TextSizeRow />);
    expect(larger().getAttribute("aria-disabled")).toBe("true");
    expect(smaller().getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(larger());
    expect(useTextSize.getState().size).toBe(125);
  });

  it("is reached by Tab in order and pressed by Enter or Space (native buttons)", () => {
    render(<TextSizeRow />);
    const buttons = [...document.querySelectorAll("button")];
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Smaller text", "Larger text"]);
    for (const b of buttons) {
      expect(b.getAttribute("type")).toBe("button");
      expect(b.getAttribute("tabindex")).toBeNull();
    }
  });

  it("carries the sentences as tooltips, and the end's sentence at the end", () => {
    render(<TextSizeRow />);
    expect(smaller().getAttribute("data-tip")).toBe("Smaller text\nPress to make the text smaller. The next size is 90 percent.");
    expect(larger().getAttribute("data-tip")).toBe("Larger text\nPress to make the text larger. The next size is 112 percent.");
    expect(figure().getAttribute("data-tip")).toBe("Text size\nThe text is at 100 percent of the default size.");
    fireEvent.click(smaller());
    expect(smaller().getAttribute("data-tip")).toBe("Smaller text\nThe text is at its smallest size, 90 percent.");
  });
});

describe("the row in the gear menu", () => {
  it("sits in the Appearance dialog", () => {
    render(<ThemeSwitcher />);
    expect(screen.queryByRole("group", { name: "Text size" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /appearance/i }));
    const dialog = screen.getByRole("dialog", { name: /appearance/i });
    expect(dialog.contains(screen.getByRole("group", { name: "Text size" }))).toBe(true);
  });
});
