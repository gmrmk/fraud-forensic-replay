// frontend/investigator/src/components/timeline/head/HeadTab.test.tsx
// The tab that holds the only clock and is the grip, the rail it rides, the folded
// bar's clock and the Timeline's fold button. The tab is not a keyboard stop (the track is), and
// taking it does not move the playhead.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BAR_FOCUS_RING, HEAD_RAIL } from "../../../lib/bar-metrics";
import { remaining, when, when24 } from "../../../lib/time-words";
import { useClockForm } from "../../../store/clock-form";
import { usePlayhead } from "../../../store/playhead";
import { makeProjector } from "../../../lib/timeline-projector";
import { BarFold } from "./BarFold";
import { HeadClock } from "./HeadClock";
import { HeadRail } from "./HeadRail";
import { HEAD_TAB_ARROW_PX, HEAD_TAB_WIDTH_PX, HeadTab } from "./HeadTab";

const HOUR = 3_600_000;
const FIRST = Date.parse("2026-06-08T00:00:00Z");
const MAX = FIRST + 10 * HOUR;
const project = makeProjector(FIRST, MAX);
// The advance of the mono face the bar's figures and clock use, in em (design section 8).
const ADVANCE_PX = 6.32;

const setPlayhead = (ms: number) => act(() => usePlayhead.setState({ playhead: ms }));
const tab = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-head-tab]")!;
const tabText = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-head-tab-text]")!;
const tabArrow = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-head-tab-arrow]");

beforeEach(() => {
  usePlayhead.setState({ playhead: FIRST + 5 * HOUR, minTime: FIRST, maxTime: MAX, isPlaying: false });
  useClockForm.setState({ h24: false });
});

function mountTab(onGrab: () => void = () => {}, onRailMouseDown: () => void = () => {}) {
  const out = render(
    <HeadRail inset={0} onMouseDown={onRailMouseDown}>
      <HeadTab project={project} maxTime={MAX} noun="event" onGrab={onGrab} />
    </HeadRail>,
  );
  const rail = out.container.querySelector<HTMLElement>("[data-head-rail]")!;
  // happy-dom has no layout: the rail is 1,000 px wide and starts at the page's left edge.
  rail.getBoundingClientRect = () => ({ left: 0, right: 1000, top: 0, bottom: HEAD_RAIL, width: 1000, height: HEAD_RAIL, x: 0, y: 0, toJSON: () => ({}) });
  tab(out.container).setPointerCapture = () => {};
  tab(out.container).releasePointerCapture = () => {};
  return out;
}

describe("HeadTab", () => {
  it("holds the only clock, in the clock's form", () => {
    const { container } = mountTab();
    expect(tabText(container).textContent).toBe(when(FIRST + 5 * HOUR));
    // Nothing else in the tab: no time left, no label.
    expect(tab(container).textContent).toBe(when(FIRST + 5 * HOUR));
    act(() => useClockForm.setState({ h24: true }));
    expect(tabText(container).textContent).toBe(when24(FIRST + 5 * HOUR));
  });

  it("is placed by a transform and is not a keyboard stop", () => {
    const { container } = mountTab();
    expect(tab(container).style.transform).toContain("translateX");
    expect(tab(container).style.left).toBe("0px");
    expect(tab(container).getAttribute("aria-hidden")).toBe("true");
    expect(tab(container).hasAttribute("tabindex")).toBe(false);
    const before = tab(container).style.transform;
    setPlayhead(FIRST + 6 * HOUR);
    expect(tab(container).style.transform).not.toBe(before);
  });

  it("draws its arrow outside the text, so the text stays at the clock's own length", () => {
    const { container } = mountTab();
    expect(tabArrow(container)).toBeNull();
    setPlayhead(FIRST - HOUR);
    expect(tabArrow(container)!.textContent).toBe("‹");
    expect(tabArrow(container)!.getAttribute("aria-hidden")).toBe("true");
    expect(tabText(container).textContent).toBe(when(FIRST - HOUR));
    expect(tabText(container).contains(tabArrow(container))).toBe(false);
    setPlayhead(MAX + HOUR);
    expect(tabArrow(container)!.textContent).toBe("›");
    expect(tabText(container).textContent).toBe(when(MAX + HOUR));
  });

  it("fits its text and its arrow in its width at the longest clock", () => {
    // The longest 12 hour clock is 19 characters: a two digit day and a two digit hour.
    const longest = Date.parse("2026-05-20T15:06:00Z");
    expect(when(longest)).toHaveLength(19);
    expect(when24(longest).length).toBeLessThanOrEqual(19);
    expect(HEAD_TAB_WIDTH_PX).toBe(128);
    // 19 characters at the face's advance, with the arrow's own room, inside the 128 px tab.
    expect(19 * ADVANCE_PX + HEAD_TAB_ARROW_PX).toBeLessThanOrEqual(HEAD_TAB_WIDTH_PX);
    // The old form, the arrow and a space inside the text, did not fit: 21 characters.
    expect(21 * ADVANCE_PX).toBeGreaterThan(HEAD_TAB_WIDTH_PX);
  });

  it("carries a tooltip with the time left, seconds included, and the edge it waits at", () => {
    const { container } = mountTab();
    expect(tab(container).getAttribute("data-tip")).toContain(`The time from the playhead to the last event is ${remaining(MAX - (FIRST + 5 * HOUR))}.`);
    setPlayhead(FIRST - HOUR);
    expect(tab(container).getAttribute("data-tip")).toContain("The playhead is before what the Timeline shows. The tab stays at the left edge.");
  });

  it("does not move the playhead when taken, and pauses and hands the focus to the track", () => {
    usePlayhead.setState({ isPlaying: true });
    const onGrab = vi.fn();
    const onRail = vi.fn();
    const { container } = mountTab(onGrab, onRail);
    const at = usePlayhead.getState().playhead;
    // The pointer takes the tab 10 px right of the line, which stands at 500 px.
    fireEvent.pointerDown(tab(container), { clientX: 510, pointerId: 1 });
    expect(usePlayhead.getState().playhead).toBe(at);
    expect(usePlayhead.getState().isPlaying).toBe(false);
    expect(onGrab).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(tab(container));
    expect(onRail).not.toHaveBeenCalled();
    fireEvent.pointerUp(tab(container), { pointerId: 1 });
  });

  it("moves 100 px of time for a drag of 100 px, and keeps its distance from the line", () => {
    const { container } = mountTab();
    fireEvent.pointerDown(tab(container), { clientX: 510, pointerId: 1 });
    fireEvent.pointerMove(tab(container), { clientX: 610, pointerId: 1 });
    // 100 px of a 1,000 px rail over 10 hours is one hour.
    expect(usePlayhead.getState().playhead).toBe(FIRST + 6 * HOUR);
    fireEvent.pointerMove(tab(container), { clientX: -900, pointerId: 1 });
    expect(usePlayhead.getState().playhead).toBe(FIRST);
    fireEvent.pointerMove(tab(container), { clientX: 5000, pointerId: 1 });
    expect(usePlayhead.getState().playhead).toBe(MAX);
    fireEvent.pointerUp(tab(container), { pointerId: 1 });
    // Released: a further move does nothing.
    fireEvent.pointerMove(tab(container), { clientX: 300, pointerId: 1 });
    expect(usePlayhead.getState().playhead).toBe(MAX);
  });

  it("leaves a second pointer alone while one holds the tab", () => {
    const onGrab = vi.fn();
    const { container } = mountTab(onGrab);
    fireEvent.pointerDown(tab(container), { clientX: 510, pointerId: 1 });
    fireEvent.pointerDown(tab(container), { clientX: 700, pointerId: 2 });
    expect(onGrab).toHaveBeenCalledTimes(1);
  });
});

describe("HeadRail", () => {
  it("is the strip above the track, its height the head's rail, offset by the name column", () => {
    const onMouseDown = vi.fn();
    const { container } = render(
      <HeadRail inset={148} onMouseDown={onMouseDown}>
        <span>child</span>
      </HeadRail>,
    );
    const rail = container.querySelector<HTMLElement>("[data-head-rail]")!;
    expect(rail.style.height).toBe(`${HEAD_RAIL}px`);
    expect(rail.style.marginLeft).toBe("148px");
    expect(rail.style.containerType).toBe("inline-size");
    fireEvent.mouseDown(rail);
    expect(onMouseDown).toHaveBeenCalledTimes(1);
    expect(rail.textContent).toBe("child");
  });
});

describe("HeadClock", () => {
  it("shows the clock in its form and says the time left in its tooltip", () => {
    const { container } = render(<HeadClock maxTime={MAX} noun="event" />);
    const el = container.querySelector<HTMLElement>("[data-head-clock]")!;
    expect(el.textContent).toBe(when(FIRST + 5 * HOUR));
    expect(el.getAttribute("data-tip")).toContain(remaining(5 * HOUR));
    act(() => useClockForm.setState({ h24: true }));
    expect(el.textContent).toBe(when24(FIRST + 5 * HOUR));
  });
});

describe("BarFold", () => {
  const PART = "the track, the rows and the lane";
  const button = () => screen.getByRole("button");
  /** The state the fold's one mark names, or null when the button has none. */
  const markOf = () => button().querySelector("[data-fold-mark]")?.getAttribute("data-fold-mark") ?? null;
  /** The button's text with the mark's own (hidden) glyph and the sentence for assistive tech taken out: the word and nothing else. */
  const visibleText = () => {
    const copy = button().cloneNode(true) as HTMLElement;
    copy.querySelectorAll("[data-fold-mark], [data-fold-words]").forEach((n) => n.remove());
    return copy.textContent;
  };

  it("is open: the down triangle, expanded, and a name that says what a press does", () => {
    render(<BarFold folded={false} small={false} part={PART} controls="bar-body" onToggle={() => {}} />);
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(button().getAttribute("aria-controls")).toBe("bar-body");
    expect(markOf()).toBe("open");
    expect(visibleText()).toBe("Timeline");
    expect(document.querySelector("[data-fold-svg]")).toBeNull();
    expect(button().className).toContain(BAR_FOCUS_RING);
    expect(screen.getByRole("button", { name: /^Timeline\s+It is open\. Press to fold the track, the rows and the lane\.$/ })).toBeTruthy();
  });

  it("is folded to its name alone: the right triangle and no picture", () => {
    render(<BarFold folded small={false} part={PART} controls="bar-body" onToggle={() => {}} />);
    expect(button().getAttribute("aria-expanded")).toBe("false");
    // The body does not exist while folded, so nothing is controlled.
    expect(button().hasAttribute("aria-controls")).toBe(false);
    expect(markOf()).toBe("closed");
    expect(visibleText()).toBe("Timeline");
    expect(document.querySelector("[data-fold-svg]")).toBeNull();
    expect(screen.getByRole("button", { name: /^Timeline\s+It is folded\. It shows its name alone\. Press to open/ })).toBeTruthy();
  });

  it("is folded with a small version: the one closed mark, the same drawing as the name-alone fold, and no outline", () => {
    const { rerender } = render(<BarFold folded small part={PART} controls="bar-body" onToggle={() => {}} />);
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(markOf()).toBe("closed");
    expect(visibleText()).toBe("Timeline");
    // No outline in any state: neither the attribute nor a polygon.
    expect(document.querySelector("[data-fold-svg]")).toBeNull();
    expect(button().querySelector("polygon")).toBeNull();
    expect(button().querySelectorAll("svg")).toHaveLength(1);
    const dOf = () => button().querySelector("[data-fold-mark] path")!.getAttribute("d");
    const closedD = dOf();
    const svg = button().querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    // The 5.8 by 12 px box of the 8 px glyph; the picture is drawn in it and no larger.
    expect(svg.getAttribute("width")).toBe("5.8");
    expect(svg.getAttribute("height")).toBe("12");
    expect(button().querySelector("[data-fold-mark] path")!.getAttribute("fill")).toBe("currentColor");
    // The text glyph stays in the span, hidden, so the box and the text metrics do not move.
    const glyph = button().querySelector<HTMLElement>("[data-fold-mark]")!;
    expect(glyph.style.visibility).toBe("hidden");
    expect(glyph.className).toBe("mr-1 shrink-0");
    expect(glyph.textContent).toBe(String.fromCodePoint(0x25b8));
    expect(screen.getByRole("button", { name: /^Timeline\s+It is folded\. It shows a small version\. Press to open/ })).toBeTruthy();
    // The name-alone fold draws the same closed mark, and opening turns that same drawing.
    rerender(<BarFold folded small={false} part={PART} controls="bar-body" onToggle={() => {}} />);
    expect(markOf()).toBe("closed");
    expect(dOf()).toBe(closedD);
    rerender(<BarFold folded={false} small part={PART} controls="bar-body" onToggle={() => {}} />);
    expect(markOf()).toBe("open");
    expect(dOf()).toBe(closedD);
    expect(document.querySelector("[data-fold-svg]")).toBeNull();
  });

  it("toggles on a press and carries the Timeline's tooltip", () => {
    const onToggle = vi.fn();
    render(<BarFold folded={false} small={false} part={PART} onToggle={onToggle} />);
    fireEvent.click(button());
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(button().getAttribute("data-tip")!.split("\n")[0]).toBe("Timeline");
    // No `controls` given: no aria-controls, even open.
    expect(button().hasAttribute("aria-controls")).toBe(false);
  });
});
