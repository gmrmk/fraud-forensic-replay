/** B7: the shell with no slots is the shell as it stood (pinned from the unedited file, on its case consumers), and the slots, the one-line fold and the clearing control are new. */
import { useState, type ComponentProps } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TimelineShell, type RailSlot } from "./TimelineShell";
import { CaseStrip } from "./CaseStrip";
import { usePlayhead } from "../../store/playhead";
import { useClockForm } from "../../store/clock-form";
import { useZoomGestures } from "../../lib/use-zoom-gestures";
import { GUTTER, HEAD_RAIL } from "../../lib/bar-metrics";
import { caseStripWords, soloClearName, soloClearWords } from "../../lib/tooltip-words/bar";
import { when, when24 } from "../../lib/time-words";

// The real hook runs; the mock only records what the shell passes it.
vi.mock("../../lib/use-zoom-gestures", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/use-zoom-gestures")>();
  return { ...real, useZoomGestures: vi.fn(real.useZoomGestures) };
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MIN = Date.parse("2026-05-25T05:00:00Z");
const MAX = MIN + 10 * DAY;
const PH = MIN + 5 * DAY + 3 * HOUR;

function setStore(): void {
  usePlayhead.setState({
    playhead: PH,
    minTime: MIN,
    maxTime: MAX,
    windowMin: MIN + 2 * DAY,
    windowMax: MIN + 8 * DAY,
    isPlaying: false,
    playbackRate: 1,
  });
}

/** The panel's markup, as the browser would serialise it. */
function rootHtml(container: HTMLElement): string {
  const root = container.querySelector("[data-eyes='TIMELINE-ROOT']");
  if (!root) throw new Error("no TIMELINE-ROOT");
  // The transport (the top row's last child) is another item's file and changes with it, so its
  // box stays and its contents do not.
  const clone = root.cloneNode(true) as HTMLElement;
  clone.firstElementChild?.lastElementChild?.replaceChildren();
  return clone.outerHTML;
}

// ---- helpers for the slots and the fold ---------------------------------------------------------
/** The arrow today's bar draws at the left edge when the playhead stands before the window. */
const ARROW_BEFORE = String.fromCharCode(0x2039);

type ShellProps = Omit<ComponentProps<typeof TimelineShell>, "children">;

/** The day band: a hidden, positioned box with a bottom margin. (A class selector on `h-[5px]` is
 *  parsed wrongly by the test DOM, so the band is found by these three.) */
const BAND_SELECTOR = "div.relative.mb-1[aria-hidden='true']";

const BAND = [
  { leftPct: 0, widthPct: 50, count: 3, severe: false },
  { leftPct: 50, widthPct: 50, count: 9, severe: true },
];

function BarUnderTest(props: ShellProps) {
  return (
    <TimelineShell readout={<span data-testid="readout">readout</span>} formatValueText={() => "spoken"} onStep={() => {}} {...props}>
      {() => <i data-testid="overlay" />}
    </TimelineShell>
  );
}

function mockRect(el: Element, width = 1000): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: width, bottom: 32, width, height: 32, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

/** True when `later` follows `earlier` in the document. */
const follows = (earlier: Element, later: Element): boolean =>
  (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

const slider = (): HTMLElement => screen.getByRole("slider", { name: "Playhead position" });

/** A bar that folds to one line and opens again, with the name column drawn. */
function Folding({ start = false, solo }: { start?: boolean; solo?: { name: string; onClear: () => void } }) {
  const [folded, setFolded] = useState(start);
  return (
    <BarUnderTest
      nameColumn
      dayDensity={BAND}
      lanes={() => <div data-testid="a-lane" />}
      corner={<button type="button" data-testid="corner">rows</button>}
      fold={{
        folded,
        onToggle: () => setFolded((f) => !f),
        noun: "event",
        strip: <CaseStrip times={[MIN + 1]} seeks={false} />,
        solo,
      }}
    />
  );
}

const foldButton = (c: HTMLElement): HTMLElement => c.querySelector("[data-bar-fold]") as HTMLElement;

describe("the name column and the other slots", () => {
  beforeEach(() => {
    setStore();
    vi.mocked(useZoomGestures).mockClear();
    useClockForm.setState({ h24: false });
  });

  it("starts the band, the track and the hours after the name column, and passes GUTTER to the zoom hook", () => {
    const { container } = render(
      <BarUnderTest nameColumn dayDensity={BAND} lanes={() => <div data-testid="a-lane" />} corner={<span data-testid="corner" />} />,
    );
    expect(GUTTER).toBe(148);
    expect(slider().style.marginLeft).toBe("148px");
    expect((container.querySelector(BAND_SELECTOR) as HTMLElement).style.marginLeft).toBe("148px");
    expect((container.querySelector("[data-timeline-axis]") as HTMLElement).style.marginLeft).toBe("148px");
    expect(vi.mocked(useZoomGestures).mock.calls.at(-1)?.[1]).toBe(148);
  });

  it("passes no inset to the zoom hook and draws no corner when the name column is not drawn", () => {
    const { container } = render(<BarUnderTest dayDensity={BAND} corner={<span data-testid="corner" />} />);
    expect(vi.mocked(useZoomGestures).mock.calls.at(-1)?.[1] ?? 0).toBe(0);
    expect(screen.queryByTestId("corner")).toBeNull();
    expect(container.querySelector("[data-bar-corner]")).toBeNull();
    expect(slider().style.marginLeft).toBe("");
  });

  it("sets the corner over the inset, level with the track, and before the track in the document", () => {
    const { container } = render(<BarUnderTest nameColumn corner={<span data-testid="corner" />} />);
    const box = container.querySelector("[data-bar-corner]") as HTMLElement;
    expect(box.contains(screen.getByTestId("corner"))).toBe(true);
    expect(box.style.width).toBe("148px");
    expect(box.style.top).toBe("0px");
    expect(follows(box, slider())).toBe(true);
  });

  it("draws the overview in place of the day band, inside the name column's inset", () => {
    const { container } = render(<BarUnderTest nameColumn dayDensity={BAND} overview={<div data-testid="overview" />} />);
    expect(container.querySelector(BAND_SELECTOR)).toBeNull();
    const holder = screen.getByTestId("overview").parentElement as HTMLElement;
    expect(holder.style.marginLeft).toBe("148px");
  });

  it("puts the hours under the lanes, or above the track when axisOnTop is set", () => {
    const lanes = () => <div data-testid="a-lane" />;
    const under = render(<BarUnderTest lanes={lanes} />);
    const axis1 = under.container.querySelector("[data-timeline-axis]") as HTMLElement;
    expect(follows(screen.getByTestId("a-lane"), axis1)).toBe(true);
    under.unmount();
    const top = render(<BarUnderTest lanes={lanes} axisOnTop />);
    const axis2 = top.container.querySelector("[data-timeline-axis]") as HTMLElement;
    expect(follows(slider(), axis2)).toBe(true);
    expect(follows(axis2, screen.getByTestId("a-lane"))).toBe(true);
  });

  it("gives a rail slot the projector, the plot's press and a way to focus the track, above the track", () => {
    let seen: RailSlot | null = null;
    const { container } = render(
      <BarUnderTest
        nameColumn
        corner={<span data-testid="corner" />}
        rail={(s) => {
          seen = s;
          return <div data-testid="rail" onMouseDown={s.onPlotMouseDown} />;
        }}
      />,
    );
    expect(seen).not.toBeNull();
    expect(seen!.project.domainMin).toBe(MIN + 2 * DAY);
    expect(follows(screen.getByTestId("rail"), slider())).toBe(true);
    // The corner stands under the rail, level with the track.
    expect((container.querySelector("[data-bar-corner]") as HTMLElement).style.top).toBe(`${HEAD_RAIL}px`);
    // A press on the rail seeks as a press on the track does, over the window.
    mockRect(slider());
    fireEvent.mouseDown(screen.getByTestId("rail"), { clientX: 500 });
    expect(usePlayhead.getState().playhead).toBe(MIN + 5 * DAY);
    fireEvent.mouseUp(window);
    act(() => seen!.focusTrack());
    expect(document.activeElement).toBe(slider());
  });

  it("leaves a right press on a plot alone: no seek, no pause, no preventDefault and no focus on the track", () => {
    usePlayhead.setState({ isPlaying: true });
    render(
      <BarUnderTest
        nameColumn
        corner={<span data-testid="corner" />}
        rail={(s) => <div data-testid="rail" onMouseDown={s.onPlotMouseDown} />}
        lanes={() => <button type="button" data-testid="elsewhere" />}
      />,
    );
    mockRect(slider());
    const elsewhere = screen.getByTestId("elsewhere");
    elsewhere.focus();
    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.mouseDown(screen.getByTestId("rail"), { button: 2, clientX: 250 })).toBe(true);
    expect(usePlayhead.getState().playhead).toBe(PH);
    expect(usePlayhead.getState().isPlaying).toBe(true);
    expect(usePlayhead.getState().isScrubbing).toBe(false);
    expect(document.activeElement).toBe(elsewhere);
    // A ctrl press with the main button is the same press on a Mac.
    expect(fireEvent.mouseDown(screen.getByTestId("rail"), { button: 0, ctrlKey: true, clientX: 250 })).toBe(true);
    expect(usePlayhead.getState().playhead).toBe(PH);
    expect(document.activeElement).toBe(elsewhere);
    // The main button alone is today's press: it seeks, takes the focus and holds back the selection.
    expect(fireEvent.mouseDown(screen.getByTestId("rail"), { button: 0, clientX: 250 })).toBe(false);
    expect(usePlayhead.getState().playhead).toBe(MIN + 2 * DAY + 0.25 * 6 * DAY);
    expect(document.activeElement).toBe(slider());
    fireEvent.mouseUp(window);
  });

  it("draws a handle slot in place of the dot and the off-window arrows", () => {
    // The playhead stands before the window, so today's bar draws its arrow.
    usePlayhead.setState({ playhead: MIN });
    const first = render(<BarUnderTest />);
    expect(slider().textContent).toContain(ARROW_BEFORE);
    expect(slider().querySelector(".bg-accent.rounded-full")).not.toBeNull();
    first.unmount();
    render(<BarUnderTest handle={(p) => <b data-testid="handle">{p.domainMin}</b>} />);
    expect(slider().contains(screen.getByTestId("handle"))).toBe(true);
    expect(slider().querySelector(".bg-accent.rounded-full")).toBeNull();
    expect(slider().textContent).not.toContain(ARROW_BEFORE);
  });
});

describe("the one-line fold", () => {
  beforeEach(() => {
    setStore();
    vi.mocked(useZoomGestures).mockClear();
    useClockForm.setState({ h24: false });
  });

  it("is one slider named Playhead position over the whole case, with the clock and the transport", () => {
    const { container } = render(<Folding start />);
    const s = slider();
    expect(s.getAttribute("aria-valuemin")).toBe(String(MIN));
    expect(s.getAttribute("aria-valuemax")).toBe(String(MAX));
    expect(s.getAttribute("aria-valuenow")).toBe(String(PH));
    expect(s.getAttribute("aria-valuetext")).toBe("spoken");
    expect(s.querySelector("[data-case-strip]")).not.toBeNull();
    expect(container.querySelector("[data-head-clock]")).not.toBeNull();
    expect(container.querySelector("button[aria-label^='Play']")).not.toBeNull();
    expect(foldButton(container).getAttribute("aria-expanded")).toBe("false");
    // Nothing of the open bar is drawn.
    for (const gone of ["[data-timeline-gestures]", "[data-timeline-axis]", "[data-bar-corner]"]) {
      expect(container.querySelector(gone), gone).toBeNull();
    }
    for (const id of ["overlay", "a-lane", "readout", "corner"]) expect(screen.queryByTestId(id), id).toBeNull();
    expect(container.querySelectorAll("[data-eyes='TIMELINE-ROOT']")).toHaveLength(1);
  });

  it("steps and seeks over the whole case, not over the zoom window", () => {
    render(<Folding start />);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(usePlayhead.getState().playhead).toBe(PH + 0.01 * (MAX - MIN));
    mockRect(slider());
    fireEvent.mouseDown(slider(), { clientX: 500 });
    expect(usePlayhead.getState().playhead).toBe(MIN + 0.5 * (MAX - MIN));
    fireEvent.mouseUp(window);
  });

  it("calls the step handler from the slider, as the open track does", () => {
    const onStep = vi.fn();
    render(<BarUnderTest nameColumn onStep={onStep} fold={{ folded: true, onToggle: () => {}, noun: "event", strip: <i /> }} />);
    fireEvent.keyDown(slider(), { key: "." });
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("names what the strip counts and the span it covers on the slider, which keyboard focus reaches", () => {
    render(<Folding start />);
    const lines = caseStripWords("event", when(MIN), when(MAX));
    expect(slider().getAttribute("data-tip")).toBe(lines.join("\n"));
    expect(slider().getAttribute("aria-description")).toBe(lines.join(". "));
    expect(slider().tabIndex).toBe(0);
    // The sentences, pinned here as written, since the words file has its own test elsewhere.
    expect(lines.slice(0, 2)).toEqual(["The whole case", "Each slice counts the events in one part of the case."]);
    expect(lines[2]).toBe(`The case runs from ${when(MIN)} to ${when(MAX)}.`);
  });

  it("writes the span's two times in the clock's form", () => {
    useClockForm.setState({ h24: true });
    render(<Folding start />);
    expect(slider().getAttribute("data-tip")).toBe(caseStripWords("event", when24(MIN), when24(MAX)).join("\n"));
  });

  it("keeps the fold button as one DOM node, with the focus on it, across a fold and an open", () => {
    const { container } = render(<Folding />);
    const button = foldButton(container);
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(button); // to one line
    expect(foldButton(container)).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button); // open again
    expect(foldButton(container)).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll("[data-bar-fold]")).toHaveLength(1);
  });

  it("names a region in aria-controls only while the bar is open, and the region is in the document", () => {
    const { container } = render(<Folding />);
    const button = foldButton(container);
    const id = button.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)).toBe(container.querySelector("[data-timeline-gestures]"));
    fireEvent.click(button);
    expect(button.hasAttribute("aria-controls")).toBe(false);
    expect(container.querySelector("[data-timeline-gestures]")).toBeNull();
  });

  it("says its state in the button's name, in both states", () => {
    const { container } = render(<Folding />);
    const button = foldButton(container);
    expect(button.textContent).toContain("It is open. Press to fold the Timeline.");
    fireEvent.click(button);
    // The one line shows the clock, the whole case and the transport; it draws no small version of a section.
    expect(button.textContent).toContain("It is folded. It shows the clock, the whole case and the transport. Press to open the Timeline.");
    expect(button.textContent).not.toContain("small version");
  });

  it("follows the visual order in the document: button, clock, slider, transport; and open: button, corner, track, lane, hours", () => {
    const { container } = render(<Folding start />);
    const button = foldButton(container);
    const clock = container.querySelector("[data-head-clock]") as HTMLElement;
    const play = container.querySelector("button[aria-label^='Play']") as HTMLElement;
    expect(follows(button, clock)).toBe(true);
    expect(follows(clock, slider())).toBe(true);
    expect(follows(slider(), play)).toBe(true);
    fireEvent.click(button);
    const corner = screen.getByTestId("corner");
    const axis = container.querySelector("[data-timeline-axis]") as HTMLElement;
    expect(follows(button, corner)).toBe(true);
    expect(follows(corner, slider())).toBe(true);
    expect(follows(slider(), screen.getByTestId("a-lane"))).toBe(true);
    expect(follows(screen.getByTestId("a-lane"), axis)).toBe(true);
  });

  it("gives the zoom hook the gesture wrapper while open and no element while folded, with no inset on one line", () => {
    const { container } = render(<Folding />);
    const calls = vi.mocked(useZoomGestures).mock.calls;
    expect(calls.at(-1)?.[0].current).toBe(container.querySelector("[data-timeline-gestures]"));
    expect(calls.at(-1)?.[1]).toBe(148);
    const openRef = calls.at(-1)?.[0];
    fireEvent.click(foldButton(container));
    const folded = vi.mocked(useZoomGestures).mock.calls.at(-1);
    expect(folded?.[0].current).toBeNull();
    expect(folded?.[1] ?? 0).toBe(0);
    // A different ref object each way, so the hook's effect runs again when the bar reopens.
    expect(folded?.[0]).not.toBe(openRef);
    fireEvent.click(foldButton(container));
    expect(vi.mocked(useZoomGestures).mock.calls.at(-1)?.[0].current).toBe(container.querySelector("[data-timeline-gestures]"));
  });
});

describe("the one line carries the row that is alone, with a mark that clears it", () => {
  beforeEach(setStore);

  it("draws a button with the row's name and a mark, named for the state, that clears the solo", () => {
    const onClear = vi.fn();
    const { container } = render(<Folding start solo={{ name: "Ostwick Logic", onClear }} />);
    const clear = screen.getByRole("button", { name: soloClearName("Ostwick Logic") });
    expect(clear.getAttribute("data-solo-clear")).not.toBeNull();
    expect(clear.textContent).toContain("Ostwick Logic");
    expect(clear.querySelector("[data-solo-mark]")?.getAttribute("aria-hidden")).toBe("true");
    expect(clear.getAttribute("data-tip")).toBe(soloClearWords("Ostwick Logic").join("\n"));
    expect(clear.getAttribute("aria-label")).toBe("Ostwick Logic is alone. Press to show every row.");
    expect(clear.getAttribute("data-tip")).toBe("Ostwick Logic is alone\nPress to show every row.");
    // A Tab stop: no negative tabindex, and the control takes the focus.
    expect(clear.getAttribute("tabindex")).toBeNull();
    clear.focus();
    expect(document.activeElement).toBe(clear);
    expect(clear.className).toMatch(/\bh-6\b/); // 24 px, the target size of WCAG 2.5.8
    expect(clear.className).toContain("focus-visible:ring-signal"); // the bar's one focus ring
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
    // It sits between the clock and the slider.
    expect(follows(container.querySelector("[data-head-clock]") as Element, clear)).toBe(true);
    expect(follows(clear, slider())).toBe(true);
  });

  it("keeps a long name whole in its text and its accessible name", () => {
    const long = "A".repeat(120);
    render(<Folding start solo={{ name: long, onClear: () => {} }} />);
    const clear = screen.getByRole("button", { name: soloClearName(long) });
    expect(clear.textContent).toContain(long);
  });

  it("draws no control when no row is alone, and none on the open bar (the rows' own control clears it there)", () => {
    const none = render(<Folding start />);
    expect(none.container.querySelector("[data-solo-clear]")).toBeNull();
    none.unmount();
    const open = render(<Folding solo={{ name: "Ostwick Logic", onClear: () => {} }} />);
    expect(open.container.querySelector("[data-solo-clear]")).toBeNull();
  });

  it("is on the screen in each state that has a fold: still there after a fold, gone after an open", () => {
    const { container } = render(<Folding solo={{ name: "Ostwick Logic", onClear: () => {} }} />);
    fireEvent.click(foldButton(container));
    expect(container.querySelector("[data-solo-clear]")).not.toBeNull();
    fireEvent.click(foldButton(container));
    expect(container.querySelector("[data-solo-clear]")).toBeNull();
  });
});

describe("a key pressed on a button inside the track is not the track's key", () => {
  beforeEach(() => {
    setStore();
    usePlayhead.setState({ markA: null, markB: null });
  });
  // The marks live in the store and outlive the test: the snapshots after this block draw them.
  afterEach(() => usePlayhead.setState({ markA: null, markB: null }));

  /** The open track with a mark button inside it, as the notes and the marks draw theirs. */
  function Track(props: { onNote: () => void; onStep: (d: 1 | -1) => void }) {
    return (
      <TimelineShell readout={<span />} scrubDomain="window" ariaLabel="Playhead position" onStep={props.onStep} onNote={props.onNote}>
        {() => <button type="button" data-testid="a-mark">mark</button>}
      </TimelineShell>
    );
  }

  it.each(["Home", "End", "ArrowRight", "ArrowLeft", "m", "n", "."])(
    "%s on the mark leaves the playhead, playback, the A and B marks and the note opener as they were",
    (key) => {
      const onNote = vi.fn();
      const onStep = vi.fn();
      usePlayhead.setState({ isPlaying: true });
      render(<Track onNote={onNote} onStep={onStep} />);
      fireEvent.keyDown(screen.getByTestId("a-mark"), { key });
      const s = usePlayhead.getState();
      expect(s.playhead).toBe(PH);
      expect(s.isPlaying).toBe(true);
      expect(s.markA).toBeNull();
      expect(s.markB).toBeNull();
      expect(onNote).not.toHaveBeenCalled();
      expect(onStep).not.toHaveBeenCalled();
    },
  );

  it("the same keys pressed on the track itself still act", () => {
    const onNote = vi.fn();
    usePlayhead.setState({ isPlaying: true });
    render(<Track onNote={onNote} onStep={() => {}} />);
    fireEvent.keyDown(slider(), { key: "n" });
    expect(onNote).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(slider(), { key: "m" });
    expect(usePlayhead.getState().markA).toBe(PH);
    fireEvent.keyDown(slider(), { key: "Home" });
    expect(usePlayhead.getState().playhead).toBe(MIN + 2 * DAY); // the window's start
    expect(usePlayhead.getState().isPlaying).toBe(false);
  });
});

describe("TimelineShell with no slots draws today's DOM", () => {
  beforeEach(setStore);

  it("case consumer: window domain, band, step keys, a lane", () => {
    const { container } = render(
      <TimelineShell
        readout={<span>readout</span>}
        dayDensity={[
          { leftPct: 0, widthPct: 50, count: 3, severe: false },
          { leftPct: 50, widthPct: 50, count: 9, severe: true },
        ]}
        scrubDomain="window"
        ariaLabel="Playhead position"
        formatValueText={() => "spoken"}
        onStep={() => {}}
        lanes={() => <div data-testid="a-lane" />}
      >
        {() => <i data-testid="overlay" />}
      </TimelineShell>,
    );
    expect(rootHtml(container)).toMatchInlineSnapshot(`"<div class="glass mb-3 z-10 rounded-none px-3 pt-2 pb-2" data-eyes="TIMELINE-ROOT" style=""><div class="flex items-center justify-between mb-2"><span>readout</span><div class="flex items-center gap-1"></div></div><div class="relative h-[5px] mb-1" aria-hidden="true"><button type="button" tabindex="-1" class="absolute top-0 h-full cursor-pointer border-none p-0" style="left: 0%; width: calc(50% - 1px);" title="3 events"></button><button type="button" tabindex="-1" class="absolute top-0 h-full cursor-pointer border-none p-0" style="left: 50%; width: calc(50% - 1px);" title="9 events"></button></div><div data-timeline-gestures="true"><div tabindex="0" class="relative h-8 cursor-pointer select-none rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-accent" role="slider" aria-label="Playhead position" aria-valuemin="1779858000000" aria-valuemax="1780376400000" aria-valuenow="1780128000000" aria-valuetext="spoken" aria-keyshortcuts=", . M"><i data-testid="overlay"></i><div class="absolute top-1/2 left-0 right-0 h-px bg-panel-border"></div><div class="absolute top-1/2 left-0 h-px bg-accent-dim" style="width: 52.083333333333336%; z-index: 5;"></div><div class="absolute top-1/2 -translate-y-1/2 w-px h-1.5 bg-panel-border-strong" style="left: 13.194444444444445%; z-index: 1;"></div><div class="absolute top-1/2 -translate-y-1/2 w-px h-1.5 bg-panel-border-strong" style="left: 29.86111111111111%; z-index: 1;"></div><div class="absolute top-1/2 -translate-y-1/2 w-px h-1.5 bg-panel-border-strong" style="left: 46.52777777777778%; z-index: 1;"></div><div class="absolute top-1/2 -translate-y-1/2 w-px h-1.5 bg-panel-border-strong" style="left: 63.19444444444444%; z-index: 1;"></div><div class="absolute top-1/2 -translate-y-1/2 w-px h-1.5 bg-panel-border-strong" style="left: 79.86111111111111%; z-index: 1;"></div><div class="absolute top-1/2 -translate-y-1/2 w-px h-1.5 bg-panel-border-strong" style="left: 96.52777777777779%; z-index: 1;"></div><div class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-accent rounded-full shadow-[0_0_10px_rgb(var(--r1-rgb)/0.6)] pointer-events-none" style="left: 52.083333333333336%; z-index: 5;"></div></div><div data-testid="a-lane"></div></div><div data-timeline-axis="true" class="relative h-3 mt-1"><span class="absolute font-mono text-[9px] tracking-widest text-text -translate-x-1/2" style="left: 13.194444444444445%;">May 27</span><span class="absolute font-mono text-[9px] tracking-widest text-text -translate-x-1/2" style="left: 29.86111111111111%;">May 28</span><span class="absolute font-mono text-[9px] tracking-widest text-text -translate-x-1/2" style="left: 46.52777777777778%;">May 29</span><span class="absolute font-mono text-[9px] tracking-widest text-text -translate-x-1/2" style="left: 63.19444444444444%;">May 30</span><span class="absolute font-mono text-[9px] tracking-widest text-text -translate-x-1/2" style="left: 79.86111111111111%;">May 31</span><span class="absolute font-mono text-[9px] tracking-widest text-text -translate-x-1/2" style="left: 96.52777777777779%;">Jun 1</span></div></div>"`);
  });
});
