/**
 * The path session store: the draft, the paths switched off for this visit and the path the pointer is
 * on. The marks store is replaced by a fake with `getState` only, so the test reaches one method of it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Check } from "../../lib/notes/types";
import type { CustomPath, RecordRef } from "../../lib/marks/types";
import { makePath } from "../../lib/notes/test-fixtures";

const createPath = vi.fn<[RecordRef[], string?], Promise<Check<CustomPath>>>();
vi.mock("../../store/marks", () => ({ useMarksStore: { getState: () => ({ createPath }) } }));

import { usePathSession } from "./path-session";

const ref = (id: string, kind = "auth"): RecordRef => ({ kind, id });
const state = () => usePathSession.getState();

beforeEach(() => {
  createPath.mockReset();
  usePathSession.setState({ draft: null, hidden: [], chosen: null });
});

describe("the draft", () => {
  it("start opens a draft with no stop, and is a no-op while one is open", () => {
    state().start("Path 3");
    expect(state().draft).toEqual({ name: "Path 3", stops: [], asking: false, saving: false, refused: null });
    state().addStop(ref("a"));
    state().start("Path 9");
    expect(state().draft?.name).toBe("Path 3");
    expect(state().draft?.stops).toHaveLength(1);
  });

  it("addStop appends a canonical ref: a fraud kind is written as auth", () => {
    state().start("Path 1");
    expect(state().addStop(ref("t-1", "fraud"))).toBe(true);
    expect(state().addStop(ref("l-1", "login"))).toBe(true);
    expect(state().draft?.stops).toEqual([ref("t-1", "auth"), ref("l-1", "login")]);
  });

  it("addStop refuses a record already in the draft, by its canonical key, and answers false", () => {
    state().start("Path 1");
    expect(state().addStop(ref("t-1", "auth"))).toBe(true);
    expect(state().addStop(ref("t-1", "fraud"))).toBe(false);
    expect(state().addStop(ref("t-1", "auth"))).toBe(false);
    expect(state().draft?.stops).toHaveLength(1);
  });

  it("addStop refuses the 51st stop", () => {
    state().start("Path 1");
    for (let i = 0; i < 50; i++) expect(state().addStop(ref(`r-${i}`))).toBe(true);
    expect(state().addStop(ref("r-50"))).toBe(false);
    expect(state().draft?.stops).toHaveLength(50);
  });

  it("addStop answers false with no draft and starts none", () => {
    expect(state().addStop(ref("a"))).toBe(false);
    expect(state().draft).toBeNull();
  });

  it("removeStop drops the stop at that index", () => {
    state().start("Path 1");
    for (const id of ["a", "b", "c"]) state().addStop(ref(id));
    state().removeStop(1);
    expect(state().draft?.stops.map((s) => s.id)).toEqual(["a", "c"]);
    state().removeStop(7);
    expect(state().draft?.stops).toHaveLength(2);
  });

  it("ask, keep and discard", () => {
    state().start("Path 1");
    state().addStop(ref("a"));
    state().ask();
    expect(state().draft?.asking).toBe(true);
    state().keep();
    expect(state().draft?.asking).toBe(false);
    expect(state().draft?.stops).toHaveLength(1);
    state().ask();
    state().discard();
    expect(state().draft).toBeNull();
  });
});

describe("finish", () => {
  it("with no draft or under two stops does not call the store and answers a refusal", async () => {
    const none = await state().finish();
    expect(none.ok).toBe(false);
    state().start("Path 1");
    state().addStop(ref("a"));
    const one = await state().finish();
    expect(one.ok).toBe(false);
    expect(createPath).not.toHaveBeenCalled();
    expect(state().draft?.stops).toHaveLength(1);
    expect(state().draft?.saving).toBe(false);
  });

  it("calls the store once with the stops and the name, and clears the draft on ok", async () => {
    const saved = makePath({ name: "Path 1" });
    createPath.mockResolvedValue(ok(saved));
    state().start("Path 1");
    state().addStop(ref("a"));
    state().addStop(ref("b"));
    const answer = await state().finish();
    expect(createPath).toHaveBeenCalledTimes(1);
    expect(createPath).toHaveBeenCalledWith([ref("a"), ref("b")], "Path 1");
    expect(answer).toEqual(ok(saved));
    expect(state().draft).toBeNull();
  });

  it("on a refusal keeps the draft with the code set and saving false", async () => {
    createPath.mockResolvedValue(fail("limit_reached", "paths"));
    state().start("Path 1");
    state().addStop(ref("a"));
    state().addStop(ref("b"));
    const answer = await state().finish();
    expect(answer.ok).toBe(false);
    expect(state().draft?.refused).toBe("limit_reached");
    expect(state().draft?.saving).toBe(false);
    expect(state().draft?.stops).toHaveLength(2);
  });

  it("a store that throws is a refusal too, never a stuck saving flag", async () => {
    createPath.mockRejectedValue(new Error("down"));
    state().start("Path 1");
    state().addStop(ref("a"));
    state().addStop(ref("b"));
    const answer = await state().finish();
    expect(answer.ok).toBe(false);
    expect(state().draft?.refused).toBe("backing_failed");
    expect(state().draft?.saving).toBe(false);
  });

  it("while it saves a second finish does not call the store, and saving shows in the draft", async () => {
    let release: (c: Check<CustomPath>) => void = () => {};
    createPath.mockReturnValue(new Promise<Check<CustomPath>>((r) => (release = r)));
    state().start("Path 1");
    state().addStop(ref("a"));
    state().addStop(ref("b"));
    const first = state().finish();
    expect(state().draft?.saving).toBe(true);
    // The stops hold still while the store answers.
    expect(state().addStop(ref("c"))).toBe(false);
    state().removeStop(0);
    expect(state().draft?.stops.map((s) => s.id)).toEqual(["a", "b"]);
    const second = await state().finish();
    expect(second.ok).toBe(false);
    expect(createPath).toHaveBeenCalledTimes(1);
    release(ok(makePath()));
    await first;
    expect(state().draft).toBeNull();
  });

  it("a new press after a refusal clears the old refusal before it asks again", async () => {
    createPath.mockResolvedValueOnce(fail("backing_failed", "paths"));
    state().start("Path 1");
    state().addStop(ref("a"));
    state().addStop(ref("b"));
    await state().finish();
    expect(state().draft?.refused).toBe("backing_failed");
    let release: (c: Check<CustomPath>) => void = () => {};
    createPath.mockReturnValueOnce(new Promise<Check<CustomPath>>((r) => (release = r)));
    const again = state().finish();
    expect(state().draft?.refused).toBeNull();
    release(ok(makePath()));
    await again;
  });
});

describe("the switches and the hovered path", () => {
  it("toggleHidden flips membership", () => {
    state().toggleHidden("p1");
    expect(state().hidden).toEqual(["p1"]);
    state().toggleHidden("p2");
    state().toggleHidden("p1");
    expect(state().hidden).toEqual(["p2"]);
  });

  it("forget drops the id from hidden and clears chosen only when it names that id", () => {
    usePathSession.setState({ hidden: ["p1", "p2"], chosen: "p1" });
    state().forget("p2");
    expect(state().hidden).toEqual(["p1"]);
    expect(state().chosen).toBe("p1");
    state().forget("p1");
    expect(state().hidden).toEqual([]);
    expect(state().chosen).toBeNull();
  });

  it("choose sets or clears the hovered path", () => {
    state().choose("p1");
    expect(state().chosen).toBe("p1");
    state().choose(null);
    expect(state().chosen).toBeNull();
  });
});
