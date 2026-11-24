/** B7: the case strip, the whole case drawn small in 160 slices, each as high as its count of
 *  events. On its own a press moves the playhead; inside the one line's slider it does not, since
 *  the slider's own handler seeks and keeps the drag. */
import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { CaseStrip } from "./CaseStrip";
import { usePlayhead } from "../../store/playhead";

const MIN = 1_000_000;
const MAX = 2_000_000;

function setStore(playhead = MIN): void {
  usePlayhead.setState({
    playhead,
    minTime: MIN,
    maxTime: MAX,
    windowMin: MIN,
    windowMax: MAX,
    isPlaying: true,
    playbackRate: 1,
  });
}

function mockRect(el: Element, width = 1600): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left: 100, top: 0, right: 100 + width, bottom: 16, width, height: 16, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
}

/** One event in the middle of every slice of the case. */
const everySlice = (): number[] => Array.from({ length: 160 }, (_, i) => MIN + ((i + 0.5) / 160) * (MAX - MIN));

describe("CaseStrip", () => {
  beforeEach(() => setStore());

  it("divides the whole case into 160 slices", () => {
    const { container } = render(<CaseStrip times={everySlice()} />);
    const strip = container.querySelector("[data-case-strip]") as HTMLElement;
    expect(strip.getAttribute("data-slices")).toBe("160");
    expect(container.querySelectorAll("[data-case-slice]")).toHaveLength(160);
  });

  it("draws a slice as high as its count, the busiest to the full height, and none for an empty slice", () => {
    // Three events in the first slice, one in the second, none elsewhere.
    const slice = (MAX - MIN) / 160;
    const times = [MIN + 1, MIN + 2, MIN + 3, MIN + slice + 1];
    const { container } = render(<CaseStrip times={times} />);
    const drawn = [...container.querySelectorAll<HTMLElement>("[data-case-slice]")];
    expect(drawn).toHaveLength(2);
    expect(drawn[0].style.height).toBe("16px");
    expect(drawn[1].style.height).toBe("5px"); // round(1 / 3 * 16)
    expect(drawn[0].getAttribute("data-slice")).toBe("0");
    expect(drawn[1].getAttribute("data-slice")).toBe("1");
  });

  it("gives a non-empty slice at least 1 px, and ignores an event outside the case", () => {
    const times = Array.from({ length: 400 }, (_, i) => MIN + 1 + (i % 2)).concat([MAX - 1, MIN - 5, MAX + 5]);
    const { container } = render(<CaseStrip times={times} />);
    const drawn = [...container.querySelectorAll<HTMLElement>("[data-case-slice]")];
    expect(drawn).toHaveLength(2);
    expect(drawn[1].style.height).toBe("1px");
  });

  it("draws nothing when the case has no span", () => {
    usePlayhead.setState({ minTime: MIN, maxTime: MIN });
    const { container } = render(<CaseStrip times={[MIN]} />);
    expect(container.querySelector("[data-case-strip]")).toBeNull();
  });

  it("hides its drawing from assistive tech: the strip is a picture, and the slider around it speaks", () => {
    const { container } = render(<CaseStrip times={everySlice()} />);
    const strip = container.querySelector("[data-case-strip]") as HTMLElement;
    expect(strip.getAttribute("aria-hidden")).toBe("true");
  });

  it("on its own, a press moves the playhead there and pauses", () => {
    const { container } = render(<CaseStrip times={everySlice()} />);
    const strip = container.querySelector("[data-case-strip]") as HTMLElement;
    mockRect(strip);
    // The middle of the strip is x = 100 + 800.
    fireEvent.mouseDown(strip, { clientX: 900 });
    expect(usePlayhead.getState().playhead).toBe(MIN + 0.5 * (MAX - MIN));
    expect(usePlayhead.getState().isPlaying).toBe(false);
  });

  it("clamps a press past either end to the case", () => {
    const { container } = render(<CaseStrip times={everySlice()} />);
    const strip = container.querySelector("[data-case-strip]") as HTMLElement;
    mockRect(strip);
    fireEvent.mouseDown(strip, { clientX: 5000 });
    expect(usePlayhead.getState().playhead).toBe(MAX);
    fireEvent.mouseDown(strip, { clientX: -50 });
    expect(usePlayhead.getState().playhead).toBe(MIN);
  });

  it("inside a slider (seeks false) a press moves nothing itself and is not stopped", () => {
    let reached = 0;
    const { container } = render(
      <div onMouseDown={() => (reached += 1)}>
        <CaseStrip times={everySlice()} seeks={false} />
      </div>,
    );
    const strip = container.querySelector("[data-case-strip]") as HTMLElement;
    mockRect(strip);
    fireEvent.mouseDown(strip, { clientX: 900 });
    expect(usePlayhead.getState().playhead).toBe(MIN);
    expect(reached).toBe(1); // the slider's own handler still hears it
  });

  it("draws the playhead's line, and no word of its own", () => {
    setStore(MIN + 0.25 * (MAX - MIN));
    const { container } = render(<CaseStrip times={everySlice()} />);
    expect(container.querySelector("[data-head-line]")).not.toBeNull();
    expect(container.textContent).toBe("");
    expect(container.querySelector("[data-tip]")).toBeNull();
  });

  it("moves the line with the playhead and keeps every slice's element", () => {
    const { container } = render(<CaseStrip times={everySlice()} />);
    const before = [...container.querySelectorAll("[data-case-slice]")];
    const lineAt = () => (container.querySelector("[data-head-line]")?.parentElement as HTMLElement).style.transform;
    const first = lineAt();
    act(() => setStore(MIN + 0.75 * (MAX - MIN)));
    expect(lineAt()).not.toBe(first);
    const after = [...container.querySelectorAll("[data-case-slice]")];
    expect(after).toHaveLength(before.length);
    before.forEach((el, i) => expect(after[i]).toBe(el));
  });
});
