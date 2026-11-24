/**
 * MagnitudeLane: one bar lane of the case timeline, for a manifest kind that declares a
 * magnitude. A 24 px header (a fold button, the scale text, the value at the playhead) over a
 * 24 px plot of bars on a 1 px baseline. The model (lib/timeline-lanes) owns the scale, the
 * pieces of a bar and its width; this file only places what the model gives.
 *
 * What changes at a playhead tick is the readout and the two marks (each reads the playhead
 * itself); the bars and the header are memoised on the lane and the projector. The lane is
 * not a control apart from its fold button: a mouse-down on the plot is the shell's, which
 * seeks and starts the scrub through the handler in the slot.
 *
 * Optional props (each left out, the lane is as it was): `inset` moves the plot
 * right and nothing else, so it lines up with the rows' plots; `whose` is the name of the one row
 * the lane shows, which the header, the group's name and the words say; `head` hands the lane the
 * head's pieces, which then draw the line and the number at the line in the plot, so the header
 * holds no readout; `below` renders after an open plot; `foldedView` renders, in place of the
 * plot, while the lane is folded. The open plot stays hidden while the lane is folded and the
 * fold button says it is not expanded; a `foldedView` is a separate element that the button's
 * `aria-controls` does not name. The lane's sentences are in lib/tooltip-words/lane.
 *
 * A lane with no bars (the one row alone has no value for it, section 8, Solo) is drawn as any
 * other: its header, the row's name and its scale, and an empty plot. It carries `data-lane-empty`.
 */
import { memo, useId, type ReactElement, type ReactNode } from "react";
import { usePlayhead } from "../../store/playhead";
import { useClockForm } from "../../store/clock-form";
import { tip } from "../ui/Tip";
import { FoldMark } from "./FoldMark";
import { HeadSled } from "./head/HeadSled";
import { LaneFigure } from "./head/LaneFigure";
import type { BucketGrid } from "../../lib/head-edge";
import { amount, span } from "../../lib/time-words";
import { laneBarWords, laneFoldWords, laneScaleWords } from "../../lib/tooltip-words/lane";
import {
  LANE_BAND_ALPHA,
  LANE_EDGE_VAR,
  LANE_FILL_ALPHA,
  LANE_LINE_VAR,
  LANE_PLOT_PX,
  barPieces,
  barWidthPct,
  bucketAt,
  cssRgb,
  formatLaneNumber,
  formatStep,
  laneName,
  lanePlotLabel,
  laneScaleText,
  laneValueAttr,
  type LaneBar,
  type LaneModel,
  type LanesSlot,
} from "../../lib/timeline-lanes";
import type { TimelineProjector } from "../../lib/timeline-projector";

interface MagnitudeLaneProps {
  lane: LaneModel;
  slot: LanesSlot;
  collapsed: boolean;
  onToggle: (kind: string) => void;
  formatTime: (ms: number) => string;
  /** Px of the plot's left offset; the header keeps the panel's left edge. 0 or left out: none. */
  inset?: number;
  /** The name of the one row the lane shows (solo); left out, the lane adds all rows. */
  whose?: string;
  /** The head's pieces: the grids of every lane the pack draws, which the line's veil reads. */
  head?: { grids: readonly BucketGrid[] };
  /** Rendered after the plot while the lane is open (the lane's lines open into it). */
  below?: ReactNode;
  /** Rendered while the lane is folded: the lane's small version. */
  foldedView?: ReactNode;
}

/** A colour of the theme's text, by its channel variable, at an optional alpha. */
const textRgb = (name: string, alpha?: number): string =>
  alpha === undefined ? `rgb(var(${name}))` : `rgb(var(${name}) / ${alpha})`;

const DOT = "·";

/** The value at the playhead, or a hyphen (spoken as "no data at playhead") in no bucket. It is
 *  plain text and not a live region, which would speak at every tick of playback. Its two inner
 *  spans are always rendered, so the elements stay put as the playhead crosses a gap. */
function LaneReadout({ lane }: { lane: LaneModel }) {
  const playhead = usePlayhead((s) => s.playhead);
  const bar = bucketAt(lane, playhead);
  return (
    <span
      data-magnitude-readout
      {...(bar ? { "data-magnitude-value": laneValueAttr(bar.value, lane.decimals) } : { "data-empty": "" })}
      className="ml-auto shrink-0 font-mono text-[9px] tabular-nums text-text"
    >
      <span aria-hidden={bar ? undefined : "true"}>{bar ? formatLaneNumber(bar.value, lane.decimals) : "-"}</span>
      <span className="sr-only">{bar ? "" : "no data at playhead"}</span>
    </span>
  );
}

interface BucketProps {
  bar: LaneBar;
  lane: LaneModel;
  left: number;
  width: number;
  /** The words of the bar (lib/tooltip-words/lane), built once for the lane, not at a tick. */
  words: readonly string[];
}

/** One bucket. SHORTCUT: one element per bucket (a wrapper and its pieces), placed by percent.
 *  It holds while a window shows a few hundred buckets; a pack with tens of thousands of
 *  buckets in view would want a canvas or a decimated series instead. */
function Bucket({ bar, lane, left, width, words }: BucketProps) {
  return (
    <div
      data-bucket
      {...tip(words, cssRgb(lane.palette))}
      {...(bar.cut ? { "data-cut": "" } : {})}
      style={{ position: "absolute", top: 0, height: LANE_PLOT_PX, left: `${left}%`, width: `${width}%`, minWidth: "1px" }}
    >
      {barPieces(bar, LANE_PLOT_PX).map((piece) => (
        <div
          key={piece.cap ? "cap" : "body"}
          data-bar-piece
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
            // A piece on the baseline has no bottom edge (a 1 px bar is one row, not two).
            borderWidth: piece.cap ? "1px" : "1px 1px 0 1px",
          }}
        />
      ))}
    </div>
  );
}

/** The lane's name as the words spell it: the node's label, a dot and the quantity's label. */
const tipNameOf = (lane: LaneModel): string => (lane.label ? `${lane.nodeLabel} · ${lane.label}` : lane.nodeLabel);

const LaneBars = memo(function LaneBars({ lane, project, whose }: { lane: LaneModel; project: TimelineProjector; whose: string | undefined }) {
  const width = barWidthPct(lane, project);
  // The hour in a bar's words follows the clock's switch. Only the bars in the window
  // are given words, and they are built when the lane, the window, the row or the form changes.
  const h24 = useClockForm((s) => s.h24);
  const name = tipNameOf(lane);
  const top = amount(lane.scale.top, lane.unit);
  const buckets: ReactElement[] = [];
  for (const bar of lane.bars) {
    const left = project.pct(bar.t);
    // Reaches into the window: its own left edge under 100 and its own right edge above 0.
    if (left < 100 && left + width > 0) {
      const words = laneBarWords(name, whose, span(bar.t, lane.step, h24 ? "24h" : "12h"), amount(bar.value, lane.unit), bar.cut ? top : null);
      buckets.push(<Bucket key={bar.t} bar={bar} lane={lane} left={left} width={width} words={words} />);
    }
  }
  return <>{buckets}</>;
});

/** The playhead's line and the band over its bucket. Both stay in the document and are shown or
 *  hidden by style, so nothing is measured again at a tick. */
function LaneCursor({ lane, project }: { lane: LaneModel; project: TimelineProjector }) {
  const playhead = usePlayhead((s) => s.playhead);
  const at = project.pct(playhead);
  const inside = at >= 0 && at <= 100;
  const bar = bucketAt(lane, playhead);
  const bandLeft = bar ? project.pct(bar.t) : 0;
  // The band's width is the whole step through the projector, not the bar's 85 percent.
  const bandWidth = bar ? project.pct(bar.t + lane.step) - bandLeft : 0;
  return (
    <>
      <div
        data-lane-line
        style={{
          position: "absolute",
          top: 0,
          height: "100%",
          width: "1px",
          // At the window's end the line would start on the plot's right edge and be clipped;
          // it stays on the plot's last pixel there instead.
          left: at >= 100 ? "calc(100% - 1px)" : `${at}%`,
          backgroundColor: textRgb(LANE_LINE_VAR),
          pointerEvents: "none",
          visibility: inside ? "visible" : "hidden",
        }}
      />
      <div
        data-lane-band
        style={{
          position: "absolute",
          top: 0,
          height: "100%",
          left: `${bandLeft}%`,
          width: `${bandWidth}%`,
          minWidth: "2px",
          backgroundColor: textRgb(LANE_LINE_VAR, LANE_BAND_ALPHA),
          pointerEvents: "none",
          visibility: inside && bar ? "visible" : "hidden",
        }}
      />
    </>
  );
}

/** Separator between two neighbouring parts of the button: aria-hidden, a space as text on each
 *  side, so the spoken name reads as words and not as one. */
function Sep({ mark }: { mark: string }) {
  return (
    <>
      {" "}
      <span aria-hidden="true" className="shrink-0">
        {mark}
      </span>{" "}
    </>
  );
}

export const MagnitudeLane = memo(function MagnitudeLane({ lane, slot, collapsed, onToggle, formatTime, inset = 0, whose, head, below, foldedView }: MagnitudeLaneProps) {
  const plotId = useId();
  const step = formatStep(lane.step);
  const name = tipNameOf(lane);
  return (
    <div
      role="group"
      aria-label={whose ? `${laneName(lane)}, ${whose} alone` : laneName(lane)}
      data-magnitude-lane={lane.id}
      {...(whose ? { "data-lane-whose": whose } : {})}
      {...(lane.bars.length === 0 ? { "data-lane-empty": "" } : {})}
      style={{ marginTop: 4 }}
    >
      {/* gap-4: the scale text sits apart from the button's step, so the step and "0 to <top>" do not read as one run. */}
      <div data-magnitude-header className="flex h-6 items-center gap-4 font-mono text-[8px] uppercase tracking-[0.18em]">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={plotId}
          {...tip(laneFoldWords(name, lane.unit, step, whose, !collapsed))}
          onClick={() => onToggle(lane.kind)}
          // `uppercase` again here: the app's reset sets a button's text-transform to none.
          className="flex h-6 min-w-0 items-center whitespace-nowrap uppercase text-text"
        >
          <FoldMark open={!collapsed} />
          <span data-magnitude-node className="min-w-0 truncate">
            {lane.nodeLabel}
          </span>
          {/* One inline run for the rest: a space between flex items is not laid out, inside a run it is. */}
          <span className="shrink-0 whitespace-pre">
          {lane.label ? (
            <>
              <Sep mark={DOT} />
              <span data-magnitude-label className="shrink-0">
                {lane.label}
              </span>
            </>
          ) : null}
          {lane.unit ? (
            <>
              <Sep mark={DOT} />
              <span data-magnitude-unit className="shrink-0">
                {lane.unit}
              </span>
            </>
          ) : null}
          {step ? (
            <>
              <Sep mark={lane.unit ? "/" : DOT} />
              <span data-magnitude-step className="shrink-0">
                {step}
              </span>
            </>
          ) : null}
          </span>
          {/* The one row the lane shows: it is cut by the box, and its whole name is in the group's name and the button's words. */}
          {whose ? (
            <>
              <span className="shrink-0 whitespace-pre">
                <Sep mark={DOT} />
              </span>
              <span data-magnitude-whose className="min-w-0 truncate">
                {whose}
              </span>
            </>
          ) : null}
        </button>
        {collapsed ? null : (
          <span
            data-magnitude-scale
            {...tip(laneScaleWords(amount(lane.scale.top, lane.unit), lane.scale.above, amount(lane.scale.max, lane.unit)))}
            className="shrink-0 whitespace-nowrap text-[color:var(--caption-on-glass)]"
          >
            {laneScaleText(lane)}
          </span>
        )}
        {head ? null : <LaneReadout lane={lane} />}
      </div>
      {/* The baseline is the plot's bottom border (classes, so no colour variable is written here);
          the content box keeps it outside the plot's 24 px, and it goes when the plot is hidden. */}
      <div
        id={plotId}
        hidden={collapsed}
        role="img"
        aria-label={lanePlotLabel(lane, formatTime)}
        data-magnitude-plot
        // cursor-pointer and select-none as on the track: a mouse-down here seeks and scrubs.
        className="border-b border-panel-border cursor-pointer select-none"
        // The inset moves the plot alone, by its own margin: the header and the bars' percents stay.
        style={{ height: LANE_PLOT_PX, boxSizing: "content-box", position: "relative", overflow: "hidden", ...(inset > 0 ? { marginLeft: inset } : {}) }}
        onMouseDown={slot.onPlotMouseDown}
      >
        <LaneBars lane={lane} project={slot.project} whose={whose} />
        {/* With the head's pieces the plot draws the head's line and the lane's number at it; without them, its own line and band. */}
        {head ? (
          <>
            <HeadSled project={slot.project} grids={head.grids} />
            <LaneFigure laneId={lane.id} lane={lane} project={slot.project} name={name} />
          </>
        ) : (
          <LaneCursor lane={lane} project={slot.project} />
        )}
      </div>
      {/* The slots. Both stay out of the plot: `foldedView` is not what `aria-controls` names, and
          the open plot above stays hidden while the lane is folded. */}
      {collapsed && foldedView !== undefined ? <div data-lane-folded-view>{foldedView}</div> : null}
      {collapsed ? null : below}
    </div>
  );
});
