/**
 * TimelineShell - the neutral, mode-agnostic timeline frame (TimelineShell split,
 * item P). It owns the chrome every mode shares: the outer Panel (carrying
 * data-eyes="TIMELINE-ROOT"), the readout+transport top row, the day-density
 * band (click-to-jump-playhead), the scrub track (owns useTimelineScrub), the
 * base line, the filled progress bar, the day ticks, the off-window chevrons,
 * the playhead handle (z-5, paints OVER the overlay), and the bottom axis labels.
 *
 * Each mode plugs in its own data overlay via the render-prop `children`, which
 * receives the shell's projector (ms<->%). Case mode supplies CaseTimelineLayer
 * (event dots + story layers). The
 * projector is also published on TimelineProjectorContext so deep children read
 * it without prop-drilling.
 *
 * Pure-move note (Phase 1): the JSX here is lifted verbatim from Timeline.tsx -
 * the DOM order inside the track is preserved EXACTLY (overlay -> base line ->
 * fill -> day ticks -> chevrons -> handle) so the case render stays pixel-identical.
 *
 * The shell takes slots, every one optional and every one written to the
 * DOM only when given, so a mode that passes none draws the DOM it always drew (pinned by
 * TimelineShell.test.tsx on its case consumers): `nameColumn` (the open bar's
 * 148 px column; the inset the zoom gesture measures from), `overview`, `axisOnTop`, `corner`,
 * `rail`, `handle`, and `fold`. `fold` is the Timeline's own fold: folded, the bar is one line (the
 * fold button, the clock, the row that is alone with a control that clears it, the slider over the
 * whole case with the strip inside it, and the transport). The fold button sits at one place in
 * the tree in both states, so it is one DOM node across a fold and an open and keeps the focus.
 * The shell reads no size and no solo: the caller decides which size to draw and passes the rest.
 *
 * `fold.more`: folded with it, the bar is a grid of the Timeline's line and the
 * sections' small versions, one line each; folded without it, the
 * bar is the one line, so one more fold is the caller leaving `more` out. The top row is the same
 * element in all three states and only its class and style change, so the fold button is one DOM
 * node across open, a line for each section, one line and open again, and keeps the focus.
 * `above`: the Timeline's depth, a control on the rail and, open, a line for
 * each kind of event between the rail and the track.
 */
import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, type MouseEvent, type ReactNode } from "react";
import { TimelineControls } from "../TimelineControls";
import { useTimelineScrub } from "../../lib/use-timeline-scrub";
import { useZoomGestures } from "../../lib/use-zoom-gestures";
import { axisTicks } from "../../lib/axis-ticks";
import { Panel } from "../ui";
import { tip } from "../ui/Tip";
import { usePlayhead } from "../../store/playhead";
import { useClockForm } from "../../store/clock-form";
import { makeProjector, type TimelineProjector } from "../../lib/timeline-projector";
import type { LanesSlot } from "../../lib/timeline-lanes";
import { BAR_FOCUS_RING, GUTTER, HEAD_RAIL } from "../../lib/bar-metrics";
import { STACK_GAP_PX, STACK_NAME_PX } from "../../lib/bar-metrics-stack";
import { BAR_PART, caseStripWords, soloClearName, soloClearWords } from "../../lib/tooltip-words/bar";
import { when, when24 } from "../../lib/time-words";
import { TimelineProjectorContext } from "./TimelineProjectorContext";
import { MarksLayer } from "./MarksLayer";
import { BarFold } from "./head/BarFold";
import { HeadClock } from "./head/HeadClock";
import type { DayCell } from "../../lib/timeline-story";

/** A day-density band cell - `timeline-story.ts`'s DayCell plus an optional
 *  explicit jump target. When jumpMs is omitted the shell jumps via the
 *  projector (msAt of the cell's left edge), preserving case behavior. */
export type DayDensityCell = DayCell & { jumpMs?: number };

/** What the rail slot is given: the lanes' slot, and a way to give the track the focus, so the
 *  step, arrow and mark keys keep working after a press on the tab. */
export interface RailSlot extends LanesSlot {
  focusTrack: () => void;
}

/** The Timeline's own fold, and what the one line draws. */
export interface BarFoldSlot {
  folded: boolean;
  onToggle: () => void;
  /** The app's word for one node ("event"), in the singular, for the clock's and the strip's words. */
  noun: string;
  /** The whole case, drawn small. It is the content of the slider on the one line. */
  strip: ReactNode;
  /** The row that is alone, when one is. The one line carries its name and a control that clears it
   *  The open bar's rows carry their own. */
  solo?: { name: string; onClear: () => void };
  /** The folded sections' small versions, one line each, drawn under the Timeline's line.
   *  Given the slot of the folded bar, whose projector is the whole case,
   *  so the strips share the slider's scale. Folded with `more`, the bar is a grid of the Timeline's
   *  line and these lines; folded without it, the bar is the one line. The shell reads no size: the
   *  caller gives `more` for the first fold and leaves it out for the one more fold. */
  more?: (slot: LanesSlot) => ReactNode;
}

/** The control on the one line that clears the row that is alone: the row's name and a mark. The
 *  name is cut by the style at the width of the control; its text and its accessible name keep the
 *  whole name. It is a button, a stop in the Tab order, 24 px high. */
function SoloClear({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <button
      type="button"
      data-solo-clear
      aria-label={soloClearName(name)}
      {...tip(soloClearWords(name))}
      onClick={onClear}
      className={`flex h-6 min-w-0 max-w-[160px] shrink items-center gap-1.5 whitespace-nowrap rounded-sm border border-panel-border-strong px-1.5 font-mono text-[8px] uppercase tracking-[0.18em] text-text ${BAR_FOCUS_RING}`}
    >
      <span className="min-w-0 truncate">{name}</span>
      <span data-solo-mark aria-hidden="true" className="shrink-0">
        ×
      </span>
    </button>
  );
}

interface Props {
  /** Top-left readout (the case's T-Nd delta pill). */
  readout?: ReactNode;
  /** Top-right transport. Defaults to the full case transport. */
  transport?: ReactNode;
  /** Day-density band cells. Omit to hide the band. */
  dayDensity?: DayDensityCell[];
  /** Which domain the scrub track maps against. "window" (zoom-aware) is the case;
   *  "bounds" is the whole span (a folded bar). Also gates wheel-zoom (window only). */
  scrubDomain?: "window" | "bounds";
  /** Accessible label for the scrub slider. */
  ariaLabel?: string;
  /** Optional formatter for the slider's aria-valuetext (case = wall-clock).
   *  Returns null/undefined to leave it unset. */
  formatValueText?: (playhead: number) => string | undefined;
  /** `,` and `.` on the focused track: go to the previous or next event. A mode with no
   *  events to step through leaves it out. */
  onStep?: (dir: 1 | -1) => void;
  /** `n` on the focused track: add a note at the playhead. Absent: the key does nothing and is not
   *  named in `aria-keyshortcuts`. */
  onNote?: () => void;
  /** Lanes drawn under the track, inside the same wheel-zoom wrapper. Given the projector and a
   *  mouse-down handler that seeks and scrubs as the track does. Absent: no lanes. */
  lanes?: (slot: LanesSlot) => ReactNode;
  /** The open bar's name column is drawn: the band, the track and the hours start after GUTTER, and
   *  the zoom gesture measures the plot alone. Absent: no column, as today. */
  nameColumn?: boolean;
  /** Drawn in place of the day band (the case strip, on the open bar). */
  overview?: ReactNode;
  /** The hours sit above the lanes (between the track and the lanes) instead of under them. */
  axisOnTop?: boolean;
  /** Drawn in the name column, level with the track (the rows' fold button). Needs `nameColumn`. */
  corner?: ReactNode;
  /** The rail the clock's tab rides, drawn directly above the track inside the zoom wrapper. Given
   *  the lanes' slot and a way to focus the track. The corner then stands under it. */
  rail?: (slot: RailSlot) => ReactNode;
  /** Drawn in the track in place of the handle dot and the off-window arrows (the head's line), given
   *  the shell's projector. */
  handle?: (project: TimelineProjector) => ReactNode;
  /** The Timeline's own fold. Folded, the bar is one line: the fold button, the clock, the row that
   *  is alone and its clear control, the strip as the slider over the whole case, and the transport. */
  fold?: BarFoldSlot;
  /** The Timeline's own depth (a line for each kind of event). `control` stands on the rail,
   *  over the name column. `lines`, given only while the depth is open, is drawn between the rail and
   *  the track, and `height` is the px it takes (0 while closed), so the corner beside the track moves
   *  down with the track. Needs `rail` and `nameColumn`: without them nothing of it is drawn. The
   *  control comes first in the document, then the corner, then the track, which is the visual order. */
  above?: { control: ReactNode; lines?: (slot: LanesSlot) => ReactNode; height: number };
  /** The mode's data overlay, given the shell's projector. Mounts FIRST inside
   *  the track so the base line / fill / handle paint over it. */
  children: (project: TimelineProjector) => ReactNode;
}

/** Calls the lanes function with the slot. A component of its own for two reasons: the slot's
 *  handler reads refs, which the project's lint will not let the shell pass to a call made while
 *  rendering; and, memoised, the lanes are asked for again only when the projector or the lanes
 *  function changes, not at every playhead tick. */
interface LanesOutletProps {
  lanes: (slot: LanesSlot) => ReactNode;
  slot: LanesSlot;
}

const LanesOutlet = memo(function LanesOutlet({ lanes, slot }: LanesOutletProps) {
  return <>{lanes(slot)}</>;
});

/** The same for the rail slot, for the same two reasons: its slot holds a handler that reads a ref. */
const RailOutlet = memo(function RailOutlet({ rail, slot }: { rail: (slot: RailSlot) => ReactNode; slot: RailSlot }) {
  return <>{rail(slot)}</>;
});

export function TimelineShell({
  readout,
  transport,
  dayDensity,
  scrubDomain = "window",
  ariaLabel = "Playhead position",
  formatValueText,
  onStep,
  onNote,
  lanes,
  nameColumn = false,
  overview,
  axisOnTop = false,
  corner,
  rail,
  handle,
  fold,
  above,
  children,
}: Props) {
  const playhead = usePlayhead((s) => s.playhead);
  const windowMin = usePlayhead((s) => s.windowMin);
  const windowMax = usePlayhead((s) => s.windowMax);
  const minTime = usePlayhead((s) => s.minTime);
  const maxTime = usePlayhead((s) => s.maxTime);
  const setPlayhead = usePlayhead((s) => s.setPlayhead);
  const pause = usePlayhead((s) => s.pause);
  const h24 = useClockForm((s) => s.h24);
  // The id the fold button's aria-controls names: the body (the track and the lanes), which exists
  // only while the bar is open. Written to the DOM only when the bar has a fold.
  const bodyId = useId();

  // Folded to one line, the slider is the whole case: the domain is the bounds, whatever the mode
  // asked for, and the open bar's own parts are not drawn.
  const folded = fold?.folded === true;
  const domain = folded ? "bounds" : scrubDomain;
  const nameDrawn = nameColumn && !folded;
  // A line for each section: folded, with the sections' small versions to draw under the line.
  const stacked = folded && fold?.more !== undefined;
  // The Timeline's depth needs the rail to stand on and the name column for its lines' names.
  const depth = above !== undefined && rail !== undefined && nameDrawn ? above : undefined;

  // The active domain: the case scrubs the visible window (zoom); bounds mode the
  // whole span (a folded bar). The projector and the chrome all read this one choice.
  const domainMin = domain === "bounds" ? minTime : windowMin;
  const domainMax = domain === "bounds" ? maxTime : windowMax;
  const span = domainMax - domainMin;
  const progress = span > 0 ? (playhead - domainMin) / span : 0;

  // ONE projector against the active domain, handed to the overlay (render-prop
  // + context) so a layer never re-derives (ts - min) / span.
  const project = useMemo(
    () => makeProjector(domainMin, domainMax),
    [domainMin, domainMax],
  );

  const toggleMark = usePlayhead((s) => s.toggleMark);
  const { trackRef, onTrackMouseDown, onTrackKeyDown } = useTimelineScrub(domain, { onStep, onMark: toggleMark, onNote });
  // The keys the slider names for assistive technology: step (when given), mark, and note (when given).
  const keyShortcuts = `${onStep ? ", . " : ""}M${onNote ? " N" : ""}`;

  // Wheel/pinch zoom is a window-mode affordance only - bounds mode (a folded bar)
  // shows the whole span and must not silently gain wheel-zoom. Feed
  // the hook a stable detached ref in bounds mode so it attaches no listener.
  // The wheel listener sits on the wrapper around the track and the lanes, so a wheel over a lane
  // zooms as it does over the track; the wrapper has the track's left edge and width.
  // The hook's effect depends on the ref object, so a bar that folds and opens gives it the wrapper's
  // ref when open and the detached one when folded: the listener is dropped on the fold and put
  // back, on the new wrapper, on the open. The inset is the name column's width, when it is drawn.
  const noZoomRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<HTMLDivElement | null>(null);
  useZoomGestures(domain === "window" ? gestureRef : noZoomRef, nameDrawn ? GUTTER : undefined);

  // A mouse-down on a lane's plot is the track's own: it seeks and starts the scrub through the
  // track handler (which measures the track), and the drag then continues on window. The handler
  // keeps one identity so the memoised lanes are not redrawn at a tick; it reads the latest track
  // handler from a ref set in a layout effect (not while rendering).
  const trackMouseDownRef = useRef(onTrackMouseDown);
  useLayoutEffect(() => {
    trackMouseDownRef.current = onTrackMouseDown;
  });
  const onPlotMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0 || e.ctrlKey) return; // a right press, or a Mac's ctrl+click, opens a menu: no seek, scrub, focus move or preventDefault
      e.preventDefault(); // no text selection while dragging
      trackRef.current?.focus({ preventScroll: true }); // the arrow, step and mark keys keep working
      trackMouseDownRef.current(e);
    },
    [trackRef],
  );
  const slot = useMemo<LanesSlot>(() => ({ project, onPlotMouseDown }), [project, onPlotMouseDown]);
  const focusTrack = useCallback(() => trackRef.current?.focus({ preventScroll: true }), [trackRef]);
  const railSlot = useMemo<RailSlot>(() => ({ project, onPlotMouseDown, focusTrack }), [project, onPlotMouseDown, focusTrack]);

  // On the one line, the slider names what its strip counts and the span it covers, in the clock's
  // form. The slider carries the words, so the keyboard reaches them as the pointer does.
  const stripWords =
    fold && folded
      ? caseStripWords(fold.noun, (h24 ? when24 : when)(minTime), (h24 ? when24 : when)(maxTime))
      : null;

  // Granularity-adaptive axis: the faint grid marks sit at the SAME positions as
  // the labels, so the grid and labels can never disagree at any zoom.
  const labels = useMemo(
    () => axisTicks(domainMin, domainMax),
    [domainMin, domainMax],
  );
  const dayTicks = useMemo(
    () => (span > 0 ? labels.map((l) => (l.ms - domainMin) / span) : []),
    [labels, domainMin, span],
  );

  // The hours, under the lanes or (axisOnTop) above them. One element, placed once.
  const axis = (
    <div
      data-timeline-axis
      className={axisOnTop ? "relative h-3 mb-1.5" : "relative h-3 mt-1"}
      style={nameDrawn ? { marginLeft: GUTTER } : undefined}
    >
      {labels.map((l, i) => {
        const p = span > 0 ? (l.ms - domainMin) / span : 0;
        return (
          <span
            key={i}
            className="absolute font-mono text-[9px] tracking-widest text-text -translate-x-1/2"
            style={{ left: `${p * 100}%` }}
          >
            {l.label}
          </span>
        );
      })}
    </div>
  );

  return (
    <Panel material="glass" data-eyes="TIMELINE-ROOT" className="mb-3 z-10 rounded-none px-3 pt-2 pb-2">
      {/* Top row: readout (left) + controls (right). With a fold, the fold button leads the row in
          both states and keeps its place in the tree, so it is one DOM node across a fold and an
          open and keeps the focus. Folded, the row is the whole bar: the button, the clock, the row
          that is alone, the slider over the whole case, and the transport. */}
      <div
        {...(stacked ? { "data-bar-stack": "" } : {})}
        className={stacked ? "grid items-center" : folded ? "flex items-center gap-4" : "flex items-center justify-between mb-2"}
        style={stacked ? { gridTemplateColumns: `${STACK_NAME_PX}px minmax(0, 1fr) ${STACK_GAP_PX}px auto` } : undefined}
      >
        {fold ? (
          <div className="flex min-w-0 items-center gap-4">
            <BarFold folded={folded} small view={stacked ? "stack" : "line"} part={BAR_PART} controls={bodyId} onToggle={fold.onToggle} />
            {folded ? (
              <>
                <HeadClock maxTime={maxTime} noun={fold.noun} />
                {fold.solo ? <SoloClear name={fold.solo.name} onClear={fold.solo.onClear} /> : null}
              </>
            ) : (
              readout
            )}
          </div>
        ) : (
          readout
        )}
        {fold && folded ? (
          <div
            ref={trackRef}
            onMouseDown={onTrackMouseDown}
            onKeyDown={onTrackKeyDown}
            tabIndex={0}
            className={`relative min-w-0 flex-1 cursor-pointer select-none rounded-sm ${BAR_FOCUS_RING}`}
            role="slider"
            aria-label={ariaLabel}
            aria-valuemin={domainMin}
            aria-valuemax={domainMax}
            aria-valuenow={playhead}
            aria-valuetext={span > 0 ? formatValueText?.(playhead) : undefined}
            aria-keyshortcuts={keyShortcuts}
            {...(stripWords ? tip(stripWords) : {})}
          >
            {fold.strip}
          </div>
        ) : null}
        {/* The stack's third column, the gap before the transport: a column of its own, so that the
            slider and the small versions' plots end together. */}
        {stacked ? <span aria-hidden="true" data-stack-gap /> : null}
        {transport ?? <TimelineControls />}
        {/* The sections' lines run under the Timeline's line, across its first two columns, so a
            strip starts and ends where the slider does. The wrapper has no padding and no height of
            its own: a section with nothing to draw draws nothing. */}
        {stacked && fold?.more ? (
          <div data-stack-lines style={{ gridColumn: "1 / span 2" }}>
            <LanesOutlet lanes={fold.more} slot={slot} />
          </div>
        ) : null}
      </div>

      {/* Day-summary density band (Sift's day-navigation pattern): one cell
          per day, brightness by event count, red when a severe event landed
          that day - the anomalous day lights up against the quiet month.
          Click jumps the playhead to that day. */}
      {!folded && overview ? (
        <div style={nameDrawn ? { marginLeft: GUTTER } : undefined}>{overview}</div>
      ) : null}
      {!folded && !overview && dayDensity && dayDensity.length > 1 && (
        <div className="relative h-[5px] mb-1" aria-hidden="true" style={nameDrawn ? { marginLeft: GUTTER } : undefined}>
          {dayDensity.map((c, i) => {
            const max = Math.max(...dayDensity.map((x) => x.count), 1);
            const alpha = c.count === 0 ? 0.04 : 0.12 + (c.count / max) * 0.55;
            return (
              <button
                type="button"
                key={i}
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  pause();
                  setPlayhead(c.jumpMs ?? project.msAt(c.leftPct / 100));
                }}
                className="absolute top-0 h-full cursor-pointer border-none p-0"
                style={{
                  left: `${c.leftPct}%`,
                  width: `calc(${c.widthPct}% - 1px)`,
                  background: c.severe
                    ? `rgb(var(--alarm-mark-rgb) / ${Math.max(alpha, 0.55)})`
                    : `rgb(var(--r1-mark-rgb) / ${alpha.toFixed(3)})`,
                }}
                title={`${c.count} event${c.count === 1 ? "" : "s"}`}
              />
            );
          })}
        </div>
      )}

      {/* Track and lanes: one wrapper holds the wheel listener. With no slot it has no class and no
          style; with a name column it is the positioned box the corner stands in; with a fold it
          carries the id the fold button's aria-controls names. It is not drawn while folded. */}
      {!folded && (
      <div
        ref={gestureRef}
        data-timeline-gestures
        id={fold ? bodyId : undefined}
        className={nameDrawn ? "relative" : undefined}
      >
        {/* The depth's control stands on the rail, over the name column. It is first in the document:
            it is the highest control, and the corner beside the track is lower. */}
        {depth ? (
          <div data-rail-corner className="absolute left-0 top-0 flex items-center" style={{ width: GUTTER, height: HEAD_RAIL }}>
            {depth.control}
          </div>
        ) : null}
        {/* The corner stands in the name column, level with the track, and next in the document so
            the tab order runs control, corner, then track. It moves down by the rail when there is
            one and by the depth's lines when they are open. */}
        {corner && nameDrawn ? (
          <div
            data-bar-corner
            className="absolute left-0 flex h-8 items-center"
            style={{ width: GUTTER, top: (rail ? HEAD_RAIL : 0) + (depth ? depth.height : 0) }}
          >
            {corner}
          </div>
        ) : null}
        {rail ? <RailOutlet rail={rail} slot={railSlot} /> : null}
        {depth?.lines ? <LanesOutlet lanes={depth.lines} slot={slot} /> : null}
        {/* Track */}
        <div
          ref={trackRef}
          onMouseDown={onTrackMouseDown}
          onKeyDown={onTrackKeyDown}
          tabIndex={0}
          style={nameDrawn ? { marginLeft: GUTTER } : undefined}
          className="relative h-8 cursor-pointer select-none rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-accent"
          role="slider"
          aria-label={ariaLabel}
          aria-valuemin={domainMin}
          aria-valuemax={domainMax}
          aria-valuenow={playhead}
          aria-valuetext={span > 0 ? formatValueText?.(playhead) : undefined}
          aria-keyshortcuts={keyShortcuts}
        >
          {/* The mode's data overlay mounts FIRST so the base line, fill, ticks,
              chevrons, and handle below paint OVER it (z-index ordering contract). */}
          <TimelineProjectorContext.Provider value={project}>
            {children(project)}
          </TimelineProjectorContext.Provider>
          <MarksLayer project={project} />

          {/* Base line - centered, anchors the playhead handle. */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-panel-border" />
          {/* Filled portion up to handle. zIndex 5: the playhead is the strip's
              unifying cursor - it must paint OVER ticks (z1), lanes (z2), the
              transfer filament (z2), and dots (z3), never duck under them. */}
          <div
            className="absolute top-1/2 left-0 h-px bg-accent-dim"
            style={{ width: `${progress * 100}%`, zIndex: 5 }}
          />
          {/* Day ticks - centered for temporal anchoring across lanes. */}
          {dayTicks.map((p, i) => (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-px h-1.5 bg-panel-border-strong"
              style={{ left: `${p * 100}%`, zIndex: 1 }}
            />
          ))}

          {/* TML-19: off-window playhead indicators - a directional chevron at the
              near edge when the playhead has advanced outside the visible zoom
              window. Keeps the strip legible ("frozen track" confusion) without
              requiring the investigator to zoom out. Minimal: 8px, accent-dim,
              no border, pointer-events-none. */}
          {handle ? (
            // A handle slot (the head's line) stands in for the arrows and the dot below.
            handle(project)
          ) : (
            <>
              {span > 0 && playhead < domainMin && (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 -translate-y-1/2 pointer-events-none font-mono text-[8px] leading-none select-none"
                  style={{ left: 2, color: "rgb(var(--r1-rgb) / 0.7)", zIndex: 6 }}
                >
                  ‹
                </span>
              )}
              {span > 0 && playhead > domainMax && (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 -translate-y-1/2 pointer-events-none font-mono text-[8px] leading-none select-none"
                  style={{ right: 2, color: "rgb(var(--r1-rgb) / 0.7)", zIndex: 6 }}
                >
                  ›
                </span>
              )}

              {/* Handle - accent dot with soft glow. zIndex 5 keeps the cursor
                  above ticks/lanes/dots; see the progress-fill note above. */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-accent rounded-full shadow-[0_0_10px_rgb(var(--r1-rgb)/0.6)] pointer-events-none"
                style={{ left: `${progress * 100}%`, zIndex: 5 }}
              />
            </>
          )}
        </div>
        {/* With axisOnTop the hours stand between the track and the lanes. */}
        {axisOnTop ? axis : null}
        {lanes ? <LanesOutlet lanes={lanes} slot={slot} /> : null}
      </div>
      )}

      {/* Axis labels: serve the track and the lanes alike. */}
      {!folded && !axisOnTop ? axis : null}
    </Panel>
  );
}
