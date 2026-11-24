// frontend/investigator/src/components/timeline/rows/RowsSmall.tsx
// The folded rows' small version (how many rows are active each hour). It stands where the rows' list stood, on the track's own
// time scale, with the head's line through it: one grey bar for each hour (or each day, for a story
// with no hour), as high as that step's count of active rows against the largest count of the whole
// case, and the number at the line. Under a solo it counts that row's own events.
//
// Only the number at the line reads the playhead; the bars are a function of the data, the window
// and the clock's form, so a tick redraws none of them. When the folded
// Timeline gives each section a line of its own, the line carries the
// rows' button itself, and `onOpen` is that button's press.
import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { BAR_FOCUS_RING, GUTTER } from "../../../lib/bar-metrics";
import { SMALL_LABEL_GAP_PX, SMALL_PLOT_PX } from "../../../lib/bar-metrics-small";
import { ROWS_FOLD } from "../../../lib/bar-settings";
import { figureSide, figureWidthPx, type BucketGrid } from "../../../lib/head-edge";
import { rowsCountName, type RowTick } from "../../../lib/row-ticks";
import { barHeightPx, buildCountModel, cellAt, countFigureText, countLabelText, type CountModel } from "../../../lib/rows-small";
import { span, type TimeForm } from "../../../lib/time-words";
import { LANE_BAR_FILL, type LanesSlot } from "../../../lib/timeline-lanes";
import type { TimelineProjector } from "../../../lib/timeline-projector";
import { foldTail } from "../../../lib/tooltip-words/head";
import { countBarWords, countFigureWords, countLabelWords, dayWords, rowsFoldSmallWords } from "../../../lib/tooltip-words/rows-small";
import type { TrackSet } from "../../../lib/tracks";
import { useClockForm } from "../../../store/clock-form";
import { usePlayhead } from "../../../store/playhead";
import { tip } from "../../ui/Tip";
import { FoldMark } from "../FoldMark";
import { HeadSled } from "../head/HeadSled";

/** Grey, as the folded Timeline's strip is, since both count things. */
const GREY = "rgb(var(--text-muted-rgb) / 0.7)";

const FIGURE_FONT_PX = 10;
/** The number's own padding, 3 px each side, and its gap from the line (as the lane's number). */
const PAD_PX = 6;
const GAP_PX = 3;

/** The time of a cell in words: a day's date for a story with no hour, else the hour as the clock's
 *  form writes it. */
const whenOf = (model: CountModel, t: number, end: number, form: TimeForm): string =>
  model.origin === null ? dayWords(t) : span(t, end - t, form);

interface CountBarsProps {
  model: CountModel;
  heading: string;
  soloName: string | null;
  project: TimelineProjector;
  form: TimeForm;
}

/** One bar for each cell that holds something. Its width is its own cell's span, so a 25 hour day
 *  is wider than a 24 hour one. */
const CountBars = memo(function CountBars({ model, heading, soloName, project, form }: CountBarsProps) {
  const windowMs = project.msAt(1) - project.msAt(0);
  const out: ReactElement[] = [];
  for (const c of model.cells) {
    const left = project.pct(c.t);
    const width = windowMs > 0 ? (((c.end - c.t) * LANE_BAR_FILL) / windowMs) * 100 : 0;
    if (!(left < 100 && left + width > 0)) continue;
    out.push(
      <div
        key={c.t}
        data-small-count
        data-t={c.t}
        data-n={c.n}
        {...tip(countBarWords(heading, whenOf(model, c.t, c.end, form), c.n, model.named, soloName))}
        style={{ position: "absolute", top: 0, height: SMALL_PLOT_PX, left: `${left}%`, width: `${width}%`, minWidth: 1, pointerEvents: "auto" }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: barHeightPx(c.n, model.top), backgroundColor: GREY }} />
      </div>,
    );
  }
  return <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>{out}</div>;
});

interface CountFigureProps {
  model: CountModel;
  heading: string;
  soloName: string | null;
  project: TimelineProjector;
  form: TimeForm;
  plotPx?: number;
}

/** The number at the line: the count of the step the playhead is in. It stands on its own step's
 *  side of the line: left in the second half of the step, right in the first half, and
 *  left where its measured width would pass the plot's right end. The plot's width is read from the
 *  page when its size changes, never at a tick. */
function CountFigure({ model, heading, soloName, project, form, plotPx }: CountFigureProps) {
  const playhead = usePlayhead((s) => s.playhead);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState(0);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (plotPx !== undefined || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setMeasured(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [plotPx]);

  const at = project.pct(playhead);
  const cell = cellAt(model, playhead);
  const text = countFigureText(cell.n, model.named, model.soloed);
  const shown = at >= 0 && at <= 100;
  const plot = plotPx ?? measured;
  const side = figureSide({
    playhead,
    barStart: cell.t,
    step: cell.end - cell.t,
    linePx: (at / 100) * plot,
    plotPx: plot,
    figurePx: figureWidthPx(text.length, FIGURE_FONT_PX, PAD_PX, GAP_PX),
  });

  return (
    <div ref={wrap} aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 7 }}>
      {shown ? (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "100%", transform: `translateX(${Math.min(at, 100)}%)` }}>
          <FigureNumber
            model={model}
            heading={heading}
            soloName={soloName}
            form={form}
            t={cell.t}
            end={cell.end}
            n={cell.n}
            side={side}
            text={text}
          />
        </div>
      ) : null}
    </div>
  );
}

interface FigureNumberProps {
  model: CountModel;
  heading: string;
  soloName: string | null;
  form: TimeForm;
  /** The cell the number counts, as primitives, so a tick inside the cell leaves every prop as it was. */
  t: number;
  end: number;
  n: number;
  side: "left" | "right";
  text: string;
}

/** The number's span. The words hold a date format, so they are built here, where the memo's props
 *  are primitives: they are made again when the playhead crosses into another cell or the form
 *  changes, and not at a tick. */
const FigureNumber = memo(function FigureNumber({ model, heading, soloName, form, t, end, n, side, text }: FigureNumberProps) {
  const words = tip(countFigureWords(heading, whenOf(model, t, end, form), n, model.named, soloName));
  return (
    <span
      data-small-count-figure
      data-side={side}
      {...words}
      className="font-mono text-[10px] text-text"
      style={{
        position: "absolute",
        whiteSpace: "nowrap",
        pointerEvents: "auto",
        fontVariantNumeric: "tabular-nums",
        ...(side === "left" ? { right: "100%", marginRight: GAP_PX } : { left: GAP_PX }),
        top: 1,
        lineHeight: "12px",
        padding: `0 ${PAD_PX / 2}px`,
        // The bars can fill the plot's whole height, so the number carries a patch of the
        // bar's surface under it.
        backgroundColor: "rgb(var(--glass-tint) / 0.86)",
      }}
    >
      {text}
    </span>
  );
});

export interface RowsSmallProps {
  set: TrackSet;
  /** Every dot event of the case. */
  ticks: readonly RowTick[];
  slot: LanesSlot;
  /** The lanes' bucket grids, which set where the faint part starts. */
  grids: readonly BucketGrid[];
  /** The key of the row that is alone, or null; a key that names no named row narrows nothing. */
  soloKey: string | null;
  /** The name column's width in px. Left out it is the open bar's, GUTTER. */
  inset?: number;
  /** Given where the line carries the rows' button itself (the folded Timeline's line for each
   *  section): the button is drawn, and a press calls this. */
  onOpen?: () => void;
  /** The plot's width in px when the caller knows it; left out, the number reads it from the page. */
  plotPx?: number;
}

export const RowsSmall = memo(function RowsSmall({ set, ticks, slot, grids, soloKey, inset = GUTTER, onOpen, plotPx }: RowsSmallProps) {
  const model = useMemo(() => buildCountModel({ set, ticks, soloKey }), [set, ticks, soloKey]);
  const form: TimeForm = useClockForm((s) => s.h24) ? "24h" : "12h";
  const soloName = model.soloed ? (set.tracks.find((t) => t.key === soloKey)?.name ?? null) : null;

  // A section with nothing to draw draws no band and no strip named "0 to 0". With no named row
  // there is no line either.
  if (model.named === 0) return null;
  const drawn = model.top > 0;
  if (!drawn && !onOpen) return null;

  return (
    <div data-rows-small={ROWS_FOLD} className="flex" style={{ marginTop: onOpen ? 4 : 2 }}>
      <div data-small-name className="shrink-0 font-mono text-[8px] uppercase tracking-[0.18em]" style={{ width: inset }}>
        {onOpen ? (
          <button
            type="button"
            data-small-open
            aria-expanded={false}
            aria-label={`${rowsCountName(set.heading, model.named)}. ${foldTail("small", "the rows")}`}
            onClick={onOpen}
            {...tip(rowsFoldSmallWords(set.heading, model.named))}
            className={`flex h-3 w-full min-w-0 items-center whitespace-nowrap uppercase leading-3 text-text ${BAR_FOCUS_RING}`}
          >
            {/* A folded section that draws a small version has the one closed fold mark, as every
                other fold of the playbar does. */}
            <FoldMark open={false} />
            <span className="min-w-0 truncate">{set.heading}</span>
            {/* The last span is the one the lane check measures, so it carries the gap to the plot
                (SMALL_LABEL_GAP_PX) on itself; the button has no padding of its own. */}
            <span aria-hidden="true" className="shrink-0 whitespace-pre" style={{ paddingRight: SMALL_LABEL_GAP_PX }}>
              {set.heading ? " · " : ""}
              {model.named}
            </span>
          </button>
        ) : null}
        {drawn ? (
          <div
            data-small-label
            {...tip(countLabelWords(set.heading, model.step, model.top, model.named, soloName))}
            // One line, cut with an ellipsis if it is too long, and held SMALL_LABEL_GAP_PX short of
            // the plot. The tracking is 0.17em, a little under the bar's 0.18em, so that the range
            // on the token story ("ACTIVE / 1H · 0 TO 24", 21 characters) keeps that gap in 148 px.
            className="h-3 truncate whitespace-nowrap leading-3 tracking-[0.17em] text-[color:var(--caption-on-glass)]"
            style={{ paddingRight: SMALL_LABEL_GAP_PX }}
          >
            {countLabelText(model.step, model.top, model.soloed)}
          </div>
        ) : null}
      </div>
      {drawn ? (
        <div
          data-small-plot
          className="relative min-w-0 flex-1 cursor-pointer select-none border-b border-panel-border"
          style={{ height: SMALL_PLOT_PX, boxSizing: "content-box", overflow: "hidden" }}
          onMouseDown={slot.onPlotMouseDown}
        >
          <CountBars model={model} heading={set.heading} soloName={soloName} project={slot.project} form={form} />
          <HeadSled project={slot.project} grids={grids} />
          <CountFigure model={model} heading={set.heading} soloName={soloName} project={slot.project} form={form} plotPx={plotPx} />
        </div>
      ) : null}
    </div>
  );
});
