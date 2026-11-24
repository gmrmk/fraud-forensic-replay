// frontend/investigator/src/components/timeline/CaseStrip.tsx
// The case strip: the whole case, from the first moment to
// the last, drawn small in 160 slices, each as high as its count of events. It is a picture. On
// the one line it is the content of the slider, which speaks for it and carries its words, and the
// slider's own handler seeks and keeps the drag, so there `seeks` is false and the strip handles
// no press. On its own (the open bar's overview) a press moves the playhead there.
//
// The spike's lens (a slider to pan the window) is not built: inside the one line's slider it
// would be a slider within a slider. The line's piece of the head is `HeadSled` over the whole
// case, which is a function of the playhead alone.
import { memo, useMemo, type MouseEvent } from "react";
import { usePlayhead } from "../../store/playhead";
import { makeProjector } from "../../lib/timeline-projector";
import { HeadSled } from "./head/HeadSled";

/** How many slices the case is divided into. */
const SLICES = 160;
/** The strip's height in px; the busiest slice is this high. */
const STRIP_PX = 16;

/** The count of events in each slice. An event outside the case is not counted. */
function countSlices(times: readonly number[], min: number, span: number): number[] {
  const counts = new Array<number>(SLICES).fill(0);
  for (const t of times) {
    if (t < min || t > min + span) continue;
    counts[Math.min(SLICES - 1, Math.floor(((t - min) / span) * SLICES))] += 1;
  }
  return counts;
}

export interface CaseStripProps {
  /** The moment of each event of the case, in ms. */
  times: readonly number[];
  /** True (the default) when a press on the strip moves the playhead. False inside a slider. */
  seeks?: boolean;
}

export const CaseStrip = memo(function CaseStrip({ times, seeks = true }: CaseStripProps) {
  const minTime = usePlayhead((s) => s.minTime);
  const maxTime = usePlayhead((s) => s.maxTime);
  const span = maxTime - minTime;
  const heights = useMemo(() => {
    if (span <= 0) return [];
    const counts = countSlices(times, minTime, span);
    const busiest = Math.max(1, ...counts);
    return counts.map((c) => (c === 0 ? 0 : Math.max(1, Math.round((c / busiest) * STRIP_PX))));
  }, [times, minTime, span]);
  const whole = useMemo(() => makeProjector(minTime, maxTime), [minTime, maxTime]);

  if (span <= 0) return null;

  const onPress = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    const s = usePlayhead.getState();
    s.pause();
    s.setPlayhead(minTime + frac * span);
  };

  return (
    <div
      data-case-strip
      data-slices={SLICES}
      aria-hidden="true"
      onMouseDown={seeks ? onPress : undefined}
      className={`relative ${seeks ? "cursor-pointer" : ""}`}
      style={{ height: STRIP_PX }}
    >
      {heights.map((h, i) =>
        h === 0 ? null : (
          <div
            key={i}
            data-case-slice
            data-slice={i}
            style={{
              position: "absolute",
              bottom: 0,
              left: `${(i / SLICES) * 100}%`,
              width: `calc(${100 / SLICES}% - 1px)`,
              minWidth: 1,
              height: h,
              backgroundColor: "rgb(var(--text-muted-rgb) / 0.7)",
            }}
          />
        ),
      )}
      <HeadSled project={whole} grids={[]} />
    </div>
  );
});
