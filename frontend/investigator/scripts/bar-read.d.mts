/** Types for bar-read.mjs, so a test under src/ can import the page readers with `tsc -b` clean. */

export interface Box {
  left: number;
  width: number;
}

export interface Readout {
  at: number | null;
  empty: boolean | null;
  value: number | null;
}

export const BAR: string;
export const SLIDER: string;
export const FOLD_BUTTON: string;
export const ROW_SELECTOR: string;
export function trackNodeSelector(kinds: readonly string[]): string;

export function readControls(args: { bar: string }): { total: number; missing: string[] };

export interface LaneRead {
  present: boolean;
  nodeLabel: string | null;
  label: string | null;
  unit: string | null;
  readout: Readout | null;
  plot: Box | null;
  track: Box | null;
  rowsPlot: Box | null;
  barsOutside: number | null;
  order: string | null;
  tabIndex: number | null;
  focused: boolean | null;
}
export function readLane(args: { id: string; slider: string }): LaneRead;

export function readFold(args: { id: string }): {
  expanded: boolean | null;
  plotHidden: boolean | null;
  small: boolean | null;
  height: number | null;
  stack: number | null;
};

export interface LaneSmallRead {
  id: string;
  drawn: boolean;
  plot: Box | null;
  gap: number | null;
  readout: Readout | null;
}
export interface RowsSmallRead {
  drawn: boolean;
  after: boolean;
  expanded: boolean | null;
  plot: Box | null;
  track: Box | null;
  gap: number | null;
  figure: boolean;
}
export interface SmallsRead {
  rows: RowsSmallRead | null;
  lanes: LaneSmallRead[];
  strip: Box | null;
  stackDrawn: boolean;
}
export function readSmalls(args: { slider: string; scope?: string }): SmallsRead;

export interface HeightsRead {
  panel: number | null;
  stack: number | null;
  stackGone: boolean;
  smalls: number | null;
}
export function readHeights(args: { bar: string }): HeightsRead;

export function readDepth(args: { slider: string; options: readonly string[] }): { opened: boolean; lines: number; aligned: boolean; outside: number };

export interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export function readBar(args: { bar: string }): {
  bar: Edges | null;
  inspector: Edges | null;
  logs: Edges[];
  marker: { x: number; y: number } | null;
  credit: Edges | null;
};

/** What the opening moment draws for a pack with no place: the kind of each track node, and the rows. */
export function readPlace(): { kinds: string[]; rows: number };

export function stackFact(
  smalls: SmallsRead,
  stackPanel: number | null,
  one: { stackGone: boolean; smalls: number | null; panel: number | null },
): {
  drawn: boolean;
  rows: number;
  lanes: string[];
  plots: Array<Box | null>;
  strip: Box | null;
  gaps: Array<number | null>;
  oneLine: { stackGone: boolean; smalls: number | null; panel: number | null; stackPanel: number | null };
};
