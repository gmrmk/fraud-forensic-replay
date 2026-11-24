// frontend/investigator/src/components/timeline/LaneLines.test.tsx
// The lane opens into lines. The fixtures are generic: no
// kind, field or word of one pack lives here, and the field's label comes in as a prop.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LaneLines, type LaneLinesProps } from "./LaneLines";
import { DEPTH_MAX_LINES } from "../../lib/bar-metrics";
import type { Entity } from "../../lib/entity";
import { LANE_LINE_PX, buildLaneLines } from "../../lib/lane-lines";
import { laneBarWords } from "../../lib/tooltip-words/lane";
import { LANE_PLOT_PX, buildDeclaredLane, type LaneDeclaration, type LaneModel } from "../../lib/timeline-lanes";
import { makeProjector } from "../../lib/timeline-projector";
import { usePlayhead } from "../../store/playhead";

vi.mock("../../lib/tooltip-words/lane", async (original) => {
  const real = await original<typeof import("../../lib/tooltip-words/lane")>();
  return { ...real, laneBarWords: vi.fn(real.laneBarWords) };
});

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 5);
const HOURS = 100;

const DECL: LaneDeclaration = {
  id: "freight",
  name: "Freight",
  label: "Weight",
  unit: "kg",
  kinds: ["shipment"],
  field: "weight",
  bucket: "hour",
  aggregate: "sum",
  palette: "#3366cc",
};
const SPLIT = "carrier_code";
const FIELD_LABEL = "Carrier";

let serial = 0;
const row = (hour: number, weight: number, carrier: string): Entity => ({
  id: `r${serial++}`,
  kind: "shipment",
  timestamp: T0 + hour * HOUR,
  coords: null,
  fields: { weight, [SPLIT]: carrier },
  displayMetadata: { primaryLabel: "", secondaryLabel: "", paletteKind: "shipment", pivotableFields: [] },
});

/** Carriers across the whole window: the first has a bar in every hour, the others in some. */
const rowsFor = (carriers: readonly string[]): Entity[] =>
  Array.from({ length: HOURS }, (_, h) => carriers.flatMap((c, i) => (h % (i + 1) === 0 ? [row(h, 10 * (i + 1) + (h % 7), c)] : []))).flat();

const SIX = ["C-ALFA", "C-BRAVO", "C-CHARLIE", "C-DELTA", "C-ECHO", "C-FOXTROT"];
const EIGHT = [...SIX, "C-GOLF", "C-HOTEL"];

const modelOf = (carriers: readonly string[]) => {
  const entities = rowsFor(carriers);
  const lane = buildDeclaredLane(entities, DECL);
  if (!lane) throw new Error("fixture lane is empty");
  return { lane, lines: buildLaneLines(entities, DECL, SPLIT, lane) };
};

const project = makeProjector(T0, T0 + HOURS * HOUR);

const props = (carriers: readonly string[] = SIX, extra: Partial<LaneLinesProps> = {}): LaneLinesProps => {
  const { lane, lines } = modelOf(carriers);
  return {
    lane,
    lines,
    fieldLabel: FIELD_LABEL,
    slot: { project, onPlotMouseDown: vi.fn() },
    formatTime: (ms: number) => `t${(ms - T0) / HOUR}h`,
    ...extra,
  };
};

const setPlayhead = (ms: number): void => {
  act(() => {
    usePlayhead.setState({ playhead: ms });
  });
};

const toggle = (): HTMLButtonElement => screen.getByRole("button", { name: /Carrier/ });
const block = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector<HTMLElement>("[data-lane-lines-block]");
  if (!el) throw new Error("no block");
  return el;
};

beforeEach(() => {
  usePlayhead.setState({ playhead: T0 });
  vi.mocked(laneBarWords).mockClear();
});

describe("the closed triangle", () => {
  it("is closed until it is pressed, and takes no room", () => {
    const { container } = render(<LaneLines {...props()} />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(block(container).hidden).toBe(true);
    expect(container.querySelectorAll("[data-lane-line-plot]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-lane-line-row]")).toHaveLength(0);
  });

  it("reads the field's label in its text and its accessible name, and the count, not only a count", () => {
    const { container } = render(<LaneLines {...props()} />);
    const button = toggle();
    const text = (button.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Carrier");
    expect(text).toContain("6");
    expect(text).toContain("Weight");
    // The name the button has from its content holds the label and the count.
    const named = screen.getByRole("button", { name: /Weight\s+By Carrier\s+·\s+6/ });
    expect(named).toBe(button);
    expect(container.querySelector("[data-lane-lines-count]")?.textContent).toBe("6");
  });

  it("names the block it controls, and that element is in the document while closed", () => {
    const { container } = render(<LaneLines {...props()} />);
    const id = toggle().getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(container.ownerDocument.getElementById(id as string)).toBe(block(container));
  });

  it("carries a tooltip that says what the lines are and what a press does", () => {
    render(<LaneLines {...props()} />);
    const tip = toggle().getAttribute("data-tip") ?? "";
    expect(tip).toContain("Each line shows one Carrier.");
    expect(tip).toContain("Press to open the lines.");
  });

  it("sits in the name column, beside the lane's plot, and moves nothing", () => {
    const { container } = render(<LaneLines {...props(SIX, { inset: 148 })} />);
    const button = toggle();
    expect(button.style.position).toBe("absolute");
    expect(button.style.width).toBe("148px");
    expect(button.style.top).toBe(`-${LANE_PLOT_PX + 1}px`);
    // The root takes no height of its own while the block is hidden.
    expect(container.querySelector<HTMLElement>("[data-lane-lines]")?.style.height).toBe("0px");
  });
});

describe("the open lines", () => {
  it("opens when pressed, with one line for each value, busiest first, named by the value", () => {
    const { container } = render(<LaneLines {...props()} />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(block(container).hidden).toBe(false);
    const rows = [...container.querySelectorAll<HTMLElement>("[data-lane-line-row]")];
    expect(rows).toHaveLength(6);
    const { lines } = modelOf(SIX);
    expect(rows.map((r) => r.getAttribute("data-lane-line-row"))).toEqual(lines.map((l) => l.key));
    expect(rows.map((r) => r.querySelector("[data-lane-line-name]")?.textContent)).toEqual(lines.map((l) => l.name));
    expect(toggle().getAttribute("data-tip")).toContain("Press to fold the lines.");
  });

  it("draws each line's plot with the lane-line selector and none with the lane's own", () => {
    const { container } = render(<LaneLines {...props()} />);
    fireEvent.click(toggle());
    expect(container.querySelectorAll("[data-lane-line-plot]")).toHaveLength(6);
    expect(container.querySelectorAll("[data-magnitude-plot]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-lane-line]")).toHaveLength(0);
  });

  it("draws no measure line: the block holds the lines of one field alone", () => {
    const { container } = render(<LaneLines {...props()} />);
    fireEvent.click(toggle());
    expect(container.querySelectorAll("[data-lane-line-row]")).toHaveLength(6);
    expect(block(container).getAttribute("aria-label")).toBe("Weight by Carrier");
  });

  it("shows six lines and scrolls beyond them, and the header says eight", () => {
    const { container } = render(<LaneLines {...props(EIGHT)} />);
    expect(toggle().textContent).toContain("8");
    fireEvent.click(toggle());
    const el = block(container);
    expect(container.querySelectorAll("[data-lane-line-row]")).toHaveLength(8);
    expect(el.style.maxHeight).toBe(`${DEPTH_MAX_LINES * LANE_LINE_PX}px`);
    expect(el.style.overflowY).toBe("auto");
    expect(toggle().getAttribute("data-tip")).toContain("Scroll to show the other lines.");
  });

  it("does not open forty lines' worth of height", () => {
    const forty = Array.from({ length: 40 }, (_, i) => `C-${String(i).padStart(2, "0")}`);
    const { container } = render(<LaneLines {...props(forty)} />);
    fireEvent.click(toggle());
    expect(block(container).style.maxHeight).toBe(`${DEPTH_MAX_LINES * LANE_LINE_PX}px`);
    expect(toggle().textContent).toContain("40");
  });

  it("gives each line's name its whole name in a tooltip, and its bars their words", () => {
    const { container } = render(<LaneLines {...props()} />);
    fireEvent.click(toggle());
    const first = container.querySelector<HTMLElement>("[data-lane-line-name]");
    expect(first?.getAttribute("data-tip")).toContain("C-ALFA");
    expect(first?.getAttribute("data-tip")).toContain("Carrier");
    const bucket = container.querySelector<HTMLElement>("[data-lane-line-plot] [data-line-bucket]");
    expect(bucket?.getAttribute("data-tip")).toContain("C-ALFA");
  });

  it("gives each line's plot a spoken label that starts with the line's name", () => {
    const { container } = render(<LaneLines {...props()} />);
    fireEvent.click(toggle());
    const plot = container.querySelector<HTMLElement>("[data-lane-line-plot]");
    expect(plot?.getAttribute("role")).toBe("img");
    expect(plot?.getAttribute("aria-label")).toMatch(/^C-ALFA Weight: /);
  });

  it("says in the tooltip that a soloed row's lines are that row's alone", () => {
    render(<LaneLines {...props(SIX, { whose: "Acme Co" })} />);
    expect(toggle().getAttribute("data-tip")).toContain("The lines show Acme Co alone.");
  });
});

describe("the open state", () => {
  it("is held by the caller when the caller gives it, and reported when a press asks to change it", () => {
    const onOpenChange = vi.fn();
    const { container, rerender } = render(<LaneLines {...props(SIX, { open: false, onOpenChange })} />);
    fireEvent.click(toggle());
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // The caller has not changed it, so the block stays closed.
    expect(block(container).hidden).toBe(true);
    rerender(<LaneLines {...props(SIX, { open: true, onOpenChange })} />);
    expect(block(container).hidden).toBe(false);
    fireEvent.click(toggle());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("draws the one fold mark, closed then open, and prints no triangle character as text", () => {
    render(<LaneLines {...props()} />);
    const mark = (): string | null => toggle().querySelector("[data-fold-mark]")?.getAttribute("data-fold-mark") ?? null;
    const visible = (): string => {
      const copy = toggle().cloneNode(true) as HTMLElement;
      copy.querySelectorAll("[data-fold-mark]").forEach((n) => n.remove());
      return copy.textContent ?? "";
    };
    expect(mark()).toBe("closed");
    for (const t of [String.fromCodePoint(0x25b8), String.fromCodePoint(0x25be)]) expect(visible()).not.toContain(t);
    fireEvent.click(toggle());
    expect(mark()).toBe("open");
    for (const t of [String.fromCodePoint(0x25b8), String.fromCodePoint(0x25be)]) expect(visible()).not.toContain(t);
  });

  it("is operable from the keyboard: the control is a button, in the Tab order", () => {
    render(<LaneLines {...props()} />);
    const button = toggle();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    // No tabindex attribute and not disabled: a button is in the Tab order by itself.
    expect(button.hasAttribute("tabindex")).toBe(false);
    expect(button.disabled).toBe(false);
  });
});

describe("the number on a lane line (call 18)", () => {
  // The first carrier has a bar in every hour, so its line has a figure wherever the playhead is.
  const figure = (container: HTMLElement): HTMLElement => {
    const el = container.querySelector<HTMLElement>("[data-lane-figure^='freight/C-ALFA']");
    if (!el) throw new Error("no figure");
    return el;
  };

  it("stands right of the line in the first half of its hour, left in the second half", () => {
    const { container } = render(<LaneLines {...props(SIX, { plotPx: 1000 })} />);
    fireEvent.click(toggle());
    for (const [fraction, side] of [
      [0.25, "right"],
      [0.5, "left"],
      [0.75, "left"],
    ] as const) {
      setPlayhead(T0 + 10 * HOUR + fraction * HOUR);
      expect(figure(container).getAttribute("data-side"), String(fraction)).toBe(side);
    }
  });

  it("stands left near the plot's right end, where its width would pass it", () => {
    const { container } = render(<LaneLines {...props(SIX, { plotPx: 1000 })} />);
    fireEvent.click(toggle());
    setPlayhead(T0 + 99 * HOUR + 0.25 * HOUR);
    expect(figure(container).getAttribute("data-side")).toBe("left");
  });

  it("reads the value of the line's own bar", () => {
    const { container } = render(<LaneLines {...props(SIX, { plotPx: 1000 })} />);
    fireEvent.click(toggle());
    setPlayhead(T0 + 10 * HOUR + 0.25 * HOUR);
    const { lines } = modelOf(SIX);
    const bar = lines[0].lane.bars.find((b) => b.t === T0 + 10 * HOUR);
    expect(Number(figure(container).getAttribute("data-lane-figure-value"))).toBeCloseTo(bar?.value ?? NaN, 2);
  });
});

describe("what is drawn again, and when", () => {
  it("draws no bar again while the playhead advances 60 ticks inside one hour", () => {
    const { container } = render(<LaneLines {...props()} />);
    fireEvent.click(toggle());
    const first = vi.mocked(laneBarWords).mock.calls.length;
    expect(first).toBeGreaterThan(0);
    const before = container.querySelectorAll("[data-line-bucket]").length;
    for (let tick = 1; tick <= 60; tick++) setPlayhead(T0 + 10 * HOUR + (tick * HOUR) / 61);
    expect(vi.mocked(laneBarWords).mock.calls.length).toBe(first);
    expect(container.querySelectorAll("[data-line-bucket]").length).toBe(before);
  });

  it("draws no bar when the block stays closed", () => {
    render(<LaneLines {...props()} />);
    for (let tick = 1; tick <= 5; tick++) setPlayhead(T0 + tick * HOUR);
    expect(vi.mocked(laneBarWords).mock.calls.length).toBe(0);
  });
});

describe("the plot of a line", () => {
  it("passes a press on it to the shell, as the lane's plot does", () => {
    const onPlotMouseDown = vi.fn();
    const { container } = render(<LaneLines {...props(SIX, { slot: { project, onPlotMouseDown } })} />);
    fireEvent.click(toggle());
    fireEvent.mouseDown(container.querySelector("[data-lane-line-plot]") as HTMLElement);
    expect(onPlotMouseDown).toHaveBeenCalledTimes(1);
  });

  it("draws a cut bar with a cap, as the lane does", () => {
    const entities = [...rowsFor(SIX), row(50, 100_000, "C-ALFA")];
    const lane: LaneModel | null = buildDeclaredLane(entities, DECL);
    if (!lane) throw new Error("empty");
    const lines = buildLaneLines(entities, DECL, SPLIT, lane);
    const { container } = render(<LaneLines {...props(SIX, { lane, lines })} />);
    fireEvent.click(toggle());
    expect(container.querySelectorAll("[data-line-bucket][data-cut]").length).toBeGreaterThan(0);
  });
});

describe("what the component reads", () => {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "LaneLines.tsx"), "utf8");

  it("names no pack's field, kind or word, and holds no second clock", () => {
    expect(source).not.toMatch(/ip_asn|credential|org_id|network|spend_usd/i);
    expect(source).not.toMatch(/Date\.now|setInterval|setTimeout|requestAnimationFrame/);
  });

  it("holds no grouping, so the same lines stand under every grouping", () => {
    expect(source).not.toMatch(/track-by|lib\/tracks|useSolo|useSchema/);
  });

  it("uses the lane line selector and leaves the lane check's selector alone", () => {
    expect(source).toContain("data-lane-line-plot");
    expect(source).not.toContain("data-magnitude-plot");
    expect(source).not.toMatch(/data-lane-line(?![-\w])/);
  });
});
