/**
 * The Notes menu: a button in the top row, and a dialog with "Add a note", the list of this
 * scenario's notes, "Save notes to a file." and "Load notes from a file.". Every sentence is the
 * design's (M1 to M8), and each visible text is part of its control's name.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor, act } from "@testing-library/react";
import { NotesMenu } from "./NotesMenu";
import { resetNotesTransport, startNotesTransport } from "../../lib/notes-io/session";
import { resetUnsaved } from "../../lib/notes-io/unsaved";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePivotStore } from "../../store/pivot";
import { usePlayhead } from "../../store/playhead";
import { useSelection } from "../../store/selection";
import { useNavigation } from "../../store/navigation";
import { useClockForm } from "../../store/clock-form";
import { when } from "../../lib/time-words";
import { bodyOf, infoOf, VISA } from "../../lib/notes/test-fixtures";
import { ADD_ROW, EMPTY_LINES, LIST_NAME, LOAD_FILE, MENU_BUTTON, SAVE_FILE, STATIC_LINES, fileResult } from "../../lib/tooltip-words/notes";
import type { RecordLookup } from "../notes/record-lookup";
import { CONTEXT, RECORD, SCENARIO } from "../notes/test-support";
import { PivotWindowsLayer } from "../pivot/PivotWindowsLayer";
import { returnNoteFocus } from "../../lib/window-focus";

const flag = vi.hoisted(() => ({ isStatic: true }));
vi.mock("../../lib/build-flags", () => ({
  get IS_STATIC_BUILD() {
    return flag.isStatic;
  },
}));

const lookup: RecordLookup = (link) => (link.id === "rec-1" ? infoOf() : null);
const TIME = 1763556003600;

async function seed(n = 0) {
  startNotesTransport(true);
  await useNotesStore.getState().load(SCENARIO);
  const made = [];
  for (let i = 0; i < n; i++) {
    const r = await useNotesStore.getState().create({
      scenario: SCENARIO,
      time: TIME + i * 60_000,
      link: i === 0 ? { kind: "stop", id: "rec-1" } : null,
      colour: "r2",
      category: i === 0 ? "Question" : "Note",
      decision: i === 0 ? "pass" : "none",
      body: bodyOf(i === 0 ? "First note about the terminal." : "Second note."),
    });
    if (r.ok) made.push(r.value);
  }
  return made;
}

function open() {
  const view = render(<NotesMenu lookup={lookup} />);
  fireEvent.click(screen.getByRole("button", { name: MENU_BUTTON }));
  return { view, dialog: screen.getByRole("dialog", { name: MENU_BUTTON }) };
}

beforeEach(() => {
  flag.isStatic = true;
  resetNotesTransport();
  resetUnsaved();
  useNotesStore.getState().setBacking(null);
  useNotesStore.getState().clear();
  useMarksStore.getState().setBacking(null);
  useMarksStore.getState().clear();
  usePivotStore.setState({ windows: [], nextZ: 20 });
  usePlayhead.setState({ playhead: TIME + 0.4, minTime: TIME - 3_600_000, maxTime: TIME + 3_600_000, isPlaying: false });
  useSelection.setState({ selected: null });
  useClockForm.setState({ h24: false });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("NotesMenu", () => {
  it("M1: a button named Notes opens a dialog named Notes", async () => {
    await seed();
    const { dialog } = open();
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: MENU_BUTTON })).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("M2: the add row shows 'Add a note', is named by the longer sentence, and shows the playhead time", async () => {
    await seed();
    const { dialog } = open();
    const add = within(dialog).getByRole("button", { name: ADD_ROW.name });
    expect(add).toHaveTextContent(ADD_ROW.visible);
    expect(ADD_ROW.name.startsWith(ADD_ROW.visible)).toBe(true);
    expect(dialog).toHaveTextContent(`Playhead time: ${when(Math.round(TIME + 0.4))}.`);
    expect(dialog).not.toHaveTextContent("Record to link");
  });

  it("M2: with a selected record the value line names it, and the new draft links to it", async () => {
    await seed();
    act(() => useSelection.setState({ selected: { kind: "entity", entity: RECORD } }));
    const { dialog } = open();
    expect(dialog).toHaveTextContent("Record to link: stop: Corner Store.");
    fireEvent.click(within(dialog).getByRole("button", { name: ADD_ROW.name }));
    const w = usePivotStore.getState().windows.find((x) => x.kind === "note");
    expect(w && w.kind === "note" ? w.seed : null).toEqual({ scenario: SCENARIO, time: Math.round(TIME + 0.4), link: { kind: "stop", id: "rec-1" } });
  });

  it("a selected note is never a link target", async () => {
    const [n] = await seed(1);
    act(() => useNavigation.getState().navigate({ kind: "entity", entity: { id: n.id, kind: "note", timestamp: n.time, coords: null, fields: {}, displayMetadata: { primaryLabel: "x", secondaryLabel: "", paletteKind: "note", pivotableFields: [] } } }));
    const { dialog } = open();
    expect(dialog).not.toHaveTextContent("Record to link");
    fireEvent.click(within(dialog).getByRole("button", { name: ADD_ROW.name }));
    const drafts = usePivotStore.getState().windows.filter((x) => x.kind === "note" && x.seed);
    expect(drafts.every((x) => x.kind === "note" && x.seed?.link === null)).toBe(true);
  });

  describe("the new note opens beside its door and remembers it", () => {
    const rectOf = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) });
    const draft = () => usePivotStore.getState().windows.find((x) => x.kind === "note");

    it("the window opens under the Add button, clamped on both axes, and the time stays the playhead's", async () => {
      await seed();
      const { dialog } = open();
      const add = within(dialog).getByRole("button", { name: ADD_ROW.name });
      add.getBoundingClientRect = () => rectOf(20, 40, 220, 70);
      fireEvent.click(add);
      expect(draft()?.anchor).toEqual({ type: "screen", x: 20, y: 78 });
      const w = draft();
      expect(w && w.kind === "note" ? w.seed?.time : null).toBe(Math.round(TIME + 0.4));

      act(() => usePivotStore.setState({ windows: [], nextZ: 20 }));
      add.getBoundingClientRect = () => rectOf(900, 700, 1000, 730);
      fireEvent.click(add);
      expect(draft()?.anchor).toEqual({ type: "screen", x: window.innerWidth - 300 - 8, y: window.innerHeight - 350 - 8 });
    });

    it("the window's own close gives focus back to the Notes button", async () => {
      await seed();
      const { dialog } = open();
      fireEvent.click(within(dialog).getByRole("button", { name: ADD_ROW.name }));
      const id = draft()?.id ?? "";
      (document.activeElement as HTMLElement | null)?.blur();
      returnNoteFocus(id);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: MENU_BUTTON }));
    });

    it("a note linked to the selected record closes on its first Save and focus lands on the Notes button", async () => {
      await seed();
      act(() => useSelection.setState({ selected: { kind: "entity", entity: RECORD } }));
      const { dialog } = open();
      render(<PivotWindowsLayer map={null} decisions={[]} context={CONTEXT} />);
      fireEvent.click(within(dialog).getByRole("button", { name: ADD_ROW.name }));
      expect(draft()).toBeDefined();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save the note." }));
      });
      expect(draft()).toBeUndefined();
      expect(useNotesStore.getState().notes).toHaveLength(1);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: MENU_BUTTON }));
    });

    it("a note with no record closes on its first Save too, stored once, and focus lands on the Notes button", async () => {
      await seed();
      const { dialog } = open();
      render(<PivotWindowsLayer map={null} decisions={[]} context={CONTEXT} />);
      fireEvent.click(within(dialog).getByRole("button", { name: ADD_ROW.name }));
      const w = draft();
      expect(w && w.kind === "note" ? w.seed?.link : undefined).toBeNull();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save the note." }));
      });
      expect(draft()).toBeUndefined();
      expect(useNotesStore.getState().notes).toHaveLength(1);
      expect(useNotesStore.getState().notes[0].link).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: MENU_BUTTON }));
    });

    it("a Save the backend refuses closes nothing and moves no focus", async () => {
      await seed();
      const { dialog } = open();
      render(<PivotWindowsLayer map={null} decisions={[]} context={CONTEXT} />);
      fireEvent.click(within(dialog).getByRole("button", { name: ADD_ROW.name }));
      const before = useNotesStore.getState().backing;
      useNotesStore.setState({ backing: { ...(before as NonNullable<typeof before>), create: async () => { throw new Error("down"); } } });
      (document.activeElement as HTMLElement | null)?.blur();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save the note." }));
      });
      expect(draft()).toBeDefined();
      expect(useNotesStore.getState().notes).toEqual([]);
      expect(document.activeElement).not.toBe(screen.getByRole("button", { name: MENU_BUTTON }));
    });
  });

  it("M4: an empty scenario says so, and says how to add a note", async () => {
    await seed();
    const { dialog } = open();
    for (const line of EMPTY_LINES) expect(dialog).toHaveTextContent(line);
  });

  it("M3: the list is named, and each note is a button whose text is its time, category and first line", async () => {
    await seed(2);
    const { dialog } = open();
    const list = within(dialog).getByRole("list", { name: LIST_NAME });
    const rows = within(list).getAllByRole("button");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(when(TIME));
    expect(rows[0]).toHaveTextContent("Question");
    expect(rows[0]).toHaveTextContent("First note about the terminal.");
    expect(rows[1]).toHaveTextContent("Second note.");
    expect(dialog).not.toHaveTextContent(EMPTY_LINES[0]);
  });

  it("opening a row selects the note, seeks the playhead, pauses and opens its window", async () => {
    const made = await seed(2);
    const { dialog } = open();
    const rows = within(within(dialog).getByRole("list", { name: LIST_NAME })).getAllByRole("button");
    usePlayhead.setState({ playhead: TIME - 1_000_000 });
    fireEvent.click(rows[1]);
    expect(usePlayhead.getState().playhead).toBe(made[1].time);
    expect(usePlayhead.getState().isPlaying).toBe(false);
    const sel = useSelection.getState().selected;
    expect(sel && sel.kind === "entity" ? sel.entity.id : null).toBe(made[1].id);
    expect(usePivotStore.getState().windows.some((w) => w.kind === "note" && w.noteId === made[1].id)).toBe(true);
  });

  // D6: a linked note shares its record's mark, so its row's tooltip has no PASS or FAIL line of its own.
  it("D6: a linked note's row tooltip has no 'You marked this' line, and a note with no record keeps its line", async () => {
    await seed(2); // note 0 is linked to rec-1 with a PASS; note 1 has no record
    await useNotesStore.getState().create({
      scenario: SCENARIO,
      time: TIME + 120_000,
      link: null,
      colour: "r2",
      category: "Source",
      decision: "fail",
      body: bodyOf("A note with a FAIL of its own."),
    });
    const { dialog } = open();
    const rows = within(within(dialog).getByRole("list", { name: LIST_NAME })).getAllByRole("button");
    expect(rows).toHaveLength(3);
    const tipOf = (row: HTMLElement) => row.getAttribute("data-tip") ?? "";
    expect(tipOf(rows[0])).toContain("Your note, category Question.");
    expect(tipOf(rows[0])).not.toContain("You marked this");
    expect(tipOf(rows[1])).not.toContain("You marked this");
    expect(tipOf(rows[2])).toContain("You marked this FAIL.");
  });

  it("D6: a note linked to a record that is not in the data has no 'You marked this' line either", async () => {
    startNotesTransport(true);
    await useNotesStore.getState().load(SCENARIO);
    await useNotesStore.getState().create({
      scenario: SCENARIO,
      time: TIME,
      link: { kind: "stop", id: "gone" },
      colour: "r2",
      category: "Note",
      decision: "pass",
      body: bodyOf("Linked to a record that left the data."),
    });
    const { dialog } = open();
    const row = within(within(dialog).getByRole("list", { name: LIST_NAME })).getAllByRole("button")[0];
    expect(row.getAttribute("data-tip") ?? "").not.toContain("You marked this");
  });

  // Window N1 (D5 a): the Your marks block sits between Add a note and the notes, and the menu's
  // scroller carries the foot shade.
  it("Your marks: after a pin, the dialog holds the Add a note button, the heading and list Your marks, then the notes list, in that order", async () => {
    await seed(2);
    await useMarksStore.getState().load(SCENARIO);
    await useMarksStore.getState().togglePin({ kind: "stop", id: "rec-1" });
    const { dialog } = open();
    const add = within(dialog).getByRole("button", { name: ADD_ROW.name });
    const heading = within(dialog).getByRole("heading", { name: "Your marks" });
    const marks = within(dialog).getByRole("list", { name: "Your marks" });
    const notes = within(dialog).getByRole("list", { name: LIST_NAME });
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(add, heading)).toBe(true);
    expect(before(heading, marks)).toBe(true);
    expect(before(marks, notes)).toBe(true);
    expect(within(marks).getAllByRole("button")).toHaveLength(1);
    expect(within(marks).getByRole("button")).toHaveTextContent("stop: Corner Store");
  });

  it("Your marks: with no marked record the block is absent and the menu is as it was (a note with no record is not a mark)", async () => {
    await seed();
    await useNotesStore.getState().create({ scenario: SCENARIO, time: TIME, link: null, colour: "r2", category: "Note", decision: "none", body: bodyOf("A free note.") });
    await useMarksStore.getState().load(SCENARIO);
    const { dialog } = open();
    expect(within(dialog).queryByRole("heading", { name: "Your marks" })).toBeNull();
    expect(within(dialog).queryByRole("list", { name: "Your marks" })).toBeNull();
    expect(within(dialog).getByRole("list", { name: LIST_NAME })).toBeInTheDocument();
  });

  it("the dialog's scroller carries the foot cue", async () => {
    await seed();
    const { dialog } = open();
    const panel = dialog.firstElementChild as HTMLElement;
    const scroller = Array.from(panel.children).find((el) => el.tagName === "DIV") as HTMLElement;
    expect(scroller.classList.contains("foot-cue")).toBe(true);
    expect(scroller.classList.contains("overflow-y-auto")).toBe(true);
  });

  it("M5: the static page says notes last for this visit; the live page does not", async () => {
    await seed();
    const a = open();
    for (const line of STATIC_LINES) expect(a.dialog).toHaveTextContent(line);
    a.view.unmount();
    flag.isStatic = false;
    const b = open();
    expect(b.dialog).not.toHaveTextContent(STATIC_LINES[0]);
  });

  it("M6, M7: the two file buttons are named by their sentences and carry the design's tips", async () => {
    await seed();
    const { dialog } = open();
    const save = within(dialog).getByRole("button", { name: SAVE_FILE.name });
    const load = within(dialog).getByRole("button", { name: LOAD_FILE.name });
    expect(save).toHaveAttribute("data-tip", expect.stringContaining(SAVE_FILE.tip));
    expect(load).toHaveAttribute("data-tip", expect.stringContaining(LOAD_FILE.tip));
  });

  it("Load: a file that passes loads the notes and says 'Loaded 2 notes.'", async () => {
    await seed(2);
    const { dialog } = open();
    const input = dialog.querySelector("input[type=file]") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toContain("json");
    const file = await (async () => {
      const store = useNotesStore.getState();
      const { buildNotesFile } = await import("../../lib/notes/file");
      return JSON.stringify(buildNotesFile(SCENARIO, store.customCategories, store.notes));
    })();
    fireEvent.change(input, { target: { files: [new File([file], "ffr-notes-card-fraud.json", { type: "application/json" })] } });
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent(fileResult.loaded(2)));
    expect(useNotesStore.getState().notes).toHaveLength(2);
  });

  it("Load: a file holding the test card number loads nothing and shows the card sentence, never the number", async () => {
    await seed(1);
    const { dialog } = open();
    const input = dialog.querySelector("input[type=file]") as HTMLInputElement;
    const { buildNotesFile } = await import("../../lib/notes/file");
    const doc = buildNotesFile(SCENARIO, [], []);
    const bad = { ...doc, notes: [{ ...useNotesStore.getState().notes[0], scenario: undefined, id: "note-abababababababababababababababab", body: bodyOf(`Card ${VISA}`) }] };
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(bad)], "x.json", { type: "application/json" })] } });
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent(fileResult.card));
    expect(dialog).not.toHaveTextContent("4111");
    expect(useNotesStore.getState().notes).toHaveLength(1);
  });

  it("Load: a file that is not a notes file says so", async () => {
    await seed();
    const { dialog } = open();
    const input = dialog.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["{not json"], "x.json")] } });
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent(fileResult.notFile));
  });
});
