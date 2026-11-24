/**
 * LaneLines: a lane opens into lines. A triangle in
 * the name column, beside the lane's plot, reads the quantity's label and, on a second line, the
 * field the lines come from and how many there are. Pressed, a block of lines opens under the lane's
 * plot: one line for each value of that field, busiest first, each on the lane's own top, so the
 * lines add up to the lane's bar in every hour. The block shows at most DEPTH_MAX_LINES lines and
 * scrolls beyond them. It is closed until the triangle is pressed, and closed it draws no line.
 *
 * The component is given the lines (lib/lane-lines, built from the soloed row's rows when one is
 * alone, so the lines narrow with the lane) and the field's label (the manifest's `fields`), and it
 * holds no field, kind or word of a pack, no grouping and no clock. Mounted in the lane's `below`
 * slot by INT-5. The open state is the caller's when it passes `open`, and the caller learns of a
 * press by `onOpenChange`; without them the component holds it. A line's plot carries
 * `data-lane-line-plot`, so the lane check's own plot selector stays on the lane alone.
 *
 * What changes at a playhead tick is each line's line, veil and number (HeadSled and LaneFigure read
 * the playhead); the bars are memoised on the line and the projector.
 *
 * SHORTCUT: the triangle sits above the block by a negative offset of the lane's plot height, so it
 * lines up with the plot beside it and moves nothing; if the plot's height changes, this follows
 * LANE_PLOT_PX. The visual gate reads it on the page.
 */
import { memo, useId, useState, type ReactElement } from "react";
import { BAR_FOCUS_RING, DEPTH_MAX_LINES, GUTTER } from "../../lib/bar-metrics";
import type { BucketGrid } from "../../lib/head-edge";
import { LANE_LINE_PX, type LaneLine } from "../../lib/lane-lines";
import { amount, span } from "../../lib/time-words";
import { laneDepthBlockName, laneDepthTexts, laneDepthWords, laneLineWords } from "../../lib/tooltip-words/lane-depth";
import { laneBarWords } from "../../lib/tooltip-words/lane";
import {
  LANE_EDGE_VAR,
  LANE_FILL_ALPHA,
  LANE_PLOT_PX,
  barPieces,
  barWidthPct,
  cssRgb,
  lanePlotLabel,
  type LaneModel,
  type LanesSlot,
} from "../../lib/timeline-lanes";
import type { TimelineProjector } from "../../lib/timeline-projector";
import { useClockForm } from "../../store/clock-form";
import { tip } from "../ui/Tip";
import { FoldMark } from "./FoldMark";
import { HeadSled } from "./head/HeadSled";
import { LaneFigure } from "./head/LaneFigure";

export interface LaneLinesProps {
  /** The lane the lines belong to, as drawn: its label, unit, scale and palette. */
  lane: LaneModel;
  /** The lines, busiest first (`buildLaneLines`). */
  lines: readonly LaneLine[];
  /** The manifest's label for the field the lines come from, printed unchanged. */
  fieldLabel: string;
  slot: LanesSlot;
  formatTime: (ms: number) => string;
  /** The width of the name column in px; the lines' plots start after it. Default GUTTER. */
  inset?: number;
  /** The name of the one row the lane shows (solo); left out, the lines are of all rows. */
  whose?: string;
  /** The bucket grids that set where the veil starts; left out, the lane's own grid. */
  grids?: readonly BucketGrid[];
  /** The lines' plot width in px, when the caller knows it; left out, each figure reads its own box. */
  plotPx?: number;
  /** Whether the lines are open. Left out, the component holds it, closed to begin with. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** A colour of the theme's text, by its channel variable. */
const textRgb = (name: string): string => `rgb(var(${name}))`;

interface BarsProps {
  line: LaneLine;
  project: TimelineProjector;
  /** The lane's name as its own bars' words spell it. */
  laneName: string;
  unit: string;
  top: string;
}

/** One line's bars. SHORTCUT: one element per bucket in view, placed by percent, as the lane does
 *  (MagnitudeLane.tsx); it holds while a window shows a few hundred buckets for each of six lines. */
const LineBars = memo(function LineBars({ line, project, laneName, unit, top }: BarsProps) {
  const h24 = useClockForm((s) => s.h24);
  const lane = line.lane;
  const width = barWidthPct(lane, project);
  const buckets: ReactElement[] = [];
  for (const bar of lane.bars) {
    const left = project.pct(bar.t);
    if (left < 100 && left + width > 0) {
      const words = laneBarWords(laneName, line.name, span(bar.t, lane.step, h24 ? "24h" : "12h"), amount(bar.value, unit), bar.cut ? top : null);
      buckets.push(
        <div
          key={bar.t}
          data-line-bucket
          {...tip(words, cssRgb(lane.palette))}
          {...(bar.cut ? { "data-cut": "" } : {})}
          style={{ position: "absolute", top: 0, height: LANE_PLOT_PX, left: `${left}%`, width: `${width}%`, minWidth: "1px" }}
        >
          {barPieces(bar, LANE_PLOT_PX).map((piece) => (
            <div
              key={piece.cap ? "cap" : "body"}
              data-line-piece
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: piece.bottom,
                height: piece.height,
                boxSizing: "border-box",
                backgroundColor: cssRgb(lane.palette, LANE_FILL_ALPHA),
                borderStyle: "solid",
                borderColor: textRgb(LANE_EDGE_VAR),
                borderWidth: piece.cap ? "1px" : "1px 1px 0 1px",
              }}
            />
          ))}
        </div>,
      );
    }
  }
  return <>{buckets}</>;
});

interface RowProps extends BarsProps {
  fieldLabel: string;
  laneLabel: string;
  inset: number;
  grids: readonly BucketGrid[];
  plotPx: number | undefined;
  formatTime: (ms: number) => string;
  onPlotMouseDown: LanesSlot["onPlotMouseDown"];
}

/** One line: its name in the name column, and its plot. Memoised on its inputs, so a tick draws none
 *  of it again except what reads the playhead. */
const LaneLineRow = memo(function LaneLineRow(p: RowProps) {
  const { line, project, fieldLabel, laneLabel, inset } = p;
  return (
    <div data-lane-line-row={line.key} style={{ display: "flex", alignItems: "flex-start", height: LANE_LINE_PX }}>
      <div
        data-lane-line-name
        {...tip(laneLineWords(fieldLabel, line.name, laneLabel, amount(line.total, p.unit)))}
        className="font-mono text-[9px] text-text"
        style={{
          boxSizing: "border-box",
          width: inset,
          flexShrink: 0,
          paddingRight: 6,
          lineHeight: "11px",
          maxHeight: 22,
          overflow: "hidden",
          // Two lines at most; a longer name is whole in its tooltip.
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2,
          overflowWrap: "anywhere",
        }}
      >
        {line.name}
      </div>
      <div
        role="img"
        aria-label={lanePlotLabel(line.lane, p.formatTime)}
        data-lane-line-plot
        className="border-b border-panel-border cursor-pointer select-none"
        style={{ flex: "1 1 0", minWidth: 0, height: LANE_PLOT_PX, boxSizing: "content-box", position: "relative", overflow: "hidden" }}
        onMouseDown={p.onPlotMouseDown}
      >
        <LineBars line={line} project={project} laneName={p.laneName} unit={p.unit} top={p.top} />
        <HeadSled project={project} grids={p.grids} />
        <LaneFigure laneId={line.lane.id} lane={line.lane} project={project} name={line.name} plotPx={p.plotPx} />
      </div>
    </div>
  );
});

export const LaneLines = memo(function LaneLines({
  lane,
  lines,
  fieldLabel,
  slot,
  formatTime,
  inset = GUTTER,
  whose,
  grids,
  plotPx,
  open,
  onOpenChange,
}: LaneLinesProps) {
  const blockId = useId();
  const [held, setHeld] = useState(false);
  const isOpen = open ?? held;
  const count = lines.length;
  const laneLabel = lane.label || lane.nodeLabel;
  const texts = laneDepthTexts(laneLabel, fieldLabel, count);
  // The words of a bar name the lane as the lane's own bars do: its name, a dot and its quantity.
  const laneName = lane.label ? `${lane.nodeLabel} · ${lane.label}` : lane.nodeLabel;
  const ownGrids: readonly BucketGrid[] = grids ?? (lane.bars.length > 0 ? [{ step: lane.step, firstBucketStart: lane.bars[0].t }] : []);
  const press = (): void => {
    onOpenChange?.(!isOpen);
    if (open === undefined) setHeld(!isOpen);
  };
  return (
    <div data-lane-lines={lane.id} style={{ position: "relative", ...(isOpen ? {} : { height: 0 }) }}>
      <button
        type="button"
        data-lane-lines-toggle
        aria-expanded={isOpen}
        aria-controls={blockId}
        {...tip(laneDepthWords(fieldLabel, count, whose, isOpen))}
        onClick={press}
        // `uppercase` on the button itself: the app's reset sets a button's text-transform to none.
        className={`flex min-w-0 flex-col items-start justify-center overflow-hidden whitespace-nowrap text-left font-mono text-[8px] uppercase leading-[10px] tracking-[0.18em] text-text ${BAR_FOCUS_RING}`}
        style={{ position: "absolute", left: 0, top: -(LANE_PLOT_PX + 1), width: inset, height: LANE_PLOT_PX + 1 }}
      >
        <span className="flex max-w-full items-center">
          <FoldMark open={isOpen} />
          <span data-lane-lines-first className="min-w-0 truncate">
            {texts.first}
          </span>
        </span>{" "}
        <span data-lane-lines-second className="max-w-full truncate text-[color:var(--caption-on-glass)]">
          By {fieldLabel} · <span data-lane-lines-count>{count}</span>
        </span>
      </button>
      {/* The block stays in the document while closed, so `aria-controls` names an element; it draws
          no line then. It shows DEPTH_MAX_LINES lines and scrolls beyond them, and takes the focus
          when it scrolls, so the keyboard reaches the rest. */}
      <div
        id={blockId}
        hidden={!isOpen}
        role="group"
        aria-label={laneDepthBlockName(laneLabel, fieldLabel)}
        data-lane-lines-block
        tabIndex={count > DEPTH_MAX_LINES ? 0 : undefined}
        className={BAR_FOCUS_RING}
        style={{ maxHeight: DEPTH_MAX_LINES * LANE_LINE_PX, overflowY: "auto", overflowX: "hidden" }}
      >
        {isOpen
          ? lines.map((line) => (
              <LaneLineRow
                key={line.key}
                line={line}
                project={slot.project}
                laneName={laneName}
                laneLabel={laneLabel}
                unit={lane.unit}
                top={amount(lane.scale.top, lane.unit)}
                fieldLabel={fieldLabel}
                inset={inset}
                grids={ownGrids}
                plotPx={plotPx}
                formatTime={formatTime}
                onPlotMouseDown={slot.onPlotMouseDown}
              />
            ))
          : null}
      </div>
    </div>
  );
});
