/**
 * The globe's own camera moves: the playback follow, the move to a pressed record, and the jump to
 * the opening view when Play starts while the camera still rests where the last press left it.
 * GlobeMap passes the loaded map, the refs they read and the label cap's `capMove`, through which
 * every eased or flown move here is made. The navigation store is read here.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import type maplibregl from "maplibre-gl";
import type { CapMove } from "../hooks/useLabelCap";
import type { Path } from "../lib/paths";
import type { ScenarioHome } from "../lib/scenarios";
import {
  activeFollowTarget,
  atOpeningZoom,
  equatorZoom,
  followMove,
  followPlaceBefore,
  followWaitOver,
  placeInView,
} from "../lib/playback-follow";
import { resetView } from "../hooks/useBarPadding";
import { pressMove, restsAtPress } from "../lib/press-camera";
import { prefersReducedMotion } from "../lib/tween";
import { useNavigation } from "../store/navigation";
import { usePlayhead } from "../store/playhead";

export interface CameraMovesDeps {
  /** The loaded map, or null before it is built; the listener for a move the person makes is put on it. */
  map: maplibregl.Map | null;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  /** The visible paths; the follow takes its events from their nodes. */
  pathsRef: MutableRefObject<Path[]>;
  /** The active scenario's home camera: `null` none, `undefined` not known yet. */
  scenarioHomeRef: MutableRefObject<ScenarioHome | null | undefined>;
  /** Whether the case opened on the whole globe (GlobeMap's `fitToBar`, mirrored). */
  openedOnWholeGlobeRef: MutableRefObject<boolean>;
  /** True while the person drags the map. */
  isDraggingRef: MutableRefObject<boolean>;
  capMove: CapMove;
}

export function useCameraMoves({
  map: loadedMap,
  mapRef,
  pathsRef,
  scenarioHomeRef,
  openedOnWholeGlobeRef,
  isDraggingRef,
  capMove,
}: CameraMovesDeps): void {
  // Where the last press on a record left the camera: the record and the record's own zoom. Every
  // press on a record writes it, a turn too; a pan with no zoom target writes none. A move the person
  // makes clears it, and Play goes back to the opening view first while the camera still rests there.
  // It lives in the page's memory only, so a reload starts with none.
  const keptPressRef = useRef<{ lng: number; lat: number; zoom: number } | null>(null);

  // A move the person makes ends the rest at the press. maplibre-gl 5.24.1: the `movestart` and the
  // `moveend` of a drag and of a flick carry `originalEvent` (_fireEvent; also
  // the end of a drag and its inertia), and an app move's carry its event data only.
  // The `movestart` clear covers a flick's inertia, during which the `moveend` has not yet come; a
  // gesture that starts while an app move runs fires no `movestart`, so the `moveend` clear stays.
  // One notch of a wheel was seen in a browser to carry no `originalEvent` on either event, so for a
  // wheel zoom the zoom test of `restsAtPress` is what keeps the camera from being cut back.
  useEffect(() => {
    if (!loadedMap) return;
    // The event is read as optional, as GlobeMap's own home listener reads it.
    const onPersonMove = (e?: { originalEvent?: unknown }): void => {
      if (e?.originalEvent) keptPressRef.current = null;
    };
    loadedMap.on("movestart", onPersonMove);
    loadedMap.on("moveend", onPersonMove);
    return () => {
      loadedMap.off("movestart", onPersonMove);
      loadedMap.off("moveend", onPersonMove);
    };
  }, [loadedMap]);

  // Playback camera-follow (2026-06-01). On every playhead change we (a) repaint
  // so the per-Path cascade re-reads the playhead, and (b) while PLAYING, ease the
  // camera to keep the *active* event framed - holding on a tight cluster, swinging
  // to a far region (the impossible Houston→Lagos leap) only when the move is big.
  // It never pauses: the timeline plays all the way through so every event fires.
  // (Replaces the prior reveal that paused at the fraud window - which froze the
  //  playhead on the first fraud event so later events never triggered, and left
  //  the analyst hand-spinning the globe. See FIX-2026-06-01-playhead-follow.)
  //
  // The follow finishes each move and then holds: no move starts while the map moves, and none until
  // the playhead has moved a twelfth of the case's span from the anchor. The anchor is the playhead
  // when play starts, when this effect starts (so a globe mounted during play does not move at once),
  // and when a follow move begins. The playhead is the follow's only measure of time.
  useEffect(() => {
    let anchor = usePlayhead.getState().playhead;

    // Active-event coords come from the Paths: each node carries a `frac` into
    // its path's densified `points`. Union across all visible paths.
    const followEvents = () =>
      pathsRef.current.flatMap((p) =>
        p.points.length === 0
          ? []
          : p.nodes.map((n) => {
              const idx = Math.min(
                p.points.length - 1,
                Math.max(0, Math.round(n.frac * (p.points.length - 1))),
              );
              const [lng, lat] = p.points[idx];
              return { ts: n.ts, lng, lat };
            }),
      );

    const follow = (cur: number) => {
      const map = mapRef.current;
      if (!map) return;
      // Skip follow while the user is dragging to avoid fighting input.
      if (isDraggingRef.current) return;
      // Under reduced motion the camera holds still while a case plays; the repaint still runs.
      if (prefersReducedMotion()) return;
      // Map.isMoving counts an ease, a flight and a gesture.
      if (map.isMoving()) return;
      const { minTime, maxTime } = usePlayhead.getState();
      if (!followWaitOver(cur, anchor, minTime, maxTime)) return;
      const events = followEvents();
      const target = activeFollowTarget(events, cur);
      if (!target) return;
      const before = followPlaceBefore(events, target);
      const c = map.getCenter();
      const home = scenarioHomeRef.current;
      // Frame the places and hold: no move for a target in
      // view; one move to the midpoint of the target and the place before it while the camera is at
      // the zoom the case opened on; to the target when the person has zoomed in. The two zooms are
      // compared normalised to the equator, so a move across latitudes does not change the rule.
      const to = followMove({
        target,
        before,
        targetInView: placeInView(map, target),
        atOpeningZoom: openedOnWholeGlobeRef.current
          && atOpeningZoom(equatorZoom(map.getZoom(), c.lat), home ? equatorZoom(home.zoom, home.lat) : undefined),
        camera: { lng: c.lng, lat: c.lat },
      });
      if (!to) return;
      anchor = cur;
      // Gentle pan at the current zoom (no swoop, no zoom change) - keep the
      // active region in view without yanking the analyst around.
      capMove(() => map.easeTo({ center: [to.lng, to.lat], duration: 1600, essential: true }),
        { lng: to.lng, lat: to.lat });
    };

    const evaluate = (cur: number) => {
      mapRef.current?.triggerRepaint(); // per-Path drawFrac re-reads the playhead
      if (usePlayhead.getState().isPlaying) follow(cur);
    };

    // Play after a press goes back out first: while the camera still rests where the last press left
    // it, Play makes Reset view's marked jump to the opening view before the follow's first tick. With
    // no home known, nothing moves. The jump is the same under reduced motion.
    const cutBack = () => {
      const map = mapRef.current;
      const press = keptPressRef.current;
      const home = scenarioHomeRef.current;
      if (!map || !press || !home) return;
      const c = map.getCenter();
      if (restsAtPress({ lng: c.lng, lat: c.lat, zoom: map.getZoom() }, press)) resetView(map, home);
    };

    evaluate(usePlayhead.getState().playhead);
    const unsub = usePlayhead.subscribe((s, p) => {
      // Read from the new state: `play()` can move the playhead to the start in the same set.
      if (s.isPlaying && !p.isPlaying) {
        anchor = s.playhead;
        cutBack();
      }
      if (s.playhead !== p.playhead) evaluate(s.playhead);
    });
    return () => { unsub(); };
  }, [capMove, mapRef, pathsRef, scenarioHomeRef, openedOnWholeGlobeRef, isDraggingRef]);

  // A press on a record: when navigate() sets a new panTarget or raises the
  // pulseToken, move the camera to the record. ANY snap-to-node surface (map
  // marker click, ticker click / ← →, MatchesTable row, Inspector TARGET) routes
  // through navigate(), so the move is a property of the primitive, not each
  // caller. MapLibre owns viewState here (the map is imperative in mapRef), and
  // because markers are welded maplibre layers they stay glued to the ground
  // through the whole move.
  //
  // Turn first: from a view below zoom 11 a press turns the globe
  // at the present zoom until the record is at the centre, a centre-only ease of
  // 900 ms. With no zoom in the options the library ends it at the start zoom
  // plus the latitude adjustment, so the globe
  // keeps its size on screen. Once the centre is within 0.5 degrees of the record,
  // a press flies in to the record's zoom; from zoom 11 or more every press flies.
  // lib/press-camera.ts decides which. The flight's length follows its distance
  // (`speed` with `curve`, no `duration`): `curve`
  // shapes the zoom-out arc and `speed` 2 runs it quicker than the default 1.2.
  //
  // Neither move carries an `essential` key, so under prefers-reduced-motion the
  // library makes the turn an ease of no duration
  // and the flight a jump to the same camera: the record arrives
  // with no motion.
  //
  // The effect also runs on pulseToken, which every navigate() raises, because a
  // manifest record hands the same coords object as panTarget on each press, and
  // a second press on it must still reach the camera.
  const panTarget = useNavigation((s) => s.panTarget);
  const zoomTarget = useNavigation((s) => s.zoomTarget);
  const pulseToken = useNavigation((s) => s.pulseToken);
  // The ref keeps the id of the last press and whether that press was on the same record as the press
  // before it. Both are taken at navigate's own set, where the id and a new token arrive together,
  // because the bloom clears the id at once under reduced motion, before this hook's effect runs. A
  // pan with no new token is no press, so it counts as no same record.
  const pressRef = useRef<{ id: string | null; sameRecord: boolean }>({ id: null, sameRecord: false });
  useEffect(() => useNavigation.subscribe((s, p) => {
    if (s.pulseToken !== p.pulseToken) {
      pressRef.current = { id: s.pulseEntityId, sameRecord: s.pulseEntityId === pressRef.current.id };
    } else if (s.panTarget !== p.panTarget) {
      pressRef.current = { ...pressRef.current, sameRecord: false };
    }
  }), []);
  useEffect(() => {
    if (!panTarget) return;
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const move = pressMove({ lng: c.lng, lat: c.lat, zoom: map.getZoom() }, panTarget, pressRef.current.sameRecord);
    if (move === "turn") {
      capMove(() => map.easeTo({ center: [panTarget.lng, panTarget.lat], duration: 900 }),
        { lng: panTarget.lng, lat: panTarget.lat });
    } else {
      capMove(() => map.flyTo({
        center: [panTarget.lng, panTarget.lat],
        zoom: zoomTarget ?? undefined,  // kind-specific zoom per navigate() spec
        curve: 1.6,    // The curve gives the flight a pronounced arc out and back in.
        speed: 2,      // The flight runs quicker than at the library's default speed of 1.2.
      }), { lng: panTarget.lng, lat: panTarget.lat, zoom: zoomTarget ?? undefined });
    }
    // Kept after the move's call, with the record's own zoom, so that a turn from the globe view, which
    // rests far from that zoom, gives Play no jump; a pan with no zoom target keeps none.
    keptPressRef.current = zoomTarget === null ? null : { lng: panTarget.lng, lat: panTarget.lat, zoom: zoomTarget };
  }, [panTarget, zoomTarget, pulseToken, capMove, mapRef]);
}
