/**
 * One Timeline mark, the button alone: its place under the track, its classes, the dimmed and open
 * plate, the press, and that a playhead tick re-renders only a mark whose own state changed. The plate
 * is wrapped in a counting component to read the re-renders; the rest reads the real plate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimelineMark } from "./TimelineMark";
import { GLYPH_ORIGIN_PX, plateWidth, timelineLeft } from "./geometry";

const counts = vi.hoisted(() => ({ plate: 0 }));
vi.mock("./MarkPlate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./MarkPlate")>();
  return {
    MarkPlate: (p: Parameters<typeof actual.MarkPlate>[0]) => {
      counts.plate += 1;
      return actual.MarkPlate(p);
    },
  };
});

type Props = Parameters<typeof TimelineMark>[0];
const NAME = "Open your mark: stop: Corner Store";
const LINES = ["Your mark on stop: Corner Store.", "Time: T", "Notes: 2", "You marked this PASS.", "Pinned."];
const BASE: Props = {
  recordKey: "stop:rec-1",
  pct: 40,
  name: NAME,
  lines: LINES,
  notes: 2,
  disposition: "pass",
  pinned: true,
  dim: false,
  open: false,
  onOpen: () => {},
};

const button = () => screen.getByRole("button", { name: NAME }) as HTMLElement;

describe("TimelineMark", () => {
  beforeEach(() => {
    counts.plate = 0;
  });

  it("is one button with the mark's name and the tooltip lines", () => {
    render(<TimelineMark {...BASE} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(button().getAttribute("data-tip")).toBe(LINES.join("\n"));
  });

  it("hangs under the track at the record's percent, the lens centred on it, held whole inside both ends", () => {
    render(<TimelineMark {...BASE} />);
    const b = button();
    const left = timelineLeft(40, plateWidth({ lens: true, notes: 2, disposition: "pass", pinned: true }));
    // The clamp rides in a custom property: this DOM drops a clamp() written straight to `left`.
    expect(b.style.getPropertyValue("--mark-x")).toBe(left);
    expect(b.style.left).toBe("var(--mark-x)");
    expect(b.style.top).toBe("100%");
    expect(b.style.transform).toBe(`translateX(-${GLYPH_ORIGIN_PX}px)`);
    expect(b.style.paddingTop).toBe("2px");
  });

  it("has a 14 px hit box at least, above the rows at rest and above its neighbours on hover, and a focus ring", () => {
    render(<TimelineMark {...BASE} />);
    const b = button();
    expect(b.style.minWidth).toBe("14px");
    expect(b.style.minHeight).toBe("14px");
    // The stacking is in classes (an inline z-index would beat the hover class).
    expect(b.className).toMatch(/(^|\s)z-\[8\](\s|$)/);
    expect(b.className).toMatch(/(^|\s)hover:z-10(\s|$)/);
    expect(b.style.zIndex).toBe("");
    expect(b.className).toContain("focus-visible:ring-1");
    expect(b.className).toContain("focus-visible:ring-signal");
    expect(b.className).toMatch(/(^|\s)absolute(\s|$)/);
    // The host layer takes no pointer events, so the button takes its own.
    expect(b.className).toMatch(/(^|\s)pointer-events-auto(\s|$)/);
  });

  it("is a flex container with its content at the top, so the plate's top is the button's content top", () => {
    render(<TimelineMark {...BASE} />);
    const cls = button().className.split(/\s+/);
    expect(cls).toContain("flex");
    expect(cls).toContain("items-start");
    expect(cls).not.toContain("block");
  });

  it("leads its plate with the lens and holds the count, the glyph and the pin", () => {
    render(<TimelineMark {...BASE} />);
    const parts = Array.from(button().querySelectorAll("[data-part]")).map((p) => p.getAttribute("data-part"));
    expect(parts).toEqual(["lens", "count", "disposition", "pin"]);
  });

  it("a dim view dims the plate's contents and leaves the pin bright", () => {
    render(<TimelineMark {...BASE} dim />);
    // Each content part dims to its own opacity (mark-ink.ts), not one group opacity of 0.45.
    for (const name of ["lens", "count", "disposition"]) {
      const o = Number((button().querySelector(`[data-part="${name}"]`) as HTMLElement).style.opacity);
      expect(o, name).toBeLessThan(1);
      expect(o, name).toBeGreaterThanOrEqual(0.2);
    }
    const pin = button().querySelector('[data-part="pin"]') as HTMLElement;
    expect(pin.style.opacity).toBe("1");
  });

  it("an open view carries data-open on the button and the plate", () => {
    const { rerender } = render(<TimelineMark {...BASE} />);
    expect(button().getAttribute("data-open")).toBe("false");
    rerender(<TimelineMark {...BASE} open />);
    expect(button().getAttribute("data-open")).toBe("true");
    expect(button().querySelector("[data-mark-plate]")?.getAttribute("data-open")).toBe("true");
  });

  it("a press does not start a scrub of the track under it", () => {
    let down = 0;
    render(
      <div onMouseDown={() => (down += 1)}>
        <TimelineMark {...BASE} />
      </div>,
    );
    fireEvent.mouseDown(button());
    expect(down).toBe(0);
  });

  it("a click opens the record, with the click's x, and goes no further", () => {
    const onOpen = vi.fn();
    let reached = 0;
    render(
      <div onClick={() => (reached += 1)}>
        <TimelineMark {...BASE} onOpen={onOpen} />
      </div>,
    );
    fireEvent.click(button(), { clientX: 321 });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("stop:rec-1", 321);
    expect(reached).toBe(0);
  });

  it("rowPx 30 hangs the button at calc(100% + 30px); no rowPx and rowPx 0 keep top 100%", () => {
    const { rerender } = render(<TimelineMark {...BASE} rowPx={30} />);
    // The DOM may drop a calc() written to `top`: the raw style attribute is the second signal.
    expect(button().style.top === "calc(100% + 30px)" || (button().getAttribute("style") ?? "").includes("calc(100% + 30px)")).toBe(true);
    rerender(<TimelineMark {...BASE} />);
    expect(button().style.top).toBe("100%");
    rerender(<TimelineMark {...BASE} rowPx={0} />);
    expect(button().style.top).toBe("100%");
  });

  it("lifted gives the class z-10 and not z-[8] (whole tokens: hover:z-10 is always there)", () => {
    const { rerender } = render(<TimelineMark {...BASE} />);
    expect(button().className.split(/\s+/)).toContain("z-[8]");
    expect(button().className.split(/\s+/)).not.toContain("z-10");
    rerender(<TimelineMark {...BASE} lifted />);
    expect(button().className.split(/\s+/)).toContain("z-10");
    expect(button().className.split(/\s+/)).not.toContain("z-[8]");
    expect(button().className.split(/\s+/)).toContain("hover:z-10");
  });

  it("re-renders its plate on a new rowPx or lifted, and not otherwise", () => {
    const onOpen = vi.fn();
    const { rerender } = render(<TimelineMark {...BASE} onOpen={onOpen} rowPx={15} lifted />);
    const first = counts.plate;
    rerender(<TimelineMark {...BASE} onOpen={onOpen} rowPx={15} lifted lines={[...LINES]} />);
    expect(counts.plate).toBe(first);
    rerender(<TimelineMark {...BASE} onOpen={onOpen} rowPx={30} lifted />);
    expect(counts.plate).toBeGreaterThan(first);
    const second = counts.plate;
    rerender(<TimelineMark {...BASE} onOpen={onOpen} rowPx={30} />);
    expect(counts.plate).toBeGreaterThan(second);
  });

  it("re-renders its plate only when a drawn value changes: the same lines in a new array do not", () => {
    const onOpen = vi.fn();
    const { rerender } = render(<TimelineMark {...BASE} onOpen={onOpen} />);
    const first = counts.plate;
    expect(first).toBeGreaterThan(0);
    rerender(<TimelineMark {...BASE} onOpen={onOpen} lines={[...LINES]} />);
    expect(counts.plate).toBe(first);
    rerender(<TimelineMark {...BASE} onOpen={onOpen} lines={[...LINES]} dim />);
    expect(counts.plate).toBeGreaterThan(first);
  });
});
