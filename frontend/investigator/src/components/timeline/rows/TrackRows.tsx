// frontend/investigator/src/components/timeline/rows/TrackRows.tsx
// The rows under the track: a header, then a scrolling list
// of named rows, then the rest rows at the foot. A row is a name cell and a plot aligned with the
// track above it; the plot holds the row's bars and its events as the same dots the track draws.
//
// The list is one Tab stop and a tree: the arrow keys move between rows (and an open row's lines),
// the right key opens a row and the left key folds it, Enter and Space put a row alone or take it
// back. The one stop
// is a roving tabindex: it stands on the row the keys last reached, or on the first row when that
// row has left, so the list is never without a stop. A row's triangle and the copies of nodes are
// tabindex -1 and aria-hidden. Nothing here reads a clock: the one thing that follows the
// playhead is the numbers at the line, in RowFigures, and the focused row's description.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BAR_FOCUS_RING, GUTTER, OPEN, ROW } from "../../../lib/bar-metrics";
import type { BucketGrid } from "../../../lib/head-edge";
import { nodeProminence } from "../../../lib/node-prominence";
import {
  barAt, cutName, figureLines, lineStopKey, nameChars, rowListHeight, rowsCountName, rowStops, stopAction, type RowTick,
} from "../../../lib/row-ticks";
import type { LanesSlot } from "../../../lib/timeline-lanes";
import { amount, nodeBrief, span, type TimeForm } from "../../../lib/time-words";
import { memberLineWords, restRowWords, rowOpenWords, rowWords } from "../../../lib/tooltip-words/rows";
import { soloWords } from "../../../lib/tooltip-words/solo";
import type { MemberLine, Track, TrackSet } from "../../../lib/tracks";
import { useClockForm } from "../../../store/clock-form";
import { usePlayhead } from "../../../store/playhead";
import { useSessionFilter } from "../../../store/session-filter";
import { useOnMenu } from "../../LayerRow";
import { tip } from "../../ui/Tip";
import { windowToChrome } from "../../../lib/text-size";
import { useTextSize } from "../../../store/text-size";
import { FoldMark } from "../FoldMark";
import { HeadSled } from "../head/HeadSled";
import { RowBars, RowDot, type RowDotProps } from "./RowDot";
import { RowFigures } from "./RowFigures";
import { TrackHeader } from "./TrackHeader";

/** What a row's dots need to draw and to speak; one object so a row's props stay short. */
type DotKit = Pick<RowDotProps, "paint" | "onPanel" | "kindFor" | "kindLabel" | "selectedSessionId" | "form" | "onActivate">;

const NAME_PAD_PX = 8;
const PLOT_PX = ROW - 5;
/** The row name's text box is the cell less this: padding 3 px each side, and a margin of -3 px on the left. */
const NAME_INSET_PX = 3;
// `truncate` is the one-line rule (nowrap, hidden overflow, ellipsis) for a row's name and a line's name
// at every depth; the script's cut below is an estimate of the same width and this is its guard.
const NAME_CLASS = "min-w-0 flex-1 cursor-pointer truncate font-mono text-[10px] text-text";

const NO_TICKS: readonly RowTick[] = [];

interface PlotProps {
  ticks: readonly RowTick[];
  /** True when the track also draws these dots, so these are copies. */
  mirror: boolean;
  bars: Track["bars"];
  barsName: string;
  top: number;
  set: TrackSet;
  slot: LanesSlot;
  prominence: number;
  fill: string;
  kit: DotKit;
}

/** A row's plot, or one of its lines': its bars, then its dots (copies, so out of the Tab order when mirrored). */
function Plot({ ticks, mirror, bars, barsName, top, set, slot, prominence, fill, kit }: PlotProps) {
  return (
    <div data-track-plot className="relative min-w-0 flex-1 cursor-pointer select-none" onMouseDown={slot.onPlotMouseDown}>
      <RowBars bars={bars} name={barsName} top={top} plotPx={PLOT_PX} set={set} project={slot.project} fill={fill} form={kit.form} />
      {ticks.map((tick) => (
        <RowDot key={tick.id} tick={tick} left={slot.project.pct(tick.t)} prominence={prominence} mirror={mirror} {...kit} />
      ))}
    </div>
  );
}

/** A member line of an open row: its name is a stop of the tree (level 2), its plot is aligned with the row's. */
function RowLine({ line, track, set, ticks, slot, prominence, fill, kit, tabKey }: Omit<PlotProps, "bars" | "barsName" | "top" | "mirror"> & { line: MemberLine; track: Track; tabKey: string | null }) {
  const key = lineStopKey(track.key, line.key);
  const events = line.events.map((e) => nodeBrief(e.words, e.t, kit.form));
  const sum = line.bars.length > 0 ? { barName: set.barName, amount: amount(line.total, set.barUnit) } : null;
  return (
    <div data-row-line className="flex" style={{ height: ROW, borderBottom: "1px solid rgb(var(--text-rgb) / 0.05)", backgroundColor: "rgb(var(--text-rgb) / 0.03)" }}>
      <div className="flex shrink-0 items-center" style={{ width: GUTTER, paddingLeft: OPEN + 2, paddingRight: NAME_PAD_PX }}>
        <div
          role="treeitem"
          aria-level={2}
          aria-label={line.name}
          data-stop={key}
          data-line-name
          tabIndex={tabKey === key ? 0 : -1}
          {...tip(memberLineWords(set.memberLabel, line.value, events, sum))}
          className={`${NAME_CLASS} cursor-default text-[8px] uppercase tracking-[0.18em] ${BAR_FOCUS_RING}`}
        >
          {line.name}
        </div>
      </div>
      <Plot ticks={ticks.filter((t) => line.ids.has(t.id))} bars={line.bars} barsName={`${track.name} · ${line.name}`} top={line.top} set={set} slot={slot} prominence={prominence} fill={fill} kit={kit} mirror />
    </div>
  );
}

/** The focused row's number at the line, in words. The selector answers with the start of the bar the
 *  playhead is in, so the row draws again when the hour changes and at no other tick. */
function useRowNumber(track: Track, set: TrackSet, enabled: boolean, form: TimeForm): string | null {
  const t = usePlayhead((s) => (enabled ? (barAt(track.bars, set.step, s.playhead)?.t ?? null) : null));
  return useMemo(() => {
    const bar = t === null ? null : track.bars.find((b) => b.t === t);
    return bar ? `${set.barName}: ${span(bar.t, set.step, form)} · ${amount(bar.value, set.barUnit)}` : null;
  }, [t, track, set, form]);
}

interface RowProps {
  track: Track;
  set: TrackSet;
  ticks: readonly RowTick[];
  slot: LanesSlot;
  prominence: number;
  fill: string;
  kit: DotKit;
  mirror: boolean;
  anyOpens: boolean;
  isOpen: boolean;
  soloed: boolean;
  /** The key of the one stop, which is also the row whose number the description carries. */
  tabKey: string | null;
  linesId: string;
  onSolo: (key: string) => void;
  onOpen: (key: string, open: boolean) => void;
}

const Row = memo(function Row({ track, set, ticks, slot, prominence, fill, kit, mirror, anyOpens, isOpen, soloed, tabKey, linesId, onSolo, onOpen }: RowProps) {
  const soloable = !track.rest;
  const openable = track.lines.length > 0;
  const number = useRowNumber(track, set, tabKey === track.key, kit.form);
  const sum = track.total > 0 ? { barName: set.barName, amount: amount(track.total, set.barUnit) } : null;
  const words = track.rest ? restRowWords(track.name, set.heading, track.kinds) : [...rowWords(set.heading, track.name, track.kinds, sum), ...soloWords(soloed)];
  const chars = nameChars(GUTTER - NAME_PAD_PX - NAME_INSET_PX - (anyOpens ? OPEN : 0));
  const rowProminence = Math.max(prominence, nodeProminence(ticks.length));
  return (
    <div data-track-group data-key={track.key} {...(isOpen ? { "data-open": "" } : {})} {...(soloed ? { "data-soloed": "" } : {})}>
      <div data-track-row className="flex" style={{ height: ROW, borderBottom: "1px solid rgb(var(--text-rgb) / 0.07)" }}>
        <div className="flex shrink-0 items-center" style={{ width: GUTTER, paddingRight: NAME_PAD_PX }}>
          {openable ? (
            // The triangle is for the pointer. The row's own stop opens and folds it with the arrow keys.
            <button
              type="button"
              data-row-open
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => onOpen(track.key, !isOpen)}
              {...tip(rowOpenWords(track.name, set.memberLabel, isOpen))}
              className="flex shrink-0 items-center font-mono text-[8px] text-text outline-none"
              style={{ width: OPEN, height: ROW - 1, padding: 0, opacity: isOpen ? 1 : 0.6 }}
            >
              <FoldMark open={isOpen} className="shrink-0" />
            </button>
          ) : anyOpens ? (
            <span aria-hidden="true" className="shrink-0" style={{ width: OPEN }} />
          ) : null}
          <div
            role="treeitem"
            aria-level={1}
            aria-label={track.name}
            {...(soloable ? { "aria-selected": soloed, "data-soloable": "" } : {})}
            {...(openable ? { "aria-expanded": isOpen, "aria-owns": isOpen ? linesId : undefined } : {})}
            data-stop={track.key}
            data-track-name
            tabIndex={tabKey === track.key ? 0 : -1}
            onClick={soloable ? () => onSolo(track.key) : undefined}
            {...tip([...words, number])}
            className={`${NAME_CLASS} ${BAR_FOCUS_RING}`}
            style={{ lineHeight: `${ROW - 5}px`, padding: "0 3px", marginLeft: -3, backgroundColor: soloed ? "rgb(var(--text-rgb) / 0.14)" : "transparent" }}
          >
            <span aria-hidden="true" data-name-text>
              {cutName(track.name, chars)}
            </span>
          </div>
        </div>
        <Plot ticks={ticks} bars={track.bars} barsName={track.name} top={set.scale ? set.scale.top : 0} set={set} slot={slot} prominence={rowProminence} fill={fill} kit={kit} mirror={mirror} />
      </div>
      {isOpen ? (
        <div id={linesId} role="group" data-row-lines>
          {track.lines.map((line) => (
            <RowLine key={line.key} line={line} track={track} set={set} ticks={ticks} slot={slot} prominence={rowProminence} fill={fill} kit={kit} tabKey={tabKey} />
          ))}
        </div>
      ) : null}
    </div>
  );
});

export interface TrackRowsProps {
  set: TrackSet;
  /** Every dot event of the case; a row keeps the ones inside the window. */
  ticks: readonly RowTick[];
  slot: LanesSlot;
  /** The lanes' bucket grids, which set where the faint part starts. */
  grids: readonly BucketGrid[];
  /** True while the track also draws these dots, so these are copies. */
  mirror: boolean;
  prominence: number;
  paint: RowDotProps["paint"];
  onPanel: RowDotProps["onPanel"];
  kindFor: RowDotProps["kindFor"];
  kindLabel: RowDotProps["kindLabel"];
  open: boolean;
  onToggle: () => void;
  onActivate: (id: string) => void;
  listId: string;
  /** The key of the row that is alone, or null; and the press that puts a row alone or takes it back. */
  soloKey: string | null;
  onSolo: (key: string) => void;
  /** The px that the open depth lines take; the list gives that room back, down to its floor. */
  depthPx?: number;
  /** Called with the key of the row the focus stands in (a member line gives its row's key), and with
   *  null when the focus leaves the list. The event handlers call it; no effect does. The slider's
   *  spoken value reads it for that row's number. */
  onFocusRow?: (key: string | null) => void;
  /** Px by which the line runs on under the rows to meet the lane's plot. */
  bleed?: number;
  /** The plot's width in px when the caller knows it; left out, the numbers read it from the page. */
  plotPx?: number;
}

export const TrackRows = memo(function TrackRows(props: TrackRowsProps) {
  const { set, ticks, slot, grids, prominence, open, onToggle, onActivate, listId, soloKey, onSolo, depthPx = 0, bleed = 0, plotPx } = props;
  const onMenu = useOnMenu();
  const form: TimeForm = useClockForm((s) => s.h24) ? "24h" : "12h";
  const selectedSessionId = useSessionFilter((s) => s.selectedSessionId);
  const [innerHeight, setInnerHeight] = useState(() => window.innerHeight);
  // The list's height is a share of the window's, applied inside the zoomed chrome: it enters as
  // the chrome's pixels, and a change of the step re-renders the rows.
  const textSize = useTextSize((s) => s.size);
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const tree = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const reveal = useRef<string | null>(null);

  useEffect(() => {
    const fit = () => setInnerHeight(window.innerHeight);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // The wheel over a name scrolls the rows; over a plot it zooms, as it does over the track. The zoom
  // listener sits on an ancestor, so a wheel that starts on a name is stopped here.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-track-name]")) e.stopPropagation();
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, set]);

  // The shown rows: with a row alone, the other rows leave the list, the rest rows among them.
  const alone = soloKey === null ? undefined : set.tracks.find((t) => t.key === soloKey && !t.rest);
  const named = useMemo(() => (alone ? [alone] : set.tracks.filter((t) => !t.rest)), [set, alone]);
  const rest = useMemo(() => (alone ? [] : set.tracks.filter((t) => t.rest)), [set, alone]);
  const anyOpens = useMemo(() => set.tracks.some((t) => t.lines.length > 0), [set]);
  const { domainMin, domainMax } = slot.project;
  const byKey = useMemo(() => {
    const map = new Map<string, RowTick[]>();
    for (const tick of ticks) {
      if (tick.t < domainMin || tick.t > domainMax) continue;
      const i = set.trackOf.get(tick.id);
      if (i === undefined) continue;
      const key = set.tracks[i].key;
      map.set(key, [...(map.get(key) ?? []), tick]);
    }
    return map;
  }, [set, ticks, domainMin, domainMax]);

  const stops = useMemo(() => rowStops([...named, ...rest], openKeys), [named, rest, openKeys]);
  // The stop stands on the row the keys last reached while that row is in the list, else on the first.
  const tabKey = stops.some((s) => s.key === activeKey) ? activeKey : (stops[0]?.key ?? null);

  const setRowOpen = useCallback((key: string, next: boolean) => {
    setOpenKeys((prev) => {
      const out = new Set(prev);
      if (next) out.add(key);
      else out.delete(key);
      return out;
    });
    reveal.current = next ? key : null;
  }, []);
  useEffect(() => {
    const key = reveal.current;
    reveal.current = null;
    if (!key) return;
    const group = [...(scroller.current?.querySelectorAll("[data-track-group]") ?? [])].find((g) => g.getAttribute("data-key") === key);
    group?.scrollIntoView?.({ block: "nearest" });
  }, [openKeys]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-stop]") : null;
    const from = el?.dataset.stop;
    if (!el || !from) return;
    if (e.key === "Enter" || e.key === " ") {
      if (el.hasAttribute("data-soloable")) {
        e.preventDefault();
        onSolo(from);
      }
      return;
    }
    const action = stopAction(stops, from, e.key);
    if (!action) return;
    e.preventDefault();
    if (action.open) setRowOpen(action.open.key, action.open.open);
    if (action.focus) {
      setActiveKey(action.focus);
      [...(tree.current?.querySelectorAll<HTMLElement>("[data-stop]") ?? [])].find((n) => n.dataset.stop === action.focus)?.focus();
    }
  };
  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const key = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-stop]")?.dataset.stop : undefined;
    if (!key) return;
    setActiveKey(key);
    props.onFocusRow?.(stops.find((s) => s.key === key)?.parent ?? key);
  };
  // A move from one stop to another inside the list leaves no gap: the focus is out only when it goes
  // to a place outside the list.
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) props.onFocusRow?.(null);
  };

  const fill = set.barPalette ? onMenu(set.barPalette) : "";
  const kit: DotKit = {
    paint: props.paint, onPanel: props.onPanel, kindFor: props.kindFor, kindLabel: props.kindLabel, selectedSessionId, form, onActivate,
  };
  const block = (tracks: readonly Track[]) =>
    tracks.map((track) => (
      <Row
        key={track.key}
        track={track}
        set={set}
        ticks={byKey.get(track.key) ?? NO_TICKS}
        slot={slot}
        prominence={prominence}
        fill={fill}
        kit={kit}
        mirror={props.mirror}
        anyOpens={anyOpens}
        isOpen={track.lines.length > 0 && openKeys.has(track.key)}
        soloed={alone === track}
        tabKey={tabKey}
        linesId={`${listId}-lines-${set.tracks.indexOf(track)}`}
        onSolo={onSolo}
        onOpen={setRowOpen}
      />
    ));
  const overlay = (tracks: readonly Track[]) => {
    const { lines, height } = figureLines(tracks, openKeys);
    return (
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: GUTTER, right: 0, height, pointerEvents: "none" }}>
        <RowFigures set={set} lines={lines} height={height} project={slot.project} form={form} plotPx={plotPx} />
      </div>
    );
  };

  return (
    <div data-track-rows style={{ marginTop: open ? 2 : 4 }}>
      <TrackHeader heading={set.heading} named={set.named} open={open} onToggle={onToggle} listId={listId} soloName={alone?.name ?? null} onClearSolo={() => alone && onSolo(alone.key)} />
      <div className="relative" hidden={!open}>
        <div id={listId} ref={tree} role="tree" aria-label={rowsCountName(set.heading, set.named)} onKeyDown={onKeyDown} onFocus={onFocus} onBlur={onBlur}>
          {/* More rows than fit: the list ends on half a row. A drawn scroll thumb read as a stray mark. */}
          <div
            ref={scroller}
            data-track-scroller
            className="relative overflow-y-auto"
            style={{ maxHeight: alone ? undefined : rowListHeight({ innerHeight: windowToChrome(innerHeight, textSize), named: named.length, rest: rest.length, depthPx }), scrollbarWidth: "none", borderTop: "1px solid rgb(var(--text-rgb) / 0.07)" }}
          >
            {block(named)}
            {overlay(named)}
          </div>
          {rest.length > 0 ? (
            <div data-track-rest className="relative" style={{ borderTop: "1px solid rgb(var(--text-rgb) / 0.2)" }}>
              {block(rest)}
              {overlay(rest)}
            </div>
          ) : null}
        </div>
        <HeadSled project={slot.project} grids={grids} left={GUTTER} bleed={bleed} />
      </div>
    </div>
  );
});
