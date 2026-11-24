/**
 * Several of the investigator's marks that lie near one place on the globe, as one plate: a maplibre
 * Marker whose element is a div (never a button) that holds the pile button (the sign with the number of
 * records, one glyph for each decision the marks carry, the pin; led by the lens only when the anchor
 * draws no ring) with its bottom right corner at the handle's end, as a single plate hangs. A press
 * unfolds the marks as a column of full single plates ABOVE it, one row each, placed out of flow so the
 * marker, and so the plate, does not move; a second press, or Escape, folds them again. A press on a
 * member opens that record's window (tethered to the record's place, no spot of its own), folds the pile
 * and leaves keyboard focus on the pile button; the window returns focus there when it closes.
 *
 * The layer decides which marks make a pile (`globeLayout`) and builds every word; this file draws what
 * it is given. Whether the pile is unfolded is the layer's state, handed in as `unfolded` with the
 * callbacks that change it: nothing is stored here and no clock is read. The marker class
 * `verdict-marker` hides the whole pile, column included, while its place is on the far side of the
 * globe.
 *
 * What this file does not do: it holds no words, no rule of which marks join, no projection and no
 * camera listener (the layer folds a pile when a camera move ends), and no right-click behaviour (a pile
 * holds several records, so it has no door of its own). A member of the column is a plain button, not a
 * `PlateMarker`. It exports a component only (the refresh rule).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import { tip } from "../ui/Tip";
import { ROW_STEP_PX } from "./geometry";
import type { PileFace } from "./mark-piles";
import { MarkPlate } from "./MarkPlate";
import type { RecordLookup } from "../notes/record-lookup";
import { openRecordWindow } from "../../store/marks";
import { popoutOpened } from "../../lib/window-focus";
import type { Disposition, RecordRef } from "../../lib/marks/types";

/** The pointer events maplibre listens for: stopped on the marker, so a press never pans the map. */
const STOPPED = ["mousedown", "pointerdown", "touchstart", "dblclick"] as const;
/** The marker's own element: the plate's classes, but the wrapper of buttons, never one. */
const WRAPPER_CLASS = "verdict-marker absolute left-0 top-0 flex";
const BUTTON_CLASS = "flex p-0 m-0 border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-signal";
/** The first member's row clears the pile's plate by this much; each next row is `ROW_STEP_PX` further. */
const COLUMN_GAP_PX = 2;

interface GlobePileMember {
  key: string;
  record: RecordRef;
  /** The accessible name (`markName`). */
  name: string;
  /** The tooltip lines (`markTip`). */
  lines: readonly string[];
  notes: number;
  disposition: Disposition;
  pinned: boolean;
  /** This member's own level on the globe is "dim" (a pinned record ahead of the playhead). */
  dim: boolean;
  /** This member's record window is open. */
  open: boolean;
}

export interface GlobePileProps {
  map: maplibregl.Map;
  /** `pile:` and the anchor's key. */
  pileKey: string;
  /** Where the plate's marker sits: the anchor's ring, or its own point. */
  lngLat: { lng: number; lat: number };
  /** The plate's bottom right corner is this far up and left of that place, on each axis. */
  corner: number;
  /** Lead with the lens: the anchor draws no ring. */
  lens: boolean;
  face: PileFace;
  /** The accessible name (`pileName`). */
  name: string;
  /** The tooltip lines (`pileTip`). */
  lines: readonly string[];
  /** The column's members in `memberOrder`. */
  members: readonly GlobePileMember[];
  unfolded: boolean;
  onToggle: (pileKey: string) => void;
  /** Fold the pile (a member press, Escape). */
  onFold: (pileKey: string) => void;
  lookup: RecordLookup;
}

export function GlobePile(props: GlobePileProps) {
  const { map, pileKey, lngLat, corner, lens, face, name, lines, members, unfolded, onToggle } = props;
  const [el] = useState(() => {
    const d = document.createElement("div");
    d.className = WRAPPER_CLASS;
    d.setAttribute("data-mark-pile-group", pileKey);
    for (const type of STOPPED) d.addEventListener(type, (e) => e.stopPropagation());
    return d;
  });
  const pile = useRef<HTMLButtonElement | null>(null);
  // The handlers below are bound once, to the element; they read the latest props at the press.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    el.setAttribute("data-mark-pile-group", pileKey);
  }, [el, pileKey]);
  useEffect(() => {
    // Escape and no other key; the key is not held back, so the tooltip layer and a menu still hear it.
    const onKey = (e: KeyboardEvent) => {
      const cur = latest.current;
      if (e.key !== "Escape" || !cur.unfolded) return;
      cur.onFold(cur.pileKey);
      pile.current?.focus();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [el]);

  const { lng, lat } = lngLat;
  useEffect(() => {
    const m = new maplibregl.Marker({ element: el, anchor: "bottom-right", offset: [-corner, -corner], opacityWhenCovered: 0 })
      .setLngLat([lng, lat])
      .addTo(map);
    return () => {
      m.remove();
    };
  }, [map, el, lng, lat, corner]);

  const openMember = (key: string) => {
    const cur = latest.current;
    const member = cur.members.find((m) => m.key === key);
    const button = pile.current;
    if (!member) return;
    // No spot is passed: the window tethers to the record's place (a record on the globe has one).
    const id = openRecordWindow(member.record, cur.lookup);
    // Focus goes to the pile before the fold takes the member's button off the page.
    button?.focus();
    cur.onFold(cur.pileKey);
    // A window that was already open is only raised: a focus request filed for it would be taken on its next mount.
    if (id !== null && !member.open && button) popoutOpened(id, button);
  };

  return createPortal(
    <>
      <button
        ref={pile}
        type="button"
        data-mark-pile={pileKey}
        data-open={face.open || undefined}
        aria-expanded={unfolded}
        aria-label={name}
        {...tip(lines)}
        className={BUTTON_CLASS}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(pileKey);
        }}
      >
        <MarkPlate lens={lens} notes={0} disposition="none" pinned={face.pinned} dim={face.dim} open={face.open} pile={{ records: face.records, glyphs: face.glyphs }} />
      </button>
      {unfolded &&
        members.map((m, i) => (
          <button
            key={m.key}
            type="button"
            data-mark={m.key}
            data-open={m.open || undefined}
            aria-label={m.name}
            {...tip(m.lines)}
            className={BUTTON_CLASS}
            // Out of flow, so the marker keeps its size and the plate does not move when the column opens.
            style={{ position: "absolute", left: 0, bottom: `calc(100% + ${COLUMN_GAP_PX + ROW_STEP_PX * i}px)` }}
            onClick={(e) => {
              e.stopPropagation();
              openMember(m.key);
            }}
          >
            <MarkPlate lens notes={m.notes} disposition={m.disposition} pinned={m.pinned} dim={m.dim} open={m.open} />
          </button>
        ))}
    </>,
    el,
  );
}
