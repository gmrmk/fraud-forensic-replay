/**
 * C1 of the cases design: a pack none of whose nodes declare coords draws no capsule and no flag, so
 * at the opening moment the crawl asks for the decision as a node on the track (a data-node-kind that
 * is a decision kind of the manifest) and for one row or more in the rows section. A pack that has a
 * place is judged as before. The rule is a pure function (scripts/lane-check.mjs), the page read is
 * readPlace (scripts/bar-read.mjs), and the crawl holds only the wait, the read and the verdict.
 *
 * The page fixture uses the attribute names typed here, as the stacked source draws them:
 *   data-node-kind on the track's node   components/timeline/CaseTimelineLayer.tsx:447
 *   data-node-kind on a row's dot        components/timeline/rows/RowDot.tsx:57
 *   data-track-rows, data-track-row      components/timeline/rows/TrackRows.tsx:359 and :139
 * The crawl itself needs a served site and is run separately; its pins read code lines only.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crawlSource from "../../scripts/static-crawl.mjs?raw";
import checkSource from "../../scripts/lane-check.mjs?raw";
import readSource from "../../scripts/bar-read.mjs?raw";
import layerSource from "../components/timeline/CaseTimelineLayer.tsx?raw";
import rowDotSource from "../components/timeline/rows/RowDot.tsx?raw";
import trackRowsSource from "../components/timeline/rows/TrackRows.tsx?raw";
import { codeOf, holdsToken } from "./code-text";
import { MARK_RULES, PLACE_RULES, expectedPlace, markDue, markNote, placeNote, placeProblems, readDecided, type LaneNode } from "../../scripts/lane-check.mjs";
import { ROW_SELECTOR, SLIDER, readPlace, trackNodeSelector } from "../../scripts/bar-read.mjs";

// The shapes of the five packs' manifests (read from the exported manifests of the eight-pack build):
// no node declares coords, and one node has a `decision` mapping. The three placed packs declare coords.
const decision = { status: "status", outcome: "outcome", note: "note", actor: "decided_by", target: "target_label", key: "org_id", event: "event_ids" };
const unplaced: LaneNode[] = [
  { kind: "org", source: "json" },
  { kind: "network_seen", source: "json", timestamp: "seen_at" },
  { kind: "usage_day", source: "json", timestamp: "day", magnitude: "requests" },
  { kind: "decided", source: "json", timestamp: "decided_at", decision },
];
const placed: LaneNode[] = [
  { kind: "org", source: "json", coords: { lat: "lat", lng: "lng" } },
  { kind: "usage", source: "json", timestamp: "at" },
  { kind: "decided", source: "json", timestamp: "decided_at", decision, coords: { lat: "lat", lng: "lng" } },
];
// A manifest that places only some nodes is a placed pack: the card packs have nodes with no coords too.
const partly: LaneNode[] = [
  { kind: "auth", source: "sql", coords: { lat: "lat", lng: "lng" } },
  { kind: "account_event", source: "sql" },
  { kind: "verdict", source: "sql", decision },
];

describe("expectedPlace", () => {
  it("asks for the decision's kind and the rows when no node declares coords", () => {
    expect(expectedPlace(unplaced, true)).toEqual({ placed: false, decisions: ["decided"], rows: true });
  });

  it("asks for no rows when the manifest declares none", () => {
    expect(expectedPlace(unplaced, false)).toEqual({ placed: false, decisions: ["decided"], rows: false });
  });

  it("takes the kinds of every node with a decision mapping, and no other name", () => {
    const two = [...unplaced, { kind: "second", source: "json", decision }];
    expect(expectedPlace(two, true).decisions).toEqual(["decided", "second"]);
    expect(expectedPlace(unplaced.filter((n) => !n.decision), true).decisions).toEqual([]);
  });

  it("calls a pack placed when any node declares coords, and asks nothing of it", () => {
    for (const nodes of [placed, partly]) expect(expectedPlace(nodes, true)).toEqual({ placed: true, decisions: [], rows: false });
  });
});

describe("placeProblems", () => {
  const ask = expectedPlace(unplaced, true);
  const page = { kinds: ["network_seen", "decided", "decided"], rows: 4 };

  it("gives nothing for a page that draws the decision's node and a row", () => {
    expect(placeProblems(page, ask)).toEqual([]);
  });

  it("fails a page whose track has no node of the decision's kind, by its own rule", () => {
    const problems = placeProblems({ ...page, kinds: ["network_seen"] }, ask);
    expect(problems.map((p) => p.rule)).toEqual(["place-decision-node"]);
    expect(problems[0].what).toBe("no track node of a decision kind (decided) is drawn at the opening moment");
  });

  it("fails a page with no node at all, and a page whose only node of the kind is a row's dot (the reader leaves those out)", () => {
    expect(placeProblems({ kinds: [], rows: 4 }, ask).map((p) => p.rule)).toEqual(["place-decision-node"]);
  });

  it("fails a page that draws no row when the manifest declares rows, and lets one with no rows declared pass", () => {
    const problems = placeProblems({ ...page, rows: 0 }, ask);
    expect(problems.map((p) => p.rule)).toEqual(["place-rows"]);
    expect(problems[0].what).toBe("the manifest declares rows and the rows section draws none at the opening moment");
    expect(placeProblems({ ...page, rows: 0 }, expectedPlace(unplaced, false))).toEqual([]);
  });

  it("names both rules when the page draws neither", () => {
    expect(placeProblems({ kinds: [], rows: 0 }, ask).map((p) => p.rule)).toEqual(["place-decision-node", "place-rows"]);
  });

  it("names every kind of a pack with two decisions", () => {
    const two = expectedPlace([...unplaced, { kind: "second", source: "json", decision }], true);
    expect(placeProblems({ kinds: [], rows: 1 }, two)[0].what).toContain("(decided, second)");
    expect(placeProblems({ kinds: ["second"], rows: 1 }, two)).toEqual([]);
  });

  it("fails by name a pack that places nothing and declares no decision, and does not let it pass", () => {
    const none = expectedPlace(unplaced.filter((n) => !n.decision), true);
    const problems = placeProblems({ kinds: [], rows: 4 }, none);
    expect(problems.map((p) => p.rule)).toEqual(["place-no-decision"]);
    expect(problems[0].what).toBe("the manifest places no record and declares no decision, so nothing is drawn at the opening moment");
    expect(placeProblems({ kinds: ["org"], rows: 4 }, none).map((p) => p.rule)).toEqual(["place-no-decision"]);
  });

  it("judges nothing of a pack that has a place", () => {
    expect(placeProblems({ kinds: [], rows: 0 }, expectedPlace(placed, true))).toEqual([]);
  });

  it("has a sentence for every rule it gives, and holds no pack's word", () => {
    expect(Object.keys(PLACE_RULES).sort()).toEqual(["place-decision-node", "place-no-decision", "place-rows"]);
    for (const text of Object.values(PLACE_RULES)) expect(text.split(/\s+/).length).toBeLessThanOrEqual(25);
    expect(checkSource).not.toMatch(/usage|spend|usd/i);
  });
});

describe("placeNote", () => {
  it("counts the decision's nodes and the rows for the pass line", () => {
    expect(placeNote({ kinds: ["network_seen", "decided"], rows: 4 }, expectedPlace(unplaced, true))).toBe("no place: 1 decision node, 4 rows");
    expect(placeNote({ kinds: ["decided"], rows: 1 }, expectedPlace(unplaced, true))).toBe("no place: 1 decision node, 1 row");
    expect(placeNote({ kinds: ["decided", "decided"], rows: 0 }, expectedPlace(unplaced, false))).toBe("no place: 2 decision nodes");
  });
});

describe("readPlace, on a page drawn as the app draws it", () => {
  // The track's node is a button in the Timeline's own layer; a row's dot is a button inside the rows
  // section and carries the same attribute, so a read that does not tell them apart finds a dot after
  // the node is gone.
  const track = `<button type="button" data-node-kind="decided" aria-label="Jump to Decision"></button>
    <button type="button" data-node-kind="network_seen" aria-label="Jump to Network seen"></button>`;
  const rowsSection = (dots: string) => `<div data-track-rows><div data-track-header></div><div role="tree">
      <div data-track-group><div data-track-row><div data-track-plot>${dots}</div></div></div>
      <div data-track-rest><div data-track-row><div data-track-plot></div></div></div>
    </div></div>`;
  const dot = '<button type="button" data-row-dot data-node-kind="decided"></button>';
  const draw = (nodes: string, rows: string) => {
    document.body.innerHTML = `<div data-eyes="TIMELINE-ROOT">${nodes}${rows}</div>`;
  };
  beforeEach(() => draw(track, rowsSection(dot)));
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads the kinds of the track's nodes and the number of rows, and not the dots inside a row", () => {
    expect(readPlace()).toEqual({ kinds: ["decided", "network_seen"], rows: 2 });
  });

  it("reads no decision node when the node is removed from the track, though a row's dot of that kind remains", () => {
    document.querySelector('[data-node-kind="decided"]:not([data-row-dot])')?.remove();
    expect(document.querySelectorAll("[data-row-dot]")).toHaveLength(1);
    const facts = readPlace();
    expect(facts.kinds).toEqual(["network_seen"]);
    expect(placeProblems(facts, expectedPlace(unplaced, true)).map((p) => p.rule)).toEqual(["place-decision-node"]);
  });

  it("fails on a page with the decision's node removed, and on a page with no row", () => {
    const ask = expectedPlace(unplaced, true);
    expect(placeProblems(readPlace(), ask)).toEqual([]);
    document.querySelectorAll("[data-node-kind]").forEach((el) => el.remove());
    expect(placeProblems(readPlace(), ask).map((p) => p.rule)).toEqual(["place-decision-node"]);
    draw(track, "");
    expect(placeProblems(readPlace(), ask).map((p) => p.rule)).toEqual(["place-rows"]);
    draw(track, rowsSection(dot));
    document.querySelectorAll("[data-track-row]").forEach((el) => el.remove());
    expect(readPlace().rows).toBe(0);
    expect(placeProblems(readPlace(), ask).map((p) => p.rule)).toEqual(["place-rows"]);
  });

  it("reads an empty page as no node and no row", () => {
    document.body.innerHTML = "";
    expect(readPlace()).toEqual({ kinds: [], rows: 0 });
  });

  it("gives the crawl a selector for the track's nodes of the decision's kinds, and one for a row", () => {
    expect(trackNodeSelector(["decided", "second"])).toBe('[data-node-kind="decided"]:not([data-track-rows] *), [data-node-kind="second"]:not([data-track-rows] *)');
    expect(ROW_SELECTOR).toBe("[data-track-rows] [data-track-row]");
    expect(document.querySelectorAll(ROW_SELECTOR)).toHaveLength(2);
  });

  it("gives a different reading for each attribute name changed in the reader's source", () => {
    const names = [...new Set(readPlace.toString().match(/(?:data|aria)-[a-z-]+/g) ?? [])];
    expect(names.length).toBeGreaterThanOrEqual(3);
    const same = JSON.stringify(readPlace());
    for (const name of names) {
      const changed = readPlace.toString().replace(new RegExp(`(?<![\\w-])${name}(?![\\w-])`, "g"), `${name}-not-drawn`);
      const read = new Function(`return ${changed}`)() as typeof readPlace;
      expect(JSON.stringify(read()), name).not.toBe(same);
    }
  });
});

describe("the names the place check holds, against the component that draws each", () => {
  it.each([
    ["data-node-kind", layerSource],
    ["data-node-kind", rowDotSource],
    ["data-track-rows", trackRowsSource],
    ["data-track-row", trackRowsSource],
  ])("draws %s, on a code line and as a whole name", (name, source) => {
    expect(holdsToken(codeOf(source), name)).toBe(true);
    expect(holdsToken(codeOf(readSource), name)).toBe(true);
  });
});

// A pack with no rule opens on a record before its decision. The decision is drawn once the playhead has
// reached it, so the crawl presses End first; it does so only when it has read every fact that says the
// decision lies ahead. A fact that was not read keeps the strict wait at the opening moment.
describe("markDue", () => {
  const later = [2000, 3000];
  it.each([
    ["no rule and every decision later than the playhead", { rules: [], decided: later, now: 1000 }, "end"],
    ["no rule and one decision a millisecond later", { rules: [], decided: [1001], now: 1000 }, "end"],
    ["no rule and a decision at the playhead's own time (it is reached)", { rules: [], decided: [1000], now: 1000 }, "opening"],
    ["no rule and one decision of two already reached", { rules: [], decided: [500, 3000], now: 1000 }, "opening"],
    ["no rule and every decision already reached", { rules: [], decided: [100, 200], now: 1000 }, "opening"],
    ["a pack with one rule", { rules: [{ id: "r" }], decided: later, now: 1000 }, "opening"],
    ["a pack with two rules", { rules: [{ id: "a" }, { id: "b" }], decided: later, now: 1000 }, "opening"],
    ["no rules key at all", { decided: later, now: 1000 }, "opening"],
    ["rules that are not an array (null)", { rules: null, decided: later, now: 1000 }, "opening"],
    ["rules that are not an array (an object)", { rules: {}, decided: later, now: 1000 }, "opening"],
    ["rules that are not an array (a string)", { rules: "", decided: later, now: 1000 }, "opening"],
    ["no decision row (an empty list)", { rules: [], decided: [], now: 1000 }, "opening"],
    ["no decided key at all", { rules: [], now: 1000 }, "opening"],
    ["decided that is not an array", { rules: [], decided: 2000, now: 1000 }, "opening"],
    ["a time that did not parse (NaN)", { rules: [], decided: [2000, Number.NaN], now: 1000 }, "opening"],
    ["a time that is infinite", { rules: [], decided: [Infinity], now: 1000 }, "opening"],
    ["a time that is a string", { rules: [], decided: ["2000"], now: 1000 }, "opening"],
    ["a time that is null", { rules: [], decided: [null], now: 1000 }, "opening"],
    ["no slider number (undefined)", { rules: [], decided: later }, "opening"],
    ["no slider number (NaN)", { rules: [], decided: later, now: Number.NaN }, "opening"],
    ["a slider number that is a string", { rules: [], decided: later, now: "1000" }, "opening"],
    ["a slider number of zero is a number that was read", { rules: [], decided: later, now: 0 }, "end"],
  ])("reads %s", (_name, facts, due) => {
    expect(markDue(facts as Parameters<typeof markDue>[0])).toBe(due);
  });

  it("gives 'opening' when it is given nothing at all", () => {
    expect(markDue(undefined as never)).toBe("opening");
    expect(markDue(null as never)).toBe("opening");
    expect(markDue({} as never)).toBe("opening");
  });

  it("reads no pack's name", () => {
    expect(markDue({ rules: [], decided: later, now: 1000, id: "x" } as never)).toBe("end");
    expect(markDue({ rules: [], decided: later, now: 1000, id: "volume-step" } as never)).toBe("end");
  });
});

describe("MARK_RULES and markNote", () => {
  it("holds the two failure texts, once, by the due reading", () => {
    expect(MARK_RULES).toEqual({
      opening: "no decision or queued event is drawn at the opening moment",
      end: "no decision is drawn once the playhead has reached it",
    });
    expect(Object.keys(MARK_RULES).sort()).toEqual(["end", "opening"]);
  });

  it("says nothing for the opening reading and the PASS line's words for the end reading", () => {
    expect(markNote("opening")).toBeUndefined();
    expect(markNote("end")).toBe("the decision is drawn once the playhead reaches it");
  });
});

describe("readDecided, run in the page against a stand-in fetch", () => {
  const decision = { status: "status", outcome: "outcome", note: "note", actor: "decided_by", target: "target_label", key: "org_id", event: "event_ids" };
  // The time field is named by the manifest ("when_decided"); the rows carry another time under a name the reader must not take.
  const nodes: LaneNode[] = [
    { kind: "org", source: "json", coords: { lat: "lat", lng: "lng" } },
    { kind: "seen", source: "json", timestamp: "seen_at" },
    { kind: "decided", source: "json", timestamp: "when_decided", decision },
  ];
  let lists: Record<string, unknown> = {};
  // The playhead stands an hour before the first decision (the slider's number is in milliseconds).
  const playhead = Date.parse("2026-11-11T08:00:00+00:00");
  const real = globalThis.fetch;
  const asked: string[] = [];
  const slider = (value: string | null) => {
    document.body.innerHTML = `<div role="slider" aria-label="Playhead position"${value === null ? "" : ` aria-valuenow="${value}"`}></div>`;
  };
  beforeEach(() => {
    asked.length = 0;
    lists = {
      "/api/entities?kind=decided": [
        { id: "d1", when_decided: "2026-11-11T09:00:00+00:00", decided_at: "1999-01-01T00:00:00+00:00" },
        { id: "d2", when_decided: "2026-11-11T09:00:30-05:00" },
      ],
      "/api/entities?kind=seen": [{ id: "s1", seen_at: "2026-11-11T00:00:00+00:00" }],
    };
    slider(String(playhead));
    globalThis.fetch = (async (url: string) => {
      asked.push(url);
      return { ok: url in lists, json: async () => lists[url] ?? [] };
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = real;
    document.body.innerHTML = "";
  });

  it("reads each decision node's rows, in milliseconds, from the field the manifest names, and the slider's number", async () => {
    const read = await readDecided({ nodes, slider: SLIDER });
    expect(read).toEqual({ decided: [Date.parse("2026-11-11T09:00:00+00:00"), Date.parse("2026-11-11T09:00:30-05:00")], now: playhead });
    expect(read.decided[0]).toBe(playhead + 3_600_000);
    expect(asked).toEqual(["/api/entities?kind=decided"]);
  });

  it("reads the rows of every node that has a decision, and no other", async () => {
    lists["/api/entities?kind=second"] = [{ id: "e1", at: "2026-11-12T00:00:00+00:00" }];
    const two: LaneNode[] = [...nodes, { kind: "second", source: "json", timestamp: "at", decision }];
    const read = await readDecided({ nodes: two, slider: SLIDER });
    expect(read.decided).toHaveLength(3);
    expect(asked).toEqual(["/api/entities?kind=decided", "/api/entities?kind=second"]);
  });

  it("gives a non-finite number for a row whose time is missing, not a string, or does not parse, so the rule stays strict", async () => {
    lists["/api/entities?kind=decided"] = [{ when_decided: "not a time" }, { other: "2026-11-11T09:00:00+00:00" }, { when_decided: playhead },{ when_decided: null }, null];
    const read = await readDecided({ nodes, slider: SLIDER });
    expect(read.decided).toHaveLength(5);
    for (const t of read.decided) expect(Number.isFinite(t)).toBe(false);
    expect(markDue({ rules: [], ...read })).toBe("opening");
  });

  it("gives an empty list when the rows are not read (a failed request, a body that is not a list, a refused fetch)", async () => {
    lists["/api/entities?kind=decided"] = { not: "a list" };
    expect((await readDecided({ nodes, slider: SLIDER })).decided).toEqual([]);
    delete lists["/api/entities?kind=decided"];
    expect((await readDecided({ nodes, slider: SLIDER })).decided).toEqual([]);
    globalThis.fetch = (async () => {
      throw new Error("refused");
    }) as unknown as typeof fetch;
    expect((await readDecided({ nodes, slider: SLIDER })).decided).toEqual([]);
  });

  it("reads no number from a slider that is missing or has no value (zero is never made up)", async () => {
    slider(null);
    expect((await readDecided({ nodes, slider: SLIDER })).now).toBeNaN();
    document.body.innerHTML = "";
    expect((await readDecided({ nodes, slider: SLIDER })).now).toBeNaN();
    slider("");
    expect((await readDecided({ nodes, slider: SLIDER })).now).toBeNaN();
  });

  it("asks for no row when no node has a decision", async () => {
    const read = await readDecided({ nodes: nodes.filter((n) => !n.decision), slider: SLIDER });
    expect(read.decided).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("uses nothing outside itself, as the page function the crawl passes to page.evaluate", async () => {
    const alone = new Function(`return (${readDecided.toString()})`)() as typeof readDecided;
    expect((await alone({ nodes, slider: SLIDER })).decided).toHaveLength(2);
  });

  it("holds no field name of its own: it takes the time field from the manifest's node", () => {
    expect(readDecided.toString()).not.toMatch(/decided_at|seen_at|when_decided/);
    expect(readDecided.toString()).toMatch(/\.timestamp\b/);
  });
});

describe("the crawl offers no view: it fails a page that shows a view switch and never presses one", () => {
  const code = codeOf(crawlSource).replace(/\r/g, "");

  it("holds no queue gate, presses no view control and fails a page that offers one", () => {
    expect(code).not.toContain("hasQueue");
    expect(code).not.toMatch(/getByRole\('button', \{ name: '(View queue|Open case)' \}\)/);
    expect(code).toContain("'a view switch is offered'");
  });
});

describe("the crawl's place checks, on every story that is not a card story", () => {
  const code = codeOf(crawlSource).replace(/\r/g, "");
  const from = code.indexOf("if (!scenario.cardKinds) {");
  const branch = code.slice(from, code.indexOf("return placeNote(facts, want);", from) + "return placeNote(facts, want);".length);

  // The card stories skip the place checks for now (FIX-2026-11-23-crawl-place-check-fails-on-priya-ato).
  it("gates the place checks on the card kinds, under a comment that names the shortcut it stands for", () => {
    const raw = crawlSource.replace(/\r/g, "");
    expect(raw).toContain("scenario.cardKinds = manifest.nodes.some((n) => n.kind === 'auth' || n.kind === 'fraud');");
    expect(raw).not.toContain("hasQueue");
    const lines = raw.split("\n");
    const gate = lines.findIndex((l) => l.trim() === "if (!scenario.cardKinds) {");
    expect(gate).toBeGreaterThan(-1);
    const above: string[] = [];
    for (let i = gate - 1; i >= 0 && lines[i].trim().startsWith("//"); i--) above.unshift(lines[i]);
    const comment = above.join("\n");
    expect(comment).toContain("badge-sources.ts");
    expect(comment).toContain("shortcut:");
    // A card story still ends the section with the page's own error report.
    expect(code).toMatch(/return placeNote\(facts, want\);\s*\}\s*report\(\);\s*\}\);/);
  });

  it("imports the rule and the reader", () => {
    expect(code).toMatch(/import \{[^}]*\bexpectedPlace\b[^}]*\bplaceNote\b[^}]*\bplaceProblems\b[^}]*\} from '\.\/lane-check\.mjs'/);
    expect(code).toMatch(/import \{[^}]*\bROW_SELECTOR\b[^}]*\breadPlace\b[^}]*\btrackNodeSelector\b[^}]*\} from '\.\/bar-read\.mjs'/);
  });

  // The placed block: from `if (want.placed) {` to its closing brace, which follows `return markNote(due);`.
  const placedFrom = branch.indexOf("if (want.placed) {");
  const placedBlock = branch.slice(placedFrom, branch.indexOf("return markNote(due);", placedFrom) + "return markNote(due);".length);

  it("imports the due rule, its two texts and the reader of the decisions' times", () => {
    const names = /import \{([^}]*)\} from '\.\/lane-check\.mjs'/.exec(code)?.[1] ?? "";
    for (const name of ["MARK_RULES", "markDue", "markNote", "readDecided"]) expect(names, name).toMatch(new RegExp(`\\b${name}\\b`));
  });

  it("keeps the capsule or flag wait for a pack that has a place, and fails it with the text the rule names", () => {
    expect(from).toBeGreaterThan(-1);
    expect(placedFrom).toBeGreaterThan(-1);
    expect(placedBlock).toContain("[data-queue-flag], [data-verdict-capsule]");
    // The failure text is held once, by the rule's table: the opening reading fails by the opening text.
    expect(placedBlock).toMatch(/\.catch\(\(\) => fail\(where, MARK_RULES\[due\]\)\)/);
    expect(code).not.toContain("no decision or queued event is drawn at the opening moment");
    expect(MARK_RULES.opening).toBe("no decision or queued event is drawn at the opening moment");
    // The block is inside `if (want.placed)`, waits, reports, and ends the branch with the note as its return.
    expect(branch).toMatch(/\n\s*if \(want\.placed\) \{\n[\s\S]*?\[data-queue-flag\], \[data-verdict-capsule\][\s\S]*?\n\s*report\(\);\n\s*return markNote\(due\);\n\s*\}\n/);
  });

  it("reads the due rule from the manifest's rules and the page's decision times, and presses End only under the 'end' reading, before the wait", () => {
    expect(placedBlock).toMatch(/const due = markDue\(\{ rules: scenario\.rules, \.\.\.\(await page\.evaluate\(readDecided, \{ nodes: scenario\.nodes, slider: SLIDER \}\)\) \}\);/);
    expect(placedBlock.match(/press\('End'\)/g)).toHaveLength(1);
    expect(placedBlock).toMatch(/\n\s*if \(due === 'end'\) \{ await page\.locator\(SLIDER\)\.focus\(\); await page\.keyboard\.press\('End'\); \}\n/);
    const read = placedBlock.indexOf("markDue(");
    const press = placedBlock.indexOf("press('End')");
    const wait = placedBlock.indexOf("[data-queue-flag]");
    expect(read).toBeGreaterThan(-1);
    expect(press).toBeGreaterThan(read);
    expect(wait).toBeGreaterThan(press);
  });

  it("samples no count, names no pack and never waits at network idle or by a timer in the placed block", () => {
    expect(placedBlock).not.toMatch(/scenario\.id|networkidle|waitForTimeout|\.count\(\)/);
  });

  it("copies the manifest's rules into the scenario in the loader", () => {
    expect(code).toContain("scenario.rules = manifest.rules;");
    expect(code.indexOf("scenario.rules = manifest.rules;")).toBeGreaterThan(code.indexOf("scenario.nodes = manifest.nodes;"));
  });

  it("waits for the decision's node and for a row with waitFor, never at network idle and never by a sample", () => {
    expect(branch).toMatch(/\n\s*if \(want\.decisions\.length > 0\) await page\.locator\(trackNodeSelector\(want\.decisions\)\)\.first\(\)\.waitFor\(\{ state: 'attached', timeout: READY_MS \}\)/);
    expect(branch).toMatch(/\n\s*if \(want\.rows\) await page\.locator\(ROW_SELECTOR\)\.first\(\)\.waitFor\(\{ state: 'attached', timeout: READY_MS \}\)/);
    expect(branch).not.toMatch(/networkidle|waitForTimeout|\.count\(\)\s*[>=]/);
    // A pack with no decision kind has nothing to wait for (the wait above is under the kinds), and the rule fails it by name.
    expect(branch.indexOf("trackNodeSelector(")).toBeLessThan(branch.indexOf("page.evaluate(readPlace)"));
  });

  it("reads the page, fails each problem by its rule, and prints the note on a pass", () => {
    expect(branch).toMatch(/page\.evaluate\(readPlace\)/);
    expect(branch).toMatch(/placeProblems\(/);
    expect(branch).toMatch(/fail\(where, `\$\{p\.rule\}: \$\{p\.what\}`\)/);
    expect(branch).toMatch(/return placeNote\(/);
  });

  it("is shown to fail: removes the decision's nodes, then the rows, from the live page and expects each rule", () => {
    expect(branch).toMatch(/document\.querySelectorAll\(q\)\.forEach\(\(el\) => el\.remove\(\)\)/);
    expect(branch).toContain("'[data-node-kind]'");
    expect(branch).toContain("'[data-track-row]'");
    expect(branch).toContain("'place-decision-node'");
    expect(branch).toContain("'place-rows'");
    expect(branch).toContain("the place check did not notice a missing decision node");
    expect(branch).toContain("the place check did not notice a missing row");
  });

  it("is told by the manifest's coords and not by a pack's name", () => {
    expect(branch).toMatch(/expectedPlace\(scenario\.nodes, Boolean\(scenario\.rows\)\)/);
    expect(branch).not.toMatch(/scenario\.id/);
  });
});
