/**
 * The rows' pure parts: a node's description, the list's height, the keys under the list's one
 * Tab stop, the cut of a name, the short number. Every fixture is written here.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { manifestRowToEntity } from "./adapters/manifest-row";
import { caseStepEvents, type CaseStepEvent } from "./case-events";
import { GUTTER, HEAD_RAIL, LIST_FLOOR_ROWS, OPEN, OPEN_BAR_SHARE, ROW } from "./bar-metrics";
import {
  barAt,
  cutName,
  figureLines,
  nameChars,
  rowStops,
  rowListHeight,
  rowsCountName,
  rowTicks,
  shortNumber,
  stopAction,
  type Stop,
} from "./row-ticks";
import type { Track } from "./tracks";
import type { LoginEvent, Transfer } from "../types";

const T0 = Date.parse("2026-06-08T09:00:00-05:00");
const node = { kind: "stop", label: "Stop", palette: "#fff", source: "json", coords: null, timestamp: "at", primary: "${id}" };

function stopEvents(): CaseStepEvent[] {
  const entities = [manifestRowToEntity(node, { id: "s1", at: new Date(T0).toISOString() })];
  return caseStepEvents({ transactions: [], logins: [], accountEvents: [], transfers: [], entities }, [node]);
}

describe("rowTicks", () => {
  it("describes an event of a declared kind with its own words and no ring", () => {
    const [tick] = rowTicks(stopEvents());
    expect(tick).toMatchObject({ id: "s1", kind: "stop", t: T0, newDevice: false, blocked: false, challengeVar: null, facts: [] });
  });

  it("gives a sign-in on a new device its ring and the field line behind it", () => {
    const login = { id: "l1", timestamp: new Date(T0).toISOString(), outcome: "challenge_failed", device_trust: "new", session_id: "sess-1" } as unknown as LoginEvent;
    const events: CaseStepEvent[] = [{ id: "l1", t: T0, match: { kind: "login", login } }];
    const [tick] = rowTicks(events);
    expect(tick.newDevice).toBe(true);
    expect(tick.challengeVar).toBe("alarm");
    expect(tick.session).toBe("sess-1");
    expect(tick.facts).toEqual(["Device trust: new", "Outcome: challenge failed"]);
  });

  it("marks a blocked transfer and passes a passed challenge as the amber stem", () => {
    const transfer = { id: "t1", timestamp: new Date(T0).toISOString(), status: "blocked", amount: 10, rail: "wire" } as unknown as Transfer;
    const [tick] = rowTicks([{ id: "t1", t: T0, match: { kind: "transfer", transfer } }]);
    expect(tick.blocked).toBe(true);
    expect(tick.facts).toEqual(["Status: blocked"]);
    const login = { id: "l2", timestamp: new Date(T0).toISOString(), outcome: "challenge_passed", device_trust: "known" } as unknown as LoginEvent;
    expect(rowTicks([{ id: "l2", t: T0, match: { kind: "login", login } }])[0].challengeVar).toBe("r3");
  });

  it("skips an event that has no entity, a place", () => {
    const place = { id: "p1" } as never;
    expect(rowTicks([{ id: "p1", t: T0, match: { kind: "place", place } }])).toEqual([]);
  });
});

describe("rowListHeight", () => {
  const at = (innerHeight: number, named: number, rest = 0, depthPx = 0) => rowListHeight({ innerHeight, named, rest, depthPx });

  it("gives 204 px at 900 high for 30 rows, as the K0 rule does", () => {
    expect(at(900, 30)).toBe(204);
  });

  it("is the same list when depthPx is 0 and a smaller one as the depth lines take px", () => {
    expect(at(900, 30, 0, 0)).toBe(at(900, 30));
    expect(at(900, 30, 0, 48)).toBeLessThan(at(900, 30));
  });

  it("never goes under its floor of three rows and a half, 84 px, whatever the rest rows and the depth take", () => {
    expect(LIST_FLOOR_ROWS * ROW).toBe(84);
    expect(at(720, 30, 9, 300)).toBe(84);
    expect(at(300, 30)).toBe(84);
  });

  it("counts the rest rows against the share", () => {
    expect(at(900, 30, 3)).toBeLessThan(at(900, 30, 0));
    expect(at(900, 30, 1)).toBe(at(900, 30, 0) - ROW);
  });

  it("takes the whole list when every named row fits", () => {
    expect(at(900, 5)).toBe(5 * ROW);
    expect(at(900, 0)).toBe(0);
  });

  it("reads the owner's share, 0.42, from the metrics module", () => {
    expect(OPEN_BAR_SHARE).toBe(0.42);
    // At 1000 high the share is 420 px, less the chrome (176 + the rail's 10 net of the margin).
    const room = 1000 * OPEN_BAR_SHARE - (176 + (HEAD_RAIL - 8));
    expect(at(1000, 99)).toBe(Math.floor(room / ROW) * ROW + ROW / 2);
  });

  it("takes the share from bar-metrics in the source and types no 0.42 of its own", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "row-ticks.ts"), "utf8");
    expect(source).toMatch(/import\s*\{[^}]*\bOPEN_BAR_SHARE\b[^}]*\}\s*from\s*"\.\/bar-metrics"/);
    expect(source).not.toMatch(/(?<![\d.])0?\.42(?!\d)/);
    expect(source).toMatch(/innerHeight\s*\*\s*OPEN_BAR_SHARE/);
  });
});

describe("a row's name and its cut", () => {
  it("fits 22 characters in 140 px and 19 in 126 px at the measured advance", () => {
    expect(nameChars(GUTTER - 8)).toBe(22);
    expect(nameChars(GUTTER - 8 - OPEN)).toBe(19);
  });

  it("cuts a long name to the characters that fit with an ellipsis in the last place, and leaves a short one whole", () => {
    expect(cutName("A very long squad name indeed", 19)).toBe("A very long squad …");
    expect(cutName("A very long squad name indeed", 19)).toHaveLength(19);
    expect(cutName("Short", 19)).toBe("Short");
    expect(cutName("x".repeat(19), 19)).toBe("x".repeat(19));
  });

  it("keeps rows with different long names apart after a cut at 19, 21, 22 and 23", () => {
    const names = Array.from({ length: 40 }, (_, i) => `${String.fromCharCode(97 + (i % 26))}${i} merchant with a long tail`);
    for (const chars of [19, 21, 22, 23]) {
      expect(new Set(names.map((n) => cutName(n, chars))).size).toBe(names.length);
    }
  });

  it("words the fold button's name with the count as words", () => {
    expect(rowsCountName("Organisation", 30)).toBe("Organisation: 30 rows");
    expect(rowsCountName("Merchant", 1)).toBe("Merchant: 1 row");
    expect(rowsCountName("", 4)).toBe("4 rows");
  });
});

describe("numbers", () => {
  it("prints a row's number short", () => {
    expect(shortNumber(5.6)).toBe("5.6");
    expect(shortNumber(216)).toBe("216");
    expect(shortNumber(1010)).toBe("1.01K");
  });

  it("finds the bar whose bucket holds the playhead, and none outside any", () => {
    const bars = [{ t: 0, value: 1 }, { t: 100, value: 2 }, { t: 300, value: 3 }];
    expect(barAt(bars, 100, 0)?.value).toBe(1);
    expect(barAt(bars, 100, 99)?.value).toBe(1);
    expect(barAt(bars, 100, 100)?.value).toBe(2);
    expect(barAt(bars, 100, 250)).toBeNull();
    expect(barAt(bars, 100, 399)?.value).toBe(3);
    expect(barAt(bars, 100, 400)).toBeNull();
    expect(barAt([], 100, 0)).toBeNull();
    expect(barAt(bars, 0, 0)).toBeNull();
  });
});

describe("figureLines and rowStops", () => {
  const bar = [{ t: 0, value: 1 }];
  const mk = (key: string, lines: string[]): Track => ({
    key, name: key, rest: false, count: 1, bars: bar, total: 1, kinds: [],
    lines: lines.map((l) => ({ key: l, name: l, value: l, ids: new Set<string>(), bars: l === "no-bars" ? [] : bar, top: 1, total: 1, events: [] })),
  });
  const tracks = [mk("a", ["x", "no-bars"]), mk("b", [])];

  it("places each row a row apart, and an open row's lines that carry bars", () => {
    const closed = figureLines(tracks, new Set());
    expect(closed.lines.map((l) => [l.key, l.top])).toEqual([["a", 0], ["b", ROW]]);
    expect(closed.height).toBe(2 * ROW);
    const open = figureLines(tracks, new Set(["a"]));
    expect(open.lines.map((l) => [l.key, l.top])).toEqual([["a", 0], ["a/x", ROW], ["b", 3 * ROW]]);
    expect(open.height).toBe(4 * ROW);
  });

  it("lists the stops in reading order, with an open row's lines after it and none for a row with nothing to open", () => {
    expect(rowStops(tracks, new Set()).map((s) => [s.key, s.open])).toEqual([["a", false], ["b", null]]);
    expect(rowStops(tracks, new Set(["a"])).map((s) => [s.key, s.parent, s.open])).toEqual([
      ["a", null, true], ["a/x", "a", null], ["a/no-bars", "a", null], ["b", null, null],
    ]);
  });
});

describe("stopAction: the keys under the list's one stop", () => {
  // Two rows; the first is open and has two lines; the second has nothing to open; a rest row ends it.
  const stops: Stop[] = [
    { key: "a", parent: null, open: true },
    { key: "a/1", parent: "a", open: null },
    { key: "a/2", parent: "a", open: null },
    { key: "b", parent: null, open: false },
    { key: "c", parent: null, open: null },
  ];
  const act = (from: string, key: string) => stopAction(stops, from, key);

  it("moves with the down and up keys without opening or folding, and stops at the ends", () => {
    expect(act("a", "ArrowDown")).toEqual({ focus: "a/1" });
    expect(act("a/2", "ArrowDown")).toEqual({ focus: "b" });
    expect(act("c", "ArrowDown")).toBeNull();
    expect(act("b", "ArrowUp")).toEqual({ focus: "a/2" });
    expect(act("a", "ArrowUp")).toBeNull();
  });

  it("goes to the first and the last stop with Home and End", () => {
    expect(act("b", "Home")).toEqual({ focus: "a" });
    expect(act("a", "End")).toEqual({ focus: "c" });
  });

  it("opens a closed row with the right key and keeps the focus on it", () => {
    expect(act("b", "ArrowRight")).toEqual({ open: { key: "b", open: true } });
  });

  it("moves to the first line of an open row with the right key", () => {
    expect(act("a", "ArrowRight")).toEqual({ focus: "a/1" });
  });

  it("does nothing with the right key on a row with nothing to open, or on a line", () => {
    expect(act("c", "ArrowRight")).toBeNull();
    expect(act("a/1", "ArrowRight")).toBeNull();
  });

  it("folds an open row with the left key, goes from a line to its row, and does nothing on a closed row", () => {
    expect(act("a", "ArrowLeft")).toEqual({ open: { key: "a", open: false } });
    expect(act("a/2", "ArrowLeft")).toEqual({ focus: "a" });
    expect(act("b", "ArrowLeft")).toBeNull();
    expect(act("c", "ArrowLeft")).toBeNull();
  });

  it("ignores other keys, and a stop that is not in the list", () => {
    expect(act("a", "x")).toBeNull();
    expect(act("a", "Enter")).toBeNull();
    expect(act("zzz", "ArrowDown")).toBeNull();
    expect(stopAction([], "a", "ArrowDown")).toBeNull();
  });
});
