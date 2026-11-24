/**
 * The notes file (design section 6): one format for both builds, checked all or nothing.
 */
import { describe, it, expect } from "vitest";
import { buildNotesFile, checkFile, parseNotesFile } from "./file";
import { refusesText } from "./guard";
import { LIMITS, type NotesFile } from "./types";
import { FILE_V2_WIRE, PATH_WIRE, VISA, VISA_DASHED, VISA_GROUPED, bodyOf, clone, makeNode, makeNote, makePath } from "./test-fixtures";

const idOf = (n: number) => "note-" + "abcd".repeat(7) + n.toString(16).padStart(4, "0");
function fileNote(n: number, over: Record<string, unknown> = {}) {
  const { scenario: _s, ...rest } = makeNote({ id: idOf(n), seq: n, time: 1763556003600 + n });
  return { ...rest, ...over };
}
function validFile(over: Record<string, unknown> = {}) {
  return {
    format: "ffr-notes",
    version: 1,
    scenario: "card-fraud",
    categories: ["Lead"],
    notes: [fileNote(1), fileNote(2, { link: { kind: "transaction", id: "tx-0001042" }, category: "Lead" })],
    ...over,
  };
}
const refuse = (raw: unknown, code: string, where?: string, opts?: Parameters<typeof checkFile>[1]) => {
  const r = checkFile(raw, opts);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.code).toBe(code);
    if (where !== undefined) expect(r.where).toBe(where);
  }
  return r;
};

describe("checkFile accepts", () => {
  it("a valid file, as a fresh object", () => {
    const input = validFile();
    const r = checkFile(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // A version 1 file is lifted to version 2 with empty marks.
    expect(r.value).toEqual({ ...input, version: 2, nodes: [], paths: [], failCategories: [] });
    expect(r.value).not.toBe(input);
    expect(r.value.notes[0]).not.toBe(input.notes[0]);
  });
  it("an empty file of notes", () => {
    expect(checkFile(validFile({ notes: [], categories: [] })).ok).toBe(true);
  });
  it("a scenario the page has", () => {
    expect(checkFile(validFile(), { scenarios: ["priya-ato", "card-fraud"] }).ok).toBe(true);
  });
  it("500 notes", () => {
    const notes = Array.from({ length: LIMITS.fileNotes }, (_, i) => fileNote(i + 1));
    const r = checkFile(validFile({ notes }));
    expect(r.ok ? "ok" : `${r.code} ${r.where}`).toBe("ok");
  });
  it("a 13 digit card number inside `time` (a stated limit: about 1 in 10 real times pass Luhn, so it cannot be guarded)", () => {
    const time = 1763556000000;
    expect(refusesText(String(time))).toBe(true);
    expect(checkFile(validFile({ notes: [fileNote(1, { time })] })).ok).toBe(true);
  });
});

describe("checkFile refuses the whole file", () => {
  it("anything that is not a notes file", () => {
    for (const raw of [null, undefined, 5, "x", [], {}, { format: "ffr-notes" }]) refuse(raw, "bad_file");
    refuse(validFile({ format: "other" }), "bad_file");
    refuse(validFile({ version: 2 }), "bad_file");
    refuse(validFile({ version: "1" }), "bad_file");
  });
  it("an extra key at the file level and the note level, a clock field, and a missing key", () => {
    refuse(validFile({ extra: 1 }), "bad_file");
    refuse(validFile({ savedAt: "2026-11-19T12:00:00Z" }), "bad_file");
    refuse(validFile({ notes: [fileNote(1, { extra: 1 })] }), "bad_file", "notes[0]");
    refuse(validFile({ notes: [fileNote(1, { createdAt: 1 })] }), "bad_file", "notes[0]");
    refuse(validFile({ notes: [fileNote(1, { scenario: "card-fraud" })] }), "bad_file", "notes[0]");
    const f = validFile();
    const missing = clone(f);
    delete (missing.notes[0] as Record<string, unknown>).seq;
    refuse(missing, "bad_file", "notes[0]");
    const noCat = clone(f) as Record<string, unknown>;
    delete noCat.categories;
    refuse(noCat, "bad_file");
  });
  it("a __proto__ key at any level", () => {
    const text = JSON.stringify(validFile());
    const top = JSON.parse(text.replace("{", '{"__proto__":{"polluted":1},'));
    expect(Object.keys(top)).toContain("__proto__");
    refuse(top, "bad_file");
    const inner = JSON.parse(text.replace('"notes":[{', '"notes":[{"__proto__":{"polluted":1},'));
    refuse(inner, "bad_file", "notes[0]");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("a scenario with a bad form, or one the page does not have", () => {
    refuse(validFile({ scenario: "bad scenario!" }), "bad_scenario", "scenario");
    refuse(validFile({ scenario: "unknown-pack" }), "bad_scenario", "scenario", { scenarios: ["card-fraud", "priya-ato"] });
  });
  it("more than 500 notes, duplicate ids, duplicate categories", () => {
    const notes = Array.from({ length: LIMITS.fileNotes + 1 }, (_, i) => fileNote(i + 1));
    refuse(validFile({ notes }), "too_large");
    refuse(validFile({ notes: [fileNote(1), fileNote(1, { seq: 2 })] }), "bad_file", "notes[1].id");
    refuse(validFile({ categories: ["Lead", "lead"] }), "bad_file", "categories[1]");
  });
  it("a bad field inside a note, with the note's index", () => {
    refuse(validFile({ notes: [fileNote(1), fileNote(2, { colour: "url(x)" })] }), "bad_file", "notes[1].colour");
    refuse(validFile({ notes: [fileNote(1, { decision: "yes" })] }), "bad_file", "notes[0].decision");
    refuse(validFile({ notes: [fileNote(1, { body: { v: 1, content: [{ type: "image" }] } })] }), "bad_file");
    refuse(validFile({ categories: ["x".repeat(25)] }), "bad_file", "categories[0]");
  });
  it("a card number anywhere, and the file loads nothing", () => {
    refuse(validFile({ notes: [fileNote(1), fileNote(2, { body: bodyOf("card " + VISA) })] }), "card_number", "notes[1].body");
    refuse(validFile({ notes: [fileNote(1, { category: "4111 1111 1111 1111" })] }), "card_number", "notes[0].category");
    refuse(validFile({ notes: [fileNote(1, { link: { kind: "tx", id: "tx-" + VISA } })] }), "card_number", "notes[0].link.id");
    refuse(validFile({ notes: [fileNote(1, { id: "note-" + VISA + "abcdefabcdefabcd" })] }), "card_number", "notes[0].id");
    refuse(validFile({ categories: ["4111-1111-1111-1111"] }), "card_number", "categories[0]");
    refuse(validFile({ scenario: "4111-1111-1111-1111" }), "card_number", "scenario");
    const r = checkFile(validFile({ notes: [fileNote(1, { body: bodyOf(VISA) })] }));
    expect(r.ok).toBe(false);
    expect("value" in r).toBe(false);
    expect(JSON.stringify(r)).not.toContain("4111");
  });
});

describe("checkFile and the scenario's span of time", () => {
  const T = 1763556003600; // fileNote(n) has the time T + n
  const span = { min: T + 1, max: T + 100 };

  it("accepts a note whose time is inside the span, both ends included", () => {
    const f = validFile({ notes: [fileNote(1), fileNote(100)] });
    expect(checkFile(f, { timeSpan: span }).ok).toBe(true);
  });

  it("refuses the whole file, with the note's path, when a time is outside the span", () => {
    refuse(validFile({ notes: [fileNote(1), fileNote(101)] }), "bad_file", "notes[1].time", { timeSpan: span });
    refuse(validFile({ notes: [fileNote(1, { time: T })] }), "bad_file", "notes[0].time", { timeSpan: span });
  });

  it("refuses a 13 digit time that passes Luhn (it would reach the address as the playhead) with the span, allows it without", () => {
    const time = 1763556000000;
    expect(refusesText(String(time))).toBe(true);
    refuse(validFile({ notes: [fileNote(1, { time })] }), "bad_file", "notes[0].time", { timeSpan: span });
    expect(checkFile(validFile({ notes: [fileNote(1, { time })] })).ok).toBe(true); // the design's range alone
  });

  it("an empty span (the page does not know its bounds yet) refuses any note and accepts a file without notes", () => {
    const none = { min: 1, max: 0 };
    refuse(validFile(), "bad_file", "notes[0].time", { timeSpan: none });
    expect(checkFile(validFile({ notes: [], categories: [] }), { timeSpan: none }).ok).toBe(true);
  });

  it("a refusal names the path and never the time", () => {
    const r = checkFile(validFile({ notes: [fileNote(1, { time: 1763556000000 })] }), { timeSpan: span });
    expect(JSON.stringify(r)).not.toContain("1763556000000");
  });

  it("parseNotesFile passes the span on", () => {
    const text = JSON.stringify(validFile({ notes: [fileNote(1, { time: T + 5000 })] }));
    expect(parseNotesFile(text, { timeSpan: span }).ok).toBe(false);
    expect(parseNotesFile(text, { timeSpan: { min: T, max: T + 6000 } }).ok).toBe(true);
    expect(parseNotesFile(text).ok).toBe(true); // no span given: the design's range alone
  });
});

describe("parseNotesFile", () => {
  it("reads JSON text", () => {
    expect(parseNotesFile(JSON.stringify(validFile())).ok).toBe(true);
  });
  it("refuses text that is not JSON", () => {
    for (const t of ["", "not json", "{", "{'a':1}"]) expect(parseNotesFile(t)).toMatchObject({ ok: false, code: "bad_json" });
  });
  it("refuses text over 2 MB before it parses", () => {
    const big = JSON.stringify(validFile()) + " ".repeat(LIMITS.fileBytes);
    expect(parseNotesFile(big)).toMatchObject({ ok: false, code: "too_large" });
    // the limit counts bytes, not characters
    const wide = JSON.stringify({ x: "é".repeat(LIMITS.fileBytes / 2 + 1) });
    expect(parseNotesFile(wide)).toMatchObject({ ok: false, code: "too_large" });
  });
  it("passes the file check on to checkFile", () => {
    expect(parseNotesFile(JSON.stringify(validFile({ scenario: "elsewhere" })), { scenarios: ["card-fraud"] })).toMatchObject({ ok: false, code: "bad_scenario" });
    expect(parseNotesFile(JSON.stringify(validFile({ notes: [fileNote(1, { body: bodyOf(VISA) })] })))).toMatchObject({ ok: false, code: "card_number" });
  });
});

describe("buildNotesFile", () => {
  it("builds the document of design section 6 and it passes the check", () => {
    const notes = [makeNote({ id: idOf(2), seq: 2, time: 200 }), makeNote({ id: idOf(1), seq: 1, time: 100 }), makeNote({ id: idOf(3), seq: 3, scenario: "priya-ato" })];
    const f: NotesFile = buildNotesFile("card-fraud", ["Lead"], notes);
    expect(Object.keys(f)).toEqual(["format", "version", "scenario", "categories", "notes", "nodes", "paths", "failCategories"]);
    expect(f.format).toBe("ffr-notes");
    expect(f.version).toBe(2);
    expect([f.nodes, f.paths, f.failCategories]).toEqual([[], [], []]);
    expect(f.notes.map((n) => n.seq)).toEqual([1, 2]); // ordered by time then seq; another scenario left out
    expect(Object.keys(f.notes[0])).toEqual(["id", "time", "link", "colour", "category", "decision", "seq", "body"]);
    const r = checkFile(JSON.parse(JSON.stringify(f)));
    expect(r.ok && r.value).toEqual(f);
  });
  it("holds no clock field", () => {
    expect(JSON.stringify(buildNotesFile("card-fraud", [], [makeNote()]))).not.toMatch(/created|updated|saved|stamp|date/i);
  });
});

// ---------------------------------------------------------------------------- version 2, the marks

const v2 = (over: Record<string, unknown> = {}) => ({ ...JSON.parse(FILE_V2_WIRE), ...over });
const nodeEntry = (kind: string, id: string, over: Record<string, unknown> = {}) => ({
  record: { kind, id },
  pinned: false,
  disposition: "none",
  category: null,
  settled: false,
  ...over,
});

describe("checkFile at version 2", () => {
  it("gives the wire file back equal (FILE_V2_WIRE), as a fresh object", () => {
    const input = JSON.parse(FILE_V2_WIRE);
    const r = checkFile(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.value)).toBe(FILE_V2_WIRE);
    expect(r.value).not.toBe(input);
    expect(r.value.nodes[0]).not.toBe(input.nodes[0]);
  });
  it("refuses a version 2 file with five keys and a version 1 file with eight", () => {
    const five = { format: "ffr-notes", version: 2, scenario: "card-fraud", categories: [], notes: [] };
    refuse(five, "bad_file");
    refuse(v2({ version: 1 }), "bad_file");
    refuse(v2({ version: "2" }), "bad_file");
    refuse(v2({ version: true }), "bad_file");
  });
  it("refuses a missing or extra key and a clock field", () => {
    const missing = v2();
    delete missing.paths;
    refuse(missing, "bad_file");
    refuse(v2({ savedAt: "x" }), "bad_file");
    refuse(v2({ nodes: [{ ...nodeEntry("auth", "tx-1"), extra: 1 }] }), "bad_file", "nodes[0]");
    refuse(v2({ nodes: [{ ...nodeEntry("auth", "tx-1"), scenario: "card-fraud" }] }), "bad_file", "nodes[0]");
    refuse(v2({ paths: [{ ...JSON.parse(PATH_WIRE), scenario: "card-fraud" }] }), "bad_file", "paths[0]");
  });
  it("refuses a node that is not valid, with the file's codes and its path", () => {
    refuse(v2({ nodes: [nodeEntry("auth", "tx-1", { disposition: "maybe" })] }), "bad_file", "nodes[0].disposition");
    refuse(v2({ nodes: [nodeEntry("auth", "tx-1", { category: "Lead" })] }), "bad_file", "nodes[0].category");
    refuse(v2({ nodes: [nodeEntry("auth", "tx-1", { settled: 1 })] }), "bad_file", "nodes[0].settled");
    refuse(v2({ nodes: [nodeEntry("auth", "tx-1", { settled: "true" })] }), "bad_file", "nodes[0].settled");
    refuse(v2({ nodes: [nodeEntry("auth", "tx-1", { pinned: 1 })] }), "bad_file", "nodes[0].pinned");
  });
  it("refuses two nodes for one record (fraud and auth are one), two paths with one id and Fail categories that repeat", () => {
    refuse(v2({ nodes: [nodeEntry("fraud", "tx-1"), nodeEntry("auth", "tx-1")] }), "bad_file", "nodes[1].record");
    const p = JSON.parse(PATH_WIRE);
    const { scenario: _s, ...entry } = p;
    refuse(v2({ paths: [entry, { ...entry, seq: 2 }] }), "bad_file", "paths[1].id");
    refuse(v2({ failCategories: ["Lead", "lead"] }), "bad_file", "failCategories[1]");
  });
  it("refuses the limits: 1001 nodes, 21 paths, 101 Fail categories", () => {
    const nodes = Array.from({ length: 1001 }, (_, i) => nodeEntry("stop", `rec-${i}`));
    refuse(v2({ nodes }), "too_large", "nodes");
    expect(checkFile(v2({ nodes: nodes.slice(0, 1000) })).ok).toBe(true);
    const path = (i: number) => ({ ...JSON.parse(PATH_WIRE), scenario: undefined, id: "path-" + i.toString(16).padStart(32, "a"), seq: i + 1 });
    const paths = Array.from({ length: 21 }, (_, i) => JSON.parse(JSON.stringify(path(i))));
    refuse(v2({ paths }), "too_large", "paths");
    expect(checkFile(v2({ paths: paths.slice(0, 20) })).ok).toBe(true);
    const failCategories = Array.from({ length: 101 }, (_, i) => `Cat ${i}`);
    refuse(v2({ failCategories }), "too_large", "failCategories");
    expect(checkFile(v2({ failCategories: failCategories.slice(0, 100) })).ok).toBe(true);
  });
  it("refuses a card number in a node id, a path name, a path stop, a path id and a Fail category", () => {
    refuse(v2({ nodes: [nodeEntry("auth", "tx-" + VISA)] }), "card_number", "nodes[0].record.id");
    refuse(v2({ nodes: [nodeEntry("auth", "tx-1", { disposition: "fail", category: VISA_GROUPED })] }), "card_number", "nodes[0].category");
    const p = JSON.parse(PATH_WIRE);
    delete p.scenario;
    refuse(v2({ paths: [{ ...p, name: VISA_DASHED }] }), "card_number", "paths[0].name");
    refuse(v2({ paths: [{ ...p, stops: [{ kind: "auth", id: "tx-" + VISA }, p.stops[1]] }] }), "card_number", "paths[0].stops[0].id");
    refuse(v2({ paths: [{ ...p, id: "path-" + VISA + "abcdefabcdefabcd" }] }), "card_number", "paths[0].id");
    refuse(v2({ failCategories: [VISA_DASHED] }), "card_number", "failCategories[0]");
    const r = checkFile(v2({ nodes: [nodeEntry("auth", "tx-" + VISA)] }));
    expect(JSON.stringify(r)).not.toContain("4111");
  });
  it("timeSpan judges the notes only: a node or a path never has a time", () => {
    const T = makeNote().time; // the note fixture's time; fileNote(n) has T + n
    const f = v2({ notes: [fileNote(1)] });
    expect(checkFile(f, { timeSpan: { min: T + 1, max: T + 100 } }).ok).toBe(true);
    expect(checkFile(v2(), { timeSpan: { min: 1, max: 0 } }).ok).toBe(true);
  });
  it("a scenario the page does not have refuses the file", () => {
    refuse(v2({ scenario: "unknown-pack" }), "bad_scenario", "scenario", { scenarios: ["card-fraud"] });
  });
});

describe("buildNotesFile with marks", () => {
  const marks = {
    nodes: [
      makeNode({ scenario: "card-fraud", record: { kind: "auth", id: "tx-0001" }, pinned: true, disposition: "fail", category: "Shared key", settled: true }),
    ],
    paths: [makePath({ stops: [{ kind: "auth", id: "tx-0001" }, { kind: "login", id: "lg-0002" }] })],
    failCategories: ["Shared key"],
  };
  it("writes the wire file (FILE_V2_WIRE) and it passes checkFile equal", () => {
    const f = buildNotesFile("card-fraud", [], [], marks);
    expect(JSON.stringify(f)).toBe(FILE_V2_WIRE);
    const r = checkFile(JSON.parse(JSON.stringify(f)));
    expect(r.ok && r.value).toEqual(f);
  });
  it("writes this story's nodes in record key order and its paths in seq order, and leaves another story's out", () => {
    const f = buildNotesFile("card-fraud", [], [], {
      nodes: [
        makeNode({ record: { kind: "a", id: "x" } }),
        makeNode({ record: { kind: "a1", id: "x" } }),
        makeNode({ scenario: "priya-ato", record: { kind: "a", id: "y" } }),
      ],
      paths: [
        makePath({ id: "path-" + "b".repeat(32), seq: 2 }),
        makePath({ id: "path-" + "a".repeat(32), seq: 1 }),
        makePath({ id: "path-" + "c".repeat(32), seq: 3, scenario: "priya-ato" }),
      ],
      failCategories: [],
    });
    expect(f.nodes.map((n) => `${n.record.kind}:${n.record.id}`)).toEqual(["a1:x", "a:x"]);
    expect(f.paths.map((p) => p.seq)).toEqual([1, 2]);
    expect(Object.keys(f.nodes[0])).toEqual(["record", "pinned", "disposition", "category", "settled"]);
    expect(Object.keys(f.paths[0])).toEqual(["id", "seq", "name", "stops"]);
  });
  it("copies what it was given and holds no clock field", () => {
    const f = buildNotesFile("card-fraud", [], [], marks);
    expect(f.nodes[0].record).not.toBe(marks.nodes[0].record);
    expect(f.paths[0].stops).not.toBe(marks.paths[0].stops);
    expect(JSON.stringify(f)).not.toMatch(/created|updated|saved|stamp|date/i);
  });
});
