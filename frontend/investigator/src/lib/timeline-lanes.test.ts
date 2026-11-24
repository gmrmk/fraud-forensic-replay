import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  LANE_BAR_FILL,
  LANE_PLOT_PX,
  barPieces,
  barWidthPct,
  bucketAt,
  buildDeclaredLane,
  buildLane,
  buildLanes,
  cssRgb,
  declarationOfNode,
  displayText,
  emptyLaneLike,
  formatLaneNumber,
  formatScaleNumber,
  formatStep,
  laneKinds,
  laneName,
  lanePlotLabel,
  lanePositions,
  laneScale,
  laneScaleText,
  laneValueAttr,
  laneValueText,
  magnitudeNodes,
  parseCollapsedLanes,
  roundUpTwoDigits,
  serializeCollapsedLanes,
  type LaneBar,
  type LaneDeclaration,
  type LaneModel,
} from "./timeline-lanes";
import { HOURLY_197 } from "./lane-series.fixture";
import { magnitudeAt } from "./magnitude";
import { makeProjector } from "./timeline-projector";
import type { Entity } from "./entity";
import type { ScenarioNode } from "./scenarios";

describe("laneKinds", () => {
  it("keeps the concrete severity order and drops absent kinds (the card-fraud trio)", () => {
    expect(laneKinds(new Set(["auth", "fraud", "login"]), [])).toEqual(["fraud", "login", "auth"]);
  });

  it("puts manifest-declared kinds after the concrete ones, in declared order", () => {
    const declared = ["account", "order", "shipment", "hop", "refund"];
    expect(laneKinds(new Set(["refund", "shipment", "hop", "order", "account"]), declared)).toEqual(declared);
  });

  it("omits a declared kind with no event in the window", () => {
    expect(laneKinds(new Set(["shipment", "refund"]), ["order", "shipment", "hop", "refund"])).toEqual(["shipment", "refund"]);
  });

  it("mixes concrete and declared lanes without reordering the concrete ones", () => {
    expect(laneKinds(new Set(["login", "fraud", "shipment"]), ["shipment"])).toEqual(["fraud", "login", "shipment"]);
  });
});

describe("lanePositions", () => {
  it("centres a single lane and spreads several evenly from 18% to 82%", () => {
    expect(lanePositions(["shipment"])).toEqual({ shipment: 50 });
    expect(lanePositions(["a", "b", "c", "d", "e"])).toEqual({ a: 18, b: 34, c: 50, d: 66, e: 82 });
  });
});

describe("cssRgb", () => {
  it("emits a space-separated rgb colour, with optional alpha", () => {
    expect(cssRgb("#ffb347")).toBe("rgb(255 179 71)");
    expect(cssRgb("#ffb347", 0.5)).toBe("rgb(255 179 71 / 0.5)");
  });

  it("expands #rgb shorthand and falls back to muted grey on a malformed hex", () => {
    expect(cssRgb("#fff")).toBe("rgb(255 255 255)");
    expect(cssRgb("orange")).toBe("rgb(128 128 128)");
  });
});

// ---- Phase A: the lane model -------------------------------------------------------------

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 5);

const node: ScenarioNode = {
  kind: "parcel",
  label: "Parcel",
  palette: "#3366cc",
  source: "json",
  timestamp: "at",
  magnitude: "weight",
};

const row = (id: string, weight: unknown, timestamp: number, kind = "parcel"): Entity => ({
  id,
  kind,
  timestamp,
  coords: null,
  fields: { weight },
  displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
});

/** One row per value, one per hour, from T0. */
const hourly = (values: readonly number[]): Entity[] => values.map((v, i) => row(`r${i}`, v, T0 + i * HOUR));

const range = (from: number, to: number, by: number): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to; v += by) out.push(v);
  return out;
};
const EIGHTEEN = range(100, 270, 10);
const S1 = [...EIGHTEEN, 3000, 3600];
const S2 = EIGHTEEN;
const S3 = [...range(100, 250, 10), 3000, 3200, 3400, 3600];
const S4 = [...Array<number>(19).fill(100), 5000];
const S5 = [...EIGHTEEN, 800, 4000];
const S6 = [...Array<number>(22).fill(5), 200, 200];
const S7 = [...Array<number>(8).fill(100), 5000];
/** The largest value wins the smaller-of and has three significant digits, so the rounding of
 *  the top shows on that arm too (added after the Phase A check: no series above pinned it). */
const S8 = [...range(100, 260, 10), 273];

describe("laneScale", () => {
  it("S1: top is twice the 90th percentile, the two large values are cut", () => {
    expect(laneScale(S1)).toEqual({ top: 540, max: 3600, above: 2 });
  });

  it("S2: with nothing far above the rest the top is the largest value", () => {
    expect(laneScale(S2)).toEqual({ top: 270, max: 270, above: 0 });
  });

  it("S3: a burst on a fifth of the series is not cut (the first failure of the rule)", () => {
    expect(laneScale(S3)).toEqual({ top: 3600, max: 3600, above: 0 });
  });

  it("S4: one burst is cut", () => {
    expect(laneScale(S4)).toEqual({ top: 200, max: 5000, above: 1 });
  });

  it("S5: two bursts of different size are both cut", () => {
    expect(laneScale(S5)).toEqual({ top: 540, max: 4000, above: 2 });
  });

  it("S6: a routine busy period on under a tenth is cut (the second failure of the rule)", () => {
    expect(laneScale(S6)).toEqual({ top: 10, max: 200, above: 2 });
  });

  it("S7: fewer than ten values are never cut", () => {
    expect(laneScale(S7)).toEqual({ top: 5000, max: 5000, above: 0 });
  });

  it("S8: a largest value that is the top is rounded up as well", () => {
    expect(laneScale(S8)).toEqual({ top: 280, max: 273, above: 0 });
  });

  it("HOURLY_197: top 500, six above, and the heights the design states at a plot of 24", () => {
    const scale = laneScale(HOURLY_197);
    expect(scale?.top).toBe(500);
    expect(scale?.above).toBe(6);
    expect(scale?.max).toBe(4133.57);
    const lane = buildLane(hourly(HOURLY_197), node, 24);
    expect(lane).not.toBeNull();
    const heightOf = (v: number): number | undefined => lane?.bars.find((b) => b.value === v)?.height;
    expect(heightOf(149.56)).toBe(7);
    expect(heightOf(279.74)).toBe(13);
    const cut = lane?.bars.filter((b) => b.cut) ?? [];
    expect(cut).toHaveLength(6);
    expect(cut.every((b) => b.height === 24)).toBe(true);
    expect(lane?.bars.filter((b) => b.height === 1)).toHaveLength(34);
  });

  it("is null for an empty series and for one with no finite positive value", () => {
    expect(laneScale([])).toBeNull();
    expect(laneScale([0, -4, Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  it("does not reorder its input", () => {
    const input = [5, 1, 3];
    laneScale(input);
    expect(input).toEqual([5, 1, 3]);
  });
});

describe("roundUpTwoDigits", () => {
  it("rounds up to two significant digits and leaves a two-digit value alone", () => {
    expect(roundUpTwoDigits(491.54)).toBe(500);
    expect(roundUpTwoDigits(540)).toBe(540);
    expect(roundUpTwoDigits(270)).toBe(270);
    expect(roundUpTwoDigits(1.1)).toBe(1.1);
    expect(roundUpTwoDigits(0.29)).toBe(0.29);
    expect(roundUpTwoDigits(0.0541)).toBe(0.055);
    expect(roundUpTwoDigits(4133.57)).toBe(4200);
    expect(roundUpTwoDigits(99.999)).toBe(100);
  });
});

describe("buildLane", () => {
  it("sums rows that share a timestamp, keeps time order, and leaves out unusable rows", () => {
    const rows = [
      row("c", 30, T0 + 2 * HOUR),
      row("a1", 10, T0),
      row("a2", 5, T0),
      row("z", 0, T0 + HOUR),
      row("n", -2, T0 + HOUR),
      row("nan", Number.NaN, T0 + HOUR),
      row("s", "12", T0 + HOUR),
      row("nul", null, T0 + HOUR),
      row("t0", 99, 0),
      row("other", 77, T0 + 3 * HOUR, "stop"),
    ];
    const lane = buildLane(rows, node);
    expect(lane?.bars.map((b) => [b.t, b.value])).toEqual([
      [T0, 15],
      [T0 + 2 * HOUR, 30],
    ]);
  });

  it("is null when nothing is left", () => {
    expect(buildLane([row("t0", 5, 0), row("bad", 0, T0)], node)).toBeNull();
    expect(buildLane([], node)).toBeNull();
  });

  it("carries the node's labels, palette and step", () => {
    const lane = buildLane(hourly([1, 2, 3]), { ...node, magnitudeLabel: "Weight", magnitudeUnit: "kg" });
    expect(lane).toMatchObject({ kind: "parcel", nodeLabel: "Parcel", label: "Weight", unit: "kg", palette: "#3366cc", step: HOUR });
    const bare = buildLane(hourly([1, 2, 3]), { ...node, label: "", palette: "" });
    expect(bare).toMatchObject({ nodeLabel: "parcel", label: "", unit: "", palette: "" });
  });

  it("S1 at a plot of 24: heights 4, 12 and 24, the two large values cut", () => {
    const lane = buildLane(hourly(S1), node, 24);
    const byValue = (v: number): LaneBar | undefined => lane?.bars.find((b) => b.value === v);
    expect(byValue(100)).toMatchObject({ height: 4, cut: false });
    expect(byValue(270)).toMatchObject({ height: 12, cut: false });
    expect(byValue(3000)).toMatchObject({ height: 24, cut: true });
    expect(byValue(3600)).toMatchObject({ height: 24, cut: true });
    expect(lane?.scale).toEqual({ top: 540, max: 3600, above: 2 });
  });

  it("S3: the value 100 keeps the one pixel floor", () => {
    const lane = buildLane(hourly(S3), node, 24);
    expect(lane?.bars.find((b) => b.value === 100)?.height).toBe(1);
  });

  it("defaults the plot to LANE_PLOT_PX", () => {
    const lane = buildLane(hourly(S4), node);
    expect(Math.max(...(lane?.bars.map((b) => b.height) ?? []))).toBe(LANE_PLOT_PX);
  });

  it("decimals is 0 when every magnitude is whole and 2 otherwise, judged per row", () => {
    expect(buildLane(hourly([1, 2, 3]), node)?.decimals).toBe(0);
    expect(buildLane(hourly([1, 2.5, 3]), node)?.decimals).toBe(2);
    const halves = [row("a", 0.5, T0), row("b", 0.5, T0)];
    expect(buildLane(halves, node)?.decimals).toBe(2);
  });

  // Each of these pins a wrong version that once survived.
  it("a bar exactly at the top is not cut, and stands at full height", () => {
    const lane = buildLane(hourly(S2), node, 24);
    const atTop = lane?.bars.find((b) => b.value === 270);
    expect(lane?.scale.top).toBe(270);
    expect(atTop?.cut).toBe(false);
    expect(atTop?.height).toBe(24);
    expect(lane?.bars.some((b) => b.cut)).toBe(false);
  });

  it("decimals is judged only on the kind's usable rows", () => {
    const rows = [
      row("a", 3, T0),
      row("b", 5, T0 + HOUR),
      row("zero", 0, T0 + 2 * HOUR),
      row("none", null, T0 + 3 * HOUR),
      row("untimed", 2.5, 0),
      row("other", 1.25, T0 + 4 * HOUR, "crate"),
    ];
    expect(buildLane(rows, node)?.decimals).toBe(0);
  });

  it("keeps a quantity label of 24 characters and a unit of 16, and drops one character more", () => {
    const keep = buildLane(hourly([1, 2]), { ...node, magnitudeLabel: "q".repeat(24), magnitudeUnit: "u".repeat(16) });
    expect(keep?.label).toBe("q".repeat(24));
    expect(keep?.unit).toBe("u".repeat(16));
    const drop = buildLane(hourly([1, 2]), { ...node, magnitudeLabel: "q".repeat(25), magnitudeUnit: "u".repeat(17) });
    expect(drop?.label).toBe("");
    expect(drop?.unit).toBe("");
  });

  it("peak is the earliest of two equal largest bars", () => {
    const lane = buildLane(hourly([3, 9, 2, 9]), node);
    expect(lane?.peak).toMatchObject({ t: T0 + HOUR, value: 9 });
  });
});

describe("buildLanes and magnitudeNodes", () => {
  const overlay: ScenarioNode = {
    kind: "verdict",
    label: "Verdict",
    palette: "#cc3333",
    source: "json",
    magnitude: "weight",
    decision: { status: "s", outcome: "o", note: "n", actor: "a", target: "t", key: "k", event: "e" },
  };
  const plain: ScenarioNode = { kind: "stop", label: "Stop", palette: "#333", source: "json" };
  const second: ScenarioNode = { kind: "crate", label: "Crate", palette: "#393", source: "sql", magnitude: "weight" };
  const concrete: ScenarioNode = { kind: "transfer", label: "Transfer", palette: "#999", source: "sql", magnitude: "weight" };

  it("magnitudeNodes keeps manifest order and leaves out overlays, concrete kinds and nodes with no magnitude", () => {
    expect(magnitudeNodes([second, overlay, plain, concrete, node]).map((n) => n.kind)).toEqual(["crate", "parcel"]);
  });

  it("buildLanes gives a lane per usable node and none for a kind with no usable row", () => {
    const entities = [...hourly([1, 2]), row("c", 4, T0, "crate")];
    expect(buildLanes([node, plain, second], entities).map((l) => l.kind)).toEqual(["parcel", "crate"]);
    expect(buildLanes([node, second], hourly([1, 2])).map((l) => l.kind)).toEqual(["parcel"]);
  });
});

describe("displayText", () => {
  it("trims, and gives an empty string for anything but a string of 1 to most characters", () => {
    expect(displayText("  Weight  ", 24)).toBe("Weight");
    expect(displayText(undefined, 24)).toBe("");
    expect(displayText(5, 24)).toBe("");
    expect(displayText("", 24)).toBe("");
    expect(displayText("   ", 24)).toBe("");
    expect(displayText("abcd", 3)).toBe("");
    expect(displayText("abc", 3)).toBe("abc");
  });
});

describe("bucketAt", () => {
  const lane = buildLane([row("a", 4, T0), row("b", 9, T0 + HOUR), row("c", 6, T0 + 3 * HOUR)], node) as LaneModel;
  const instants = [
    T0 + 1000, // inside a bucket
    T0 + HOUR - 1, // a bucket's last instant
    T0 + HOUR, // the next bucket's first
    T0 + 2 * HOUR + 5, // a gap
    T0 - 1, // before the first
    T0 + 4 * HOUR, // after the last
  ];

  it("finds the bucket that holds the instant, and null in a gap or outside", () => {
    expect(bucketAt(lane, instants[0])?.value).toBe(4);
    expect(bucketAt(lane, instants[1])?.value).toBe(4);
    expect(bucketAt(lane, instants[2])?.value).toBe(9);
    expect(bucketAt(lane, instants[3])).toBeNull();
    expect(bucketAt(lane, instants[4])).toBeNull();
    expect(bucketAt(lane, instants[5])).toBeNull();
  });

  it("gives what magnitudeAt gives at every instant", () => {
    for (const at of instants) {
      expect(bucketAt(lane, at)?.value ?? null, String(at)).toBe(magnitudeAt(lane.bars, lane.step, at));
    }
  });

  it("is null for a lane of one bucket, as magnitudeAt is", () => {
    const one = buildLane([row("a", 4, T0)], node) as LaneModel;
    expect(one.step).toBe(0);
    expect(bucketAt(one, T0)).toBeNull();
    expect(magnitudeAt(one.bars, one.step, T0)).toBeNull();
  });
});

describe("barPieces and barWidthPct", () => {
  it("gives one piece for an uncut bar", () => {
    expect(barPieces({ t: 1, value: 5, height: 7, cut: false }, 24)).toEqual([{ bottom: 0, height: 7, cap: false }]);
  });

  it("gives the body and then the cap for a cut bar", () => {
    expect(barPieces({ t: 1, value: 5, height: 24, cut: true }, 24)).toEqual([
      { bottom: 0, height: 19, cap: false },
      { bottom: 21, height: 3, cap: true },
    ]);
  });

  it("is 85 percent of the step as a percent of the window, and 0 for a step of 0", () => {
    const project = makeProjector(T0, T0 + 100 * HOUR);
    const lane = buildLane(hourly([1, 2]), node) as LaneModel;
    expect(LANE_BAR_FILL).toBe(0.85);
    expect(barWidthPct(lane, project)).toBeCloseTo(0.85, 9);
    expect(barWidthPct({ ...lane, step: 0 }, project)).toBe(0);
    expect(barWidthPct(lane, makeProjector(T0, T0))).toBe(0);
  });
});

describe("number and text formats", () => {
  it("formatLaneNumber groups and fixes the decimals; laneValueAttr does not group", () => {
    expect(formatLaneNumber(4133.565, 2)).toBe("4,133.57");
    expect(laneValueAttr(4133.565, 2)).toBe("4133.57");
    expect(formatLaneNumber(12000, 0)).toBe("12,000");
  });

  it("formatScaleNumber is compact to two significant digits", () => {
    expect(formatScaleNumber(500)).toBe("500");
    expect(formatScaleNumber(4133.57)).toBe("4.1K");
    expect(formatScaleNumber(2_300_000)).toBe("2.3M");
    expect(formatScaleNumber(270)).toBe("270");
    expect(formatScaleNumber(279.74)).toBe("280");
    expect(formatScaleNumber(0.054)).toBe("0.054");
  });

  it("formatStep takes the largest unit that divides the step, not the largest it passes (added after the review)", () => {
    expect(formatStep(90 * 60_000)).toBe("90M");
    expect(formatStep(36 * HOUR)).toBe("36H");
  });

  it("formatStep gives the largest whole unit, and an empty string when there is none", () => {
    expect(formatStep(HOUR)).toBe("1H");
    expect(formatStep(15 * 60_000)).toBe("15M");
    expect(formatStep(24 * HOUR)).toBe("1D");
    expect(formatStep(30_000)).toBe("30S");
    for (const bad of [0, -1, Number.NaN, 1500]) expect(formatStep(bad), String(bad)).toBe("");
  });
});

describe("lane texts", () => {
  const full = buildLane(hourly(HOURLY_197), { ...node, label: "Token meter", magnitudeLabel: "Cost", magnitudeUnit: "EUR" }) as LaneModel;
  const bare = buildLane([row("a", 40, T0)], node) as LaneModel;
  const calm = buildLane(hourly(S2), node) as LaneModel;

  it("laneScaleText, with and without cut bars", () => {
    expect(laneScaleText(full)).toBe("0 to 500 · 6 over · largest 4.1K");
    expect(laneScaleText(calm)).toBe("0 to 270");
  });

  it("laneName adds the quantity's label when there is one", () => {
    expect(laneName(full)).toBe("Token meter Cost");
    expect(laneName(bare)).toBe("Parcel");
  });

  it("lanePlotLabel names the instant of the peak, not of the first bucket (added after the review)", () => {
    const lane = buildLane(hourly([5, 9, 7]), node);
    if (!lane) throw new Error("fixture lane is empty");
    expect(lanePlotLabel(lane, (ms) => String(ms))).toContain(` at ${T0 + HOUR}`);
  });

  it("lanePlotLabel for a lane with every part and for one with none", () => {
    expect(lanePlotLabel(full, () => "T")).toBe("Token meter Cost: 197 bars, largest bar 4,133.57 EUR at T, each bar one hour");
    expect(lanePlotLabel(bare, () => "T")).toBe("Parcel: 1 bar, largest bar 40 at T, each bar its own time");
  });

  it("laneValueText for a bucket, a gap, two lanes and none", () => {
    const at = full.peak.t + 10;
    expect(laneValueText([full], at)).toBe(", Token meter Cost 4,133.57 EUR");
    expect(laneValueText([bare], T0)).toBe(", Parcel no data");
    expect(laneValueText([full, bare], at)).toBe(", Token meter Cost 4,133.57 EUR, Parcel no data");
    expect(laneValueText([], at)).toBe("");
    const withBucket = buildLane([row("a", 40, T0), row("b", 41, T0 + HOUR)], node) as LaneModel;
    expect(laneValueText([withBucket], T0)).toBe(", Parcel 40");
  });
});

describe("collapsed lanes", () => {
  it("parse gives an empty list for null, bad JSON, an object and a number", () => {
    for (const raw of [null, "not json", "{}", "7", '"a"']) expect(parseCollapsedLanes(raw), String(raw)).toEqual([]);
  });

  it("parse drops non-strings, empty strings and 65 character strings, and repeats", () => {
    const raw = JSON.stringify(["a", 5, "", "x".repeat(65), "a", null, "b", "x".repeat(64)]);
    expect(parseCollapsedLanes(raw)).toEqual(["a", "b", "x".repeat(64)]);
  });

  it("parse keeps the first 32 of 40, and keeps __proto__ as a plain string", () => {
    const forty = Array.from({ length: 40 }, (_, i) => `k${i}`);
    expect(parseCollapsedLanes(JSON.stringify(forty))).toEqual(forty.slice(0, 32));
    expect(parseCollapsedLanes('["__proto__","a"]')).toEqual(["__proto__", "a"]);
  });

  it("parse drops repeats before it keeps the first 32 (added after the review)", () => {
    const list = ["dup", ...Array.from({ length: 30 }, (_, i) => `k${i}`), "dup", "late"];
    const got = parseCollapsedLanes(JSON.stringify(list));
    expect(got).toHaveLength(32);
    expect(got[31]).toBe("late");
  });

  it("serialize then parse gives the list back, with the same rule applied on the way out", () => {
    const kinds = ["parcel", "crate"];
    expect(parseCollapsedLanes(serializeCollapsedLanes(kinds))).toEqual(kinds);
    expect(JSON.parse(serializeCollapsedLanes(["a", "a", ""]))).toEqual(["a"]);
  });
});

describe("timeline-lanes source", () => {
  it("holds none of the words of one pack, in any case", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "./timeline-lanes.ts"), "utf8");
    expect(src).not.toMatch(/usage|spend|usd/i);
  });
});

// ---- A caller-supplied top (LM1) ------------------------------------------------------------

describe("buildLane with a fixed top", () => {
  const rows = hourly(S1);

  it("laneScale keeps its signature and its rule", () => {
    expect(laneScale.length).toBe(1);
    expect(laneScale(S1)).toEqual({ top: 540, max: 3600, above: 2 });
  });

  it("a lower top replaces the measured one: it is used as given, and above counts against it", () => {
    const lane = buildLane(rows, node, 24, 200);
    expect(lane?.scale).toEqual({ top: 200, max: 3600, above: 9 });
    const byValue = (v: number): LaneBar | undefined => lane?.bars.find((b) => b.value === v);
    expect(byValue(100)).toMatchObject({ height: 12, cut: false });
    expect(byValue(210)).toMatchObject({ height: 24, cut: true });
    expect(byValue(270)).toMatchObject({ height: 24, cut: true });
    expect(byValue(3600)).toMatchObject({ height: 24, cut: true });
    expect(lane?.bars.filter((b) => b.cut)).toHaveLength(9);
  });

  it("a higher top than the largest value cuts nothing and leaves the largest below full height", () => {
    const lane = buildLane(rows, node, 24, 5000);
    expect(lane?.scale).toEqual({ top: 5000, max: 3600, above: 0 });
    expect(lane?.bars.some((b) => b.cut)).toBe(false);
    const largest = lane?.bars.find((b) => b.value === 3600);
    expect(largest?.height).toBe(17);
    expect(largest?.height).toBeLessThan(24);
  });

  it("the top is not rounded to two digits", () => {
    expect(buildLane(rows, node, 24, 517)?.scale.top).toBe(517);
  });

  it("a bar exactly at the fixed top is not cut and stands at full height", () => {
    const lane = buildLane(rows, node, 24, 270);
    const atTop = lane?.bars.find((b) => b.value === 270);
    expect(atTop).toMatchObject({ height: 24, cut: false });
    expect(lane?.scale.above).toBe(2);
  });

  it("everything but the scale and the bars' height and cut is the same with and without it", () => {
    const plain = buildLane(rows, node, 24) as LaneModel;
    const fixed = buildLane(rows, node, 24, 200) as LaneModel;
    expect(fixed.bars.map((b) => [b.t, b.value])).toEqual(plain.bars.map((b) => [b.t, b.value]));
    expect(fixed.step).toBe(plain.step);
    expect(fixed.decimals).toBe(plain.decimals);
    expect(fixed.peak.value).toBe(plain.peak.value);
    expect(fixed.peak.t).toBe(plain.peak.t);
    expect({ ...fixed, bars: [], scale: plain.scale, peak: plain.peak }).toEqual({ ...plain, bars: [] });
  });

  it("is null with no usable row, whatever the top", () => {
    expect(buildLane([row("t0", 5, 0), row("bad", 0, T0)], node, 24, 200)).toBeNull();
    expect(buildLane([], node, 24, 200)).toBeNull();
  });

  // The undefined case passes at the tip: it pins today's output for a top that is left out.
  it("a top that is undefined, zero, negative, NaN or infinite gives today's lane", () => {
    const today = buildLane(rows, node, 24);
    for (const top of [undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(buildLane(rows, node, 24, top), String(top)).toEqual(today);
    }
  });

  it("the plot height default still applies when only the top is given", () => {
    const lane = buildLane(rows, node, undefined, 200);
    expect(Math.max(...(lane?.bars.map((b) => b.height) ?? []))).toBe(LANE_PLOT_PX);
  });
});

// ---- Lanes declared in the manifest (LM2) -----------------------------------------------------
// Kinds and fields below are the fixture's own, except where a case needs the app's concrete kinds
// ("auth" and "fraud" are kinds the app has code for, and a declared lane must read them).

describe("a lane built from a declaration", () => {
  const T = Date.UTC(2026, 4, 21, 12); // on an hour
  const tx = (id: string, kind: string, amount: number | null, rank: number | null, at: number): Entity => ({
    id,
    kind,
    timestamp: at,
    coords: null,
    fields: { amount, ml_percentile: rank },
    displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
  });
  const nodes: ScenarioNode[] = [
    { kind: "auth", label: "Authorization", palette: "#00e5ff", source: "sql", timestamp: "timestamp" },
    { kind: "fraud", label: "Fraud", palette: "#ff3d2e", source: "sql", timestamp: "timestamp" },
    { kind: "decision", label: "Decision", palette: "#f66", source: "json" },
  ];
  const spend: LaneDeclaration = {
    id: "lane-a",
    name: "Authorizations",
    label: "Spend",
    unit: "USD",
    kinds: ["auth", "fraud"],
    field: "amount",
    bucket: "hour",
    aggregate: "sum",
  };
  const rank: LaneDeclaration = { ...spend, id: "lane-b", label: "Highest model rank", unit: "pct", field: "ml_percentile", aggregate: "max" };
  // Three charges in one hour (two kinds), one in the next, one two hours on, one with no rank.
  const rows = [
    tx("1", "auth", 40, 12.5, T + 3_000),
    tx("2", "auth", 10, 30.25, T + 9_000),
    tx("3", "fraud", 250, 98.81, T + 41 * 60_000),
    tx("4", "auth", 20, 5, T + HOUR + 1_000),
    tx("5", "auth", 5, null, T + 3 * HOUR + 1_000),
  ];

  it("a node's lane has an id that is its kind, and the same lane as its derived declaration gives", () => {
    const parcels = [row("a", 3, T), row("b", 4, T + HOUR)];
    const viaNode = buildLane(parcels, node);
    expect(viaNode?.id).toBe("parcel");
    expect(declarationOfNode(node)).toMatchObject({ id: "parcel", kinds: ["parcel"], field: "weight", name: "Parcel" });
    expect(buildDeclaredLane(parcels, declarationOfNode(node))).toEqual(viaNode);
  });

  it("is one bar for each hour, the step is one hour, and the top and the cut follow the bars", () => {
    const lane = buildDeclaredLane(rows, spend);
    expect(lane?.bars.map((b) => [b.t, b.value])).toEqual([
      [T, 300],
      [T + HOUR, 20],
      [T + 3 * HOUR, 5],
    ]);
    expect(lane?.step).toBe(HOUR);
    expect(lane).toMatchObject({ id: "lane-a", nodeLabel: "Authorizations", label: "Spend", unit: "USD" });
  });

  it("the step is the declared hour even when one bar is all there is", () => {
    expect(buildDeclaredLane([rows[0]], spend)?.step).toBe(HOUR);
    expect(buildDeclaredLane([rows[0]], { ...spend, bucket: undefined })?.step).toBe(0);
  });

  it("a max lane over the same rows reads the largest value of each hour, to two decimals", () => {
    const lane = buildDeclaredLane(rows, rank);
    expect(lane?.bars.map((b) => b.value)).toEqual([98.81, 5]);
    expect(lane?.decimals).toBe(2);
    expect(lane && bucketAt(lane, T + 30 * 60_000)?.value).toBe(98.81);
  });

  it("a declared top is the lane's fixed top, and the caller's top wins over it", () => {
    expect(buildDeclaredLane(rows, { ...spend, top: 100 })?.scale).toEqual({ top: 100, max: 300, above: 1 });
    expect(buildDeclaredLane(rows, { ...spend, top: 100 }, 24, 400)?.scale).toEqual({ top: 400, max: 300, above: 0 });
  });

  it("the highest rank of the hour reads at its hour: 98.81 at 9 AM on 2026-05-21 and 99.99 at 7 AM on 2026-05-27, Houston", () => {
    // Houston is five hours behind UTC in May, so 9 AM is 14:00 UTC and 7 AM is 12:00 UTC. The
    // fixture's other charges in those hours rank lower. (The real story's 118 bars are checked on the built site.)
    const nine = Date.UTC(2026, 4, 21, 14);
    const seven = Date.UTC(2026, 4, 27, 12);
    const ranked = [
      tx("p", "auth", 30, 41.2, nine + 4 * 60_000),
      tx("q", "fraud", 90, 98.81, nine + 50 * 60_000),
      tx("r", "auth", 12, 3.5, seven + 2_000),
      tx("s", "fraud", 700, 99.99, seven + 6_000),
      tx("t", "fraud", 650, 62.1, seven + 9_000),
    ];
    const lane = buildDeclaredLane(ranked, rank);
    expect(lane?.bars.map((b) => b.t)).toEqual([nine, seven]);
    expect(lane && bucketAt(lane, nine + 20 * 60_000)?.value).toBe(98.81);
    expect(lane && bucketAt(lane, seven + 59 * 60_000)?.value).toBe(99.99);
    expect(lane && formatLaneNumber(lane.peak.value, lane.decimals)).toBe("99.99");
  });

  it("the lane's palette is the one it is given", () => {
    expect(buildDeclaredLane(rows, { ...spend, palette: "#00e5ff" })?.palette).toBe("#00e5ff");
    expect(buildDeclaredLane(rows, spend)?.palette).toBe("");
  });

  it("is null where no row of its kinds has a usable value", () => {
    expect(buildDeclaredLane(rows, { ...spend, field: "no_such_field" })).toBeNull();
    expect(buildDeclaredLane(rows, { ...spend, kinds: ["decision"] })).toBeNull();
    expect(buildDeclaredLane([], spend)).toBeNull();
  });

  describe("buildLanes with the manifest's lanes", () => {
    it("draws the declared lanes over concrete kinds, in the declared order, with the first kind's palette", () => {
      const lanes = buildLanes(nodes, rows, [spend, rank]);
      expect(lanes.map((l) => l.id)).toEqual(["lane-a", "lane-b"]);
      expect(lanes.map((l) => l.palette)).toEqual(["#00e5ff", "#00e5ff"]);
      expect(lanes.map((l) => l.kind)).toEqual(["auth", "auth"]);
      expect(lanes.map((l) => laneName(l))).toEqual(["Authorizations Spend", "Authorizations Highest model rank"]);
    });

    it("a declared top reaches the lane's scale", () => {
      const [lane] = buildLanes(nodes, rows, [{ ...spend, top: 100 }]);
      expect(lane.scale).toEqual({ top: 100, max: 300, above: 1 });
    });

    it("two lanes over the same kinds are told apart by id, name and label, and read out apart", () => {
      const lanes = buildLanes(nodes, rows, [spend, rank]);
      expect(new Set(lanes.map((l) => l.id)).size).toBe(2);
      expect(laneValueText(lanes, T + 10 * 60_000)).toBe(
        ", Authorizations Spend 300 USD, Authorizations Highest model rank 98.81 pct",
      );
    });

    it("a node's lane stays first and keeps its id, and the declared lanes follow", () => {
      const parcels = [row("a", 3, T), row("b", 4, T + HOUR)];
      const lanes = buildLanes([node, ...nodes], [...parcels, ...rows], [spend]);
      expect(lanes.map((l) => l.id)).toEqual(["parcel", "lane-a"]);
    });

    it("leaves out a declared lane whose id a node's lane already has, and keeps the node's", () => {
      const parcels = [row("a", 3, T), row("b", 4, T + HOUR)];
      const lanes = buildLanes([node, ...nodes], [...parcels, ...rows], [{ ...spend, id: "parcel" }, rank]);
      expect(lanes.map((l) => l.id)).toEqual(["parcel", "lane-b"]);
      expect(lanes[0].nodeLabel).toBe("Parcel");
    });

    it("with no rank in the rows, builds no rank lane and no error", () => {
      const unscored = rows.map((r) => tx(r.id, r.kind, r.fields.amount as number, null, r.timestamp));
      const noKey = rows.map((r) => ({ ...r, fields: { amount: r.fields.amount } }));
      for (const set of [unscored, noKey]) {
        expect(buildLanes(nodes, set, [spend, rank]).map((l) => l.id)).toEqual(["lane-a"]);
      }
    });

    it("an invalid entry hides only itself: the other lane is kept", () => {
      const bad: unknown[] = [
        { ...spend, id: "" },
        { ...spend, id: "x".repeat(65) },
        { ...spend, id: 7 },
        { ...spend, name: "n".repeat(25) },
        { ...spend, label: "  " },
        { ...spend, unit: "u".repeat(17) },
        { ...spend, kinds: "auth" },
        { ...spend, kinds: [] },
        { ...spend, kinds: ["auth", "decision"] },
        { ...spend, kinds: ["no_such_kind"] },
        { ...spend, field: "" },
        { ...spend, bucket: "day" },
        { ...spend, bucket: undefined },
        { ...spend, aggregate: "mean" },
        { ...spend, top: 0 },
        { ...spend, top: Number.NaN },
        { ...spend, top: "100" },
        null,
        "lane",
        42,
      ];
      for (const entry of bad) {
        expect(buildLanes(nodes, rows, [entry, rank]).map((l) => l.id), JSON.stringify(entry)).toEqual(["lane-b"]);
      }
    });

    it("a second lane with an id already used is left out", () => {
      expect(buildLanes(nodes, rows, [spend, { ...rank, id: "lane-a" }]).map((l) => l.label)).toEqual(["Spend"]);
    });

    it("lanes that are not a list, or are left out, give today's lanes", () => {
      const parcels = [row("a", 3, T)];
      const today = buildLanes([node], parcels);
      for (const none of [undefined, null, "lanes", { 0: spend }, []]) {
        expect(buildLanes([node], parcels, none), String(none)).toEqual(today);
      }
    });
  });
});

describe("emptyLaneLike (a lane the one row alone has no value for)", () => {
  const full = buildLane([row("a", 10, T0), row("b", 30, T0 + HOUR)], node) as LaneModel;
  const empty = emptyLaneLike(full);

  it("keeps the lane's id, words, palette, step and number form, and has no bars", () => {
    expect(empty).toMatchObject({ id: full.id, kind: full.kind, nodeLabel: full.nodeLabel, label: full.label, unit: full.unit, palette: full.palette, step: full.step, decimals: full.decimals });
    expect(empty.bars).toEqual([]);
  });

  it("keeps the lane's top and counts no bar and no largest value", () => {
    expect(empty.scale).toEqual({ top: full.scale.top, max: 0, above: 0 });
    expect(laneScaleText(empty)).toBe(`0 to ${formatScaleNumber(full.scale.top)}`);
  });

  it("finds no bucket at any time", () => {
    expect(bucketAt(empty, T0)).toBeNull();
    expect(bucketAt(empty, T0 + HOUR)).toBeNull();
  });

  it("says 0 bars in the plot's label, with no largest bar, and no data in the slider's value", () => {
    expect(lanePlotLabel(empty, () => "x")).toBe(`${laneName(empty)}: 0 bars`);
    expect(laneValueText([empty], T0)).toBe(`, ${laneName(empty)} no data`);
  });
});
