/**
 * The investigator's paths on the Timeline's track: one dashed neutral line through the stops in their
 * order and a numbered square plate for each stop inside the visible window, the first plate carrying
 * the lens. Plates of one path that would touch on the track join into one plate that reads their numbers
 * (the track's measured width is the one new input; see `joinTimelinePlates`). It mounts in the Timeline
 * layer, so it draws only where the track is drawn (not while the bar is folded) and only on the track;
 * the open bar's rows do not carry it.
 *
 * The line is an svg of `<line>` elements placed in percent (an svg `points` list cannot take percent),
 * one for each stretch between two stops, clipped by the svg's own box where a stop lies outside the
 * window. It runs over a casing: an unbroken, wider line of the same stretch in the Timeline panel's own
 * glass tint, drawn first for every path, so the dashes read against the tint and not against the lane
 * line or a dot's glow under them. Where the line passes a data dot that is not one of its stops it leaves
 * a gap of 4 px radius (the casing too): an svg mask in user space (a white rectangle over the whole box
 * and one black circle for each dot), since a mask in the default bounding-box units would mask a
 * horizontal line whole (its box has no height). A stretch is one `<line>`, so the dash pattern starts
 * again at each stop (a deliberate limit).
 *
 * Stacking: the svg is at z 2, under the dots (z 3), and the plates at z 4, over them. The wrapper has no
 * z-index, transform or opacity of its own, so these numbers meet the dots' in the layer's own stacking
 * context; path strength is put on each line and plate, never on the wrapper. The wrapper takes no
 * pointer, so a plate is never part of a dot's pile (the tooltip layer gathers siblings).
 *
 * The playhead is read only as which stops are after it (`aheadKey`): a plate dims at 0.45 and the line
 * stays whole. A stop is drawn only when its record is found, shown and timed. A stop of a magnitude kind
 * (drawn as a lane under the track, with no dots) and a stop whose kind has no lane take the track's
 * middle.
 *
 * What this file does not do: it sets no type size above 8 px, reads no clock but the playhead, and draws
 * nothing for a path with no stop in view.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { StopPlate } from "./StopPlate";
import {
  AHEAD_OPACITY,
  DRAFT_ID,
  LINE,
  PLATE,
  aheadKey,
  drawnPaths,
  gapDots,
  joinTimelinePlates,
  stopKeysOf,
  timelineGeometry,
  type DrawnStops,
  type TimelinePath,
} from "./path-geometry";
import { plateWords } from "./plate-words";
import { plateLabel } from "../../lib/tooltip-words/paths";
import { pathStops } from "../../lib/marks/select";
import { useCaseLookup, useMarksStore, useShowInputs } from "../../store/marks";
import { useClockForm } from "../../store/clock-form";
import { useNavigation } from "../../store/navigation";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { tip } from "../ui/Tip";
import { usePathSession } from "./path-session";

interface Props {
  /** The visible window's start (ms) and width (ms): the Timeline layer's own. */
  windowMin: number;
  span: number;
  /** The lanes' vertical places, in percent of the track, by lane kind (the layer's `f2.lanePositions`). */
  lanes: Readonly<Record<string, number>>;
  /** The dot's own rule for the lane a kind rides (the layer's `f2.kindFor`). */
  kindFor: (kind: string) => string;
  /** The data dots in the window, as the layer builds them. */
  ticks: readonly { id: string; kind: string; pct: number }[];
  /** The track's size in chrome px; a test gives it, else it is measured. */
  trackPx?: { width: number; height: number };
}

const MIDDLE = 50;
/** The track before it is measured: nothing joins. */
const NO_TRACK = { width: 0, height: 0 };
/** A number for a style or an attribute: the geometry's float noise is cut at three places. */
const num = (n: number): number => Math.round(n * 1000) / 1000;
const percent = (n: number): string => `${num(n)}%`;

export function CustomPathTimeline({ windowMin, span, lanes, kindFor, ticks, trackPx }: Props) {
  const saved = useMarksStore((s) => s.paths);
  const scenario = useMarksStore((s) => s.scenario);
  const draft = usePathSession((s) => s.draft);
  const hidden = usePathSession((s) => s.hidden);
  const chosen = usePathSession((s) => s.chosen);
  const lookup = useCaseLookup();
  const show = useShowInputs();
  const nodes = useSchema((s) => s.nodes);
  const h24 = useClockForm((s) => s.h24);
  // An id for the masks: only letters, digits, underscore and hyphen, whatever form `useId` gives.
  const maskBase = `cpm${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;

  const items = useMemo<DrawnStops[]>(
    () => drawnPaths(saved, hidden, draft, chosen, scenario ?? "").map((d) => ({ ...d, stops: pathStops(d.path, lookup, show) })),
    [saved, hidden, draft, chosen, scenario, lookup, show],
  );

  // The playhead, read only as which stops are after it: a string that changes at a crossing.
  const ahead = usePlayhead((s) => {
    const windowed = s.maxTime > s.minTime;
    return items.map((i) => aheadKey(i.stops, s.playhead, windowed)).join("|");
  });

  // The dot's own rule for a lane, except that a magnitude kind (no dots) takes the middle.
  const magnitude = useMemo(() => new Set(nodes.filter((n) => n.magnitude).map((n) => n.kind)), [nodes]);
  const laneOf = useMemo(
    () =>
      (kind: string): number =>
        magnitude.has(kind) ? MIDDLE : (lanes[kindFor(kind)] ?? MIDDLE),
    [magnitude, lanes, kindFor],
  );

  const paths = useMemo(() => timelineGeometry(items, windowMin, span, laneOf), [items, windowMin, span, laneOf]);
  const playhead = useMemo(() => {
    const p = usePlayhead.getState();
    return { value: p.playhead, windowed: p.maxTime > p.minTime };
    // `ahead` stands for the playhead: it is what changes when a plate's dimming does. `items` is in the
    // list because a replaced set of paths can give the same string against a newer playhead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, ahead]);

  // The track's size in chrome px, measured from the wrapper's own box (`clientWidth` and `clientHeight`,
  // never a rect: the page zooms its text step, as the notes layer's track does). A test gives `trackPx`.
  const host = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ width: number; height: number }>(NO_TRACK);
  const drawn = paths.length > 0;
  useLayoutEffect(() => {
    const el = host.current;
    if (trackPx !== undefined || !el || typeof ResizeObserver === "undefined") return;
    const read = (): void => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setMeasured((m) => (m.width === width && m.height === height ? m : { width, height }));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [trackPx, drawn]);
  const track = trackPx ?? measured;
  // One path's plates are joined at a time, so plates of two paths never join. Nothing here reads a clock:
  // the join follows the visible window through `paths` and the bar's width through the observer.
  const groups = useMemo(
    () => paths.map((p) => joinTimelinePlates(p.plates, { width: track.width, height: track.height })),
    [paths, track.width, track.height],
  );

  if (paths.length === 0) return null;
  return (
    <div ref={host} className="pointer-events-none absolute inset-0" data-custom-path-timeline>
      <svg
        aria-hidden="true"
        width="100%"
        height="100%"
        focusable="false"
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 2, overflow: "hidden" }}
      >
        <defs>
          {paths.map((p, i) => (
            <PathMask key={p.pathId} id={`${maskBase}-${i}`} path={p} item={items[i]} ticks={ticks} laneOf={laneOf} />
          ))}
        </defs>
        {/* Every casing before any dash, so one path's casing never covers another path's dashes. The
            casing has the dash line's ends, mask and strength; its tint is the Timeline panel's own glass. */}
        {paths.map((p, i) =>
          p.points.slice(1).map((to, j) => {
            const from = p.points[j];
            return (
              <line
                key={`${p.pathId}-casing-${j}`}
                x1={percent(from.x)}
                y1={percent(from.y)}
                x2={percent(to.x)}
                y2={percent(to.y)}
                stroke="rgb(var(--glass-tint))"
                strokeWidth={LINE.timeline.casingWidth}
                strokeLinecap="butt"
                opacity={p.op}
                mask={`url(#${maskBase}-${i})`}
                data-path-casing={p.pathId}
              />
            );
          }),
        )}
        {paths.map((p, i) =>
          p.points.slice(1).map((to, j) => {
            const from = p.points[j];
            return (
              <line
                key={`${p.pathId}-${j}`}
                x1={percent(from.x)}
                y1={percent(from.y)}
                x2={percent(to.x)}
                y2={percent(to.y)}
                stroke="rgb(var(--text-rgb) / 0.85)"
                strokeWidth={LINE.timeline.width}
                strokeDasharray={LINE.timeline.dash}
                strokeLinecap="butt"
                opacity={p.op}
                mask={`url(#${maskBase}-${i})`}
                data-path-line={p.pathId}
              />
            );
          }),
        )}
      </svg>
      {groups.flatMap((g) =>
        g.map((pl) => {
          const words = plateWords(pl.nums, pl.total, pl.pathName, pl.stops, nodes, h24);
          // Dimmed only when every stop in the plate is after the playhead.
          const dim = (pl.pathId === DRAFT_ID ? 1 : pl.op) * (pl.stops.every((s) => isAheadOf(s, playhead)) ? AHEAD_OPACITY : 1);
          // The plate's right edge hangs `nudge` px left of its first stop's point and a joined plate reaches
          // `grow` px further right, so a single plate's left is `calc(x% - 3px)` as it always was.
          const dx = pl.grow - PLATE.timeline.nudge;
          return (
            <button
              type="button"
              key={pl.key}
              data-path-plate={pl.key}
              aria-label={words.name}
              {...tip(words.lines)}
              // A press on a plate is not a press on the track: it must not seek or start a scrub.
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                // The press goes to the lowest-numbered stop in the plate, as the globe's merged plate does.
                const first = pl.stops[0].info;
                if (first !== null) useNavigation.getState().navigate(first.match);
              }}
              className="pointer-events-auto absolute m-0 block cursor-pointer border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-signal"
              style={{
                // The plate's bottom-right corner is `nudge` px up and left of the dot's centre; a second
                // path's plate for the same dot steps further up (offsetY is 0 or negative).
                left: `calc(${percent(pl.x)} ${dx < 0 ? "-" : "+"} ${num(Math.abs(dx))}px)`,
                top: `calc(${percent(pl.y)} - ${PLATE.timeline.nudge - pl.offsetY}px)`,
                transform: "translate(-100%, -100%)",
                zIndex: 4,
              }}
            >
              <StopPlate label={plateLabel(pl.nums)} lens={pl.lens} size="timeline" opacity={dim === 1 ? undefined : dim} />
            </button>
          );
        }),
      )}
    </div>
  );
}

/** The `ahead` test over the playhead read once for this render. */
function isAheadOf(stop: DrawnStops["stops"][number], p: { value: number; windowed: boolean }): boolean {
  const time = stop.info === null ? null : stop.info.time;
  return p.windowed && time !== null && time > p.value;
}

/** One path's mask: the whole box white, a black circle at each data dot the line passes that is not a stop. */
function PathMask({
  id,
  path,
  item,
  ticks,
  laneOf,
}: {
  id: string;
  path: TimelinePath;
  item: DrawnStops;
  ticks: Props["ticks"];
  laneOf: (kind: string) => number;
}) {
  const gaps = path.xRange === null ? [] : gapDots(ticks, stopKeysOf(item.path), laneOf, path.xRange.min, path.xRange.max);
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
      <rect x="0" y="0" width="100%" height="100%" fill="white" />
      {gaps.map((g, i) => (
        // Keyed by position: two dots at one time on one lane make two equal points.
        <circle key={i} cx={percent(g.x)} cy={percent(g.y)} r={LINE.timeline.gapRadius} fill="black" />
      ))}
    </mask>
  );
}
