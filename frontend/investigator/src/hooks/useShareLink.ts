/**
 * useShareLink: a share link opens the case where it says, and afterwards the address bar is
 * kept in step with what is on screen. The address bar is the share link; there is no copy
 * button.
 *
 * Opening. The link the page was loaded with is read once (`openingLink`). Its scenario is
 * stored as this browser's choice before any data is read (`adoptLinkScenario`, from main.tsx).
 * Its time, marks and zoom window are handed to the playhead store as an opening position,
 * which lands them each time bounds arrive (the case data and the file-backed kinds arrive
 * separately) until the playhead is moved. Its selection is applied when the record has
 * loaded; with no time in the link, the record's own time is the moment. Its camera is applied
 * when the map exists, and only a link that names a camera moves it.
 *
 * Writing. On discrete moments only (playback stops, a scrub ends, the playhead or a mark or
 * the zoom window changes while paused, the selection or the theme changes, a camera
 * move ends, the grouping or the solo changes), never while playing or scrubbing or while the
 * camera is in flight. Writes are coalesced, because browsers limit how often the address bar may
 * be rewritten. The shape of the map is the one exception: a change of it is written at once, also
 * while a case plays, and only its own key changes, so a reload cannot undo it.
 *
 * The grouping (`by`) and the solo (`solo`) are untrusted like `sel`: they apply once the manifest
 * declares the field and the loaded rows hold it (and, for the solo, the value). A link that lands
 * either opens the bar for this session without saving a size.
 */
import { useEffect, useRef } from "react";
import { echoSelection } from "../lib/selection-echo";
import { indexRows, type BootFocusRows } from "../lib/boot-focus";
import { selectionId } from "../lib/case-events";
import { hasCameraOverride } from "../lib/globe/deepLink";
import { isNoteId } from "../lib/notes/schema";
import { rememberScenarioChoice, type ScenarioRows } from "../lib/scenarios";
import { buildShareLink, parseShareLink, type ShareLink, type ShareState } from "../lib/share-link";
import { soloHasData } from "../lib/solo";
import { groupingOf } from "../lib/tracks";
import { useLayers } from "../store/layers";
import { useMapMode, type MapMode } from "../store/map-mode";
import { entityTimestamp } from "../store/navigation";
import { usePlayhead } from "../store/playhead";
import { useSchema } from "../store/schema";
import { useSelection } from "../store/selection";
import { useSolo } from "../store/solo";
import { useTheme } from "../store/theme";
import { useTrackBy } from "../store/track-by";

/** The link the page was opened with, read once at load (the address bar is rewritten later). */
export const openingLink: ShareLink =
  typeof window === "undefined" ? {} : parseShareLink(window.location.search);

/** True when the opening link names a camera: the map is built there and the opening focus
 *  does not move it. */
export const linkHoldsCamera = hasCameraOverride(openingLink);

// A link that carries a camera holds it against the scenario's establishing shot. App's
// scenario-home effect reads this flag (the capture harness sets the same one).
if (typeof window !== "undefined" && linkHoldsCamera) {
  (window as unknown as { __ffrCameraLock?: boolean }).__ffrCameraLock = true;
}

/** A link's scenario becomes this browser's choice, which the boot reads (the static adapter
 *  on every request, the live app's boot guard once). Call before any data is read. */
export function adoptLinkScenario(link: ShareLink = openingLink): void {
  if (link.scenario) rememberScenarioChoice(link.scenario);
}

/** True when the link decides how the case opens: it holds a time, or a selection these rows
 *  contain. The app's own opening focus then stands down. An unknown selection does not count. */
export function linkOpensCase(rows: BootFocusRows, link: ShareLink = openingLink): boolean {
  if (link.playhead !== undefined) return true;
  return link.sel !== undefined && indexRows(rows).has(link.sel);
}

const ownKey = (record: unknown, key: string): boolean =>
  typeof record === "object" && record !== null && Object.hasOwn(record, key);

/** True when the record itself (not its prototype) carries a value for `field`. */
function holdsValue(record: object, field: string): boolean {
  if (!Object.hasOwn(record, field)) return false;
  const value = (record as Record<string, unknown>)[field];
  return (typeof value === "string" && value.trim() !== "") || (typeof value === "number" && Number.isFinite(value));
}

/** A grouping the link may ask for: the manifest declares the field (as its own grouping or in its
 *  `fields`) and a loaded record carries a value for it. Own-key tests only, so a name such as
 *  `constructor` is not a field. The link's `by` is untrusted; the manifest and the rows decide. */
function groupingHeld(
  rows: BootFocusRows,
  schema: { rows: ScenarioRows | undefined; fields: unknown },
  field: string,
): boolean {
  const declared = (typeof schema.rows?.by === "string" && schema.rows.by === field) || ownKey(schema.fields, field);
  if (!declared) return false;
  const seed: readonly object[][] = [rows.transactions, rows.logins, rows.accountEvents, rows.transfers];
  return seed.some((list) => list.some((r) => holdsValue(r, field))) || (rows.entities ?? []).some((e) => holdsValue(e.fields, field));
}

function replaceAddress(qs: string): void {
  try {
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname);
  } catch {
    // A browser that refuses the rewrite (too many in a short time) throws; the next change writes it.
  }
}

function writeAddress(state: ShareState): void {
  // A note's id never goes into the address (custom notes: no note data in a link).
  if (state.sel && isNoteId(state.sel)) state = { ...state, sel: null };
  replaceAddress(buildShareLink(state));
}

/** Writes the shape alone into the address as it stands. Every other key keeps its text and its
 *  place. A `map` key already there is replaced where it is; a new one goes before the grouping
 *  and the solo, where the full write puts it. */
function writeMapKey(shape: MapMode): void {
  const parts = window.location.search.slice(1).split("&").filter((part) => part !== "");
  const key = (part: string): string => part.split("=")[0];
  const own = `map=${shape}`;
  const at = parts.findIndex((part) => key(part) === "map");
  if (at >= 0) {
    parts[at] = own;
  } else {
    const later = parts.findIndex((part) => key(part) === "by" || key(part) === "solo");
    parts.splice(later < 0 ? parts.length : later, 0, own);
  }
  replaceAddress(parts.join("&"));
}

/** A scenario pick: take the old pack's scenario, moment, selection, marks, window and camera
 *  out of the address bar (kept, the reload would reopen the pack being left). The theme, the
 *  colour mode and the shape of the map stay. `scenario` is given only where the pick could not
 *  be stored (a static build in a browser that blocks site data): the reload's address then
 *  carries the pick. */
export function dropShareLink(scenario?: string): void {
  writeAddress({
    scenario,
    theme: useTheme.getState().theme,
    color: useTheme.getState().color,
    map: useMapMode.getState().shape,
  });
}

/** The part of a map this hook uses. */
export interface ShareLinkMap {
  jumpTo(options: { center?: [number, number]; zoom?: number; pitch?: number; bearing?: number }): unknown;
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getPitch(): number;
  getBearing(): number;
  isMoving(): boolean;
  on(type: "moveend", listener: () => void): unknown;
  off(type: "moveend", listener: () => void): unknown;
}

interface Options {
  /** The loaded case rows (what the opening focus takes), for the link's selection. */
  rows: BootFocusRows;
  map: ShareLinkMap | null;
  /** The link to open on. Defaults to the one the page was loaded with. */
  link?: ShareLink;
}

// At most one address rewrite per this interval. WebKit refuses more than 100 history state
// updates in 30 seconds (Source/WebCore/page/History.cpp), and a held arrow key moves the
// playhead many times a second.
const WRITE_AFTER_MS = 400;

export function useShareLink({ rows, map, link = openingLink }: Options): void {
  // The moment, the marks and the window: handed to the playhead store once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (link.playhead !== undefined || link.a !== undefined || link.window !== undefined) {
      usePlayhead.getState().openAt({ playhead: link.playhead, a: link.a, b: link.b, window: link.window });
    }
  }, [link]);

  // The selection, once its record has loaded. It sets the selection only: the camera and the
  // time are the link's to give, not a click's.
  const selected = useRef(false);
  useEffect(() => {
    if (selected.current || link.sel === undefined) return;
    const match = indexRows(rows).get(link.sel);
    if (!match) return;
    selected.current = true;
    echoSelection(match);
    const at = entityTimestamp(match);
    if (link.playhead === undefined && at !== null) {
      usePlayhead.getState().openAt({ playhead: at, a: link.a, b: link.b, window: link.window });
    }
  }, [rows, link]);

  // The grouping and the solo, once the manifest and the rows can bear them out. A refusal is not
  // latched: the file-backed kinds arrive after the case rows, so the next rows try again. A solo
  // has no field of its own and waits for the link's grouping, or the manifest's. A link that
  // lands either one opens the bar for this session (openBar writes no size).
  const schemaRows = useSchema((s) => s.rows);
  const schemaFields = useSchema((s) => s.fields);
  const grouped = useRef(false);
  const soloed = useRef(false);
  useEffect(() => {
    if (link.by === undefined && link.solo === undefined) return;
    if (!grouped.current && link.by !== undefined) {
      if (!groupingHeld(rows, { rows: schemaRows, fields: schemaFields }, link.by)) return;
      grouped.current = true;
      useTrackBy.getState().setBy(link.by);
      useLayers.getState().openBar();
    }
    if (!soloed.current && link.solo !== undefined) {
      const field = groupingOf(schemaRows, link.by ?? null);
      if (field === null) return;
      if (!soloHasData({ field, value: link.solo }, { ...rows, places: [] })) return;
      soloed.current = true;
      const current = useSolo.getState().solo;
      // toggle clears a solo that is already this one, so set it only when it differs.
      if (!current || current.field !== field || current.value !== link.solo) useSolo.getState().toggle(field, link.solo);
      useLayers.getState().openBar();
    }
  }, [rows, link, schemaRows, schemaFields]);

  // The camera, once the map exists. Only the axes the link names are passed: the map reads a
  // named axis with no value as not-a-number.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || !map || !hasCameraOverride(link)) return;
    framed.current = true;
    map.jumpTo({
      ...(link.center && { center: link.center }),
      ...(link.zoom !== undefined && { zoom: link.zoom }),
      ...(link.pitch !== undefined && { pitch: link.pitch }),
      ...(link.bearing !== undefined && { bearing: link.bearing }),
    });
  }, [map, link]);

  // The address bar follows what is on screen.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const write = (): void => {
      timer = null;
      const ph = usePlayhead.getState();
      const scenario = useSchema.getState().scenarioId;
      // Not before the active scenario and its span are known: a boot that is about to re-select
      // the scenario and reload must find its link whole. Not while the camera is in flight
      // either: the address would hold a passing camera, and the flight's end writes it.
      if (scenario === null || ph.maxTime <= ph.minTime || ph.isPlaying || ph.isScrubbing || map?.isMoving()) return;
      const zoomed = ph.windowMin > ph.minTime || ph.windowMax < ph.maxTime;
      // The solo carries a value and no field, so it is written only under the grouping it was made in.
      const by = useTrackBy.getState().by;
      const solo = useSolo.getState().solo;
      const grouping = groupingOf(useSchema.getState().rows, by);
      writeAddress({
        scenario,
        playhead: ph.playhead,
        sel: selectionId(useSelection.getState().selected),
        a: ph.markA,
        b: ph.markB,
        window: zoomed ? [ph.windowMin, ph.windowMax] : null,
        camera: map
          ? { center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }
          : null,
        theme: useTheme.getState().theme,
        color: useTheme.getState().color,
        map: useMapMode.getState().shape,
        by,
        solo: solo && grouping !== null && solo.field === grouping ? solo.value : null,
      });
    };
    const schedule = (): void => {
      if (timer === null) timer = setTimeout(write, WRITE_AFTER_MS);
    };
    const offPlayhead = usePlayhead.subscribe((s, prev) => {
      if (s.isPlaying || s.isScrubbing) return;
      // Bounds arriving (the data loading) is not a move by the investigator.
      if (s.minTime !== prev.minTime || s.maxTime !== prev.maxTime) return;
      if (
        prev.isPlaying || prev.isScrubbing || s.playhead !== prev.playhead ||
        s.markA !== prev.markA || s.markB !== prev.markB ||
        s.windowMin !== prev.windowMin || s.windowMax !== prev.windowMax
      ) {
        schedule();
      }
    });
    const offSelection = useSelection.subscribe((s, prev) => {
      if (s.selected !== prev.selected) schedule();
    });
    const offTheme = useTheme.subscribe(schedule);
    const offBy = useTrackBy.subscribe((s, prev) => {
      if (s.by !== prev.by) schedule();
    });
    const offSolo = useSolo.subscribe((s, prev) => {
      if (s.solo !== prev.solo) schedule();
    });
    // At once and also while a case plays, so a reload cannot undo a change of the shape.
    const offShape = useMapMode.subscribe((s, prev) => {
      if (s.shape !== prev.shape) writeMapKey(s.shape);
    });
    map?.on("moveend", schedule);
    // The map arrives after the data and its first move has already ended: write its camera now.
    if (map) schedule();
    return () => {
      offPlayhead();
      offSelection();
      offTheme();
      offBy();
      offSolo();
      offShape();
      map?.off("moveend", schedule);
      if (timer !== null) clearTimeout(timer);
    };
  }, [map]);
}
