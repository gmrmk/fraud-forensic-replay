// frontend/investigator/src/components/timeline/rows/RowFigures.tsx
// The numbers at the line on the rows: for each row, and for
// each open line of bars, the value of the bar whose hour holds the playhead, in the short form. A
// number stands on its own hour's side of the line: left in the second half of its bar's
// step, right in the first half, and left where its measured width would pass the plot's right end.
// It is placed by a transform and is a function of the playhead; the plot's width is read from the
// page when the plot's size changes, never at a tick. The words of a number hold a date format, so
// they are built when a bar changes or the clock's form does, not at a tick.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { figureSide, figureWidthPx } from "../../../lib/head-edge";
import { barAt, shortNumber, type FigureLine } from "../../../lib/row-ticks";
import { amount, span, type TimeForm } from "../../../lib/time-words";
import type { TrackSet } from "../../../lib/tracks";
import type { TimelineProjector } from "../../../lib/timeline-projector";
import { usePlayhead } from "../../../store/playhead";
import { tip } from "../../ui/Tip";

const FIGURE_FONT_PX = 9;
/** The number's own padding, 2 px each side, and its gap from the line. */
const PAD_PX = 4;
const GAP_PX = 3;

export interface RowFiguresProps {
  set: Pick<TrackSet, "step" | "barName" | "barUnit">;
  lines: readonly FigureLine[];
  /** The block's height in px. */
  height: number;
  project: TimelineProjector;
  form: TimeForm;
  /** The plot's width in px, when its owner knows it. Left out, the block reads its own width. */
  plotPx?: number;
}

export function RowFigures({ set, lines, height, project, form, plotPx }: RowFiguresProps) {
  const playhead = usePlayhead((s) => s.playhead);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState(0);
  // The observer reports the box's size when it starts and whenever the size changes.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (plotPx !== undefined || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setMeasured(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [plotPx]);

  const at = project.pct(playhead);
  const bars = lines.map((line) => barAt(line.bars, set.step, playhead));
  // Which bar each line shows changes only when the playhead crosses into another hour.
  const hourKey = bars.map((b) => (b ? b.t : "")).join(",");
  const figures = useMemo(
    () =>
      bars.map((bar, i) =>
        bar
          ? {
              bar,
              text: shortNumber(bar.value),
              words: tip([set.barName, lines[i].name, `${span(bar.t, set.step, form)} · ${amount(bar.value, set.barUnit)}`]),
            }
          : null,
      ),
    // `bars` is built again at every tick; `hourKey` says when its content changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hourKey, set.step, set.barName, set.barUnit, lines, form],
  );
  const plot = plotPx ?? measured;
  const shown = at >= 0 && at <= 100 && set.step > 0;
  return (
    <div ref={wrap} aria-hidden="true" style={{ position: "absolute", top: 0, height, left: 0, right: 0, overflow: "hidden", pointerEvents: "none", zIndex: 7 }}>
      {shown ? (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "100%", transform: `translateX(${at}%)` }}>
          {figures.map((f, i) => {
            if (!f) return null;
            const side = figureSide({
              playhead,
              barStart: f.bar.t,
              step: set.step,
              linePx: (at / 100) * plot,
              plotPx: plot,
              figurePx: figureWidthPx(f.text.length, FIGURE_FONT_PX, PAD_PX, GAP_PX),
            });
            return (
              <span
                key={lines[i].key}
                data-row-figure={lines[i].key}
                data-side={side}
                {...f.words}
                className="font-mono text-[9px] text-text"
                style={{
                  position: "absolute",
                  whiteSpace: "nowrap",
                  pointerEvents: "auto",
                  fontVariantNumeric: "tabular-nums",
                  ...(side === "left" ? { right: "100%", marginRight: GAP_PX } : { left: GAP_PX }),
                  top: lines[i].top + 2,
                  lineHeight: `${lines[i].h - 5}px`,
                  padding: `0 ${PAD_PX / 2}px`,
                  // A flat patch of the bar's own surface, so the number holds its contrast over the
                  // tallest bar behind it.
                  backgroundColor: "rgb(var(--glass-tint))",
                }}
              >
                {f.text}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
