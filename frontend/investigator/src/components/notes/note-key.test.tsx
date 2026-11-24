/**
 * The key N on the Timeline's slider (design section 3): `onNote`, no modifier, `aria-keyshortcuts`
 * becomes ", . M N". It is optional like onStep: a shell given no onNote reads and draws as before,
 * and Timeline passes it only while the notes store holds a scenario.
 */
import { afterEach, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Timeline } from "../Timeline";
import { TimelineShell } from "../timeline/TimelineShell";
import { PivotWindowsLayer } from "../pivot/PivotWindowsLayer";
import { usePlayhead } from "../../store/playhead";
import { useNotesStore } from "../../store/notes";
import { usePivotStore } from "../../store/pivot";
import { useSelection } from "../../store/selection";
import { useSchema } from "../../store/schema";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import type { ScenarioNode } from "../../lib/scenarios";
import { SCENARIO, fakeBacking } from "./test-support";

const MS0 = Date.parse("2026-06-08T00:00:00-05:00");
const MS1 = Date.parse("2026-06-09T00:00:00-05:00");
const node: ScenarioNode = { kind: "stop", label: "stop", palette: "#7ee787", source: "json", coords: null, timestamp: "at", primary: "${id}" };
const stop = manifestRowToEntity(node, { id: "s1", at: new Date(MS0 + 3_600_000).toISOString() });
const track = () => screen.getByRole("slider", { name: "Playhead position" });

function shell(onNote?: () => void) {
  return render(
    <TimelineShell ariaLabel="Playhead position" onStep={() => {}} onNote={onNote}>
      {() => null}
    </TimelineShell>,
  );
}

describe("TimelineShell: the key N", () => {
  beforeEach(() => {
    usePlayhead.setState({ playhead: MS0, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1, isPlaying: false, markA: null, markB: null });
  });

  it("calls onNote on n and N with no modifier, and on nothing else", () => {
    let calls = 0;
    shell(() => (calls += 1));
    fireEvent.keyDown(track(), { key: "n" });
    fireEvent.keyDown(track(), { key: "N" });
    expect(calls).toBe(2);
    fireEvent.keyDown(track(), { key: "n", ctrlKey: true });
    fireEvent.keyDown(track(), { key: "n", metaKey: true });
    fireEvent.keyDown(track(), { key: "n", altKey: true });
    fireEvent.keyDown(track(), { key: "x" });
    expect(calls).toBe(2);
  });

  it("names the key for assistive technology only when it is given", () => {
    const { unmount } = shell(() => {});
    expect(track().getAttribute("aria-keyshortcuts")).toBe(", . M N");
    unmount();
    shell();
    expect(track().getAttribute("aria-keyshortcuts")).toBe(", . M");
  });

  it("without onNote the key does nothing", () => {
    shell();
    fireEvent.keyDown(track(), { key: "n" });
    expect(usePivotStore.getState().windows).toHaveLength(0);
  });
});

describe("Timeline: N opens a draft at the playhead", () => {
  beforeEach(() => {
    usePlayhead.setState({ playhead: MS0 + 1234.56, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1, isPlaying: false, markA: null, markB: null });
    useSchema.setState({ nodes: [node] });
    useSelection.setState({ selected: null });
    usePivotStore.setState({ windows: [], nextZ: 20 });
    useNotesStore.setState({ backing: fakeBacking(), scenario: SCENARIO, notes: [], customCategories: [], skipped: 0, error: null });
  });

  it("opens a draft window at the playhead's time, rounded to a millisecond, with no link when nothing is selected", () => {
    render(<Timeline transactions={[]} genericEntities={[stop]} />);
    expect(track().getAttribute("aria-keyshortcuts")).toBe(", . M N");
    fireEvent.keyDown(track(), { key: "n" });
    const w = usePivotStore.getState().windows;
    expect(w).toHaveLength(1);
    const win = w[0];
    expect(win.kind).toBe("note");
    if (win.kind === "note") {
      expect(win.seed?.time).toBe(Math.round(MS0 + 1234.56));
      expect(win.seed?.scenario).toBe(SCENARIO);
      expect(win.seed?.link).toBeNull();
      expect(win.noteId).toBeNull();
    }
  });

  it("links the note to the selected record", () => {
    useSelection.setState({ selected: { kind: "entity", entity: stop } });
    render(<Timeline transactions={[]} genericEntities={[stop]} />);
    fireEvent.keyDown(track(), { key: "n" });
    const win = usePivotStore.getState().windows[0];
    expect(win.kind === "note" && win.seed?.link).toEqual({ kind: "stop", id: "s1" });
  });

  it("a selected note is never a link target", () => {
    const noteEntity = { ...stop, id: "note-0123456789abcdef0123456789abcdef", kind: "note" };
    useSelection.setState({ selected: { kind: "entity", entity: noteEntity } });
    render(<Timeline transactions={[]} genericEntities={[stop]} />);
    fireEvent.keyDown(track(), { key: "n" });
    const win = usePivotStore.getState().windows[0];
    expect(win.kind === "note" && win.seed?.link).toBeNull();
  });

  describe("the window opens above the playbar, at the playhead's x", () => {
    const rectOf = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) });
    const anchorOf = () => usePivotStore.getState().windows[0]?.anchor;
    // The bottom stack that holds the Timeline: its top (the attribution line and the ticker sit over the
    // Timeline's own box), then the Timeline's box, whose head row (the transport) sits over the track.
    const STACK_TOP = 520;
    const BAR_BOTTOM = 756;
    const W = 300;
    const H = 350;
    /** Renders the bar, fixes the focused track's box, the Timeline's box, its stack's box and the playhead's
     *  place in the window, presses N. */
    function pressN(rect: ReturnType<typeof rectOf>, playhead: number, over: Partial<ReturnType<typeof usePlayhead.getState>> = {}, stackTop = STACK_TOP) {
      usePlayhead.setState({ playhead, ...over });
      const view = render(<Timeline transactions={[]} genericEntities={[stop]} />);
      const root = view.container.querySelector<HTMLElement>("[data-eyes='TIMELINE-ROOT']");
      if (!root || !root.parentElement) throw new Error("no TIMELINE-ROOT");
      root.getBoundingClientRect = () => rectOf(12, stackTop + 20, 1012, BAR_BOTTOM);
      root.parentElement.getBoundingClientRect = () => rectOf(12, stackTop, 1012, BAR_BOTTOM);
      const t = track();
      t.getBoundingClientRect = () => rect;
      t.focus();
      fireEvent.keyDown(t, { key: "n" });
      return view;
    }
    /** The window's box (the anchor and the window's size) and the bar's two boxes, as the page draws them. */
    function boxes() {
      const a = anchorOf();
      if (!a || a.type !== "screen") throw new Error("no screen anchor");
      return { win: rectOf(a.x, a.y, a.x + W, a.y + H), stack: rectOf(12, STACK_TOP, 1012, BAR_BOTTOM), timeline: rectOf(12, STACK_TOP + 20, 1012, BAR_BOTTOM) };
    }
    const meets = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

    it("at the playhead's place along the track, 8 px over the top of the bar's stack", () => {
      pressN(rectOf(100, 640, 900, 680), MS0 + 43_200_000);
      expect(anchorOf()).toEqual({ type: "screen", x: 500, y: STACK_TOP - 8 - H });
    });

    it("with the playhead at the track's right end, the window and the bar do not meet and the window's foot is 8 px over the bar", () => {
      pressN(rectOf(100, 640, 1000, 680), MS1);
      const { win, stack, timeline } = boxes();
      expect(meets(win, stack)).toBe(false);
      expect(meets(win, timeline)).toBe(false);
      expect(win.bottom).toBeLessThanOrEqual(STACK_TOP - 8);
    });

    it("with the playhead at the track's left end, the window and the bar do not meet and the window's foot is 8 px over the bar", () => {
      pressN(rectOf(100, 640, 1000, 680), MS0);
      const { win, stack, timeline } = boxes();
      expect(anchorOf()).toEqual({ type: "screen", x: 100, y: STACK_TOP - 8 - H });
      expect(meets(win, stack)).toBe(false);
      expect(meets(win, timeline)).toBe(false);
      expect(win.bottom).toBeLessThanOrEqual(STACK_TOP - 8);
    });

    it("clamped 8 px inside the screen at the track's end, it still stands clear over the bar", () => {
      pressN(rectOf(700, 640, 1500, 680), MS1);
      expect(anchorOf()).toEqual({ type: "screen", x: window.innerWidth - 300 - 8, y: STACK_TOP - 8 - H });
      const { win, stack, timeline } = boxes();
      expect(meets(win, stack)).toBe(false);
      expect(meets(win, timeline)).toBe(false);
      expect(win.bottom).toBeLessThanOrEqual(STACK_TOP - 8);
    });

    it("with no room over the bar the window takes the screen's top edge, never a place under the bar's top", () => {
      pressN(rectOf(100, 240, 900, 280), MS0, {}, 150);
      expect(anchorOf()).toEqual({ type: "screen", x: 100, y: 8 });
    });

    it("a window with no span puts the window at the track's left, never at NaN", () => {
      pressN(rectOf(100, 640, 900, 680), MS0, { windowMin: MS0, windowMax: MS0 });
      expect(anchorOf()).toEqual({ type: "screen", x: 100, y: STACK_TOP - 8 - H });
    });

    it("keeps the playhead's time and the selection's link, and moves nothing", () => {
      useSelection.setState({ selected: { kind: "entity", entity: stop } });
      pressN(rectOf(100, 640, 900, 680), MS0 + 43_200_000);
      const win = usePivotStore.getState().windows[0];
      expect(win.kind === "note" && win.seed).toEqual({ scenario: SCENARIO, time: MS0 + 43_200_000, link: { kind: "stop", id: "s1" } });
      expect(usePlayhead.getState().playhead).toBe(MS0 + 43_200_000);
    });

    it("with focus on the page and not on the track, the window takes the store's own first place", () => {
      render(<Timeline transactions={[]} genericEntities={[stop]} />);
      (document.activeElement as HTMLElement | null)?.blur();
      fireEvent.keyDown(track(), { key: "n" });
      expect(anchorOf()).toEqual({ type: "screen", x: 120, y: 80 });
    });

    it("a note linked to the selected record closes on its first Save and focus returns to the track", async () => {
      useSelection.setState({ selected: { kind: "entity", entity: stop } });
      const context = { transactions: [], logins: [], places: [], entities: [stop] };
      pressN(rectOf(100, 640, 900, 680), MS0 + 43_200_000);
      render(<PivotWindowsLayer map={null} decisions={[]} context={context} />);
      expect(usePivotStore.getState().windows).toHaveLength(1);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save the note." }));
      });
      expect(usePivotStore.getState().windows).toHaveLength(0);
      expect(useNotesStore.getState().notes).toHaveLength(1);
      expect(document.activeElement).toBe(track());
    });

    it("a note with no record closes on its first Save too, stored once, and focus returns to the track", async () => {
      const context = { transactions: [], logins: [], places: [], entities: [stop] };
      pressN(rectOf(100, 640, 900, 680), MS0 + 43_200_000);
      const win = usePivotStore.getState().windows[0];
      expect(win.kind === "note" && win.seed?.link).toBeNull();
      render(<PivotWindowsLayer map={null} decisions={[]} context={context} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save the note." }));
      });
      expect(usePivotStore.getState().windows).toHaveLength(0);
      expect(useNotesStore.getState().notes).toHaveLength(1);
      expect(useNotesStore.getState().notes[0].link).toBeNull();
      expect(document.activeElement).toBe(track());
    });

    it("a Save the backend refuses keeps the window and moves no focus", async () => {
      const context = { transactions: [], logins: [], places: [], entities: [stop] };
      pressN(rectOf(100, 640, 900, 680), MS0 + 43_200_000);
      render(<PivotWindowsLayer map={null} decisions={[]} context={context} />);
      useNotesStore.setState({ backing: { ...fakeBacking(), create: async () => { throw new Error("down"); } } });
      (document.activeElement as HTMLElement | null)?.blur();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save the note." }));
      });
      expect(usePivotStore.getState().windows).toHaveLength(1);
      expect(useNotesStore.getState().notes).toEqual([]);
      expect(document.activeElement).not.toBe(track());
    });
  });

  // The no-room rule decides from the RAW room over the bar (the bar's top, less 8, less the window's
  // height: under 8 means no room), not from the clamped y, which on a short screen can land the window on the bar.
  describe("no room over the bar is read from the raw room, not the clamped place", () => {
    const rectOf = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) });
    const H = 350;
    const heightWas = window.innerHeight;
    const setViewportHeight = (h: number): void => {
      Object.defineProperty(window, "innerHeight", { value: h, configurable: true, writable: true });
    };
    afterEach(() => setViewportHeight(heightWas));

    /** The bar's top is `barTop` (the stack's box); the track sits 36 px below it. Presses N on the focused track. */
    function pressNWithBarAt(barTop: number) {
      usePlayhead.setState({ playhead: MS0 });
      const view = render(<Timeline transactions={[]} genericEntities={[stop]} />);
      const root = view.container.querySelector<HTMLElement>("[data-eyes='TIMELINE-ROOT']");
      if (!root || !root.parentElement) throw new Error("no TIMELINE-ROOT");
      root.getBoundingClientRect = () => rectOf(12, barTop + 20, 1012, barTop + 236);
      root.parentElement.getBoundingClientRect = () => rectOf(12, barTop, 1012, barTop + 236);
      const t = track();
      t.getBoundingClientRect = () => rectOf(100, barTop + 36, 900, barTop + 76);
      t.focus();
      fireEvent.keyDown(t, { key: "n" });
      const a = usePivotStore.getState().windows[0]?.anchor;
      if (!a || a.type !== "screen") throw new Error("no screen anchor");
      return a;
    }

    it("viewport 600 high, bar top 364, window 350 high: the window takes y 8, ends at 358 and clears the bar", () => {
      setViewportHeight(600);
      const a = pressNWithBarAt(364);
      expect(a).toEqual({ type: "screen", x: 100, y: 8 });
      expect(a.y + H).toBe(358);
      expect(a.y + H).toBeLessThanOrEqual(364);
    });

    it("a bar whose room over it is 7 px short of the window's height still takes y 8", () => {
      setViewportHeight(900);
      expect(pressNWithBarAt(365)).toEqual({ type: "screen", x: 100, y: 8 });
    });

    it("with room, the place does not change: the foot 8 px over the bar", () => {
      setViewportHeight(900);
      expect(pressNWithBarAt(520)).toEqual({ type: "screen", x: 100, y: 520 - 8 - H });
    });

    it("with exactly 8 px of room left over the window, the window stands over the bar at y 8", () => {
      setViewportHeight(900);
      expect(pressNWithBarAt(366)).toEqual({ type: "screen", x: 100, y: 8 });
    });
  });

  it("does not offer the key while the notes store holds no scenario", () => {
    useNotesStore.setState({ scenario: null });
    render(<Timeline transactions={[]} genericEntities={[stop]} />);
    expect(track().getAttribute("aria-keyshortcuts")).toBe(", . M");
    fireEvent.keyDown(track(), { key: "n" });
    expect(usePivotStore.getState().windows).toHaveLength(0);
  });

  it("notes stay out of the events: a saved note adds no dot and no step", () => {
    useNotesStore.setState({
      notes: [{ id: "note-0123456789abcdef0123456789abcdef", scenario: SCENARIO, seq: 1, time: MS0 + 7_200_000, link: null, colour: "r1", category: "Note", decision: "none", body: { v: 1, content: [] } }],
    });
    const { container } = render(<Timeline transactions={[]} genericEntities={[stop]} />);
    expect(container.querySelectorAll("[data-node-kind]")).toHaveLength(1);
    fireEvent.keyDown(track(), { key: "." });
    const sel = useSelection.getState().selected;
    expect(sel && sel.kind === "entity" && sel.entity.id).toBe("s1");
    fireEvent.keyDown(track(), { key: "." });
    expect(useSelection.getState().selected && (useSelection.getState().selected as { entity: { id: string } }).entity.id).toBe("s1");
  });
});
