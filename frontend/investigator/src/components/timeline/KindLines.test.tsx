// frontend/investigator/src/components/timeline/KindLines.test.tsx
// The Timeline's kind lines and the control that opens them. Every fixture is written here: a pack
// of generic kinds, one of them labelled "Fraud", which is printed as it is. jsdom draws no layout,
// so only the DOM is read; the heights and the screen's look need a manual check on the built site.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { KindLines, KindsFold } from "./KindLines";
import { DEPTH_MAX_LINES, GUTTER, LINE } from "../../lib/bar-metrics";
import { kindLines, kindsTotal, type KindLine } from "../../lib/kind-lines";
import type { RowTick } from "../../lib/row-ticks";
import { makeProjector } from "../../lib/timeline-projector";
import type { LanesSlot } from "../../lib/timeline-lanes";
import { kindLineWords, kindsFoldName, kindsFoldWords, kindsGroupName, totalLabel, totalText } from "../../lib/tooltip-words/kinds";
import { useClockForm } from "../../store/clock-form";
import { usePlayhead } from "../../store/playhead";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 5);
const NOUN = "event";
const LABELS: Record<string, string> = { scan: "Parcel scan", key: "Key event", flag: "Fraud" };
const kindLabel = (kind: string): string => LABELS[kind] ?? kind;

let serial = 0;
/** An event at hour `h` after T0. */
const tick = (kind: string, h: number): RowTick => ({
  id: `${kind}-${serial++}`, kind, label: `${kind} ${h}`, secondary: "", facts: [], t: T0 + h * HOUR, session: null, challengeVar: null, newDevice: false, blocked: false,
});

// The window runs from hour 10 to hour 30. Hours 2 and 3 lie outside it.
const SCANS = [2, 11, 12, 13, 14].map((h) => tick("scan", h));
const KEYS = [3, 20].map((h) => tick("key", h));
const FLAGS = [15, 16].map((h) => tick("flag", h));
const CASE: RowTick[] = [...SCANS, ...KEYS, ...FLAGS];

const project = makeProjector(T0 + 10 * HOUR, T0 + 30 * HOUR);
const grids = [{ step: HOUR, firstBucketStart: T0 }];

interface Opts {
  ticks?: RowTick[];
  lines?: KindLine[];
  soloName?: string | null;
  onActivate?: (id: string) => void;
}

function mount(o: Opts = {}) {
  const ticks = o.ticks ?? CASE;
  const lines = o.lines ?? kindLines(ticks, kindLabel, CASE);
  const slot: LanesSlot = { project, onPlotMouseDown: vi.fn() };
  const onActivate = o.onActivate ?? vi.fn();
  const view = render(
    <KindLines
      lines={lines}
      ticks={ticks}
      slot={slot}
      grids={grids}
      prominence={0.5}
      paint={() => "#3366cc"}
      onPanel={() => "#3366cc"}
      kindFor={(k) => k}
      kindLabel={kindLabel}
      onActivate={onActivate}
      listId="kinds-list"
      noun={NOUN}
      soloName={o.soloName ?? null}
    />,
  );
  const names = () => [...view.container.querySelectorAll<HTMLElement>("[data-kind-name]")];
  const copies = (c: ParentNode = view.container) => [...c.querySelectorAll<HTMLElement>("[data-row-dot]")];
  return { ...view, lines, slot, onActivate, names, copies };
}

beforeEach(() => {
  usePlayhead.setState({ playhead: T0 + 12 * HOUR, minTime: T0, maxTime: T0 + 40 * HOUR, isPlaying: false });
  useClockForm.setState({ h24: false });
});

describe("KindLines", () => {
  it("draws one line for each kind, the kind with the most events first, named by the manifest's label unchanged", () => {
    const { container } = mount();
    const rows = [...container.querySelectorAll<HTMLElement>("[data-kind-line]")];
    expect(rows.map((r) => r.getAttribute("data-kind-line"))).toEqual(["scan", "flag", "key"]);
    expect(rows.map((r) => r.querySelector("[data-kind-label]")?.textContent)).toEqual(["Parcel scan", "Fraud", "Key event"]);
  });

  it("prints each line's count as text, so no fact lives in a tooltip alone", () => {
    const { container } = mount();
    const counts = [...container.querySelectorAll("[data-kind-count]")].map((c) => c.textContent);
    expect(counts).toEqual(["5", "2", "2"]);
  });

  it("is a list named for what it holds, with the id the control names", () => {
    const { container } = mount();
    const list = container.querySelector("[role='list']") as HTMLElement;
    expect(list.getAttribute("aria-label")).toBe(kindsGroupName(NOUN));
    expect(container.querySelector("[data-kind-lines]")?.id).toBe("kinds-list");
    expect(list.querySelectorAll("[role='listitem']")).toHaveLength(3);
  });

  it("draws a copy of each event inside the window, in its own line, and none outside it", () => {
    const { container, copies } = mount();
    // Hours 2 and 3 are outside the window: 4 scans, 1 key and 2 flags are inside.
    const sizes = [...container.querySelectorAll("[data-kind-line]")].map((l) => copies(l).length);
    expect(sizes).toEqual([4, 2, 1]);
  });

  it("puts every copy out of the Tab order and out of the screen reader's list", () => {
    const { copies, container } = mount();
    expect(copies().length).toBeGreaterThan(0);
    for (const c of copies()) {
      expect(c.getAttribute("aria-hidden")).toBe("true");
      expect(c.getAttribute("tabindex")).toBe("-1");
      expect(c.hasAttribute("aria-label")).toBe(false);
    }
    expect(container.querySelectorAll("button:not([tabindex='-1'])")).toHaveLength(0);
  });

  it("sends a press on a copy to its record, by the event's id", () => {
    const onActivate = vi.fn();
    const { copies } = mount({ onActivate });
    fireEvent.click(copies()[0]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(CASE.map((t) => t.id)).toContain(onActivate.mock.calls[0][0]);
  });

  it("takes the soloed set: its counts, its copies and no other, with the lines the case has", () => {
    const alone = [...SCANS.slice(1, 3), KEYS[1]];
    const lines = kindLines(alone, kindLabel, CASE);
    const onActivate = vi.fn();
    const { container, copies } = mount({ ticks: alone, lines, soloName: "Group 2", onActivate });
    expect([...container.querySelectorAll("[data-kind-count]")].map((c) => c.textContent)).toEqual(["2", "0", "1"]);
    expect(kindsTotal(lines)).toBe(3);
    const all = copies();
    expect(all).toHaveLength(3);
    for (const c of all) fireEvent.click(c);
    const ids = onActivate.mock.calls.map((c) => c[0]);
    expect(ids.sort()).toEqual(alone.map((t) => t.id).sort());
  });

  it("gives a name cell the tooltip of its kind, with the case's count", () => {
    const { names, lines } = mount();
    const first = names()[0];
    expect(first.getAttribute("data-tip")).toBe(kindLineWords(lines[0].name, lines[0].count, NOUN, null).join("\n"));
    expect(first.getAttribute("data-tip")).toContain("This kind has 5 events in the case.");
  });

  it("says the row's own events in the tooltip while a row is alone", () => {
    const { names } = mount({ soloName: "Group 2" });
    expect(names()[0].getAttribute("data-tip")).toContain("in the row that is alone.");
  });

  it("carries the head's line through the lines, over the plots", () => {
    const { container } = mount();
    const sled = container.querySelector("[data-head-sled]") as HTMLElement;
    expect(sled).not.toBeNull();
    expect(sled.style.left).toBe(`${GUTTER}px`);
  });

  it("draws nothing for no line", () => {
    const { container } = mount({ lines: [] });
    expect(container.firstChild).toBeNull();
  });

  it("shows at most six lines and scrolls beyond them", () => {
    const many: RowTick[] = Array.from({ length: 8 }, (_, i) => tick(`k${i}`, 12 + i));
    const { container } = mount({ ticks: many, lines: kindLines(many, (k) => k, many) });
    expect(container.querySelectorAll("[data-kind-line]")).toHaveLength(8);
    const scroller = container.querySelector("[role='list']") as HTMLElement;
    expect(scroller.style.maxHeight).toBe(`${DEPTH_MAX_LINES * LINE}px`);
    expect(scroller.style.overflowY).toBe("auto");
  });

  it("keeps each line as high as an open row's line of nodes", () => {
    const { container } = mount();
    for (const l of container.querySelectorAll<HTMLElement>("[data-kind-line]")) expect(l.style.height).toBe(`${LINE}px`);
  });

  it("reads no playhead of its own: the head's line is the one part that follows it", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "KindLines.tsx"), "utf8");
    expect(source).not.toMatch(/usePlayhead/);
  });
});

describe("KindsFold", () => {
  function Fold({ open: start = false, count = 417 }: { open?: boolean; count?: number }) {
    const [open, setOpen] = useState(start);
    return (
      <>
        <KindsFold noun={NOUN} count={count} open={open} onToggle={() => setOpen((o) => !o)} listId="kinds-list" soloName={null} />
        {open ? <div id="kinds-list" data-testid="the-list" /> : null}
      </>
    );
  }
  const button = (c: HTMLElement) => c.querySelector("[data-kinds-fold]") as HTMLElement;

  it("reads the whole case with the word Total, in the owner's words", () => {
    const { container } = render(<Fold />);
    expect(button(container).textContent).toContain(totalText(NOUN, 417));
    expect(button(container).textContent).toContain("Total Events: 417");
  });

  it("begins its accessible name with its visible text and says its state and its press", () => {
    const { container } = render(<Fold />);
    expect(button(container).getAttribute("aria-label")).toBe(kindsFoldName(NOUN, 417, false));
    expect(button(container).getAttribute("aria-label")).toMatch(/^Total Events: 417\. It is folded\. Press to open the events by kind\.$/);
    expect(button(container).getAttribute("data-tip")).toBe(kindsFoldWords(NOUN, 417, false, null).join("\n"));
  });

  it("names no region in aria-controls while closed, and the list that is in the document while open", () => {
    const { container, getByTestId } = render(<Fold />);
    expect(button(container).hasAttribute("aria-controls")).toBe(false);
    expect(button(container).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button(container));
    expect(button(container).getAttribute("aria-expanded")).toBe("true");
    const id = button(container).getAttribute("aria-controls") as string;
    expect(document.getElementById(id)).toBe(getByTestId("the-list"));
    expect(button(container).getAttribute("aria-label")).toBe(kindsFoldName(NOUN, 417, true));
  });

  it("draws the one fold mark, closed then open, and never the small version's outline or a text triangle", () => {
    const { container } = render(<Fold />);
    const triangles = [String.fromCodePoint(0x25b8), String.fromCodePoint(0x25be)];
    // The visible text: the control's text with the mark's own (hidden) glyph taken out.
    const visible = (): string => {
      const copy = button(container).cloneNode(true) as HTMLElement;
      copy.querySelectorAll("[data-fold-mark]").forEach((n) => n.remove());
      return copy.textContent ?? "";
    };
    expect(button(container).querySelector("[data-fold-mark]")?.getAttribute("data-fold-mark")).toBe("closed");
    expect(button(container).querySelector("[data-fold-svg]")).toBeNull();
    for (const t of triangles) expect(visible()).not.toContain(t);
    fireEvent.click(button(container));
    expect(button(container).querySelector("[data-fold-mark]")?.getAttribute("data-fold-mark")).toBe("open");
    expect(button(container).querySelector("[data-fold-svg]")).toBeNull();
    for (const t of triangles) expect(visible()).not.toContain(t);
  });

  it("keeps the one focus ring of the bar and keeps the focus on itself through a press", () => {
    const { container } = render(<Fold />);
    const b = button(container);
    expect(b.className).toContain("focus-visible:ring-signal");
    b.focus();
    fireEvent.click(b);
    expect(document.activeElement).toBe(button(container));
  });

  it("reads a count of one in the singular", () => {
    const { container } = render(<Fold count={1} />);
    expect(button(container).textContent).toContain("Total Event: 1");
  });

  it("reads shown over all while the Layers switches hide events, in its text, its name and its tooltip", () => {
    const { container } = render(<KindsFold noun={NOUN} count={19} all={99} open={false} onToggle={() => {}} listId="kinds-list" soloName={null} />);
    // The drawn label has the short form; the name and the tooltip keep the full words.
    expect(button(container).textContent).toContain("Events: 19 / 99");
    expect(button(container).textContent).not.toContain("Total");
    expect(button(container).textContent).toContain(totalLabel(NOUN, 19, 99));
    expect(button(container).getAttribute("aria-label")).toMatch(/^Total Events: 19 \/ 99\. /);
    expect(button(container).getAttribute("data-tip")?.split("\n")[0]).toBe("Total Events: 19 / 99");
    expect(button(container).getAttribute("aria-label")).toBe(kindsFoldName(NOUN, 19, false, 99));
    expect(button(container).getAttribute("data-tip")).toBe(kindsFoldWords(NOUN, 19, false, null, 99).join("\n"));
    expect(button(container).getAttribute("data-tip")).toContain("The Layers menu hides 80 of the 99 events.");
  });

  it("reads today's text when `all` equals the count or is left out", () => {
    const same = render(<KindsFold noun={NOUN} count={19} all={19} open={false} onToggle={() => {}} listId="kinds-list" soloName={null} />);
    expect(button(same.container).textContent).toContain("Total Events: 19");
    expect(button(same.container).textContent).not.toContain("/");
    const { container } = render(<Fold />);
    expect(button(container).getAttribute("data-tip")).not.toContain("The Layers menu");
  });
});

describe("KindLines under the Layers switches", () => {
  it("gives each name cell the words of a kind the switches hide events of, when `hidden` is set", () => {
    const lines = kindLines(CASE, kindLabel, CASE);
    const slot: LanesSlot = { project, onPlotMouseDown: vi.fn() };
    const { container } = render(
      <KindLines
        lines={lines}
        ticks={CASE}
        slot={slot}
        grids={grids}
        prominence={0.5}
        paint={() => "#3366cc"}
        onPanel={() => "#3366cc"}
        kindFor={(k) => k}
        kindLabel={kindLabel}
        onActivate={vi.fn()}
        listId="kinds-list"
        noun={NOUN}
        soloName={null}
        hidden
      />,
    );
    const names = [...container.querySelectorAll<HTMLElement>("[data-kind-name]")];
    expect(names).toHaveLength(lines.length);
    names.forEach((cell, i) => {
      expect(cell.getAttribute("data-tip")).toBe(kindLineWords(lines[i].name, lines[i].count, NOUN, null, true).join("\n"));
      expect(cell.getAttribute("data-tip")).toContain("The track draws");
    });
  });
});
