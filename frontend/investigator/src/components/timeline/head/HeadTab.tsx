// frontend/investigator/src/components/timeline/head/HeadTab.tsx
// The tab: the one clock, riding the rail above the track,
// and the grip. It is not a keyboard stop (the track is, and its spoken value carries the clock).
// Taking it does not move the playhead, and a drag of 100 px is 100 px of time. Outside the window
// it parks at the near edge and points the way; the arrow is its own element, outside the text, so
// the text never has to fit an arrow beside the longest clock. The tab is placed by a transform.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { tip } from "../../ui/Tip";
import { headTabWords } from "../../../lib/tooltip-words/head";
import { remaining, when, when24 } from "../../../lib/time-words";
import type { TimelineProjector } from "../../../lib/timeline-projector";
import { useClockForm } from "../../../store/clock-form";
import { usePlayhead } from "../../../store/playhead";

/** The tab's width and height in px. The longest clock, 19 characters at 6.32 px, is 120 px. */
export const HEAD_TAB_WIDTH_PX = 128;
const TAB_H = 16;
/** The room the arrow takes beside the text: 120 + 7 is inside the 128. */
export const HEAD_TAB_ARROW_PX = 7;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export interface HeadTabProps {
  project: TimelineProjector;
  /** The latest moment of the case, for the time left in the tooltip. */
  maxTime: number;
  /** The app's word for one node, for the tooltip's sentence. */
  noun: string;
  /** Called when the tab is taken, so the track gets the focus and its keys keep working. */
  onGrab: () => void;
}

export function HeadTab({ project, maxTime, noun, onGrab }: HeadTabProps) {
  const playhead = usePlayhead((s) => s.playhead);
  const h24 = useClockForm((s) => s.h24);
  // How far the pointer stands from the line, in px, while the tab is held; null when it is not.
  const grip = useRef<number | null>(null);
  const [held, setHeld] = useState(false);
  const at = project.pct(playhead);
  const before = at < 0;
  const after = at > 100;
  const centre = clamp(at, 0, 100);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rail = e.currentTarget.parentElement?.getBoundingClientRect();
    // One pointer holds the tab; a second finger does not take it over.
    if (!rail || grip.current !== null) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // The pointer keeps its distance from the line, so taking the tab does not move the playhead.
    grip.current = e.clientX - (rail.left + (centre / 100) * rail.width);
    setHeld(true);
    usePlayhead.getState().pause();
    onGrab();
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rail = e.currentTarget.parentElement?.getBoundingClientRect();
    if (grip.current === null || !rail || rail.width <= 0) return;
    usePlayhead.getState().setPlayhead(project.msAt(clamp((e.clientX - grip.current - rail.left) / rail.width, 0, 1)));
  };
  const onUp = () => {
    grip.current = null;
    setHeld(false);
  };

  return (
    <div
      data-head-tab
      aria-hidden="true"
      {...tip(headTabWords(remaining(maxTime - playhead), before ? "before" : after ? "after" : null, noun))}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onMouseDown={(e) => e.stopPropagation()}
      className="flex items-center justify-center font-mono text-[10px]"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        // The rail is a size container: 1cqw is one percent of its width, so the clamp keeps the
        // tab inside the plot with no read of the rail's width.
        transform: `translateX(clamp(0px, calc(${centre}cqw - ${HEAD_TAB_WIDTH_PX / 2}px), calc(100cqw - ${HEAD_TAB_WIDTH_PX}px)))`,
        width: HEAD_TAB_WIDTH_PX,
        height: TAB_H,
        lineHeight: `${TAB_H}px`,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        backgroundColor: "rgb(var(--text-rgb))",
        color: "rgb(var(--glass-tint))",
        borderRadius: 2,
        cursor: held ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
        zIndex: 6,
      }}
    >
      {before ? (
        <span data-head-tab-arrow aria-hidden="true" style={{ width: HEAD_TAB_ARROW_PX, textAlign: "center" }}>
          {"‹"}
        </span>
      ) : null}
      <span data-head-tab-text>{h24 ? when24(playhead) : when(playhead)}</span>
      {after ? (
        <span data-head-tab-arrow aria-hidden="true" style={{ width: HEAD_TAB_ARROW_PX, textAlign: "center" }}>
          {"›"}
        </span>
      ) : null}
    </div>
  );
}
