/** The two marks on the track and the gap between them, read out for sighted and screen-reader users. */
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MarksLayer } from "./MarksLayer";
import { makeProjector } from "../../lib/timeline-projector";
import { usePlayhead } from "../../store/playhead";

const S = 1000;
const project = makeProjector(0, 1000 * S); // a 1,000 second window
const tick = (c: HTMLElement, mark: "a" | "b") => c.querySelector<HTMLElement>(`[data-mark="${mark}"]`);
const readout = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-marks-readout]");

describe("MarksLayer", () => {
  beforeEach(() => usePlayhead.setState({ markA: null, markB: null }));

  it("draws nothing without marks", () => {
    const { container } = render(<MarksLayer project={project} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("one mark draws its tick with its letter and no readout", () => {
    usePlayhead.setState({ markA: 250 * S });
    const { container } = render(<MarksLayer project={project} />);
    expect(tick(container, "a")!.style.left).toBe("25%");
    expect(tick(container, "a")!.textContent).toBe("A");
    expect(tick(container, "b")).toBeNull();
    expect(readout(container)).toBeNull();
  });

  it("two marks read out the time between them in a polite status region", () => {
    usePlayhead.setState({ markA: 100 * S, markB: 352 * S });
    const { container } = render(<MarksLayer project={project} />);
    expect(parseFloat(tick(container, "b")!.style.left)).toBeCloseTo(35.2, 9);
    const r = readout(container)!;
    expect(r.textContent).toBe("A to B · 4 min 12 s");
    expect(r.getAttribute("role")).toBe("status");
    expect(r.getAttribute("aria-live")).toBe("polite");
  });

  // The readout must not sit across a mark line: with the marks close together it is wider
  // than the gap, and centred between them both lines cut through its text.
  it("sits just after the B mark, clear of both mark lines", () => {
    usePlayhead.setState({ markA: 100 * S, markB: 120 * S });
    const { container } = render(<MarksLayer project={project} />);
    const r = readout(container)!;
    expect(r.style.left).toBe("calc(12% + 8px)");
    expect(r.style.right).toBe("");
    expect(r.className).not.toContain("translate-x");
  });

  it("sits just before the A mark when B is near the right end", () => {
    usePlayhead.setState({ markA: 850 * S, markB: 950 * S });
    const { container } = render(<MarksLayer project={project} />);
    const r = readout(container)!;
    expect(r.style.right).toBe("calc(15% + 8px)");
    expect(r.style.left).toBe("");
  });

  it("sits between the marks only when they stand far apart", () => {
    usePlayhead.setState({ markA: 50 * S, markB: 950 * S });
    const { container } = render(<MarksLayer project={project} />);
    const r = readout(container)!;
    expect(r.style.left).toBe("50%");
    expect(r.className).toContain("-translate-x-1/2");
  });

  it("stays on the track when a mark is outside the window", () => {
    usePlayhead.setState({ markA: -500 * S, markB: -100 * S });
    const { container } = render(<MarksLayer project={project} />);
    expect(readout(container)!.style.left).toBe("calc(0% + 8px)");
  });

  it("a mark outside the window draws no tick, and the gap is still read out", () => {
    usePlayhead.setState({ markA: 100 * S, markB: 4000 * S });
    const { container } = render(<MarksLayer project={project} />);
    expect(tick(container, "a")).not.toBeNull();
    expect(tick(container, "b")).toBeNull();
    expect(readout(container)!.textContent).toBe("A to B · 1 h 05 min");
  });
});
