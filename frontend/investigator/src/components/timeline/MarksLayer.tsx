/**
 * MarksLayer: the two marks the investigator dropped on the track (A before B) and the time
 * between them. A mark outside the visible window draws no tick, and the gap is still read out.
 * The readout is a polite status region, so a screen reader hears the gap when it changes.
 * Mounted by TimelineShell inside the track, for every mode. Type matches the track's other
 * labels (the gap label in CaseTimelineLayer and the readout of MagnitudeLane).
 */
import type { CSSProperties } from "react";
import { usePlayhead } from "../../store/playhead";
import { formatGap } from "../../lib/playhead-tools";
import type { TimelineProjector } from "../../lib/timeline-projector";

const LABEL = "font-mono text-[8px] leading-none tracking-[0.18em] text-text pointer-events-none whitespace-nowrap";

function Tick({ mark, pct }: { mark: "a" | "b"; pct: number }) {
  if (!(pct >= 0 && pct <= 100)) return null;
  return (
    <span
      data-mark={mark}
      className={`absolute top-0 bottom-0 ${LABEL}`}
      style={{ left: `${pct}%`, borderLeft: "1px solid rgb(var(--text-rgb) / 0.8)", paddingLeft: 2, zIndex: 4 }}
    >
      {mark.toUpperCase()}
    </span>
  );
}

/** Where the gap readout sits, so that no mark line cuts through it: just after the B mark;
 *  near the right end, just before the A mark; between the two only when they stand far
 *  apart. With the marks close together the readout is wider than the gap. Positions are
 *  held on the track (a mark may be outside the window). */
function readoutPlace(pctA: number, pctB: number): { className: string; style: CSSProperties } {
  const a = Math.max(0, Math.min(100, pctA));
  const b = Math.max(0, Math.min(100, pctB));
  if (b <= 78) return { className: "", style: { left: `calc(${b}% + 8px)` } };
  if (a >= 22) return { className: "", style: { right: `calc(${100 - a}% + 8px)` } };
  return { className: "-translate-x-1/2", style: { left: `${(a + b) / 2}%` } };
}

export function MarksLayer({ project }: { project: TimelineProjector }) {
  const a = usePlayhead((s) => s.markA);
  const b = usePlayhead((s) => s.markB);
  if (a === null) return null;
  const pctA = project.pct(a);
  const pctB = b === null ? null : project.pct(b);
  const place = pctB === null ? null : readoutPlace(pctA, pctB);
  return (
    <>
      <Tick mark="a" pct={pctA} />
      {pctB !== null && <Tick mark="b" pct={pctB} />}
      {b !== null && place && (
        <span
          data-marks-readout
          role="status"
          aria-live="polite"
          className={`absolute ${place.className} ${LABEL}`}
          style={{ ...place.style, bottom: -1, zIndex: 4 }}
        >
          A to B · {formatGap(b - a)}
        </span>
      )}
    </>
  );
}
