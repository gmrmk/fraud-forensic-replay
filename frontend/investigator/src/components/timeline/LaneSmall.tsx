/**
 * LaneSmall: the folded lane's small version: the lane keeps its bars and its number at the line, on one line of 25 px. The
 * name stands in the name column, with the unit, the step and the plot's range under it, and the
 * plot stands beside it, so a folded lane reads as one more row.
 *
 * It is a whole piece and not a part of `MagnitudeLane`, which is not edited: it draws its own
 * bars (the lane model gives the pieces, as the open lane takes them), the head's line and veil
 * (`HeadSled`) and the number at the line (`LaneFigure`).
 * What changes at a playhead tick is in those two alone; the bars and the name are memoised on the
 * lane and the projector, and this file reads no playhead and no clock.
 *
 * The small version is not the open plot: it carries `data-lane-small-plot` and never
 * `data-magnitude-plot`, which is the lane check's selector for an open plot. The name button
 * reads as not expanded, since the open plot stays hidden, and it names no element with
 * `aria-controls` unless its owner passes the id of the open plot. Its tooltip is its description,
 * so the words that say how many bars the plot cuts are reached by keyboard focus and not by
 * hover alone. The name button carries the one closed fold mark (`FoldMark`), the same drawing the
 * open lane's button turns a quarter turn.
 *
 * Not yet mounted: `MagnitudeLane` takes a small version through its `foldedView` slot, and the
 * mount (INT-5) decides what becomes of the header's own fold button above it.
 */
import { memo, type ReactElement } from "react";
import { tip } from "../ui/Tip";
import { BAR_FOCUS_RING, GUTTER } from "../../lib/bar-metrics";
import { SMALL_LABEL_GAP_PX } from "../../lib/bar-metrics-small";
import { HeadSled } from "./head/HeadSled";
import { LaneFigure } from "./head/LaneFigure";
import { FoldMark } from "./FoldMark";
import type { BucketGrid } from "../../lib/head-edge";
import { amount, span } from "../../lib/time-words";
import { foldTail } from "../../lib/tooltip-words/head";
import { laneBarWords } from "../../lib/tooltip-words/lane";
import { LANE_PART, laneSmallWords } from "../../lib/tooltip-words/lane-small";
import {
  LANE_EDGE_VAR,
  LANE_FILL_ALPHA,
  LANE_PLOT_PX,
  barPieces,
  barWidthPct,
  cssRgb,
  formatScaleNumber,
  formatStep,
  lanePlotLabel,
  type LaneBar,
  type LaneModel,
  type LanesSlot,
} from "../../lib/timeline-lanes";
import type { TimelineProjector } from "../../lib/timeline-projector";
import { useClockForm } from "../../store/clock-form";

interface LaneSmallProps {
  lane: LaneModel;
  slot: LanesSlot;
  /** Opens the lane; it is given the lane's kind, as the open lane's own button gives it. */
  onToggle: (kind: string) => void;
  /** The head's pieces: the grids of every lane the pack draws, which the line's veil reads. */
  head: { grids: readonly BucketGrid[] };
  formatTime: (ms: number) => string;
  /** Px of the name column; the plot starts after it. Left out, the open bar's name column. */
  inset?: number;
  /** The name of the one row the lane shows alone; left out, the lane adds all rows. */
  whose?: string;
  /** The id of the open plot, when its owner has one in the document. Left out, no `aria-controls`
   *  is written, since a control may not name an element that is not there. */
  controls?: string;
  /** The plot's width in px, when its owner knows it. Left out, the number reads the width from
   *  the page. */
  plotPx?: number;
}

/** The lane's name as the words spell it: the node's label, a dot and the quantity's label. */
const nameOf = (lane: LaneModel): string => (lane.label ? `${lane.nodeLabel} · ${lane.label}` : lane.nodeLabel);

interface BarProps {
  bar: LaneBar;
  lane: LaneModel;
  left: number;
  width: number;
  words: readonly string[];
}

/** One bar: a wrapper and its pieces, placed by percent, as the open lane places them (the same
 *  SHORTCUT and the same limit: one element per bar holds while a window shows a few hundred). */
function Bar({ bar, lane, left, width, words }: BarProps) {
  return (
    <div
      data-lane-small-bar
      {...tip(words, cssRgb(lane.palette))}
      {...(bar.cut ? { "data-lane-small-cut": "" } : {})}
      style={{ position: "absolute", top: 0, height: LANE_PLOT_PX, left: `${left}%`, width: `${width}%`, minWidth: "1px" }}
    >
      {barPieces(bar, LANE_PLOT_PX).map((piece) => (
        <div
          key={piece.cap ? "cap" : "body"}
          data-lane-small-piece
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: piece.bottom,
            height: piece.height,
            boxSizing: "border-box",
            backgroundColor: cssRgb(lane.palette, LANE_FILL_ALPHA),
            borderStyle: "solid",
            borderColor: `rgb(var(${LANE_EDGE_VAR}))`,
            // A piece on the baseline has no bottom edge (a 1 px bar is one row, not two).
            borderWidth: piece.cap ? "1px" : "1px 1px 0 1px",
          }}
        />
      ))}
    </div>
  );
}

const SmallBars = memo(function SmallBars({ lane, project, whose }: { lane: LaneModel; project: TimelineProjector; whose: string | undefined }) {
  const width = barWidthPct(lane, project);
  // The hour in a bar's words follows the clock's switch. It is a setting, not a tick.
  const h24 = useClockForm((s) => s.h24);
  const name = nameOf(lane);
  const top = amount(lane.scale.top, lane.unit);
  const bars: ReactElement[] = [];
  for (const bar of lane.bars) {
    const left = project.pct(bar.t);
    // Reaches into the window: its own left edge under 100 and its own right edge above 0.
    if (left < 100 && left + width > 0) {
      const words = laneBarWords(name, whose, span(bar.t, lane.step, h24 ? "24h" : "12h"), amount(bar.value, lane.unit), bar.cut ? top : null);
      bars.push(<Bar key={bar.t} bar={bar} lane={lane} left={left} width={width} words={words} />);
    }
  }
  return <>{bars}</>;
});

export const LaneSmall = memo(function LaneSmall({ lane, slot, onToggle, head, formatTime, inset = GUTTER, whose, controls, plotPx }: LaneSmallProps) {
  const step = formatStep(lane.step);
  const name = nameOf(lane);
  const words = laneSmallWords(name, lane.unit, step, whose, amount(lane.scale.top, lane.unit), lane.scale.above, amount(lane.scale.max, lane.unit));
  return (
    <div data-lane-small={lane.id} {...(whose ? { "data-lane-small-whose": whose } : {})} className="flex">
      <div className="shrink-0 font-mono text-[8px] uppercase tracking-[0.18em]" style={{ width: inset, height: LANE_PLOT_PX + 1 }}>
        <button
          type="button"
          data-lane-small-name
          aria-expanded={false}
          {...(controls ? { "aria-controls": controls } : {})}
          {...tip(words)}
          onClick={() => onToggle(lane.kind)}
          // `uppercase` again here: the app's reset sets a button's text-transform to none.
          className={`flex h-3 w-full min-w-0 items-center whitespace-nowrap uppercase leading-3 text-text ${BAR_FOCUS_RING}`}
        >
          <FoldMark open={false} />
          {/* While one row is alone the first line is that row's name: it says whose bars these are.
              One line, cut with an ellipsis, held SMALL_LABEL_GAP_PX short of the plot. The gap is the
              span's own padding (the button has none) because the lane check takes a label's end as
              its box's right edge less its own padding. The whole name stays in the tooltip. */}
          <span className="min-w-0 truncate" style={{ paddingRight: SMALL_LABEL_GAP_PX }}>
            {whose ?? name}
          </span>
          <span data-lane-small-words className="sr-only">
            {" "}
            {foldTail("small", LANE_PART)}
          </span>
        </button>
        {/* The unit, the step and the plot's range, so the scale stays on screen. How many bars the
            plot cuts, and the largest, are in the button's words. */}
        <div data-lane-small-range className="h-3 truncate whitespace-nowrap pl-[11px] leading-3 text-[color:var(--caption-on-glass)]" style={{ paddingRight: SMALL_LABEL_GAP_PX }}>
          {`${lane.unit}${step ? `${lane.unit ? " / " : ""}${step}` : ""} · 0 to ${formatScaleNumber(lane.scale.top)}`}
        </div>
      </div>
      <div
        role="img"
        aria-label={lanePlotLabel(lane, formatTime)}
        data-lane-small-plot
        // cursor-pointer and select-none as on the open plot: a mouse-down here seeks and scrubs.
        className="min-w-0 flex-1 border-b border-panel-border cursor-pointer select-none"
        style={{ height: LANE_PLOT_PX, boxSizing: "content-box", position: "relative", overflow: "hidden" }}
        onMouseDown={slot.onPlotMouseDown}
      >
        <SmallBars lane={lane} project={slot.project} whose={whose} />
        <HeadSled project={slot.project} grids={head.grids} />
        <LaneFigure laneId={lane.id} lane={lane} project={slot.project} name={name} {...(plotPx !== undefined ? { plotPx } : {})} />
      </div>
    </div>
  );
});
