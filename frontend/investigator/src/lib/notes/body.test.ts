import { describe, it, expect } from "vitest";
import { bodyFromPlainText, charCount, emptyBody, flattenBody, noteLabel } from "./body";
import { checkBody } from "./schema";
import { bodyOf, doc, para, text } from "./test-fixtures";

describe("charCount", () => {
  it("counts code points, as Python's len does", () => {
    expect(charCount("abc")).toBe(3);
    expect(charCount(String.fromCodePoint(0x1f600))).toBe(1);
    expect(charCount("")).toBe(0);
  });
});

describe("flattenBody", () => {
  it("joins text across marks, and blocks and hard breaks by one line feed", () => {
    expect(flattenBody(doc(para(text("a", "bold"), text("b"))))).toBe("ab");
    expect(flattenBody(doc(para(text("a")), para(text("b"))))).toBe("a\nb");
    expect(flattenBody(doc(para(text("a"), { type: "hard_break" }, text("b"))))).toBe("a\nb");
  });
  it("reads list items and quote paragraphs in order, and counts an empty paragraph", () => {
    const d = doc(
      { type: "bullet_list", content: [{ type: "list_item", content: [para(text("x"))] }, { type: "list_item", content: [para(text("y"))] }] },
      { type: "quote", content: [para(text("q1")), para(text("q2"))] },
      para(),
      para(text("end")),
    );
    expect(flattenBody(d)).toBe("x\ny\nq1\nq2\n\nend");
  });
  it("is empty for an empty document", () => {
    expect(flattenBody(emptyBody())).toBe("");
  });
});

describe("bodyFromPlainText and emptyBody", () => {
  it("makes one paragraph per line and passes the closed schema", () => {
    const b = bodyFromPlainText("one\n\nthree");
    expect(b.content).toHaveLength(3);
    expect(flattenBody(b)).toBe("one\n\nthree");
    expect(checkBody(b).ok).toBe(true);
    expect(checkBody(emptyBody()).ok).toBe(true);
    expect(emptyBody()).toEqual({ v: 1, content: [] });
  });
  it("drops control and bidi characters, and normalises after the drop so the result is NFC", () => {
    const cp = String.fromCodePoint;
    // a letter, a control character, then a combining acute: only after the drop do they meet
    const b = bodyFromPlainText("e" + cp(0x01) + cp(0x0301) + "\r\nline" + cp(0x202e) + "two");
    expect(flattenBody(b)).toBe(cp(0x00e9) + "\nlinetwo");
    expect(checkBody(b).ok).toBe(true);
  });
});

describe("noteLabel", () => {
  it("is the first line of the text", () => {
    expect(noteLabel({ body: doc(para(text("First line")), para(text("Second"))), category: "Question" })).toBe("First line");
  });
  it("skips leading empty lines", () => {
    expect(noteLabel({ body: doc(para(), para(text("  Later line  "))), category: "Note" })).toBe("Later line");
  });
  it("is the category when the text is empty", () => {
    expect(noteLabel({ body: emptyBody(), category: "Follow up" })).toBe("Follow up");
    expect(noteLabel({ body: doc(para(), para()), category: "Source" })).toBe("Source");
  });
  it("is at most 60 characters, counting code points", () => {
    const long = noteLabel({ body: bodyOf("a".repeat(100)), category: "Note" });
    expect(charCount(long)).toBeLessThanOrEqual(60);
    expect(long.startsWith("aaaa")).toBe(true);
    const exact = "b".repeat(60);
    expect(noteLabel({ body: bodyOf(exact), category: "Note" })).toBe(exact);
    const astral = noteLabel({ body: bodyOf(String.fromCodePoint(0x1f600).repeat(80)), category: "Note" });
    expect(charCount(astral)).toBeLessThanOrEqual(60);
    expect(astral).not.toMatch(/[\ud800-\udbff]$/); // never cut inside a surrogate pair
  });
  it("stops at a hard break", () => {
    expect(noteLabel({ body: doc(para(text("head"), { type: "hard_break" }, text("tail"))), category: "Note" })).toBe("head");
  });
});
