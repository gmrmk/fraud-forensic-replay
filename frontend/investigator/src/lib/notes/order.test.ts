import { describe, it, expect } from "vitest";
import { compareNotes, sortNotes } from "./order";
import { makeNote } from "./test-fixtures";

const n = (seq: number, time: number) => makeNote({ id: "note-" + String(seq).padStart(32, "0"), seq, time });

describe("order: time, then seq", () => {
  it("earlier time first", () => {
    expect(sortNotes([n(1, 300), n(2, 100), n(3, 200)]).map((x) => x.seq)).toEqual([2, 3, 1]);
  });
  it("equal time: the lower seq first", () => {
    expect(sortNotes([n(5, 100), n(2, 100), n(9, 100), n(1, 50)]).map((x) => x.seq)).toEqual([1, 2, 5, 9]);
  });
  it("does not change its input", () => {
    const input = [n(2, 200), n(1, 100)];
    const out = sortNotes(input);
    expect(input.map((x) => x.seq)).toEqual([2, 1]);
    expect(out).not.toBe(input);
  });
  it("compares by sign", () => {
    expect(Math.sign(compareNotes(n(1, 1), n(2, 2)))).toBe(-1);
    expect(Math.sign(compareNotes(n(2, 1), n(1, 1)))).toBe(1);
    expect(compareNotes(n(1, 1), n(1, 1))).toBe(0);
  });
});
