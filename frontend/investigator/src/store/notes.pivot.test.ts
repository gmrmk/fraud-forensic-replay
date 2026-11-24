/**
 * The note window's place in the workspace store: it opens pinned (a glance or a trace must not
 * evict unsaved text), it opens once for one saved note, and closeWindow checks a dirty flag.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { usePivotStore, type NoteWindowState } from "./pivot";

const SEED = { scenario: "card-fraud", time: 1763556003600, link: null };
const st = () => usePivotStore.getState();
const note = (id: string): NoteWindowState => {
  const w = st().windows.find((x) => x.id === id);
  if (!w || w.kind !== "note") throw new Error("not a note window");
  return w;
};

describe("note windows in the pivot store", () => {
  beforeEach(() => usePivotStore.setState({ windows: [], nextZ: 20 }));

  it("a draft opens pinned, clean, not asked to close, on the screen at the given place", () => {
    const id = st().openNote({ seed: SEED }, { x: 120, y: 90 });
    const w = note(id);
    expect(w.kind).toBe("note");
    expect(w.noteId).toBeNull();
    expect(w.seed).toEqual(SEED);
    expect(w.pinned).toBe(true);
    expect(w.dirty).toBe(false);
    expect(w.closeAsked).toBe(false);
    expect(w.anchor).toEqual({ type: "screen", x: 120, y: 90 });
  });

  it("a glance or a trace does not evict a note window, even when it is unpinned", () => {
    const id = st().openNote({ seed: SEED }, { x: 10, y: 10 });
    st().togglePinned(id); // the person unpins it
    st().setNoteDirty(id, true);
    st().openGlance({ kind: "place", place: { id: "p", name: "P", category: "c", lat: 0, lng: 0 } }, { x: 5, y: 5 });
    expect(st().windows.some((w) => w.id === id)).toBe(true);
  });

  it("a saved note opens once: asking again raises the same window", () => {
    const a = st().openNote({ noteId: "note-0123456789abcdef0123456789abcdef" }, { x: 10, y: 10 });
    const z = note(a).z;
    const b = st().openNote({ noteId: "note-0123456789abcdef0123456789abcdef" }, { x: 99, y: 99 });
    expect(b).toBe(a);
    expect(st().windows).toHaveLength(1);
    expect(note(a).z).toBeGreaterThan(z);
  });

  it("closeWindow closes a clean note window", () => {
    const id = st().openNote({ seed: SEED }, { x: 10, y: 10 });
    st().closeWindow(id);
    expect(st().windows).toHaveLength(0);
  });

  it("closeWindow keeps a dirty note window open and sets the question", () => {
    const id = st().openNote({ seed: SEED }, { x: 10, y: 10 });
    st().setNoteDirty(id, true);
    st().closeWindow(id);
    expect(st().windows).toHaveLength(1);
    expect(note(id).closeAsked).toBe(true);
  });

  it("a folded dirty window is unfolded by the close, so the question is in sight", () => {
    const id = st().openNote({ seed: SEED }, { x: 10, y: 10 });
    st().toggleCollapsed(id);
    expect(note(id).collapsed).toBe(true);
    st().setNoteDirty(id, true);
    st().closeWindow(id);
    expect(note(id).closeAsked).toBe(true);
    expect(note(id).collapsed).toBe(false);
  });

  it("cancelNoteClose clears the question; discardNote removes the window whatever the flag", () => {
    const id = st().openNote({ seed: SEED }, { x: 10, y: 10 });
    st().setNoteDirty(id, true);
    st().closeWindow(id);
    st().cancelNoteClose(id);
    expect(note(id).closeAsked).toBe(false);
    expect(note(id).dirty).toBe(true);
    st().discardNote(id);
    expect(st().windows).toHaveLength(0);
  });

  it("making the window clean again clears an open question", () => {
    const id = st().openNote({ seed: SEED }, { x: 10, y: 10 });
    st().setNoteDirty(id, true);
    st().closeWindow(id);
    st().setNoteDirty(id, false);
    expect(note(id).closeAsked).toBe(false);
  });

  it("bindNote ties a saved draft to its note, so the window then edits that note", () => {
    const id = st().openNote({ seed: SEED }, { x: 10, y: 10 });
    st().bindNote(id, "note-0123456789abcdef0123456789abcdef");
    expect(note(id).noteId).toBe("note-0123456789abcdef0123456789abcdef");
    const again = st().openNote({ noteId: "note-0123456789abcdef0123456789abcdef" });
    expect(again).toBe(id);
  });

  it("closeWindow still closes the other kinds of window without a question", () => {
    st().openTrace("d1", { x: 1, y: 1 });
    const id = st().windows[0].id;
    st().closeWindow(id);
    expect(st().windows).toHaveLength(0);
  });
});
