// frontend/investigator/src/components/timeline/TimelineShell.stack.test.tsx
// The folded Timeline leaves a line for each section, and one more fold gives one
// line. The shell is controlled: a caller gives `fold.more` to draw
// the stack and leaves it out for the one line, so the harness below plays the caller's part and
// cycles open, a line for each section, one line, open. Every fixture is written here. The real
// stories' heights (102 px with the count) are checked on the built site.
//
// The 216 below is written out on purpose: the shell and the small versions must meet it through the
// one constant, and bar-metrics-stack.test.ts pins the constant itself.
import { useCallback, useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimelineShell } from "./TimelineShell";
import { CaseStrip } from "./CaseStrip";
import { LaneSmall } from "./LaneSmall";
import { RowsSmall } from "./rows/RowsSmall";
import { usePlayhead } from "../../store/playhead";
import { useClockForm } from "../../store/clock-form";
import { useZoomGestures } from "../../lib/use-zoom-gestures";
import { barFoldWords } from "../../lib/tooltip-words/head";
import { buildLane, type LaneModel, type LanesSlot } from "../../lib/timeline-lanes";
import type { RowTick } from "../../lib/row-ticks";
import type { Track, TrackSet } from "../../lib/tracks";
import type { Entity } from "../../lib/entity";
import type { ScenarioNode } from "../../lib/scenarios";

vi.mock("../../lib/use-zoom-gestures", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/use-zoom-gestures")>();
  return { ...real, useZoomGestures: vi.fn(real.useZoomGestures) };
});

const MINUTE = 60_000;
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

// ---- The fixture pack: four generic rows with events, and an hourly lane of weights ---------------
function makeRows(named: number): { set: TrackSet; ticks: RowTick[] } {
  const tracks: Track[] = Array.from({ length: named }, (_, i) => ({
    key: `v:g${i}`, name: `Group ${i}`, rest: false, count: 0, bars: [], total: 0, kinds: [], lines: [],
  }));
  const trackOf = new Map<string, number>();
  const ticks: RowTick[] = named === 0 ? [] : Array.from({ length: 6 }, (_, n) => {
    trackOf.set(`e${n}`, n % named);
    return { id: `e${n}`, kind: "k", label: `e${n}`, secondary: "", facts: [], t: MIN + 3 * DAY + n * 2 * HOUR, session: null, challengeVar: null, newDevice: false, blocked: false };
  });
  const set: TrackSet = {
    by: "g", heading: "Group", tracks, named, trackOf, scale: null, step: 0, barPalette: "", barName: "Weight", barUnit: "kg", memberLabel: "",
  };
  return { set, ticks };
}

const node: ScenarioNode = {
  kind: "parcel", label: "Parcel", palette: "#3366cc", source: "json", timestamp: "at", magnitude: "weight", magnitudeLabel: "Weight", magnitudeUnit: "kg",
};
const parcel = (i: number): Entity => ({
  id: `r${i}`, kind: "parcel", timestamp: MIN + 3 * DAY + i * HOUR, coords: null, fields: { weight: 100 + (i % 7) },
  displayMetadata: { primaryLabel: `r${i}`, secondaryLabel: "", paletteKind: "parcel", pivotableFields: [] },
});
const makeLane = (): LaneModel => {
  const lane = buildLane(Array.from({ length: 48 }, (_, i) => parcel(i)), node);
  if (!lane) throw new Error("fixture lane is empty");
  return lane;
};

const FULL = makeRows(4);
const EMPTY = makeRows(0);
const LANE = makeLane();
const GRIDS = [{ step: HOUR, firstBucketStart: LANE.bars[0].t }];

// ---- The harness: the caller's part ----------------------------------------------------------------
type Step = "open" | "each" | "line";
const NEXT: Record<Step, Step> = { open: "each", each: "line", line: "open" };

interface HarnessProps {
  start?: Step;
  empty?: boolean;
  solo?: { name: string; onClear: () => void };
  slots?: LanesSlot[];
}

function Harness({ start = "each", empty = false, solo, slots }: HarnessProps) {
  const [step, setStep] = useState<Step>(start);
  const [opened, setOpened] = useState("");
  const rows = empty ? EMPTY : FULL;
  const more = useCallback(
    (slot: LanesSlot): ReactNode => {
      slots?.push(slot);
      return (
        <>
          <RowsSmall set={rows.set} ticks={rows.ticks} slot={slot} grids={GRIDS} soloKey={null} inset={216} plotPx={1000} onOpen={() => { setOpened("rows"); setStep("open"); }} />
          {empty ? null : (
            <LaneSmall lane={LANE} slot={slot} head={{ grids: GRIDS }} formatTime={(ms) => String(ms)} inset={216} plotPx={1000} onToggle={() => { setOpened("lane"); setStep("open"); }} />
          )}
        </>
      );
    },
    [rows, empty, slots],
  );
  return (
    <TimelineShell
      readout={<span data-testid="readout">readout</span>}
      formatValueText={() => "spoken"}
      onStep={() => {}}
      nameColumn
      lanes={() => <div data-testid="a-lane" data-opened={opened} />}
      corner={<button type="button" data-testid="corner">rows</button>}
      fold={{
        folded: step !== "open",
        onToggle: () => setStep((s) => NEXT[s]),
        noun: "event",
        strip: <CaseStrip times={[MIN + 1, MIN + 4 * DAY]} seeks={false} />,
        solo,
        ...(step === "each" ? { more } : {}),
      }}
    >
      {() => <i data-testid="overlay" />}
    </TimelineShell>
  );
}

const slider = (): HTMLElement => screen.getByRole("slider", { name: "Playhead position" });
const foldButton = (c: HTMLElement): HTMLElement => c.querySelector("[data-bar-fold]") as HTMLElement;
const stackOf = (c: HTMLElement): HTMLElement | null => c.querySelector("[data-bar-stack]");
const follows = (earlier: Element, later: Element): boolean =>
  (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
function mockRect(el: Element, width = 1000): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: width, bottom: 32, width, height: 32, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

beforeEach(() => {
  setStore();
  vi.mocked(useZoomGestures).mockClear();
  useClockForm.setState({ h24: false });
});

describe("a line for each section", () => {
  it("puts the Timeline's line and one line for each section on one grid with a name column of 216 px", () => {
    const { container } = render(<Harness />);
    const stack = stackOf(container) as HTMLElement;
    expect(stack).not.toBeNull();
    expect(stack.getAttribute("style")).toContain("216px");
    expect(stack.getAttribute("style")).toContain("grid");
    const lines = stack.querySelector("[data-stack-lines]") as HTMLElement;
    expect(lines.parentElement).toBe(stack);
    expect(lines.getAttribute("style")).toContain("1 / span 2");
    // The Timeline's own line: the button and the clock in the first column, the slider after them.
    expect(stack.firstElementChild?.contains(foldButton(container))).toBe(true);
    expect(stack.firstElementChild?.querySelector("[data-head-clock]")).not.toBeNull();
    expect(stack.contains(slider())).toBe(true);
    // Each section's small version stands in the lines, with a name column of the same width.
    expect(lines.querySelector("[data-rows-small]")).not.toBeNull();
    expect(lines.querySelector("[data-lane-small]")).not.toBeNull();
    expect((lines.querySelector("[data-small-name]") as HTMLElement).style.width).toBe("216px");
    expect(((lines.querySelector("[data-lane-small]") as HTMLElement).firstElementChild as HTMLElement).style.width).toBe("216px");
    // Each small version carries its own button.
    expect(lines.querySelector("[data-small-open]")).not.toBeNull();
    expect(lines.querySelector("[data-lane-small-name]")).not.toBeNull();
    // Nothing of the open bar is drawn, and the transport is in the grid's last column.
    expect(container.querySelector("[data-timeline-gestures]")).toBeNull();
    expect(container.querySelectorAll("[data-eyes='TIMELINE-ROOT']")).toHaveLength(1);
    expect(stack.querySelector("button[aria-label^='Play']")).not.toBeNull();
  });

  it("gives the lines the whole case as their scale, the slider's own", () => {
    const slots: LanesSlot[] = [];
    render(<Harness slots={slots} />);
    const slot = slots.at(-1) as LanesSlot;
    expect(slot.project.domainMin).toBe(MIN);
    expect(slot.project.domainMax).toBe(MAX);
    expect(slider().getAttribute("aria-valuemin")).toBe(String(MIN));
    expect(slider().getAttribute("aria-valuemax")).toBe(String(MAX));
  });

  it("moves the playhead to the middle of the case on a press in the middle of a strip", () => {
    const { container } = render(<Harness />);
    mockRect(slider());
    for (const plot of ["[data-lane-small-plot]", "[data-small-plot]"]) {
      usePlayhead.setState({ playhead: PH });
      fireEvent.mouseDown(container.querySelector(plot) as HTMLElement, { clientX: 500 });
      fireEvent.mouseUp(window);
      expect(Math.abs(usePlayhead.getState().playhead - (MIN + (MAX - MIN) / 2)), plot).toBeLessThanOrEqual(8 * MINUTE);
    }
  });

  it("gives the strips, the slider and the playhead no extra offset: the lines' wrapper has no padding, margin or height of its own", () => {
    const { container } = render(<Harness />);
    const lines = container.querySelector("[data-stack-lines]") as HTMLElement;
    const style = lines.getAttribute("style") ?? "";
    expect(style).not.toMatch(/padding|margin|height/);
    expect(lines.className).toBe("");
  });

  it("opens the whole bar with the rows open on a press on the rows' button, and moves nothing else", () => {
    const { container } = render(<Harness />);
    const before = foldButton(container);
    fireEvent.click(container.querySelector("[data-small-open]") as HTMLElement);
    expect(container.querySelector("[data-timeline-gestures]")).not.toBeNull();
    expect(stackOf(container)).toBeNull();
    expect(screen.getByTestId("a-lane").getAttribute("data-opened")).toBe("rows");
    expect(usePlayhead.getState().playhead).toBe(PH);
    expect(foldButton(container)).toBe(before);
    expect(before.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens the whole bar with the lane open on a press on the lane's button", () => {
    const { container } = render(<Harness />);
    fireEvent.click(container.querySelector("[data-lane-small-name]") as HTMLElement);
    expect(container.querySelector("[data-timeline-gestures]")).not.toBeNull();
    expect(screen.getByTestId("a-lane").getAttribute("data-opened")).toBe("lane");
    expect(usePlayhead.getState().playhead).toBe(PH);
  });

  it("reaches one line by one more fold, and the line is B7's: no grid, no lines", () => {
    const { container } = render(<Harness />);
    const button = foldButton(container);
    fireEvent.click(button);
    expect(stackOf(container)).toBeNull();
    expect(container.querySelector("[data-stack-lines]")).toBeNull();
    expect(container.querySelector("[data-rows-small]")).toBeNull();
    expect(slider().querySelector("[data-case-strip]")).not.toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    // The one line keeps the flex row it always had.
    const row = button.parentElement?.parentElement as HTMLElement;
    expect(row.className).toContain("flex items-center gap-4");
    expect(row.getAttribute("style") ?? "").toBe("");
    expect(row.hasAttribute("data-bar-stack")).toBe(false);
  });

  it("keeps the Timeline button as one DOM node, with the focus on it, across open, each, one line and open again", () => {
    const { container } = render(<Harness start="open" />);
    const button = foldButton(container);
    button.focus();
    for (const expected of ["each", "line", "open", "each"]) {
      fireEvent.click(button);
      expect(foldButton(container), expected).toBe(button);
      expect(document.activeElement, expected).toBe(button);
      expect(container.querySelectorAll("[data-bar-fold]"), expected).toHaveLength(1);
    }
    expect(stackOf(container)).not.toBeNull();
  });

  it("says in the button's name and tip what the line for each section shows and that a press folds to one line, then what the one line shows", () => {
    const { container } = render(<Harness />);
    const button = foldButton(container);
    expect(button.textContent).toContain("It is folded. It shows a line for each section. Press to fold the Timeline to one line.");
    expect(button.getAttribute("data-tip")).toBe(barFoldWords(true, "stack").join("\n"));
    expect(button.textContent).not.toContain("Press to open");
    fireEvent.click(button);
    expect(button.textContent).toContain("It is folded. It shows the clock, the whole case and the transport. Press to open the Timeline.");
    expect(button.textContent).not.toContain("small version");
    expect(button.getAttribute("data-tip")).toBe(barFoldWords(true, "line").join("\n"));
    fireEvent.click(button);
    expect(button.textContent).toContain("It is open. Press to fold the Timeline.");
  });

  it("names no region in aria-controls in either folded state", () => {
    const { container } = render(<Harness />);
    expect(foldButton(container).hasAttribute("aria-controls")).toBe(false);
    expect(container.querySelector("[data-small-open]")?.hasAttribute("aria-controls")).toBe(false);
    expect(container.querySelector("[data-lane-small-name]")?.hasAttribute("aria-controls")).toBe(false);
    fireEvent.click(foldButton(container));
    expect(foldButton(container).hasAttribute("aria-controls")).toBe(false);
    for (const el of container.querySelectorAll("[aria-controls]")) {
      expect(document.getElementById(el.getAttribute("aria-controls") as string)).not.toBeNull();
    }
  });

  it("carries the row that is alone on its first line, with the control that clears it", () => {
    const onClear = vi.fn();
    const { container } = render(<Harness solo={{ name: "Group 2", onClear }} />);
    const stack = stackOf(container) as HTMLElement;
    const clear = container.querySelector("[data-solo-clear]") as HTMLElement;
    expect(stack.firstElementChild?.contains(clear)).toBe(true);
    expect(follows(container.querySelector("[data-head-clock]") as Element, clear)).toBe(true);
    expect(follows(clear, slider())).toBe(true);
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("follows the visual order in the document: button, clock, slider, transport, then the rows' button, then the lane's", () => {
    const { container } = render(<Harness />);
    const clock = container.querySelector("[data-head-clock]") as HTMLElement;
    const play = container.querySelector("button[aria-label^='Play']") as HTMLElement;
    const rowsButton = container.querySelector("[data-small-open]") as HTMLElement;
    const laneButton = container.querySelector("[data-lane-small-name]") as HTMLElement;
    const order = [foldButton(container), clock, slider(), play, rowsButton, laneButton];
    for (let i = 1; i < order.length; i += 1) expect(follows(order[i - 1], order[i]), `step ${i}`).toBe(true);
  });

  it("gives the zoom hook no element and no inset while folded to a line for each section", () => {
    render(<Harness />);
    const last = vi.mocked(useZoomGestures).mock.calls.at(-1);
    expect(last?.[0].current).toBeNull();
    expect(last?.[1] ?? 0).toBe(0);
  });

  it("keeps the slider's keys over the whole case", () => {
    render(<Harness />);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(usePlayhead.getState().playhead).toBe(PH + 0.01 * (MAX - MIN));
  });
});

describe("a pack with nothing to draw under a line for each section", () => {
  it("draws no band, no strip and no range label: no strip is taller than its name", () => {
    const { container } = render(<Harness empty />);
    const lines = container.querySelector("[data-stack-lines]") as HTMLElement;
    expect(lines.childElementCount).toBe(0);
    expect(lines.getAttribute("style")).not.toMatch(/padding|margin|height/);
    for (const gone of ["[data-small-plot]", "[data-small-label]", "[data-lane-small]", "[data-rows-small]"]) {
      expect(container.querySelector(gone), gone).toBeNull();
    }
    expect(container.textContent).not.toMatch(/0 to 0/i);
    // The Timeline's own line is still there, with its button.
    expect(foldButton(container)).not.toBeNull();
  });
});

describe("the one line, with no `more`", () => {
  it("draws no stack and keeps the row of B7", () => {
    const { container } = render(<Harness start="line" />);
    expect(stackOf(container)).toBeNull();
    expect(container.querySelector("[data-stack-lines]")).toBeNull();
    const row = foldButton(container).parentElement?.parentElement as HTMLElement;
    expect(row.className).toContain("flex items-center gap-4");
    expect(slider().contains(container.querySelector("[data-case-strip]"))).toBe(true);
  });
});
