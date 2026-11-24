/**
 * The notes file: save and load, both builds, one format. A file loads all or nothing, through
 * P1's whole check, and a refusal names a sentence of the design (M8), never the value. A draft
 * is not a note, so it can never reach a saved file.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadNotesFile, saveNotesFile, triggerDownload } from "./file";
import { usePlayhead } from "../../store/playhead";
import { createMemoryBacking } from "./memoryBacking";
import { NotesIoError } from "./errors";
import { resetUnsaved, hasUnsaved, marksOf, NO_MARKS } from "./unsaved";
import { useMarksStore } from "../../store/marks";
import type { NotesTransport } from "./transport";
import { createNotesStore } from "../../store/notes";
import { usePivotStore } from "../../store/pivot";
import { bodyOf, clone, fixedUuids, makeNote, VISA } from "../notes/test-fixtures";
import { buildNotesFile } from "../notes/file";
import { LIMITS, type NoteDraft } from "../notes/types";
import { STATUS, fileResult } from "../tooltip-words/notes";

const SCENARIO = "card-fraud";
const draft = (over: Partial<NoteDraft> = {}): NoteDraft => {
  const { id: _id, seq: _seq, ...rest } = makeNote();
  return { ...rest, ...over };
};

async function page(transport: NotesTransport = createMemoryBacking()) {
  const store = createNotesStore(transport.backing);
  await store.getState().load(SCENARIO);
  return { transport, store, deps: { transport, scenario: SCENARIO, store } };
}
const fileOf = (text: string) => ({ size: new TextEncoder().encode(text).length, text: async () => text });

/** The text a save would have downloaded. */
async function savedText(p: Awaited<ReturnType<typeof page>>): Promise<string> {
  const download = vi.fn();
  const r = await saveNotesFile(p.deps, download);
  expect(r.ok).toBe(true);
  return download.mock.calls[0][1] as string;
}

describe("save", () => {
  beforeEach(() => resetUnsaved());

  it("downloads ffr-notes-<scenario>.json holding the scenario's notes and custom categories", async () => {
    const p = await page();
    await p.store.getState().addCategory("Lead");
    await p.store.getState().create(draft({ time: 5, category: "Lead", link: { kind: "auth", id: "tx-1" }, decision: "pass" }));
    const download = vi.fn();
    const r = await saveNotesFile(p.deps, download);
    expect(r.ok).toBe(true);
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][0]).toBe("ffr-notes-card-fraud.json");
    const file = JSON.parse(download.mock.calls[0][1] as string);
    expect(file.format).toBe("ffr-notes");
    expect(file.scenario).toBe(SCENARIO);
    expect(file.categories).toEqual(["Lead"]);
    expect(file.notes).toHaveLength(1);
    expect(Object.keys(file).sort()).toEqual(["categories", "failCategories", "format", "nodes", "notes", "paths", "scenario", "version"]);
    expect(file.version).toBe(2);
    expect(JSON.stringify(file)).not.toMatch(/created|updated|stamp/);
  });

  it("after a save the notes count as saved; a new note makes them unsaved again", async () => {
    const p = await page();
    await p.store.getState().create(draft());
    expect(hasUnsaved(p.store.getState().notes, NO_MARKS)).toBe(true);
    await saveNotesFile(p.deps, vi.fn());
    expect(hasUnsaved(p.store.getState().notes, NO_MARKS)).toBe(false);
    await p.store.getState().create(draft({ time: 6 }));
    expect(hasUnsaved(p.store.getState().notes, NO_MARKS)).toBe(true);
  });

  it("a draft that is open (with text) never reaches the file", async () => {
    const p = await page();
    await p.store.getState().create(draft({ body: bodyOf("Saved note.") }));
    usePivotStore.setState({ windows: [], nextZ: 20 });
    usePivotStore.getState().openNote({ seed: { scenario: SCENARIO, time: 1763556003600, link: null } }, { x: 10, y: 10 });
    const text = await savedText(p);
    expect(text).toContain("Saved note.");
    expect(JSON.parse(text).notes).toHaveLength(1);
    expect(text).not.toContain("seed");
    usePivotStore.setState({ windows: [], nextZ: 20 });
  });

  it("a backend export that fails the file check is not saved; a failed answer says so in E10's words", async () => {
    const p = await page();
    const bad: NotesTransport = { ...p.transport, exportFile: async () => ({ format: "ffr-notes", version: 1, scenario: SCENARIO, categories: [], notes: [{ extra: 1 }] }) };
    const download = vi.fn();
    const r = await saveNotesFile({ ...p.deps, transport: bad }, download);
    expect(r).toEqual({ ok: false, message: STATUS.refused });
    const down: NotesTransport = { ...p.transport, exportFile: async () => Promise.reject(new NotesIoError("no_answer")) };
    const r2 = await saveNotesFile({ ...p.deps, transport: down }, download);
    expect(r2).toEqual({ ok: false, message: STATUS.noAnswer });
    expect(download).not.toHaveBeenCalled();
  });
});

describe("triggerDownload", () => {
  it("writes a JSON Blob through an anchor with a download name, then revokes the URL", async () => {
    let blob: Blob | null = null;
    const anchor = { href: "", download: "", rel: "", click: vi.fn(), remove: vi.fn() };
    const doc = { createElement: vi.fn(() => anchor), body: { append: vi.fn() } };
    const url = { createObjectURL: vi.fn((b: Blob) => ((blob = b), "blob:test-1")), revokeObjectURL: vi.fn() };
    let later: (() => void) | null = null;
    triggerDownload("ffr-notes-card-fraud.json", '{"a":1}', { doc: doc as never, url: url as never, later: (f: () => void) => void (later = f) });
    expect(doc.createElement).toHaveBeenCalledWith("a");
    expect(anchor.href).toBe("blob:test-1");
    expect(anchor.download).toBe("ffr-notes-card-fraud.json");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(blob).not.toBeNull();
    expect((blob as unknown as Blob).type).toBe("application/json");
    expect(await (blob as unknown as Blob).text()).toBe('{"a":1}');
    expect(url.revokeObjectURL).not.toHaveBeenCalled();
    (later as unknown as () => void)();
    expect(url.revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
  });
});

describe("load", () => {
  beforeEach(() => {
    resetUnsaved();
    // the page knows its span of time once its data is loaded; these notes lie inside it
    usePlayhead.setState({ minTime: 0, maxTime: LIMITS.maxTime });
  });
  afterEach(() => usePlayhead.setState({ minTime: 0, maxTime: 0 }));

  async function twoNotesFile() {
    const a = await page();
    await a.store.getState().addCategory("Lead");
    await a.store.getState().create(draft({ time: 100, category: "Lead", decision: "fail", link: { kind: "auth", id: "tx-9" } }));
    await a.store.getState().create(draft({ time: 200, body: bodyOf("Second note.") }));
    return { a, text: await savedText(a) };
  }

  it("a round trip: save in one page, load in a fresh one, and both notes are back", async () => {
    const { a, text } = await twoNotesFile();
    const b = await page();
    const r = await loadNotesFile(fileOf(text), b.deps);
    expect(r).toEqual({ ok: true, message: fileResult.loaded(2) });
    expect(b.store.getState().notes.map((n) => [n.time, n.category, n.decision])).toEqual(a.store.getState().notes.map((n) => [n.time, n.category, n.decision]));
    expect(b.store.getState().notes.map((n) => n.body)).toEqual(a.store.getState().notes.map((n) => n.body));
    expect(b.store.getState().customCategories).toEqual(["Lead"]);
    expect(hasUnsaved(b.store.getState().notes, NO_MARKS)).toBe(false);
  });

  it("loading the same file again replaces the notes with the same ids: no copies", async () => {
    const { a, text } = await twoNotesFile();
    const r = await loadNotesFile(fileOf(text), a.deps);
    expect(r.ok).toBe(true);
    expect(a.store.getState().notes).toHaveLength(2);
  });

  it("a note holding a card number refuses the whole file: nothing loads and E-sentence M8 'card' shows", async () => {
    const { text } = await twoNotesFile();
    const doc = JSON.parse(text);
    doc.notes[1].body = bodyOf(`Card ${VISA} seen`);
    const b = await page();
    const r = await loadNotesFile(fileOf(JSON.stringify(doc)), b.deps);
    expect(r).toEqual({ ok: false, message: fileResult.card });
    expect(r.message).not.toContain("4111");
    expect(b.store.getState().notes).toEqual([]);
    expect(((await b.transport.backing.list(SCENARIO)) as { notes: unknown[] }).notes).toEqual([]);
  });

  it("a card number in a category, a link, or a note id refuses the file the same way", async () => {
    const { text } = await twoNotesFile();
    for (const edit of [
      (d: ReturnType<typeof JSON.parse>) => void (d.categories = [VISA]),
      (d: ReturnType<typeof JSON.parse>) => void (d.notes[0].link = { kind: "auth", id: VISA }),
      (d: ReturnType<typeof JSON.parse>) => void (d.notes[0].id = `note-${VISA}${"a".repeat(16)}`),
    ]) {
      const doc = JSON.parse(text);
      edit(doc);
      const b = await page();
      const r = await loadNotesFile(fileOf(JSON.stringify(doc)), b.deps);
      expect(r).toEqual({ ok: false, message: fileResult.card });
      expect(b.store.getState().notes).toEqual([]);
    }
  });

  it("all or nothing: a clean note before a refused one is not loaded either", async () => {
    const { text } = await twoNotesFile();
    const doc = JSON.parse(text);
    doc.notes[1].body = bodyOf(VISA);
    const b = await page();
    await loadNotesFile(fileOf(JSON.stringify(doc)), b.deps);
    expect(b.store.getState().notes).toHaveLength(0);
  });

  it("not a notes file: not JSON, the wrong format, an extra key", async () => {
    const { text } = await twoNotesFile();
    const b = await page();
    const extra = { ...JSON.parse(text), onload: "x" };
    for (const t of ["not json {", "{}", "[]", JSON.stringify({ ...JSON.parse(text), format: "other" }), JSON.stringify(extra)]) {
      expect(await loadNotesFile(fileOf(t), b.deps)).toEqual({ ok: false, message: fileResult.notFile });
    }
    expect(b.store.getState().notes).toEqual([]);
  });

  it("too large: the size is judged before the text is read", async () => {
    const b = await page();
    const read = vi.fn(async () => "{}");
    const r = await loadNotesFile({ size: LIMITS.fileBytes + 1, text: read }, b.deps);
    expect(r).toEqual({ ok: false, message: fileResult.tooLarge });
    expect(read).not.toHaveBeenCalled();
  });

  it("a file for another scenario than this page's is refused", async () => {
    const { text } = await twoNotesFile();
    const doc = JSON.parse(text);
    doc.scenario = "priya-ato";
    const b = await page();
    expect(await loadNotesFile(fileOf(JSON.stringify(doc)), b.deps)).toEqual({ ok: false, message: fileResult.scenario });
    expect(b.store.getState().notes).toEqual([]);
  });

  it("a file that cannot be read says the backend did not answer when the transport fails", async () => {
    const { text } = await twoNotesFile();
    const b = await page();
    const down: NotesTransport = { ...b.transport, importFile: async () => Promise.reject(new NotesIoError("no_answer")) };
    expect(await loadNotesFile(fileOf(text), { ...b.deps, transport: down })).toEqual({ ok: false, message: STATUS.noAnswer });
    const unreadable = { size: 10, text: async () => Promise.reject(new Error("read failed")) };
    expect(await loadNotesFile(unreadable, b.deps)).toEqual({ ok: false, message: fileResult.notFile });
  });

  it("the backend refusing an import says the design's sentence for its code, never the value", async () => {
    const { text } = await twoNotesFile();
    const b = await page();
    for (const [code, message] of [
      ["card_number", fileResult.card],
      ["too_large", fileResult.tooLarge],
      ["bad_scenario", fileResult.scenario],
      ["limit_reached", STATUS.limit],
      ["bad_file", fileResult.notFile],
    ] as const) {
      const t: NotesTransport = { ...b.transport, importFile: async () => Promise.reject(new NotesIoError(code)) };
      expect(await loadNotesFile(fileOf(text), { ...b.deps, transport: t })).toEqual({ ok: false, message });
    }
  });

  it("the file a page saves passes the page's own check when built straight from the store", async () => {
    const p = await page();
    await p.store.getState().create(draft());
    const direct = buildNotesFile(SCENARIO, [], p.store.getState().notes);
    expect(JSON.parse(await savedText(p))).toEqual(clone(direct));
  });
});

describe("load and the page's span of time (the playhead's bounds)", () => {
  beforeEach(() => resetUnsaved());
  afterEach(() => usePlayhead.setState({ minTime: 0, maxTime: 0 }));

  async function fileAt(times: number[]) {
    const a = await page();
    for (const time of times) await a.store.getState().create(draft({ time }));
    return savedText(a);
  }

  it("loads a file whose notes lie inside the span, ends included", async () => {
    usePlayhead.setState({ minTime: 1000, maxTime: 2000 });
    const text = await fileAt([1000, 1500, 2000]);
    const b = await page();
    expect(await loadNotesFile(fileOf(text), b.deps)).toEqual({ ok: true, message: fileResult.loaded(3) });
    expect(b.store.getState().notes).toHaveLength(3);
  });

  it("refuses the whole file for one time outside the span, loads nothing and never says the time", async () => {
    usePlayhead.setState({ minTime: 1000, maxTime: 2000 });
    const text = await fileAt([1000, 1500, 2000]);
    const doc = JSON.parse(text);
    doc.notes[2].time = 1763556000000; // 13 digits, passes Luhn: it would reach the address as the playhead
    const b = await page();
    const r = await loadNotesFile(fileOf(JSON.stringify(doc)), b.deps);
    expect(r).toEqual({ ok: false, message: fileResult.notFile });
    expect(r.message).not.toContain("1763556000000");
    expect(b.store.getState().notes).toEqual([]);
    expect(((await b.transport.backing.list(SCENARIO)) as { notes: unknown[] }).notes).toEqual([]);
  });

  it("refuses a time just below the span too", async () => {
    usePlayhead.setState({ minTime: 1000, maxTime: 2000 });
    const doc = JSON.parse(await fileAt([1500]));
    doc.notes[0].time = 999;
    const b = await page();
    expect(await loadNotesFile(fileOf(JSON.stringify(doc)), b.deps)).toEqual({ ok: false, message: fileResult.notFile });
  });

  it("when the page does not know its bounds yet, a file with notes is refused and a file without notes loads", async () => {
    const text = await fileAt([1000]);
    usePlayhead.setState({ minTime: 0, maxTime: 0 });
    const b = await page();
    expect(await loadNotesFile(fileOf(text), b.deps)).toEqual({ ok: false, message: fileResult.notFile });
    expect(b.store.getState().notes).toEqual([]);
    const empty = JSON.stringify({ format: "ffr-notes", version: 1, scenario: SCENARIO, categories: [], notes: [] });
    expect(await loadNotesFile(fileOf(empty), b.deps)).toEqual({ ok: true, message: fileResult.loaded(0) });
  });
});

describe("the marks in the file (the page's marks store)", () => {
  const R1 = { kind: "stop", id: "rec-1" };
  const R2 = { kind: "stop", id: "rec-2" };
  const reset = () => {
    resetUnsaved();
    useMarksStore.getState().setBacking(null);
    useMarksStore.getState().clear();
    usePlayhead.setState({ minTime: 0, maxTime: LIMITS.maxTime });
  };
  beforeEach(reset);
  afterEach(() => {
    reset();
    usePlayhead.setState({ minTime: 0, maxTime: 0 });
  });

  /** A page whose marks store reads and writes this page's transport. */
  async function markedPage() {
    const p = await page(createMemoryBacking(fixedUuids()));
    useMarksStore.getState().setBacking(p.transport.marks);
    await useMarksStore.getState().load(SCENARIO);
    return p;
  }
  const unsaved = (p: Awaited<ReturnType<typeof page>>) => hasUnsaved(p.store.getState().notes, marksOf(useMarksStore.getState()));

  it("a save with the marks store holding a node marks the page saved; a later press makes it unsaved again", async () => {
    const p = await markedPage();
    await useMarksStore.getState().pressDisposition(R1, "fail");
    await useMarksStore.getState().addFailCategory("Lead");
    expect(unsaved(p)).toBe(true);
    const text = await savedText(p);
    const file = JSON.parse(text);
    expect(file.nodes).toEqual([{ record: R1, pinned: false, disposition: "fail", category: null, settled: true }]);
    expect(file.failCategories).toEqual(["Lead"]);
    expect(unsaved(p)).toBe(false);
    await useMarksStore.getState().togglePin(R2);
    expect(unsaved(p)).toBe(true);
  });

  it("a version 1 file loads into a page whose marks store has no backing: today's sentence, no throw", async () => {
    const b = await page();
    expect(useMarksStore.getState().backing).toBeNull();
    const v1 = JSON.stringify({ format: "ffr-notes", version: 1, scenario: SCENARIO, categories: [], notes: [] });
    await expect(loadNotesFile(fileOf(v1), b.deps)).resolves.toEqual({ ok: true, message: fileResult.loaded(0) });
    expect(useMarksStore.getState().error).toBeNull();
  });

  it("a load with the marks store backed reloads the marks, and a file that holds all of them marks the page saved", async () => {
    const a = await markedPage();
    await useMarksStore.getState().pressDisposition(R1, "pass");
    await useMarksStore.getState().togglePin(R2);
    await useMarksStore.getState().addFailCategory("Lead");
    await useMarksStore.getState().createPath([R1, R2]);
    const text = await savedText(a);

    useMarksStore.getState().setBacking(null);
    useMarksStore.getState().clear();
    const b = await markedPage();
    expect(useMarksStore.getState().nodes).toEqual([]);
    const r = await loadNotesFile(fileOf(text), b.deps);
    expect(r).toEqual({ ok: true, message: fileResult.loaded(0) });
    const s = useMarksStore.getState();
    expect(s.nodes.map((n) => [n.record.id, n.disposition, n.pinned, n.settled])).toEqual([
      ["rec-1", "pass", false, true],
      ["rec-2", "none", true, false],
    ]);
    expect(s.paths).toHaveLength(1);
    expect(s.failCategories).toEqual(["Lead"]);
    expect(unsaved(b)).toBe(false);
  });

  it("a page that holds a node the file lacks is not marked saved", async () => {
    const a = await markedPage();
    await useMarksStore.getState().pressDisposition(R1, "pass");
    const text = await savedText(a);

    useMarksStore.getState().setBacking(null);
    useMarksStore.getState().clear();
    const b = await markedPage();
    await useMarksStore.getState().pressDisposition(R2, "fail");
    await loadNotesFile(fileOf(text), b.deps);
    expect(useMarksStore.getState().nodes).toHaveLength(2);
    expect(unsaved(b)).toBe(true);
  });

  it("a failed marks reload leaves the file's sentence as it is; the error stays in the marks store", async () => {
    const a = await markedPage();
    await useMarksStore.getState().pressDisposition(R1, "pass");
    const text = await savedText(a);
    const b = await page();
    useMarksStore.getState().setBacking({
      ...b.transport.marks,
      list: async () => {
        throw new Error("down");
      },
    });
    const r = await loadNotesFile(fileOf(text), b.deps);
    expect(r).toEqual({ ok: true, message: fileResult.loaded(0) });
    expect(useMarksStore.getState().error).toMatchObject({ code: "backing_failed" });
  });

  describe("the move of saved note marks (D6)", () => {
    /** The text of a version 1 file (notes only) holding these notes, as an old build wrote it. */
    const v1 = (...notes: Parameters<typeof makeNote>[0][]) =>
      JSON.stringify({
        format: "ffr-notes",
        version: 1,
        scenario: SCENARIO,
        categories: [],
        notes: notes.map((over, i) => {
          const { scenario: _s, ...inFile } = makeNote({ ...over, id: `note-${(i + 1).toString(16).padStart(32, "0")}`, seq: i + 1 });
          return inFile;
        }),
      });
    const nodeOf = (id: string) => useMarksStore.getState().nodes.find((n) => n.record.id === id);

    it("a version 1 file with a linked PASS note loads, the record then has a PASS node, and the note still holds PASS", async () => {
      const b = await markedPage();
      const r = await loadNotesFile(fileOf(v1({ link: R1, decision: "pass" })), b.deps);
      expect(r).toEqual({ ok: true, message: fileResult.loaded(1) });
      expect(nodeOf("rec-1")).toMatchObject({ disposition: "pass", pinned: false, category: null, settled: true });
      expect(b.store.getState().notes.map((n) => n.decision)).toEqual(["pass"]);
      const held = (await b.transport.backing.list(SCENARIO)) as { notes: { decision: string }[] };
      expect(held.notes.map((n) => n.decision)).toEqual(["pass"]);
    });

    it("the move is derived from the file's notes, so the page is still in a file after it", async () => {
      const b = await markedPage();
      await loadNotesFile(fileOf(v1({ link: R1, decision: "fail" })), b.deps);
      expect(nodeOf("rec-1")?.disposition).toBe("fail");
      expect(unsaved(b)).toBe(false);
      await useMarksStore.getState().togglePin(R2);
      expect(unsaved(b)).toBe(true);
    });

    it("a second load of the same file writes nothing new", async () => {
      const b = await markedPage();
      const text = fileOf(v1({ link: R1, decision: "pass" }));
      await loadNotesFile(text, b.deps);
      const put = vi.spyOn(b.transport.marks, "putNode");
      await loadNotesFile(text, b.deps);
      expect(put).not.toHaveBeenCalled();
      expect(nodeOf("rec-1")).toMatchObject({ disposition: "pass", settled: true });
    });

    it("notes that disagree leave the record unmarked and settled, and both notes keep their marks", async () => {
      const b = await markedPage();
      await loadNotesFile(fileOf(v1({ link: R1, decision: "pass" }, { link: R1, decision: "fail" })), b.deps);
      expect(nodeOf("rec-1")).toMatchObject({ disposition: "none", settled: true });
      expect(b.store.getState().notes.map((n) => n.decision).sort()).toEqual(["fail", "pass"]);
    });

    it("a note with no record is not moved and keeps its own mark", async () => {
      const b = await markedPage();
      await loadNotesFile(fileOf(v1({ link: null, decision: "pass" })), b.deps);
      expect(useMarksStore.getState().nodes).toEqual([]);
      expect(b.store.getState().notes[0].decision).toBe("pass");
    });

    it("a pinned record the page held takes the PASS and keeps its pin; a record settled by a press keeps its FAIL", async () => {
      const b = await markedPage();
      await useMarksStore.getState().togglePin(R1);
      await useMarksStore.getState().pressDisposition(R2, "fail");
      await loadNotesFile(fileOf(v1({ link: R1, decision: "pass" }, { link: R2, decision: "pass", time: makeNote().time + 1000 })), b.deps);
      expect(nodeOf("rec-1")).toMatchObject({ disposition: "pass", pinned: true, settled: true });
      expect(nodeOf("rec-2")).toMatchObject({ disposition: "fail", settled: true });
    });

    it("a marks store with no backing moves nothing and does not throw", async () => {
      const b = await page();
      await expect(loadNotesFile(fileOf(v1({ link: R1, decision: "pass" })), b.deps)).resolves.toEqual({ ok: true, message: fileResult.loaded(1) });
      expect(useMarksStore.getState().nodes).toEqual([]);
    });

    it("a failed marks reload moves nothing", async () => {
      const b = await page();
      useMarksStore.getState().setBacking({
        ...b.transport.marks,
        list: async () => {
          throw new Error("down");
        },
      });
      const put = vi.spyOn(b.transport.marks, "putNode");
      await loadNotesFile(fileOf(v1({ link: R1, decision: "pass" })), b.deps);
      expect(put).not.toHaveBeenCalled();
    });
  });

  it("a file with a card number in a node refuses the whole file and loads no mark", async () => {
    const a = await markedPage();
    await useMarksStore.getState().pressDisposition(R1, "pass");
    const doc = JSON.parse(await savedText(a));
    doc.nodes[0].record.id = "rec-" + VISA;
    const b = await markedPage();
    expect(await loadNotesFile(fileOf(JSON.stringify(doc)), b.deps)).toEqual({ ok: false, message: fileResult.card });
    expect(useMarksStore.getState().nodes).toEqual([]);
  });
});
