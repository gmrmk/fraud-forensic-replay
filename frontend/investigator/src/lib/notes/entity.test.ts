import { describe, it, expect } from "vitest";
import { noteToEntity } from "./entity";
import { bodyOf, doc, makeNote, para } from "./test-fixtures";

describe("noteToEntity: the abstract shape", () => {
  const linked = makeNote({ link: { kind: "transaction", id: "tx-0001042" }, category: "Question", decision: "fail", colour: "r3", seq: 4, body: bodyOf("Check the terminal.") });

  it("carries id, kind, timestamp and the note's fields", () => {
    const e = noteToEntity(linked, () => ({ lat: 29.76, lng: -95.37 }));
    expect(e.id).toBe(linked.id);
    expect(e.kind).toBe("note");
    expect(e.timestamp).toBe(linked.time);
    expect(e.coords).toEqual({ lat: 29.76, lng: -95.37 });
    expect(e.fields).toEqual({
      category: "Question",
      decision: "fail",
      colour: "r3",
      label: "Check the terminal.",
      body: linked.body,
      link_kind: "transaction",
      link_id: "tx-0001042",
      seq: 4,
      scenario: "card-fraud",
    });
  });
  it("displayMetadata names the label, the category and the note palette; nothing pivots", () => {
    const e = noteToEntity(linked, () => null);
    expect(e.displayMetadata).toEqual({
      primaryLabel: "Check the terminal.",
      secondaryLabel: "Question",
      paletteKind: "note",
      pivotableFields: [],
      detailFieldOrder: ["category", "decision", "time", "link", "body"],
    });
  });
  it("has no coordinates when the note has no link, and does not ask to resolve one", () => {
    let asked = 0;
    const e = noteToEntity(makeNote({ link: null }), () => {
      asked += 1;
      return { lat: 1, lng: 2 };
    });
    expect(e.coords).toBeNull();
    expect(asked).toBe(0);
    expect(e.fields.link_kind).toBeNull();
    expect(e.fields.link_id).toBeNull();
  });
  it("has no coordinates when the record is missing from the data", () => {
    expect(noteToEntity(linked, () => null).coords).toBeNull();
  });
  it("uses the category as the label when the text is empty", () => {
    const e = noteToEntity(makeNote({ body: doc(para()), category: "Context" }), () => null);
    expect(e.displayMetadata.primaryLabel).toBe("Context");
    expect(e.fields.label).toBe("Context");
  });
});
