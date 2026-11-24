/**
 * The Timeline layer of marks: a filled diamond with a 1 px panel-base outline, hung under the
 * track's bottom edge at the note's time, in a 14 px hit button; PASS has a check cut out, FAIL a
 * cross. It reads only the notes store, so notes stay out of eventTicks, counts and step keys.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Glyph, NotesLayer } from "./NotesLayer";
import { MARK_PX, HIT_PX, freeNotes, plainNotes } from "./note-marks";
import { lookupFromContext, type RecordLookup } from "./record-lookup";
import { windowPlaceNear } from "./open-note";
import type { Entity } from "../../lib/entity";
import { makeProjector } from "../../lib/timeline-projector";
import { usePivotStore } from "../../store/pivot";
import { useNotesStore } from "../../store/notes";
import { usePlayhead } from "../../store/playhead";
import { useSelection } from "../../store/selection";
import { when } from "../../lib/time-words";
import { bodyOf, makeNode, makeNote } from "../../lib/notes/test-fixtures";
import { TRACK_PX } from "./note-marks";
import { CONTEXT, NOTE_TIME, RECORD, SCENARIO } from "./test-support";
import { useLayers } from "../../store/layers";
import { useMarksStore } from "../../store/marks";
import { useSchema } from "../../store/schema";
import type { Note } from "../../lib/notes/types";
import type { RecordNode } from "../../lib/marks/types";

const MIN = 1763550000000;
const MAX = 1763560000000;
const project = makeProjector(MIN, MAX);
const T1 = 1763555000000;

const n1 = makeNote({ id: "note-1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seq: 1, time: T1, category: "Question", body: bodyOf("Check the terminal."), colour: "r3" });
const n2 = makeNote({ id: "note-2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seq: 2, time: T1 + 600000, decision: "pass", category: "Note" });
const n3 = makeNote({ id: "note-3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seq: 3, time: T1 + 1200000, decision: "fail", category: "Source" });
const outside = makeNote({ id: "note-4aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seq: 4, time: MAX + 5_000_000 });

function setup(notes = [n1, n2, n3, outside]) {
  usePivotStore.setState({ windows: [], nextZ: 20 });
  usePlayhead.setState({ playhead: MIN, isPlaying: true });
  useSelection.setState({ selected: null });
  useNotesStore.setState({ scenario: SCENARIO, notes, customCategories: [], skipped: 0, error: null });
}

describe("NotesLayer", () => {
  beforeEach(() => setup());

  it("draws one hit button for each note inside the window, none outside it", () => {
    render(<NotesLayer project={project} laneCount={3} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("names each mark as the design says (T1) and carries the tooltip lines", () => {
    render(<NotesLayer project={project} laneCount={3} />);
    const b = screen.getByRole("button", { name: `Open note: Question, Check the terminal., ${when(T1)}` });
    expect(b.getAttribute("data-tip")).toBe(["Your note, category Question.", "Check the terminal.", `Time: ${when(T1)}`].join("\n"));
    const pass = screen.getByRole("button", { name: new RegExp(`^Open note: Note, .*${when(n2.time).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
    expect(pass.getAttribute("data-tip")).toContain("You marked this PASS.");
    const fail = screen.getByRole("button", { name: /^Open note: Source,/ });
    expect(fail.getAttribute("data-tip")).toContain("You marked this FAIL.");
  });

  it("the mark is a diamond with a 1 px panel-base outline, in a 14 px hit button, at the note's time", () => {
    render(<NotesLayer project={project} laneCount={3} />);
    const b = screen.getByRole("button", { name: /^Open note: Question/ }) as HTMLElement;
    expect(HIT_PX).toBe(14);
    expect(b.style.width).toBe("14px");
    expect(b.style.height).toBe("14px");
    // A note well inside the case sits at its own percent (the clamp only bites at the two ends).
    expect(b.style.getPropertyValue("--note-x")).toBe(centreCss(project.pct(T1)));
    const sq = b.querySelector("[data-note-square]") as HTMLElement;
    expect(sq.getAttribute("data-note-shape")).toBe("diamond");
    // The same square turned 45 degrees: its turned extent is no larger than the old square's box plus 2 px.
    expect(sq.style.transform).toContain("rotate(45deg)");
    expect(parseFloat(sq.style.width)).toBe(parseFloat(sq.style.height));
    expect(parseFloat(sq.style.width) * Math.SQRT2).toBeLessThanOrEqual(MARK_PX + 2 + 1e-9);
    expect(sq.style.outline || sq.style.boxShadow).toMatch(/1px/);
    expect(sq.getAttribute("style")).toContain("rgb(var(--panel-base))");
    // The fill is the fixed table's value for the note's slot, and nothing else.
    expect(sq.style.background).toBe("var(--r3-on-panel)");
  });

  it("PASS has a check cut out, FAIL a cross, and a note with no mark has neither", () => {
    render(<NotesLayer project={project} laneCount={3} />);
    const glyph = (name: RegExp) => (screen.getByRole("button", { name }) as HTMLElement).querySelector("[data-decision-glyph]")?.getAttribute("data-decision-glyph");
    expect(glyph(/^Open note: Note,/)).toBe("pass");
    expect(glyph(/^Open note: Source,/)).toBe("fail");
    expect(glyph(/^Open note: Question,/)).toBeUndefined();
  });

  it("a click goes to the note: the playhead is there, playback stops, it is selected, and its window opens", () => {
    render(<NotesLayer project={project} laneCount={3} />);
    fireEvent.click(screen.getByRole("button", { name: /^Open note: Question/ }));
    expect(usePlayhead.getState().playhead).toBe(T1);
    expect(usePlayhead.getState().isPlaying).toBe(false);
    const sel = useSelection.getState().selected;
    expect(sel && sel.kind === "entity" && sel.entity.kind).toBe("note");
    expect(sel && sel.kind === "entity" && sel.entity.id).toBe(n1.id);
    const w = usePivotStore.getState().windows;
    expect(w).toHaveLength(1);
    expect(w[0].kind === "note" && w[0].noteId).toBe(n1.id);
  });

  it("a press on a mark does not start a scrub of the track under it", () => {
    let down = 0;
    render(
      <div onMouseDown={() => (down += 1)}>
        <NotesLayer project={project} laneCount={3} />
      </div>,
    );
    fireEvent.mouseDown(screen.getByRole("button", { name: /^Open note: Question/ }));
    expect(down).toBe(0);
  });

  it("draws nothing for an empty store", () => {
    setup([]);
    const { container } = render(<NotesLayer project={project} laneCount={3} />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("a forced bad colour never reaches a style: the fallback is a table value", () => {
    const bad = { ...n1, colour: "url(javascript:boom())" } as unknown as typeof n1;
    act(() => useNotesStore.setState({ notes: [bad] }));
    const { container } = render(<NotesLayer project={project} laneCount={3} />);
    expect(container.innerHTML).not.toMatch(/url\(/);
    expect(container.innerHTML).not.toContain("boom");
    const sq = container.querySelector("[data-note-square]") as HTMLElement;
    expect(sq.style.background).toBe("var(--text-faint-on-panel)");
  });
});

/** The hit button's centre in CSS, as the layer writes it: at the note's percent, held 7 px inside both ends. */
function centreCss(pct: number): string {
  return `clamp(${HIT_PX / 2}px, ${pct}%, calc(100% - ${HIT_PX / 2}px))`;
}

/** Evaluates the layer's `left` (a clamp of px, percent and calc(100% - px)) against a track width. */
function centrePx(css: string, trackW: number): number {
  const m = /^clamp\(([\d.]+)px, ([\d.]+)%, calc\(100% - ([\d.]+)px\)\)$/.exec(css);
  if (!m) throw new Error(`not the layer's clamp: ${css}`);
  return Math.min(Math.max(parseFloat(m[1]), (parseFloat(m[2]) / 100) * trackW), trackW - parseFloat(m[3]));
}

/** The diamond's drawn box under a 32 px high track of the given width, from the styles alone (jsdom has no layout). */
function diamondBox(b: HTMLElement, trackW = 400) {
  const sq = b.querySelector("[data-note-square]") as HTMLElement;
  const box = sq.parentElement as HTMLElement; // the 11 px box the turned square is centred in
  const w = parseFloat(box.style.width);
  const h = parseFloat(box.style.height);
  const left = centrePx(b.style.getPropertyValue("--note-x"), trackW) - HIT_PX / 2 + parseFloat(box.style.left);
  const top = TRACK_PX + parseFloat(box.style.top); // the button's top is 100% of the track
  expect(b.style.top).toBe("100%");
  expect(b.style.left).toBe("var(--note-x)");
  expect(b.style.transform).not.toMatch(/translateY|translate\(-50%, -50%\)/); // no lift back over the track
  return { left, top, right: left + w, bottom: top + h, w, h };
}

describe("where the diamond hangs under the track", () => {
  const atStart = makeNote({ id: "note-5aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seq: 5, time: MIN });
  const atEnd = makeNote({ id: "note-6aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seq: 6, time: MAX });
  const middle = makeNote({ id: "note-7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seq: 7, time: (MIN + MAX) / 2 });

  it.each([
    ["start", atStart],
    ["middle", middle],
    ["end", atEnd],
  ] as const)("a note at the %s of the case: the box lies wholly below the track's bottom edge and inside its width", (_where, note) => {
    setup([note]);
    render(<NotesLayer project={project} laneCount={3} />);
    const b = screen.getByRole("button") as HTMLElement;
    for (const trackW of [160, 400, 1200]) {
      const box = diamondBox(b, trackW);
      expect(box.top, "gap under the bottom edge").toBeGreaterThanOrEqual(TRACK_PX + 2);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(trackW);
      expect(box.w).toBeLessThanOrEqual(MARK_PX + 2);
    }
  });

  it("the middle note stays at its own time (the clamp only holds the two ends in)", () => {
    setup([middle]);
    render(<NotesLayer project={project} laneCount={3} />);
    const b = screen.getByRole("button") as HTMLElement;
    const box = diamondBox(b, 400);
    expect((box.left + box.right) / 2).toBeCloseTo(200, 6);
  });

  it("is the same for any lane count: it is not placed among the lanes", () => {
    setup([middle]);
    const a = render(<NotesLayer project={project} laneCount={0} />);
    const top0 = (a.container.querySelector("button") as HTMLElement).style.top;
    a.unmount();
    const b = render(<NotesLayer project={project} laneCount={4} />);
    expect((b.container.querySelector("button") as HTMLElement).style.top).toBe(top0);
  });
});

describe("the diamond's cut-out", () => {
  it("keeps its own stroke: the marks plate's stroke cure does not reach the note diamond", () => {
    const { container } = render(<Glyph decision="pass" size={9} />);
    expect(container.querySelector("path")?.getAttribute("stroke-width")).toBe("1.3");
  });
});

describe("freeNotes and plainNotes", () => {
  const ids = (list: readonly { id: string }[]) => list.map((n) => n.id);
  /** A record with no time: an organisation, a key or a seat. */
  const UNTIMED: Entity = { ...RECORD, id: "org-1", timestamp: 0 };
  const lookup = lookupFromContext({ ...CONTEXT, entities: [RECORD, UNTIMED], places: [{ id: "pl-1", name: "Depot", category: "depot", lat: 1, lng: 2 }] });
  const note = (tag: string, link: { kind: string; id: string } | null) =>
    makeNote({ id: `note-${tag}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.slice(0, 37), seq: 1, link });
  const freeOne = note("1", null);
  const timed = note("2", { kind: "stop", id: "rec-1" });
  const missing = note("3", { kind: "stop", id: "gone" });
  const untimed = note("4", { kind: "stop", id: "org-1" });
  const atPlace = note("5", { kind: "place", id: "pl-1" });
  const all = [freeOne, timed, missing, untimed, atPlace];

  it("a note with no record is free; a linked note is not, whether its record is found or not", () => {
    expect(ids(freeNotes(all, lookup))).toEqual([freeOne.id]);
    expect(ids(freeNotes(all, null))).toEqual([freeOne.id]);
  });

  it("a note linked to a record the lookup does not find is plain, not free", () => {
    expect(ids(plainNotes([missing], lookup))).toEqual([missing.id]);
    expect(ids(freeNotes([missing], lookup))).toEqual([]);
  });

  it("a note linked to a record with no time, or to a place, is plain", () => {
    expect(ids(plainNotes([untimed, atPlace], lookup))).toEqual([untimed.id, atPlace.id]);
  });

  it("a note linked to a timed, found record is neither free nor plain (its record's mark carries it)", () => {
    expect(ids(freeNotes([timed], lookup))).toEqual([]);
    expect(ids(plainNotes([timed], lookup))).toEqual([]);
  });

  it("with no lookup every linked note is plain and no free note is", () => {
    expect(ids(plainNotes(all, null))).toEqual([timed.id, missing.id, untimed.id, atPlace.id]);
  });

  it("keeps the input's order", () => {
    expect(ids(plainNotes([atPlace, untimed, missing], lookup))).toEqual([atPlace.id, untimed.id, missing.id]);
  });
});

describe("record marks: the investigator's mark of a record under the track", () => {
  const REC = { kind: "stop", id: "rec-1" };
  const NAME = "Open your mark: stop: Corner Store";
  const AUTH: Entity = { ...RECORD, id: "tx-1", kind: "auth" };
  const UNTIMED: Entity = { ...RECORD, id: "org-1", timestamp: 0 };
  const lookup = lookupFromContext({ ...CONTEXT, entities: [RECORD, AUTH, UNTIMED] });
  const linked = (tag: string, link: { kind: string; id: string } | null, over: Partial<Note> = {}) =>
    makeNote({ id: `note-${tag}`.padEnd(37, "b"), seq: Number(tag.replace(/\D/g, "")) || 1, time: NOTE_TIME, link, ...over });

  /** A state the one function reads: the playhead, the story's nodes and notes, every switch on, nothing selected. */
  function marks(over: { notes?: Note[]; nodes?: RecordNode[]; playhead?: number } = {}) {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    usePlayhead.setState({ playhead: over.playhead ?? NOTE_TIME + 1000, minTime: MIN, maxTime: MAX, windowMin: MIN, windowMax: MAX, isPlaying: false });
    useSelection.setState({ selected: null });
    useLayers.setState({ showAuths: true, showLogins: true, showPlaces: false, hiddenKinds: [], hiddenValues: {}, yoursOn: false });
    useSchema.setState({ nodes: [] });
    useNotesStore.setState({ scenario: SCENARIO, notes: over.notes ?? [], customCategories: [], skipped: 0, error: null });
    useMarksStore.setState({ scenario: SCENARIO, nodes: over.nodes ?? [], paths: [] });
  }
  const draw = () => render(<NotesLayer project={project} laneCount={3} lookup={lookup} />);
  const markButtons = () => screen.queryAllByRole("button").filter((b) => b.hasAttribute("data-mark"));
  const parts = (b: HTMLElement) => Array.from(b.querySelectorAll("[data-part]")).map((p) => p.getAttribute("data-part"));

  beforeEach(() => marks());

  it("a linked note whose record has a time draws no diamond, and one mark named for the record", () => {
    marks({ notes: [linked("1", REC)] });
    const { container } = draw();
    expect(container.querySelector("[data-note-mark]")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    const b = screen.getByRole("button", { name: NAME });
    expect(b.getAttribute("data-tip")).toBe(["Your mark on stop: Corner Store.", `Time: ${when(NOTE_TIME)}`, "Notes: 1"].join("\n"));
    expect(parts(b)).toEqual(["lens", "count"]);
  });

  it("a record with a PASS and a pin draws the lens, the count, the glyph and the pin", () => {
    marks({ notes: [linked("1", REC)], nodes: [makeNode({ pinned: true, disposition: "pass" })] });
    draw();
    const b = screen.getByRole("button", { name: NAME });
    expect(parts(b)).toEqual(["lens", "count", "disposition", "pin"]);
    expect(b.getAttribute("data-tip")).toContain("You marked this PASS.");
    expect(b.getAttribute("data-tip")?.endsWith("Pinned.")).toBe(true);
  });

  it("a record with no note draws a mark of its own when it is pinned or has a disposition (the node alone)", () => {
    marks({ nodes: [makeNode({ disposition: "wait" })] });
    draw();
    expect(parts(screen.getByRole("button", { name: NAME }))).toEqual(["lens", "disposition"]);
  });

  it("an unmarked record draws nothing", () => {
    marks({ nodes: [makeNode()] });
    const { container } = draw();
    expect(container.querySelector("button")).toBeNull();
  });

  it("ahead of the playhead the mark still draws, its contents dim and its pin bright (rows 6 and 7)", () => {
    marks({ notes: [linked("1", REC)], playhead: NOTE_TIME - 1000 });
    draw();
    expect(parts(screen.getByRole("button", { name: NAME }))).toEqual(["lens", "count"]);
    // Each content part dims to its own opacity (mark-ink.ts), not one group opacity of 0.45.
    for (const name of ["lens", "count"]) {
      const o = Number((screen.getByRole("button", { name: NAME }).querySelector(`[data-part="${name}"]`) as HTMLElement).style.opacity);
      expect(o, name).toBeLessThan(1);
      expect(o, name).toBeGreaterThanOrEqual(0.2);
    }
  });

  it("a pinned record ahead of the playhead keeps its pin at full ink while the contents dim", () => {
    marks({ notes: [linked("1", REC)], nodes: [makeNode({ pinned: true })], playhead: NOTE_TIME - 1000 });
    draw();
    const b = screen.getByRole("button", { name: NAME });
    expect(Number((b.querySelector('[data-part="lens"]') as HTMLElement).style.opacity)).toBeLessThan(1);
    expect((b.querySelector('[data-part="pin"]') as HTMLElement).style.opacity).toBe("1");
  });

  it("reached, the contents are not dimmed", () => {
    marks({ notes: [linked("1", REC)] });
    draw();
    expect((screen.getByRole("button", { name: NAME }).querySelector("[data-dim-group]") as HTMLElement).style.opacity).toBe("1");
  });

  it("with Authorizations off an auth record's mark is gone, pinned or not (row 10, and row 8 while the pin does not win)", () => {
    const authLink = { kind: "auth", id: "tx-1" };
    const authName = "Open your mark: auth: Corner Store";
    marks({ notes: [linked("1", authLink)] });
    const on = draw();
    expect(screen.getAllByRole("button", { name: authName })).toHaveLength(1);
    on.unmount();
    act(() => useLayers.setState({ showAuths: false }));
    const off = draw();
    expect(screen.queryAllByRole("button", { name: authName })).toHaveLength(0);
    off.unmount();
    act(() => useMarksStore.setState({ nodes: [makeNode({ record: authLink, pinned: true })] }));
    draw();
    expect(screen.queryAllByRole("button", { name: authName })).toHaveLength(0);
  });

  it("the selected record stays drawn against a switch: an auth record, Authorizations off (row 24)", () => {
    const authLink = { kind: "auth", id: "tx-1" };
    marks({ notes: [linked("1", authLink)] });
    act(() => {
      useLayers.setState({ showAuths: false });
      useSelection.setState({ selected: { kind: "entity", entity: AUTH } });
    });
    draw();
    expect(screen.getAllByRole("button", { name: "Open your mark: auth: Corner Store" })).toHaveLength(1);
  });

  it("a press opens one window of kind record for that record and moves neither the playhead nor the selection", () => {
    marks({ notes: [linked("1", REC)] });
    draw();
    const before = usePlayhead.getState().playhead;
    fireEvent.click(screen.getByRole("button", { name: NAME }), { clientX: 400 });
    const w = usePivotStore.getState().windows;
    expect(w).toHaveLength(1);
    expect(w[0].kind).toBe("record");
    expect(w[0].kind === "record" && w[0].record).toEqual(REC);
    expect(usePlayhead.getState().playhead).toBe(before);
    expect(useSelection.getState().selected).toBeNull();
  });

  it("a record with a place has its window tethered to it; one without opens beside the click", () => {
    marks({ notes: [linked("1", REC)] });
    draw();
    fireEvent.click(screen.getByRole("button", { name: NAME }), { clientX: 400 });
    expect(usePivotStore.getState().windows.map((w) => w.kind === "record" && w.anchor.type)).toEqual(["node"]);
  });

  it("the Timeline passes the click's spot: a record with no place opens its window there", () => {
    const flat: Entity = { ...RECORD, id: "np-1", coords: null };
    const flatLookup = lookupFromContext({ ...CONTEXT, entities: [flat] });
    marks({ notes: [linked("1", { kind: "stop", id: "np-1" })] });
    render(<NotesLayer project={project} laneCount={3} lookup={flatLookup} />);
    fireEvent.click(screen.getByRole("button", { name: NAME }), { clientX: 400 });
    const w = usePivotStore.getState().windows[0];
    expect(w.kind === "record" && w.anchor).toEqual({ type: "screen", ...windowPlaceNear(400) });
  });

  it("with a window for the record already open the mark is open; pressing it again opens no second window", () => {
    marks({ notes: [linked("1", REC)] });
    usePivotStore.getState().openRecord(REC, { lngLat: null, pinned: false });
    draw();
    const b = screen.getByRole("button", { name: NAME });
    expect(b.getAttribute("data-open")).toBe("true");
    fireEvent.click(b);
    expect(usePivotStore.getState().windows.filter((w) => w.kind === "record")).toHaveLength(1);
  });

  it("goes open when its window opens, and back when it closes", () => {
    marks({ notes: [linked("1", REC)] });
    draw();
    expect(screen.getByRole("button", { name: NAME }).getAttribute("data-open")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: NAME }));
    expect(screen.getByRole("button", { name: NAME }).getAttribute("data-open")).toBe("true");
    act(() => usePivotStore.setState({ windows: [] }));
    expect(screen.getByRole("button", { name: NAME }).getAttribute("data-open")).toBe("false");
  });

  it("the diamonds and the marks come in time order in the DOM, a mark before a diamond at one time", () => {
    const early = linked("2", null, { time: NOTE_TIME - 600000 });
    const same = linked("3", null, { time: NOTE_TIME });
    const late = linked("4", null, { time: NOTE_TIME + 600000 });
    marks({ notes: [late, linked("1", REC), same, early] });
    draw();
    const order = screen.getAllByRole("button").map((b) => b.getAttribute("data-mark") ?? b.getAttribute("data-note-mark"));
    expect(order).toEqual([early.id, "stop:rec-1", same.id, late.id]);
  });

  it("a record with no time draws no mark, and its linked note keeps a plain diamond with no glyph and no PASS in its words", () => {
    const n = linked("1", { kind: "stop", id: "org-1" }, { decision: "pass" });
    marks({ notes: [n], nodes: [makeNode({ record: { kind: "stop", id: "org-1" }, pinned: true })] });
    const { container } = draw();
    expect(markButtons()).toHaveLength(0);
    const b = screen.getByRole("button", { name: /^Open note:/ });
    expect(b.getAttribute("data-note-mark")).toBe(n.id);
    expect(b.querySelector("[data-decision-glyph]")).toBeNull();
    expect(b.getAttribute("data-tip")).not.toContain("PASS");
    expect(container.querySelectorAll("[data-note-square]")).toHaveLength(1);
  });

  it("a linked note whose record is not in the data keeps a plain diamond too", () => {
    const n = linked("1", { kind: "stop", id: "gone" }, { decision: "fail" });
    marks({ notes: [n] });
    draw();
    const b = screen.getByRole("button", { name: /^Open note:/ });
    expect(b.querySelector("[data-decision-glyph]")).toBeNull();
    expect(b.getAttribute("data-tip")).not.toContain("FAIL");
  });

  it("a free note keeps its own glyph beside the record marks", () => {
    marks({ notes: [linked("1", REC), linked("2", null, { decision: "fail", time: NOTE_TIME - 600000 })] });
    draw();
    const free = screen.getByRole("button", { name: /^Open note:/ });
    expect(free.querySelector("[data-decision-glyph]")?.getAttribute("data-decision-glyph")).toBe("fail");
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("a mark outside the track's window is not drawn", () => {
    marks({ notes: [linked("1", REC)] });
    useMarksStore.setState({ nodes: [makeNode({ pinned: true })] });
    render(<NotesLayer project={makeProjector(NOTE_TIME + 5000, NOTE_TIME + 9000)} laneCount={3} lookup={lookup} />);
    expect(markButtons()).toHaveLength(0);
  });

  it("with no lookup no record is found: a linked note keeps its diamond and no mark draws", () => {
    marks({ notes: [linked("1", REC)] });
    render(<NotesLayer project={project} laneCount={3} />);
    expect(markButtons()).toHaveLength(0);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("hangs every button in one host that fills the track and takes no pointer events, no z-index and no transform", () => {
    marks({ notes: [linked("1", REC), linked("2", null, { time: NOTE_TIME - 600000 })] });
    const { container } = draw();
    const host = container.querySelector("[data-marks-host]") as HTMLElement;
    expect(host.className.split(/\s+/)).toEqual(expect.arrayContaining(["absolute", "inset-0", "pointer-events-none"]));
    expect(host.style.zIndex).toBe("");
    expect(host.style.transform).toBe("");
    const buttons = Array.from(host.querySelectorAll("button"));
    expect(buttons).toHaveLength(2);
    // The host passes the press through to the track; each button takes its own.
    for (const b of buttons) expect(b.className.split(/\s+/)).toContain("pointer-events-auto");
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });

  it("draws an empty host, and no button, for no notes and no marks", () => {
    const { container } = draw();
    expect(container.querySelector("[data-marks-host]")).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("asks the lookup nothing on a playhead tick (the views change, the notes and the lookup do not)", () => {
    const asked = vi.fn();
    const spy: RecordLookup = (l) => {
      asked();
      return lookup(l);
    };
    marks({ notes: [linked("1", REC), linked("2", { kind: "stop", id: "org-1" })], nodes: [makeNode({ pinned: true })] });
    render(<NotesLayer project={project} laneCount={3} lookup={spy} />);
    const before = asked.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    act(() => usePlayhead.setState({ playhead: NOTE_TIME + 2000 }));
    act(() => usePlayhead.setState({ playhead: NOTE_TIME - 2000 }));
    expect(asked.mock.calls.length).toBe(before);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("a mark of a manifest kind is named with the kind's label", () => {
    marks({ notes: [linked("1", REC)] });
    useSchema.setState({ nodes: [{ kind: "stop", label: "Stop", palette: "stop", source: "stops" }] });
    draw();
    expect(screen.getByRole("button", { name: "Open your mark: Stop: Corner Store" })).toBeTruthy();
  });
});
