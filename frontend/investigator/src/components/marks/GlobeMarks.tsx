/**
 * The investigator's marks on the globe. For each marked record the one function draws (`globe` lit,
 * or dim for a pinned record ahead of the playhead) that has a place:
 *
 *   - RING FORM, when the record's own dot is drawn (a solo that leaves the record out takes its dot
 *     off the globe, and a place stays in any solo) and the record is not a decision capsule: a thin
 *     ring round the dot (its centre line 1 px outside the halo the data draws, so it never lies on
 *     the data's own ring or halo) with a 7 px handle running up and left, and the plate (count,
 *     disposition glyph, pin) with its bottom right corner at the handle's end. The ring is a drawing
 *     with no events; the plate is the button. The ring is cased in the ground colour.
 *   - PLATE ALONE, when no dot is drawn (a decision capsule, a pinned record ahead of the playhead, a
 *     place while Places is off): the plate, led by the lens, with its bottom right corner 7 px left
 *     of and above the record's point.
 *   - A PILE, when several marks lie within the data's own reach of the first one (44 by 16 px, as the
 *     capsules' piles): one plate at the first mark's handle end (`GlobePile`), with the number of
 *     records, one glyph for each decision and the pin, that a press unfolds into a column of full
 *     plates. Rings that lie on one another and are of one size draw as one ring with one handle; a
 *     ring of another size keeps its own, and a ring that no plate hangs at draws no handle.
 *
 * Each is one maplibre Marker whose element is a real element, as the verdict layer's badges are
 * (BadgeMarker): the plate's is a button that stops the pointer events maplibre listens for and takes
 * a native click; all ride the `verdict-marker` class, so a mark on the far side of the globe is
 * hidden and leaves the tab order. A press on a plate opens the record's window and moves neither the
 * playhead nor the selection. The ring's size follows the halo of the record's kind (a magnitude
 * kind's grows with its value), measured against the whole pack as the globe layer does, and not
 * followed through the transient `sel` and `land` factors.
 *
 * Marks are projected and grouped on the camera's last move (`moveend`) and whenever the marks
 * change, as the verdict layer's piles are; a mark on the far side of the globe is left out of every
 * pile and keeps its single form. A pile folds when a camera move the visitor makes ends (the move's
 * event carries `originalEvent`), on a second press and on Escape, and on nothing else: a move the
 * app makes (the playback follow, a flight to a selection) re-projects the marks and leaves an
 * unfolded pile open. Whether a pile is unfolded is this layer's state, never stored. While
 * a story plays the marks change with the playhead, so a pile can regroup in the middle of a camera
 * move, and an unfolded one then folds with it.
 *
 * What this file does not do: it decides nothing about whether a record is drawn (that is
 * `markViews`, from `drawState`), draws no mark without a map, adds no
 * listener on the page, and reads no field of a record. It exports components only (the refresh rule).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import { tip } from "../ui/Tip";
import { GlobeLens, MARK_INK } from "./glyphs";
import { HANDLE_PX, handleOffset, haloRadius, ringRadius } from "./geometry";
import { GlobePile } from "./GlobePile";
import { globeLayout, memberOrder, type GlobePoint } from "./mark-piles";
import { MarkPlate } from "./MarkPlate";
import type { MarkView } from "./mark-views";
import { useMarkViews, useOpenRecordKeys } from "./useMarkViews";
import { useSoloIds } from "../../hooks/useSoloIds";
import type { RecordLookup } from "../notes/record-lookup";
import { openRecordWindow } from "../../store/marks";
import { useClockForm } from "../../store/clock-form";
import { usePivotData } from "../../store/pivot-data";
import { useSchema } from "../../store/schema";
import { isOccludedByGlobe } from "../../lib/node-anchor";
import { magnitudeMaxima, magnitudeOf } from "../../lib/magnitude";
import { recordKey } from "../../lib/marks/types";
import { markName, markTip, pileName, pileTip } from "../../lib/tooltip-words/marks";
import { when, when24 } from "../../lib/time-words";

const STOPPED = ["mousedown", "pointerdown", "touchstart", "dblclick"] as const;
const PLATE_CLASS =
  "verdict-marker absolute left-0 top-0 flex p-0 m-0 border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-signal";
const RING_CLASS = "verdict-marker pointer-events-none absolute left-0 top-0 block";
/** The plate's corner, up and left of the record's point, when no ring is drawn (the lens leads it). */
const ALONE_OFFSET = 7;
/** The ring's casing: a 1 px shadow in the ground colour, so the ring reads on any basemap. */
const CASING = "drop-shadow(0 0 1px rgb(var(--bg-rgb)))";

type LngLat = { lng: number; lat: number };

/** The ring form: the record's dot is drawn, it is not a capsule, and the solo (the ids it keeps, or null) leaves its dot on
 *  the globe. A place is in no solo's set: it passes through a solo by reference, so its dot stays. */
const ringed = (v: MarkView, solo: ReadonlySet<string> | null): boolean =>
  v.dot && !v.decision && (solo === null || solo.has(v.record.id) || v.record.kind === "place");

/** A mark on the near side of the globe, with the view it draws: the layout reads the point, the layer the view. */
interface Point extends GlobePoint {
  view: MarkView;
}

interface PlateProps {
  map: maplibregl.Map;
  view: MarkView;
  lookup: RecordLookup;
  open: boolean;
  /** Where the plate's marker sits: the record's point, or the ring a pile of rings shares. */
  lngLat: LngLat;
  /** The plate's bottom right corner is this far up and left of that place, on each axis. */
  corner: number;
  /** Led by the lens: the plate alone. */
  lens: boolean;
  time: string | null;
}

function PlateMarker({ map, view, lookup, open, lngLat, corner, lens, time }: PlateProps) {
  const [el] = useState(() => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = PLATE_CLASS;
    b.setAttribute("data-mark", "");
    for (const type of STOPPED) b.addEventListener(type, (e) => e.stopPropagation());
    return b;
  });
  const latest = useRef({ record: view.record, lookup });
  useEffect(() => {
    latest.current = { record: view.record, lookup };
  });
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      // No spot is passed: the window tethers to the record's place (a record with a place is on the globe).
      openRecordWindow(latest.current.record, latest.current.lookup);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [el]);

  const name = markName(view.kindLabel, view.headline);
  const lines = markTip({ ...view, time });
  const text = lines.join("\n");
  useEffect(() => {
    el.setAttribute("aria-label", name);
    for (const [k, v] of Object.entries(tip(text.split("\n")))) el.setAttribute(k, v);
  }, [el, name, text]);

  const { lng, lat } = lngLat;
  useEffect(() => {
    const m = new maplibregl.Marker({ element: el, anchor: "bottom-right", offset: [-corner, -corner], opacityWhenCovered: 0 })
      .setLngLat([lng, lat])
      .addTo(map);
    return () => {
      m.remove();
    };
  }, [map, el, lng, lat, corner]);

  return createPortal(
    <MarkPlate lens={lens} notes={view.notes} disposition={view.disposition} pinned={view.pinned} dim={view.globe === "dim"} open={open} />,
    el,
  );
}

/** One ring round a dot (or round several dots that lie on one another); `handle` only where a plate hangs at it. */
function RingMarker({ map, lngLat, ring, handle }: { map: maplibregl.Map; lngLat: LngLat; ring: number; handle: boolean }) {
  const [el] = useState(() => {
    const s = document.createElement("span");
    s.className = RING_CLASS;
    s.style.pointerEvents = "none";
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("data-mark-ring", "");
    return s;
  });
  const { lng, lat } = lngLat;
  useEffect(() => {
    const m = new maplibregl.Marker({ element: el, anchor: "center", offset: [0, 0], opacityWhenCovered: 0 }).setLngLat([lng, lat]).addTo(map);
    return () => {
      m.remove();
    };
  }, [map, el, lng, lat]);
  return createPortal(
    <span className="block" style={{ filter: CASING, color: MARK_INK }}>
      <GlobeLens ring={ring} handle={handle ? HANDLE_PX : 0} />
    </span>,
    el,
  );
}

/** What one frame of the layer draws: the rings, the plates (single or pile) and the marks of the far side. */
interface Drawn {
  rings: ReturnType<typeof globeLayout<Point>>["rings"];
  plates: ReturnType<typeof globeLayout<Point>>["plates"];
  far: { view: MarkView; radius: number }[];
}
const NOTHING: Drawn = { rings: [], plates: [], far: [] };

export function GlobeMarks({ map, lookup }: { map: maplibregl.Map | null; lookup: RecordLookup }) {
  const h24 = useClockForm((s) => s.h24);
  const { marks, views } = useMarkViews(lookup);
  const solo = useSoloIds();
  const open = useOpenRecordKeys();
  const schemaNodes = useSchema((s) => s.nodes);
  // Dot size is measured against the whole pack, never what the playhead has reached, as the globe layer does.
  const packEntities = usePivotData((s) => s.entities);
  const maxima = useMemo(() => magnitudeMaxima(packEntities, schemaNodes), [packEntities, schemaNodes]);
  // The halo of each marked record's dot, from the kind's magnitude: a built-in kind's is fixed. It reads
  // the records already resolved (`info.match`), so no lookup runs per playhead tick.
  const halos = useMemo(() => {
    const out = new Map<string, number>();
    for (const m of marks) {
      const match = m.info?.match;
      const node = match?.kind === "entity" ? schemaNodes.find((n) => n.kind === match.entity.kind) : undefined;
      out.set(
        recordKey(m.record),
        match?.kind === "entity" && node?.magnitude
          ? haloRadius({ value: magnitudeOf(match.entity, node), max: maxima[match.entity.kind] ?? 0 })
          : haloRadius(null),
      );
    }
    return out;
  }, [marks, schemaNodes, maxima]);

  // The camera centre after the last move: a new value re-projects the marks (the verdict layer's way).
  const [center, setCenter] = useState<LngLat | null>(null);
  // Which pile is unfolded: one key, never stored.
  const [unfolded, setUnfolded] = useState<string | null>(null);
  const latest = useRef({ unfolded });
  useEffect(() => {
    latest.current = { unfolded };
  });

  /** When focus sits inside the pile's group (on a member of its column) it goes to the pile button, so a fold never drops it to the page. */
  const focusPile = useCallback(
    (key: string) => {
      const groups = (map?.getCanvasContainer() ?? document).querySelectorAll<HTMLElement>("[data-mark-pile-group]");
      const group = Array.from(groups).find((g) => g.getAttribute("data-mark-pile-group") === key);
      const active = document.activeElement;
      if (group && active && group.contains(active)) group.querySelector<HTMLElement>("[data-mark-pile]")?.focus();
    },
    [map],
  );
  // Every fold, a second press included, moves focus first and then closes the column.
  const onToggle = useCallback(
    (key: string) => {
      focusPile(key);
      setUnfolded((cur) => (cur === key ? null : key));
    },
    [focusPile],
  );
  const onFold = useCallback(
    (key: string) => {
      focusPile(key);
      setUnfolded((cur) => (cur === key ? null : cur));
    },
    [focusPile],
  );

  useEffect(() => {
    if (!map) return;
    // maplibre puts `originalEvent` on the moveend of a move the visitor makes (drag, wheel, touch, keys, the zoom buttons)
    // and on none of the app's own (easeTo, flyTo, jumpTo): the playback follow, a flight to a selection and the like.
    const onMoveEnd = (e?: { originalEvent?: unknown }) => {
      const c = map.getCenter();
      const key = latest.current.unfolded;
      if (key !== null && e?.originalEvent) {
        focusPile(key);
        setUnfolded(null);
      }
      setCenter({ lng: c.lng, lat: c.lat });
    };
    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [map, focusPile]);

  // Each mark with a place and a level: projected when it is on the near side, grouped by `globeLayout`.
  // A far side mark keeps its single form (the projection of a point behind the globe means nothing).
  const drawn = useMemo<Drawn>(() => {
    if (!map) return NOTHING;
    const c = center ?? map.getCenter();
    const near: Point[] = [];
    const far: Drawn["far"] = [];
    for (const v of views) {
      if (v.globe === "none" || v.lngLat === null) continue;
      const radius = ringRadius(halos.get(v.key) ?? haloRadius(null));
      if (isOccludedByGlobe({ lng: c.lng, lat: c.lat }, v.lngLat)) {
        far.push({ view: v, radius });
        continue;
      }
      const p = map.project([v.lngLat.lng, v.lngLat.lat]);
      near.push({
        key: v.key,
        time: v.time,
        pinned: v.pinned,
        disposition: v.disposition,
        dim: v.globe === "dim",
        open: open.has(v.key),
        x: p.x,
        y: p.y,
        lngLat: v.lngLat,
        ring: ringed(v, solo),
        radius,
        view: v,
      });
    }
    return { ...globeLayout(near), far };
  }, [map, views, halos, center, open, solo]);

  // The shown key is derived, and a key that no pile holds any more is dropped during this render, so a
  // pile that leaves and forms again under the same first mark comes folded.
  const shown = drawn.plates.some((p) => p.members.length > 1 && p.key === unfolded) ? unfolded : null;
  if (unfolded !== null && shown === null) setUnfolded(null);

  if (!map) return null;
  const clock = h24 ? when24 : when;
  const timeOf = (v: MarkView) => (v.time === null ? null : clock(v.time));
  return (
    <>
      {drawn.far.map(({ view: v, radius }) =>
        ringed(v, solo) && v.lngLat ? <RingMarker key={`ring:${v.key}`} map={map} lngLat={v.lngLat} ring={2 * radius} handle /> : null,
      )}
      {drawn.rings.map((r) => (
        <RingMarker key={`ring:${r.key}`} map={map} lngLat={r.lngLat} ring={2 * r.radius} handle={r.handle} />
      ))}
      {drawn.far.map(({ view: v, radius }) => {
        if (v.lngLat === null) return null;
        const ring = ringed(v, solo);
        return (
          <PlateMarker
            key={v.key}
            map={map}
            view={v}
            lookup={lookup}
            open={open.has(v.key)}
            lngLat={v.lngLat}
            corner={ring ? handleOffset(radius) : ALONE_OFFSET}
            lens={!ring}
            time={timeOf(v)}
          />
        );
      })}
      {drawn.plates.map((plate) => {
        if (plate.face === null) {
          const v = plate.members[0].view;
          return (
            <PlateMarker
              key={plate.key}
              map={map}
              view={v}
              lookup={lookup}
              open={open.has(v.key)}
              lngLat={plate.lngLat}
              corner={plate.corner}
              lens={plate.lens}
              time={timeOf(v)}
            />
          );
        }
        const face = plate.face;
        const isOpen = shown === plate.key;
        const times = plate.members.flatMap((m) => (m.time === null ? [] : [m.time]));
        return (
          <GlobePile
            key={plate.key}
            map={map}
            pileKey={plate.key}
            lngLat={plate.lngLat}
            corner={plate.corner}
            lens={plate.lens}
            face={face}
            name={pileName(face.records, isOpen)}
            lines={pileTip({
              records: face.records,
              first: times.length ? clock(Math.min(...times)) : null,
              last: times.length ? clock(Math.max(...times)) : null,
              counts: face.counts,
              pinned: face.pinnedCount,
              unfolded: isOpen,
            })}
            members={memberOrder(plate.members).map((m) => ({
              key: m.key,
              record: m.view.record,
              name: markName(m.view.kindLabel, m.view.headline),
              lines: markTip({ ...m.view, time: timeOf(m.view) }),
              notes: m.view.notes,
              disposition: m.disposition,
              pinned: m.pinned,
              dim: m.dim,
              open: m.open,
            }))}
            unfolded={isOpen}
            onToggle={onToggle}
            onFold={onFold}
            lookup={lookup}
          />
        );
      })}
    </>
  );
}
