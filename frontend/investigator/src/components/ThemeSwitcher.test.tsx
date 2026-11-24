import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useTheme } from "../store/theme";
import { COLOR_MODES, THEMES } from "../theme/axes";
import { contrastRatio } from "../theme/legibility";
import { resolvePalette } from "../theme/resolve";
import { hexToRgb01 } from "../theme/to-rgb";

beforeEach(() => {
  // Reset to the canonical defaults between tests so state does not bleed.
  useTheme.getState().setTheme("dark");
  useTheme.getState().setColor("rainbow");
  localStorage.clear();
});

function openFlyout() {
  fireEvent.click(screen.getByRole("button", { name: /appearance/i }));
}

describe("ThemeSwitcher", () => {
  it("renders a gear trigger and keeps the flyout closed at rest", () => {
    render(<ThemeSwitcher />);
    const gear = screen.getByRole("button", { name: /appearance/i });
    expect(gear).toBeTruthy();
    expect(gear.getAttribute("aria-expanded")).toBe("false");
    // The controls live in the popover, which is unmounted until opened - the
    // "stays out of the way" contract.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("combobox", { name: /color mode/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^dark$/i })).toBeNull();
  });

  it("opens the flyout on gear click, revealing theme + color controls", () => {
    render(<ThemeSwitcher />);
    openFlyout();
    expect(
      screen.getByRole("dialog", { name: /appearance/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /appearance/i }).getAttribute(
        "aria-expanded",
      ),
    ).toBe("true");
    expect(screen.getByRole("button", { name: /^dark$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^light$/i })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /color mode/i })).toBeTruthy();
  });

  it("the active theme button has aria-pressed=true, the inactive one false", () => {
    render(<ThemeSwitcher />);
    openFlyout();
    expect(
      screen.getByRole("button", { name: /^dark$/i }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /^light$/i }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("clicking Light switches the store theme to light", () => {
    render(<ThemeSwitcher />);
    openFlyout();
    fireEvent.click(screen.getByRole("button", { name: /^light$/i }));
    expect(useTheme.getState().theme).toBe("light");
  });

  it("changing the select to neon updates the store color", () => {
    render(<ThemeSwitcher />);
    openFlyout();
    fireEvent.change(screen.getByRole("combobox", { name: /color mode/i }), {
      target: { value: "neon" },
    });
    expect(useTheme.getState().color).toBe("neon");
  });

  it("closes the flyout on Escape", () => {
    render(<ThemeSwitcher />);
    openFlyout();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dropped the dev-only material-proof card", () => {
    render(<ThemeSwitcher />);
    openFlyout();
    expect(screen.queryByText(/\$1\.24M/)).toBeNull();
    expect(screen.queryByText(/00:00:00/)).toBeNull();
  });

  it("edges every palette swatch, so a ramp step near the menu's own colour still shows", () => {
    // Measured 2026-11-15 on the opaque menu: light monochrome's lightest step drew at 1.03:1,
    // dark neon's darkest at 1.18:1; with no edge they left gaps in the row.
    render(<ThemeSwitcher />);
    openFlyout();
    const dialog = screen.getByRole("dialog", { name: /appearance/i });
    const swatches = [...dialog.querySelectorAll("span")].filter((s) => s.style.width === "14px");
    expect(swatches).toHaveLength(6);
    for (const s of swatches) {
      expect(s.style.boxShadow).toBe("inset 0 0 0 1px rgb(var(--text-faint-rgb))");
    }
  });

  it("draws the swatch edge in a colour that reaches 3:1 on the menu in every theme and colour mode", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const p = resolvePalette(theme, color);
        const surface = p.material.panelBase.split(/\s+/).map((n) => Number(n) / 255) as [number, number, number];
        const c = contrastRatio(hexToRgb01(p.neutral.textFaint), surface);
        if (c < 3) failures.push(`${theme}.${color} ${c.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("draws the gear as a fixed 37px square, so its root wraps it exactly and the menu meets it", () => {
    render(<ThemeSwitcher />);
    const gear = screen.getByRole("button", { name: /appearance/i });
    // A fixed square, not h-full with aspect-square: the root div (the flex item) would stay
    // narrower than a button that takes its width from its height, and the right-anchored menu
    // would end near the gear's centre.
    expect(gear.classList.contains("h-[37px]")).toBe(true);
    expect(gear.classList.contains("w-[37px]")).toBe(true);
    expect(gear.classList.contains("aspect-square")).toBe(false);
    expect(gear.classList.contains("h-full")).toBe(false);
    expect(gear.classList.contains("h-8")).toBe(false);
    expect(gear.classList.contains("w-8")).toBe(false);
    // The rest of the gear's look stays.
    for (const c of ["glass", "grid", "place-items-center", "rounded-md"]) {
      expect(gear.classList.contains(c), c).toBe(true);
    }
  });

  describe("the menu's surface and size", () => {
    const popover = () => {
      const panel = screen.getByRole("dialog", { name: /appearance/i }).firstElementChild;
      return panel as HTMLElement;
    };
    // The scroller is the Panel's div child (the Panel's first child is its grain span).
    const scroller = () =>
      Array.from(popover().children).find((el) => el.tagName === "DIV") as HTMLElement;

    it("is an opaque instrument surface, with no glass inside the dialog", () => {
      render(<ThemeSwitcher />);
      openFlyout();
      const dialog = screen.getByRole("dialog", { name: /appearance/i });
      expect(popover().classList.contains("instrument")).toBe(true);
      expect(dialog.querySelector(".glass")).toBeNull();
      expect(dialog.closest(".glass")).toBeNull();
    });

    it("is 176px wide", () => {
      render(<ThemeSwitcher />);
      openFlyout();
      expect(popover().classList.contains("w-[176px]")).toBe(true);
      expect(popover().classList.contains("w-[240px]")).toBe(false);
      expect(popover().classList.contains("w-[256px]")).toBe(false);
    });

    it("holds Appearance only: no switch, no Layers heading, no time-zone note or credit", () => {
      render(<ThemeSwitcher />);
      openFlyout();
      const dialog = screen.getByRole("dialog", { name: /appearance/i });
      expect(within(dialog).getByText("Appearance")).toBeTruthy();
      expect(within(dialog).queryByRole("switch")).toBeNull();
      expect(within(dialog).queryByText("Layers")).toBeNull();
      expect(within(dialog).queryByText(/time zones/i)).toBeNull();
      expect(within(dialog).queryByRole("link")).toBeNull();
    });

    it("scrolls in an inner element capped to the space above the bottom stack, never on the Panel", () => {
      render(<ThemeSwitcher />);
      openFlyout();
      const inner = scroller();
      const cap = "max-h-[calc(var(--vh-c)_-_var(--bottom-stack-c)_-_64px)]";
      expect(inner.classList.contains(cap)).toBe(true);
      expect(inner.classList.contains("overflow-y-auto")).toBe(true);
      expect(inner.contains(screen.getByRole("combobox", { name: /color mode/i }))).toBe(true);
      expect(popover().classList.contains(cap)).toBe(false);
      expect(popover().classList.contains("overflow-y-auto")).toBe(false);
      expect(popover().className).not.toMatch(/(^|\s)p-2\.5(\s|$)/);
    });
  });
});
