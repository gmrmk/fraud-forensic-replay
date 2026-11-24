// frontend/investigator/src/components/timeline/head/LaneFigure.tsx
// The lane's number at the line: the value of the bar whose
// bucket holds the playhead, in the lane's full form. It stands on its own hour's side of the line:
// left in the second half of the bar's step, right in the first half, and left where
// its measured width would pass the plot's right end. It is placed by a transform and is a function
// of the playhead; the plot's width is read from the page when the plot's size changes, never at a
// tick, and that read is the only DOM read here.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { tip } from "../../ui/Tip";
import { figureSide, figureWidthPx } from "../../../lib/head-edge";
import { laneFigureWords } from "../../../lib/tooltip-words/head";
import { amount, span } from "../../../lib/time-words";
import { bucketAt, formatLaneNumber, laneValueAttr, type LaneModel } from "../../../lib/timeline-lanes";
import type { TimelineProjector } from "../../../lib/timeline-projector";
import { useClockForm } from "../../../store/clock-form";
import { usePlayhead } from "../../../store/playhead";

const FIGURE_FONT_PX = 10;
/** The number's own padding, 3 px each side, and its gap from the line. */
const PAD_PX = 6;
const GAP_PX = 3;

export interface LaneFigureProps {
  /** The lane's id, written as `data-lane-figure`. */
  laneId: string;
  lane: LaneModel;
  project: TimelineProjector;
  /** The lane's name, for the tooltip. */
  name: string;
  /** The plot's width in px, when its owner knows it. Left out, the figure reads its own box's
   *  width from the page, which is the plot's width, and again when that changes. */
  plotPx?: number;
}

export function LaneFigure({ laneId, lane, project, name, plotPx }: LaneFigureProps) {
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
  const bar = bucketAt(lane, playhead);
  // The hour in the words follows the clock's switch, read as the head's clock and tab
  // read it. The words hold a date format: they are built when the bar or the form changes, not
  // at a tick.
  const h24 = useClockForm((s) => s.h24);
  const words = useMemo(
    () =>
      bar
        ? tip(laneFigureWords(name, span(bar.t, lane.step, h24 ? "24h" : "12h"), amount(bar.value, lane.unit)))
        : {},
    [bar, h24, lane.step, lane.unit, name],
  );
  const shown = bar !== null && at >= 0 && at <= 100;
  const plot = plotPx ?? measured;
  const text = bar ? formatLaneNumber(bar.value, lane.decimals) : "";
  const side =
    shown && bar
      ? figureSide({
          playhead,
          barStart: bar.t,
          step: lane.step,
          linePx: (at / 100) * plot,
          plotPx: plot,
          figurePx: figureWidthPx(text.length, FIGURE_FONT_PX, PAD_PX, GAP_PX),
        })
      : "right";

  return (
    <div ref={wrap} aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 7 }}>
      {shown && bar ? (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "100%", transform: `translateX(${Math.min(at, 100)}%)` }}>
          <span
            data-lane-figure={laneId}
            data-lane-figure-value={laneValueAttr(bar.value, lane.decimals)}
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
              // The lane's bars can fill the plot's whole height, so the number carries a patch of
              // the bar's surface under it.
              backgroundColor: "rgb(var(--glass-tint) / 0.86)",
            }}
          >
            {text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
