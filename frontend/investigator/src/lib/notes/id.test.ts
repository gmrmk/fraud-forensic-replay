import { describe, it, expect } from "vitest";
import { makeNoteId } from "./id";
import { refusesText } from "./guard";
import { isNoteId } from "./schema";

// 16 digits of the published Visa test number, then 16 letters: once the dashes are dropped this
// is a valid 32 hex id that holds a card number.
const REFUSED_UUID = "41111111-1111-1111-abcd-efabcdefabcd";
const CLEAN_UUID = "0123abcd-4567-89ab-cdef-0123456789ab";

describe("makeNoteId", () => {
  it("makes note- plus 32 lowercase hex from a uuid, dashes dropped", () => {
    expect(makeNoteId(() => CLEAN_UUID)).toBe("note-0123abcd456789abcdef0123456789ab");
    expect(makeNoteId(() => CLEAN_UUID.toUpperCase())).toBe("note-0123abcd456789abcdef0123456789ab");
  });
  it("draws again when the guard refuses the id it drew", () => {
    let draws = 0;
    const id = makeNoteId(() => {
      draws += 1;
      return draws === 1 ? REFUSED_UUID : CLEAN_UUID;
    });
    expect(draws).toBe(2);
    expect(id).toBe("note-0123abcd456789abcdef0123456789ab");
    expect(refusesText("note-4111111111111111abcdefabcdefabcd")).toBe(true);
  });
  it("draws as many times as it takes, then stops with an error that holds no id", () => {
    let draws = 0;
    expect(() =>
      makeNoteId(() => {
        draws += 1;
        return REFUSED_UUID;
      }, 5),
    ).toThrow(/id/);
    expect(draws).toBe(5);
    try {
      makeNoteId(() => REFUSED_UUID, 2);
    } catch (e) {
      expect(String(e)).not.toContain("4111");
    }
  });
  it("refuses a source that returns something that is not a uuid", () => {
    expect(() => makeNoteId(() => "not a uuid", 3)).toThrow();
    expect(() => makeNoteId(() => "note-" + "g".repeat(32), 3)).toThrow();
  });
  it("the default source makes ids that pass the schema and the guard", () => {
    for (let i = 0; i < 200; i++) {
      const id = makeNoteId();
      expect(isNoteId(id)).toBe(true);
      expect(refusesText(id)).toBe(false);
    }
  });
});
