/**
 * The note window in the existing WindowFrame, drawn by PivotWindowsLayer. Names are the design's
 * list (section 3, E1 to E12), pinned as literals. The window asks before it closes with changes.
 * Runs in happy-dom: the real view mounts, but typing and input methods need a browser (the next
 * piece), so text enters through the paste event, which the real handler takes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { PivotWindowsLayer } from "../pivot/PivotWindowsLayer";
import { usePivotStore } from "../../store/pivot";
import { useNotesStore } from "../../store/notes";
import { usePlayhead } from "../../store/playhead";
import { when } from "../../lib/time-words";
import { noteOpenedFrom } from "../../lib/window-focus";
import { VISA, bodyOf, makeNote } from "../../lib/notes/test-fixtures";
import { CONTEXT, NOTE_TIME, SCENARIO, fakeBacking, fakeClipboard } from "./test-support";
import type { Note, NoteDraft } from "../../lib/notes/types";

const TIME = when(NOTE_TIME);

function reset() {
  usePivotStore.setState({ windows: [], nextZ: 20 });
  usePlayhead.setState({ playhead: NOTE_TIME, isPlaying: false });
  useNotesStore.setState({ backing: fakeBacking(), scenario: SCENARIO, notes: [], customCategories: [], skipped: 0, error: null });
}

function openDraft(link: { kind: string; id: string } | null = null): string {
  let id = "";
  act(() => {
    id = usePivotStore.getState().openNote({ seed: { scenario: SCENARIO, time: NOTE_TIME, link } }, { x: 100, y: 100 });
  });
  return id;
}

function layer() {
  return render(<PivotWindowsLayer map={null} decisions={[]} context={CONTEXT} />);
}

const windows = () => usePivotStore.getState().windows;
const noteWindow = (id: string) => windows().find((w) => w.id === id);
const textbox = () => screen.getByRole("textbox", { name: "Note text" });
const status = () => screen.getByRole("status");

async function paste(plain: string) {
  await act(async () => {
    fireEvent.paste(textbox(), { clipboardData: fakeClipboard(plain) });
  });
}
async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("NoteWindow: accessible names are the design's list", () => {
  beforeEach(reset);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the window, the groups, the choices and the buttons", () => {
    openDraft();
    layer();
    expect(screen.getByRole("dialog", { name: `Note, ${TIME}` })).toBeTruthy();
    const colours = screen.getByRole("radiogroup", { name: "Colour" });
    for (let n = 1; n <= 6; n++) expect(within(colours).getByRole("radio", { name: `Colour ${n}` })).toBeTruthy();
    expect(within(colours).getAllByRole("radio")).toHaveLength(6);
    expect(screen.getByRole("combobox", { name: "Category" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a category." })).toBeTruthy();
    const dec = screen.getByRole("radiogroup", { name: "PASS or FAIL" });
    for (const name of ["None", "PASS", "FAIL"]) expect(within(dec).getByRole("radio", { name })).toBeTruthy();
    expect((within(dec).getByRole("radio", { name: "None" }) as HTMLInputElement).getAttribute("aria-checked")).toBe("true");
    for (const name of ["Bold", "Italic", "Underline", "Strike", "Bullet list", "Numbered list", "Quote"]) {
      expect(screen.getByRole("button", { name }), name).toBeTruthy();
    }
    expect(textbox().getAttribute("aria-multiline")).toBe("true");
    expect(screen.getByRole("button", { name: "Save the note." })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete the note." })).toBeNull(); // a draft has nothing to delete
    expect(screen.getByRole("button", { name: "Close window" })).toBeTruthy();
    expect(status()).toBeTruthy();
  });

  it("says in the design's words what the card guard does not stop", () => {
    openDraft();
    layer();
    expect(screen.getByText("Do not type card data.")).toBeTruthy();
    expect(screen.getByText("The editor refuses card numbers only.")).toBeTruthy();
    const hint = screen.getByText("Do not type card data.").closest("[data-tip]") as HTMLElement;
    expect(hint.getAttribute("data-tip")).toBe(
      [
        "The editor refuses a number that looks like a card number.",
        "It catches a mistake. It does not stop a person who hides a number on purpose.",
        "It does not check a number written in words.",
        "It does not check a security code or an expiry date.",
        "It does not check a number split across two notes.",
      ].join("\n"),
    );
  });

  it("every control says what it is through the app's one tooltip layer (data-tip)", () => {
    openDraft();
    layer();
    const tip = (name: string, role = "button") => (screen.getByRole(role, { name }) as HTMLElement).getAttribute("data-tip");
    expect(tip("Colour 3", "radio")).toBe("This is note colour 3 of 6.\nIt follows the active palette.");
    expect(tip("Bold")).toBe("Make the selected text bold.");
    expect(tip("Quote")).toBe("Make a quote.");
    expect(tip("FAIL", "radio")).toBe("Mark this note FAIL. The mark is yours.");
    expect(tip("None", "radio")).toBe("This note has no mark.");
    expect((screen.getByRole("combobox", { name: "Category" }) as HTMLElement).getAttribute("data-tip")).toBe(
      "This is the category of the note.\nAdd your own with the button beside the list.",
    );
    const group = screen.getByRole("radiogroup", { name: "PASS or FAIL" });
    expect(group.getAttribute("data-tip")).toBe("PASS or FAIL is your own mark.\nThe app does not set it.");
  });

  it("the category list holds the five starters", () => {
    openDraft();
    layer();
    const options = within(screen.getByRole("combobox", { name: "Category" })).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Note", "Question", "Follow up", "Source", "Context"]);
  });
});

describe("NoteWindow: a colour reaches a style only through the fixed table", () => {
  beforeEach(reset);

  it("each swatch is the table's value for its slot", () => {
    openDraft();
    layer();
    const slots = ["r0", "r1", "r2", "r3", "r4"];
    slots.forEach((slot, i) => {
      const sw = screen.getByRole("radio", { name: `Colour ${i + 1}` }) as HTMLElement;
      expect(sw.style.background || sw.style.backgroundColor, slot).toBe(`var(--${slot}-on-panel)`);
    });
    expect((screen.getByRole("radio", { name: "Colour 6" }) as HTMLElement).style.background).toBe("var(--text-faint-on-panel)");
  });

  it("the frame's accent is the table's value, and a forced bad colour draws no url()", () => {
    const note = makeNote({ id: "note-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1", colour: "r2" });
    useNotesStore.setState({ notes: [note] });
    let id = "";
    act(() => {
      id = usePivotStore.getState().openNote({ noteId: note.id }, { x: 50, y: 50 });
    });
    const { container } = layer();
    expect(container.innerHTML).toContain("var(--r2-on-panel)");
    expect(id).not.toBe("");
    // Force a note past the store's one door and open it: the bad value never becomes a style.
    const bad = { ...note, id: "note-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2", colour: "url(javascript:boom())" } as unknown as typeof note;
    useNotesStore.setState({ notes: [note, bad] });
    act(() => {
      usePivotStore.getState().openNote({ noteId: bad.id }, { x: 60, y: 60 });
    });
    expect(container.innerHTML).not.toMatch(/url\(/);
    expect(container.innerHTML).not.toContain("boom");
  });
});

describe("NoteWindow: the category field", () => {
  beforeEach(reset);

  it("has autocomplete off, spellcheck off, and sits in no form", () => {
    openDraft();
    layer();
    fireEvent.click(screen.getByRole("button", { name: "Add a category." }));
    const field = screen.getByRole("textbox", { name: "Category name" }) as HTMLInputElement;
    expect(field.getAttribute("autocomplete")).toBe("off");
    expect(field.getAttribute("spellcheck")).toBe("false");
    expect(field.closest("form")).toBeNull();
    expect(document.querySelector("form")).toBeNull();
  });

  it("adds a name, chooses it at once, and refuses a number, a repeat and a long name with the design's words", async () => {
    openDraft();
    layer();
    const open = () => fireEvent.click(screen.getByRole("button", { name: "Add a category." }));
    const field = () => screen.getByRole("textbox", { name: "Category name" });
    open();
    fireEvent.change(field(), { target: { value: VISA } });
    expect(screen.getByText("The name has a number that looks like a card number.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    });
    expect(useNotesStore.getState().customCategories).toEqual([]);

    fireEvent.change(field(), { target: { value: "question" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    });
    expect(screen.getByText("This category exists already.")).toBeTruthy();

    fireEvent.change(field(), { target: { value: "x".repeat(25) } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    });
    expect(screen.getByText("The name is too long. The limit is 24 characters.")).toBeTruthy();

    fireEvent.change(field(), { target: { value: "Lead" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    });
    expect(useNotesStore.getState().customCategories).toEqual(["Lead"]);
    expect((screen.getByRole("combobox", { name: "Category" }) as HTMLSelectElement).value).toBe("Lead");
  });
});

describe("NoteWindow: saving", () => {
  beforeEach(reset);

  // Every new note closes on its first good Save, linked or not.
  it("a draft is not stored until Save; Save stores it once, closes the window and gives focus to its opener", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    const id = openDraft();
    act(() => noteOpenedFrom(id, opener));
    layer();
    fireEvent.click(screen.getByRole("radio", { name: "Colour 3" }));
    expect(useNotesStore.getState().notes).toEqual([]);
    await paste("Seen at the terminal.");
    await press("Save the note.");
    const notes = useNotesStore.getState().notes;
    expect(notes).toHaveLength(1);
    expect(notes[0].colour).toBe("r2");
    expect(notes[0].time).toBe(NOTE_TIME);
    expect(notes[0].scenario).toBe(SCENARIO);
    expect(noteWindow(id)).toBeUndefined();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("a saved note changed and saved stays open, says Saved and keeps its Delete button", async () => {
    const note = makeNote({ id: "note-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3", link: null, body: bodyOf("Saved note.") });
    const backing = fakeBacking();
    backing.rows.set(note.id, note);
    useNotesStore.setState({ backing, notes: [note] });
    let id = "";
    act(() => {
      id = usePivotStore.getState().openNote({ noteId: note.id }, { x: 80, y: 80 });
    });
    layer();
    fireEvent.click(screen.getByRole("radio", { name: "Colour 3" }));
    await press("Save the note.");
    expect(status().textContent).toBe("Saved.");
    expect(screen.getByRole("button", { name: "Delete the note." })).toBeTruthy();
    const w = noteWindow(id);
    expect(w && w.kind === "note" && w.noteId).toBe(note.id);
    expect(w && w.kind === "note" && w.dirty).toBe(false);
    expect(backing.rows.get(note.id)).toMatchObject({ colour: "r2" });
  });

  it("writes nothing to browser storage while drafting and saving", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    openDraft();
    layer();
    fireEvent.click(screen.getByRole("radio", { name: "FAIL" }));
    await paste("A note.");
    await press("Save the note.");
    expect(set).not.toHaveBeenCalled();
  });

  it("the PASS or FAIL choice is the person's: None at the start, FAIL stored when chosen", async () => {
    openDraft();
    layer();
    fireEvent.click(screen.getByRole("radio", { name: "FAIL" }));
    await press("Save the note.");
    expect(useNotesStore.getState().notes[0].decision).toBe("fail");
  });

  it("a pasted card number is refused with the design's words and Save stores nothing of it", async () => {
    openDraft();
    layer();
    await paste(VISA);
    expect(status().textContent).toBe("The note has a number that looks like a card number. Remove it, then save.");
    await press("Save the note.");
    const stored = JSON.stringify(useNotesStore.getState().notes);
    expect(stored).not.toContain(VISA);
  });

  it("the backend refusing the note says so and keeps the window dirty", async () => {
    openDraft();
    layer();
    useNotesStore.setState({
      backing: { ...fakeBacking(), create: async () => { throw new Error("down"); } },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Colour 2" }));
    await press("Save the note.");
    expect(status().textContent).toBe("The backend did not answer. The note is not saved. Press Save to try again.");
  });
});

describe("NoteWindow: it asks before it closes with changes", () => {
  beforeEach(reset);

  it("an empty draft closes at once", () => {
    const id = openDraft();
    layer();
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    expect(noteWindow(id)).toBeUndefined();
  });

  it("with changes, the close is kept open and the status line asks Save, Discard or Cancel", async () => {
    const id = openDraft();
    layer();
    fireEvent.click(screen.getByRole("radio", { name: "Colour 4" }));
    expect((noteWindow(id) as { dirty: boolean }).dirty).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    });
    expect(noteWindow(id)).toBeDefined();
    const group = screen.getByRole("group", { name: "This note has changes that are not saved." });
    expect(within(group).getByRole("button", { name: "Save" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Discard" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Cancel" })).toBeTruthy();
    // Focus stays inside the window, in the prompt, though the frame's close control hands focus on.
    expect(group.contains(document.activeElement)).toBe(true);
  });

  it("Cancel keeps the window and clears the question; Discard closes without storing", async () => {
    const id = openDraft();
    layer();
    fireEvent.click(screen.getByRole("radio", { name: "Colour 4" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    expect(noteWindow(id)).toBeDefined();
    expect(screen.queryByRole("group", { name: "This note has changes that are not saved." })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    });
    expect(noteWindow(id)).toBeUndefined();
    expect(useNotesStore.getState().notes).toEqual([]);
  });

  it("Save in the question stores the note and closes the window", async () => {
    const id = openDraft();
    layer();
    fireEvent.click(screen.getByRole("radio", { name: "Colour 4" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    });
    const group = screen.getByRole("group", { name: "This note has changes that are not saved." });
    await act(async () => {
      fireEvent.click(within(group).getByRole("button", { name: "Save" }));
    });
    expect(useNotesStore.getState().notes).toHaveLength(1);
    expect(noteWindow(id)).toBeUndefined();
  });
});

describe("NoteWindow: a Save that waits for the store", () => {
  beforeEach(reset);

  /** A backing whose create waits until `release` is called, and counts the calls that reach it. */
  function heldBacking() {
    const backing = fakeBacking();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let asked = 0;
    const held = {
      ...backing,
      create: async (draft: NoteDraft) => {
        asked += 1;
        await gate;
        return backing.create(draft);
      },
    };
    useNotesStore.setState({ backing: held });
    return {
      asked: () => asked,
      settle: async () => {
        await act(async () => {
          release();
          await new Promise((r) => setTimeout(r, 0));
        });
      },
    };
  }

  it("a second press of Save while the first waits makes no second note", async () => {
    const held = heldBacking();
    const id = openDraft();
    layer();
    await paste("Seen at the terminal.");
    await press("Save the note.");
    await press("Save the note.");
    await held.settle();
    expect(held.asked()).toBe(1);
    expect(useNotesStore.getState().notes).toHaveLength(1);
    expect(noteWindow(id)).toBeUndefined();
  });

  it("text typed while a new note's Save waits keeps the window open, bound to the new note and marked changed", async () => {
    const held = heldBacking();
    const id = openDraft();
    layer();
    await paste("First words.");
    await press("Save the note.");
    await paste(" More words.");
    await held.settle();
    const notes = useNotesStore.getState().notes;
    expect(notes).toHaveLength(1);
    expect(JSON.stringify(notes[0].body)).not.toContain("More words.");
    const w = noteWindow(id);
    expect(w && w.kind === "note" && w.noteId).toBe(notes[0].id);
    expect(w && w.kind === "note" && w.dirty).toBe(true);
    expect(textbox().textContent).toContain("More words.");
  });
});

describe("NoteWindow: a notes file loaded while the window is open", () => {
  beforeEach(reset);
  const NOTE_ID = "note-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeee1";

  function openSaved() {
    const note = makeNote({ id: NOTE_ID, colour: "r1", body: bodyOf("Old words.") });
    const backing = fakeBacking();
    backing.rows.set(note.id, note);
    useNotesStore.setState({ backing, notes: [note] });
    act(() => {
      usePivotStore.getState().openNote({ noteId: note.id }, { x: 80, y: 80 });
    });
    layer();
    return { note, backing };
  }
  /** What a loaded file does to the store: the backing holds the file's copy and the store lists again. */
  async function loadFile(backing: ReturnType<typeof fakeBacking>, note: Note) {
    backing.rows.set(note.id, note);
    await act(async () => {
      await useNotesStore.getState().load(SCENARIO);
    });
  }

  it("a window with no change takes the loaded text and fields, and its Save writes the loaded copy", async () => {
    const { note, backing } = openSaved();
    await loadFile(backing, { ...note, colour: "r3", body: bodyOf("Loaded words.") });
    expect(textbox().textContent).toBe("Loaded words.");
    await press("Save the note.");
    expect(backing.rows.get(NOTE_ID)).toMatchObject({ colour: "r3", body: bodyOf("Loaded words.") });
  });

  it("taking the loaded copy leaves focus where it was", async () => {
    const { note, backing } = openSaved();
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    await loadFile(backing, { ...note, body: bodyOf("Loaded words.") });
    expect(textbox().textContent).toBe("Loaded words.");
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it("a window with changes of its own keeps them when a file is loaded", async () => {
    const { note, backing } = openSaved();
    await paste(" Mine.");
    await loadFile(backing, { ...note, body: bodyOf("Loaded words.") });
    expect(textbox().textContent).toContain("Mine.");
  });

  it("the window's own Save keeps its editor", async () => {
    openSaved();
    const before = textbox();
    await press("Save the note.");
    expect(textbox()).toBe(before);
    expect(status().textContent).toBe("Saved.");
  });
});

describe("NoteWindow: a saved note, delete, and the link", () => {
  beforeEach(reset);

  it("Delete asks inline, Keep keeps, Delete removes the note and closes the window", async () => {
    const note = makeNote({ id: "note-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1", body: bodyOf("To delete.") });
    useNotesStore.setState({ notes: [note] });
    let id = "";
    act(() => {
      id = usePivotStore.getState().openNote({ noteId: note.id }, { x: 80, y: 80 });
    });
    layer();
    await press("Delete the note.");
    expect(screen.getByText("Delete this note? This action is permanent.")).toBeTruthy();
    await press("Keep");
    expect(screen.queryByText("Delete this note? This action is permanent.")).toBeNull();
    await press("Delete the note.");
    await press("Delete");
    expect(useNotesStore.getState().notes).toEqual([]);
    expect(noteWindow(id)).toBeUndefined();
  });

  it("shows the linked record, can remove the link, and says when the record is not in the data", () => {
    openDraft({ kind: "stop", id: "rec-1" });
    layer();
    expect(screen.getByText("Linked record: stop: Corner Store")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove the link." }));
    expect(screen.queryByText("Linked record: stop: Corner Store")).toBeNull();
  });

  it("a link to a record that is not in the data says so", () => {
    openDraft({ kind: "stop", id: "gone" });
    layer();
    expect(screen.getByText("The linked record is not in the data.")).toBeTruthy();
  });

  describe("D6: a linked note shares its record's mark, so it has no PASS or FAIL row of its own", () => {
    const LINKED = { kind: "stop", id: "rec-1" };
    const NOTE_ID = "note-ddddddddddddddddddddddddddddddd1";
    /** A saved note held by the store and by the fake backing, opened in its window. */
    function openSaved(over: Parameters<typeof makeNote>[0]) {
      const note = makeNote({ id: NOTE_ID, body: bodyOf("Saved note."), ...over });
      const backing = fakeBacking();
      backing.rows.set(note.id, note);
      useNotesStore.setState({ backing, notes: [note] });
      act(() => {
        usePivotStore.getState().openNote({ noteId: note.id }, { x: 80, y: 80 });
      });
      layer();
      return { note, backing };
    }
    const group = () => screen.queryByRole("radiogroup", { name: "PASS or FAIL" });

    it("a draft linked to a record has no PASS or FAIL row, and Save stores decision none with the link", async () => {
      openDraft(LINKED);
      layer();
      expect(group()).toBeNull();
      expect(screen.queryByRole("radio", { name: "PASS" })).toBeNull();
      fireEvent.click(screen.getByRole("radio", { name: "Colour 2" }));
      await press("Save the note.");
      expect(useNotesStore.getState().notes[0]).toMatchObject({ decision: "none", link: LINKED });
    });

    it("a draft with no record keeps the row, as before", () => {
      openDraft();
      layer();
      expect(group()).not.toBeNull();
    });

    it("a saved linked note with a stored PASS has no row, and a change of colour saves the stored PASS unchanged", async () => {
      const { note, backing } = openSaved({ link: LINKED, decision: "pass" });
      expect(group()).toBeNull();
      fireEvent.click(screen.getByRole("radio", { name: "Colour 4" }));
      await press("Save the note.");
      expect(backing.rows.get(note.id)).toMatchObject({ decision: "pass", colour: "r3", link: LINKED });
      expect(useNotesStore.getState().notes[0].decision).toBe("pass");
    });

    it("Remove the link brings the row back, showing the stored value", () => {
      openSaved({ link: LINKED, decision: "fail" });
      expect(group()).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Remove the link." }));
      const row = group();
      expect(row).not.toBeNull();
      expect(within(row as HTMLElement).getByRole("radio", { name: "FAIL" }).getAttribute("aria-checked")).toBe("true");
    });

    it("a saved note with no record shows its row with the stored value", () => {
      openSaved({ link: null, decision: "pass" });
      const row = group();
      expect(row).not.toBeNull();
      expect(within(row as HTMLElement).getByRole("radio", { name: "PASS" }).getAttribute("aria-checked")).toBe("true");
    });

    it("a note whose linked record is not in the data has no row either: the link is the note's, found or not", () => {
      openSaved({ link: { kind: "stop", id: "gone" }, decision: "pass" });
      expect(group()).toBeNull();
    });
  });

  it("a saved note that is deleted elsewhere closes its window", () => {
    const note = makeNote({ id: "note-ccccccccccccccccccccccccccccccc1" });
    useNotesStore.setState({ notes: [note] });
    let id = "";
    act(() => {
      id = usePivotStore.getState().openNote({ noteId: note.id }, { x: 80, y: 80 });
    });
    layer();
    act(() => useNotesStore.setState({ notes: [] }));
    expect(noteWindow(id)).toBeUndefined();
  });
});
