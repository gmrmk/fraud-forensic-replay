/**
 * The note window's doors and Save: EVERY new note closes on its first good Save, linked to a record or not,
 * and gives focus back to its opener; a saved note's Save never closes it. A Save the backend refuses
 * closes nothing and moves no focus. Discard, the question's Save and Delete hand focus back too. The
 * link line prints the kind's label from the story's manifest. Beside NoteWindow.test.tsx, which holds
 * the window's other cases, so neither file grows past its readable size.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { PivotWindowsLayer } from "../pivot/PivotWindowsLayer";
import { usePivotStore } from "../../store/pivot";
import { useNotesStore } from "../../store/notes";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { when } from "../../lib/time-words";
import { noteOpenedFrom } from "../../lib/window-focus";
import { SAVE_TIP } from "../../lib/tooltip-words/notes";
import type { ScenarioNode } from "../../lib/scenarios";
import type { PivotContext } from "../../lib/matches";
import { VISA, bodyOf, makeNote } from "../../lib/notes/test-fixtures";
import { CONTEXT, NOTE_TIME, RECORD, SCENARIO, fakeBacking, fakeClipboard } from "./test-support";

const LINKED = { kind: "stop", id: "rec-1" };
const STOP_NODE: ScenarioNode = { kind: "stop", label: "Stop", palette: "#7ee787", source: "json", coords: null, timestamp: "at", primary: "${id}" };
const AUTH_NODE: ScenarioNode = { kind: "auth", label: "Authorization", palette: "#7ee787", source: "json", coords: null, timestamp: "at", primary: "${id}" };

let opener: HTMLButtonElement;
let backing: ReturnType<typeof fakeBacking>;

beforeEach(() => {
  usePivotStore.setState({ windows: [], nextZ: 20 });
  usePlayhead.setState({ playhead: NOTE_TIME, isPlaying: false });
  backing = fakeBacking();
  useNotesStore.setState({ backing, scenario: SCENARIO, notes: [], customCategories: [], skipped: 0, error: null });
  useSchema.setState({ nodes: [] });
  opener = document.createElement("button");
  document.body.appendChild(opener);
});
afterEach(() => opener.remove());

/** A new draft, opened as a door opens it: with its opener remembered. */
function openDraft(link: { kind: string; id: string } | null, time = NOTE_TIME): string {
  let id = "";
  act(() => {
    id = usePivotStore.getState().openNote({ seed: { scenario: SCENARIO, time, link } }, { x: 100, y: 100 });
    noteOpenedFrom(id, opener);
  });
  return id;
}
function layer(context: PivotContext = CONTEXT) {
  return render(<PivotWindowsLayer map={null} decisions={[]} context={context} />);
}
const windows = () => usePivotStore.getState().windows;
const noteWindow = (id: string) => windows().find((w) => w.id === id);
const textbox = () => screen.getByRole("textbox", { name: "Note text" });
const status = () => screen.getByRole("status");
const saveButton = () => screen.getByRole("button", { name: "Save the note." });
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
async function askToClose() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
  });
}

describe.each<[string, { kind: string; id: string } | null]>([
  ["made from a record", LINKED],
  ["with no record", null],
])("a new note %s closes on its first Save", (_door, link) => {
  it("Save stores it once, closes the window and gives focus to the opener", async () => {
    const id = openDraft(link);
    layer();
    await paste("Seen at the terminal.");
    await press("Save the note.");
    const notes = useNotesStore.getState().notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ link, time: NOTE_TIME, scenario: SCENARIO });
    expect(backing.rows.size).toBe(1);
    expect(noteWindow(id)).toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });

  it("Ctrl+Enter in the editor does the same", async () => {
    const id = openDraft(link);
    layer();
    await paste("Seen at the terminal.");
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: "Enter", ctrlKey: true });
    });
    expect(useNotesStore.getState().notes).toHaveLength(1);
    expect(backing.rows.size).toBe(1);
    expect(noteWindow(id)).toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });

  // The editor refuses a pasted card number before Save is pressed, so Save has no number to refuse
  // (a refused paste leaves an empty note, which stores). The refusal Save can meet is the backend's.
  it("a pasted card number is refused by the editor and never reaches the store", async () => {
    openDraft(link);
    layer();
    await paste(VISA);
    expect(status().textContent).toBe("The note has a number that looks like a card number. Remove it, then save.");
    await press("Save the note.");
    expect(JSON.stringify(useNotesStore.getState().notes)).not.toContain(VISA);
    expect(JSON.stringify([...backing.rows.values()])).not.toContain(VISA);
  });

  it("a backend that does not answer keeps the window and gives focus nowhere", async () => {
    const id = openDraft(link);
    layer();
    useNotesStore.setState({ backing: { ...fakeBacking(), create: async () => { throw new Error("down"); } } });
    fireEvent.click(screen.getByRole("radio", { name: "Colour 2" }));
    await press("Save the note.");
    expect(noteWindow(id)).toBeDefined();
    expect(useNotesStore.getState().notes).toEqual([]);
    expect(document.activeElement).not.toBe(opener);
    expect(status().textContent).toBe("The backend did not answer. The note is not saved. Press Save to try again.");
  });

  it("a Save the store refuses (a reply that is no note) keeps the window and gives focus nowhere", async () => {
    const id = openDraft(link);
    layer();
    useNotesStore.setState({ backing: { ...fakeBacking(), create: async () => ({}) as never } });
    fireEvent.click(screen.getByRole("radio", { name: "Colour 2" }));
    await press("Save the note.");
    expect(noteWindow(id)).toBeDefined();
    expect(useNotesStore.getState().notes).toEqual([]);
    expect(document.activeElement).not.toBe(opener);
  });

  it("Save's tooltip says it closes the window", () => {
    openDraft(link);
    layer();
    expect(saveButton().getAttribute("data-tip")).toBe(SAVE_TIP.draft);
  });
});

describe("a link removed in the window before the first Save", () => {
  // Every new note closes on its first Save, so the link the person leaves in or takes out changes nothing.
  it("still closes the window and stores the note with no link", async () => {
    const id = openDraft(LINKED);
    layer();
    fireEvent.click(screen.getByRole("button", { name: "Remove the link." }));
    await press("Save the note.");
    expect(useNotesStore.getState().notes[0].link).toBeNull();
    expect(noteWindow(id)).toBeUndefined();
  });
});

describe("a note that is not new keeps today's Save", () => {
  it("a saved note changed and saved stays open and says Saved", async () => {
    const note = makeNote({ id: "note-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeee1", link: LINKED, body: bodyOf("Saved note.") });
    const backing = fakeBacking();
    backing.rows.set(note.id, note);
    useNotesStore.setState({ backing, notes: [note] });
    let id = "";
    act(() => {
      id = usePivotStore.getState().openNote({ noteId: note.id }, { x: 80, y: 80 });
      noteOpenedFrom(id, opener);
    });
    layer();
    expect(saveButton().getAttribute("data-tip")).toBe(SAVE_TIP.saved);
    fireEvent.click(screen.getByRole("radio", { name: "Colour 4" }));
    await press("Save the note.");
    expect(noteWindow(id)).toBeDefined();
    expect(status().textContent).toBe("Saved.");
    expect(backing.rows.get(note.id)).toMatchObject({ colour: "r3" });
  });
});

describe("Save's tooltip says what a press does", () => {
  it("a saved note opened in its window says it saves the changes", async () => {
    const note = makeNote({ id: "note-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeee2", link: null, body: bodyOf("Saved free note.") });
    backing.rows.set(note.id, note);
    useNotesStore.setState({ notes: [note] });
    act(() => {
      usePivotStore.getState().openNote({ noteId: note.id }, { x: 80, y: 80 });
    });
    layer();
    expect(saveButton().getAttribute("data-tip")).toBe(SAVE_TIP.saved);
  });

  it("a new note says it closes the window, and after its first Save the tooltip is gone with the window", async () => {
    const id = openDraft(null);
    layer();
    expect(saveButton().getAttribute("data-tip")).toBe(SAVE_TIP.draft);
    await press("Save the note.");
    expect(noteWindow(id)).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Save the note." })).toBeNull();
  });
});

describe("the window's own closes hand focus back to the opener", () => {
  async function dirtyDraft(link: { kind: string; id: string } | null) {
    const id = openDraft(link);
    layer();
    fireEvent.click(screen.getByRole("radio", { name: "Colour 4" }));
    await askToClose();
    expect(noteWindow(id)).toBeDefined(); // the window asks
    expect(document.activeElement).not.toBe(opener); // the question holds focus, though the x consumed the opener
    return id;
  }

  it("x then Discard", async () => {
    const id = await dirtyDraft(LINKED);
    await press("Discard");
    expect(noteWindow(id)).toBeUndefined();
    expect(document.activeElement).toBe(opener);
    expect(useNotesStore.getState().notes).toEqual([]);
  });

  it("x then the question's Save stores the note, closes, and gives focus back", async () => {
    const id = await dirtyDraft(LINKED);
    const group = screen.getByRole("group", { name: "This note has changes that are not saved." });
    await act(async () => {
      fireEvent.click(within(group).getByRole("button", { name: "Save" }));
    });
    expect(useNotesStore.getState().notes).toHaveLength(1);
    expect(noteWindow(id)).toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });

  it("x then Discard of a note with no record", async () => {
    const id = await dirtyDraft(null);
    await press("Discard");
    expect(noteWindow(id)).toBeUndefined();
    expect(document.activeElement).toBe(opener);
    expect(useNotesStore.getState().notes).toEqual([]);
  });

  it("the question's Save of a note with no record stores it, closes, and gives focus back", async () => {
    const id = await dirtyDraft(null);
    const group = screen.getByRole("group", { name: "This note has changes that are not saved." });
    await act(async () => {
      fireEvent.click(within(group).getByRole("button", { name: "Save" }));
    });
    expect(useNotesStore.getState().notes).toHaveLength(1);
    expect(noteWindow(id)).toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });

  it("the question's Save, refused by the backend, keeps the window and gives focus nowhere", async () => {
    const id = await dirtyDraft(null);
    useNotesStore.setState({ backing: { ...fakeBacking(), create: async () => { throw new Error("down"); } } });
    const group = screen.getByRole("group", { name: "This note has changes that are not saved." });
    await act(async () => {
      fireEvent.click(within(group).getByRole("button", { name: "Save" }));
    });
    expect(noteWindow(id)).toBeDefined();
    expect(document.activeElement).not.toBe(opener);
  });

  it("Delete of a saved note", async () => {
    const note = makeNote({ id: "note-ffffffffffffffffffffffffffffffff1", body: bodyOf("To delete.") });
    useNotesStore.setState({ notes: [note] });
    let id = "";
    act(() => {
      id = usePivotStore.getState().openNote({ noteId: note.id }, { x: 80, y: 80 });
      noteOpenedFrom(id, opener);
    });
    layer();
    await press("Delete the note.");
    await press("Delete");
    expect(noteWindow(id)).toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });
});

describe("a new window", () => {
  it("holds focus in its editor right after mount (the caret)", () => {
    openDraft(LINKED);
    layer();
    expect(document.activeElement).toBe(textbox());
  });

  it("is titled with the time it was seeded with, not the playhead's", () => {
    const later = NOTE_TIME + 3_600_000;
    openDraft(LINKED, later);
    layer();
    expect(usePlayhead.getState().playhead).toBe(NOTE_TIME);
    expect(screen.getByRole("dialog", { name: `Note, ${when(later)}` })).toBeTruthy();
  });

  it("keeps the two card lines under the text", () => {
    openDraft(LINKED);
    layer();
    expect(screen.getByText("Do not type card data.")).toBeTruthy();
    expect(screen.getByText("The editor refuses card numbers only.")).toBeTruthy();
  });
});

describe("the link line prints the kind's label from the story's manifest", () => {
  it("with a node for the kind, its label", () => {
    useSchema.setState({ nodes: [STOP_NODE] });
    openDraft(LINKED);
    layer();
    expect(screen.getByText("Linked record: Stop: Corner Store")).toBeTruthy();
  });

  it("with no node for the kind, the kind itself", () => {
    useSchema.setState({ nodes: [AUTH_NODE] });
    openDraft(LINKED);
    layer();
    expect(screen.getByText("Linked record: stop: Corner Store")).toBeTruthy();
  });

  it("a link of kind fraud prints the label of the auth node (the canonical kind)", () => {
    useSchema.setState({ nodes: [AUTH_NODE, STOP_NODE] });
    const tx = { ...RECORD, id: "tx-1", kind: "auth" };
    openDraft({ kind: "fraud", id: "tx-1" });
    layer({ transactions: [], logins: [], places: [], entities: [tx] });
    expect(screen.getByText("Linked record: Authorization: Corner Store")).toBeTruthy();
  });
});
