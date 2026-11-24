/**
 * Opening a saved note, from its Timeline mark, its globe mark, or the Inspector. The note is
 * made an entity (`noteToEntity`) and sent through `navigate`, as every record the app snaps to
 * is: the playhead seeks to its time, playback pauses, the note is selected, and the camera pans
 * to the linked record when there is one. Then its window opens (or is raised).
 */
import { noteToEntity, type ResolveLink } from "../../lib/notes/entity";
import type { Note } from "../../lib/notes/types";
import { useNavigation } from "../../store/navigation";
import { usePivotStore } from "../../store/pivot";
import { chromeToWindowNow } from "../../store/text-size";
import { NOTE_WINDOW_DIMS } from "../../lib/window-dims";
import type { RecordInfo, RecordLookup } from "./record-lookup";

/** A door's box in window pixels (a DOMRect satisfies it). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export type NoteSide = "over" | "above" | "below" | "right";

const EDGE = 8;
const clampAxis = (v: number, size: number, view: number): number => Math.max(EDGE, Math.min(v, view - size - EDGE));

/**
 * The new note window's top left, in window pixels, beside the control that opened it.
 * over: left at the door's left, bottom 40 px above the door's bottom (the Timeline's playhead readout
 * stays in view). above: bottom 8 px over the door's top, else below it. below: top 8 px under the door's
 * bottom. right: left 8 px past the door's right, else 8 px before the door's left; top at the door's
 * top. Then both axes are clamped 8 px inside the view. The window's size is `NOTE_WINDOW_DIMS` at the
 * text size now held; the real height of a draft with the category field open is not known here, so a
 * grown window may cross the foot of the screen. `view` is the window's size unless given.
 */
export function placeNoteWindow(door: Box, side: NoteSide, view?: { w: number; h: number }): { x: number; y: number } {
  const v = view ?? { w: window.innerWidth, h: window.innerHeight };
  const w = chromeToWindowNow(NOTE_WINDOW_DIMS.width);
  const h = chromeToWindowNow(NOTE_WINDOW_DIMS.height);
  let x = door.left;
  let y = door.top;
  if (side === "over") y = door.bottom - h - 40;
  else if (side === "above") {
    y = door.top - EDGE - h;
    if (y < EDGE) y = door.bottom + EDGE;
  } else if (side === "below") y = door.bottom + EDGE;
  else {
    x = door.right + EDGE;
    if (x + w > v.w - EDGE) x = door.left - EDGE - w;
  }
  return { x: Math.round(clampAxis(x, w, v.w)), y: Math.round(clampAxis(y, h, v.h)) };
}

/** A new note's time when it is made from a record: the record's own time, else the playhead, in whole
 *  milliseconds. The playhead is the one clock; nothing here reads another. */
export function noteTimeFor(info: RecordInfo | null, playhead: number): number {
  return Math.round(info?.time ?? playhead);
}

/** The window's first place: beside the click, kept on screen, near the top. */
export function windowPlaceNear(clientX: number): { x: number; y: number } {
  const width = typeof window === "undefined" ? 1280 : window.innerWidth;
  return { x: Math.max(8, Math.min(width - 316, Math.round(clientX) - 150)), y: 80 };
}

export function openSavedNote(note: Note, lookup: RecordLookup | null, at?: { x: number; y: number }): void {
  const resolve: ResolveLink = (link) => lookup?.(link)?.lngLat ?? null;
  useNavigation.getState().navigate({ kind: "entity", entity: noteToEntity(note, resolve) });
  usePivotStore.getState().openNote({ noteId: note.id }, at);
}
