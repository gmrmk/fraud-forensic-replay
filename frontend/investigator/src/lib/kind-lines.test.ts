// frontend/investigator/src/lib/kind-lines.test.ts
// The pure model of the Timeline's kind lines. Every
// fixture is written here: a pack with generic kinds, one of which has a label that names a verdict,
// which is printed as it is. The real stories' counts (the token
// story's 396 and 21, 417 in all) are checked on the built site.
import { describe, expect, it } from "vitest";
import { DEPTH_MAX_LINES, LINE } from "./bar-metrics";
import { kindLines, kindsBlockPx, kindsTotal } from "./kind-lines";
import type { RowTick } from "./row-ticks";

const T0 = Date.UTC(2026, 0, 5);
const HOUR = 3_600_000;

const LABELS: Record<string, string> = { scan: "Parcel scan", key: "Key event", flag: "Fraud", zeta: "Zeta" };
const kindLabel = (kind: string): string => LABELS[kind] ?? kind;

let serial = 0;
const tick = (kind: string, i = serial++): RowTick => ({
  id: `${kind}-${i}`, kind, label: `${kind} ${i}`, secondary: "", facts: [], t: T0 + i * HOUR, session: null, challengeVar: null, newDevice: false, blocked: false,
});
const many = (kind: string, n: number): RowTick[] => Array.from({ length: n }, () => tick(kind));

const CASE: RowTick[] = [...many("scan", 5), ...many("key", 2), ...many("flag", 2)];

describe("kindLines", () => {
  it("gives one line for each kind, the kind with the most events first, a tie by name", () => {
    const lines = kindLines(CASE, kindLabel);
    expect(lines.map((l) => l.kind)).toEqual(["scan", "flag", "key"]);
    expect(lines.map((l) => l.count)).toEqual([5, 2, 2]);
  });

  it("names a line by the manifest's label, unchanged, a label that names a verdict included", () => {
    const lines = kindLines(CASE, kindLabel);
    expect(lines.map((l) => l.name)).toEqual(["Parcel scan", "Fraud", "Key event"]);
  });

  it("holds the ids of each kind's events", () => {
    const lines = kindLines(CASE, kindLabel);
    expect(lines[0].ids.size).toBe(5);
    expect(lines.every((l) => [...l.ids].every((id) => id.startsWith(l.kind)))).toBe(true);
  });

  it("counts an id once", () => {
    const dup = [tick("scan", 1), tick("scan", 1), tick("key", 2)];
    expect(kindLines(dup, kindLabel).map((l) => l.count)).toEqual([1, 1]);
  });

  it("totals the events of the lines: the whole case on the rail", () => {
    expect(kindsTotal(kindLines(CASE, kindLabel))).toBe(9);
  });

  it("offers no line for a pack with one kind", () => {
    expect(kindLines(many("scan", 6), kindLabel)).toEqual([]);
  });

  it("offers no line for a pack with no event", () => {
    expect(kindLines([], kindLabel)).toEqual([]);
  });

  it("takes the soloed set: the counts and the total narrow, and the lines keep the case's kinds and order", () => {
    const alone = CASE.filter((t) => t.kind === "key" || t.id === "scan-0");
    const lines = kindLines(alone, kindLabel, CASE);
    expect(lines.map((l) => [l.kind, l.count])).toEqual([["scan", 1], ["flag", 0], ["key", 2]]);
    expect(kindsTotal(lines)).toBe(3);
  });

  it("keeps the lines, all at 0, when the soloed set holds no event", () => {
    const lines = kindLines([], kindLabel, CASE);
    expect(lines.map((l) => l.count)).toEqual([0, 0, 0]);
    expect(kindsTotal(lines)).toBe(0);
  });

  it("offers no line when the case has one kind, whatever the soloed set is", () => {
    const one = many("scan", 4);
    expect(kindLines(one.slice(0, 2), kindLabel, one)).toEqual([]);
  });
});

describe("kindsBlockPx", () => {
  it("takes no room with no line", () => {
    expect(kindsBlockPx(0)).toBe(0);
  });

  it("takes one open row's line of nodes for each line", () => {
    expect(LINE).toBe(18);
    expect(kindsBlockPx(2)).toBe(36);
  });

  it("stops at the most lines a block of depth lines shows, and scrolls beyond", () => {
    expect(kindsBlockPx(DEPTH_MAX_LINES)).toBe(DEPTH_MAX_LINES * LINE);
    expect(kindsBlockPx(DEPTH_MAX_LINES + 4)).toBe(DEPTH_MAX_LINES * LINE);
  });
});
