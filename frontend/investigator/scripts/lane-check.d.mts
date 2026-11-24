/** Types for lane-check.mjs, so a test under src/ can import it with `tsc -b` clean. */

/** One row of a kind, as the exported entity files hold it. */
export type LaneRow = Record<string, unknown>;

/** A manifest node, as far as the lane check reads it. */
export interface LaneNode {
  kind: string;
  source?: string;
  label?: string;
  timestamp?: string;
  magnitude?: string;
  magnitudeLabel?: unknown;
  magnitudeUnit?: unknown;
  decision?: unknown;
  [key: string]: unknown;
}

/** A root lane entry that passed the declaration's table. */
export interface ValidLane {
  id: string;
  name: string;
  label: string;
  unit: string;
  kinds: string[];
  field: string;
  bucket: 'hour';
  aggregate: 'sum' | 'max';
}

export interface Bucket {
  t: number;
  sum: number;
}

export type Readout = { empty: true } | { empty: false; value: number };

export interface ExpectedLane {
  /** The lane's identity: a node's kind for a node's own lane, the declared id for a root lane. */
  id: string;
  /** The first kind the lane reads. */
  kind: string;
  nodeLabel: string;
  label: string | null;
  unit: string | null;
  buckets: Bucket[];
  step: number;
  peak: Bucket;
  /** An instant inside the peak bucket that a row of the case holds, so it lies in the case's span. */
  opening: number;
  /** True when the pack declares rows, so the bar must draw the rows section. */
  named: boolean;
}

/** The number at the line as the page shows it at the slider's instant. */
export interface ReadoutFact {
  at: number | null;
  empty: boolean | null;
  value: number | null;
}

export interface BoxFact {
  left: number | null;
  width: number | null;
}

/** The folded lane's small version: whether its plot is drawn, the plot's box, the least gap in px between its labels and the plot, and the number at the line. */
export interface SmallLaneFact {
  drawn: boolean | null;
  plot: BoxFact | null;
  gap: number | null;
  readout: ReadoutFact | null;
}

/** What the crawl read from one lane. A fact that could not be read is null. */
export interface LaneFacts {
  id: string;
  nodeLabel: string | null;
  label: string | null;
  unit: string | null;
  atPeak: ReadoutFact | null;
  atEnd: ReadoutFact | null;
  plot: BoxFact | null;
  track: BoxFact | null;
  /** The rows' plot (the first `[data-track-plot]`), or null when the page draws no rows. */
  rowsPlot: BoxFact | null;
  barsOutside: number | null;
  order: string | null;
  tabIndex: number | null;
  focused: boolean | null;
  fold: {
    expanded: boolean | null;
    /** The open plot is hidden or not in the document, with a small version in its place; null when neither was found. */
    plotHidden: boolean | null;
    /** The small version's plot is drawn after the fold. */
    small: boolean | null;
    laneDrop: number | null;
    stackDrop: number | null;
  } | null;
  /** The folded lane's small version, read after the fold. */
  small: SmallLaneFact | null;
  afterReload: { expanded: boolean | null } | null;
  unfold: { expanded: boolean | null; plotHidden: boolean | null } | null;
}

/** A rectangle in page pixels. */
export interface RectFact {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What the crawl read at one window size, with the rows open. `null` is a fact that was not read;
 *  `logs` is the list of the log's boxes, empty when the page draws none. `marker` is the point the
 *  map writes for the selected record, in viewport pixels; `placed` is whether that record has a
 *  place (`false`: no mark, so no point is expected; `null`: its row was not found). */
export interface BarFact {
  size: string;
  bar: RectFact | null;
  inspector: RectFact | null;
  logs: RectFact[] | null;
  marker: { x: number; y: number } | null;
  placed: boolean | null;
  credit: RectFact | null;
}

/** Every `aria-controls` found on the bar and the ids among them that name nothing. */
export interface ControlsFact {
  total: number;
  missing: string[];
}

/** The rows' small version, read with the rows folded. `after` is whether it follows the rows in the document. */
export interface RowsSmallFact {
  drawn: boolean | null;
  after: boolean | null;
  expanded: boolean | null;
  plot: BoxFact | null;
  track: BoxFact | null;
  gap: number | null;
  figure: boolean | null;
}

/** The Timeline folded once (a line for each section) and then once more (one line). */
export interface StackFact {
  drawn: boolean | null;
  /** How many rows' small versions the stack holds. */
  rows: number | null;
  /** The ids of the lanes' small versions, in the order drawn. */
  lanes: string[] | null;
  /** The plots of the stack's small versions, the rows' first. */
  plots: BoxFact[] | null;
  /** The Timeline strip's box. */
  strip: BoxFact | null;
  /** The least label gap of each small version in the stack. */
  gaps: (number | null)[] | null;
  oneLine: { stackGone: boolean | null; smalls: number | null; panel: number | null; stackPanel: number | null } | null;
}

export interface SectionFacts {
  rows: RowsSmallFact | null;
  stack: StackFact | null;
}

/** One reading of the bar with a depth option open: `lane:<id>`, `kinds` or `all`. */
export interface DepthFact extends BarFact {
  option: string;
  opened: boolean | null;
  lines: number | null;
  aligned: boolean | null;
  outside: number | null;
  panel: number | null;
  stack: number | null;
}

/** What the manifest says the bar must offer. */
export interface ExpectedBar {
  rows: boolean;
  stack: boolean;
  lanes: string[];
  depths: string[];
}

export interface PageFacts {
  ids: string[];
  lanes: LaneFacts[];
  bars: BarFact[] | null;
  controls: ControlsFact | null;
  sections: SectionFacts | null;
  depths: DepthFact[] | null;
}

export interface LaneProblem {
  rule: string;
  /** The lane's id, or '' for a rule about the page. */
  id: string;
  what: string;
}

export const BAR_SIZES: readonly string[];
export const SHARE: number;
export const LABEL_GAP_PX: number;
export const ONE_LINE_PX: number;
export function laneNodes(nodes: readonly LaneNode[]): LaneNode[];
export function declaredLanes(declared: unknown, nodes: readonly LaneNode[], taken?: readonly string[]): ValidLane[];
export function bucketsOf(rows: readonly LaneRow[], node: LaneNode, step?: number, aggregate?: 'sum' | 'max'): Bucket[];
export function stepOf(buckets: readonly Bucket[]): number;
export function expectedReadout(buckets: readonly Bucket[], step: number, at: number): Readout;
export function expectedLanes(
  nodes: readonly LaneNode[],
  rowsByKind: Readonly<Record<string, readonly LaneRow[]>>,
  declared?: unknown,
  rowsDeclared?: boolean,
): ExpectedLane[];
/** The kinds whose rows the page's lanes read: what the crawl must fetch. */
export function kindsToFetch(nodes: readonly LaneNode[], declared?: unknown): string[];
export const LANE_RULES: Readonly<Record<string, string>>;

/** A leg of a rule that is not judged yet: neither a failure nor a pass. */
export interface WaitingLeg {
  rule: string;
  leg: string;
  reason: string;
}

export interface LaneVerdict {
  problems: LaneProblem[];
  waits: WaitingLeg[];
}

/** A manifest node, as far as `findPlace` reads it. */
export interface PlaceNode {
  kind: string;
  source?: string;
  coords?: { lat: string; lng: string };
}

/** Runs in the page: whether the record `sel` names has a place; `null` when no list holds its row. */
export function findPlace(args: { sel: string | null; nodes: readonly PlaceNode[] }): Promise<boolean | null>;

/** The legs that wait, leg name to what it waits on. */
export const WAITING_LEGS: Readonly<Record<string, string>>;
export function laneVerdict(facts: PageFacts, expected: readonly ExpectedLane[], waiting?: Readonly<Record<string, string>>, bar?: ExpectedBar | null): LaneVerdict;
export function laneProblems(facts: PageFacts, expected: readonly ExpectedLane[], waiting?: Readonly<Record<string, string>>, bar?: ExpectedBar | null): LaneProblem[];
/** What the manifest says the bar must offer: the rows' small version, a line for each section, each depth. */
export function expectedBar(expected: readonly ExpectedLane[], nodes: readonly LaneNode[], declared: unknown, fields: unknown, rowsDeclared: boolean): ExpectedBar;
/** The printout of the bar's heights with each depth open; its problems are an option not read or a height that is not a number. */
export function barHeights(depths: readonly DepthFact[] | null, options: readonly string[]): { lines: string[]; problems: string[] };
/** The rules of a pack with no place, rule id to its sentence. */
export const PLACE_RULES: Readonly<Record<string, string>>;
/** What the manifest says the opening moment shows: whether a node has a place, the decision kinds, and rows. */
export interface ExpectedPlace {
  placed: boolean;
  decisions: string[];
  rows: boolean;
}
/** What readPlace gives: the kind of each track node and the number of rows. */
export interface PlaceFacts {
  kinds: string[];
  rows: number;
}
export function expectedPlace(nodes: readonly LaneNode[], rowsDeclared: boolean): ExpectedPlace;
export function placeProblems(facts: PlaceFacts | null, expected: ExpectedPlace): LaneProblem[];
export function placeNote(facts: PlaceFacts, expected: ExpectedPlace): string;
/** The reading of the due rule: press End before the wait for a decision, or keep the wait at the opening moment. */
export type MarkDue = "end" | "opening";
/** The two failure texts of the capsule-or-flag wait, by the due reading. */
export const MARK_RULES: Readonly<Record<MarkDue, string>>;
/** What `markDue` reads; any fact may be missing, and a missing fact gives `'opening'`. */
export interface MarkFacts {
  rules?: unknown;
  decided?: unknown;
  now?: unknown;
}
/** `'end'` only for a pack with no rule whose every decision time (milliseconds) is later than the playhead's number. */
export function markDue(facts?: MarkFacts | null): MarkDue;
/** The words the section's PASS line carries for the `'end'` reading; `undefined` for `'opening'`. */
export function markNote(due: MarkDue): string | undefined;
/** Runs in the page: each decision row's time in milliseconds (NaN when it does not parse) and the slider's number. */
export function readDecided(args: { nodes: readonly (PlaceNode & { timestamp?: string; decision?: unknown })[]; slider: string }): Promise<{ decided: number[]; now: number }>;
export function waitLine(where: string, wait: WaitingLeg): string;
/** A leg of the bar rule that the page cannot give, with its reason. */
export interface InapplicableLeg {
  leg: string;
  reason: string;
}
/** A reading of the open bar, as far as `inapplicableLegs` reads it. */
export interface PlacedReading {
  placed: boolean | null;
}
export function inapplicableLegs(readings: readonly (PlacedReading | null | undefined)[]): InapplicableLeg[];
export function passNote(waits: readonly WaitingLeg[], skipped?: readonly InapplicableLeg[]): string;
/** The key that chooses a record: `,` only when nothing can be stepped to, else `.`. */
export function stepKey(state: { now: number; max: number; selected: boolean }): "," | ".";
export function summaryLine(failureCount: number, waitCount: number): string;
