/**
 * The page's wiring of notes, in one hook: choose the transport by the build, load the notes
 * once the scenario is known, register the Inspector's renderer for a note, and arm the
 * question before the page unloads (static build only). App.tsx calls this hook and nothing
 * else of notes logic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useNotesBoot } from "./useNotesBoot";
import { saveNotesFile } from "./file";
import { currentTransport, resetNotesTransport } from "./session";
import { resetUnsaved } from "./unsaved";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { useSchema } from "../../store/schema";
import { entityRendererRegistry } from "../entity";
import { makeNode, makeNote } from "../notes/test-fixtures";

const flag = vi.hoisted(() => ({ isStatic: true }));
vi.mock("../build-flags", () => ({
  get IS_STATIC_BUILD() {
    return flag.isStatic;
  },
}));

function Probe() {
  useNotesBoot();
  return null;
}

beforeEach(() => {
  flag.isStatic = true;
  resetNotesTransport();
  resetUnsaved();
  useNotesStore.getState().setBacking(null);
  useNotesStore.getState().clear();
  useMarksStore.getState().setBacking(null);
  useMarksStore.getState().clear();
  useSchema.setState({ scenarioId: null });
  entityRendererRegistry.delete("note");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useNotesBoot", () => {
  it("static build: memory backing, and the notes load once the scenario is known", async () => {
    render(<Probe />);
    expect(useNotesStore.getState().backing).not.toBeNull();
    expect(useNotesStore.getState().scenario).toBeNull();
    act(() => useSchema.setState({ scenarioId: "card-fraud" }));
    await waitFor(() => expect(useNotesStore.getState().scenario).toBe("card-fraud"));
  });

  it("live build: the api backing asks the backend for this scenario's notes", async () => {
    flag.isStatic = false;
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ notes: [], categories: [], skipped: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    act(() => useSchema.setState({ scenarioId: "card-fraud" }));
    render(<Probe />);
    await waitFor(() => expect(useNotesStore.getState().scenario).toBe("card-fraud"));
    expect(fetchSpy).toHaveBeenCalledWith("/api/notes?scenario=card-fraud", expect.anything());
  });

  it("live build: the marks are asked for after the notes, with this scenario, each path answering its own shape", async () => {
    flag.isStatic = false;
    const asked: string[] = [];
    const fetchSpy = vi.fn(async (url: string) => {
      asked.push(url);
      const body = url.startsWith("/api/notes/marks")
        ? { nodes: [makeNode({ pinned: true })], paths: [], failCategories: ["Lead"], skipped: 0 }
        : { notes: [], categories: [], skipped: 0 };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);
    act(() => useSchema.setState({ scenarioId: "card-fraud" }));
    render(<Probe />);
    await waitFor(() => expect(useMarksStore.getState().scenario).toBe("card-fraud"));
    expect(asked).toEqual(["/api/notes?scenario=card-fraud", "/api/notes/marks?scenario=card-fraud"]);
    expect(useMarksStore.getState().nodes).toHaveLength(1);
    expect(useMarksStore.getState().failCategories).toEqual(["Lead"]);
    expect(useMarksStore.getState().backing).not.toBeNull();
  });

  it("static build: the marks load once the scenario is known", async () => {
    render(<Probe />);
    expect(useMarksStore.getState().backing).not.toBeNull();
    act(() => useSchema.setState({ scenarioId: "card-fraud" }));
    await waitFor(() => expect(useMarksStore.getState().scenario).toBe("card-fraud"));
    // Nothing is saved on a note, so nothing is moved.
    expect(useMarksStore.getState().nodes).toEqual([]);
  });

  it("static build: after both loads answer ok, the PASS a linked note saved moves to its record, and the note keeps it", async () => {
    render(<Probe />);
    const transport = currentTransport();
    if (!transport) throw new Error("no transport");
    const { id: _id, seq: _seq, ...rest } = makeNote({ link: { kind: "stop", id: "rec-1" }, decision: "pass" });
    await transport.backing.create(rest);
    act(() => useSchema.setState({ scenarioId: "card-fraud" }));
    await waitFor(() => expect(useMarksStore.getState().nodes).toHaveLength(1));
    expect(useMarksStore.getState().nodes[0]).toMatchObject({ record: { kind: "stop", id: "rec-1" }, disposition: "pass", pinned: false, settled: true });
    expect(useNotesStore.getState().notes[0].decision).toBe("pass");
  });

  it("live build: the move runs once, after the notes and the marks, and writes with ifUnsettled true", async () => {
    flag.isStatic = false;
    const note = makeNote({ link: { kind: "stop", id: "rec-1" }, decision: "fail" });
    const calls: { url: string; method: string; body: string | undefined }[] = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined });
      if (init?.method === "PUT") {
        // The backend answers the stored node: the sent one without the flag.
        const { ifUnsettled: _flag, ...stored } = JSON.parse(init.body as string);
        return new Response(JSON.stringify(stored), { status: 200 });
      }
      const body = url.startsWith("/api/notes/marks") ? { nodes: [], paths: [], failCategories: [], skipped: 0 } : { notes: [note], categories: [], skipped: 0 };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);
    act(() => useSchema.setState({ scenarioId: "card-fraud" }));
    render(<Probe />);
    await waitFor(() => expect(useMarksStore.getState().nodes).toHaveLength(1));
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET /api/notes?scenario=card-fraud", "GET /api/notes/marks?scenario=card-fraud", "PUT /api/notes/marks/node"]);
    expect(JSON.parse(calls[2].body ?? "{}")).toMatchObject({ disposition: "fail", settled: true, ifUnsettled: true });
  });

  it("live build: no move when the marks do not load, and none when the notes do not load", async () => {
    flag.isStatic = false;
    const note = makeNote({ link: { kind: "stop", id: "rec-1" }, decision: "pass" });
    for (const failing of ["/api/notes/marks", "/api/notes?"]) {
      const puts: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (init?.method === "PUT") puts.push(url);
          if (url.startsWith(failing)) return new Response("{}", { status: 500 });
          const body = url.startsWith("/api/notes/marks") ? { nodes: [], paths: [], failCategories: [], skipped: 0 } : { notes: [note], categories: [], skipped: 0 };
          return new Response(JSON.stringify(body), { status: 200 });
        }),
      );
      resetNotesTransport();
      useNotesStore.getState().clear();
      useMarksStore.getState().clear();
      useSchema.setState({ scenarioId: null });
      const view = render(<Probe />);
      act(() => useSchema.setState({ scenarioId: "card-fraud" }));
      // Both loads have answered once the marks store holds the story or an error.
      await waitFor(() => expect(useMarksStore.getState().scenario !== null || useMarksStore.getState().error !== null).toBe(true));
      // A move, were it to run, would issue its PUT within these turns.
      await act(async () => {
        for (let i = 0; i < 40; i += 1) await Promise.resolve();
      });
      expect(puts, `failing ${failing}`).toEqual([]);
      view.unmount();
    }
  });

  it("static build: the page asks before it unloads while a node is not in a file, and not after a save", async () => {
    render(<Probe />);
    act(() => useSchema.setState({ scenarioId: "card-fraud" }));
    await waitFor(() => expect(useMarksStore.getState().scenario).toBe("card-fraud"));
    const ask = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(ask()).toBe(false);
    await act(async () => void (await useMarksStore.getState().togglePin({ kind: "stop", id: "rec-1" })));
    expect(useMarksStore.getState().nodes).toHaveLength(1);
    expect(ask()).toBe(true);
    const transport = currentTransport();
    if (!transport) throw new Error("no transport");
    await saveNotesFile({ transport, scenario: "card-fraud", store: useNotesStore }, vi.fn());
    expect(ask()).toBe(false);
    // a pin pressed twice leaves a row that reads as none: no question
    await act(async () => void (await useMarksStore.getState().togglePin({ kind: "stop", id: "rec-2" })));
    expect(ask()).toBe(true);
    await act(async () => void (await useMarksStore.getState().togglePin({ kind: "stop", id: "rec-2" })));
    expect(ask()).toBe(false);
  });

  it("registers a renderer for the kind 'note', and takes it away on unmount", () => {
    const view = render(<Probe />);
    expect(entityRendererRegistry.get("note")?.inspectorBody).toBeTypeOf("function");
    view.unmount();
    expect(entityRendererRegistry.has("note")).toBe(false);
  });

  it("static build: the page asks before it unloads while a note is not in a file, and not after unmount", async () => {
    const view = render(<Probe />);
    act(() => useSchema.setState({ scenarioId: "card-fraud" }));
    await waitFor(() => expect(useNotesStore.getState().scenario).toBe("card-fraud"));
    const ask = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(ask()).toBe(false);
    const { id: _id, seq: _seq, ...rest } = makeNote();
    await act(async () => void (await useNotesStore.getState().create(rest)));
    expect(useNotesStore.getState().notes).toHaveLength(1);
    expect(ask()).toBe(true);
    view.unmount();
    expect(ask()).toBe(false);
  });

  it("live build: no question before unload", async () => {
    flag.isStatic = false;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ notes: [], categories: [], skipped: 0 }), { status: 200 })));
    render(<Probe />);
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
