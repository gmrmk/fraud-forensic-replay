// frontend/investigator/src/components/timeline/rows/RowDot.tsx
// The marks in a row's plot: an event's dot, and the row's
// own bars. A dot here is the track's node drawn again on its row. As a copy it is out of the Tab
// order and out of the screen reader's list, so every event keeps one button on the track; its
// words are the original's, so a hover finds the same record. The words are built in a memo, once
// for the record and the clock's form, never at a tick.
import { useMemo, type ReactElement } from "react";
import { sessionTickState } from "../../../lib/session-highlight";
import { amount, nodeBrief, recordLines, span, type TimeForm } from "../../../lib/time-words";
import { rowCutWords } from "../../../lib/tooltip-words/rows";
import type { RowTick } from "../../../lib/row-ticks";
import type { TrackBar, TrackSet } from "../../../lib/tracks";
import type { TimelineProjector } from "../../../lib/timeline-projector";
import { tip } from "../../ui/Tip";

export interface RowDotProps {
  tick: RowTick;
  /** The dot's place along the plot, in percent. */
  left: number;
  prominence: number;
  /** True for a copy of a node the track already draws. */
  mirror: boolean;
  /** The kind's raw colour, for the glow. */
  paint: (kind: string, alpha?: number | string) => string;
  /** The kind's colour clamped for the panel, for the dot's core and its tooltip's mark. */
  onPanel: (kind: string) => string;
  kindFor: (kind: string) => string;
  /** The manifest's word for a kind. */
  kindLabel: (kind: string) => string;
  selectedSessionId: string | null;
  form: TimeForm;
  onActivate: (id: string) => void;
}

const RING = "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none";

export function RowDot({ tick, left, prominence, mirror, paint, onPanel, kindFor, kindLabel, selectedSessionId, form, onActivate }: RowDotProps) {
  const kind = kindFor(tick.kind);
  const emphatic = kind === "fraud" || tick.newDevice || tick.blocked;
  const sess = sessionTickState(tick.session, selectedSessionId);
  const label = kindLabel(tick.kind);
  // The name is one imperative followed by values, as the track's nodes have it, and holds no ring word.
  // Rules met (the Simplified Technical English article): R2 R4 R5 R6 R7 R11, R8; R9 is not met, since
  // the name ends in a value and carries no full stop; R1 is not checked.
  const words = useMemo(() => {
    const brief = nodeBrief(tick.label, tick.t, form);
    return {
      brief,
      name: `Jump to ${label}: ${brief}`,
      lines: recordLines(label, tick.label, tick.secondary, tick.t, tick.facts, form),
    };
  }, [tick, label, form]);
  return (
    <button
      type="button"
      data-row-dot
      data-node-kind={tick.kind}
      {...(mirror ? { "aria-hidden": true, tabIndex: -1 } : { "aria-label": words.name })}
      {...tip(words.lines, onPanel(kind))}
      data-tip-node={words.brief}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onActivate(tick.id);
      }}
      // A node under the pointer or the focus rises above its neighbours. The stacking order is a
      // class, since an inline value would beat the hover and focus classes.
      className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer flex items-center justify-center outline-none focus-visible:ring-1 focus-visible:ring-signal z-[3] hover:z-10 focus-visible:z-10"
      style={{
        left: `${left}%`,
        top: "50%",
        width: 12,
        height: 12,
        background: "transparent",
        padding: 0,
        border: "none",
        opacity: sess.dimmed ? 0.7 : 1,
        filter: sess.dimmed ? "saturate(0.35)" : undefined,
      }}
    >
      {sess.highlighted && (
        <span
          aria-hidden="true"
          className={RING}
          style={{ width: 15 + prominence * 6, height: 15 + prominence * 6, border: "1.5px solid rgb(var(--r1-rgb) / 0.95)", boxShadow: "0 0 7px 1px rgb(var(--r1-rgb) / 0.75)" }}
        />
      )}
      {tick.newDevice && (
        <span
          aria-hidden="true"
          className={RING}
          style={{ width: 10 + prominence * 5, height: 10 + prominence * 5, border: "1px solid var(--alarm-on-panel)", boxShadow: "0 0 4px rgb(var(--alarm-rgb) / 0.95)" }}
        />
      )}
      {tick.challengeVar && !tick.newDevice && (
        <span
          aria-hidden="true"
          className={RING}
          style={{ width: 8 + prominence * 4, height: 8 + prominence * 4, border: `1px solid var(--${tick.challengeVar}-on-panel)`, boxShadow: `0 0 2px rgb(var(--${tick.challengeVar}-rgb) / 0.9)` }}
        />
      )}
      {tick.blocked ? (
        <span
          aria-hidden="true"
          className="block rounded-full"
          style={{ width: 5 + prominence * 3, height: 5 + prominence * 3, background: "transparent", border: "1.5px solid var(--alarm-on-panel)", boxShadow: "0 0 6px rgb(var(--alarm-rgb) / 0.9)" }}
        />
      ) : (
        <span
          aria-hidden="true"
          className="block rounded-full"
          style={{
            width: (emphatic ? 4 : 3) + prominence * 4,
            height: (emphatic ? 4 : 3) + prominence * 4,
            background: onPanel(kind),
            boxShadow: emphatic
              ? `0 0 ${5 - prominence}px ${paint(kind, 0.9 + prominence * 0.1)}, 0 0 2px ${paint(kind)}`
              : `0 0 ${4 - prominence}px ${paint(kind, 0.55 + prominence * 0.4)}`,
          }}
        />
      )}
    </button>
  );
}

const PLOT_EDGE_PX = 2;
const CUT_CAP_PX = 2;
const CUT_GAP_PX = 1;
/** A bar's width as a share of its step, as the lane draws it. */
const BAR_SHARE = 0.85;

export interface RowBarsProps {
  bars: readonly TrackBar[];
  /** Whose bars these are, for their words: a row's name, or a row's and a line's. */
  name: string;
  /** The top of the scale: the rows' shared top. */
  top: number;
  plotPx: number;
  set: Pick<TrackSet, "step" | "barName" | "barUnit">;
  project: TimelineProjector;
  /** The bar kind's colour clamped for the panel in the current theme. */
  fill: string;
  form: TimeForm;
}

/** A row's own bars (or a line's): linear from zero to the top; a bar over the top is drawn cut. */
export function RowBars({ bars, name, top, plotPx, set, project, fill, form }: RowBarsProps) {
  if (!(top > 0) || bars.length === 0) return null;
  const windowMs = project.msAt(1) - project.msAt(0);
  const width = windowMs > 0 && set.step > 0 ? ((BAR_SHARE * set.step) / windowMs) * 100 : 0;
  const out: ReactElement[] = [];
  for (const bar of bars) {
    const left = project.pct(bar.t);
    if (!(left < 100 && left + width > 0)) continue;
    const cut = bar.value > top;
    const h = cut ? plotPx - CUT_CAP_PX - CUT_GAP_PX : Math.max(1, Math.round((bar.value / top) * plotPx));
    out.push(
      <div
        key={bar.t}
        data-row-bar
        data-bar-t={bar.t}
        data-value={bar.value}
        {...tip([set.barName, name, `${span(bar.t, set.step, form)} · ${amount(bar.value, set.barUnit)}`, cut ? rowCutWords(amount(top, set.barUnit)) : null], fill)}
        style={{ position: "absolute", left: `${left}%`, width: `${width}%`, minWidth: 1, bottom: PLOT_EDGE_PX, height: plotPx, pointerEvents: "auto" }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, backgroundColor: fill }} />
        {cut ? <div style={{ position: "absolute", left: 0, right: 0, bottom: plotPx - CUT_CAP_PX, height: CUT_CAP_PX, backgroundColor: fill }} /> : null}
      </div>,
    );
  }
  // The bars are cut at the plot's edges: a bar whose hour starts before what the bar shows would
  // run on to the left, over the row's name.
  return (
    <div data-row-bars style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {out}
    </div>
  );
}
