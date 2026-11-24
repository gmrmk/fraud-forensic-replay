// frontend/investigator/src/lib/lane-lines.test.ts
// The model of a lane's lines. The fixtures are generic:
// no kind, field or word of one pack lives here.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEPTH_MAX_LINES } from "./bar-metrics";
import type { Entity } from "./entity";
import { LANE_LINE_PX, buildLaneLines, laneLinesPx } from "./lane-lines";
import { validLaneDepths, validLanes } from "./scenarios";
import { LANE_PLOT_PX, buildDeclaredLane, declarationOfNode, type LaneDeclaration } from "./timeline-lanes";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 5);

const DECL: LaneDeclaration = {
  id: "freight",
  name: "Freight",
  label: "Weight",
  unit: "kg",
  kinds: ["shipment"],
  field: "weight",
  bucket: "hour",
  aggregate: "sum",
  palette: "#3366cc",
};
const SPLIT = "carrier_code";

let serial = 0;
const row = (hour: number, weight: unknown, carrier: unknown, kind = "shipment", minute = 0): Entity => ({
  id: `r${serial++}`,
  kind,
  timestamp: T0 + hour * HOUR + minute * 60_000,
  coords: null,
  fields: { weight, [SPLIT]: carrier },
  displayMetadata: { primaryLabel: "", secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
});

const CARRIERS = ["C-ALFA", "C-BRAVO", "C-CHARLIE", "C-DELTA", "C-ECHO", "C-FOXTROT"] as const;

/** Six carriers over 40 hours; several rows share an hour, and the weights differ by carrier. */
const SIX: Entity[] = Array.from({ length: 40 }, (_, h) =>
  CARRIERS.flatMap((c, i) => (h % (i + 1) === 0 ? [row(h, (i + 1) * 10 + h * 1.37, c), row(h, 3.25 + i, c, "shipment", 30)] : [])),
).flat();

const parentOf = (entities: readonly Entity[], fixedTop?: number) => {
  const lane = buildDeclaredLane(entities, DECL, LANE_PLOT_PX, fixedTop);
  if (!lane) throw new Error("fixture lane is empty");
  return lane;
};

describe("buildLaneLines", () => {
  it("adds the six lines up to the lane's bar in every hour of the fixture", () => {
    const parent = parentOf(SIX);
    const lines = buildLaneLines(SIX, DECL, SPLIT, parent);
    expect(lines).toHaveLength(6);
    for (const bar of parent.bars) {
      const sum = lines.reduce((s, l) => s + (l.lane.bars.find((b) => b.t === bar.t)?.value ?? 0), 0);
      expect(sum).toBeCloseTo(bar.value, 9);
    }
    // And no line has a bar in an hour the lane has none.
    const hours = new Set(parent.bars.map((b) => b.t));
    for (const l of lines) for (const b of l.lane.bars) expect(hours.has(b.t)).toBe(true);
  });

  it("keeps the lane's step on a lane with no declared bucket, as a node's own lane has, and the sums hold", () => {
    // A node's own lane has a bar for each instant and infers its step from the gaps. A line with
    // gaps would infer a wider one, so the line takes the lane's.
    const node = { kind: "shipment", label: "Shipment", palette: "#336699", source: "json", magnitude: "weight" };
    const own = declarationOfNode(node);
    expect(own.bucket).toBeUndefined();
    const rows = [row(0, 4, "A"), row(1, 5, "B"), row(2, 6, "A"), row(3, 7, "B"), row(3, 1, "A")];
    const parent = buildDeclaredLane(rows, own);
    if (!parent) throw new Error("fixture lane is empty");
    expect(parent.step).toBe(HOUR);
    const lines = buildLaneLines(rows, own, SPLIT, parent);
    expect(lines.map((l) => l.name)).toEqual(["B", "A"]);
    for (const l of lines) expect(l.lane.step).toBe(parent.step);
    for (const bar of parent.bars) {
      const sum = lines.reduce((s, l) => s + (l.lane.bars.find((b) => b.t === bar.t)?.value ?? 0), 0);
      expect(sum).toBeCloseTo(bar.value, 9);
    }
  });

  it("takes each line's name from the value, whole and unchanged", () => {
    const lines = buildLaneLines(SIX, DECL, SPLIT, parentOf(SIX));
    expect(new Set(lines.map((l) => l.name))).toEqual(new Set(CARRIERS));
    expect(lines.every((l) => l.key === l.name)).toBe(true);
    // The line's model speaks as the line: its name first, then the quantity's label.
    expect(lines.every((l) => l.lane.nodeLabel === l.name && l.lane.label === "Weight")).toBe(true);
    expect(lines.every((l) => l.lane.id === `freight/${l.key}`)).toBe(true);
  });

  it("puts the busiest line first by its sum over the case, and breaks a tie by name", () => {
    const tie = [row(0, 5, "B"), row(0, 5, "A"), row(1, 1, "C"), row(2, 100, "D")];
    const lines = buildLaneLines(tie, DECL, SPLIT, parentOf(tie));
    expect(lines.map((l) => l.name)).toEqual(["D", "A", "B", "C"]);
    expect(lines.map((l) => l.total)).toEqual([100, 5, 5, 1]);
    const sixLines = buildLaneLines(SIX, DECL, SPLIT, parentOf(SIX));
    for (let i = 1; i < sixLines.length; i++) expect(sixLines[i - 1].total).toBeGreaterThanOrEqual(sixLines[i].total);
  });

  it("draws every line on the lane's own top and step, so a line is as tall as its share of the lane", () => {
    const parent = parentOf(SIX);
    for (const l of buildLaneLines(SIX, DECL, SPLIT, parent)) {
      expect(l.lane.scale.top).toBe(parent.scale.top);
      expect(l.lane.step).toBe(parent.step);
      expect(l.lane.palette).toBe(parent.palette);
    }
  });

  it("keeps the lane's fixed top, as a solo gives it, and not the line's own", () => {
    const one = SIX.filter((e) => e.fields[SPLIT] === "C-ALFA");
    const top = 12_345;
    const parent = parentOf(one, top);
    expect(parent.scale.top).toBe(top);
    for (const l of buildLaneLines(one, DECL, SPLIT, parent)) expect(l.lane.scale.top).toBe(top);
  });

  it("narrows with the entities it is given: a soloed row's lines are that row's alone", () => {
    const alone = SIX.filter((e) => e.timestamp < T0 + 10 * HOUR && ["C-ALFA", "C-BRAVO"].includes(String(e.fields[SPLIT])));
    const parent = parentOf(alone);
    const lines = buildLaneLines(alone, DECL, SPLIT, parent);
    expect(lines.map((l) => l.name).sort()).toEqual(["C-ALFA", "C-BRAVO"]);
    for (const bar of parent.bars) {
      const sum = lines.reduce((s, l) => s + (l.lane.bars.find((b) => b.t === bar.t)?.value ?? 0), 0);
      expect(sum).toBeCloseTo(bar.value, 9);
    }
  });

  it("reads rows of the lane's kinds only", () => {
    const mixed = [...SIX, row(3, 9999, "C-OTHER", "parcel")];
    const lines = buildLaneLines(mixed, DECL, SPLIT, parentOf(mixed));
    expect(lines.map((l) => l.name)).not.toContain("C-OTHER");
  });

  it("leaves a row with no value in the split field out of every line (a stated limit)", () => {
    const rows = [row(0, 10, "A"), row(0, 4, null), row(0, 6, ""), row(0, 2, undefined), row(1, 7, "B")];
    const parent = parentOf(rows);
    const lines = buildLaneLines(rows, DECL, SPLIT, parent);
    expect(lines.map((l) => [l.name, l.total])).toEqual([
      ["A", 10],
      ["B", 7],
    ]);
    // The lane adds the three rows without a value; the lines do not, so the two differ by exactly them.
    expect(parent.bars[0].value - lines[0].lane.bars[0].value).toBeCloseTo(12, 9);
  });

  it("draws a line for each of forty values and does not cap the model's count", () => {
    const forty = Array.from({ length: 40 }, (_, i) => row(i % 5, 1 + i, `C-${String(i).padStart(2, "0")}`));
    const lines = buildLaneLines(forty, DECL, SPLIT, parentOf(forty));
    expect(lines).toHaveLength(40);
  });

  it("gives no line for a lane with no rows", () => {
    expect(buildLaneLines([], DECL, SPLIT, parentOf(SIX))).toEqual([]);
  });

  it("gives a line for a value held as a finite number, as text, and none for the rest", () => {
    const rows = [row(0, 5, 64510), row(1, 5, Number.NaN), row(2, 5, {})];
    const lines = buildLaneLines(rows, DECL, SPLIT, parentOf(rows));
    expect(lines.map((l) => l.name)).toEqual(["64510"]);
  });
});

describe("laneLinesPx", () => {
  it("is nothing while the lines are closed", () => {
    expect(laneLinesPx(6, false)).toBe(0);
  });

  it("is one step for each line while they are open, and stops at DEPTH_MAX_LINES", () => {
    expect(laneLinesPx(1, true)).toBe(LANE_LINE_PX);
    expect(laneLinesPx(3, true)).toBe(3 * LANE_LINE_PX);
    expect(laneLinesPx(DEPTH_MAX_LINES, true)).toBe(DEPTH_MAX_LINES * LANE_LINE_PX);
    expect(laneLinesPx(40, true)).toBe(DEPTH_MAX_LINES * LANE_LINE_PX);
    expect(laneLinesPx(0, true)).toBe(0);
  });

  it("pins a line at the plot's height and a gap of 3 px", () => {
    expect(LANE_LINE_PX).toBe(LANE_PLOT_PX + 3);
    expect(DEPTH_MAX_LINES).toBe(6);
  });
});

describe("validLaneDepths (the manifest's lanes[].depth.split and its label)", () => {
  const FIELDS = { [SPLIT]: { label: "Carrier" }, weight: { label: "Weight", unit: "kg" } };

  it("reads the split field and its word from the entry that holds only an id and a depth", () => {
    expect(validLaneDepths([{ id: "freight", depth: { split: SPLIT } }], FIELDS)).toEqual({
      freight: { split: SPLIT, label: "Carrier" },
    });
  });

  it("reads it from a full lane entry too, and leaves the lane's own words alone", () => {
    const lane = { ...DECL, depth: { split: SPLIT } };
    expect(validLaneDepths([lane], FIELDS)).toEqual({ freight: { split: SPLIT, label: "Carrier" } });
  });

  it("gives no depth for a split with no entry in fields, an empty label or a label over 24 characters", () => {
    const entry = [{ id: "freight", depth: { split: SPLIT } }];
    expect(validLaneDepths(entry, {})).toEqual({});
    expect(validLaneDepths(entry, { [SPLIT]: {} })).toEqual({});
    expect(validLaneDepths(entry, { [SPLIT]: { label: "  " } })).toEqual({});
    expect(validLaneDepths(entry, { [SPLIT]: { label: "x".repeat(25) } })).toEqual({});
    expect(validLaneDepths(entry, { [SPLIT]: { label: "x".repeat(24) } })).toEqual({ freight: { split: SPLIT, label: "x".repeat(24) } });
  });

  it("gives no depth for a split that is not a field name", () => {
    for (const split of ["", "bad name", "1abc", 7, null, ["a"], "x".repeat(65)]) {
      expect(validLaneDepths([{ id: "freight", depth: { split } }], { ...FIELDS, "bad name": { label: "B" } })).toEqual({});
    }
  });

  it("hides only the entry it names and keeps the others", () => {
    const raw = [
      { id: "a", depth: { split: SPLIT } },
      { id: "b", depth: { split: "no_such_field" } },
      { id: "c", depth: { split: "weight" } },
      { id: "", depth: { split: SPLIT } },
      "not an entry",
      null,
      { id: "d" },
      { id: "e", depth: "split" },
    ];
    expect(validLaneDepths(raw, FIELDS)).toEqual({ a: { split: SPLIT, label: "Carrier" }, c: { split: "weight", label: "Weight" } });
  });

  it("keeps the first entry for an id used twice, and drops anything that is not a list or a record", () => {
    const twice = [{ id: "a", depth: { split: SPLIT } }, { id: "a", depth: { split: "weight" } }];
    expect(validLaneDepths(twice, FIELDS)).toEqual({ a: { split: SPLIT, label: "Carrier" } });
    for (const none of [undefined, null, "lanes", 3, { 0: twice[0] }]) expect(validLaneDepths(none, FIELDS), String(none)).toEqual({});
    for (const none of [undefined, null, "fields", 3, []]) expect(validLaneDepths(twice, none), String(none)).toEqual({});
  });

  it("does not change what validLanes returns for the depth-only entry", () => {
    const nodes = [{ kind: "shipment", label: "S", palette: "#000", source: "json", timestamp: "at" }];
    expect(validLanes([{ id: "freight", depth: { split: SPLIT } }], nodes)).toEqual([]);
    // A full lane with a depth is still the lane it was: the reader returns its own keys and no depth.
    const { palette: _palette, ...declared } = DECL;
    expect(validLanes([{ ...declared, depth: { split: SPLIT } }], nodes)).toEqual([declared]);
  });
});

describe("what the model reads", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, "lane-lines.ts"), "utf8");

  it("holds no grouping, so the same lines stand under every grouping", () => {
    expect(source).not.toMatch(/track-by|\.\/tracks|useSolo|useSchema/);
  });

  it("names no pack's field, kind or word", () => {
    expect(source).not.toMatch(/ip_asn|credential|org_id|network|spend_usd/i);
  });
});
