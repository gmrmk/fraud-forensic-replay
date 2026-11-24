/**
 * The bar's data plumbing: the case's step events, the
 * rows built from them, the lanes, and the one derivation of a solo that narrows every list the bar
 * draws. Everything here is keyed on data and on the stores that hold data (the manifest, the
 * grouping, the Layers switches, the solo), and nothing reads the playhead except the window, which changes at a zoom and
 * never at a tick. So a tick redraws none of what this returns.
 *
 * A solo is the store's `{ field, value }`. It applies only while it names a named row of the
 * grouping in force. Once rows exist, a solo that names none is cleared (a change of grouping or of
 * data ends it); before rows exist it stays, and nothing narrows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BarSize } from "../../lib/bar-size";
import { caseStepEvents, trackNodes, type CaseStepEvent } from "../../lib/case-events";
import type { Entity } from "../../lib/entity";
import { kindOnPanelVar } from "../../lib/entity-palette";
import type { BucketGrid } from "../../lib/head-edge";
import { kindLines, kindsBlockPx, kindsTotal, type KindLine } from "../../lib/kind-lines";
import { buildCaseLanes, laneDeclarations, laneEntities } from "../../lib/lane-feed";
import { buildLaneLines, laneLinesPx, type LaneLine } from "../../lib/lane-lines";
import { nodeProminence } from "../../lib/node-prominence";
import { rowTicks, type RowTick } from "../../lib/row-ticks";
import { validLaneDepths } from "../../lib/scenarios";
import { narrowByShown } from "../../lib/marks/draw";
import type { PivotContext } from "../../lib/matches";
import { narrowBySolo, soloIds } from "../../lib/solo";
import { magnitudeNodes, type LaneModel } from "../../lib/timeline-lanes";
import { buildTracks, rowValue, type TrackSet } from "../../lib/tracks";
import { KIND_SLOT } from "../../theme/entity-mapping";
import { useStoryInk } from "../../store/kind-ink";
import { useLayers } from "../../store/layers";
import { useShowInputs } from "../../store/marks";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useSolo } from "../../store/solo";
import { useTrackBy } from "../../store/track-by";
import type { AccountEvent, LoginEvent, Transaction, Transfer } from "../../types";
import { useOnMenu } from "../LayerRow";
import { makePaint } from "./CaseTimelineLayer";

const NO_ENTITIES: Entity[] = [];

/** The case's rows, as the Timeline is given them. */
export interface BarCase {
  transactions: Transaction[];
  logins?: LoginEvent[];
  accountEvents?: AccountEvent[];
  transfers?: Transfer[];
  genericEntities?: Entity[];
}

/** What a row's dots need to draw and to speak. */
export interface DotModel {
  paint: (kind: string, alpha?: number | string) => string;
  onPanel: (kind: string) => string;
  kindFor: (kind: string) => string;
  kindLabel: (kind: string) => string;
}

export interface BarTracks {
  /** Every step event of the case, in time order. */
  allEvents: CaseStepEvent[];
  /** The events the step keys walk: the soloed row's, or `allEvents` itself with no solo. */
  stepEvents: CaseStepEvent[];
  /** The rows, or null when the pack declares no usable grouping. Built from the records the switches
   *  show with no exception for the selected record: a row is a sum over a kind. */
  set: TrackSet | null;
  /** Every dot of the case as a row draws it. */
  ticks: RowTick[];
  /** The named row that is alone: its key and its name; null when none is. */
  solo: { key: string; name: string } | null;
  /** The lists the track and the day band draw: narrowed to the solo, or the case's own (the selected
   *  record kept against the switches; the rows and the lanes read the strict lists, not these). */
  rows: BarCase;
  /** The case narrowed by the Layers switches, before the solo: the today bucket reads it. */
  shownCase: BarCase;
  /** True while the Layers switches take at least one record out of the rows' lists (the strict narrowing,
   *  which loses the selected record too); false with nothing off. The rows' section leaves with it once no
   *  named row is left. */
  switchesHide: boolean;
  /** The lanes, built on the soloed row's rows while one is alone, and like the rows with no exception
   *  for the selected record. */
  lanes: LaneModel[];
  /** The bucket grid of each lane, which sets where the faint part starts. */
  grids: BucketGrid[];
  dots: DotModel;
  /** How strongly the nodes draw, by how many are in the zoom window. */
  prominence: number;
  /** The events the track draws as dots: the soloed row's while a row is alone, else `ticks` itself. */
  trackTicks: RowTick[];
  /** The Timeline's depth: a line for each kind of event, closed until it is opened. It
   *  has no line for a pack with no rows (no name column) or with fewer than two kinds. `all`: the
   *  events of the track before the Layers switches, the row's while one is alone; `offered`: the case
   *  has two kinds of event or more, whatever the switches hide. */
  kinds: { lines: KindLine[]; total: number; all: number; offered: boolean; open: boolean; toggle: () => void };
  /** The lanes' depth, by the lane's id: only a lane that declares one and has lines. */
  laneLines: ReadonlyMap<string, LaneDepthLines>;
  setLaneLinesOpen: (id: string, open: boolean) => void;
  /** The px the open depth lines take, which the rows' list gives back. A lane that is folded
   *  draws no lines, so it counts for nothing. */
  depthPx: number;
}

/** One lane's lines: the manifest's label of the field they come from, and whether they are open. */
export interface LaneDepthLines {
  label: string;
  lines: LaneLine[];
  open: boolean;
}

export function useBarTracks(data: BarCase): BarTracks {
  const { transactions: wholeTx, logins: wholeLogins, accountEvents: wholeAe, transfers: wholeTr, genericEntities: wholeGenericProp } = data;
  const wholeGeneric = wholeGenericProp ?? NO_ENTITIES;
  const nodes = useSchema((s) => s.nodes);
  const rows = useSchema((s) => s.rows);
  const fields = useSchema((s) => s.fields);
  const declared = useSchema((s) => s.lanes);
  const by = useTrackBy((s) => s.by);
  const solo = useSolo((s) => s.solo);
  const windowMin = usePlayhead((s) => s.windowMin);
  const windowMax = usePlayhead((s) => s.windowMax);
  const onMenu = useOnMenu();
  // A story's own kinds' colours for the live theme and colour mode; a kind with no entry keeps its manifest colour.
  const ink = useStoryInk();

  // The Layers switches (C3 c, C5 b) narrow every list the bar draws, before the solo: one derivation,
  // the one function's (lib/marks/draw). With nothing off narrowByShown returns its input itself, so the
  // lists are the case's own by reference and nothing is rebuilt.
  const show = useShowInputs();
  const wholeCtx = useMemo<PivotContext>(
    () => ({ transactions: wholeTx, logins: wholeLogins ?? [], places: [], accountEvents: wholeAe, transfers: wholeTr, entities: wholeGeneric }),
    [wholeTx, wholeLogins, wholeAe, wholeTr, wholeGeneric],
  );
  const shownCtx = useMemo(() => {
    const out = narrowByShown(wholeCtx, show);
    return out === wholeCtx ? null : out;
  }, [wholeCtx, show]);
  // The lists that mark single records (the dots and ticks, the step keys, the kind lines, the counts)
  // keep the selected record against every switch, as the model's rule has it. The lists that sum over a
  // kind do not: the track's rows and the measure lanes are the model's function again with the selection
  // cleared (the rows leave with the kind, selected record or not). A pinned
  // record is no exception either: the pin's win (PIN_WINS) is still off, so it is hidden like any
  // other record today, and `pinWins: false` here keeps it out of the sums once the win lands. With
  // nothing off, or with no record selected, this is the lenient narrowing itself (null, or the same
  // object), and with nothing off the model hands back its input, so nothing is rebuilt.
  const strictCtx = useMemo(() => {
    if (show.selected === null && !show.pinWins) return shownCtx;
    const out = narrowByShown(wholeCtx, { ...show, selected: null, pinWins: false });
    return out === wholeCtx ? null : out;
  }, [wholeCtx, show, shownCtx]);
  // The case as the sums read it, and whether that is the lenient case itself.
  const rowCtx = strictCtx ?? wholeCtx;
  const rowsAreShown = strictCtx === shownCtx;
  const transactions = shownCtx ? shownCtx.transactions : wholeTx;
  const logins = shownCtx ? shownCtx.logins : wholeLogins;
  const accountEvents = shownCtx ? shownCtx.accountEvents : wholeAe;
  const transfers = shownCtx ? shownCtx.transfers : wholeTr;
  const genericEntities = shownCtx ? shownCtx.entities : wholeGenericProp;
  const generic = genericEntities ?? NO_ENTITIES;
  // The case before the solo, as the switches leave it: the today bucket reads it.
  const shownCase = useMemo<BarCase>(() => ({ transactions, logins, accountEvents, transfers, genericEntities }), [transactions, logins, accountEvents, transfers, genericEntities]);

  const allEvents = useMemo(
    () => caseStepEvents({ transactions, logins: logins ?? [], accountEvents: accountEvents ?? [], transfers: transfers ?? [], entities: generic }, nodes),
    [transactions, logins, accountEvents, transfers, generic, nodes],
  );
  // The rows (and so their lists, their counts and the header's count, and their bars) are built from
  // the strict lists; the ticks that the rows place stay the lenient ones, and a tick no row holds is
  // not drawn in a row (TrackRows, rows-small).
  const rowEvents = useMemo(
    () =>
      rowsAreShown
        ? allEvents
        : caseStepEvents({ transactions: rowCtx.transactions, logins: rowCtx.logins, accountEvents: rowCtx.accountEvents ?? [], transfers: rowCtx.transfers ?? [], entities: rowCtx.entities ?? NO_ENTITIES }, nodes),
    [rowsAreShown, allEvents, rowCtx, nodes],
  );
  const rowEntities = rowCtx.entities ?? NO_ENTITIES;
  const set = useMemo(() => buildTracks({ events: rowEvents, entities: rowEntities, nodes, rows, fields, by }), [rowEvents, rowEntities, nodes, rows, fields, by]);
  // The rows' bar is drawn in the colour of the node that makes it (lib/tracks.ts takes the first magnitude
  // node); every other memo below reads `set`, which keeps the manifest's colour.
  const inkedSet = useMemo(() => {
    const k = magnitudeNodes(nodes)[0]?.kind;
    const m = k ? ink.get(k)?.mark : undefined;
    return set && m ? { ...set, barPalette: m } : set;
  }, [set, nodes, ink]);
  const ticks = useMemo(() => rowTicks(allEvents), [allEvents]);

  // The solo applies while it names a named row of the grouping in force. The value is read as the
  // rows read theirs (`rowValue`), so a padded or a numeric value still finds its row.
  const alone = useMemo(() => {
    if (!solo || !set || solo.field !== set.by) return null;
    const track = set.tracks.find((t) => !t.rest && t.key === `v:${rowValue(solo.value)}`);
    return track ? { key: track.key, name: track.name } : null;
  }, [solo, set]);

  // A stored solo that names no row is cleared, so no solo is on without a row to show for it. It
  // waits until rows exist: with no grouping, or no event loaded yet, every solo would name none.
  // Limit: the load is read from the rows themselves (`tracks.length`), not from a flag of the store.
  const rowsLoaded = set !== null && set.tracks.length > 0;
  useEffect(() => {
    if (rowsLoaded && solo && !alone) useSolo.getState().clear();
  }, [rowsLoaded, solo, alone]);

  // One derivation: every list the bar draws narrows through it.
  const narrowed = useMemo(
    () =>
      alone && solo
        ? narrowBySolo({ transactions, logins: logins ?? [], places: [], accountEvents, transfers, entities: generic }, solo)
        : null,
    [alone, solo, transactions, logins, accountEvents, transfers, generic],
  );
  const lists = useMemo<BarCase>(
    () =>
      narrowed
        ? { transactions: narrowed.transactions, logins: narrowed.logins, accountEvents: narrowed.accountEvents, transfers: narrowed.transfers, genericEntities: narrowed.entities }
        : { transactions, logins, accountEvents, transfers, genericEntities },
    [narrowed, transactions, logins, accountEvents, transfers, genericEntities],
  );
  const stepEvents = useMemo(
    () =>
      narrowed
        ? caseStepEvents({ transactions: narrowed.transactions, logins: narrowed.logins, accountEvents: narrowed.accountEvents ?? [], transfers: narrowed.transfers ?? [], entities: narrowed.entities ?? [] }, nodes)
        : allEvents,
    [narrowed, nodes, allEvents],
  );

  const laneKinds = useMemo(() => new Set(laneDeclarations(nodes, declared).flatMap((d) => d.kinds)), [nodes, declared]);
  // The measure lanes read the strict lists, as the rows do: a lane is a sum over a kind. A solo narrows
  // them the same way it narrows the lenient lists (the model's own derivation, once more).
  const laneRows = useMemo(() => laneEntities(rowCtx, laneKinds), [rowCtx, laneKinds]);
  const rowNarrowed = useMemo(
    () => (rowsAreShown ? narrowed : alone && solo ? narrowBySolo(rowCtx, solo) : null),
    [rowsAreShown, narrowed, alone, solo, rowCtx],
  );
  const aloneRows = useMemo(() => (rowNarrowed ? laneEntities(rowNarrowed, laneKinds) : null), [rowNarrowed, laneKinds]);
  const lanes = useMemo(() => buildCaseLanes(nodes, laneRows, declared, aloneRows), [nodes, laneRows, declared, aloneRows]);
  // The lanes are drawn in their kind's colour; the grids below keep reading `lanes`, whose shape is the same.
  const inkedLanes = useMemo(
    () =>
      lanes.map((l) => {
        const m = ink.get(l.kind)?.mark;
        return m ? { ...l, palette: m } : l;
      }),
    [lanes, ink],
  );
  const grids = useMemo(
    () => lanes.filter((l) => l.step > 0 && l.bars.length > 0).map((l) => ({ step: l.step, firstBucketStart: l.bars[0].t })),
    [lanes],
  );

  const dots = useMemo<DotModel>(() => {
    const drawn = trackNodes(nodes);
    const genericKinds = drawn.filter((n) => !n.magnitude).map((n) => n.kind);
    const hex: Record<string, string> = Object.fromEntries(drawn.map((n) => [n.kind, ink.get(n.kind)?.mark ?? n.palette]));
    const labels = new Map(nodes.map((n) => [n.kind, n.label || n.kind]));
    return {
      paint: makePaint(hex),
      // An on-panel variable is a hex colour and is read directly (FIX-2026-11-20).
      onPanel: (kind) => (hex[kind] ? onMenu(hex[kind]) : `var(${kindOnPanelVar(kind)})`),
      kindFor: (kind) => (Object.prototype.hasOwnProperty.call(KIND_SLOT, kind) || genericKinds.includes(kind) ? kind : "auth"),
      kindLabel: (kind) => labels.get(kind) ?? kind,
    };
  }, [nodes, onMenu, ink]);

  const prominence = useMemo(
    () => nodeProminence(ticks.filter((t) => t.t >= windowMin && t.t <= windowMax).length),
    [ticks, windowMin, windowMax],
  );

  // The Timeline's depth. The track draws the soloed row's events and the lines take that
  // set, so every copy has an original on the track; the lines themselves are the case's kinds.
  const trackTicks = useMemo(() => (narrowed ? rowTicks(stepEvents) : ticks), [narrowed, stepEvents, ticks]);
  // The control's "all": every event of the case before the switches (the row's own while one is alone).
  // With nothing off the shown ticks are the whole case's, so nothing more is built.
  const wholeTicks = useMemo(
    () => (shownCtx === null ? ticks : rowTicks(caseStepEvents({ transactions: wholeTx, logins: wholeLogins ?? [], accountEvents: wholeAe ?? [], transfers: wholeTr ?? [], entities: wholeGeneric }, nodes))),
    [shownCtx, ticks, wholeTx, wholeLogins, wholeAe, wholeTr, wholeGeneric, nodes],
  );
  const soloWhole = useMemo(
    () => (alone && solo ? soloIds(solo, { transactions: wholeTx, logins: wholeLogins ?? [], places: [], accountEvents: wholeAe, transfers: wholeTr, entities: wholeGeneric }) : null),
    [alone, solo, wholeTx, wholeLogins, wholeAe, wholeTr, wholeGeneric],
  );
  const allTicks = useMemo(() => (soloWhole ? wholeTicks.filter((t) => soloWhole.has(t.id)) : wholeTicks), [soloWhole, wholeTicks]);
  // The lines are the case's kinds (a solo moves no line); a kind whose every event the switches hide
  // leaves with them.
  const shownKinds = useMemo(() => new Set(ticks.map((t) => t.kind)), [ticks]);
  const kindList = useMemo(
    () => (set ? kindLines(trackTicks, dots.kindLabel, wholeTicks).filter((l) => shownKinds.has(l.kind)) : []),
    [set, trackTicks, dots.kindLabel, wholeTicks, shownKinds],
  );
  // The control is offered while the case has two kinds of event or more, whatever the switches hide.
  const offered = useMemo(() => set !== null && new Set(wholeTicks.map((t) => t.kind)).size >= 2, [set, wholeTicks]);
  const allTotal = useMemo(() => kindsTotal(kindLines(allTicks, dots.kindLabel, wholeTicks)), [allTicks, dots.kindLabel, wholeTicks]);
  const [kindsOpen, setKindsOpen] = useState(false);
  const toggleKinds = useCallback(() => setKindsOpen((o) => !o), []);
  const kinds = useMemo(
    () => ({ lines: kindList, total: kindsTotal(kindList), all: allTotal, offered, open: kindsOpen, toggle: toggleKinds }),
    [kindList, allTotal, offered, kindsOpen, toggleKinds],
  );

  // The lanes' depth: the manifest's split field for each lane that declares one, over the
  // rows the lane reads (the soloed row's while a row is alone). Lines need the name column.
  const depths = useMemo(() => validLaneDepths(declared, fields), [declared, fields]);
  const declarations = useMemo(() => laneDeclarations(nodes, declared), [nodes, declared]);
  const named = set !== null;
  const linesOf = useMemo(() => {
    const out = new Map<string, { label: string; lines: LaneLine[] }>();
    if (!named) return out;
    const pool = aloneRows ?? laneRows;
    for (const lane of lanes) {
      const depth = depths[lane.id];
      const decl = declarations.find((d) => d.id === lane.id);
      if (!depth || !decl) continue;
      const lines = buildLaneLines(pool, decl, depth.split, lane);
      if (lines.length > 0) out.set(lane.id, { label: depth.label, lines });
    }
    return out;
  }, [named, aloneRows, laneRows, lanes, depths, declarations]);
  const [openLanes, setOpenLanes] = useState<ReadonlySet<string>>(() => new Set());
  const setLaneLinesOpen = useCallback((id: string, open: boolean) => {
    setOpenLanes((prev) => {
      if (prev.has(id) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const laneLines = useMemo(
    () => new Map([...linesOf].map(([id, v]) => [id, { ...v, open: openLanes.has(id) }] as const)),
    [linesOf, openLanes],
  );
  const folded = useLayers((s) => s.collapsedLanes);
  const depthPx = useMemo(() => {
    let px = kindsOpen ? kindsBlockPx(kindList.length) : 0;
    for (const [id, d] of laneLines) if (d.open && !folded.includes(id)) px += laneLinesPx(d.lines.length, true);
    return px;
  }, [kindsOpen, kindList, laneLines, folded]);

  return { allEvents, stepEvents, set: inkedSet, ticks, solo: alone, rows: lists, shownCase, switchesHide: strictCtx !== null, lanes: inkedLanes, grids, dots, prominence, trackTicks, kinds, laneLines, setLaneLinesOpen, depthPx };
}

/** What a press on a folded section's button in a line for each section aims the focus at. */
type FoldAim = { lane: string | null };

/**
 * The bar's folds (calls 13 to 15). The size is the store's one saved value of three. Folding from
 * an open size leaves a line for each section (`stacked`); one more fold gives one line; a third
 * press opens the size the bar had. Whether the bar is on a line for each section or on one line is
 * held here, in memory: the store has the one value "line" for both, and a saved "line" opens on one
 * line. A pack with no section to draw folds straight to one line. A press on a section's button in
 * the stack opens the bar with that section open and moves nothing else; that button leaves the
 * page, so the focus goes to the section's control (the rows' or the lane's) once the bar is open.
 */
export function useBarFold(listId: string, hasSections: boolean) {
  const size = useLayers((s) => s.barSize);
  const setBarSize = useLayers((s) => s.setBarSize);
  const folded = size === "line";
  const [stack, setStack] = useState(false);
  const stacked = folded && stack;
  const before = useRef<BarSize>("middle");
  const aim = useRef<FoldAim | null>(null);

  const onFold = useCallback(() => {
    const current = useLayers.getState().barSize;
    if (current !== "line") {
      before.current = current;
      setBarSize("line");
      setStack(hasSections);
    } else if (stack) {
      setStack(false);
    } else {
      setBarSize(before.current);
    }
  }, [setBarSize, hasSections, stack]);
  const onRows = useCallback(() => setBarSize(useLayers.getState().barSize === "open" ? "middle" : "open"), [setBarSize]);
  const openRows = useCallback(() => {
    aim.current = { lane: null };
    setStack(false);
    setBarSize("open");
  }, [setBarSize]);
  const openLane = useCallback(
    (id: string) => {
      const layers = useLayers.getState();
      if (layers.collapsedLanes.includes(id)) layers.toggleLane(id);
      aim.current = { lane: id };
      setStack(false);
      setBarSize(before.current);
    },
    [setBarSize],
  );

  useEffect(() => {
    const goal = aim.current;
    if (!goal || folded) return;
    aim.current = null;
    const target =
      goal.lane === null
        ? document.querySelector<HTMLElement>(`[data-track-header] button[aria-controls="${listId}"]`)
        : [...document.querySelectorAll<HTMLElement>("[data-magnitude-lane]")].find((el) => el.getAttribute("data-magnitude-lane") === goal.lane)?.querySelector("button");
    target?.focus();
  }, [folded, listId]);

  return { size, folded, stacked, rowsOpen: size === "open", onFold, onRows, openRows, openLane };
}
