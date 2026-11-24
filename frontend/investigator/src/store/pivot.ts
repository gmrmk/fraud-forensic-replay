/**
 * Evidence Workspace window store - the revived pivot store,
 * extended with a three-tier anchor model.
 *
 * Tiers: unpinned glance (single transient slot, replaced by the next
 * glance) → pinned (screen-anchored, survives scrubs) → flagged
 * (node-anchored: lngLat resolved at flag time + a screen-space tether
 * offset; travels with the camera). Collapse-to-bar is orthogonal.
 *
 * Per-session only - no localStorage. State resets on reload.
 */
import { create } from "zustand";
import type { EntityMatch } from "../lib/matches";
import type { Entity } from "../lib/entity";
import { canonicalKind, sameRecord, type RecordRef } from "../lib/marks/types";
import type { NoteLink } from "../lib/notes/types";
import { nextPopoutOffset } from "../lib/popout-stack";
import { chromeToWindowNow } from "./text-size";
import {
  DETAIL_WINDOW_DIMS, NOTES_POPOUT_DIMS, PILE_POPOUT_DIMS, RECORD_WINDOW_DIMS, SECTION_POPOUT_DIMS, TRACE_WINDOW_DIMS,
} from "../lib/window-dims";

/** What a popout window shows: one manifest-declared section, a decision's notes, or the list
 *  of records piled at one spot. */
export type PopoutView =
  | { type: "section"; sectionId: string; label: string }
  | { type: "notes"; label: string }
  | { type: "pile"; label: string; memberIds: readonly string[] };

export type Anchor =
  | { type: "screen"; x: number; y: number }
  | { type: "node"; lngLat: { lng: number; lat: number }; offset: { dx: number; dy: number } };

export interface DetailWindowState {
  id: string;
  kind: "detail";
  entity: EntityMatch;
  /** Set on a popout opened from an inspector section; absent on a glance. */
  view?: PopoutView;
  anchor: Anchor;
  pinned: boolean;
  collapsed: boolean;
  z: number;
}

export interface TraceWindowState {
  id: string;
  kind: "trace";
  decisionId: string;
  anchor: Anchor;
  pinned: boolean;
  collapsed: boolean;
  z: number;
}

/** What a new note window starts from: the scenario, the playhead's millisecond and the record the
 *  note links to (or none). A saved note's window has no seed: its note holds all three. */
export interface NoteSeed {
  scenario: string;
  time: number;
  link: NoteLink | null;
}

/** The custom note window (the editor). Always screen-anchored. `dirty` is the window's own
 *  report that it holds changes that are not saved; `closeAsked` is set when a close was pressed
 *  while dirty, and the window then asks (Save, Discard or Cancel) in its status line. */
export interface NoteWindowState {
  id: string;
  kind: "note";
  /** The saved note this window edits, or null for a draft that has not been saved. */
  noteId: string | null;
  seed: NoteSeed | null;
  anchor: { type: "screen"; x: number; y: number };
  pinned: boolean;
  collapsed: boolean;
  z: number;
  dirty: boolean;
  closeAsked: boolean;
}

/**
 * The record's own window. `pinned` is ALWAYS the record's pin (the marks store writes it through
 * `setRecordPinned`), never read from the anchor: a pinned record's window is a pinned window that no
 * glance, trace or other record window evicts. Node-anchored when the record has a place, on the screen
 * when not. It has no flag control: `togglePinned`, `flagToNode` and `unflag` leave it alone.
 */
export interface RecordWindowState {
  id: string;
  kind: "record";
  /** Canonical kind (a fraud transaction is auth). */
  record: RecordRef;
  anchor: Anchor;
  pinned: boolean;
  collapsed: boolean;
  z: number;
}

export type WorkspaceWindow = DetailWindowState | TraceWindowState | NoteWindowState | RecordWindowState;

/** A pin's screen position and the free area around it (left of the Inspector, above the bottom
 *  stack); registered by the layer that owns the map projection. */
export type PinRoom = (lngLat: { lng: number; lat: number }) => {
  pinX: number; pinY: number; right: number; bottom: number;
};

export interface PivotStoreState {
  windows: WorkspaceWindow[];
  nextZ: number;
  /** Null until a map is mounted: popouts then stack in one column. */
  pinRoom: PinRoom | null;
  setPinRoom: (fn: PinRoom | null) => void;
  openGlance: (entity: EntityMatch, at: { x: number; y: number }) => void;
  openTrace: (decisionId: string, at: { x: number; y: number }) => void;
  /** Open a note window: a new draft (`seed`) or a saved note (`noteId`; one window for one note,
   *  raised when it is asked for again). It opens pinned, so a glance or a trace never evicts it
   *  and unsaved text is never lost that way. `at` is its first place on the screen. */
  openNote: (target: { noteId: string } | { seed: NoteSeed }, at?: { x: number; y: number }) => string;
  setNoteDirty: (id: string, dirty: boolean) => void;
  /** The person chose Cancel: the window stays, the question goes. */
  cancelNoteClose: (id: string) => void;
  /** Close a note window whatever its flag says (Discard, or after a save, or its note is gone). */
  discardNote: (id: string) => void;
  /** A draft was saved: the window now edits that note. */
  bindNote: (id: string, noteId: string) => void;
  /** Open (or raise) a popout pinned beside the entity's pin, or beside `at` when given (a linked
   *  badge's popout tethers where it was clicked). Null when there is no spot to pin it to. */
  openPopout: (entity: Entity, view: PopoutView, at?: { lng: number; lat: number }) => string | null;
  /**
   * Open (or raise) the record's own window. One window per record: an open one is raised, unfolded and
   * takes the new `pinned`. A new one drops the unpinned windows first. With a place it is node
   * anchored, offset like a popout; without, it sits on the screen at `at`, else at a default spot
   * that steps 24 px for each record window already open. Callers use `openRecordWindow`
   * (`store/marks.ts`), which fills `place` from the record's lookup and its node.
   */
  openRecord: (
    record: RecordRef,
    place: { lngLat: { lng: number; lat: number } | null; pinned: boolean; at?: { x: number; y: number } }
  ) => string;
  /** The record's pin changed: every window of that record follows. */
  setRecordPinned: (record: RecordRef, pinned: boolean) => void;
  togglePinned: (id: string) => void;
  toggleCollapsed: (id: string) => void;
  flagToNode: (
    id: string,
    lngLat: { lng: number; lat: number },
    offset: { dx: number; dy: number }
  ) => void;
  unflag: (id: string, at: { x: number; y: number }) => void;
  updatePosition: (id: string, x: number, y: number) => void;
  updateOffset: (id: string, dx: number, dy: number) => void;
  bringToFront: (id: string) => void;
  closeWindow: (id: string) => void;
}

// Lightweight id - uuid v4 is overkill for in-memory per-session state.
function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `w-${Math.random().toString(36).slice(2, 10)}`;
}

/** The single transient slot: drop whatever unpinned window exists. A note window with changes
 *  that are not saved stays, pinned or not: a glance must not lose the person's text. */
function withoutUnpinned(windows: WorkspaceWindow[]): WorkspaceWindow[] {
  return windows.filter((w) => w.pinned || (w.kind === "note" && w.dirty));
}

function viewKey(v: PopoutView): string {
  switch (v.type) {
    case "notes": return "notes";
    case "pile": return `pile:${v.memberIds.join(",")}`;
    case "section": return `section:${v.sectionId}`;
  }
}

function isPopoutOf(w: WorkspaceWindow, entity: Entity, view: PopoutView): boolean {
  return (
    w.kind === "detail" && w.view !== undefined && w.entity.kind === "entity" &&
    w.entity.entity.kind === entity.kind && w.entity.entity.id === entity.id &&
    viewKey(w.view) === viewKey(view)
  );
}

const POPOUT_HEIGHT: Record<PopoutView["type"], number> = {
  section: SECTION_POPOUT_DIMS.height, notes: NOTES_POPOUT_DIMS.height, pile: PILE_POPOUT_DIMS.height,
};
// The estimates are the chrome's pixels; stacking happens in window pixels, so each crosses out.
const popoutHeight = (v: PopoutView) => chromeToWindowNow(POPOUT_HEIGHT[v.type]);
/** The note window's estimated height (chrome px). It is never node-anchored, so only the stacking
 *  of popouts reads it. */
const NOTE_WINDOW_HEIGHT = 430;

/** Estimated on-screen height (window pixels), for stacking popouts below windows at the same pin. */
function estHeight(w: WorkspaceWindow): number {
  if (w.kind === "trace") return chromeToWindowNow(TRACE_WINDOW_DIMS.height);
  if (w.kind === "note") return chromeToWindowNow(NOTE_WINDOW_HEIGHT);
  if (w.kind === "record") return chromeToWindowNow(RECORD_WINDOW_DIMS.height);
  return w.view ? popoutHeight(w.view) : chromeToWindowNow(DETAIL_WINDOW_DIMS.height);
}

export const usePivotStore = create<PivotStoreState>((set, get) => ({
  windows: [],
  nextZ: 20,
  pinRoom: null,
  setPinRoom: (fn) => set({ pinRoom: fn }),

  openGlance: (entity, at) => {
    const s = get();
    const w: DetailWindowState = {
      id: makeId(), kind: "detail", entity,
      anchor: { type: "screen", x: at.x, y: at.y },
      pinned: false, collapsed: false, z: s.nextZ,
    };
    set({ windows: [...withoutUnpinned(s.windows), w], nextZ: s.nextZ + 1 });
  },

  openTrace: (decisionId, at) => {
    const s = get();
    const w: TraceWindowState = {
      id: makeId(), kind: "trace", decisionId,
      anchor: { type: "screen", x: at.x, y: at.y },
      pinned: false, collapsed: false, z: s.nextZ,
    };
    set({ windows: [...withoutUnpinned(s.windows), w], nextZ: s.nextZ + 1 });
  },

  openNote: (target, at) => {
    const s = get();
    if ("noteId" in target) {
      const open = s.windows.find((w) => w.kind === "note" && w.noteId === target.noteId);
      if (open) {
        set({
          windows: s.windows.map((w) => (w.id === open.id ? { ...w, collapsed: false, z: s.nextZ } : w)),
          nextZ: s.nextZ + 1,
        });
        return open.id;
      }
    }
    const count = s.windows.filter((w) => w.kind === "note").length;
    const place = at ?? { x: 120 + 24 * count, y: 80 + 24 * count };
    const w: NoteWindowState = {
      id: makeId(), kind: "note",
      noteId: "noteId" in target ? target.noteId : null,
      seed: "seed" in target ? target.seed : null,
      anchor: { type: "screen", x: place.x, y: place.y },
      pinned: true, collapsed: false, z: s.nextZ, dirty: false, closeAsked: false,
    };
    set({ windows: [...s.windows, w], nextZ: s.nextZ + 1 });
    return w.id;
  },

  setNoteDirty: (id, dirty) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id && w.kind === "note" && w.dirty !== dirty
          ? { ...w, dirty, closeAsked: dirty ? w.closeAsked : false }
          : w
      ),
    })),

  cancelNoteClose: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id && w.kind === "note" ? { ...w, closeAsked: false } : w)),
    })),

  discardNote: (id) =>
    set((s) => ({ windows: s.windows.filter((w) => !(w.id === id && w.kind === "note")) })),

  bindNote: (id, noteId) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id && w.kind === "note" ? { ...w, noteId } : w)),
    })),

  openPopout: (entity, view, at) => {
    const spot = at ?? entity.coords;
    if (!spot) return null;
    const s = get();
    const open = s.windows.find((w) => isPopoutOf(w, entity, view));
    if (open) {
      set({
        windows: s.windows.map((w) => (w.id === open.id ? { ...w, collapsed: false, z: s.nextZ } : w)),
        nextZ: s.nextZ + 1,
      });
      return open.id;
    }
    const lngLat = { lng: spot.lng, lat: spot.lat };
    const offset = nextPopoutOffset(
      lngLat,
      s.windows.flatMap((w) =>
        w.anchor.type === "node"
          ? [{ lngLat: w.anchor.lngLat, offset: w.anchor.offset, collapsed: w.collapsed, height: estHeight(w) }]
          : []
      ),
      s.pinRoom ? { height: popoutHeight(view), ...s.pinRoom(lngLat) } : undefined
    );
    const w: DetailWindowState = {
      id: makeId(), kind: "detail", entity: { kind: "entity", entity }, view,
      anchor: { type: "node", lngLat, offset },
      pinned: true, collapsed: false, z: s.nextZ,
    };
    set({ windows: [...s.windows, w], nextZ: s.nextZ + 1 });
    return w.id;
  },

  openRecord: (record, place) => {
    const s = get();
    const rec: RecordRef = { kind: canonicalKind(record.kind), id: record.id };
    const open = s.windows.find((w) => w.kind === "record" && sameRecord(w.record, rec));
    if (open) {
      set({
        windows: s.windows.map((w) => (w.id === open.id ? { ...w, collapsed: false, pinned: place.pinned, z: s.nextZ } : w)),
        nextZ: s.nextZ + 1,
      });
      return open.id;
    }
    const kept = withoutUnpinned(s.windows);
    let anchor: Anchor;
    if (place.lngLat) {
      const lngLat = { lng: place.lngLat.lng, lat: place.lngLat.lat };
      const height = chromeToWindowNow(RECORD_WINDOW_DIMS.height);
      const offset = nextPopoutOffset(
        lngLat,
        kept.flatMap((w) =>
          w.anchor.type === "node"
            ? [{ lngLat: w.anchor.lngLat, offset: w.anchor.offset, collapsed: w.collapsed, height: estHeight(w) }]
            : []
        ),
        s.pinRoom ? { height, ...s.pinRoom(lngLat) } : undefined
      );
      anchor = { type: "node", lngLat, offset };
    } else {
      const count = kept.filter((w) => w.kind === "record").length;
      const spot = place.at ?? { x: 120 + 24 * count, y: 80 + 24 * count };
      anchor = { type: "screen", x: spot.x, y: spot.y };
    }
    const w: RecordWindowState = {
      id: makeId(), kind: "record", record: rec, anchor, pinned: place.pinned, collapsed: false, z: s.nextZ,
    };
    set({ windows: [...kept, w], nextZ: s.nextZ + 1 });
    return w.id;
  },

  setRecordPinned: (record, pinned) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.kind === "record" && sameRecord(w.record, record) ? { ...w, pinned } : w)),
    })),

  togglePinned: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        // Flag implies pinned: pin state is not directly togglable while
        // node-anchored - unflag first (the control renders disabled-active).
        // A record window's pin is its record's pin: it never toggles here.
        w.id === id && w.kind !== "record" && w.anchor.type === "screen" ? { ...w, pinned: !w.pinned } : w
      ),
    })),

  toggleCollapsed: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, collapsed: !w.collapsed } : w)),
    })),

  flagToNode: (id, lngLat, offset) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id && w.kind !== "note" && w.kind !== "record" ? { ...w, anchor: { type: "node", lngLat, offset }, pinned: true } : w
      ),
    })),

  unflag: (id, at) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id && w.kind !== "record" && w.anchor.type === "node"
          ? { ...w, anchor: { type: "screen", x: at.x, y: at.y }, pinned: true }
          : w
      ),
    })),

  updatePosition: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id && w.anchor.type === "screen"
          ? { ...w, anchor: { type: "screen", x, y } }
          : w
      ),
    })),

  updateOffset: (id, dx, dy) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id && w.kind !== "note" && w.anchor.type === "node"
          ? { ...w, anchor: { ...w.anchor, offset: { dx, dy } } }
          : w
      ),
    })),

  bringToFront: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, z: s.nextZ } : w)),
      nextZ: s.nextZ + 1,
    })),

  // A note window with changes that are not saved is not closed: it is asked to put its question
  // (the window's status line offers Save, Discard and Cancel). Every other window closes.
  closeWindow: (id) =>
    set((s) => {
      const w = s.windows.find((x) => x.id === id);
      if (w && w.kind === "note" && w.dirty) {
        // Unfolded too: a folded window clips its body, and the question would be out of sight.
        return { windows: s.windows.map((x) => (x.id === id ? { ...w, closeAsked: true, collapsed: false } : x)) };
      }
      return { windows: s.windows.filter((x) => x.id !== id) };
    }),
}));
