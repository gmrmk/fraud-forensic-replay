import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { StalenessBanner } from "./StalenessBanner";

function stubHealth(bootIds: string[]) {
  let call = 0;
  const fetchMock = vi.fn(() => {
    const boot_id = bootIds[Math.min(call, bootIds.length - 1)];
    call += 1;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "ok", boot_id, scenario: "priya-ato" }),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("StalenessBanner", () => {
  it("renders nothing while the boot_id is unchanged", async () => {
    stubHealth(["boot-1", "boot-1"]);
    const { container } = render(<StalenessBanner reload={vi.fn()} />);
    await act(() => vi.advanceTimersByTimeAsync(65_000)); // baseline + 2 polls
    expect(container.firstChild).toBeNull();
  });

  it("shows the banner when the backend boot_id changes", async () => {
    stubHealth(["boot-1", "boot-2"]);
    render(<StalenessBanner reload={vi.fn()} />);
    await act(() => vi.advanceTimersByTimeAsync(35_000));
    expect(screen.getByText(/SERVER RESTARTED/)).toBeTruthy();
  });

  // The banner adopts the Instrument-B material - an
  // instrument `<Panel>` on the dedicated alarm channel (accent -> --panel-accent
  // = var(--alarm)) instead of a flat `bg-signal` color flood (which dies in
  // monochrome). A redundant non-color cue (the alert glyph) carries the alarm
  // where color can't, per the locked CVD discipline.
  it("renders as an instrument Panel on the alarm channel, not a flat color flood", async () => {
    stubHealth(["boot-1", "boot-2"]);
    render(<StalenessBanner reload={vi.fn()} />);
    await act(() => vi.advanceTimersByTimeAsync(35_000));
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("instrument");
    expect(alert.style.getPropertyValue("--panel-accent")).toBe("var(--alarm)");
    expect(alert.className).not.toContain("bg-signal");
  });

  it("carries a redundant non-color alarm cue (CVD/monochrome safety)", async () => {
    stubHealth(["boot-1", "boot-2"]);
    const { container } = render(<StalenessBanner reload={vi.fn()} />);
    await act(() => vi.advanceTimersByTimeAsync(35_000));
    expect(container.querySelector('[data-alarm-cue]')).not.toBeNull();
  });

  // The top row's menu group drops below the banner (index.css: `.top-row-menu`), so the banner
  // has a fixed height, 2rem, and a class the rule can find. A banner that grew past it
  // would cover the row's buttons again; jsdom draws no layout, so the pixels are checked in a browser.
  it("has the fixed height and the class the top row clears (h-8, stale-banner)", async () => {
    stubHealth(["boot-1", "boot-2"]);
    render(<StalenessBanner reload={vi.fn()} />);
    await act(() => vi.advanceTimersByTimeAsync(35_000));
    const alert = screen.getByRole("alert");
    expect(alert.classList.contains("stale-banner")).toBe(true);
    expect(alert.classList.contains("h-8")).toBe(true);
    expect(alert.classList.contains("py-1.5")).toBe(false); // a fixed height, not one made of padding
  });

  it("reloads on the button", async () => {
    stubHealth(["boot-1", "boot-2"]);
    const reload = vi.fn();
    render(<StalenessBanner reload={reload} />);
    await act(() => vi.advanceTimersByTimeAsync(35_000));
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stays hidden when polling fails (restart detector, not liveness)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const { container } = render(<StalenessBanner reload={vi.fn()} />);
    await act(() => vi.advanceTimersByTimeAsync(65_000));
    expect(container.firstChild).toBeNull();
  });

  // A failed FIRST poll must not blind the detector. If the first poll
  // fails (baseline never set) and the backend restarts before the next
  // successful poll, the restart should still be detected. The fix schedules a
  // 3s retry after a baseline-unset failure so the boot_id is captured before
  // any restart can slip through the 30s polling window.
  it("detects a restart even when the first poll failed (INF-18)", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        call += 1;
        if (call === 1) return Promise.reject(new Error("ECONNREFUSED")); // first poll fails
        if (call === 2)
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ status: "ok", boot_id: "boot-A", scenario: "priya-ato" }),
          }); // retry establishes baseline
        // subsequent polls return a new boot_id (restart happened)
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", boot_id: "boot-B", scenario: "priya-ato" }),
        });
      }),
    );
    render(<StalenessBanner reload={vi.fn()} />);
    // Advance past the 3s retry (establishes baseline boot-A)
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    // Advance past the next 30s interval tick (sees boot-B → stale)
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText(/SERVER RESTARTED/)).toBeTruthy();
  });
});
