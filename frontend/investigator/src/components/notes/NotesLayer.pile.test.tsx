/**
 * The pile under the Timeline's track, through the layer: marks that touch join one plate, its words and
 * its face, how it unfolds into a column of single plates, what folds it, and the diamond that hangs one
 * row lower where a plate would touch it. The track's width is passed as `trackPx` (the layer's own
 * measure of its host is tested last, with a stubbed host width and observer).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NotesLayer } from "./NotesLayer";
import { lookupFromContext, type RecordLookup } from "./record-lookup";
import type { Entity } from "../../lib/entity";
import { makeProjector } from "../../lib/timeline-projector";
import { usePivotStore } from "../../store/pivot";
import { useNotesStore } from "../../store/notes";
import { usePlayhead } from "../../store/playhead";
import { useSelection } from "../../store/selection";
import { when, when24 } from "../../lib/time-words";
import { useClockForm } from "../../store/clock-form";
import { makeNode, makeNote } from "../../lib/notes/test-fixtures";
import { CONTEXT, NOTE_TIME, RECORD, SCENARIO } from "./test-support";
import { useLayers } from "../../store/layers";
import { useMarksStore } from "../../store/marks";
import { useSchema } from "../../store/schema";
import type { Note } from "../../lib/notes/types";
import type { RecordNode } from "../../lib/marks/types";

// The track's window is the fixtures' own: 6,003,600 ms before the shared note time, and 10,000,000 ms long.
const MIN = NOTE_TIME - 6_003_600;
const MAX = MIN + 10_000_000;
const project = makeProjector(MIN, MAX);

describe("marks close together: one pile under the track", () => {
  /** The multiplication sign, built from its code point (no source file holds it typed). */
  const TIMES = String.fromCharCode(0xd7);
  const TRACK = 1244;
  const PILE_NAME = "Your marks on 3 records. Show each one.";
  const FOLDED_NAME = "Your marks on 3 records. Fold them.";
  const REF = (n: number) => ({ kind: "stop", id: `rec-${n}` });
  /** A timed record, `dt` ms after the fixture's own: on a 1244 px track 8 ms is about a pixel. */
  const entity = (n: number, dt: number, label: string): Entity => ({
    ...RECORD,
    id: `rec-${n}`,
    timestamp: NOTE_TIME + dt,
    displayMetadata: { ...RECORD.displayMetadata, primaryLabel: label },
  });
  // Three records 70 s apart (9 px, then 17 px on the track): their plates touch.
  const E1 = entity(1, 0, "Corner Store");
  const E2 = entity(2, 70_000, "Second Shop");
  const E3 = entity(3, 140_000, "Third Shop");
  const FAR = entity(4, 3_000_000, "Far Depot");
  const UNTIMED: Entity = { ...RECORD, id: "org-1", timestamp: 0 };
  const lookup3 = lookupFromContext({ ...CONTEXT, entities: [E1, E2, E3, UNTIMED] });
  const lookup4 = lookupFromContext({ ...CONTEXT, entities: [E1, E2, E3, FAR, UNTIMED] });
  const NODES: RecordNode[] = [
    makeNode({ record: REF(1), disposition: "pass" }),
    makeNode({ record: REF(2), disposition: "fail" }),
    makeNode({ record: REF(3), disposition: "wait", pinned: true }),
  ];
  const free = (tag: string, dt: number, over: Partial<Note> = {}) =>
    makeNote({ id: `note-${tag}`.padEnd(37, "c"), seq: Number(tag.replace(/\D/g, "")) || 1, time: NOTE_TIME + dt, link: null, ...over });

  function setupPile(over: { nodes?: RecordNode[]; notes?: Note[]; playhead?: number } = {}) {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    usePlayhead.setState({ playhead: over.playhead ?? NOTE_TIME + 1000, minTime: MIN, maxTime: MAX, windowMin: MIN, windowMax: MAX, isPlaying: false });
    useSelection.setState({ selected: null });
    useLayers.setState({ showAuths: true, showLogins: true, showPlaces: false, hiddenKinds: [], hiddenValues: {}, yoursOn: false });
    useSchema.setState({ nodes: [] });
    useClockForm.setState({ h24: false });
    useNotesStore.setState({ scenario: SCENARIO, notes: over.notes ?? [], customCategories: [], skipped: 0, error: null });
    useMarksStore.setState({ scenario: SCENARIO, nodes: over.nodes ?? NODES, paths: [] });
  }
  /** A width of null leaves `trackPx` out, so the layer measures its own host. */
  const drawPile = (lookup: RecordLookup = lookup3, trackPx: number | null = TRACK) =>
    render(<NotesLayer project={project} laneCount={3} lookup={lookup} trackPx={trackPx ?? undefined} />);
  const pileBtn = () => document.querySelector("[data-mark-pile]") as HTMLElement;
  const members = () => Array.from(document.querySelectorAll("button[data-mark]")) as HTMLElement[];
  const partsOf = (b: HTMLElement) => Array.from(b.querySelectorAll("[data-part]")).map((p) => p.getAttribute("data-part"));
  const opacityOf = (b: HTMLElement, part: string) => Number((b.querySelector(`[data-part="${part}"]`) as HTMLElement).style.opacity || "1");
  /** A `top` as written: the DOM may keep a calc() in `style.top` or only in the style attribute. */
  const topOf = (b: HTMLElement): string => b.style.top || /top:\s*([^;]+);/.exec(b.getAttribute("style") ?? "")?.[1].trim() || "";

  beforeEach(() => setupPile());
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
  });

  it("with no trackPx and nothing measured no pile forms: every mark is single, as before", () => {
    drawPile(lookup3, null);
    expect(document.querySelector("[data-mark-pile]")).toBeNull();
    expect(members()).toHaveLength(3);
  });

  it("three touching marks draw one pile button, named for the set, and no single mark buttons", () => {
    drawPile();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    const b = screen.getByRole("button", { name: PILE_NAME });
    expect(b).toBe(pileBtn());
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(members()).toHaveLength(0);
  });

  it("the pile's tip lines are exactly pileTip's for the set: counts, pinned count, the times of the first and last member", () => {
    drawPile();
    expect(pileBtn().getAttribute("data-tip")).toBe(
      [
        "Your marks on 3 records.",
        `Time: ${when(NOTE_TIME)} to ${when(NOTE_TIME + 140_000)}`,
        "You marked PASS: 1",
        "You marked FAIL: 1",
        "You marked WAITING: 1",
        "Pinned: 1",
        "Press to show each one.",
      ].join("\n"),
    );
  });

  it("the tip prints the times in the 24 hour form when the clock is set to it", () => {
    act(() => useClockForm.setState({ h24: true }));
    drawPile();
    expect(pileBtn().getAttribute("data-tip")).toContain(`Time: ${when24(NOTE_TIME)} to ${when24(NOTE_TIME + 140_000)}`);
  });

  it("the pile shows the lens, the sign and 3, each decision's glyph once in order, and a pin", () => {
    drawPile();
    expect(partsOf(pileBtn())).toEqual(["lens", "pile", "disposition", "disposition", "disposition", "pin"]);
    expect(pileBtn().querySelector('[data-part="pile"]')?.textContent).toBe(`${TIMES}3`);
    expect(Array.from(pileBtn().querySelectorAll("[data-disposition]")).map((g) => g.getAttribute("data-disposition"))).toEqual(["pass", "fail", "wait"]);
    expect(pileBtn().querySelector('[data-part="count"]')).toBeNull();
  });

  it("the pile counts records, never notes: a record with several notes still counts once", () => {
    const notes = [1, 2, 3, 4].map((i) => makeNote({ id: `note-n${i}`.padEnd(37, "d"), seq: i, time: NOTE_TIME, link: REF(1) }));
    setupPile({ notes });
    drawPile();
    expect(pileBtn().querySelector('[data-part="pile"]')?.textContent).toBe(`${TIMES}3`);
  });

  it("a press unfolds three member buttons, pinned first then by time, named and worded as a single mark; a second press folds them", () => {
    drawPile();
    fireEvent.click(pileBtn());
    expect(pileBtn().getAttribute("aria-expanded")).toBe("true");
    expect(pileBtn().getAttribute("aria-label")).toBe(FOLDED_NAME);
    const m = members();
    expect(m.map((b) => b.getAttribute("data-mark"))).toEqual(["stop:rec-3", "stop:rec-1", "stop:rec-2"]);
    expect(m[0].getAttribute("aria-label")).toBe("Open your mark: stop: Third Shop");
    expect(m[0].getAttribute("data-tip")).toBe(
      ["Your mark on stop: Third Shop.", `Time: ${when(NOTE_TIME + 140_000)}`, "You marked this WAITING.", "Pinned."].join("\n"),
    );
    expect(m[1].getAttribute("data-tip")).toBe(["Your mark on stop: Corner Store.", `Time: ${when(NOTE_TIME)}`, "You marked this PASS."].join("\n"));
    m.forEach((b, i) => expect(topOf(b)).toBe(`calc(100% + ${15 * (i + 1)}px)`));
    fireEvent.click(pileBtn());
    expect(pileBtn().getAttribute("aria-expanded")).toBe("false");
    expect(members()).toHaveLength(0);
  });

  it("a member press opens one record window for that record, folds the pile, and moves neither playhead nor selection", () => {
    drawPile();
    const before = usePlayhead.getState().playhead;
    fireEvent.click(pileBtn());
    fireEvent.click(screen.getByRole("button", { name: "Open your mark: stop: Second Shop" }), { clientX: 400 });
    const w = usePivotStore.getState().windows;
    expect(w).toHaveLength(1);
    expect(w[0].kind === "record" && w[0].record).toEqual(REF(2));
    expect(pileBtn().getAttribute("aria-expanded")).toBe("false");
    expect(members()).toHaveLength(0);
    expect(usePlayhead.getState().playhead).toBe(before);
    expect(useSelection.getState().selected).toBeNull();
    // Focus is on the pile: the member's button went off the page with the fold.
    expect(document.activeElement).toBe(pileBtn());
  });

  it("a press on the track or on another mark leaves the column open (it folds on a second press or Escape only)", () => {
    setupPile({ nodes: [...NODES, makeNode({ record: REF(4), disposition: "wait" })] });
    let down = 0;
    render(
      <div data-track onMouseDown={() => (down += 1)}>
        <NotesLayer project={project} laneCount={3} lookup={lookup4} trackPx={TRACK} />
      </div>,
    );
    fireEvent.click(pileBtn());
    // The column's three members and the far mark, a single plate of its own.
    expect(members()).toHaveLength(4);
    fireEvent.mouseDown(document.querySelector("[data-track]") as HTMLElement);
    expect(down).toBe(1);
    // Another mark, far from the pile, is a single plate beside the column's members.
    fireEvent.click(screen.getByRole("button", { name: "Open your mark: stop: Far Depot" }));
    expect(pileBtn().getAttribute("aria-expanded")).toBe("true");
    expect(members().filter((b) => b.getAttribute("data-tip")?.includes("Corner Store"))).toHaveLength(1);
    expect(members()).toHaveLength(4);
  });

  it("Escape in the column folds it, aria-expanded turns false and focus returns to the pile", () => {
    drawPile();
    fireEvent.click(pileBtn());
    const first = members()[0];
    first.focus();
    fireEvent.keyDown(first, { key: "Escape" });
    expect(pileBtn().getAttribute("aria-expanded")).toBe("false");
    expect(members()).toHaveLength(0);
    expect(document.activeElement).toBe(pileBtn());
  });

  it("a second press on the pile while focus sits on a member folds it and leaves focus on the pile, not on the page", () => {
    drawPile();
    fireEvent.click(pileBtn());
    const first = members()[0];
    first.focus();
    expect(document.activeElement).toBe(first);
    // A click does not move focus by itself, so focus is still on the member when the press folds the column.
    fireEvent.click(pileBtn());
    expect(pileBtn().getAttribute("aria-expanded")).toBe("false");
    expect(members()).toHaveLength(0);
    expect(document.activeElement).toBe(pileBtn());
  });

  it("in the column a member ahead of the playhead is its own dim plate and a lit member is not", () => {
    drawPile();
    fireEvent.click(pileBtn());
    const byKey = (k: string) => members().find((b) => b.getAttribute("data-mark") === k) as HTMLElement;
    // The playhead is 1 s after the first record: it is reached, the others are ahead.
    expect(opacityOf(byKey("stop:rec-1"), "lens")).toBe(1);
    expect(opacityOf(byKey("stop:rec-2"), "lens")).toBeLessThan(1);
    expect(opacityOf(byKey("stop:rec-3"), "lens")).toBeLessThan(1);
  });

  it("when the playhead passes, the pile stays and its contents follow the dim rule: dim when every member is ahead, lit when one has been reached", () => {
    drawPile();
    act(() => usePlayhead.setState({ playhead: NOTE_TIME - 5000 }));
    expect(opacityOf(pileBtn(), "lens")).toBeLessThan(1);
    expect(opacityOf(pileBtn(), "pile")).toBeLessThan(1);
    // The pin stays bright whatever the contents do.
    expect(opacityOf(pileBtn(), "pin")).toBe(1);
    act(() => usePlayhead.setState({ playhead: NOTE_TIME + 1000 }));
    expect(pileBtn().getAttribute("aria-label")).toBe(PILE_NAME);
    expect(opacityOf(pileBtn(), "lens")).toBe(1);
    expect(opacityOf(pileBtn(), "pile")).toBe(1);
    // The glyph of a decision dims on its own: PASS (the reached record) is lit, FAIL and WAITING are ahead.
    const glyph = (d: string) => Number((pileBtn().querySelector(`[data-disposition="${d}"]`) as HTMLElement).style.opacity || "1");
    expect(glyph("pass")).toBe(1);
    expect(glyph("fail")).toBeLessThan(1);
    expect(glyph("wait")).toBeLessThan(1);
  });

  it("a free note's diamond that the pile would touch hangs at calc(100% + 15px); one clear of it stays at 100%", () => {
    setupPile({ notes: [free("1", 30_000), free("2", 3_000_000)] });
    drawPile();
    const diamonds = Array.from(document.querySelectorAll("[data-note-mark]")) as HTMLElement[];
    const rowOf = (id: string) => topOf(diamonds.find((d) => d.getAttribute("data-note-mark") === id) as HTMLElement);
    expect(rowOf(free("1", 30_000).id)).toBe("calc(100% + 15px)");
    expect(rowOf(free("2", 3_000_000).id)).toBe("100%");
  });

  it("a plain diamond (a linked note whose record has no time) follows the same rule", () => {
    const plainNote = makeNote({ id: "note-p1".padEnd(37, "e"), seq: 9, time: NOTE_TIME + 30_000, link: { kind: "stop", id: "org-1" } });
    setupPile({ notes: [plainNote] });
    drawPile();
    const d = document.querySelector(`[data-note-mark="${plainNote.id}"]`) as HTMLElement;
    expect(topOf(d)).toBe("calc(100% + 15px)");
  });

  it("with no pile a diamond stays in the first row", () => {
    setupPile({ notes: [free("1", 30_000)] });
    drawPile(lookup3, null);
    expect(topOf(document.querySelector("[data-note-mark]") as HTMLElement)).toBe("100%");
  });

  it("the pile goes data-open when a member's window opens, and in the column only that member is open", () => {
    usePivotStore.getState().openRecord(REF(2), { lngLat: null, pinned: false });
    drawPile();
    expect(pileBtn().getAttribute("data-open")).toBe("true");
    fireEvent.click(pileBtn());
    const open = (k: string) => (members().find((b) => b.getAttribute("data-mark") === k) as HTMLElement).getAttribute("data-open");
    expect(open("stop:rec-2")).toBe("true");
    expect(open("stop:rec-1")).toBe("false");
    expect(open("stop:rec-3")).toBe("false");
  });

  it("the column is gone when the pile leaves, and the pile that forms again under the same first mark comes folded", () => {
    drawPile();
    fireEvent.click(pileBtn());
    expect(members()).toHaveLength(3);
    // Two of the three marks go: the first is alone, so there is no pile and no column.
    act(() => useMarksStore.setState({ nodes: [NODES[0]] }));
    expect(document.querySelector("[data-mark-pile]")).toBeNull();
    expect(members().map((b) => b.getAttribute("data-mark"))).toEqual(["stop:rec-1"]);
    // They come back under the same first record, so the same pile key: it is folded, not open again.
    act(() => useMarksStore.setState({ nodes: NODES }));
    expect(pileBtn().getAttribute("aria-expanded")).toBe("false");
    expect(members()).toHaveLength(0);
  });

  it("the DOM keeps time order: a diamond before the pile's first time, the pile, a later diamond", () => {
    setupPile({ notes: [free("2", 600_000), free("1", -300_000)] });
    drawPile();
    const order = Array.from(document.querySelectorAll("button")).map((b) => b.getAttribute("data-mark-pile") ?? b.getAttribute("data-mark") ?? b.getAttribute("data-note-mark"));
    expect(order).toEqual([free("1", -300_000).id, "pile:stop:rec-1", free("2", 600_000).id]);
  });

  it("asks the lookup nothing on a playhead tick with a pile drawn", () => {
    const asked = vi.fn();
    const spy: RecordLookup = (l) => {
      asked();
      return lookup3(l);
    };
    setupPile({ notes: [free("1", 30_000)] });
    render(<NotesLayer project={project} laneCount={3} lookup={spy} trackPx={TRACK} />);
    expect(pileBtn()).not.toBeNull();
    const before = asked.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    act(() => usePlayhead.setState({ playhead: NOTE_TIME + 2000 }));
    act(() => usePlayhead.setState({ playhead: NOTE_TIME - 2000 }));
    expect(asked.mock.calls.length).toBe(before);
    expect(pileBtn()).not.toBeNull();
  });

  /** A host whose clientWidth is `width`, and an observer that reports once when it starts. */
  function stubTrack(width: number) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        cb: () => void;
        constructor(cb: () => void) {
          this.cb = cb;
        }
        observe() {
          this.cb();
        }
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute("data-marks-host") ? width : 0;
      },
    });
  }

  it("the measured width is the host's clientWidth: piles form by 961, and three singles stand on a wide track", () => {
    stubTrack(961);
    const narrow = drawPile(lookup3, null);
    expect(pileBtn().getAttribute("aria-label")).toBe(PILE_NAME);
    narrow.unmount();
    stubTrack(1_000_000);
    drawPile(lookup3, null);
    expect(document.querySelector("[data-mark-pile]")).toBeNull();
    expect(members()).toHaveLength(3);
  });

  it("with no ResizeObserver in the page nothing is measured and no pile forms, whatever the host's width", () => {
    stubTrack(961);
    vi.stubGlobal("ResizeObserver", undefined);
    drawPile(lookup3, null);
    expect(document.querySelector("[data-mark-pile]")).toBeNull();
    expect(members()).toHaveLength(3);
  });

  it("a host that reads no width (0) draws no pile", () => {
    stubTrack(0);
    drawPile(lookup3, null);
    expect(document.querySelector("[data-mark-pile]")).toBeNull();
    expect(members()).toHaveLength(3);
  });
});
