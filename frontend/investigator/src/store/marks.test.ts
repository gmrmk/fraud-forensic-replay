/**
 * The marks store: one door for every node, path and Fail category, over a backing (the memory
 * backing here, with spies where a call must not happen). Nothing here reads a clock.
 */
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createMarksStore, openRecordWindow, useMarksStore } from "./marks";
import { useNotesStore } from "./notes";
import { usePivotStore } from "./pivot";
import { createMemoryBacking } from "../lib/notes-io/memoryBacking";
import type { MarksBacking } from "../lib/notes-io/transport";
import { LIST_WIRE, NODE_WIRE, VISA, VISA_DASHED, VISA_GROUPED, fixedUuids, infoOf, makeNode, makeNote, makePath } from "../lib/notes/test-fixtures";
import type { CustomPath, RecordNode, RecordRef } from "../lib/marks/types";
import type { Note } from "../lib/notes/types";

const SCENARIO = "card-fraud";
const rec = (n: number) => ({ kind: "stop", id: `rec-${n}` });
const R1 = rec(1);

/** A memory backing whose marks calls are spies. */
function spied() {
  const m = createMemoryBacking(fixedUuids());
  const marks: MarksBacking = {
    list: vi.fn(m.marks.list),
    putNode: vi.fn(m.marks.putNode),
    addFailCategory: vi.fn(m.marks.addFailCategory),
    createPath: vi.fn(m.marks.createPath),
    updatePath: vi.fn(m.marks.updatePath),
    removePath: vi.fn(m.marks.removePath),
  };
  return { marks, memory: m.marks };
}
async function loaded(marks?: MarksBacking) {
  const b = marks ?? spied().marks;
  const store = createMarksStore(b);
  const r = await store.getState().load(SCENARIO);
  expect(r.ok).toBe(true);
  return { store, b };
}
const code = (r: { ok: true } | { ok: false; code: string }): string => (r.ok ? "ok" : r.code);

describe("load", () => {
  it("refuses a scenario that is not one, and a store with no backing", async () => {
    const { marks } = spied();
    const store = createMarksStore(marks);
    expect(code(await store.getState().load("bad scenario!"))).toBe("bad_scenario");
    expect(code(await store.getState().load(VISA_DASHED))).toBe("card_number");
    expect(marks.list).not.toHaveBeenCalled();
    const bare = createMarksStore();
    expect(code(await bare.getState().load(SCENARIO))).toBe("backing_failed");
    expect(bare.getState().error).toEqual({ code: "backing_failed", where: "backing" });
  });

  it("a reply that is not a record or lacks the arrays is a bad reply, and nothing is placed", async () => {
    for (const reply of [null, "x", [], {}, { nodes: [] }, { nodes: [], paths: [] }, { nodes: {}, paths: [], failCategories: [] }]) {
      const store = createMarksStore({ ...spied().marks, list: async () => reply });
      expect(code(await store.getState().load(SCENARIO))).toBe("bad_reply");
      expect(store.getState().nodes).toEqual([]);
    }
  });

  it("a backing that throws gives backing_failed", async () => {
    const store = createMarksStore({
      ...spied().marks,
      list: async () => {
        throw new Error("down");
      },
    });
    expect(code(await store.getState().load(SCENARIO))).toBe("backing_failed");
  });

  it("LIST_WIRE keeps one node, one path and the Fail category", async () => {
    const store = createMarksStore({ ...spied().marks, list: async () => JSON.parse(LIST_WIRE) });
    const r = await store.getState().load(SCENARIO);
    expect(r.ok && r.value).toBe(1);
    const s = store.getState();
    expect(s.scenario).toBe(SCENARIO);
    expect(s.nodes).toHaveLength(1);
    expect(s.paths).toHaveLength(1);
    expect(s.failCategories).toEqual(["Shared key"]);
    expect(s.skipped).toBe(0);
    expect(s.error).toBeNull();
  });

  it("skips and counts a node of another story, a second node of one record, a bad node, and a path with a held id or seq", async () => {
    const good = makeNode({ record: { kind: "auth", id: "tx-1" }, pinned: true });
    const reply = {
      nodes: [
        good,
        makeNode({ record: { kind: "fraud", id: "tx-1" } }), // the same record as the first
        makeNode({ scenario: "priya-ato", record: rec(2) }),
        { ...makeNode({ record: rec(3) }), disposition: "maybe" },
        makeNode({ record: { kind: "stop", id: "rec-" + VISA } }),
      ],
      paths: [
        makePath({ id: "path-" + "a".repeat(32), seq: 1 }),
        makePath({ id: "path-" + "a".repeat(32), seq: 2 }), // a held id
        makePath({ id: "path-" + "b".repeat(32), seq: 1 }), // a held seq
        makePath({ id: "path-" + "c".repeat(32), seq: 3, scenario: "priya-ato" }),
      ],
      failCategories: ["Lead", "lead", "x".repeat(25)],
      skipped: 2,
    };
    const store = createMarksStore({ ...spied().marks, list: async () => reply });
    await store.getState().load(SCENARIO);
    const s = store.getState();
    expect(s.nodes).toHaveLength(1);
    expect(s.paths).toHaveLength(1);
    expect(s.failCategories).toEqual(["Lead"]);
    expect(s.skipped).toBe(2 + 4 + 3);
  });

  it("orders nodes by record key (a1:x before a:x) and paths by seq", async () => {
    const reply = {
      nodes: [makeNode({ record: { kind: "a", id: "x" } }), makeNode({ record: { kind: "a1", id: "x" } })],
      paths: [makePath({ id: "path-" + "b".repeat(32), seq: 2 }), makePath({ id: "path-" + "a".repeat(32), seq: 1 })],
      failCategories: [],
    };
    const store = createMarksStore({ ...spied().marks, list: async () => reply });
    await store.getState().load(SCENARIO);
    expect(store.getState().nodes.map((n) => `${n.record.kind}:${n.record.id}`)).toEqual(["a1:x", "a:x"]);
    expect(store.getState().paths.map((p) => p.seq)).toEqual([1, 2]);
  });
});

describe("pressDisposition", () => {
  it("before a load it is refused as bad_scenario and the backing is not called", async () => {
    const { marks } = spied();
    const store = createMarksStore(marks);
    expect(code(await store.getState().pressDisposition(R1, "pass"))).toBe("bad_scenario");
    expect(marks.putNode).not.toHaveBeenCalled();
  });

  it("none to PASS, PASS again to none, PASS to FAIL, FAIL to WAITING", async () => {
    const { store } = await loaded();
    const press = async (d: "pass" | "fail" | "wait") => {
      const r = await store.getState().pressDisposition(R1, d);
      if (!r.ok) throw new Error(`${r.code}`);
      return r.value.disposition;
    };
    expect(await press("pass")).toBe("pass");
    expect(await press("pass")).toBe("none");
    expect(await press("pass")).toBe("pass");
    expect(await press("fail")).toBe("fail");
    expect(await press("wait")).toBe("wait");
    expect(store.getState().nodes).toHaveLength(1);
  });

  it("every press writes category null: WAITING after a FAIL with a category clears it", async () => {
    const { store } = await loaded();
    await store.getState().pressDisposition(R1, "fail");
    await store.getState().setCategory(R1, "Lead");
    expect(store.getState().nodes[0].category).toBe("Lead");
    await store.getState().pressDisposition(R1, "wait");
    expect(store.getState().nodes[0]).toMatchObject({ disposition: "wait", category: null });
    // pressing FAIL again starts without a category
    await store.getState().pressDisposition(R1, "fail");
    expect(store.getState().nodes[0]).toMatchObject({ disposition: "fail", category: null });
  });

  it("sends settled true on a set and on a clear, and settled stays true after a press on the held value", async () => {
    const { store, b } = await loaded();
    await store.getState().pressDisposition(R1, "pass");
    await store.getState().pressDisposition(R1, "pass");
    const sent = (b.putNode as ReturnType<typeof vi.fn>).mock.calls.map((c) => [c[0].disposition, c[0].settled, c[1]]);
    expect(sent).toEqual([
      ["pass", true, false],
      ["none", true, false],
    ]);
    expect(store.getState().nodes[0]).toMatchObject({ disposition: "none", settled: true });
  });

  it("keeps the pin it finds", async () => {
    const { store } = await loaded();
    await store.getState().togglePin(R1);
    await store.getState().pressDisposition(R1, "pass");
    expect(store.getState().nodes[0]).toMatchObject({ pinned: true, disposition: "pass" });
  });

  it("the 1001st record is refused as limit_reached without calling the backing; a held record still updates", async () => {
    const nodes = Array.from({ length: 1000 }, (_, i) => makeNode({ record: rec(i) }));
    const { marks } = spied();
    const store = createMarksStore({ ...marks, list: async () => ({ nodes, paths: [], failCategories: [] }) });
    await store.getState().load(SCENARIO);
    expect(store.getState().nodes).toHaveLength(1000);
    expect(code(await store.getState().pressDisposition(rec(5000), "pass"))).toBe("limit_reached");
    expect(marks.putNode).not.toHaveBeenCalled();
    expect(code(await store.getState().pressDisposition(rec(5), "pass"))).toBe("ok");
    expect(marks.putNode).toHaveBeenCalledTimes(1);
  });

  it("a record of a fraud kind is stored as auth, and a press on the auth record finds it", async () => {
    const { store } = await loaded();
    await store.getState().pressDisposition({ kind: "fraud", id: "tx-1" }, "fail");
    await store.getState().pressDisposition({ kind: "auth", id: "tx-1" }, "fail");
    expect(store.getState().nodes).toHaveLength(1);
    expect(store.getState().nodes[0]).toMatchObject({ record: { kind: "auth", id: "tx-1" }, disposition: "none" });
  });

  it("a record that fails the check (a card number in the id) is refused before the backing", async () => {
    const { store, b } = await loaded();
    expect(code(await store.getState().pressDisposition({ kind: "stop", id: "rec-" + VISA }, "pass"))).toBe("card_number");
    expect(b.putNode).not.toHaveBeenCalled();
    expect(JSON.stringify(store.getState().error)).not.toContain("4111");
  });
});

describe("a reply is data", () => {
  it("a reply for another record, a refused value or a node of another story is a bad reply and nothing is placed", async () => {
    for (const reply of [makeNode({ record: rec(2) }), { refused: true }, makeNode({ scenario: "priya-ato" }), null]) {
      const { marks } = spied();
      const store = createMarksStore({ ...marks, putNode: async () => reply });
      await store.getState().load(SCENARIO);
      expect(code(await store.getState().pressDisposition(R1, "pass"))).toBe("bad_reply");
      expect(store.getState().nodes).toEqual([]);
    }
  });
  it("a backing that throws gives backing_failed", async () => {
    const { marks } = spied();
    const store = createMarksStore({
      ...marks,
      putNode: async () => {
        throw new Error("down");
      },
    });
    await store.getState().load(SCENARIO);
    expect(code(await store.getState().pressDisposition(R1, "pass"))).toBe("backing_failed");
  });
  it("the store takes the backing's reply: settled stays true when the backing held it true", async () => {
    const { store, b } = await loaded();
    await store.getState().pressDisposition(R1, "pass"); // settled true in the backing
    // A backing reply with settled true wins over a sent false: a pin press on a settled record
    const r = await store.getState().togglePin(R1);
    expect(r.ok && r.value.settled).toBe(true);
    expect((b.putNode as ReturnType<typeof vi.fn>).mock.calls[1][0].settled).toBe(true);
  });
});

describe("setCategory", () => {
  it("is refused while the disposition is not FAIL, sets and clears while FAIL", async () => {
    const { store, b } = await loaded();
    expect(code(await store.getState().setCategory(R1, "Lead"))).toBe("bad_request");
    await store.getState().pressDisposition(R1, "pass");
    expect(code(await store.getState().setCategory(R1, "Lead"))).toBe("bad_request");
    await store.getState().pressDisposition(R1, "fail");
    const r = await store.getState().setCategory(R1, "Lead");
    expect(r.ok && r.value).toMatchObject({ disposition: "fail", category: "Lead", settled: true });
    const c = await store.getState().setCategory(R1, null);
    expect(c.ok && c.value.category).toBeNull();
    expect((b.putNode as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0].settled).toBe(true);
  });
  it("normalises typed text and refuses a card number, a long name and an empty one", async () => {
    const { store } = await loaded();
    await store.getState().pressDisposition(R1, "fail");
    const r = await store.getState().setCategory(R1, "  Lead  ");
    expect(r.ok && r.value.category).toBe("Lead");
    expect(code(await store.getState().setCategory(R1, VISA_GROUPED))).toBe("card_number");
    expect(code(await store.getState().setCategory(R1, "x".repeat(25)))).toBe("too_long");
    expect(code(await store.getState().setCategory(R1, "   "))).toBe("bad_request");
    expect(store.getState().nodes[0].category).toBe("Lead");
  });
});

describe("togglePin", () => {
  let spy: MockInstance<[record: RecordRef, pinned: boolean], void>;
  beforeEach(() => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    spy = vi.spyOn(usePivotStore.getState(), "setRecordPinned");
  });

  it("flips the pin, writes settled false for a record with no row and calls setRecordPinned with the canonical record", async () => {
    const { store, b } = await loaded();
    const r = await store.getState().togglePin({ kind: "fraud", id: "tx-1" });
    expect(r.ok && r.value).toMatchObject({ pinned: true, settled: false, record: { kind: "auth", id: "tx-1" } });
    expect((b.putNode as ReturnType<typeof vi.fn>).mock.calls[0][0].settled).toBe(false);
    expect(spy).toHaveBeenCalledWith({ kind: "auth", id: "tx-1" }, true);
    await store.getState().togglePin({ kind: "auth", id: "tx-1" });
    expect(spy).toHaveBeenLastCalledWith({ kind: "auth", id: "tx-1" }, false);
    expect(store.getState().nodes[0]).toMatchObject({ pinned: false, disposition: "none", settled: false });
  });

  it("keeps settled on a record whose disposition was pressed, and a pin on a new record writes settled false", async () => {
    const { store } = await loaded();
    await store.getState().pressDisposition(R1, "pass");
    await store.getState().togglePin(R1);
    expect(store.getState().nodes[0]).toMatchObject({ pinned: true, disposition: "pass", settled: true });
    await store.getState().togglePin(rec(2));
    expect(store.getState().nodes.find((n) => n.record.id === "rec-2")).toMatchObject({ pinned: true, settled: false });
  });

  it("does not call setRecordPinned when the write is refused", async () => {
    const { marks } = spied();
    const store = createMarksStore({ ...marks, putNode: async () => null });
    await store.getState().load(SCENARIO);
    expect(code(await store.getState().togglePin(R1))).toBe("bad_reply");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("addFailCategory", () => {
  it("normalises, keeps insertion order, refuses the same name ignoring case and the 101st", async () => {
    const { store } = await loaded();
    const r = await store.getState().addFailCategory("  Triage ");
    expect(r.ok && r.value).toBe("Triage");
    await store.getState().addFailCategory("Alpha");
    expect(code(await store.getState().addFailCategory("triage"))).toBe("category_exists");
    expect(store.getState().failCategories).toEqual(["Triage", "Alpha"]);
    for (let i = 0; i < 98; i++) expect(code(await store.getState().addFailCategory(`Cat ${i}`))).toBe("ok");
    expect(code(await store.getState().addFailCategory("One more"))).toBe("limit_reached");
    expect(store.getState().failCategories).toHaveLength(100);
  });
  it("refuses a card number and a long name before the backing, and a reply that names another name", async () => {
    const { store, b } = await loaded();
    expect(code(await store.getState().addFailCategory(VISA_DASHED))).toBe("card_number");
    expect(code(await store.getState().addFailCategory("x".repeat(25)))).toBe("too_long");
    expect(b.addFailCategory).not.toHaveBeenCalled();
    const { marks } = spied();
    const odd = createMarksStore({ ...marks, addFailCategory: async () => ({ name: "Other" }) });
    await odd.getState().load(SCENARIO);
    expect(code(await odd.getState().addFailCategory("Triage"))).toBe("bad_reply");
    expect(odd.getState().failCategories).toEqual([]);
  });
  it("before a load it is refused as bad_scenario", async () => {
    const store = createMarksStore(spied().marks);
    expect(code(await store.getState().addFailCategory("Triage"))).toBe("bad_scenario");
  });
  // A typed Fail category belongs to no story: the backing is asked with the name alone.
  it("asks the backing with the name alone, no scenario", async () => {
    const { store, b } = await loaded();
    await store.getState().addFailCategory("  Triage ");
    expect(b.addFailCategory).toHaveBeenCalledTimes(1);
    expect(vi.mocked(b.addFailCategory).mock.calls[0]).toEqual(["Triage"]);
  });
  it("the list is shared by every story: a change of story keeps a name typed in the first", async () => {
    const { marks } = spied();
    const store = createMarksStore(marks);
    await store.getState().load(SCENARIO);
    await store.getState().addFailCategory("Triage");
    expect(store.getState().failCategories).toEqual(["Triage"]);
    expect(code(await store.getState().load("priya-ato"))).toBe("ok");
    expect(store.getState().scenario).toBe("priya-ato");
    expect(store.getState().failCategories).toEqual(["Triage"]);
    // and the name is taken in the second story too, ignoring case
    expect(code(await store.getState().addFailCategory("triage"))).toBe("category_exists");
    await store.getState().addFailCategory("Other");
    await store.getState().load(SCENARIO);
    expect(store.getState().failCategories).toEqual(["Triage", "Other"]);
  });
  it("counts 100 in all: the limit holds across stories, without calling the backing", async () => {
    const { marks } = spied();
    const store = createMarksStore(marks);
    await store.getState().load(SCENARIO);
    for (let i = 0; i < 99; i++) await store.getState().addFailCategory(`Cat ${i}`);
    await store.getState().load("priya-ato");
    expect(code(await store.getState().addFailCategory("Last"))).toBe("ok");
    expect(store.getState().failCategories).toHaveLength(100);
    expect(code(await store.getState().addFailCategory("One more"))).toBe("limit_reached");
    expect(marks.addFailCategory).toHaveBeenCalledTimes(100);
  });
});

describe("paths", () => {
  const stops = (...ns: number[]) => ns.map(rec);
  it("createPath: the default name is nextPathName, a given name is normalised, the reply is checked and placed in seq order", async () => {
    const { store } = await loaded();
    const a = await store.getState().createPath(stops(1, 2));
    expect(a.ok && a.value).toMatchObject({ name: "Path 1", seq: 1, scenario: SCENARIO, stops: stops(1, 2) });
    const b = await store.getState().createPath(stops(2, 3), "  Mine ");
    expect(b.ok && b.value.name).toBe("Mine");
    const c = await store.getState().createPath(stops(3, 4));
    expect(c.ok && c.value.name).toBe("Path 2"); // one more than the highest "Path N" (a named path does not count)
    expect(store.getState().paths.map((p) => p.seq)).toEqual([1, 2, 3]);
  });
  it("createPath refuses one stop, a repeated record (fraud and auth are one), a bad name and a card number", async () => {
    const { store, b } = await loaded();
    expect(code(await store.getState().createPath(stops(1)))).toBe("bad_request");
    expect(code(await store.getState().createPath([{ kind: "fraud", id: "x" }, { kind: "auth", id: "x" }]))).toBe("bad_request");
    expect(code(await store.getState().createPath(stops(1, 2), "x".repeat(25)))).toBe("too_long");
    expect(code(await store.getState().createPath(stops(1, 2), VISA_DASHED))).toBe("card_number");
    expect(code(await store.getState().createPath([rec(1), { kind: "stop", id: "rec-" + VISA }]))).toBe("card_number");
    expect(b.createPath).not.toHaveBeenCalled();
  });
  it("the 21st path is limit_reached", async () => {
    const { store } = await loaded();
    for (let i = 0; i < 20; i++) expect(code(await store.getState().createPath(stops(1, 2)))).toBe("ok");
    expect(code(await store.getState().createPath(stops(1, 2)))).toBe("limit_reached");
    expect(store.getState().paths).toHaveLength(20);
  });
  it("createPath refuses a reply that is another story's, repeats a held id or is not a path", async () => {
    const held = makePath({ id: "path-" + "a".repeat(32), seq: 1 });
    for (const reply of [{ ...held, id: "path-" + "b".repeat(32), scenario: "priya-ato" }, held, { refused: true }, { ...held, id: "path-" + "b".repeat(32), seq: 1 }]) {
      const { marks } = spied();
      const store = createMarksStore({ ...marks, list: async () => ({ nodes: [], paths: [held], failCategories: [] }), createPath: async () => reply });
      await store.getState().load(SCENARIO);
      expect(code(await store.getState().createPath(stops(1, 2)))).toBe("bad_reply");
      expect(store.getState().paths).toHaveLength(1);
    }
  });
  it("updatePath: unknown id is not_found; a reply with another id or seq is a bad reply; a good one replaces the path", async () => {
    const { store } = await loaded();
    const a = await store.getState().createPath(stops(1, 2));
    if (!a.ok) throw new Error("create");
    expect(code(await store.getState().updatePath("path-" + "e".repeat(32), { name: "X", stops: stops(1, 2) }))).toBe("not_found");
    const u = await store.getState().updatePath(a.value.id, { name: "Renamed", stops: stops(3, 4, 5) });
    expect(u.ok && u.value).toEqual({ ...a.value, name: "Renamed", stops: stops(3, 4, 5) });
    expect(store.getState().paths[0].name).toBe("Renamed");
    expect(code(await store.getState().updatePath(a.value.id, { name: "X", stops: stops(1) }))).toBe("bad_request");

    for (const wrong of [{ id: "path-" + "f".repeat(32) }, { seq: 9 }, { scenario: "priya-ato" }]) {
      const { marks } = spied();
      const odd = createMarksStore({ ...marks, updatePath: async (_id, f) => ({ ...a.value, ...f, ...wrong }) });
      await odd.getState().load(SCENARIO);
      odd.setState({ paths: [a.value] });
      expect(code(await odd.getState().updatePath(a.value.id, { name: "Y", stops: stops(1, 2) }))).toBe("bad_reply");
      expect(odd.getState().paths[0].name).toBe(a.value.name);
    }
  });
  it("removePath: unknown is not_found; the path leaves the list; a backing that throws gives backing_failed", async () => {
    const { store } = await loaded();
    const a = await store.getState().createPath(stops(1, 2));
    if (!a.ok) throw new Error("create");
    expect(code(await store.getState().removePath("path-" + "e".repeat(32)))).toBe("not_found");
    expect(code(await store.getState().removePath(a.value.id))).toBe("ok");
    expect(store.getState().paths).toEqual([]);
    const { marks } = spied();
    const odd = createMarksStore({
      ...marks,
      removePath: async () => {
        throw new Error("down");
      },
    });
    await odd.getState().load(SCENARIO);
    odd.setState({ paths: [a.value as CustomPath] });
    expect(code(await odd.getState().removePath(a.value.id))).toBe("backing_failed");
    expect(odd.getState().paths).toHaveLength(1);
  });
});

describe("clear and setBacking", () => {
  it("clear forgets the story and the lists and keeps the backing", async () => {
    const { store, b } = await loaded();
    await store.getState().pressDisposition(R1, "pass");
    await store.getState().addFailCategory("Lead");
    store.getState().clear();
    expect(store.getState()).toMatchObject({ scenario: null, nodes: [], paths: [], failCategories: [], skipped: 0, error: null, backing: b });
  });
  it("setBacking swaps the backing", () => {
    const store = createMarksStore();
    const { marks } = spied();
    store.getState().setBacking(marks);
    expect(store.getState().backing).toBe(marks);
    store.getState().setBacking(null);
    expect(store.getState().backing).toBeNull();
  });
});

describe("moveSavedMarks (D6)", () => {
  const linked = (record: RecordRef, decision: "pass" | "fail" | "none", id = 1): Note =>
    makeNote({ id: `note-${id.toString(16).padStart(32, "0")}`, seq: id, link: record, decision });
  /** A putNode that holds its first call until `release()`, then answers as the memory backing does. */
  function held(memory: MarksBacking) {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    const putNode = vi.fn(async (node: RecordNode, ifUnsettled: boolean) => {
      if (first) {
        first = false;
        await gate;
      }
      return memory.putNode(node, ifUnsettled);
    });
    return { putNode, release: () => release() };
  }
  const puts = (b: MarksBacking) => (b.putNode as unknown as MockInstance).mock.calls as [RecordNode, boolean][];

  it("is not a method of a store with no story: before a load it is refused as bad_scenario and writes nothing", async () => {
    const { marks } = spied();
    const store = createMarksStore(marks);
    expect(code(await store.getState().moveSavedMarks([linked(R1, "pass")]))).toBe("bad_scenario");
    expect(marks.putNode).not.toHaveBeenCalled();
  });

  it("writes each moved row with ifUnsettled true and never with false, places what the backing stored, and answers the number written", async () => {
    const { store, b } = await loaded();
    const notes = [linked(R1, "pass", 1), linked(rec(2), "fail", 2), linked(rec(3), "none", 3)];
    const before = JSON.parse(JSON.stringify(notes));
    const r = await store.getState().moveSavedMarks(notes);
    expect(r.ok && r.value).toBe(2);
    expect(puts(b).map(([n, flag]) => [n.record.id, n.disposition, n.settled, flag])).toEqual([
      ["rec-1", "pass", true, true],
      ["rec-2", "fail", true, true],
    ]);
    expect(store.getState().nodes.map((n) => [n.record.id, n.disposition, n.settled])).toEqual([
      ["rec-1", "pass", true],
      ["rec-2", "fail", true],
    ]);
    expect(notes).toEqual(before);
  });

  it("with nothing to move it answers 0 and does not call the backing", async () => {
    const { store, b } = await loaded();
    const r = await store.getState().moveSavedMarks([linked(R1, "none"), makeNote({ link: null, decision: "pass" })]);
    expect(r.ok && r.value).toBe(0);
    expect(b.putNode).not.toHaveBeenCalled();
  });

  it("a settled row is kept (the move sends nothing for it), and an unsettled pinned row is filled and keeps its pin", async () => {
    const { marks, memory } = spied();
    await memory.putNode(makeNode({ record: R1, disposition: "fail", settled: true }), false);
    await memory.putNode(makeNode({ record: rec(2), pinned: true }), false);
    const store = createMarksStore(marks);
    await store.getState().load(SCENARIO);
    const r = await store.getState().moveSavedMarks([linked(R1, "pass", 1), linked(rec(2), "pass", 2)]);
    expect(r.ok && r.value).toBe(1);
    expect(puts(marks).map(([n]) => n.record.id)).toEqual(["rec-2"]);
    const byId = Object.fromEntries(store.getState().nodes.map((n) => [n.record.id, n]));
    expect(byId["rec-1"]).toMatchObject({ disposition: "fail", settled: true });
    expect(byId["rec-2"]).toMatchObject({ disposition: "pass", pinned: true, settled: true });
  });

  it("a second move of the same notes writes nothing new", async () => {
    const { store, b } = await loaded();
    const notes = [linked(R1, "pass")];
    await store.getState().moveSavedMarks(notes);
    expect(b.putNode).toHaveBeenCalledTimes(1);
    const again = await store.getState().moveSavedMarks(notes);
    expect(again.ok && again.value).toBe(0);
    expect(b.putNode).toHaveBeenCalledTimes(1);
  });

  it("a refusal stops it and answers the refusal; rows already written stay", async () => {
    const { marks } = spied();
    let calls = 0;
    const store = createMarksStore({
      ...marks,
      putNode: async (n, flag) => {
        calls += 1;
        if (calls === 2) throw new Error("down");
        return marks.putNode(n, flag);
      },
    });
    await store.getState().load(SCENARIO);
    const r = await store.getState().moveSavedMarks([linked(R1, "pass", 1), linked(rec(2), "pass", 2), linked(rec(3), "pass", 3)]);
    expect(code(r)).toBe("backing_failed");
    expect(calls).toBe(2);
    expect(store.getState().nodes.map((n) => n.record.id)).toEqual(["rec-1"]);
  });

  it("a reply that names another record is a bad reply and is not placed", async () => {
    const { marks } = spied();
    const store = createMarksStore({ ...marks, putNode: async () => makeNode({ record: rec(9), disposition: "pass", settled: true }) });
    await store.getState().load(SCENARIO);
    expect(code(await store.getState().moveSavedMarks([linked(R1, "pass")]))).toBe("bad_reply");
    expect(store.getState().nodes).toEqual([]);
  });

  it("a note's PASS stays in the notes store: the move reads notes and never writes them", async () => {
    const { marks } = spied();
    const store = createMarksStore(marks);
    await store.getState().load(SCENARIO);
    useNotesStore.setState({ scenario: SCENARIO, notes: [linked(R1, "pass")] });
    await store.getState().moveSavedMarks(useNotesStore.getState().notes);
    expect(useNotesStore.getState().notes[0].decision).toBe("pass");
    useNotesStore.getState().clear();
  });

  describe("a press must not undo the move (AMEND-window part 5)", () => {
    it("a pin pressed while the move is in flight is sent only after the move's answer is in the store, and carries the moved disposition", async () => {
      const { memory } = spied();
      const gated = held(memory);
      const marks: MarksBacking = { ...memory, putNode: gated.putNode };
      const store = createMarksStore(marks);
      await store.getState().load(SCENARIO);
      const moving = store.getState().moveSavedMarks([linked(R1, "pass")]);
      const pinned = store.getState().togglePin(R1);
      // Let every queued step run as far as it can: the press must still be waiting.
      await Promise.resolve();
      await Promise.resolve();
      expect(gated.putNode).toHaveBeenCalledTimes(1);
      expect(store.getState().nodes).toEqual([]);
      gated.release();
      expect(code(await moving)).toBe("ok");
      expect(code(await pinned)).toBe("ok");
      expect(gated.putNode).toHaveBeenCalledTimes(2);
      const [sent, flag] = gated.putNode.mock.calls[1];
      expect(flag).toBe(false);
      expect(sent).toMatchObject({ pinned: true, disposition: "pass", settled: true });
      expect(store.getState().nodes[0]).toMatchObject({ pinned: true, disposition: "pass", settled: true });
    });

    it("a category chosen while the move to FAIL is in flight is accepted, because the press reads the moved FAIL", async () => {
      const { memory } = spied();
      const gated = held(memory);
      const store = createMarksStore({ ...memory, putNode: gated.putNode });
      await store.getState().load(SCENARIO);
      const moving = store.getState().moveSavedMarks([linked(R1, "fail")]);
      const chosen = store.getState().setCategory(R1, "Shared key");
      await Promise.resolve();
      expect(gated.putNode).toHaveBeenCalledTimes(1);
      gated.release();
      await moving;
      expect(code(await chosen)).toBe("ok");
      expect(store.getState().nodes[0]).toMatchObject({ disposition: "fail", category: "Shared key", settled: true });
    });

    it("a press made while the move is in flight wins over the moved value, and is not undone by it", async () => {
      const { memory } = spied();
      const gated = held(memory);
      const store = createMarksStore({ ...memory, putNode: gated.putNode });
      await store.getState().load(SCENARIO);
      const moving = store.getState().moveSavedMarks([linked(R1, "pass")]);
      const pressed = store.getState().pressDisposition(R1, "fail");
      gated.release();
      await moving;
      await pressed;
      expect(store.getState().nodes[0]).toMatchObject({ disposition: "fail", settled: true });
      expect((await memory.list(SCENARIO)) as { nodes: RecordNode[] }).toMatchObject({ nodes: [{ disposition: "fail" }] });
    });

    it("a rejected step does not stop the queue", async () => {
      const { memory } = spied();
      let n = 0;
      const store = createMarksStore({
        ...memory,
        putNode: async (node, flag) => {
          n += 1;
          if (n === 1) throw new Error("down");
          return memory.putNode(node, flag);
        },
      });
      await store.getState().load(SCENARIO);
      expect(code(await store.getState().moveSavedMarks([linked(R1, "pass")]))).toBe("backing_failed");
      expect(code(await store.getState().pressDisposition(R1, "pass"))).toBe("ok");
    });
  });
});

describe("openRecordWindow", () => {
  beforeEach(() => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    useMarksStore.getState().clear();
    useNotesStore.getState().clear();
  });
  const placed = () => infoOf({ lngLat: { lng: 4.9, lat: 52.4 } });

  it("is null with no story loaded in either store, and opens nothing", () => {
    expect(openRecordWindow(R1, () => placed())).toBeNull();
    expect(usePivotStore.getState().windows).toEqual([]);
  });

  it("for a found placed record opens a node anchored window, pinned as the record's node says", () => {
    useMarksStore.setState({ scenario: SCENARIO, nodes: [makeNode({ record: R1, pinned: true })] });
    const id = openRecordWindow({ kind: "stop", id: "rec-1" }, () => placed());
    const w = usePivotStore.getState().windows[0];
    expect(w.id).toBe(id);
    expect(w).toMatchObject({ kind: "record", pinned: true, record: R1 });
    expect(w.anchor).toMatchObject({ type: "node", lngLat: { lng: 4.9, lat: 52.4 } });
  });

  it("an unpinned or unmarked record opens unpinned; the notes store's story counts when the marks store has none", () => {
    useNotesStore.setState({ scenario: SCENARIO });
    expect(openRecordWindow(R1, () => placed())).not.toBeNull();
    expect(usePivotStore.getState().windows[0].pinned).toBe(false);
  });

  it("for a record not in the data (lookup null) it opens a screen window at `at`", () => {
    useMarksStore.setState({ scenario: SCENARIO });
    openRecordWindow({ kind: "fraud", id: "tx-9" }, () => null, { x: 200, y: 150 });
    const w = usePivotStore.getState().windows[0];
    expect(w).toMatchObject({ kind: "record", record: { kind: "auth", id: "tx-9" } });
    expect(w.anchor).toEqual({ type: "screen", x: 200, y: 150 });
  });

  it("a record with no place opens on the screen at the default spot", () => {
    useMarksStore.setState({ scenario: SCENARIO });
    openRecordWindow(R1, () => infoOf({ lngLat: null }));
    expect(usePivotStore.getState().windows[0].anchor).toEqual({ type: "screen", x: 120, y: 80 });
  });
});

describe("the wire node", () => {
  it("NODE_WIRE is a node the store takes as it is", async () => {
    const node: RecordNode = JSON.parse(NODE_WIRE);
    const store = createMarksStore({ ...spied().marks, list: async () => ({ nodes: [node], paths: [], failCategories: [] }) });
    expect((await store.getState().load(SCENARIO)).ok).toBe(true);
    expect(store.getState().nodes[0]).toEqual(node);
  });
});
