// frontend/investigator/src/lib/head-edge.ts
// The two pure rules of the head, the pieces of the bar
// that go with the playhead. Both are functions of the playhead and of numbers handed in; neither
// reads a clock, the DOM or a lane model. A lane is known here only by its grid.

/** One lane's bucket grid: the step of its buckets and where its first bucket starts. */
export interface BucketGrid {
  step: number;
  firstBucketStart: number;
}

/**
 * Where the faint part starts: the latest end, over the grids, of the bucket that holds
 * the playhead on that grid. A bucket is `t <= playhead < t + step`, so a playhead exactly on a
 * bucket's start is in that bucket and the edge is a step on. A grid whose step is not above zero
 * is skipped, and with no grid the edge is the playhead.
 */
export function headEdge(playhead: number, grids: readonly BucketGrid[]): number {
  let edge = playhead;
  let found = false;
  for (const { step, firstBucketStart } of grids) {
    if (!(step > 0)) continue;
    const end = firstBucketStart + (Math.floor((playhead - firstBucketStart) / step) + 1) * step;
    if (!found || end > edge) edge = end;
    found = true;
  }
  return edge;
}

/** The advance of one character of the face the bar's figures use, in em, as measured. */
export const FIGURE_ADVANCE_EM = 0.632;

/** The width of a number's box in px: its characters at the face's advance, its padding (both
 *  sides together) and its gap from the line. */
export function figureWidthPx(chars: number, fontPx: number, padPx: number, gapPx: number): number {
  return chars * FIGURE_ADVANCE_EM * fontPx + padPx + gapPx;
}

export type FigureSide = "left" | "right";

export interface FigureSideInput {
  playhead: number;
  /** The start of the bar the number is the value of, and its step. */
  barStart: number;
  step: number;
  /** The line's place along the plot and the plot's width, in px; 0 for a width not yet known. */
  linePx: number;
  plotPx: number;
  /** The number's box, as `figureWidthPx` gives it. */
  figurePx: number;
}

/**
 * Which side of the line a number stands on. Left in the second half of its own bar's
 * step, which begins at exactly half the step; right in the first half; and left wherever its
 * width would pass the plot's right end. While the plot's width is unknown the right-end rule
 * waits, so a number is never moved by a width nobody has read.
 */
export function figureSide(input: FigureSideInput): FigureSide {
  const { playhead, barStart, step, linePx, plotPx, figurePx } = input;
  if (step > 0 && (playhead - barStart) / step >= 0.5) return "left";
  if (plotPx > 0 && linePx + figurePx > plotPx) return "left";
  return "right";
}
