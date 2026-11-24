/**
 * The memory backing (the static site): a map and a seq per scenario. It hands out copies, mints
 * an id the card guard passes, and applies a checked file as one step.
 */
import { describe, it, expect } from "vitest";
import { createMemoryBacking } from "./memoryBacking";
import type { NotesTransport } from "./transport";
import { createNotesStore } from "../../store/notes";
import {
  FILE_V2_WIRE,
  LIST_WIRE,
  NODE_WIRE,
  VISA,
  VISA_DASHED,
  VISA_UUID,
  WIRE_UUID,
  bodyOf,
  clone,
  fixedUuids,
  makeNode,
  makeNote,
  makePath,
} from "../notes/test-fixtures";
import { buildNotesFile, checkFile } from "../notes/file";
import { checkNote } from "../notes/schema";
import type { Note, NoteDraft, NotesFile } from "../notes/types";
import { checkNode, checkPath, isPathId } from "../marks/schema";
import type { CustomPath, RecordNode } from "../marks/types";

const SCENARIO = "card-fraud";
const draft = (over: Partial<NoteDraft> = {}): NoteDraft => {
  const { id: _id, seq: _seq, ...rest } = makeNote();
  return { ...rest, ...over };
};
const asNote = (v: unknown): Note => {
  const r = checkNote(v);
  if (!r.ok) throw new Error("not a note");
  return r.value;
};

describe("memory backing", () => {
  it("create gives an id and the next seq of its scenario, and the reply passes the page's check", async () => {
    const m = createMemoryBacking();
    const a = asNote(await m.backing.create(draft({ time: 2000 })));
    const b = asNote(await m.backing.create(draft({ time: 1000 })));
    const other = asNote(await m.backing.create(draft({ scenario: "priya-ato" })));
    expect([a.seq, b.seq, other.seq]).toEqual([1, 2, 1]);
    expect(a.id).toMatch(/^note-[0-9a-f]{32}$/);
    expect(a.id).not.toBe(b.id);
  });

  it("an id the card guard refuses is drawn again", async () => {
    // The first draw holds a 16 digit run that passes Luhn (the test number); the second is plain hex.
    const draws = ["41111111-1111-1111-aaaa-aaaaaaaaaaaa", "01234567-89ab-cdef-0123-456789abcdef"];
    let i = 0;
    const m = createMemoryBacking(() => draws[i++]);
    const n = asNote(await m.backing.create(draft()));
    expect(n.id).toBe("note-0123456789abcdef0123456789abcdef");
    expect(i).toBe(2);
  });

  it("list returns copies, ordered by time then seq: changing a reply changes nothing held", async () => {
    const m = createMemoryBacking();
    await m.backing.create(draft({ time: 5 }));
    await m.backing.create(draft({ time: 4 }));
    const first = (await m.backing.list(SCENARIO)) as { notes: Note[]; categories: string[]; skipped: number };
    expect(first.notes.map((n) => n.seq)).toEqual([2, 1]);
    expect(first.skipped).toBe(0);
    first.notes[0].category = "Changed";
    first.notes[0].body.content.length = 0;
    first.categories.push("Leak");
    const again = (await m.backing.list(SCENARIO)) as { notes: Note[]; categories: string[] };
    expect(again.notes[0].category).toBe("Note");
    expect(again.notes[0].body.content.length).toBeGreaterThan(0);
    expect(again.categories).toEqual([]);
  });

  it("list holds only the scenario asked for", async () => {
    const m = createMemoryBacking();
    await m.backing.create(draft());
    await m.backing.create(draft({ scenario: "priya-ato" }));
    const r = (await m.backing.list("priya-ato")) as { notes: Note[] };
    expect(r.notes.map((n) => n.scenario)).toEqual(["priya-ato"]);
  });

  it("update keeps id, seq, time and scenario and changes the fields; an unknown id throws", async () => {
    const m = createMemoryBacking();
    const a = asNote(await m.backing.create(draft({ time: 77 })));
    const { link, colour, category, decision } = { link: null, colour: "r3", category: "Question", decision: "fail" } as const;
    const u = asNote(await m.backing.update(a.id, { link, colour, category, decision, body: bodyOf("Changed.") }));
    expect([u.id, u.seq, u.time, u.scenario]).toEqual([a.id, a.seq, 77, SCENARIO]);
    expect([u.colour, u.category, u.decision]).toEqual(["r3", "Question", "fail"]);
    await expect(m.backing.update("note-ffffffffffffffffffffffffffffffff", { link, colour, category, decision, body: bodyOf("x") })).rejects.toThrow();
  });

  it("remove deletes; a later create takes max plus 1", async () => {
    const m = createMemoryBacking();
    const a = asNote(await m.backing.create(draft()));
    await m.backing.create(draft());
    await m.backing.remove(a.id);
    const c = asNote(await m.backing.create(draft()));
    expect(c.seq).toBe(3);
    const r = (await m.backing.list(SCENARIO)) as { notes: Note[] };
    expect(r.notes.map((n) => n.seq)).toEqual([2, 3]);
  });

  it("addCategory keeps custom names once, ignoring case, and list gives them back", async () => {
    const m = createMemoryBacking();
    expect(await m.backing.addCategory("Lead")).toEqual({ name: "Lead" });
    await expect(m.backing.addCategory("lead")).rejects.toThrow();
    await expect(m.backing.addCategory("Question")).rejects.toThrow();
    const r = (await m.backing.list(SCENARIO)) as { categories: string[] };
    expect(r.categories).toEqual(["Lead"]);
  });

  it("exportFile gives the file the shared builder gives, and it passes checkFile", async () => {
    const m = createMemoryBacking();
    await m.backing.addCategory("Lead");
    await m.backing.create(draft({ time: 9, category: "Lead" }));
    const file = await m.exportFile(SCENARIO);
    const checked = checkFile(file, { scenarios: [SCENARIO] });
    expect(checked.ok).toBe(true);
    const held = ((await m.backing.list(SCENARIO)) as { notes: Note[] }).notes;
    expect(file).toEqual(buildNotesFile(SCENARIO, ["Lead"], held));
  });

  it("importFile: a held id is replaced and keeps its seq; a new id takes the next seq in file order", async () => {
    const m = createMemoryBacking();
    const a = asNote(await m.backing.create(draft({ time: 10 })));
    await m.backing.create(draft({ time: 20 }));
    const changed: Note = { ...clone(a), category: "Source", body: bodyOf("From the file."), seq: 99 };
    const fresh1 = makeNote({ id: "note-abababababababababababababababab", seq: 5, time: 30, category: "Context" });
    const fresh2 = makeNote({ id: "note-cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd", seq: 6, time: 25, category: "Lead" });
    const file = checkFile(buildNotesFile(SCENARIO, ["Lead"], [changed, fresh2, fresh1].map((n, i) => ({ ...n, seq: i + 1 }))), { scenarios: [SCENARIO] });
    if (!file.ok) throw new Error("file should pass");
    await m.importFile(file.value);
    const r = (await m.backing.list(SCENARIO)) as { notes: Note[]; categories: string[] };
    const byId = new Map(r.notes.map((n) => [n.id, n]));
    expect(byId.get(a.id)?.seq).toBe(a.seq);
    expect(byId.get(a.id)?.category).toBe("Source");
    expect(r.notes).toHaveLength(4);
    expect(byId.get(fresh2.id)?.seq).toBe(3);
    expect(byId.get(fresh1.id)?.seq).toBe(4);
    expect(r.categories).toEqual(["Lead"]);
  });

  it("importFile is all or nothing at the 1,000 note limit", async () => {
    const m = createMemoryBacking();
    for (let i = 0; i < 3; i++) await m.backing.create(draft({ time: i }));
    const idOf = (i: number, fill: string) => `note-${i.toString(16).padStart(4, "0")}${fill.repeat(28)}`;
    const many = Array.from({ length: 500 }, (_, i) => makeNote({ id: idOf(i, "c"), seq: i + 1, time: i }));
    const file = checkFile(buildNotesFile(SCENARIO, [], many), { scenarios: [SCENARIO] });
    if (!file.ok) throw new Error("file should pass");
    await m.importFile(file.value);
    const second = checkFile(buildNotesFile(SCENARIO, [], many.map((n, i) => ({ ...n, id: idOf(i, "d") }))), { scenarios: [SCENARIO] });
    if (!second.ok) throw new Error(`second file should pass: ${second.code} ${second.where}`);
    await expect(m.importFile(second.value)).rejects.toMatchObject({ code: "limit_reached" });
    const r = (await m.backing.list(SCENARIO)) as { notes: Note[] };
    expect(r.notes).toHaveLength(503);
  });

  it("works under the real store: a note reaches the store only through the page's check", async () => {
    const m = createMemoryBacking();
    const store = createNotesStore(m.backing);
    await store.getState().load(SCENARIO);
    const r = await store.getState().create(clone(draft()));
    expect(r.ok).toBe(true);
    expect(store.getState().notes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------- the marks (F6)

interface Listed {
  nodes: RecordNode[];
  paths: CustomPath[];
  failCategories: string[];
  skipped: number;
}
const listed = async (m: NotesTransport, scenario = SCENARIO): Promise<Listed> => (await m.marks.list(scenario)) as Listed;
const rec = (n: number) => ({ kind: "stop", id: `rec-${n}` });
const node = (over: Partial<RecordNode> = {}): RecordNode => makeNode(over);
const stored = async (p: Promise<unknown>): Promise<RecordNode> => {
  const r = checkNode(await p);
  if (!r.ok) throw new Error("not a node");
  return r.value;
};

describe("memory backing: nodes", () => {
  it("lists an empty story", async () => {
    const m = createMemoryBacking();
    expect(await listed(m)).toEqual({ nodes: [], paths: [], failCategories: [], skipped: 0 });
  });

  it("putNode with ifUnsettled false stores the node, a second put changes the fields and leaves one row", async () => {
    const m = createMemoryBacking();
    await m.marks.putNode(node({ pinned: true }), false);
    const r2 = await stored(m.marks.putNode(node({ disposition: "pass", settled: true }), false));
    expect(r2).toMatchObject({ pinned: false, disposition: "pass", settled: true });
    const l = await listed(m);
    expect(l.nodes).toHaveLength(1);
    expect(l.nodes[0]).toMatchObject({ disposition: "pass", pinned: false });
  });

  it("settled never goes back to false: a put with settled false over a settled row keeps true", async () => {
    const m = createMemoryBacking();
    await m.marks.putNode(node({ disposition: "pass", settled: true }), false);
    const r = await stored(m.marks.putNode(node({ disposition: "none", settled: false, pinned: true }), false));
    expect(r).toMatchObject({ disposition: "none", pinned: true, settled: true });
  });

  it("a fraud record is stored as auth, and a put of auth with the same id updates that row", async () => {
    const m = createMemoryBacking();
    await m.marks.putNode(node({ record: { kind: "fraud", id: "tx-1" }, pinned: true }), false);
    await m.marks.putNode(node({ record: { kind: "auth", id: "tx-1" }, disposition: "wait", settled: true }), false);
    const l = await listed(m);
    expect(l.nodes).toHaveLength(1);
    expect(l.nodes[0]).toMatchObject({ record: { kind: "auth", id: "tx-1" }, pinned: false, disposition: "wait" });
  });

  it("ifUnsettled true on a settled row answers it unchanged", async () => {
    const m = createMemoryBacking();
    await m.marks.putNode(node({ disposition: "fail", category: "Lead", settled: true, pinned: true }), false);
    const r = await stored(m.marks.putNode(node({ disposition: "pass", settled: true }), true));
    expect(r).toMatchObject({ disposition: "fail", category: "Lead", pinned: true, settled: true });
    expect((await listed(m)).nodes[0]).toEqual(r);
  });

  it("ifUnsettled true on an unsettled pinned-only row writes disposition and category, sets settled, keeps the pin", async () => {
    const m = createMemoryBacking();
    await m.marks.putNode(node({ pinned: true, settled: false }), false);
    const r = await stored(m.marks.putNode(node({ pinned: false, disposition: "fail", category: "Lead", settled: true }), true));
    expect(r).toMatchObject({ pinned: true, disposition: "fail", category: "Lead", settled: true });
  });

  it("ifUnsettled true on no row inserts the node as sent", async () => {
    const m = createMemoryBacking();
    const r = await stored(m.marks.putNode(node({ disposition: "pass", settled: true }), true));
    expect(r).toMatchObject({ disposition: "pass", settled: true });
    expect((await listed(m)).nodes).toHaveLength(1);
  });

  it("lists in record key order (a1:x before a:x) and only the story asked for", async () => {
    const m = createMemoryBacking();
    await m.marks.putNode(node({ record: { kind: "a", id: "x" } }), false);
    await m.marks.putNode(node({ record: { kind: "a1", id: "x" } }), false);
    await m.marks.putNode(node({ scenario: "priya-ato", record: { kind: "a", id: "y" } }), false);
    expect((await listed(m)).nodes.map((n) => `${n.record.kind}:${n.record.id}`)).toEqual(["a1:x", "a:x"]);
    expect((await listed(m, "priya-ato")).nodes).toHaveLength(1);
  });

  it("1000 nodes, then a new record throws limit_reached and a held record still updates", async () => {
    const m = createMemoryBacking();
    for (let i = 0; i < 1000; i++) await m.marks.putNode(node({ record: rec(i) }), false);
    await expect(m.marks.putNode(node({ record: rec(1000) }), false)).rejects.toMatchObject({ code: "limit_reached" });
    await expect(m.marks.putNode(node({ record: rec(5), pinned: true }), false)).resolves.toBeDefined();
    expect((await listed(m)).nodes).toHaveLength(1000);
    // another story has its own count
    await expect(m.marks.putNode(node({ scenario: "priya-ato", record: rec(1000) }), false)).resolves.toBeDefined();
  });

  it("a node that fails the page's check is refused and nothing is held", async () => {
    const m = createMemoryBacking();
    await expect(m.marks.putNode({ ...node(), disposition: "maybe" } as unknown as RecordNode, false)).rejects.toMatchObject({ code: "bad_request" });
    await expect(m.marks.putNode(node({ record: { kind: "stop", id: "rec-" + VISA } }), false)).rejects.toMatchObject({ code: "card_number" });
    expect((await listed(m)).nodes).toHaveLength(0);
  });

  it("every read is a copy: changing a returned node changes nothing held", async () => {
    const m = createMemoryBacking();
    const back = await stored(m.marks.putNode(node({ pinned: true }), false));
    back.pinned = false;
    back.record.id = "changed";
    const l = await listed(m);
    l.nodes[0].disposition = "pass";
    l.nodes[0].record.kind = "changed";
    const again = await listed(m);
    expect(again.nodes[0]).toMatchObject({ pinned: true, disposition: "none", record: { kind: "stop", id: "rec-1" } });
  });
});

// A typed Fail category belongs to no story: one list for the visit, as the note categories are.
describe("memory backing: Fail categories, one list shared by every story", () => {
  it("keeps insertion order; the same name ignoring case is category_exists; the 101st is limit_reached", async () => {
    const m = createMemoryBacking();
    await expect(m.marks.addFailCategory("Triage")).resolves.toEqual({ name: "Triage" });
    await m.marks.addFailCategory("Alpha");
    await expect(m.marks.addFailCategory("triage")).rejects.toMatchObject({ code: "category_exists" });
    expect((await listed(m)).failCategories).toEqual(["Triage", "Alpha"]);
    for (let i = 0; i < 98; i++) await m.marks.addFailCategory(`Cat ${i}`);
    expect((await listed(m)).failCategories).toHaveLength(100);
    await expect(m.marks.addFailCategory("One more")).rejects.toMatchObject({ code: "limit_reached" });
    expect((await listed(m)).failCategories).toHaveLength(100);
  });
  it("a name added once is in the list of two different stories, and the same name is category_exists whatever the story", async () => {
    const m = createMemoryBacking();
    await m.marks.addFailCategory("Triage");
    expect((await listed(m, SCENARIO)).failCategories).toEqual(["Triage"]);
    expect((await listed(m, "priya-ato")).failCategories).toEqual(["Triage"]);
    await m.marks.addFailCategory("Other");
    expect((await listed(m, "priya-ato")).failCategories).toEqual(["Triage", "Other"]);
    expect((await listed(m, SCENARIO)).failCategories).toEqual(["Triage", "Other"]);
  });
  it("a refused name is refused before it is held", async () => {
    const m = createMemoryBacking();
    await m.marks.addFailCategory("Triage");
    await expect(m.marks.addFailCategory(VISA_DASHED)).rejects.toMatchObject({ code: "card_number" });
    await expect(m.marks.addFailCategory("x".repeat(25))).rejects.toMatchObject({ code: "too_long" });
    expect((await listed(m)).failCategories).toEqual(["Triage"]);
  });
  it("is apart from the note categories: a typed Fail category may equal a note category's name", async () => {
    const m = createMemoryBacking();
    await m.backing.addCategory("Lead");
    await expect(m.marks.addFailCategory("Lead")).resolves.toEqual({ name: "Lead" });
    expect(((await m.backing.list(SCENARIO)) as { categories: string[] }).categories).toEqual(["Lead"]);
    expect((await listed(m)).failCategories).toEqual(["Lead"]);
  });
});

describe("memory backing: paths", () => {
  const stops = (...ns: number[]) => ns.map(rec);
  const draftPath = (over: Record<string, unknown> = {}) => ({ scenario: SCENARIO, name: "Path 1", stops: stops(1, 2), ...over });
  const pathOf = async (p: Promise<unknown>): Promise<CustomPath> => {
    const r = checkPath(await p);
    if (!r.ok) throw new Error("not a path");
    return r.value;
  };

  it("createPath mints an id the guard passes, seq per story, and the reply passes the page's check", async () => {
    const m = createMemoryBacking(fixedUuids());
    const a = await pathOf(m.marks.createPath(draftPath()));
    const b = await pathOf(m.marks.createPath(draftPath({ name: "Path 2" })));
    const other = await pathOf(m.marks.createPath(draftPath({ scenario: "priya-ato" })));
    expect([a.seq, b.seq, other.seq]).toEqual([1, 2, 1]);
    expect(isPathId(a.id)).toBe(true);
    expect(a.id).not.toBe(b.id);
  });
  it("an id the card guard refuses is drawn again", async () => {
    const draws = [VISA_UUID, WIRE_UUID];
    let i = 0;
    const m = createMemoryBacking(() => draws[i++]);
    const p = await pathOf(m.marks.createPath(draftPath()));
    expect(p.id).toBe("path-0123456789abcdef0123456789abcdef");
    expect(i).toBe(2);
  });
  it("the 21st path of a story is limit_reached; a draft the check refuses is refused", async () => {
    const m = createMemoryBacking(fixedUuids());
    for (let i = 0; i < 20; i++) await m.marks.createPath(draftPath({ name: `Path ${i + 1}` }));
    await expect(m.marks.createPath(draftPath())).rejects.toMatchObject({ code: "limit_reached" });
    await expect(m.marks.createPath(draftPath({ scenario: "priya-ato", stops: stops(1) }))).rejects.toMatchObject({ code: "bad_request" });
    await expect(m.marks.createPath(draftPath({ scenario: "priya-ato", stops: stops(1, 1) }))).rejects.toMatchObject({ code: "bad_request" });
  });
  it("updatePath changes name and stops and keeps id, scenario and seq; an unknown id is not_found", async () => {
    const m = createMemoryBacking(fixedUuids());
    const a = await pathOf(m.marks.createPath(draftPath()));
    const u = await pathOf(m.marks.updatePath(a.id, { name: "Renamed", stops: stops(3, 4, 5) }));
    expect(u).toEqual({ ...a, name: "Renamed", stops: stops(3, 4, 5) });
    await expect(m.marks.updatePath("path-" + "e".repeat(32), { name: "X", stops: stops(1, 2) })).rejects.toMatchObject({ code: "not_found" });
    await expect(m.marks.updatePath(a.id, { name: "X", stops: stops(1) })).rejects.toMatchObject({ code: "bad_request" });
  });
  it("removePath removes the row; a missing id does not throw; after the top seq goes a new path takes max plus 1", async () => {
    const m = createMemoryBacking(fixedUuids());
    const a = await pathOf(m.marks.createPath(draftPath()));
    const b = await pathOf(m.marks.createPath(draftPath({ name: "Path 2" })));
    await m.marks.removePath(b.id);
    await expect(m.marks.removePath(b.id)).resolves.toBeUndefined();
    expect((await listed(m)).paths.map((p) => p.id)).toEqual([a.id]);
    const c = await pathOf(m.marks.createPath(draftPath({ name: "Path 3" })));
    expect(c.seq).toBe(2);
  });
  it("lists paths in seq order and every read is a copy", async () => {
    const m = createMemoryBacking(fixedUuids());
    await m.marks.createPath(draftPath());
    await m.marks.createPath(draftPath({ name: "Path 2" }));
    const l = await listed(m);
    expect(l.paths.map((p) => p.seq)).toEqual([1, 2]);
    l.paths[0].name = "Changed";
    l.paths[0].stops.length = 0;
    expect((await listed(m)).paths[0]).toMatchObject({ name: "Path 1" });
    expect((await listed(m)).paths[0].stops).toHaveLength(2);
  });
});

describe("memory backing: the wire texts", () => {
  it("holds LIST_WIRE after the three writes, and exports FILE_V2_WIRE", async () => {
    const m = createMemoryBacking(() => WIRE_UUID);
    await m.marks.putNode(JSON.parse(NODE_WIRE), false);
    await m.marks.addFailCategory("Shared key");
    await m.marks.createPath({ scenario: SCENARIO, name: "Path 1", stops: [{ kind: "auth", id: "tx-0001" }, { kind: "login", id: "lg-0002" }] });
    expect(JSON.stringify(await m.marks.list(SCENARIO))).toBe(LIST_WIRE);
    expect(JSON.stringify(await m.exportFile(SCENARIO))).toBe(FILE_V2_WIRE);
  });
});

// ---------------------------------------------------------------------------- the file at version 2 (F7)

describe("memory backing: export and import at version 2", () => {
  const checked = (raw: unknown): NotesFile => {
    const r = checkFile(raw, { scenarios: [SCENARIO] });
    if (!r.ok) throw new Error(`file should pass: ${r.code} ${r.where}`);
    return r.value;
  };
  const stopsOf = (...ns: number[]) => ns.map(rec);
  const snapshot = async (m: NotesTransport) => JSON.stringify([await m.backing.list(SCENARIO), await m.marks.list(SCENARIO)]);

  it("exportFile equals buildNotesFile with the held marks and passes checkFile", async () => {
    const m = createMemoryBacking(fixedUuids());
    await m.backing.create(draft({ time: 9 }));
    await m.marks.putNode(node({ record: rec(2), disposition: "pass", settled: true }), false);
    await m.marks.putNode(node({ record: rec(1), pinned: true }), false);
    await m.marks.addFailCategory("Lead");
    await m.marks.createPath({ scenario: SCENARIO, name: "Path 1", stops: stopsOf(1, 2) });
    const file = await m.exportFile(SCENARIO);
    const l = await listed(m);
    const held = ((await m.backing.list(SCENARIO)) as { notes: Note[] }).notes;
    expect(file).toEqual(buildNotesFile(SCENARIO, [], held, { nodes: l.nodes, paths: l.paths, failCategories: l.failCategories }));
    expect(checkFile(file, { scenarios: [SCENARIO] }).ok).toBe(true);
  });

  it("a node of the file replaces the held node of its record, with settled = held OR the file's", async () => {
    const m = createMemoryBacking(fixedUuids());
    await m.marks.putNode(node({ record: rec(1), disposition: "pass", pinned: true, settled: true }), false);
    await m.marks.putNode(node({ record: rec(2), pinned: true, settled: false }), false);
    const file = checked(
      buildNotesFile(SCENARIO, [], [], {
        nodes: [
          node({ record: rec(1), disposition: "none", pinned: false, settled: false }),
          node({ record: rec(2), disposition: "fail", category: "Lead", settled: true }),
          node({ record: rec(3), disposition: "wait", settled: false }),
        ],
        paths: [],
        failCategories: [],
      }),
    );
    await m.importFile(file);
    const l = (await listed(m)).nodes;
    expect(l[0]).toMatchObject({ record: rec(1), disposition: "none", pinned: false, settled: true });
    expect(l[1]).toMatchObject({ record: rec(2), disposition: "fail", category: "Lead", pinned: false, settled: true });
    expect(l[2]).toMatchObject({ record: rec(3), disposition: "wait", settled: false });
  });

  it("a held path keeps its seq and takes the file's name and stops; a new path takes the next seq in file order", async () => {
    const m = createMemoryBacking(fixedUuids());
    const a = checkPath(await m.marks.createPath({ scenario: SCENARIO, name: "Path 1", stops: stopsOf(1, 2) }));
    if (!a.ok) throw new Error("path");
    const idB = "path-" + "b".repeat(32);
    const idC = "path-" + "c".repeat(32);
    const file = checked(
      buildNotesFile(SCENARIO, [], [], {
        nodes: [],
        paths: [
          makePath({ id: idC, seq: 7, name: "Second", stops: stopsOf(3, 4) }),
          makePath({ id: a.value.id, seq: 9, name: "Renamed", stops: stopsOf(5, 6) }),
          makePath({ id: idB, seq: 8, name: "Third", stops: stopsOf(7, 8) }),
        ],
        failCategories: [],
      }),
    );
    await m.importFile(file);
    const byId = new Map((await listed(m)).paths.map((p) => [p.id, p]));
    expect(byId.get(a.value.id)).toMatchObject({ seq: 1, name: "Renamed", stops: stopsOf(5, 6) });
    // buildNotesFile writes paths in seq order (idC 7, idB 8, held 9), so the new ones take 2 then 3.
    expect(byId.get(idC)?.seq).toBe(2);
    expect(byId.get(idB)?.seq).toBe(3);
  });

  it("a path id held by another story throws bad_file and nothing changes (notes, nodes, paths, Fail categories)", async () => {
    const m = createMemoryBacking(fixedUuids());
    const other = checkPath(await m.marks.createPath({ scenario: "priya-ato", name: "Path 1", stops: stopsOf(1, 2) }));
    if (!other.ok) throw new Error("path");
    await m.backing.create(draft({ time: 5 }));
    await m.marks.putNode(node({ record: rec(1), pinned: true }), false);
    await m.marks.addFailCategory("Held");
    const before = await snapshot(m);
    const file = checked(
      buildNotesFile(SCENARIO, ["Lead"], [makeNote({ id: "note-" + "ab".repeat(16), seq: 1, time: 6 })], {
        nodes: [node({ record: rec(9), disposition: "pass" })],
        paths: [makePath({ id: other.value.id, seq: 1 })],
        failCategories: ["New one"],
      }),
    );
    await expect(m.importFile(file)).rejects.toMatchObject({ code: "bad_file" });
    expect(await snapshot(m)).toBe(before);
    expect(JSON.stringify(await m.exportFile(SCENARIO))).not.toContain("New one");
  });

  it("the limits throw limit_reached and apply nothing: nodes, paths, Fail categories", async () => {
    const m = createMemoryBacking(fixedUuids());
    for (let i = 0; i < 999; i++) await m.marks.putNode(node({ record: rec(i) }), false);
    for (let i = 0; i < 19; i++) await m.marks.createPath({ scenario: SCENARIO, name: `Path ${i + 1}`, stops: stopsOf(1, 2) });
    for (let i = 0; i < 99; i++) await m.marks.addFailCategory(`Cat ${i}`);
    const before = await snapshot(m);
    const nodes = checked(buildNotesFile(SCENARIO, [], [], { nodes: [node({ record: rec(2000) }), node({ record: rec(2001) })], paths: [], failCategories: [] }));
    await expect(m.importFile(nodes)).rejects.toMatchObject({ code: "limit_reached" });
    const paths = checked(
      buildNotesFile(SCENARIO, [], [], {
        nodes: [],
        paths: [makePath({ id: "path-" + "d".repeat(32), seq: 1 }), makePath({ id: "path-" + "e".repeat(32), seq: 2 })],
        failCategories: [],
      }),
    );
    await expect(m.importFile(paths)).rejects.toMatchObject({ code: "limit_reached" });
    const cats = checked(buildNotesFile(SCENARIO, [], [], { nodes: [], paths: [], failCategories: ["New A", "New B"] }));
    await expect(m.importFile(cats)).rejects.toMatchObject({ code: "limit_reached" });
    expect(await snapshot(m)).toBe(before);
  });

  it("Fail categories merge ignoring case", async () => {
    const m = createMemoryBacking(fixedUuids());
    await m.marks.addFailCategory("Triage");
    await m.importFile(checked(buildNotesFile(SCENARIO, [], [], { nodes: [], paths: [], failCategories: ["triage", "Other"] })));
    expect((await listed(m)).failCategories).toEqual(["Triage", "Other"]);
  });

  it("an export of either story carries the whole shared list", async () => {
    const m = createMemoryBacking(fixedUuids());
    await m.marks.addFailCategory("Triage");
    await m.marks.addFailCategory("Alpha");
    for (const story of [SCENARIO, "priya-ato"]) {
      const file = (await m.exportFile(story)) as NotesFile;
      expect(file.failCategories).toEqual(["Triage", "Alpha"]);
    }
  });

  it("a file of one story merges its Fail categories into the list every story sees", async () => {
    const m = createMemoryBacking(fixedUuids());
    await m.marks.addFailCategory("Triage");
    const file = checkFile(buildNotesFile("priya-ato", [], [], { nodes: [], paths: [], failCategories: ["TRIAGE", "From file"] }), { scenarios: ["priya-ato"] });
    if (!file.ok) throw new Error("file should pass");
    await m.importFile(file.value);
    expect((await listed(m, SCENARIO)).failCategories).toEqual(["Triage", "From file"]);
    expect((await listed(m, "priya-ato")).failCategories).toEqual(["Triage", "From file"]);
  });

  it("a file with two new names into a list that holds 99 is refused whole: 99 stay, and nothing else of the file is kept", async () => {
    const m = createMemoryBacking(fixedUuids());
    for (let i = 0; i < 99; i++) await m.marks.addFailCategory(`Cat ${i}`);
    const file = checkFile(
      buildNotesFile("priya-ato", [], [makeNote({ scenario: "priya-ato", id: "note-" + "ab".repeat(16), seq: 1, time: 6 })], {
        nodes: [node({ scenario: "priya-ato", record: rec(9), disposition: "pass" })],
        paths: [],
        failCategories: ["New A", "New B"],
      }),
      { scenarios: ["priya-ato"] },
    );
    if (!file.ok) throw new Error("file should pass");
    await expect(m.importFile(file.value)).rejects.toMatchObject({ code: "limit_reached" });
    for (const story of [SCENARIO, "priya-ato"]) {
      const l = await listed(m, story);
      expect(l.failCategories).toHaveLength(99);
      expect(l.nodes).toHaveLength(0);
    }
    expect(((await m.backing.list("priya-ato")) as { notes: Note[] }).notes).toHaveLength(0);
    // one new name still fits, and the shared list then holds 100
    const one = checkFile(buildNotesFile("priya-ato", [], [], { nodes: [], paths: [], failCategories: ["New A"] }), { scenarios: ["priya-ato"] });
    if (!one.ok) throw new Error("file should pass");
    await m.importFile(one.value);
    expect((await listed(m)).failCategories).toHaveLength(100);
  });

  it("a version 1 file loads and leaves the marks as they were", async () => {
    const m = createMemoryBacking(fixedUuids());
    await m.marks.putNode(node({ record: rec(1), pinned: true }), false);
    await m.importFile(checked({ format: "ffr-notes", version: 1, scenario: SCENARIO, categories: [], notes: [] }));
    expect((await listed(m)).nodes).toHaveLength(1);
  });
});
