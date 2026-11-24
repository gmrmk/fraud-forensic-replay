import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useTheme } from "../store/theme";

// The gear menu's dismissal contract: a press OUTSIDE closes it (even on an element that stops
// its own pointerdown), focus moving to an element outside closes it, and a press or focus INSIDE
// (the gear, the menu's own controls) leaves it open. ThemeSwitcher.test.tsx only ever clicks;
// the pointerdown and blur handlers are exercised here.

beforeEach(() => {
  useTheme.getState().setTheme("dark");
  useTheme.getState().setColor("rainbow");
  localStorage.clear();
});

function openMenu() {
  render(
    <>
      <button type="button" data-testid="elsewhere">
        elsewhere
      </button>
      <ThemeSwitcher />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: /appearance/i }));
  expect(screen.getByRole("dialog", { name: /appearance/i })).toBeTruthy();
}

describe("ThemeSwitcher dismissal by pointer", () => {
  // kills Z1 (the handler closes on any pointerdown, inside or outside); closes G3.
  it("a press on a control inside keeps the menu open; a press outside closes it", () => {
    openMenu();
    const light = screen.getByRole("button", { name: /^light$/i });

    fireEvent.pointerDown(light);
    expect(screen.queryByRole("dialog"), "pointerdown on a control").not.toBeNull();
    fireEvent.click(light);
    expect(light.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("dialog"), "click on a control").not.toBeNull();

    // The outside half proves the event reaches the document handler at all, so the
    // inside half above cannot pass for want of delivery.
    fireEvent.pointerDown(screen.getByTestId("elsewhere"));
    expect(screen.queryByRole("dialog"), "pointerdown outside").toBeNull();
    expect(
      screen.getByRole("button", { name: /appearance/i }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  // kills Z1: the menu's own chrome (the theme group, the select, the gear) is inside the root too.
  it("a press on the menu's own controls and on the gear leaves it open", () => {
    openMenu();
    for (const el of [
      screen.getByRole("button", { name: /^light$/i }),
      screen.getByRole("combobox", { name: /color mode/i }),
      screen.getByRole("button", { name: /appearance/i }),
    ]) {
      fireEvent.pointerDown(el);
      expect(screen.queryByRole("dialog")).not.toBeNull();
    }
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a press on an outside element that stops its own pointerdown still closes it", () => {
    // The map's verdict badges stop their pointerdown, so a bubbling document listener never
    // hears a press on them; the listener is registered in the capture phase.
    render(
      <>
        <button type="button" data-testid="stopper" onPointerDown={(e) => e.stopPropagation()}>
          stopper
        </button>
        <ThemeSwitcher />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: /appearance/i }));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.pointerDown(screen.getByTestId("stopper"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("registers its document pointerdown listener in the capture phase and removes it the same way", () => {
    const added = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    try {
      render(<ThemeSwitcher />);
      const gear = screen.getByRole("button", { name: /appearance/i });
      fireEvent.click(gear);
      const down = added.mock.calls.find((c) => c[0] === "pointerdown");
      expect(down?.[2]).toBe(true);
      fireEvent.click(gear);
      const up = removed.mock.calls.find((c) => c[0] === "pointerdown");
      expect(up?.[2]).toBe(true);
      expect(up?.[1]).toBe(down?.[1]);
    } finally {
      added.mockRestore();
      removed.mockRestore();
    }
  });
});

describe("ThemeSwitcher dismissal by focus", () => {
  const gear = () => screen.getByRole("button", { name: /appearance/i });

  it("focus moving to an outside button closes it", () => {
    openMenu();
    act(() => gear().focus());
    act(() => screen.getByTestId("elsewhere").focus());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gear().getAttribute("aria-expanded")).toBe("false");
  });

  it("focus moving between the gear, the dialog and a control inside keeps it open", () => {
    openMenu();
    act(() => gear().focus());
    act(() => screen.getByRole("dialog").focus());
    expect(screen.queryByRole("dialog")).not.toBeNull();
    act(() => screen.getByRole("button", { name: /^light$/i }).focus());
    expect(screen.queryByRole("dialog")).not.toBeNull();
    act(() => gear().focus());
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("a blur with no related target (the window losing focus) keeps it open", () => {
    openMenu();
    const light = screen.getByRole("button", { name: /^light$/i });
    act(() => light.focus());
    fireEvent.blur(light, { relatedTarget: null });
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("a blur whose related target is outside closes it", () => {
    openMenu();
    const light = screen.getByRole("button", { name: /^light$/i });
    fireEvent.blur(light, { relatedTarget: screen.getByTestId("elsewhere") });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape still closes it and returns focus to the gear", () => {
    openMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(gear());
  });
});
