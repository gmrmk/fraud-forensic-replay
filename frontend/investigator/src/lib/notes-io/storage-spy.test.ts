/**
 * No note text goes to the browser's stores: not Storage (local or session) and not IndexedDB.
 * The spies first prove they can see a write, then run a whole session of notes: a category,
 * a create, an update, a remove, a draft window, a file save and a file load. A second session does
 * the same for the investigator's marks (nodes, paths, Fail categories) and the Layers switches.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemoryBacking } from "./memoryBacking";
import { loadNotesFile, saveNotesFile } from "./file";
import { resetUnsaved } from "./unsaved";
import { useLayers } from "../../store/layers";
import { createMarksStore } from "../../store/marks";
import { createNotesStore } from "../../store/notes";
import { usePivotStore } from "../../store/pivot";
import { bodyOf, fixedUuids, makeNote } from "../notes/test-fixtures";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  usePivotStore.setState({ windows: [], nextZ: 20 });
  resetUnsaved();
});

describe("no browser storage", () => {
  it("the spies see a write when one happens", () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    localStorage.setItem("probe", "1");
    sessionStorage.setItem("probe", "1");
    expect(set).toHaveBeenCalledTimes(2);
    localStorage.removeItem("probe");
    sessionStorage.removeItem("probe");
  });

  it("a session of notes writes nothing to Storage or IndexedDB", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const clear = vi.spyOn(Storage.prototype, "clear");
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open, deleteDatabase: vi.fn() });

    const transport = createMemoryBacking();
    const store = createNotesStore(transport.backing);
    const deps = { transport, scenario: "card-fraud", store };
    await store.getState().load("card-fraud");
    await store.getState().addCategory("Lead");
    const { id: _id, seq: _seq, ...rest } = makeNote({ body: bodyOf("A private sentence about the case.") });
    const made = await store.getState().create({ ...rest, category: "Lead" });
    if (!made.ok) throw new Error("create failed");
    await store.getState().update(made.value.id, { link: null, colour: "r2", category: "Lead", decision: "pass", body: bodyOf("Changed private sentence.") });
    usePivotStore.getState().openNote({ seed: { scenario: "card-fraud", time: 1763556003600, link: null } }, { x: 1, y: 1 });
    let saved = "";
    await saveNotesFile(deps, (_name: string, text: string) => void (saved = text));
    expect(saved).toContain("Changed private sentence.");
    await loadNotesFile({ size: saved.length, text: async () => saved }, deps);
    await store.getState().remove(made.value.id);

    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("a whole session of marks writes nothing to Storage or IndexedDB: nodes, a pin, a Fail category, a path made, renamed and removed, a save, a load, and the four Layers switches", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const clear = vi.spyOn(Storage.prototype, "clear");
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open, deleteDatabase: vi.fn() });

    const transport = createMemoryBacking(fixedUuids());
    const notes = createNotesStore(transport.backing);
    const marks = createMarksStore(transport.marks);
    const deps = { transport, scenario: "card-fraud", store: notes };
    const R1 = { kind: "stop", id: "rec-1" };
    const R2 = { kind: "stop", id: "rec-2" };
    await notes.getState().load("card-fraud");
    await marks.getState().load("card-fraud");
    await marks.getState().pressDisposition(R1, "fail");
    await marks.getState().setCategory(R1, "A private category");
    await marks.getState().togglePin(R2);
    await marks.getState().addFailCategory("A typed Fail category");
    const path = await marks.getState().createPath([R1, R2]);
    if (!path.ok) throw new Error("create failed");
    await marks.getState().updatePath(path.value.id, { name: "A renamed path", stops: [R2, R1] });
    await marks.getState().removePath(path.value.id);
    let saved = "";
    await saveNotesFile(deps, (_name: string, text: string) => void (saved = text));
    expect(saved).toContain("A private category");
    expect(saved).toContain("A typed Fail category");
    await loadNotesFile({ size: saved.length, text: async () => saved }, deps);

    const layers = useLayers.getState();
    layers.toggleKind("signin");
    layers.toggleValue("signin", "vpn");
    layers.toggleYours();
    layers.toggleFacet("pinned");

    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
