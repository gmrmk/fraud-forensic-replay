// frontend/investigator/src/components/timeline/TimelineShell.kinds.test.tsx
// The shell's `above` slot, which holds the Timeline's own depth: a control on the rail, over the name column, and, once it is open, a line for each kind of
// event between the rail and the track. Closed, nothing moves. Every fixture is written here; the
// token story's 396 and 21 (417 on the rail) are checked on the built site.
import { useMemo, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimelineShell } from "./TimelineShell";
import { KindLines, KindsFold } from "./KindLines";
import { GUTTER, HEAD_RAIL, LINE } from "../../lib/bar-metrics";
import { kindLines, kindsBlockPx, kindsTotal } from "../../lib/kind-lines";
import type { RowTick } from "../../lib/row-ticks";
import type { LanesSlot } from "../../lib/timeline-lanes";
import { usePlayhead } from "../../store/playhead";
import { useClockForm } from "../../store/clock-form";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MIN = Date.parse("2026-05-25T05:00:00Z");
const MAX = MIN + 10 * DAY;
const LABELS: Record<string, string> = { scan: "Parcel scan", key: "Key event" };
const kindLabel = (k: string): string => LABELS[k] ?? k;

let serial = 0;
/** An event `h` hours after the window's start, which is 2 days after the case's. */
const tick = (kind: string, h: number): RowTick => ({
  id: `${kind}-${serial++}`, kind, label: `${kind} ${h}`, secondary: "", facts: [], t: MIN + 2 * DAY + h * HOUR, session: null, challengeVar: null, newDevice: false, blocked: false,
});
const CASE: RowTick[] = [...[1, 2, 3, 4, 5].map((h) => tick("scan", h)), ...[6, 7].map((h) => tick("key", h))];
const ONE_KIND: RowTick[] = [1, 2, 3].map((h) => tick("scan", h));

function setStore(): void {
  usePlayhead.setState({ playhead: MIN + 5 * DAY, minTime: MIN, maxTime: MAX, windowMin: MIN + 2 * DAY, windowMax: MIN + 8 * DAY, isPlaying: false, playbackRate: 1 });
}

interface HarnessProps {
  /** Every event of the case. */
  ticks?: RowTick[];
  /** The set the track draws, when a row is alone. */
  alone?: RowTick[];
  open?: boolean;
  rail?: boolean;
  nameColumn?: boolean;
  onActivate?: (id: string) => void;
}

function Harness({ ticks = CASE, alone, open: start = false, rail = true, nameColumn = true, onActivate = () => {} }: HarnessProps) {
  const [open, setOpen] = useState(start);
  const shown = alone ?? ticks;
  const lines = useMemo(() => kindLines(shown, kindLabel, ticks), [shown, ticks]);
  const above =
    lines.length > 0
      ? {
          control: <KindsFold noun="event" count={kindsTotal(lines)} open={open} onToggle={() => setOpen((o) => !o)} listId="kinds-list" soloName={alone ? "Group 2" : null} />,
          lines: open
            ? (slot: LanesSlot) => (
                <KindLines
                  lines={lines}
                  ticks={shown}
                  slot={slot}
                  grids={[]}
                  prominence={0.5}
                  paint={() => "#3366cc"}
                  onPanel={() => "#3366cc"}
                  kindFor={(k) => k}
                  kindLabel={kindLabel}
                  onActivate={onActivate}
                  listId="kinds-list"
                  noun="event"
                  soloName={alone ? "Group 2" : null}
                />
              )
            : undefined,
          height: open ? kindsBlockPx(lines.length) : 0,
        }
      : undefined;
  return (
    <TimelineShell
      readout={<span>readout</span>}
      formatValueText={() => "spoken"}
      onStep={() => {}}
      nameColumn={nameColumn}
      rail={rail ? () => <div data-testid="rail" /> : undefined}
      corner={<button type="button" data-testid="corner">rows</button>}
      lanes={() => <div data-testid="a-lane" />}
      above={above}
    >
      {() => (
        <>
          {shown.map((t) => (
            <button key={t.id} type="button" data-track-node data-id={t.id} aria-label={`Jump to ${t.label}`} />
          ))}
        </>
      )}
    </TimelineShell>
  );
}

const slider = (): HTMLElement => screen.getByRole("slider", { name: "Playhead position" });
const follows = (earlier: Element, later: Element): boolean =>
  (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const control = (c: HTMLElement): HTMLElement => c.querySelector("[data-kinds-fold]") as HTMLElement;
const lineBlock = (c: HTMLElement): HTMLElement | null => c.querySelector("[data-kind-lines]");
const cornerBox = (c: HTMLElement): HTMLElement => c.querySelector("[data-bar-corner]") as HTMLElement;

beforeEach(() => {
  setStore();
  useClockForm.setState({ h24: false });
});

describe("the Timeline's depth, closed", () => {
  it("draws the control on the rail, over the name column, and nothing else, so nothing moves", () => {
    const { container } = render(<Harness />);
    const box = container.querySelector("[data-rail-corner]") as HTMLElement;
    expect(box.contains(control(container))).toBe(true);
    expect(box.style.width).toBe(`${GUTTER}px`);
    expect(box.style.height).toBe(`${HEAD_RAIL}px`);
    expect(box.className).toContain("top-0");
    expect(lineBlock(container)).toBeNull();
    expect(cornerBox(container).style.top).toBe(`${HEAD_RAIL}px`);
    expect(control(container).hasAttribute("aria-controls")).toBe(false);
  });

  it("reads the whole case on the rail with the word Total", () => {
    const { container } = render(<Harness />);
    expect(control(container).textContent).toContain("Total Events: 7");
  });
});

describe("the Timeline's depth, open", () => {
  it("draws a line for each kind between the rail and the track, and moves the corner down by their height", () => {
    const { container } = render(<Harness open />);
    const lines = lineBlock(container) as HTMLElement;
    expect(lines).not.toBeNull();
    expect(follows(screen.getByTestId("rail"), lines)).toBe(true);
    expect(follows(lines, slider())).toBe(true);
    expect(lines.querySelectorAll("[data-kind-line]")).toHaveLength(2);
    expect(cornerBox(container).style.top).toBe(`${HEAD_RAIL + 2 * LINE}px`);
    expect(control(container).getAttribute("aria-controls")).toBe(lines.id);
    expect(document.getElementById(lines.id)).toBe(lines);
  });

  it("opens and folds by a press on the control, and the control keeps the focus", () => {
    const { container } = render(<Harness />);
    const b = control(container);
    b.focus();
    fireEvent.click(b);
    expect(lineBlock(container)).not.toBeNull();
    expect(control(container)).toBe(b);
    expect(document.activeElement).toBe(b);
    fireEvent.click(b);
    expect(lineBlock(container)).toBeNull();
    expect(cornerBox(container).style.top).toBe(`${HEAD_RAIL}px`);
    expect(document.activeElement).toBe(b);
  });

  it("keeps the track, the lane and the hours where they were in the document", () => {
    const { container } = render(<Harness open />);
    expect(follows(slider(), screen.getByTestId("a-lane"))).toBe(true);
    expect(follows(screen.getByTestId("a-lane"), container.querySelector("[data-timeline-axis]") as Element)).toBe(true);
  });
});

describe("the Tab order", () => {
  it("reaches the kinds control before the corner button, and the corner before the track", () => {
    const { container } = render(<Harness open />);
    const corner = screen.getByTestId("corner");
    expect(follows(control(container), corner)).toBe(true);
    expect(follows(corner, slider())).toBe(true);
  });

  it("holds no Tab stop in the lines: every copy is out of the order", () => {
    const { container } = render(<Harness open />);
    const lines = lineBlock(container) as HTMLElement;
    const copies = [...lines.querySelectorAll<HTMLElement>("[data-row-dot]")];
    expect(copies).toHaveLength(7);
    for (const c of copies) {
      expect(c.getAttribute("tabindex")).toBe("-1");
      expect(c.getAttribute("aria-hidden")).toBe("true");
    }
  });
});

describe("a row that is alone", () => {
  it("draws on the lines the set the track draws, and the rail counts that set", () => {
    const alone = CASE.filter((t) => t.kind === "scan").slice(0, 2);
    const clicked: string[] = [];
    const { container } = render(<Harness open alone={alone} onActivate={(id) => clicked.push(id)} />);
    expect(control(container).textContent).toContain("Total Events: 2");
    const lines = lineBlock(container) as HTMLElement;
    expect([...lines.querySelectorAll("[data-kind-count]")].map((c) => c.textContent)).toEqual(["2", "0"]);
    const copies = [...lines.querySelectorAll<HTMLElement>("[data-row-dot]")];
    for (const c of copies) fireEvent.click(c);
    // Every copy is an event the track draws as a node of its own.
    const originals = [...container.querySelectorAll("[data-track-node]")].map((n) => n.getAttribute("data-id"));
    expect(clicked.length).toBe(2);
    for (const id of clicked) expect(originals).toContain(id);
    expect(originals).toHaveLength(2);
  });
});

describe("a pack with one kind", () => {
  it("offers no control and no line, and the corner stands where it did", () => {
    const { container } = render(<Harness ticks={ONE_KIND} />);
    expect(container.querySelector("[data-rail-corner]")).toBeNull();
    expect(container.querySelector("[data-kinds-fold]")).toBeNull();
    expect(lineBlock(container)).toBeNull();
    expect(cornerBox(container).style.top).toBe(`${HEAD_RAIL}px`);
  });
});

describe("the slot needs the rail and the name column", () => {
  it("draws nothing of the depth without a rail", () => {
    const { container } = render(<Harness open rail={false} />);
    expect(container.querySelector("[data-rail-corner]")).toBeNull();
    expect(lineBlock(container)).toBeNull();
    expect(cornerBox(container).style.top).toBe("0px");
  });

  it("draws nothing of the depth without the name column", () => {
    const { container } = render(<Harness open nameColumn={false} />);
    expect(container.querySelector("[data-rail-corner]")).toBeNull();
    expect(lineBlock(container)).toBeNull();
  });
});

describe("the shell with no depth", () => {
  it("draws no rail corner and no lines, and the corner stands under the rail", () => {
    const { container } = render(
      <TimelineShell nameColumn rail={() => <div data-testid="rail" />} corner={<span />} formatValueText={() => "spoken"} onStep={() => {}}>
        {() => <i />}
      </TimelineShell>,
    );
    expect(container.querySelector("[data-rail-corner]")).toBeNull();
    expect(cornerBox(container).style.top).toBe(`${HEAD_RAIL}px`);
  });
});
