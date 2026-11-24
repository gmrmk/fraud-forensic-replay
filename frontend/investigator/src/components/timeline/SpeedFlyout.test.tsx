/**
 * Tests for SpeedFlyout - collapses the 9-speed SpeedMenu behind a single
 * trigger showing the current speed, to free transport real-estate. The vertical
 * menu (radiogroup + keyboard model) is hosted verbatim inside the popover.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpeedFlyout } from "./SpeedFlyout";
import { usePlayhead } from "../../store/playhead";

beforeEach(() => {
  usePlayhead.setState({
    playhead: 5_000,
    minTime: 0,
    maxTime: 10_000,
    isPlaying: false,
    playbackRate: 1,
    isScrubbing: false,
  });
});

describe("SpeedFlyout", () => {
  it("trigger shows the current speed and is collapsed by default", () => {
    render(<SpeedFlyout />);
    const trigger = screen.getByRole("button", { name: /playback speed/i });
    expect(trigger).toHaveTextContent("1×");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("trigger sits level with the 28 px transport and sets its own tracking", () => {
    render(<SpeedFlyout />);
    const trigger = screen.getByRole("button", { name: /playback speed/i });
    expect(trigger.classList.contains("!tracking-normal")).toBe(true);
    expect(trigger.classList.contains("h-7")).toBe(true);
  });

  it("trigger reflects a non-default speed (Unicode minus + ×)", () => {
    usePlayhead.setState({ playbackRate: -4 });
    render(<SpeedFlyout />);
    expect(
      screen.getByRole("button", { name: /playback speed/i }),
    ).toHaveTextContent("−4×");
  });

  it("clicking the trigger opens the speed flyout", () => {
    render(<SpeedFlyout />);
    fireEvent.click(screen.getByRole("button", { name: /playback speed/i }));
    expect(
      screen.getByRole("radiogroup", { name: /playback speed/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /playback speed/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the menu on an opaque instrument panel, not glass", () => {
    // Rendered 2026-11-15: the menu sits inside the timeline panel's backdrop root, so its glass
    // blur never reached the ticker under it, and the ticker's text showed through its fill.
    render(<SpeedFlyout />);
    fireEvent.click(screen.getByRole("button", { name: /playback speed/i }));
    const group = screen.getByRole("radiogroup");
    expect(group.closest(".instrument")).not.toBeNull();
    expect(group.closest(".glass")).toBeNull();
  });

  it("selecting a speed applies the rate AND closes the flyout", () => {
    render(<SpeedFlyout />);
    fireEvent.click(screen.getByRole("button", { name: /playback speed/i }));
    fireEvent.click(screen.getByRole("radio", { name: /4× forward/i }));
    expect(usePlayhead.getState().playbackRate).toBe(4);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("Escape closes the flyout", () => {
    render(<SpeedFlyout />);
    fireEvent.click(screen.getByRole("button", { name: /playback speed/i }));
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  // The native title is gone: the one tooltip layer says what the readout is. The tooltip sits on
  // the button itself, as the four icon buttons carry theirs, and not while the picker is open.
  it("carries no native title, and its tooltip sits on the button while the picker is shut", () => {
    const { container } = render(<SpeedFlyout />);
    expect(container.querySelector("[title]")).toBeNull();
    const trigger = screen.getByRole("button", { name: /playback speed/i });
    expect(container.querySelectorAll("[data-tip]")).toHaveLength(1);
    expect(trigger.getAttribute("data-tip")?.split("\n")[0]).toBe("Playback speed");
    expect(trigger.getAttribute("aria-description")).toBe(
      "Playback speed. At 1× the whole case plays in 60 seconds.",
    );
    expect(trigger.parentElement?.hasAttribute("data-tip")).toBe(false);
  });

  it("holds no tooltip while the picker is open", () => {
    const { container } = render(<SpeedFlyout />);
    fireEvent.click(screen.getByRole("button", { name: /playback speed/i }));
    expect(container.querySelector("[data-tip]")).toBeNull();
    fireEvent.mouseDown(document.body);
    expect(container.querySelector("[data-tip]")).not.toBeNull();
  });

  it("keeps its accessible name", () => {
    render(<SpeedFlyout />);
    expect(
      screen.getByRole("button", { name: "1×. Playback speed. Press to open the list of speeds." }),
    ).toBeInTheDocument();
  });

  it("an outside click closes the flyout", () => {
    render(<SpeedFlyout />);
    fireEvent.click(screen.getByRole("button", { name: /playback speed/i }));
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });
});
