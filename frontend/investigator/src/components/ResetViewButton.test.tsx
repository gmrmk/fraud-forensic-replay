// frontend/investigator/src/components/ResetViewButton.test.tsx
// The reset button of the top bar: a refresh arrow beside the
// gear that puts the camera back on the opening view of the case. Its jump carries the app's home
// mark, which the bar padding hook reads, and it moves the camera under the camera lock too.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HOME_MOVE } from "../hooks/useBarPadding";
import { resetViewWords } from "../lib/tooltip-words/reset-view";
import source from "./ResetViewButton.tsx?raw";
import { ResetViewButton } from "./ResetViewButton";

const HOME = { lng: -40, lat: 20, zoom: 2 };

type Lock = { __ffrCameraLock?: boolean };
const lock = (): Lock => window as unknown as Lock;

const fakeMap = () => ({ jumpTo: vi.fn() });

beforeEach(() => {
  delete lock().__ffrCameraLock;
});
afterEach(() => {
  delete lock().__ffrCameraLock;
});

describe("ResetViewButton", () => {
  it("is a button named Reset view, in the tab order", () => {
    render(<ResetViewButton map={fakeMap()} home={HOME} />);
    const button = screen.getByRole("button", { name: "Reset view" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("tabindex")).toBeNull();
  });

  it("draws the refresh arrow of the icon set (RotateCw), hidden from the accessibility tree", () => {
    render(<ResetViewButton map={fakeMap()} home={HOME} />);
    const svg = screen.getByRole("button", { name: "Reset view" }).querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("class")).toContain("lucide-rotate-cw");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("is drawn like the gear: the same glass square, 37 px, the same muted colour and focus ring", () => {
    render(<ResetViewButton map={fakeMap()} home={HOME} />);
    const cls = screen.getByRole("button", { name: "Reset view" }).getAttribute("class") ?? "";
    for (const token of [
      "glass",
      "grid",
      "h-[37px]",
      "w-[37px]",
      "place-items-center",
      "rounded-md",
      "outline-none",
      "focus-visible:ring-1",
      "focus-visible:ring-accent",
    ]) {
      expect(cls).toContain(token);
    }
  });

  it("carries the tooltip of the one tooltip layer, written to the Simplified Technical English rules", () => {
    render(<ResetViewButton map={fakeMap()} home={HOME} />);
    const button = screen.getByRole("button", { name: "Reset view" });
    expect(button.getAttribute("data-tip")).toBe(resetViewWords().join("\n"));
  });

  it("a press jumps to the scenario's home with bearing and pitch zero, carrying the home mark", () => {
    const map = fakeMap();
    render(<ResetViewButton map={map} home={HOME} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    // toStrictEqual: an option named with the value undefined would set an axis to not-a-number.
    expect(map.jumpTo.mock.calls[0][0]).toStrictEqual({ center: [-40, 20], zoom: 2, bearing: 0, pitch: 0 });
    expect(map.jumpTo.mock.calls[0][1]).toStrictEqual({ [HOME_MOVE]: true });
  });

  it("a press under the camera lock still jumps home: the lock holds only the app's own opening jump", () => {
    // Every reload opens on an address that names a camera, so the lock is set on every reloaded page.
    lock().__ffrCameraLock = true;
    const map = fakeMap();
    render(<ResetViewButton map={map} home={HOME} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    expect(map.jumpTo.mock.calls[0][0]).toStrictEqual({ center: [-40, 20], zoom: 2, bearing: 0, pitch: 0 });
    expect(map.jumpTo.mock.calls[0][1]).toStrictEqual({ [HOME_MOVE]: true });
  });

  it("is switched off, and stays in its place, while there is no map or no home to go back to", () => {
    const map = fakeMap();
    const { rerender } = render(<ResetViewButton map={null} home={HOME} />);
    const button = screen.getByRole("button", { name: "Reset view" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    rerender(<ResetViewButton map={map} home={null} />);
    expect((screen.getByRole("button", { name: "Reset view" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<ResetViewButton map={map} home={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(map.jumpTo).not.toHaveBeenCalled();
    rerender(<ResetViewButton map={map} home={HOME} />);
    expect((screen.getByRole("button", { name: "Reset view" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("holds no shortcut, no timer and no clock", () => {
    expect(source).not.toMatch(/keydown|keyup|useHotkey|setTimeout|setInterval|Date\.now|performance\.now/);
  });
});
