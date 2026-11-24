/**
 * The investigator's path session: the path being drawn (the draft), the saved paths switched off for
 * this visit, and the path the pointer is on. It is SESSION STATE ON PURPOSE (the rule the Layers
 * switches follow): a saved path has no `on` field, so a switch is never saved, and nothing here reaches
 * browser storage or the share link. A reload of the page forgets all of it.
 *
 * The draft lives here, not in the Paths menu, because the menu renders its children only while it is
 * open. It holds record refs and a name; it never holds a time (a stop's time is its record's, read at
 * draw time) and the playhead is the only clock.
 *
 * What this file does not do: it never draws, never checks a record against the data (the strip does,
 * with the lookup, before it calls `addStop`), and writes to the marks store only through `createPath`.
 */
import { create } from "zustand";
import { MARK_LIMITS, canonicalKind, recordKey, type CustomPath, type RecordRef } from "../../lib/marks/types";
import { fail, type Check, type NoteErrorCode } from "../../lib/notes/types";
import { useMarksStore } from "../../store/marks";

export interface PathDraft {
  name: string;
  stops: RecordRef[];
  /** True while the strip asks Discard or Keep drawing. */
  asking: boolean;
  /** True from the moment `finish` calls the store until it answers. */
  saving: boolean;
  /** The store's code for the last refusal of `finish`; null until one. */
  refused: NoteErrorCode | null;
}

export interface PathSessionState {
  draft: PathDraft | null;
  /** The ids of the saved paths switched off for this visit. */
  hidden: string[];
  /** The saved path the pointer or the focus is on (it draws at full, the others dim); null for none. */
  chosen: string | null;
  /** Opens a draft with no stop. A no-op while one is open. */
  start(name: string): void;
  /** Appends the record, kind made canonical. False (and no change) with no draft, while saving, for a record already a stop, and at the 51st. */
  addStop(r: RecordRef): boolean;
  removeStop(index: number): void;
  ask(): void;
  keep(): void;
  discard(): void;
  /**
   * Saves the draft through the marks store, once. LIMIT: with no draft, under two stops, or while a save
   * runs it does not call the store and answers a `bad_request` refusal (no new code exists; the strip
   * disables its buttons in those states, so the answer is never shown).
   */
  finish(): Promise<Check<CustomPath>>;
  toggleHidden(id: string): void;
  /** A removed path leaves the session: its switch and its hover. */
  forget(id: string): void;
  choose(id: string | null): void;
}

export const usePathSession = create<PathSessionState>()((set, get) => ({
  draft: null,
  hidden: [],
  chosen: null,

  start: (name) => {
    if (get().draft !== null) return;
    set({ draft: { name, stops: [], asking: false, saving: false, refused: null } });
  },

  addStop: (r) => {
    const d = get().draft;
    if (d === null || d.saving || d.stops.length >= MARK_LIMITS.stopsMax) return false;
    const record: RecordRef = { kind: canonicalKind(r.kind), id: r.id };
    const key = recordKey(record);
    if (d.stops.some((s) => recordKey(s) === key)) return false;
    set({ draft: { ...d, stops: [...d.stops, record] } });
    return true;
  },

  removeStop: (index) => {
    const d = get().draft;
    if (d === null || d.saving || index < 0 || index >= d.stops.length) return;
    set({ draft: { ...d, stops: d.stops.filter((_, i) => i !== index) } });
  },

  ask: () => {
    const d = get().draft;
    if (d !== null) set({ draft: { ...d, asking: true } });
  },

  keep: () => {
    const d = get().draft;
    if (d !== null) set({ draft: { ...d, asking: false } });
  },

  discard: () => set({ draft: null }),

  finish: async () => {
    const d = get().draft;
    if (d === null || d.saving || d.stops.length < MARK_LIMITS.stopsMin) return fail("bad_request", "path.draft");
    set({ draft: { ...d, saving: true, refused: null } });
    let answer: Check<CustomPath>;
    try {
      answer = await useMarksStore.getState().createPath([...d.stops], d.name);
    } catch {
      // The store answers a Check and does not throw; a backing that did is read as a failed save.
      answer = fail("backing_failed", "path.create");
    }
    if (answer.ok) {
      set({ draft: null });
      return answer;
    }
    const now = get().draft;
    if (now !== null) set({ draft: { ...now, saving: false, refused: answer.code } });
    return answer;
  },

  toggleHidden: (id) => set((s) => ({ hidden: s.hidden.includes(id) ? s.hidden.filter((h) => h !== id) : [...s.hidden, id] })),

  forget: (id) => set((s) => ({ hidden: s.hidden.filter((h) => h !== id), chosen: s.chosen === id ? null : s.chosen })),

  choose: (id) => set({ chosen: id }),
}));
