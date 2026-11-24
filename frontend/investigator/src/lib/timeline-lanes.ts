/** Lane derivation + colour helpers for the case timeline's per-kind lanes, and the model of
 *  a magnitude lane (a header and a plot of bars, one per bucket). Pure; nothing here knows a
 *  pack's field names, units or labels: they all come from the manifest node. */
import type { MouseEvent } from "react";
import { isGenericNode } from "./adapters/manifest-row";
import type { Entity } from "./entity";
import { barHeights, barStep, bucketStep, fieldValue, magnitudeBars, type LaneReading } from "./magnitude";
import { validLanes, type ScenarioNode } from "./scenarios";
import { stepWords } from "./tooltip-words/rows-small";
import type { TimelineProjector } from "./timeline-projector";
import { isOverlayNode } from "./verdicts";

/** Lane order, top to bottom, for the concrete kinds (severity first). */
export const LANE_ORDER = ["fraud", "account_event", "transfer", "login", "auth"] as const;

/** The lanes to draw: concrete kinds present, in LANE_ORDER, then the present
 *  manifest-declared kinds in the order the manifest declares them. */
export function laneKinds(present: ReadonlySet<string>, declared: readonly string[]): string[] {
  return [...LANE_ORDER, ...declared].filter((k) => present.has(k));
}

/** Vertical lane positions, in % of the track: one lane centres, several spread 18..82. */
export function lanePositions(lanes: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  lanes.forEach((k, i) => {
    out[k] = lanes.length <= 1 ? 50 : 18 + (i * 64) / (lanes.length - 1);
  });
  return out;
}

/** A manifest palette hex as a CSS colour in space-separated rgb syntax (a hex
 *  with no mode slot keeps its declared colour). Malformed input renders muted grey. */
export function cssRgb(hex: string, alpha?: number | string): string {
  const raw = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)?.[1];
  const full = raw && raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
  const [r, g, b] = full ? [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) : [128, 128, 128];
  return alpha === undefined ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

// ---- The magnitude lane model --------------------------------------------------------------

/** Plot height in px, the share of a step a bar fills, and the cut bar's cap and gap in px. */
export const LANE_PLOT_PX = 24;
/** The top is the smaller of the largest value and this many times the percentile. */
export const LANE_TOP_FACTOR = 2;
/** The percentile (nearest rank) the top is measured from. */
export const LANE_TOP_RANK = 0.9;
export const LANE_BAR_FILL = 0.85;
export const LANE_CUT_CAP_PX = 3;
export const LANE_CUT_GAP_PX = 2;

/** The colours the lane component paints with, named here so the component and the contrast
 *  test read one source. */
export const LANE_FILL_ALPHA = 0.85;
export const LANE_BAND_ALPHA = 0.12;
export const LANE_EDGE_VAR = "--text-muted-rgb";
export const LANE_LINE_VAR = "--text-rgb";

/** One bucket as drawn: `height` in px, from 1 to the plot height; `cut` when over the top. */
export interface LaneBar {
  t: number;
  value: number;
  height: number;
  cut: boolean;
}

/** `top` is the value a full plot stands for, `max` the largest value, `above` the number of
 *  buckets over the top. */
export interface LaneScale {
  top: number;
  max: number;
  above: number;
}

export interface LaneModel {
  /** The lane's identity: a node's lane has the node's kind, a declared lane has its declared id. */
  id: string;
  /** The node's kind; for a declared lane, the first kind it reads. */
  kind: string;
  /** The node's label, or its kind when it has none; for a declared lane, its name. */
  nodeLabel: string;
  /** The quantity's label; "" when the manifest declares none. */
  label: string;
  unit: string;
  /** The node's palette; "" when it has none (cssRgb then gives a grey). */
  palette: string;
  bars: readonly LaneBar[];
  step: number;
  scale: LaneScale;
  decimals: 0 | 2;
  /** The tallest bar. Of no meaning when `bars` is empty (a lane the one row alone has no value for). */
  peak: LaneBar;
}

/** What the shell hands to its lanes. It lives here so the component and the shell import it
 *  from a file neither of them owns. */
export interface LanesSlot {
  project: TimelineProjector;
  onPlotMouseDown: (e: MouseEvent<HTMLDivElement>) => void;
}

/** One rectangle of a drawn bar, measured from the plot baseline in px. */
export interface BarPiece {
  bottom: number;
  height: number;
  cap: boolean;
}

/** The nodes that get a lane: generic, not an overlay, and declaring a magnitude. */
export function magnitudeNodes(nodes: readonly ScenarioNode[]): ScenarioNode[] {
  return nodes.filter((n) => isGenericNode(n) && !isOverlayNode(n) && Boolean(n.magnitude));
}

/** The value trimmed, when it is a string of 1 to `most` characters after trimming; else "". */
export function displayText(value: unknown, most: number): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length >= 1 && text.length <= most ? text : "";
}

/** Round a value above zero up to two significant digits (491.54 gives 500, 0.0541 gives 0.055). */
export function roundUpTwoDigits(value: number): number {
  const u = Math.pow(10, Math.floor(Math.log10(value)) - 1);
  // The small subtraction keeps 1.1 at 1.1, which a bare ceil would make 1.2.
  return Number((Math.ceil(value / u - 1e-9) * u).toPrecision(12));
}

/** The scale of one lane over its bucket values (the finite ones above zero); null when none. */
export function laneScale(values: readonly number[]): LaneScale | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return null;
  // Nearest rank: the value at position ceil(0.9 n), counting from 1. The epsilon keeps a
  // product that lands a hair above a whole number from stepping up a rank.
  const rank = Math.min(n, Math.max(1, Math.ceil(LANE_TOP_RANK * n - 1e-9)));
  const p90 = sorted[rank - 1];
  const max = sorted[n - 1];
  const top = roundUpTwoDigits(Math.min(max, LANE_TOP_FACTOR * p90));
  return { top, max, above: sorted.filter((v) => v > top).length };
}

/** What a lane is built from: the words it shows, the kinds and field it reads, and how it
 *  buckets and combines them. A node's own magnitude yields one (`declarationOfNode`), and a lane
 *  the manifest declares is one. A lane with no `bucket` has a bar for each instant. */
export interface LaneDeclaration extends LaneReading {
  id: string;
  /** The words above the lane: its name, the quantity's label, and the unit. */
  name: string;
  label: string;
  unit: string;
  /** A fixed top of the scale, when the data's own should not set it. */
  top?: number;
  /** The palette the lane is drawn in; "" gives a grey. */
  palette?: string;
}

/** The declaration a node with a magnitude yields: its kind is its id, it reads its own kind and
 *  field, and it keeps the data's own instants and a sum, so its lane is the lane it always was. */
export function declarationOfNode(node: ScenarioNode): LaneDeclaration {
  return {
    id: node.kind,
    name: node.label || node.kind,
    label: displayText(node.magnitudeLabel, 24),
    unit: displayText(node.magnitudeUnit, 16),
    kinds: [node.kind],
    field: node.magnitude ?? "",
    palette: node.palette || "",
  };
}

const usableTop = (top: number | undefined): top is number => top !== undefined && Number.isFinite(top) && top > 0;

/** The lane of one declaration, or null when no usable bucket remains.
 *  `fixedTop`, when it is a finite number above zero, is the top the caller wants the bars
 *  measured against, used exactly as given (no rounding); otherwise the declaration's own `top`
 *  is used when it has one. It is applied here and `laneScale` is not told: `max` stays the
 *  largest value measured over the rows passed in, `above` counts the buckets over the fixed
 *  top, and each bar's height and cut follow it. With neither, the measured top is used. */
export function buildDeclaredLane(
  entities: readonly Entity[],
  decl: LaneDeclaration,
  plotPx: number = LANE_PLOT_PX,
  fixedTop?: number,
): LaneModel | null {
  // A row whose time could not be read carries timestamp 0 and is left out.
  const rows = entities.filter((e) => decl.kinds.includes(e.kind) && Number.isFinite(e.timestamp) && e.timestamp > 0);
  const buckets = magnitudeBars(rows, decl);
  const measured = laneScale(buckets.map((b) => b.value));
  if (buckets.length === 0 || measured === null) return null;
  const top = usableTop(fixedTop) ? fixedTop : decl.top;
  const scale: LaneScale = usableTop(top)
    ? { top, max: measured.max, above: buckets.filter((b) => b.value > top).length }
    : measured;
  const bars: LaneBar[] = buckets.map((b) => ({
    t: b.t,
    value: b.value,
    height: Math.min(plotPx, barHeights([b.value], scale.top, plotPx)[0]),
    cut: b.value > scale.top,
  }));
  let peak = bars[0];
  for (const bar of bars) if (bar.value > peak.value) peak = bar;
  const whole = rows.every((e) => {
    const v = fieldValue(e, decl.field);
    return v === null || Number.isInteger(v);
  });
  return {
    id: decl.id,
    kind: decl.kinds[0] ?? decl.id,
    nodeLabel: decl.name || decl.id,
    label: displayText(decl.label, 24),
    unit: displayText(decl.unit, 16),
    palette: decl.palette || "",
    bars,
    step: barStep(buckets, bucketStep(decl.bucket)),
    scale,
    decimals: whole ? 0 : 2,
    peak,
  };
}

/** The `peak` of a lane with no bars. It has no meaning; every reader checks `bars` first. */
const NO_BAR: LaneBar = { t: 0, value: 0, height: 0, cut: false };

/** A lane with no bars, for the one row alone that has no value for a lane the case has (section 8,
 *  Solo): `like`'s words, palette, step and number form, and its top, so the lane keeps its place
 *  and its header can name the row. It counts no bar and no largest value. */
export function emptyLaneLike(like: LaneModel): LaneModel {
  return { ...like, bars: [], scale: { top: like.scale.top, max: 0, above: 0 }, peak: NO_BAR };
}

/** The lane of one magnitude node, or null when no usable bucket remains: the lane of the
 *  declaration the node yields. `fixedTop` is `buildDeclaredLane`'s. */
export function buildLane(
  entities: readonly Entity[],
  node: ScenarioNode,
  plotPx: number = LANE_PLOT_PX,
  fixedTop?: number,
): LaneModel | null {
  return buildDeclaredLane(entities, declarationOfNode(node), plotPx, fixedTop);
}

/** The lanes of a pack: its nodes' own, in manifest order, then the lanes the manifest declares
 *  (`declared`, read as `validLanes` reads it, so that an invalid entry hides only itself and an
 *  id a node's lane has is left out). A declared lane reads rows of any kind and takes the palette
 *  of the first kind it lists. A lane with no usable row is left out. */
export function buildLanes(
  nodes: readonly ScenarioNode[],
  entities: readonly Entity[],
  declared?: unknown,
): LaneModel[] {
  const lanes: LaneModel[] = [];
  const own = magnitudeNodes(nodes);
  for (const node of own) {
    const lane = buildLane(entities, node);
    if (lane) lanes.push(lane);
  }
  for (const entry of validLanes(declared, nodes, own.map((n) => n.kind))) {
    const palette = nodes.find((n) => n.kind === entry.kinds[0])?.palette ?? "";
    const lane = buildDeclaredLane(entities, { ...entry, palette });
    if (lane) lanes.push(lane);
  }
  return lanes;
}

/** The bar whose bucket holds `at` (t <= at < t + step); the rule `magnitudeAt` has. */
export function bucketAt(lane: LaneModel, at: number): LaneBar | null {
  const bars = lane.bars;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].t <= at) lo = mid;
    else hi = mid - 1;
  }
  const bar = bars[lo];
  return bar !== undefined && bar.t <= at && at < bar.t + lane.step ? bar : null;
}

/** The rectangles of one bar: a body, and for a cut bar a 3 px cap above a 2 px gap. */
export function barPieces(bar: LaneBar, plotPx: number): readonly BarPiece[] {
  if (!bar.cut) return [{ bottom: 0, height: bar.height, cap: false }];
  return [
    { bottom: 0, height: plotPx - LANE_CUT_CAP_PX - LANE_CUT_GAP_PX, cap: false },
    { bottom: plotPx - LANE_CUT_CAP_PX, height: LANE_CUT_CAP_PX, cap: true },
  ];
}

/** A bar's width as a percent of the window; 0 when the window or the step is 0. */
export function barWidthPct(lane: LaneModel, project: TimelineProjector): number {
  const window = project.msAt(1) - project.msAt(0);
  return window > 0 && lane.step > 0 ? ((LANE_BAR_FILL * lane.step) / window) * 100 : 0;
}

const laneNumber = {
  0: new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  2: new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};
const laneNumberPlain = {
  0: new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: false }),
  2: new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }),
};
const scaleNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 2 });

/** A grouped number with exactly `decimals` decimals ("4,133.57", "12,000"). */
export function formatLaneNumber(value: number, decimals: 0 | 2): string {
  return laneNumber[decimals].format(value);
}

/** The same number with no grouping ("4133.57"), for the readout attribute. */
export function laneValueAttr(value: number, decimals: 0 | 2): string {
  return laneNumberPlain[decimals].format(value);
}

/** A scale number, compact to two significant digits ("500", "4.1K", "0.054"). */
export function formatScaleNumber(value: number): string {
  return scaleNumber.format(value);
}

const STEP_UNITS: readonly (readonly [string, number])[] = [
  ["D", 86_400_000],
  ["H", 3_600_000],
  ["M", 60_000],
  ["S", 1000],
];

/** The step as a whole number of days, hours, minutes or seconds ("1H"); "" when it is not one. */
export function formatStep(stepMs: number): string {
  if (!Number.isFinite(stepMs) || stepMs <= 0 || stepMs % 1000 !== 0) return "";
  for (const [unit, ms] of STEP_UNITS) if (stepMs % ms === 0) return `${stepMs / ms}${unit}`;
  return "";
}

/** "0 to <top>", and when bars are cut "0 to <top> · <above> over · largest <max>". */
export function laneScaleText(lane: LaneModel): string {
  const { top, above, max } = lane.scale;
  const base = `0 to ${formatScaleNumber(top)}`;
  return above > 0 ? `${base} · ${above} over · largest ${formatScaleNumber(max)}` : base;
}

/** The node's label, then the quantity's label when there is one. */
export function laneName(lane: LaneModel): string {
  return lane.label ? `${lane.nodeLabel} ${lane.label}` : lane.nodeLabel;
}

/** The plot's one spoken label: name, bar count, the largest bar with unit, when, and the time of a bar. */
export function lanePlotLabel(lane: LaneModel, formatTime: (ms: number) => string): string {
  const n = lane.bars.length;
  if (n === 0) return `${laneName(lane)}: 0 bars`;
  const unit = lane.unit ? ` ${lane.unit}` : "";
  const peak = formatLaneNumber(lane.peak.value, lane.decimals);
  return `${laneName(lane)}: ${n} ${n === 1 ? "bar" : "bars"}, largest bar ${peak}${unit} at ${formatTime(lane.peak.t)}, each bar ${stepWords(lane.step)}`;
}

/** The lanes' values at `at`, for the slider's spoken value; "" for no lanes. */
export function laneValueText(lanes: readonly LaneModel[], at: number): string {
  return lanes
    .map((lane) => {
      const bar = bucketAt(lane, at);
      if (!bar) return `, ${laneName(lane)} no data`;
      return `, ${laneName(lane)} ${formatLaneNumber(bar.value, lane.decimals)}${lane.unit ? ` ${lane.unit}` : ""}`;
    })
    .join("");
}

const COLLAPSED_MAX = 32;
const COLLAPSED_KIND_MAX = 64;

/** The folding rule: strings of 1 to 64 characters, repeats dropped, the first 32 kept. */
function cleanCollapsed(list: readonly unknown[]): string[] {
  const kept = list.filter((k): k is string => typeof k === "string" && k.length >= 1 && k.length <= COLLAPSED_KIND_MAX);
  return [...new Set(kept)].slice(0, COLLAPSED_MAX);
}

/** The saved fold list. What is read is not trusted: anything but an array gives []. */
export function parseCollapsedLanes(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? cleanCollapsed(parsed) : [];
  } catch {
    return [];
  }
}

/** The fold list as JSON, under the same rule as `parseCollapsedLanes`. */
export function serializeCollapsedLanes(kinds: readonly string[]): string {
  return JSON.stringify(cleanCollapsed(kinds));
}
