/**
 * A manifest node may name one numeric field as its magnitude. These helpers turn that
 * value into a marker scale (area follows the value) and bar heights (linear). The
 * fixture's field is called "weight" on purpose: nothing here knows a pack's names.
 */
import { describe, it, expect } from "vitest";
import { barHeights, barStep, bucketStep, magnitudeAt, magnitudeBars, magnitudeMaxima, magnitudeOf, markerScale, maxMagnitude } from "./magnitude";
import type { Entity } from "./entity";
import type { ScenarioNode } from "./scenarios";

const node: ScenarioNode = { kind: "parcel", label: "Parcel", palette: "#fff", source: "json", magnitude: "weight" };
const plain: ScenarioNode = { kind: "stop", label: "Stop", palette: "#fff", source: "json" };

const parcel = (id: string, weight: unknown, timestamp = 0, kind = "parcel"): Entity => ({
  id,
  kind,
  timestamp,
  coords: null,
  fields: { weight },
  displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: "parcel", pivotableFields: [] },
});

describe("magnitudeOf", () => {
  it("reads the field the node names", () => {
    expect(magnitudeOf(parcel("a", 12.5), node)).toBe(12.5);
  });

  it("is null for a node that declares no magnitude", () => {
    expect(magnitudeOf(parcel("a", 12.5), plain)).toBeNull();
    expect(magnitudeOf(parcel("a", 12.5), undefined)).toBeNull();
  });

  it("is null for zero, negative, missing, text and non-finite values", () => {
    for (const bad of [0, -3, null, undefined, "12", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(magnitudeOf(parcel("a", bad), node), String(bad)).toBeNull();
    }
  });
});

describe("maxMagnitude", () => {
  it("is the largest positive value among the node's entities, or 0 when there is none", () => {
    expect(maxMagnitude([parcel("a", 4), parcel("b", 100), parcel("c", null)], node)).toBe(100);
    expect(maxMagnitude([parcel("a", null)], node)).toBe(0);
    expect(maxMagnitude([], node)).toBe(0);
  });

  it("counts only the node's own kind, whatever fields another kind carries", () => {
    expect(maxMagnitude([parcel("a", 4), parcel("s", 900, 0, "stop")], node)).toBe(4);
  });
});

describe("magnitudeMaxima", () => {
  it("is the largest value per kind that declares a magnitude, and nothing for the rest", () => {
    const all = [parcel("a", 4), parcel("b", 100), parcel("s", 900, 0, "stop")];
    expect(magnitudeMaxima(all, [node, plain])).toEqual({ parcel: 100 });
    expect(magnitudeMaxima(all, [plain])).toEqual({});
  });
});

describe("markerScale", () => {
  it("follows the square root, so a marker's area follows the value", () => {
    expect(markerScale(100, 100)).toBe(1);
    expect(markerScale(25, 100)).toBe(0.5);
    expect(markerScale(1, 100)).toBeCloseTo(0.1);
  });

  it("is 0 when there is no value or nothing to compare against", () => {
    expect(markerScale(null, 100)).toBe(0);
    expect(markerScale(50, 0)).toBe(0);
  });

  it("never exceeds 1", () => {
    expect(markerScale(500, 100)).toBe(1);
  });
});

describe("barHeights", () => {
  it("is linear against the largest value", () => {
    expect(barHeights([100, 50, 25], 100, 40)).toEqual([40, 20, 10]);
  });

  it("gives every positive value at least one pixel and no value none", () => {
    expect(barHeights([1, null, 0.001], 1000, 40)).toEqual([1, 0, 1]);
  });

  it("is all zeros when there is nothing to compare against", () => {
    expect(barHeights([5, 6], 0, 40)).toEqual([0, 0]);
  });
});

describe("magnitudeBars", () => {
  const HOUR = 3_600_000;
  const rows = [parcel("c", 20, 2 * HOUR), parcel("a", 10, HOUR), parcel("b", 30, HOUR), parcel("n", null, 5 * HOUR), parcel("s", 900, HOUR, "stop")];

  it("sums the kind's values at each instant, in time order, and skips rows with no value", () => {
    expect(magnitudeBars(rows, node)).toEqual([{ t: HOUR, value: 40 }, { t: 2 * HOUR, value: 20 }]);
  });

  it("is empty for a node that declares no magnitude", () => {
    expect(magnitudeBars(rows, plain)).toEqual([]);
  });

  it("barStep is the smallest gap between instants: the bucket width the rows imply", () => {
    expect(barStep([{ t: 0, value: 1 }, { t: 3 * HOUR, value: 1 }, { t: 4 * HOUR, value: 1 }])).toBe(HOUR);
    expect(barStep([{ t: HOUR, value: 1 }])).toBe(0);
    expect(barStep([])).toBe(0);
  });

  it("magnitudeAt reads the bar whose bucket holds the instant, and nothing outside every bucket", () => {
    const bars = [{ t: HOUR, value: 40 }, { t: 2 * HOUR, value: 20 }, { t: 6 * HOUR, value: 7 }];
    expect(magnitudeAt(bars, HOUR, HOUR)).toBe(40);
    expect(magnitudeAt(bars, HOUR, 2 * HOUR - 1)).toBe(40);
    expect(magnitudeAt(bars, HOUR, 2 * HOUR)).toBe(20);
    expect(magnitudeAt(bars, HOUR, 6.5 * HOUR)).toBe(7);
    for (const outside of [0, HOUR - 1, 3 * HOUR, 5 * HOUR, 7 * HOUR]) {
      expect(magnitudeAt(bars, HOUR, outside), String(outside)).toBeNull();
    }
    expect(magnitudeAt([], HOUR, HOUR)).toBeNull();
    expect(magnitudeAt(bars, 0, HOUR)).toBeNull();
  });
});

// ---- A lane declaration in place of a node (LM2) ---------------------------------------------
// The fixture's kinds and field are none of the three stories': a declaration reads any kinds.

describe("magnitudeBars with a lane declaration", () => {
  const HOUR = 3_600_000;
  const T = Date.UTC(2026, 2, 10, 4);
  const entity = (id: string, kind: string, fields: Record<string, unknown>, timestamp: number): Entity => ({
    id,
    kind,
    timestamp,
    coords: null,
    fields,
    displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
  });
  const rows = [
    entity("a", "crate", { cost: 10, grade: 40 }, T + 5_000),
    entity("b", "crate", { cost: 30, grade: 90 }, T + 9_000),
    entity("c", "bale", { cost: 5, grade: 70 }, T + 20 * 60_000),
    entity("d", "bale", { cost: 7, grade: 20 }, T + HOUR + 1_000),
    entity("e", "sack", { cost: 900, grade: 99 }, T + 5_000),
  ];
  const decl = { kinds: ["crate", "bale"], field: "cost", bucket: "hour", aggregate: "sum" } as const;

  // This case passes at the tip: it pins what a node gave before the second parameter widened.
  it("with a node gives what it gave before", () => {
    const crate: ScenarioNode = { kind: "crate", label: "Crate", palette: "#fff", source: "json", magnitude: "cost" };
    expect(magnitudeBars(rows, crate)).toEqual([
      { t: T + 5_000, value: 10 },
      { t: T + 9_000, value: 30 },
    ]);
  });

  it("an hourly sum over two kinds is one bar for each hour, at the hour's start", () => {
    expect(magnitudeBars(rows, decl)).toEqual([
      { t: T, value: 45 },
      { t: T + HOUR, value: 7 },
    ]);
  });

  it("transactions seconds apart in one hour are one bar and not hairlines", () => {
    expect(magnitudeBars(rows.slice(0, 2), decl)).toEqual([{ t: T, value: 40 }]);
  });

  it("max gives the largest value of the hour", () => {
    expect(magnitudeBars(rows, { ...decl, field: "grade", aggregate: "max" })).toEqual([
      { t: T, value: 90 },
      { t: T + HOUR, value: 20 },
    ]);
  });

  it("a value at or under zero, a kind not listed and a row without the field count in no bucket", () => {
    const more = [
      ...rows,
      entity("z", "crate", { cost: 0, grade: 1 }, T + 2 * HOUR),
      entity("n", "crate", { cost: -4, grade: 1 }, T + 3 * HOUR),
      entity("m", "crate", { grade: 1 }, T + 4 * HOUR),
      entity("s", "crate", { cost: "8", grade: 1 }, T + 5 * HOUR),
    ];
    expect(magnitudeBars(more, decl).map((b) => b.t)).toEqual([T, T + HOUR]);
  });

  it("with no bucket gives one bar for each instant, as a node does", () => {
    expect(magnitudeBars(rows, { kinds: ["crate", "bale"], field: "cost" })).toEqual([
      { t: T + 5_000, value: 10 },
      { t: T + 9_000, value: 30 },
      { t: T + 20 * 60_000, value: 5 },
      { t: T + HOUR + 1_000, value: 7 },
    ]);
  });

  it("leaves out a row whose time is not a number", () => {
    const bad = [...rows, entity("x", "crate", { cost: 4 }, Number.NaN)];
    expect(magnitudeBars(bad, decl)).toEqual(magnitudeBars(rows, decl));
  });
});

describe("barStep with a declared step", () => {
  const HOUR = 3_600_000;
  const bars = [{ t: 0, value: 1 }, { t: 3 * HOUR, value: 1 }, { t: 4 * HOUR, value: 1 }];

  it("takes the declared step as an optional second parameter, and with none gives today's", () => {
    expect(barStep(bars)).toBe(HOUR);
    expect(barStep(bars, HOUR)).toBe(HOUR);
    expect(barStep([{ t: 0, value: 1 }], HOUR)).toBe(HOUR);
    expect(barStep(bars, 2 * HOUR)).toBe(2 * HOUR);
  });

  it("a declared step that is not a finite number above zero gives today's", () => {
    for (const bad of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(barStep(bars, bad), String(bad)).toBe(HOUR);
    }
  });

  it("bucketStep is one hour for hour and nothing for no bucket", () => {
    expect(bucketStep("hour")).toBe(HOUR);
    expect(bucketStep(undefined)).toBeUndefined();
  });
});

// D1: a node whose rows lie one day apart. These are the three day series the case packs hold
// (the same values and the same 08:00 UTC day start; sources: data/key-many-networks,
// data/seats-two-networks and data/volume-step, usage_day.json). The lane has no day bucket, so the
// step is the one barStep infers from the rows; the cases measure that, and read the instants.
describe("a magnitude lane over rows one day apart", () => {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const series: Record<string, { first: number; values: number[] }> = {
    "eight days": { first: Date.UTC(2026, 10, 4, 8), values: [6120, 7480, 8010, 3150, 2940, 21460, 24890, 9870] },
    "seven days": { first: Date.UTC(2026, 10, 4, 8), values: [142, 168, 155, 31, 18, 236, 372] },
    "ten days": {
      first: Date.UTC(2026, 10, 2, 8),
      values: [26480, 26610, 26300, 26820, 26150, 25640, 25910, 83810, 129660, 29700],
    },
  };
  const rowsOf = (first: number, values: number[]): Entity[] =>
    values.map((v, i) => parcel(`d${i}`, v, first + i * DAY));

  it.each(Object.keys(series))("%s: one bar for each row, at its instant, with its value", (name) => {
    const { first, values } = series[name];
    const bars = magnitudeBars(rowsOf(first, values), node);
    expect(bars).toHaveLength(values.length);
    expect(bars.map((b) => b.value)).toEqual(values);
    expect(bars.map((b) => b.t)).toEqual(values.map((_, i) => first + i * DAY));
  });

  it.each(Object.keys(series))("%s: the step is 24 hours", (name) => {
    const { first, values } = series[name];
    const bars = magnitudeBars(rowsOf(first, values), node);
    expect(barStep(bars)).toBe(86_400_000);
  });

  it.each(Object.keys(series))("%s: each instant reads the bar whose day holds it", (name) => {
    const { first, values } = series[name];
    const bars = magnitudeBars(rowsOf(first, values), node);
    const step = barStep(bars);
    values.forEach((value, i) => {
      const t = first + i * DAY;
      expect(magnitudeAt(bars, step, t), `${name}: day ${i} start`).toBe(value);
      expect(magnitudeAt(bars, step, t + 12 * HOUR), `${name}: day ${i} noon after the start`).toBe(value);
      expect(magnitudeAt(bars, step, t + DAY - 1), `${name}: day ${i} last instant`).toBe(value);
      const next = i + 1 < values.length ? values[i + 1] : null;
      expect(magnitudeAt(bars, step, t + DAY), `${name}: day ${i + 1} start`).toBe(next);
    });
  });

  it.each(Object.keys(series))("%s: no bar before the first day or after the last", (name) => {
    const { first, values } = series[name];
    const bars = magnitudeBars(rowsOf(first, values), node);
    const step = barStep(bars);
    const end = first + values.length * DAY;
    expect(magnitudeAt(bars, step, first - 1)).toBeNull();
    expect(magnitudeAt(bars, step, end - 1)).toBe(values[values.length - 1]);
    expect(magnitudeAt(bars, step, end)).toBeNull();
    expect(magnitudeAt(bars, step, end + 5 * DAY)).toBeNull();
  });

  it("the eight and the seven days hold the totals the packs state", () => {
    const sum = (name: string) => magnitudeBars(rowsOf(series[name].first, series[name].values), node).reduce((s, b) => s + b.value, 0);
    expect(sum("eight days")).toBe(83_920);
    expect(sum("seven days")).toBe(1_122);
  });

  it("a day kind and an hour kind in one list keep each its own step", () => {
    // Seven days and six hours (22:00 on the 10th to 03:00 on the 11th), as the seven-day pack holds.
    const hourNode: ScenarioNode = { ...node, kind: "hourly" };
    const hours = [1, 5, 8, 7, 6, 5].map((v, i) => parcel(`h${i}`, v, Date.UTC(2026, 10, 10, 22) + i * HOUR, "hourly"));
    const all = [...rowsOf(series["seven days"].first, series["seven days"].values), ...hours];
    const dayBars = magnitudeBars(all, node);
    const hourBars = magnitudeBars(all, hourNode);
    expect(dayBars).toHaveLength(7);
    expect(barStep(dayBars)).toBe(DAY);
    expect(hourBars).toHaveLength(6);
    expect(barStep(hourBars)).toBe(HOUR);
    expect(magnitudeAt(hourBars, HOUR, Date.UTC(2026, 10, 11, 3) + HOUR - 1)).toBe(5);
    expect(magnitudeAt(hourBars, HOUR, Date.UTC(2026, 10, 11, 4))).toBeNull();
  });
});
