/**
 * The notes store: the backing is injected, and a note reaches the state only after the whole
 * field check and the card number guard, whichever backing it comes from.
 */
import { describe, it, expect, vi } from "vitest";
import { createNotesStore, type NotesBacking } from "./notes";
import { LIMITS, type Note, type NoteDraft } from "../lib/notes/types";
import { VISA, bodyOf, clone, makeNote } from "../lib/notes/test-fixtures";

const idOf = (n: number) => "note-" + "abcd".repeat(7) + n.toString(16).padStart(4, "0");
const note = (n: number, over: Partial<Note> = {}) => makeNote({ id: idOf(n), seq: n, time: 1763556000000 + n * 1000, ...over });
const draftOf = (over: Partial<NoteDraft> = {}): NoteDraft => {
  const { id: _i, seq: _s, ...d } = makeNote();
  return { ...d, ...over };
};

function backing(over: Partial<NotesBacking> = {}) {
  const b = {
    list: vi.fn(async (_s: string) => ({ notes: [] as unknown[], categories: [] as unknown[], skipped: 0 })),
    create: vi.fn(async (d: NoteDraft) => ({ ...clone(d), id: idOf(100), seq: 100 })),
    update: vi.fn(async (id: string, f: object) => ({ ...clone(note(1)), ...clone(f), id })),
    remove: vi.fn(async (_id: string) => undefined),
    addCategory: vi.fn(async (name: string) => ({ name })),
    ...over,
  };
  return b as typeof b & NotesBacking;
}
async function loaded(b: NotesBacking, notes: Note[] = [note(1), note(2)], categories: string[] = ["Lead"]) {
  (b.list as ReturnType<typeof vi.fn>).mockResolvedValue({ notes: clone(notes), categories, skipped: 0 });
  const store = createNotesStore(b);
  await store.getState().load("card-fraud");
  return store;
}

describe("load", () => {
  it("asks the backing for the scenario and keeps the notes ordered by time, then seq", async () => {
    const b = backing();
    const store = await loaded(b, [note(3, { time: 5 }), note(2, { time: 5 }), note(1, { time: 9 })], ["Lead", "Ring"]);
    expect(b.list).toHaveBeenCalledWith("card-fraud");
    const s = store.getState();
    expect(s.scenario).toBe("card-fraud");
    expect(s.notes.map((n) => n.seq)).toEqual([2, 3, 1]);
    expect(s.customCategories).toEqual(["Lead", "Ring"]);
    expect(s.skipped).toBe(0);
    expect(s.error).toBeNull();
  });
  it("drops every note that fails the field check or the guard, counts them, and keeps the rest", async () => {
    const poisoned: unknown[] = [
      { ...note(10), colour: "url(https://x.test/a.png)" },
      { ...note(11), extra: 1 },
      { ...note(12), body: bodyOf("card " + VISA) },
      { ...note(13), id: "note-" + VISA + "abcdefabcdefabcd" },
      { ...note(14), category: "4111 1111 1111 1111" },
      { ...note(15), scenario: "priya-ato" },
      { ...note(16), decision: "approved" },
      JSON.parse(JSON.stringify(note(17)).replace("{", '{"__proto__":{"x":1},')),
      "a string",
      null,
    ];
    const good = [note(1), note(2)];
    const store = await loaded(backing(), [...good, ...(poisoned as Note[])]);
    const s = store.getState();
    expect(s.notes.map((n) => n.id)).toEqual(good.map((n) => n.id));
    expect(s.skipped).toBe(poisoned.length);
    expect(JSON.stringify(s)).not.toContain("4111");
    expect(JSON.stringify(s)).not.toContain("url(");
  });
  it("drops a repeated id and a seq that two notes hold, and adds the backing's own skipped count", async () => {
    const b = backing();
    (b.list as ReturnType<typeof vi.fn>).mockResolvedValue({ notes: [note(1), note(1), note(2, { seq: 1 }), note(3)], categories: [], skipped: 4 });
    const store = createNotesStore(b);
    await store.getState().load("card-fraud");
    expect(store.getState().notes.map((n) => n.id)).toEqual([idOf(1), idOf(3)]);
    expect(store.getState().skipped).toBe(4 + 2);
  });
  it("drops a custom category that fails its check", async () => {
    const store = await loaded(backing(), [], ["Lead", "4111 1111 1111 1111", "x".repeat(30), "lead", 5 as never]);
    expect(store.getState().customCategories).toEqual(["Lead"]);
  });
  it("keeps at most 1,000 notes", async () => {
    const many = Array.from({ length: LIMITS.notesPerScenario + 5 }, (_, i) => note(i + 1));
    const store = await loaded(backing(), many);
    expect(store.getState().notes).toHaveLength(LIMITS.notesPerScenario);
  });
  it("a reply that is not an object holds no notes; a bad scenario never reaches the backing", async () => {
    const b = backing({ list: vi.fn(async () => "oops") });
    const store = createNotesStore(b);
    const r = await store.getState().load("card-fraud");
    expect(r).toMatchObject({ ok: false, code: "bad_reply" });
    expect(store.getState().notes).toEqual([]);
    const r2 = await store.getState().load("bad scenario!");
    expect(r2).toMatchObject({ ok: false, code: "bad_scenario" });
    expect(b.list).toHaveBeenCalledTimes(1);
  });
  it("a backing that throws leaves the state as it was and the error holds no message", async () => {
    const b = backing();
    const store = await loaded(b);
    (b.list as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("secret 4111111111111111 in a message"));
    const r = await store.getState().load("card-fraud");
    expect(r).toMatchObject({ ok: false, code: "backing_failed" });
    expect(store.getState().notes).toHaveLength(2);
    expect(JSON.stringify(store.getState().error)).not.toContain("4111");
  });
  it("loading another scenario replaces the notes", async () => {
    const b = backing();
    const store = await loaded(b);
    (b.list as ReturnType<typeof vi.fn>).mockResolvedValue({ notes: [note(7, { scenario: "priya-ato" })], categories: [], skipped: 0 });
    await store.getState().load("priya-ato");
    expect(store.getState().scenario).toBe("priya-ato");
    expect(store.getState().notes.map((n) => n.id)).toEqual([idOf(7)]);
  });
  it("without a backing it fails with a code", async () => {
    const store = createNotesStore();
    expect(await store.getState().load("card-fraud")).toMatchObject({ ok: false, code: "backing_failed" });
  });
});

describe("create", () => {
  it("checks the draft first: a refused draft never reaches the backing or the state", async () => {
    const b = backing();
    const store = await loaded(b);
    for (const bad of [draftOf({ body: bodyOf("pay " + VISA) }), draftOf({ colour: "url(x)" as never }), draftOf({ category: "4111-1111-1111-1111" }), { ...draftOf(), extra: 1 }, makeNote()]) {
      const r = await store.getState().create(bad);
      expect(r.ok).toBe(false);
    }
    expect(b.create).not.toHaveBeenCalled();
    expect(store.getState().notes).toHaveLength(2);
    expect(JSON.stringify(store.getState().error)).not.toContain("4111");
  });
  it("sends the checked draft, admits the reply, and keeps the order", async () => {
    const b = backing();
    const store = await loaded(b);
    const r = await store.getState().create(draftOf({ time: 1, body: bodyOf("early") }));
    expect(r.ok).toBe(true);
    expect(b.create).toHaveBeenCalledTimes(1);
    const sent = (b.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(Object.keys(sent).sort()).toEqual(["body", "category", "colour", "decision", "link", "scenario", "time"]);
    expect(store.getState().notes.map((n) => n.seq)).toEqual([100, 1, 2]);
    expect(store.getState().error).toBeNull();
  });
  it("refuses a draft for another scenario", async () => {
    const b = backing();
    const store = await loaded(b);
    expect(await store.getState().create(draftOf({ scenario: "priya-ato" }))).toMatchObject({ ok: false, code: "bad_scenario" });
    expect(b.create).not.toHaveBeenCalled();
  });
  it("refuses at 1,000 notes without asking the backing", async () => {
    const b = backing();
    const many = Array.from({ length: LIMITS.notesPerScenario }, (_, i) => note(i + 1));
    const store = await loaded(b, many);
    expect(await store.getState().create(draftOf())).toMatchObject({ ok: false, code: "limit_reached" });
    expect(b.create).not.toHaveBeenCalled();
  });
  it("a reply that fails the check never reaches the state, whatever it is", async () => {
    const replies: unknown[] = [
      { ...note(100), colour: "url(https://x.test/a.png)" },
      { ...note(100), extra: 1 },
      { ...note(100), body: bodyOf("card " + VISA) },
      { ...note(100), id: "note-" + VISA + "abcdefabcdefabcd" },
      { ...note(100), scenario: "priya-ato" },
      { ...note(100), seq: 1 }, // the seq a stored note holds
      "a string",
      null,
    ];
    for (const reply of replies.slice(0, 6)) {
      const b = backing({ create: vi.fn(async () => reply) });
      const store = await loaded(b);
      const before = clone(store.getState().notes);
      const r = await store.getState().create(draftOf());
      expect(r, JSON.stringify(reply).slice(0, 80)).toMatchObject({ ok: false, code: "bad_reply" });
      expect(store.getState().notes).toEqual(before);
    }
    for (const reply of replies.slice(6)) {
      const b = backing({ create: vi.fn(async () => reply) });
      const store = await loaded(b);
      expect(await store.getState().create(draftOf())).toMatchObject({ ok: false, code: "bad_reply" });
      expect(store.getState().notes).toHaveLength(2);
    }
  });
  it("a backing that throws or rejects leaves the state alone", async () => {
    const b = backing({ create: vi.fn(async () => { throw new Error("down"); }) });
    const store = await loaded(b);
    expect(await store.getState().create(draftOf())).toMatchObject({ ok: false, code: "backing_failed" });
    expect(store.getState().notes).toHaveLength(2);
  });
});

describe("update", () => {
  const fields = () => {
    const { link, colour, category, decision, body } = note(1, { decision: "pass", colour: "r3", body: bodyOf("changed") });
    return { link, colour, category, decision, body };
  };
  it("checks the fields first, and an unknown id never reaches the backing", async () => {
    const b = backing();
    const store = await loaded(b);
    expect(await store.getState().update(idOf(1), { ...fields(), colour: "red" })).toMatchObject({ ok: false });
    expect(await store.getState().update(idOf(1), { ...fields(), body: bodyOf(VISA) })).toMatchObject({ ok: false, code: "card_number" });
    expect(await store.getState().update(idOf(1), { ...fields(), time: 5 })).toMatchObject({ ok: false });
    expect(await store.getState().update(idOf(99), fields())).toMatchObject({ ok: false, code: "not_found" });
    expect(b.update).not.toHaveBeenCalled();
  });
  it("replaces the note with the checked reply", async () => {
    const b = backing({ update: vi.fn(async (id: string, f: object) => ({ ...clone(note(1)), ...clone(f), id })) });
    const store = await loaded(b);
    const r = await store.getState().update(idOf(1), fields());
    expect(r.ok).toBe(true);
    const now = store.getState().notes.find((n) => n.id === idOf(1))!;
    expect(now.decision).toBe("pass");
    expect(now.colour).toBe("r3");
    expect(store.getState().notes).toHaveLength(2);
  });
  it("a reply that fails the check, or names another note, leaves the stored note untouched", async () => {
    const replies: unknown[] = [
      { ...note(1), colour: "url(x)" },
      { ...note(1), extra: 1 },
      { ...note(1), body: bodyOf(VISA) },
      { ...note(1), id: idOf(2) },
      { ...note(1), category: "4111 1111 1111 1111" },
    ];
    for (const reply of replies) {
      const b = backing({ update: vi.fn(async () => reply) });
      const store = await loaded(b);
      const before = clone(store.getState().notes);
      const r = await store.getState().update(idOf(1), fields());
      expect(r).toMatchObject({ ok: false, code: "bad_reply" });
      expect(store.getState().notes).toEqual(before);
    }
  });
});

describe("remove and addCategory", () => {
  it("removes through the backing and drops the note; an unknown id is not_found", async () => {
    const b = backing();
    const store = await loaded(b);
    expect((await store.getState().remove(idOf(1))).ok).toBe(true);
    expect(b.remove).toHaveBeenCalledWith(idOf(1));
    expect(store.getState().notes.map((n) => n.id)).toEqual([idOf(2)]);
    expect(await store.getState().remove(idOf(1))).toMatchObject({ ok: false, code: "not_found" });
  });
  it("keeps the note when the backing fails", async () => {
    const b = backing({ remove: vi.fn(async () => { throw new Error("down"); }) });
    const store = await loaded(b);
    expect(await store.getState().remove(idOf(1))).toMatchObject({ ok: false, code: "backing_failed" });
    expect(store.getState().notes).toHaveLength(2);
  });
  it("adds a category after the name check and the guard", async () => {
    const b = backing();
    const store = await loaded(b);
    const r = await store.getState().addCategory("  Ring  ");
    expect(r).toEqual({ ok: true, value: "Ring" });
    expect(b.addCategory).toHaveBeenCalledWith("Ring");
    expect(store.getState().customCategories).toEqual(["Lead", "Ring"]);
  });
  it("refuses a name that is a card number, too long, empty, or already there (starter or custom, any case)", async () => {
    const b = backing();
    const store = await loaded(b);
    expect(await store.getState().addCategory("4111 1111 1111 1111")).toMatchObject({ ok: false, code: "card_number" });
    expect(await store.getState().addCategory("x".repeat(25))).toMatchObject({ ok: false, code: "too_long" });
    expect(await store.getState().addCategory("   ")).toMatchObject({ ok: false });
    expect(await store.getState().addCategory("question")).toMatchObject({ ok: false, code: "category_exists" });
    expect(await store.getState().addCategory("LEAD")).toMatchObject({ ok: false, code: "category_exists" });
    expect(b.addCategory).not.toHaveBeenCalled();
    expect(store.getState().customCategories).toEqual(["Lead"]);
  });
  it("does not take a reply that names another category, or one that fails the check", async () => {
    for (const reply of [{ name: "Other" }, { name: VISA }, { name: 5 }, "x", null]) {
      const b = backing({ addCategory: vi.fn(async () => reply) });
      const store = await loaded(b);
      expect(await store.getState().addCategory("Ring")).toMatchObject({ ok: false, code: "bad_reply" });
      expect(store.getState().customCategories).toEqual(["Lead"]);
    }
  });
});

describe("clear and the singleton", () => {
  it("clear empties the state and keeps the backing", async () => {
    const b = backing();
    const store = await loaded(b);
    store.getState().clear();
    expect(store.getState()).toMatchObject({ scenario: null, notes: [], customCategories: [], skipped: 0, error: null });
    expect(store.getState().backing).toBe(b);
  });
  it("setBacking swaps the backing", () => {
    const store = createNotesStore();
    const b = backing();
    store.getState().setBacking(b);
    expect(store.getState().backing).toBe(b);
  });
});
