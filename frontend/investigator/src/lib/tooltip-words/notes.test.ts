/**
 * The notes words are the design's list between its ste markers (custom-notes DESIGN-NOTES.md
 * section 3), word for word. The literals are pinned here because the design file is outside the
 * repository. Every sentence is 20 words or fewer, and no sentence holds a dash.
 */
import { describe, it, expect } from "vitest";
import * as W from "./notes";

const collect = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) collect(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) collect(x, out);
  return out;
};

describe("notes words, pinned to the design", () => {
  it("M: the menu and the file", () => {
    expect(W.MENU_BUTTON).toBe("Notes");
    expect(W.ADD_ROW).toEqual({ visible: "Add a note", name: "Add a note at the playhead." });
    expect(W.addRowValueLines("Mon Jun 8 · 5:00p", null)).toEqual(["Playhead time: Mon Jun 8 · 5:00p."]);
    expect(W.addRowValueLines("T", { kind: "auth", headline: "Corner Store" })).toEqual([
      "Playhead time: T.",
      "Record to link: auth: Corner Store.",
    ]);
    expect(W.LIST_NAME).toBe("Notes in this scenario");
    expect(W.EMPTY_LINES).toEqual(["This scenario has no notes yet.", "Press N on the Timeline to add a note."]);
    expect(W.STATIC_LINES).toEqual(["Notes last for this visit.", "Save them to a file to keep them."]);
    expect(W.SAVE_FILE).toEqual({ name: "Save notes to a file.", tip: "The file holds the text of your notes." });
    expect(W.LOAD_FILE).toEqual({ name: "Load notes from a file.", tip: "A note in the file replaces the note with the same ID." });
    expect(W.fileResult.loaded(3)).toBe("Loaded 3 notes.");
    expect(W.fileResult.notFile).toBe("The file is not a notes file.");
    expect(W.fileResult.tooLarge).toBe("The file is too large.");
    expect(W.fileResult.card).toBe("The file has a number that looks like a card number. The app loaded no note.");
    expect(W.fileResult.scenario).toBe("The file is for a scenario that this page does not have.");
    expect(W.CATEGORY_ADD).toEqual({
      name: "Add a category.",
      field: "Category name",
      card: "The name has a number that looks like a card number.",
      exists: "This category exists already.",
      tooLong: "The name is too long. The limit is 24 characters.",
    });
  });

  it("E1 to E5: the window, colour, category, PASS or FAIL, text", () => {
    expect(W.noteWindowName("5:00p")).toBe("Note, 5:00p");
    expect(W.COLOUR_GROUP).toBe("Colour");
    expect(W.colourName(3)).toBe("Colour 3");
    expect(W.colourTip(3)).toEqual(["This is note colour 3 of 6.", "It follows the active palette."]);
    expect(W.CATEGORY).toEqual({
      name: "Category",
      tip: ["This is the category of the note.", "Add your own with the button beside the list."],
    });
    expect(W.DECISION.group).toBe("PASS or FAIL");
    expect(W.DECISION.tip).toEqual(["PASS or FAIL is your own mark.", "The app does not set it."]);
    expect(W.DECISION.choices).toEqual({
      none: { name: "None", tip: "This note has no mark." },
      pass: { name: "PASS", tip: "Mark this note PASS. The mark is yours." },
      fail: { name: "FAIL", tip: "Mark this note FAIL. The mark is yours." },
    });
    expect(W.TEXT_NAME).toBe("Note text");
  });

  it("E6: the format buttons", () => {
    expect(W.FORMATS).toEqual({
      bold: { name: "Bold", tip: "Make the selected text bold." },
      italic: { name: "Italic", tip: "Make the selected text italic." },
      underline: { name: "Underline", tip: "Underline the selected text." },
      strike: { name: "Strike", tip: "Strike through the selected text." },
      bullet_list: { name: "Bullet list", tip: "Make a bulleted list." },
      ordered_list: { name: "Numbered list", tip: "Make a numbered list." },
      quote: { name: "Quote", tip: "Make a quote." },
    });
  });

  it("E7: the hint says what the guard does not stop; the safety review's change 6 adds that it catches mistakes, not a person who hides a number", () => {
    expect(W.HINT.lines).toEqual(["Do not type card data.", "The editor refuses card numbers only."]);
    expect(W.HINT.tip).toEqual([
      "The editor refuses a number that looks like a card number.",
      "It catches a mistake. It does not stop a person who hides a number on purpose.",
      "It does not check a number written in words.",
      "It does not check a security code or an expiry date.",
      "It does not check a number split across two notes.",
    ]);
  });

  it("E8, E9: the link and the buttons", () => {
    expect(W.LINK.line("auth", "Corner Store")).toBe("Linked record: auth: Corner Store");
    expect(W.LINK.remove).toEqual({
      name: "Remove the link.",
      tip: ["Remove the link to the record.", "The note then shows on the Timeline only."],
    });
    expect(W.LINK.missing).toBe("The linked record is not in the data.");
    expect(W.BUTTONS).toEqual({ save: "Save the note.", delete: "Delete the note.", edit: "Edit the note." });
  });

  it("E10, E11, E12: the status line, the close prompt, the delete prompt", () => {
    expect(W.STATUS).toEqual({
      saved: "Saved.",
      savedVisit: "Saved for this visit.",
      unsaved: "Changes are not saved.",
      card: "The note has a number that looks like a card number. Remove it, then save.",
      tooLong: "The note is too long. The limit is 4,000 characters.",
      noAnswer: "The backend did not answer. The note is not saved. Press Save to try again.",
      refused: "The backend refused the note. Check the text and the category.",
      limit: "This scenario holds 1,000 notes. That is the limit.",
    });
    expect(W.CLOSE).toEqual({ ask: "This note has changes that are not saved.", save: "Save", discard: "Discard", cancel: "Cancel" });
    expect(W.DELETE).toEqual({ ask: "Delete this note? This action is permanent.", confirm: "Delete", keep: "Keep" });
  });

  it("T1, G1, I1: the marks and the Inspector rows", () => {
    expect(W.markName("Question", "Seen at the terminal.", "5:00p")).toBe("Open note: Question, Seen at the terminal., 5:00p");
    expect(W.markTip({ category: "Question", label: "L", time: "5:00p", decision: "none", link: null })).toEqual([
      "Your note, category Question.",
      "L",
      "Time: 5:00p",
    ]);
    expect(W.markTip({ category: "C", label: "L", time: "T", decision: "pass", link: { kind: "auth", headline: "H" } })).toEqual([
      "Your note, category C.",
      "L",
      "Time: T",
      "You marked this PASS.",
      "Linked record: auth: H",
    ]);
    expect(W.markTip({ category: "C", label: "L", time: "T", decision: "fail", link: null })[3]).toBe("You marked this FAIL.");
    expect(W.globeMarkName("Note", "L", "auth", "H")).toBe("Open note: Note, L, linked to auth: H");
    expect(W.INSPECTOR_ROWS).toEqual({
      title: "Your note",
      category: "Category",
      decision: "PASS or FAIL",
      time: "Time",
      link: "Linked record",
      body: "Note",
    });
  });
});

describe("the right-click menu piece: the note window's doors (PLAN-tag-menu part 7)", () => {
  it("ADD_ON_RECORD is the record window's button, named by the longer sentence", () => {
    expect(W.ADD_ON_RECORD).toEqual({ visible: "Add a note", name: "Add a note on this record." });
    expect(W.ADD_ON_RECORD.name.startsWith(W.ADD_ON_RECORD.visible)).toBe(true);
    // At most three words past the visible part, one sentence.
    const rest = W.ADD_ON_RECORD.name.slice(W.ADD_ON_RECORD.visible.length).trim().replace(/\.$/, "");
    expect(rest.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(W.ADD_ON_RECORD.name.match(/[.?!]/g)).toHaveLength(1);
  });

  it("SAVE_TIP has one sentence for a draft that closes and one for a saved note", () => {
    expect(W.SAVE_TIP).toEqual({ draft: "Save the note and close this window.", saved: "Save the changes to this note." });
    for (const s of Object.values(W.SAVE_TIP)) expect(s.match(/[.?!]/g)).toHaveLength(1);
  });

  it("the Notes menu keeps its own words: the note is at the playhead", () => {
    expect(W.ADD_ROW).toEqual({ visible: "Add a note", name: "Add a note at the playhead." });
  });
});

describe("the rules the design says the words meet", () => {
  const SENTENCE = /[^.?!]+[.?!]/g;
  const strings = collect([
    W.EMPTY_LINES, W.STATIC_LINES, W.SAVE_FILE, W.LOAD_FILE, W.CATEGORY_ADD, W.CATEGORY, W.DECISION, W.FORMATS, W.HINT,
    W.LINK.remove, W.LINK.missing, W.STATUS, W.CLOSE, W.DELETE, W.colourTip(1), W.ADD_ROW, W.ADD_ON_RECORD, W.SAVE_TIP,
  ]);

  it("holds many strings", () => {
    expect(strings.length).toBeGreaterThan(30);
  });

  it("every sentence is 20 words or fewer", () => {
    const long: string[] = [];
    for (const s of strings) {
      for (const sentence of s.match(SENTENCE) ?? []) {
        if (sentence.trim().split(/\s+/).length > 20) long.push(sentence.trim());
      }
    }
    expect(long).toEqual([]);
  });

  it("no string holds an em dash or an en dash", () => {
    const dashes = [String.fromCodePoint(0x2014), String.fromCodePoint(0x2013)];
    for (const s of strings) for (const d of dashes) expect(s.includes(d)).toBe(false);
  });
});
