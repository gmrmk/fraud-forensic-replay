// frontend/investigator/src/components/MapModeButton.test.tsx
// The button of the top row that flips the map between the globe and the flat map. It reads the
// shape from the store and a press asks the store for the other shape. It is drawn as the reset
// button is, and its tooltip names where a press goes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useMapMode } from "../store/map-mode";
import { mapModeWords } from "../lib/tooltip-words/map-mode";
import source from "./MapModeButton.tsx?raw";
import { MapModeButton } from "./MapModeButton";
import { ResetViewButton } from "./ResetViewButton";
import { TipLayer } from "./ui/Tip";

const realSetShape = useMapMode.getState().setShape;
const layer = (): HTMLElement | null => document.querySelector("[data-tip-layer]");

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* storage refused: the store keeps the shape for the page */
  }
  useMapMode.setState({ shape: "globe", setShape: realSetShape });
});
afterEach(() => {
  useMapMode.setState({ shape: "globe", setShape: realSetShape });
});

describe("MapModeButton", () => {
  it("is a button in the tab order, and is never switched off", () => {
    render(<MapModeButton />);
    const button = screen.getByRole("button", { name: "Flat map" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("tabindex")).toBeNull();
    expect((button as HTMLButtonElement).disabled).toBe(false);
    act(() => useMapMode.setState({ shape: "flat" }));
    expect((screen.getByRole("button", { name: "Globe" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("on the globe: named by its first tooltip line, a map icon, its tooltip, and a press goes flat", () => {
    render(<MapModeButton />);
    const button = screen.getByRole("button", { name: mapModeWords("globe")[0] });
    expect(button.getAttribute("data-tip")).toBe(mapModeWords("globe").join("\n"));
    expect(button.getAttribute("data-map-switch")).toBe("flat");
    const svg = button.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("lucide-map");
    expect(svg?.getAttribute("class")).not.toContain("lucide-globe");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("on the flat map: named by its first tooltip line, a globe icon, its tooltip, and a press goes to the globe", () => {
    useMapMode.setState({ shape: "flat" });
    render(<MapModeButton />);
    const button = screen.getByRole("button", { name: mapModeWords("flat")[0] });
    expect(button.getAttribute("data-tip")).toBe(mapModeWords("flat").join("\n"));
    expect(button.getAttribute("data-map-switch")).toBe("globe");
    const svg = button.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("lucide-globe");
    expect(svg?.getAttribute("class")).not.toContain("lucide-map");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("carries the reset button's class string and colour", () => {
    render(
      <>
        <MapModeButton />
        <ResetViewButton map={null} home={null} />
      </>,
    );
    const button = screen.getByRole("button", { name: "Flat map" });
    const reset = screen.getByRole("button", { name: "Reset view" });
    expect(button.getAttribute("class")).toBe(reset.getAttribute("class"));
    expect(button.style.color).toBe(reset.style.color);
  });

  it("a press calls the store's setter once, with the other shape", () => {
    const setShape = vi.fn();
    useMapMode.setState({ setShape });
    render(<MapModeButton />);
    fireEvent.click(screen.getByRole("button", { name: "Flat map" }));
    expect(setShape).toHaveBeenCalledTimes(1);
    expect(setShape).toHaveBeenCalledWith("flat");
    setShape.mockClear();
    act(() => useMapMode.setState({ shape: "flat" }));
    fireEvent.click(screen.getByRole("button", { name: "Globe" }));
    expect(setShape).toHaveBeenCalledTimes(1);
    expect(setShape).toHaveBeenCalledWith("globe");
  });

  it("keeps the same element, and the focus on it, through a flip", () => {
    render(<MapModeButton />);
    const before = screen.getByRole("button", { name: "Flat map" });
    act(() => before.focus());
    fireEvent.click(before);
    const after = screen.getByRole("button", { name: "Globe" });
    expect(after).toBe(before);
    expect(document.activeElement).toBe(before);
  });

  it("carries no aria-pressed on either shape", () => {
    render(<MapModeButton />);
    expect(screen.getByRole("button", { name: "Flat map" }).getAttribute("aria-pressed")).toBeNull();
    act(() => useMapMode.setState({ shape: "flat" }));
    expect(screen.getByRole("button", { name: "Globe" }).getAttribute("aria-pressed")).toBeNull();
  });

  it("a press from the keyboard shows the tooltip again with its new words", () => {
    render(
      <>
        <TipLayer />
        <MapModeButton />
      </>,
    );
    const button = screen.getByRole("button", { name: "Flat map" });
    act(() => button.focus());
    // A click with detail 0 is the one a key press on a button sends.
    fireEvent.click(button, { detail: 0 });
    expect(layer()?.textContent).toContain(mapModeWords("flat")[1]);
    expect(layer()?.textContent).not.toContain(mapModeWords("globe")[1]);
  });

  it("a press of the pointer does not show the tooltip again", () => {
    render(
      <>
        <TipLayer />
        <MapModeButton />
      </>,
    );
    const button = screen.getByRole("button", { name: "Flat map" });
    fireEvent.pointerDown(button);
    fireEvent.click(button, { detail: 1 });
    expect(screen.getByRole("button", { name: "Globe" })).toBe(button);
    expect(layer()).toBeNull();
  });

  it("holds no shortcut, no timer and no clock", () => {
    expect(source).not.toMatch(/keydown|keyup|useHotkey|setTimeout|setInterval|Date\.now|performance\.now/);
  });
});
