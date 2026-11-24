// frontend/investigator/src/store/tag-menu.ts
// The request store of the right-click menu on a record. A door (a Timeline node, a row dot, the
// Inspector's header, a globe dot, a plate) calls `openTagMenuFrom` from its own handler; the menu
// component, mounted once in the app, reads `req` and draws. The store holds one open request in
// memory and nothing else: nothing persists, no clock is read, and no record data is kept here (the
// menu reads a record through the page's one lookup when it draws).
//
// What this file does not do: it draws nothing, writes no mark and no note, and moves no selection
// or playhead.
import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import type { Box } from "../components/notes/open-note";
import type { RecordLookup } from "../components/notes/record-lookup";
import type { RecordRef } from "../lib/marks/types";
import { checkLink } from "../lib/notes/schema";

export type TagDoor = "tick" | "row" | "inspector" | "globe" | "plate";

export interface TagMenuRequest {
  /** Counts up per opening; the menu remounts on it. */
  seq: number;
  /** Canonical kinds; one record for every door but the globe dot. */
  records: readonly RecordRef[];
  door: TagDoor;
  /** The event's clientX and clientY (a key press gives the element's centre, as the browser reports it). */
  at: { x: number; y: number };
  /** The door element's box, for the Timeline's node only (the menu sits above it); null for every other door. */
  rect: Box | null;
  /** Focus goes back here when the menu closes. */
  opener: HTMLElement | null;
}

interface TagMenuState {
  req: TagMenuRequest | null;
  seq: number;
  open(r: Omit<TagMenuRequest, "seq">): void;
  close(): void;
}

export const useTagMenu: UseBoundStore<StoreApi<TagMenuState>> = create<TagMenuState>((set, get) => ({
  req: null,
  seq: 0,
  open: (r) => {
    const seq = get().seq + 1;
    set({ seq, req: { ...r, seq } });
  },
  close: () => set({ req: null }),
}));

/** An element that can take the focus and is not hidden from it: a menu may hand the focus back to it. */
function isFocusable(t: EventTarget | null): t is HTMLElement {
  return t instanceof HTMLElement && t.getAttribute("aria-hidden") !== "true" && t.tabIndex >= 0;
}

/**
 * A door's handler body: prevent the page's own menu (it is not prevented over page elements by
 * itself), never stop the event from travelling, then open the request. The opener is `opener` when
 * given (a null given stays null), else the current target when it can take focus, else null.
 */
export function openTagMenuFrom(
  e: { preventDefault(): void; clientX: number; clientY: number; currentTarget: EventTarget | null },
  records: readonly RecordRef[],
  door: TagDoor,
  opener?: HTMLElement | null,
): void {
  e.preventDefault();
  const target = e.currentTarget;
  useTagMenu.getState().open({
    records,
    door,
    at: { x: e.clientX, y: e.clientY },
    rect: door === "tick" && target instanceof Element ? boxOf(target) : null,
    opener: opener !== undefined ? opener : isFocusable(target) ? target : null,
  });
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

/** The track's node for a record: the element carrying a data-tag-key equal to the record's key, or
 *  null. Values are compared one by one, so no selector is built from an id. */
export function tickOf(key: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>("[data-tag-key]")) {
    if (el.dataset.tagKey === key) return el;
  }
  return null;
}

/** A record the menu may mark: its link passes the link check (a kind holds no colon) and the lookup holds it. */
export function markable(r: RecordRef, lookup: RecordLookup): boolean {
  const c = checkLink(r);
  return c.ok && c.value !== null && lookup(c.value) !== null;
}
