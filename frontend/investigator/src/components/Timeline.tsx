/**
 * Timeline - the case-mode timeline. A THIN composer: it builds the
 * case readout (the time left and the day's count), the case day-density band, and the parts of
 * the open bar, then mounts the shared TimelineShell with the case data overlay (CaseTimelineLayer)
 * in its track slot.
 *
 * The neutral frame (Panel + data-eyes="TIMELINE-ROOT", readout/transport row, day-density band,
 * scrub track, axis labels) lives in TimelineShell. The case-only overlay (event dots, story
 * layers, transfer path, tooltip) lives in CaseTimelineLayer. The rows, the lanes, the solo and the
 * lane feed are built by useBarTracks; the head (the tab, the line and its veil) and the rows and
 * lanes are the parts of the playbar, wired here. The props are
 * UNCHANGED, so App.tsx still renders `<Timeline transactions=... logins=... .../>`.
 *
 * The bar draws the size the layers store holds: one line (the Timeline's fold), the middle size
 * (the open bar with its rows folded, the lanes open), or the open bar with the rows open. A pack
 * that declares no rows has no rows section and draws today's bar at either open size.
 *
 * The five settings in lib/bar-settings are mounted here without a branch, since no setting
 * reaches another option: the
 * rows' small version under the folded rows, the folded lane's small version in the lane's own
 * place, a line for each section on the first fold (one more fold gives one line), the lane's lines
 * and the Timeline's kind lines. The state they need is in useBarTracks (the data) and useBarFold.
 *
 * The playback driver (the direction-aware rAF loop) lives in usePlaybackDriver, mounted once in
 * App, NOT here. The slider's spoken value holds still while the playhead plays and is computed
 * once when playback stops.
 */
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { TimelineShell, type RailSlot } from "./timeline/TimelineShell";
import { CaseTimelineLayer } from "./timeline/CaseTimelineLayer";
import { NotesLayer } from "./notes/NotesLayer";
import { linkFromSelected, lookupFromContext } from "./notes/record-lookup";
import { placeNoteWindow } from "./notes/open-note";
import { noteOpenedFrom } from "../lib/window-focus";
import { NOTE_WINDOW_DIMS } from "../lib/window-dims";
import { chromeToWindowNow } from "../store/text-size";
import { MagnitudeLane } from "./timeline/MagnitudeLane";
import { LaneSmall } from "./timeline/LaneSmall";
import { LaneLines } from "./timeline/LaneLines";
import { KindLines, KindsFold } from "./timeline/KindLines";
import { CaseStrip } from "./timeline/CaseStrip";
import { TrackRows } from "./timeline/rows/TrackRows";
import { RowsSmall } from "./timeline/rows/RowsSmall";
import { HeadRail } from "./timeline/head/HeadRail";
import { HeadSled } from "./timeline/head/HeadSled";
import { HeadTab } from "./timeline/head/HeadTab";
import { useBarFold, useBarTracks } from "./timeline/useBarTracks";
import { useCaseDayCells } from "../lib/case-day-cells";
import { GUTTER } from "../lib/bar-metrics";
import { STACK_NAME_PX } from "../lib/bar-metrics-stack";
import { kindsBlockPx } from "../lib/kind-lines";
import { stepTarget } from "../lib/playhead-tools";
import { barAt } from "../lib/row-ticks";
import { amount, remaining, when, when24 } from "../lib/time-words";
import { timeLeftWords } from "../lib/tooltip-words/head";
import { buildTxDays, todayTotals } from "../lib/playhead-readout";
import { laneName, laneValueText, type LanesSlot } from "../lib/timeline-lanes";
import { selectionId } from "../lib/case-events";
import { usePlayhead } from "../store/playhead";
import { useNavigation } from "../store/navigation";
import { useLayers } from "../store/layers";
import { useClockForm } from "../store/clock-form";
import { useSelection } from "../store/selection";
import { useSolo } from "../store/solo";
import { useNotesStore } from "../store/notes";
import { usePivotStore } from "../store/pivot";
import { tip } from "./ui/Tip";
import type { Entity } from "../lib/entity";
import type { ScenarioAnnotation } from "../lib/scenarios";
import type { AccountEvent, Transaction, LoginEvent, Transfer } from "../types";

interface Props {
  transactions: Transaction[];
  logins?: LoginEvent[]; // optional during transition; Task 10 wires it required
  /** Behavioral kill-chain kinds (2026-06-10 realism program). Lanes appear
   *  only when a scenario carries them - Marcus's card-fraud pack has none. */
  accountEvents?: AccountEvent[];
  transfers?: Transfer[];
  /** Manifest-declared kinds (sign-ins, key events, usage ...) of a non-bank pack. */
  genericEntities?: Entity[];
  /** Bank-unobservable story beats from the manifest (a customer-reported
   *  phish SMS): hollow markers, never data dots. */
  annotations?: ScenarioAnnotation[];
}

/** The app's word for one node, which the head's and the strip's sentences take. */
const NOUN = "event";

// Format (maxTime - playhead) as a `T-Nd HH:MM:SS` delta cursor.
function formatDelta(maxMs: number, playMs: number): string {
  let delta = Math.max(0, Math.round((maxMs - playMs) / 1000));
  const days = Math.floor(delta / 86400);
  delta -= days * 86400;
  const hours = Math.floor(delta / 3600);
  delta -= hours * 3600;
  const minutes = Math.floor(delta / 60);
  const seconds = delta - minutes * 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `T-${days}d ${hh}:${mm}:${ss}`;
}

const noop = (): void => {};

export function Timeline({ transactions, logins, accountEvents, transfers, genericEntities, annotations }: Props) {
  const playhead = usePlayhead((s) => s.playhead);
  const maxTime = usePlayhead((s) => s.maxTime);
  const windowMin = usePlayhead((s) => s.windowMin);
  const windowMax = usePlayhead((s) => s.windowMax);
  const playing = usePlayhead((s) => s.isPlaying);
  const h24 = useClockForm((s) => s.h24);

  const span = windowMax - windowMin;

  // The rows, the lanes, the solo and the depth lines, built once for the data (useBarTracks).
  const { allEvents, stepEvents, set, ticks, solo, rows: shown, shownCase, switchesHide, lanes, grids, dots, prominence, trackTicks, kinds, laneLines, setLaneLinesOpen, depthPx } = useBarTracks({
    transactions, logins, accountEvents, transfers, genericEntities,
  });

  // Today-bucket aggregates for the readout: count + spend for transactions on the same Houston
  // calendar day as the playhead, up to and including the playhead time itself. Each transaction's
  // time and Houston day are read once per transactions array, so a tick costs one day key (the
  // playhead's), not one for every transaction. Only the transactions the Layers switches show count
  // (the case before the solo: a solo does not change the day's total).
  const txDays = useMemo(() => buildTxDays(shownCase.transactions), [shownCase.transactions]);
  const todayBucket = useMemo(() => (span <= 0 ? { auths: 0, spend: 0 } : todayTotals(txDays, playhead)), [txDays, playhead, span]);

  // The step keys walk the events the track draws as dots. A step is what a click on a dot does:
  // navigate() selects the record, seeks the playhead to it and pauses.
  const onStep = useCallback(
    (dir: 1 | -1) => {
      const to = stepTarget(stepEvents, usePlayhead.getState().playhead, selectionId(useSelection.getState().selected), dir);
      if (to !== null) useNavigation.getState().navigate(stepEvents[to].match);
    },
    [stepEvents],
  );
  const stepById = useMemo(() => new Map(allEvents.map((e) => [e.id, e.match])), [allEvents]);
  const onActivate = useCallback(
    (id: string) => {
      const match = stepById.get(id);
      if (match) useNavigation.getState().navigate(match);
    },
    [stepById],
  );
  const eventTimes = useMemo(() => allEvents.map((e) => e.t), [allEvents]);

  // Custom notes. `n` on the slider adds a note at the playhead (rounded to a millisecond: the
  // playhead holds fractions), linked to the selected record when there is one. The key is offered
  // only while the notes store holds a scenario, so a page that has not loaded notes names no key.
  const noteScenario = useNotesStore((s) => s.scenario);
  const onNote = useCallback(() => {
    const scenario = useNotesStore.getState().scenario;
    if (scenario === null) return;
    const link = linkFromSelected(useSelection.getState().selected);
    const { playhead, windowMin, windowMax } = usePlayhead.getState();
    // The window opens above the whole playbar (the bottom stack that holds this Timeline, whose top is
    // the top of the Timeline's root's parent) at the playhead's place along the track, so it never covers
    // the head row, the transport or the playhead's tab; the track is remembered for the focus return.
    // The door is a 1 px box on that top edge. Limit: the place is read against the zoomed window; a
    // folded slider maps the whole case, so there the window opens at that place of the visible span (the
    // clamp keeps it on screen). With no room over the bar the window takes the screen's top edge (it then
    // may reach the bar on a screen too short for both). With focus off the track the store places it.
    const el = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    let at: { x: number; y: number } | undefined;
    if (el) {
      const r = el.getBoundingClientRect();
      const span = windowMax - windowMin;
      const f = span > 0 ? Math.min(1, Math.max(0, (playhead - windowMin) / span)) : 0;
      const x = r.left + (r.right - r.left) * (Number.isFinite(f) ? f : 0);
      const root = el.closest("[data-eyes='TIMELINE-ROOT']");
      const barTop = Math.min(r.top, root?.getBoundingClientRect().top ?? r.top, root?.parentElement?.getBoundingClientRect().top ?? r.top);
      at = placeNoteWindow({ left: x, right: x + 1, top: barTop, bottom: barTop + 1 }, "above");
      // No room over the bar is read from the RAW room (the bar's top, less the 8 px gap, less the window's
      // height: under 8 means none), not from the clamped y: on a short screen the clamp pulls the turned-under
      // place up onto the bar. With no room the window takes y 8, which ends over the bar when the screen allows.
      if (barTop - 8 - chromeToWindowNow(NOTE_WINDOW_DIMS.height) < 8) at = { x: at.x, y: 8 };
    }
    const id = usePivotStore.getState().openNote({ seed: { scenario, time: Math.round(playhead), link } }, at);
    noteOpenedFrom(id, el);
  }, []);
  // The marks' lookup (a link's record and its place) from the data this bar holds, and how many
  // event lanes the track draws, which decides where the square sits.
  const noteLookup = useMemo(
    () => lookupFromContext({ transactions, logins: logins ?? [], places: [], accountEvents, transfers, entities: genericEntities }),
    [transactions, logins, accountEvents, transfers, genericEntities],
  );
  const laneCount = useMemo(() => new Set(allEvents.map((e) => (e.match.kind === "entity" ? e.match.entity.kind : e.match.kind))).size, [allEvents]);

  // The size: one saved value of three, and the folds (useBarFold): the Timeline's button folds to a
  // line for each section, then to one line, then opens to the size the bar had; the rows' button
  // moves between the middle size and the open size.
  const listId = useId();
  const kindsId = useId();
  // The rows' section (the header, the list and the folded small version) is drawn while the rows have
  // something to head. When the Layers switches leave no named row it is not drawn, as the small version
  // is not drawn for a case with no named row (RowsSmall): a header reading the heading and a count of 0 would head
  // nothing. The name column, the kinds control and the lanes stay; with every switch on nothing changes.
  const rowsSet = set !== null && !(switchesHide && set.named === 0) ? set : null;
  const { folded, stacked, rowsOpen, onFold, onRows, openRows, openLane } = useBarFold(listId, rowsSet !== null || lanes.length > 0);

  // A solo is `{ field, value }` in the store; a row's key is "v:" and its value.
  const groupedBy = set?.by ?? "";
  // A press on the row that is alone clears it by its key: the stored value may be padded, and the
  // store's toggle compares the raw text.
  const aloneKey = solo?.key ?? null;
  const onSolo = useCallback(
    (key: string) => (key === aloneKey ? useSolo.getState().clear() : useSolo.getState().toggle(groupedBy, key.slice(2))),
    [groupedBy, aloneKey],
  );
  const clearSolo = useCallback(() => useSolo.getState().clear(), []);

  // A lane folds by its id, so two lanes over the same kind fold apart.
  const collapsedLanes = useLayers((s) => s.collapsedLanes);
  const toggleLane = useLayers((s) => s.toggleLane);
  const laneToggles = useMemo(() => new Map(lanes.map((l) => [l.id, () => toggleLane(l.id)])), [lanes, toggleLane]);
  // A press on a lane's button in a line for each section opens the bar with that lane open.
  const laneOpeners = useMemo(() => new Map(lanes.map((l) => [l.id, () => openLane(l.id)])), [lanes, openLane]);
  const head = useMemo(() => ({ grids }), [grids]);
  const nameDrawn = set !== null;
  const formatClock = h24 ? when24 : when;
  const whose = solo?.name;
  const soloKey = solo?.key ?? null;

  const renderLanes = useCallback(
    (slot: LanesSlot) => (
      <>
        {rowsSet ? (
          <TrackRows
            set={rowsSet}
            ticks={ticks}
            slot={slot}
            grids={grids}
            mirror
            prominence={prominence}
            paint={dots.paint}
            onPanel={dots.onPanel}
            kindFor={dots.kindFor}
            kindLabel={dots.kindLabel}
            open={rowsOpen}
            onToggle={onRows}
            onActivate={onActivate}
            listId={listId}
            soloKey={soloKey}
            onSolo={onSolo}
            depthPx={depthPx}
            onFocusRow={setFocusKey}
          />
        ) : null}
        {/* Call 13: the folded rows keep a small version, on the track's own scale. */}
        {rowsSet && !rowsOpen ? <RowsSmall set={rowsSet} ticks={ticks} slot={slot} grids={grids} soloKey={soloKey} /> : null}
        {lanes.map((lane) => {
          const toggle = laneToggles.get(lane.id) ?? noop;
          // Call 14: a folded lane with a name column is its small version, in the lane's own place
          // and in the lane's group, so the lane's id, its group and its one button stay. A pack with
          // no name column keeps today's folded lane.
          if (nameDrawn && collapsedLanes.includes(lane.id)) {
            return (
              <div
                key={lane.id}
                role="group"
                aria-label={whose ? `${laneName(lane)}, ${whose} alone` : laneName(lane)}
                data-magnitude-lane={lane.id}
                {...(whose ? { "data-lane-whose": whose } : {})}
                {...(lane.bars.length === 0 ? { "data-lane-empty": "" } : {})}
                style={{ marginTop: 4 }}
              >
                <LaneSmall lane={lane} slot={slot} onToggle={toggle} head={head} formatTime={formatClock} whose={whose} />
              </div>
            );
          }
          // Call 16: the lane opens into lines, closed until the triangle is pressed.
          const depth = nameDrawn ? laneLines.get(lane.id) : undefined;
          return (
            <MagnitudeLane
              key={lane.id}
              lane={lane}
              slot={slot}
              collapsed={collapsedLanes.includes(lane.id)}
              onToggle={toggle}
              formatTime={formatClock}
              inset={nameDrawn ? GUTTER : 0}
              whose={whose}
              head={head}
              below={
                depth ? (
                  <LaneLines
                    lane={lane}
                    lines={depth.lines}
                    fieldLabel={depth.label}
                    slot={slot}
                    formatTime={formatClock}
                    whose={whose}
                    grids={grids}
                    open={depth.open}
                    onOpenChange={(open) => setLaneLinesOpen(lane.id, open)}
                  />
                ) : undefined
              }
            />
          );
        })}
      </>
    ),
    [rowsSet, ticks, grids, prominence, dots, rowsOpen, onRows, onActivate, listId, soloKey, onSolo, depthPx, lanes, collapsedLanes, laneToggles, formatClock, nameDrawn, head, whose, laneLines, setLaneLinesOpen],
  );

  // Call 15: a line for each section, drawn under the Timeline's line when it folds once. A press
  // on a section's button opens the bar with that section open.
  const stackLines = useCallback(
    (slot: LanesSlot) => (
      <>
        {rowsSet ? <RowsSmall set={rowsSet} ticks={ticks} slot={slot} grids={grids} soloKey={soloKey} inset={STACK_NAME_PX} onOpen={openRows} /> : null}
        {lanes.map((lane) => (
          <LaneSmall key={lane.id} lane={lane} slot={slot} onToggle={laneOpeners.get(lane.id) ?? noop} head={head} formatTime={formatClock} inset={STACK_NAME_PX} whose={whose} />
        ))}
      </>
    ),
    [rowsSet, ticks, grids, soloKey, openRows, lanes, laneOpeners, head, formatClock, whose],
  );

  // Call 17: the Timeline's depth, a control on the rail and a line for each kind of event. It needs
  // the name column and at least two kinds of event.
  const kindLinesSlot = useCallback(
    (slot: LanesSlot) => (
      <KindLines
        lines={kinds.lines}
        ticks={trackTicks}
        slot={slot}
        grids={grids}
        prominence={prominence}
        {...dots}
        onActivate={onActivate}
        listId={kindsId}
        noun={NOUN}
        soloName={whose ?? null}
        hidden={kinds.all !== kinds.total}
      />
    ),
    [kinds.lines, kinds.all, kinds.total, trackTicks, grids, prominence, dots, onActivate, kindsId, whose],
  );
  // The control stays while the case has two kinds of event or more, also when the switches leave
  // fewer than two (so it reads "Total Events: 0 / N" with everything off).
  const above =
    nameDrawn && kinds.offered
      ? {
          control: <KindsFold noun={NOUN} count={kinds.total} all={kinds.all} open={kinds.open} onToggle={kinds.toggle} listId={kindsId} soloName={whose ?? null} />,
          lines: kinds.open ? kindLinesSlot : undefined,
          height: kinds.open ? kindsBlockPx(kinds.lines.length) : 0,
        }
      : undefined;

  // The head: the tab on its rail above the track, the line and its veil in the track.
  const rail = useCallback(
    (slot: RailSlot) => (
      <HeadRail inset={nameDrawn ? GUTTER : 0} onMouseDown={slot.onPlotMouseDown}>
        <HeadTab project={slot.project} maxTime={maxTime} noun={NOUN} onGrab={slot.focusTrack} />
      </HeadRail>
    ),
    [nameDrawn, maxTime],
  );
  const handle = useCallback((project: Parameters<typeof HeadSled>[0]["project"]) => <HeadSled project={project} grids={grids} />, [grids]);

  // The slider's spoken value: the clock in its form, each lane's value, the number of the row that
  // is alone and the number of the row the focus stands in (one row each, never every row's; the
  // rows hand the focused key up by a callback). While the playhead plays it does not change; when
  // playback stops it is computed once (a new function, from `playing`, is what the shell draws again).
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const soloTrack = set && solo ? set.tracks.find((t) => t.key === solo.key) : undefined;
  const focusTrack = set && focusKey !== soloKey ? set.tracks.find((t) => t.key === focusKey) : undefined;
  const spoken = useRef<{ text: string | undefined } | null>(null);
  const formatValueText = useCallback(
    (p: number) => {
      if (playing && spoken.current) return spoken.current.text;
      const numberOf = (t: typeof soloTrack): string => {
        const bar = set && t ? barAt(t.bars, set.step, p) : null;
        return set && t && bar ? `, ${t.name} ${amount(bar.value, set.barUnit)}` : "";
      };
      const text = span > 0 ? formatClock(p) + laneValueText(lanes, p) + numberOf(soloTrack) + numberOf(focusTrack) : undefined;
      spoken.current = { text };
      return text;
    },
    [playing, span, formatClock, lanes, set, soloTrack, focusTrack],
  );

  // Case day-density band cells (one per Houston day; red where a severe event landed). A solo narrows them.
  const dayDensity = useCaseDayCells(shown.transactions, shown.logins, shown.accountEvents, shown.transfers, shown.genericEntities);

  // The case readout: the time left (the tab holds the one clock), then the day's count.
  const readout = (
    <div className="font-mono text-[10px] tracking-widest flex items-baseline gap-2.5 flex-wrap">
      <span data-time-left className="text-[color:var(--r1-readout)]" {...tip(timeLeftWords(remaining(maxTime - playhead), NOUN))}>
        {span > 0 ? formatDelta(maxTime, playhead) : "T-0d 00:00:00"}
      </span>
      {/* The card case's today bucket; a pack without authorizations has nothing to count. */}
      {transactions.length > 0 && (
        <>
          <span className="text-dim">·</span>
          <span className="text-text">
            {todayBucket.auths} auth{todayBucket.auths === 1 ? "" : "s"} today
          </span>
          <span className="text-dim">·</span>
          <span className="text-text">${todayBucket.spend.toFixed(2)}</span>
        </>
      )}
      {/* Session chip retired 2026-06-11 (one-thread invariant): the filter
          now exists only while the Matches window is open on the thread, so
          the window is the indicator and its × is the clear affordance. */}
    </div>
  );

  return (
    <TimelineShell
      readout={readout}
      dayDensity={dayDensity}
      scrubDomain="window"
      ariaLabel="Playhead position"
      formatValueText={formatValueText}
      onStep={onStep}
      onNote={noteScenario !== null ? onNote : undefined}
      lanes={rowsSet || lanes.length > 0 ? renderLanes : undefined}
      nameColumn={nameDrawn}
      rail={rail}
      above={above}
      handle={handle}
      fold={{
        folded,
        onToggle: onFold,
        noun: NOUN,
        strip: <CaseStrip times={eventTimes} seeks={false} />,
        solo: solo ? { name: solo.name, onClear: clearSolo } : undefined,
        more: stacked ? stackLines : undefined,
      }}
    >
      {(project) => (
        <>
          <CaseTimelineLayer
            project={project}
            transactions={shown.transactions}
            logins={shown.logins}
            accountEvents={shown.accountEvents}
            transfers={shown.transfers}
            genericEntities={shown.genericEntities}
            annotations={annotations}
          />
          <NotesLayer project={project} laneCount={laneCount} lookup={noteLookup} />
        </>
      )}
    </TimelineShell>
  );
}
