import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { RecordNotes } from "./RecordNotes";
import { MID } from "./record-window";
import type { RecordLookup } from "../notes/record-lookup";
import { CONTEXT, NOTE_TIME, SCENARIO, fakeBacking } from "../notes/test-support";
import { PivotWindowsLayer } from "../pivot/PivotWindowsLayer";
import { colourCss } from "../../lib/notes/colours";
import { noteLabel } from "../../lib/notes/body";
import { bodyOf, doc, infoOf, makeNote, para, text } from "../../lib/notes/test-fixtures";
import { ADD_ON_RECORD, BUTTONS, markTip } from "../../lib/tooltip-words/notes";
import { returnNoteFocus } from "../../lib/window-focus";
import { when, when24 } from "../../lib/time-words";
import { useClockForm } from "../../store/clock-form";
import { useNotesStore } from "../../store/notes";
import { usePivotStore } from "../../store/pivot";
import { usePlayhead } from "../../store/playhead";
import { useSelection } from "../../store/selection";

const REC = { kind: "stop", id: "rec-1" };
const lookup: RecordLookup = (link) => (link.id === "rec-1" ? infoOf() : null);
const id = (n: number) => `note-${String(n).padStart(32, "a")}`;

const EARLY = makeNote({ id: id(1), time: NOTE_TIME, link: REC, colour: "r2", category: "Question", decision: "pass", body: bodyOf("First note about the terminal."), seq: 1 });
const LATE = makeNote({ id: id(2), time: NOTE_TIME + 60_000, link: REC, colour: "r3", category: "Note", decision: "none", body: bodyOf("Second note about the same place."), seq: 2 });
const FREE = makeNote({ id: id(3), time: NOTE_TIME + 120_000, link: null, category: "Note", body: bodyOf("A free note."), seq: 3 });

const WHOLE_FIRST = "Opening paragraph of the long note.";
const WHOLE_ITEM = "A bullet item further down.";
/** A note with a paragraph and a bullet list, to open whole. */
const WHOLE = makeNote({
  id: id(4),
  time: NOTE_TIME + 90_000,
  link: REC,
  colour: "r1",
  category: "Note",
  decision: "none",
  body: doc(para(text(WHOLE_FIRST)), { type: "bullet_list", content: [{ type: "list_item", content: [para(text(WHOLE_ITEM))] }] }),
  seq: 4,
});

function setNotes(notes: ReturnType<typeof makeNote>[]) {
  useNotesStore.setState({ scenario: SCENARIO, notes });
}

beforeEach(() => {
  usePivotStore.setState({ windows: [], nextZ: 20 });
  useSelection.setState({ selected: null });
  useClockForm.setState({ h24: false });
  usePlayhead.setState({ playhead: NOTE_TIME });
  useNotesStore.setState({ scenario: null, notes: [] });
});

describe("RecordNotes", () => {
  it("shows one row for each note of this record, in time order, and none for a free note", () => {
    setNotes([LATE, FREE, EARLY]);
    render(<RecordNotes record={REC} lookup={lookup} />);
    const list = screen.getByRole("list");
    const rows = within(list).getAllByRole("button");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain(noteLabel(EARLY));
    expect(rows[1].textContent).toContain(noteLabel(LATE));
  });

  it("line one holds a 7 px square in the note's colour, the time, the middle dot and the category", () => {
    setNotes([EARLY]);
    render(<RecordNotes record={REC} lookup={lookup} />);
    const row = within(screen.getByRole("list")).getByRole("button");
    expect(row.textContent).toContain(`${when(EARLY.time)} ${MID} Question`);
    const swatch = row.querySelector<HTMLElement>("span[data-swatch]")!;
    expect(swatch).not.toBeNull();
    const probe = document.createElement("div");
    probe.style.background = colourCss(EARLY.colour)!;
    expect(swatch.style.background).toBe(probe.style.background);
    expect(swatch.className).toContain("h-[7px]");
    expect(swatch.className).toContain("w-[7px]");
  });

  it("the time follows the clock switch", () => {
    setNotes([EARLY]);
    useClockForm.setState({ h24: true });
    render(<RecordNotes record={REC} lookup={lookup} />);
    expect(within(screen.getByRole("list")).getByRole("button").textContent).toContain(when24(EARLY.time));
  });

  it("line two is the note's first line, cut with an ellipsis; the row is 30 px and square", () => {
    setNotes([EARLY]);
    render(<RecordNotes record={REC} lookup={lookup} />);
    const row = within(screen.getByRole("list")).getByRole("button");
    const line = within(row).getByText(noteLabel(EARLY));
    expect(line.className).toContain("truncate");
    expect(line.className).toContain("text-[10px]");
    expect(row.className).toContain("h-[30px]");
    expect(row.className).not.toMatch(/rounded/);
  });

  it("the row's tooltip is markTip with no decision and no link, even for a note stored PASS", () => {
    setNotes([EARLY]);
    render(<RecordNotes record={REC} lookup={lookup} />);
    const row = within(screen.getByRole("list")).getByRole("button");
    const want = markTip({ category: EARLY.category, label: noteLabel(EARLY), time: when(EARLY.time), decision: "none", link: null }).join("\n");
    expect(row.getAttribute("data-tip")).toBe(want);
    expect(want).not.toContain("PASS");
  });

  describe("a note opened whole in place (item 3)", () => {
    /** The note rows' head buttons, in order: every button that carries aria-expanded. */
    const heads = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));

    beforeEach(() => {
      // The playhead sits well away from every note, so a stray seek would show as a change.
      usePlayhead.setState({ playhead: NOTE_TIME - 5000 });
    });

    it("a row is folded at first: aria-expanded is false and no body is drawn", () => {
      setNotes([EARLY, WHOLE]);
      render(<RecordNotes record={REC} lookup={lookup} />);
      const rows = heads();
      expect(rows).toHaveLength(2);
      for (const r of rows) expect(r.getAttribute("aria-expanded")).toBe("false");
      // The first line shows as line two of the row; the rest of the body is not drawn.
      expect(screen.queryByText(WHOLE_ITEM)).toBeNull();
      expect(document.querySelector("p")).toBeNull();
      expect(screen.queryByRole("button", { name: BUTTONS.edit })).toBeNull();
    });

    it("a press unfolds the whole body, a paragraph and a bullet item, with Edit the note. under it; line two is not drawn", () => {
      setNotes([EARLY, WHOLE]);
      render(<RecordNotes record={REC} lookup={lookup} />);
      const row = heads()[1];
      expect(within(row).getByText(WHOLE_FIRST)).toBeInTheDocument();
      fireEvent.click(row);
      expect(row.getAttribute("aria-expanded")).toBe("true");
      // Line one stays as the head; the first line of the text is no longer line two of the head.
      expect(row.textContent).toContain(`${when(WHOLE.time)} ${MID} Note`);
      expect(within(row).queryByText(WHOLE_FIRST)).toBeNull();
      const region = document.getElementById(row.getAttribute("aria-controls")!)!;
      expect(region).not.toBeNull();
      expect(row.contains(region)).toBe(false);
      expect(within(region).getByText(WHOLE_FIRST).tagName).toBe("P");
      expect(within(region).getByText(WHOLE_ITEM).tagName).toBe("LI");
      expect(within(region).getByRole("button", { name: BUTTONS.edit })).toBeInTheDocument();
      // The other row is untouched.
      expect(heads()[0].getAttribute("aria-expanded")).toBe("false");
    });

    it("unfolding moves no playhead, selects nothing and opens no window", () => {
      setNotes([EARLY, WHOLE]);
      render(<RecordNotes record={REC} lookup={lookup} />);
      const playhead = usePlayhead.getState().playhead;
      const windows = usePivotStore.getState().windows;
      fireEvent.click(heads()[1]);
      expect(usePlayhead.getState().playhead).toBe(playhead);
      expect(useSelection.getState().selected).toBeNull();
      expect(usePivotStore.getState().windows).toBe(windows);
      expect(usePivotStore.getState().windows).toHaveLength(0);
    });

    it("a second press folds the row back to its two lines", () => {
      setNotes([WHOLE]);
      render(<RecordNotes record={REC} lookup={lookup} />);
      const row = heads()[0];
      fireEvent.click(row);
      expect(screen.getByRole("button", { name: BUTTONS.edit })).toBeInTheDocument();
      fireEvent.click(row);
      expect(row.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("button", { name: BUTTONS.edit })).toBeNull();
      expect(screen.queryByText(WHOLE_ITEM)).toBeNull();
      expect(within(row).getByText(WHOLE_FIRST).className).toContain("truncate");
    });

    it("Edit the note. opens the note's own window, and that is the only way a row opens it", () => {
      setNotes([EARLY, WHOLE]);
      render(<RecordNotes record={REC} lookup={lookup} />);
      fireEvent.click(heads()[1]);
      expect(usePivotStore.getState().windows).toHaveLength(0);
      const edit = screen.getByRole("button", { name: BUTTONS.edit });
      fireEvent.click(edit);
      const note = usePivotStore.getState().windows.filter((w) => w.kind === "note");
      expect(note).toHaveLength(1);
      expect(note[0].kind === "note" && note[0].noteId).toBe(WHOLE.id);
    });

    it("Edit the note. carries its own name as its tooltip, is square and takes the accent ring", () => {
      setNotes([WHOLE]);
      render(<RecordNotes record={REC} lookup={lookup} />);
      fireEvent.click(heads()[0]);
      const edit = screen.getByRole("button", { name: BUTTONS.edit });
      expect(edit.textContent).toBe(BUTTONS.edit);
      expect(edit.getAttribute("data-tip")).toBe(BUTTONS.edit);
      expect(edit.className).not.toMatch(/rounded/);
      expect(edit.className).toContain("text-[9px]");
      expect(edit.className).toContain("uppercase");
      expect(edit.className).toContain("focus-visible:ring-accent");
    });

    it("rows open and fold one by one: two rows opened stay open", () => {
      setNotes([EARLY, WHOLE]);
      render(<RecordNotes record={REC} lookup={lookup} />);
      fireEvent.click(heads()[0]);
      fireEvent.click(heads()[1]);
      expect(heads().map((r) => r.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
      expect(screen.getAllByRole("button", { name: BUTTONS.edit })).toHaveLength(2);
      fireEvent.click(heads()[0]);
      expect(heads().map((r) => r.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
      expect(screen.getAllByRole("button", { name: BUTTONS.edit })).toHaveLength(1);
    });

    it("an open row keeps the note's tooltip and draws no PASS or FAIL of the note's own", () => {
      const stored = makeNote({ ...WHOLE, id: id(5), decision: "fail", seq: 5 });
      setNotes([stored]);
      render(<RecordNotes record={REC} lookup={lookup} />);
      const row = heads()[0];
      fireEvent.click(row);
      const want = markTip({ category: stored.category, label: noteLabel(stored), time: when(stored.time), decision: "none", link: null }).join("\n");
      expect(row.getAttribute("data-tip")).toBe(want);
      const region = document.getElementById(row.getAttribute("aria-controls")!)!;
      expect(region.textContent).not.toMatch(/PASS|FAIL/);
    });

    it("the row keeps its place when another note is added above it", () => {
      setNotes([WHOLE]);
      render(<RecordNotes record={REC} lookup={lookup} />);
      fireEvent.click(heads()[0]);
      act(() => setNotes([EARLY, WHOLE]));
      expect(heads().map((r) => r.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
    });
  });

  it("for a record with no time, Add a note opens a draft linked to this record at the playhead's millisecond", () => {
    setNotes([]);
    act(() => usePlayhead.setState({ playhead: NOTE_TIME + 0.6 }));
    render(<RecordNotes record={REC} lookup={lookup} />);
    fireEvent.click(screen.getByRole("button", { name: ADD_ON_RECORD.name }));
    const w = usePivotStore.getState().windows.find((x) => x.kind === "note");
    expect(w && w.kind === "note" && w.seed).toEqual({ scenario: SCENARIO, time: NOTE_TIME + 1, link: REC });
    expect(w && w.kind === "note" && w.noteId).toBeNull();
  });

  it("with no note of this record the only button is Add a note, named for the record", () => {
    setNotes([FREE]);
    render(<RecordNotes record={REC} lookup={lookup} />);
    expect(screen.queryByRole("list")).toBeNull();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe(ADD_ON_RECORD.visible);
    expect(buttons[0].getAttribute("aria-label")).toBe("Add a note on this record.");
    expect(buttons[0].getAttribute("data-tip")).toBe(ADD_ON_RECORD.name);
  });

  it("Add a note is disabled while the notes store holds no scenario", () => {
    useNotesStore.setState({ scenario: null, notes: [] });
    render(<RecordNotes record={REC} lookup={lookup} />);
    expect(screen.getByRole("button", { name: ADD_ON_RECORD.name })).toBeDisabled();
  });

  it("Add a note moves no playhead and selects nothing", () => {
    setNotes([EARLY]);
    render(<RecordNotes record={REC} lookup={lookup} />);
    const before = usePlayhead.getState().playhead;
    fireEvent.click(screen.getByRole("button", { name: ADD_ON_RECORD.name }));
    expect(usePlayhead.getState().playhead).toBe(before);
    expect(useSelection.getState().selected).toBeNull();
  });

  describe("a note made here takes the record's own time (P3) and opens beside the record's window", () => {
    const RECORD_TIME = NOTE_TIME + 90_000;
    const timed: RecordLookup = (link) => (link.id === "rec-1" ? infoOf({ time: RECORD_TIME + 0.4 }) : null);
    const seedOf = () => {
      const w = usePivotStore.getState().windows.find((x) => x.kind === "note");
      return w && w.kind === "note" ? w.seed : null;
    };
    const anchorOf = () => usePivotStore.getState().windows.find((x) => x.kind === "note")?.anchor;
    /** The record's window frame, with a box the test fixes. */
    function inFrame(rect: { left: number; top: number; right: number; bottom: number }) {
      const frame = document.createElement("div");
      frame.setAttribute("data-window-frame", "w-record");
      frame.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top, toJSON: () => ({}) });
      document.body.appendChild(frame);
      render(<RecordNotes record={REC} lookup={timed} />, { container: frame });
      return frame;
    }

    it("the draft's seed time is the record's time while the playhead is elsewhere", () => {
      setNotes([]);
      act(() => usePlayhead.setState({ playhead: NOTE_TIME }));
      render(<RecordNotes record={REC} lookup={timed} />);
      fireEvent.click(screen.getByRole("button", { name: ADD_ON_RECORD.name }));
      expect(seedOf()).toEqual({ scenario: SCENARIO, time: RECORD_TIME, link: REC });
      expect(usePlayhead.getState().playhead).toBe(NOTE_TIME);
    });

    it("the window opens right of the record window's frame", () => {
      setNotes([]);
      const frame = inFrame({ left: 100, top: 120, right: 400, bottom: 300 });
      fireEvent.click(within(frame).getByRole("button", { name: ADD_ON_RECORD.name }));
      expect(anchorOf()).toEqual({ type: "screen", x: 408, y: 120 });
      frame.remove();
    });

    it("clamped: a frame at the right edge sends the window to its left", () => {
      setNotes([]);
      const frame = inFrame({ left: 700, top: 700, right: 1000, bottom: 760 });
      fireEvent.click(within(frame).getByRole("button", { name: ADD_ON_RECORD.name }));
      const a = anchorOf();
      expect(a && a.type === "screen" && a.x).toBe(700 - 8 - 300);
      expect(a && a.type === "screen" && a.y).toBe(window.innerHeight - 350 - 8);
      frame.remove();
    });

    it("with no frame it opens beside the button", () => {
      setNotes([]);
      const { container } = render(<RecordNotes record={REC} lookup={timed} />);
      const add = within(container).getByRole("button", { name: ADD_ON_RECORD.name });
      add.getBoundingClientRect = () => ({ left: 50, top: 60, right: 150, bottom: 90, x: 50, y: 60, width: 100, height: 30, toJSON: () => ({}) });
      fireEvent.click(add);
      expect(anchorOf()).toEqual({ type: "screen", x: 158, y: 60 });
    });

    // Written after the code, to follow B.5's own words ("after a Save"): the whole chain, with the
    // note window drawn by the layer.
    it("Save closes the new window, stores the record's time and link, shows the row, and focus is on Add", async () => {
      useNotesStore.setState({ backing: fakeBacking(), scenario: SCENARIO, notes: [], customCategories: [], skipped: 0, error: null });
      render(
        <>
          <RecordNotes record={REC} lookup={timed} />
          <PivotWindowsLayer map={null} decisions={[]} context={CONTEXT} />
        </>,
      );
      const add = screen.getByRole("button", { name: ADD_ON_RECORD.name });
      fireEvent.click(add);
      expect(usePivotStore.getState().windows.filter((x) => x.kind === "note")).toHaveLength(1);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save the note." }));
      });
      expect(usePivotStore.getState().windows.filter((x) => x.kind === "note")).toHaveLength(0);
      const stored = useNotesStore.getState().notes;
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ time: RECORD_TIME, link: REC });
      expect(within(screen.getByRole("list")).getAllByRole("button")).toHaveLength(1);
      expect(document.activeElement).toBe(add);
    });

    it("the window's own close gives focus back to the Add button", () => {
      setNotes([]);
      render(<RecordNotes record={REC} lookup={timed} />);
      const add = screen.getByRole("button", { name: ADD_ON_RECORD.name });
      fireEvent.click(add);
      const w = usePivotStore.getState().windows.find((x) => x.kind === "note");
      (document.activeElement as HTMLElement | null)?.blur();
      returnNoteFocus(w?.id ?? "");
      expect(document.activeElement).toBe(add);
    });
  });
});
