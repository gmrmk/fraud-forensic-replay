// frontend/investigator/src/components/timeline/KindLines.tsx
// The Timeline's own depth: a
// control on the rail, over the name column, that reads the whole case ("Total Events: 417"), and,
// once it is open, a line for each kind of event between the rail and the track. A line has the
// kind's label (the manifest's, printed as it is), its count as text, and a copy of each of its
// events inside the window. The copies are the track's nodes drawn again (`RowDot` with `mirror`):
// out of the Tab order and out of the screen reader's list, so every event keeps one button, on the
// track. The lines take the set the track draws, so a row that is alone narrows them with it, and so
// do the Layers switches: while they hide events the control reads "Total Events: shown / all".
//
// Nothing here reads the playhead: the head's line through the block is `HeadSled`, the one part
// that follows it, so a tick redraws no line and no copy.
import { memo, useMemo, type ReactElement } from "react";
import { BAR_FOCUS_RING, DEPTH_MAX_LINES, GUTTER, LINE, OPEN } from "../../lib/bar-metrics";
import type { BucketGrid } from "../../lib/head-edge";
import type { KindLine } from "../../lib/kind-lines";
import type { RowTick } from "../../lib/row-ticks";
import type { LanesSlot } from "../../lib/timeline-lanes";
import type { TimeForm } from "../../lib/time-words";
import { kindLineWords, kindsFoldName, kindsFoldWords, kindsGroupName, totalLabel } from "../../lib/tooltip-words/kinds";
import { useClockForm } from "../../store/clock-form";
import { useSessionFilter } from "../../store/session-filter";
import { tip } from "../ui/Tip";
import { FoldMark } from "./FoldMark";
import { HeadSled } from "./head/HeadSled";
import { RowDot, type RowDotProps } from "./rows/RowDot";

export interface KindsFoldProps {
  /** The app's word for one event, in the singular. */
  noun: string;
  /** The events the lines hold: the whole case, or the row that is alone. */
  count: number;
  /** Every event of the track before the Layers switches; the control prints `count / all` when they differ. */
  all?: number;
  open: boolean;
  onToggle: () => void;
  /** The id of the block of lines. It is named in `aria-controls` only while the block is open,
   *  since the block is not in the document otherwise. */
  listId: string;
  /** The name of the row that is alone, or null; it changes what the tooltip says the count covers. */
  soloName: string | null;
}

/** The control on the rail. A plain triangle, since the Timeline draws no small version of the depth
 *  it opens: closed, the lines are not drawn at all. Its name is the visible text, then its state and
 *  its press. */
export function KindsFold({ noun, count, all = count, open, onToggle, listId, soloName }: KindsFoldProps) {
  return (
    <button
      type="button"
      data-kinds-fold
      aria-expanded={open}
      {...(open ? { "aria-controls": listId } : {})}
      aria-label={kindsFoldName(noun, count, open, all)}
      onClick={onToggle}
      {...tip(kindsFoldWords(noun, count, open, soloName, all))}
      className={`flex min-w-0 items-center whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.18em] text-text ${BAR_FOCUS_RING}`}
      style={{ height: "100%" }}
    >
      <FoldMark open={open} />
      <span className="min-w-0 truncate">{totalLabel(noun, count, all)}</span>
    </button>
  );
}

/** What a copy needs to draw and to speak; the rows' dots take the same. */
type DotKit = Pick<RowDotProps, "paint" | "onPanel" | "kindFor" | "kindLabel" | "onActivate">;

export interface KindLinesProps extends DotKit {
  /** The lines to draw, from `kindLines`. */
  lines: readonly KindLine[];
  /** The events the track draws; a line keeps the ones of its kind that are inside the window. */
  ticks: readonly RowTick[];
  slot: LanesSlot;
  /** The lanes' bucket grids, which set where the faint part of the head's line starts. */
  grids: readonly BucketGrid[];
  prominence: number;
  /** The id the control's `aria-controls` names. */
  listId: string;
  noun: string;
  /** The name of the row that is alone, or null. */
  soloName: string | null;
  /** True while the Layers switches hide events of the track: a name cell then says what the track draws. */
  hidden?: boolean;
}

const NO_COPIES: readonly RowTick[] = [];

/** The lines, each as high as a line of an open row's nodes and in its style. */
export const KindLines = memo(function KindLines({ lines, ticks, slot, grids, prominence, paint, onPanel, kindFor, kindLabel, onActivate, listId, noun, soloName, hidden = false }: KindLinesProps) {
  const selectedSessionId = useSessionFilter((s) => s.selectedSessionId);
  const form: TimeForm = useClockForm((s) => s.h24) ? "24h" : "12h";
  const { domainMin, domainMax } = slot.project;
  // The copies of each kind, inside the window.
  const byKind = useMemo(() => {
    const map = new Map<string, RowTick[]>();
    for (const t of ticks) {
      if (t.t < domainMin || t.t > domainMax) continue;
      let list = map.get(t.kind);
      if (!list) map.set(t.kind, (list = []));
      list.push(t);
    }
    return map;
  }, [ticks, domainMin, domainMax]);

  if (lines.length === 0) return null;
  const rows: ReactElement[] = lines.map((line) => (
    <div
      key={line.kind}
      role="listitem"
      data-kind-line={line.kind}
      className="flex"
      style={{ height: LINE, borderBottom: "1px solid rgb(var(--text-rgb) / 0.05)", backgroundColor: "rgb(var(--text-rgb) / 0.03)" }}
    >
      <div
        data-kind-name
        {...tip(kindLineWords(line.name, line.count, noun, soloName, hidden))}
        className="flex shrink-0 items-center gap-1.5 overflow-hidden font-mono text-[8px] uppercase tracking-[0.18em] text-text"
        style={{ width: GUTTER, paddingLeft: OPEN + 2, paddingRight: 2 }}
      >
        <span data-kind-label className="min-w-0 truncate">
          {line.name}
        </span>
        <span data-kind-count className="shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
          {line.count}
        </span>
      </div>
      <div data-kind-plot className="relative min-w-0 flex-1 cursor-pointer select-none" onMouseDown={slot.onPlotMouseDown}>
        {(byKind.get(line.kind) ?? NO_COPIES).map((tick) => (
          <RowDot
            key={tick.id}
            tick={tick}
            left={slot.project.pct(tick.t)}
            prominence={prominence}
            mirror
            paint={paint}
            onPanel={onPanel}
            kindFor={kindFor}
            kindLabel={kindLabel}
            selectedSessionId={selectedSessionId}
            form={form}
            onActivate={onActivate}
          />
        ))}
      </div>
    </div>
  ));
  return (
    <div id={listId} data-kind-lines className="relative">
      {/* More kinds than a block of depth lines shows: it scrolls. */}
      <div
        role="list"
        aria-label={kindsGroupName(noun)}
        style={{ maxHeight: DEPTH_MAX_LINES * LINE, overflowY: "auto", scrollbarWidth: "none" }}
      >
        {rows}
      </div>
      {/* The head's line runs from the tab through these lines to the track. */}
      <HeadSled project={slot.project} grids={grids} left={GUTTER} />
    </div>
  );
});
