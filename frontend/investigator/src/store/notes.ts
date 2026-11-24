/**
 * Notes store. The backing (the backend, or memory) is injected as an interface; this module
 * holds no network call and no browser storage, and reads no clock.
 *
 * ONE DOOR. A note reaches `notes` only through `place`, after `checkNote` (every field and the
 * card number guard) has passed, whichever backing it came from: a list, a create reply or an
 * update reply. A note that fails is never stored, never drawn, and is counted in `skipped` when
 * it arrived in a list. Replies are data, not trusted: the backing returns `unknown`.
 *
 * Order is by time, then seq. seq is the backing's to give (the backend or the memory backing
 * sets max plus 1 per scenario); the store refuses two notes of one scenario that hold the same
 * seq, and a repeated id.
 */
import { create } from "zustand";
import { STARTER_CATEGORIES, categoryExists, checkCategoryName, normalizeCategoryName, sameCategory } from "../lib/notes/categories";
import { sortNotes } from "../lib/notes/order";
import { checkDraft, checkNote, checkNoteFields, checkScenario } from "../lib/notes/schema";
import { LIMITS, fail, ok, type Check, type Note, type NoteDraft, type NoteError, type NoteErrorCode, type NoteFields } from "../lib/notes/types";

export interface NotesBacking {
  /** Resolves `{ notes, categories, skipped }`: any shape, the store checks it. */
  list(scenario: string): Promise<unknown>;
  /** Resolves the stored note, with the id and seq the backing gave. */
  create(draft: NoteDraft): Promise<unknown>;
  update(id: string, fields: NoteFields): Promise<unknown>;
  remove(id: string): Promise<void>;
  /** Resolves `{ name }`. */
  addCategory(name: string): Promise<unknown>;
}

export interface NotesState {
  backing: NotesBacking | null;
  scenario: string | null;
  /** Checked notes of the loaded scenario, ordered by time then seq. */
  notes: Note[];
  /** The person's own category names (the starters are in `categories.ts`). */
  customCategories: string[];
  /** Notes that arrived in a list and were refused. */
  skipped: number;
  /** The last refusal: a fixed code and a path, never a value. */
  error: NoteError | null;
  setBacking(backing: NotesBacking | null): void;
  /** Loads a scenario's notes. Resolves the number of notes kept. */
  load(scenario: string): Promise<Check<number>>;
  create(draft: unknown): Promise<Check<Note>>;
  update(id: string, fields: unknown): Promise<Check<Note>>;
  remove(id: string): Promise<Check<string>>;
  addCategory(name: string): Promise<Check<string>>;
  clear(): void;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Adds a checked note, or replaces the one with its id, or returns null when the list cannot take it. */
function place(list: readonly Note[], n: Note, mode: "new" | "same"): Note[] | null {
  const at = list.findIndex((x) => x.id === n.id);
  if (mode === "new" ? at >= 0 : at < 0) return null;
  if (list.some((x) => x.id !== n.id && x.seq === n.seq)) return null;
  if (mode === "new" && list.length >= LIMITS.notesPerScenario) return null;
  const next = list.slice();
  if (at >= 0) next[at] = n;
  else next.push(n);
  return sortNotes(next);
}

export function createNotesStore(backing: NotesBacking | null = null) {
  return create<NotesState>()((set, get) => {
    const refuse = (code: NoteErrorCode, where: string) => {
      const f = fail(code, where);
      set({ error: { code, where } });
      return f;
    };
    const refuseWith = (e: NoteError) => refuse(e.code, e.where);
    const needBacking = (): NotesBacking | null => get().backing;

    return {
      backing,
      scenario: null,
      notes: [],
      customCategories: [],
      skipped: 0,
      error: null,

      setBacking: (b) => set({ backing: b }),

      load: async (scenario) => {
        const s = checkScenario(scenario);
        if (!s.ok) return refuseWith(s);
        const b = needBacking();
        if (!b) return refuse("backing_failed", "backing");
        let reply: unknown;
        try {
          reply = await b.list(s.value);
        } catch {
          return refuse("backing_failed", "list");
        }
        if (!isRecord(reply) || !Array.isArray(reply.notes)) return refuse("bad_reply", "list");

        let kept: Note[] = [];
        let skipped = typeof reply.skipped === "number" && Number.isSafeInteger(reply.skipped) && reply.skipped > 0 ? reply.skipped : 0;
        for (const raw of reply.notes) {
          const n = checkNote(raw);
          const next = n.ok && n.value.scenario === s.value ? place(kept, n.value, "new") : null;
          if (next) kept = next;
          else skipped += 1;
        }
        const custom: string[] = [];
        for (const raw of Array.isArray(reply.categories) ? reply.categories : []) {
          const c = checkCategoryName(raw);
          if (c.ok && !categoryExists(STARTER_CATEGORIES, c.value) && !categoryExists(custom, c.value)) custom.push(c.value);
        }
        set({ scenario: s.value, notes: kept, customCategories: custom, skipped, error: null });
        return ok(kept.length);
      },

      create: async (draft) => {
        const d = checkDraft(draft);
        if (!d.ok) return refuseWith(d);
        const st = get();
        if (st.scenario === null || d.value.scenario !== st.scenario) return refuse("bad_scenario", "scenario");
        if (st.notes.length >= LIMITS.notesPerScenario) return refuse("limit_reached", "notes");
        const b = needBacking();
        if (!b) return refuse("backing_failed", "backing");
        let reply: unknown;
        try {
          reply = await b.create(d.value);
        } catch {
          return refuse("backing_failed", "create");
        }
        const n = checkNote(reply);
        if (!n.ok || n.value.scenario !== get().scenario) return refuse("bad_reply", n.ok ? "scenario" : n.where);
        const next = place(get().notes, n.value, "new");
        if (!next) return refuse("bad_reply", "id");
        set({ notes: next, error: null });
        return ok(n.value);
      },

      update: async (id, fields) => {
        const f = checkNoteFields(fields);
        if (!f.ok) return refuseWith(f);
        if (!get().notes.some((x) => x.id === id)) return refuse("not_found", "id");
        const b = needBacking();
        if (!b) return refuse("backing_failed", "backing");
        let reply: unknown;
        try {
          reply = await b.update(id, f.value);
        } catch {
          return refuse("backing_failed", "update");
        }
        const n = checkNote(reply);
        if (!n.ok || n.value.id !== id || n.value.scenario !== get().scenario) return refuse("bad_reply", n.ok ? "id" : n.where);
        const next = place(get().notes, n.value, "same");
        if (!next) return refuse("bad_reply", "id");
        set({ notes: next, error: null });
        return ok(n.value);
      },

      remove: async (id) => {
        if (!get().notes.some((x) => x.id === id)) return refuse("not_found", "id");
        const b = needBacking();
        if (!b) return refuse("backing_failed", "backing");
        try {
          await b.remove(id);
        } catch {
          return refuse("backing_failed", "remove");
        }
        set({ notes: get().notes.filter((x) => x.id !== id), error: null });
        return ok(id);
      },

      addCategory: async (name) => {
        const c = checkCategoryName(normalizeCategoryName(typeof name === "string" ? name : ""), "category");
        if (!c.ok) return refuseWith(c);
        if (categoryExists([...STARTER_CATEGORIES, ...get().customCategories], c.value)) return refuse("category_exists", "category");
        const b = needBacking();
        if (!b) return refuse("backing_failed", "backing");
        let reply: unknown;
        try {
          reply = await b.addCategory(c.value);
        } catch {
          return refuse("backing_failed", "category");
        }
        const r = isRecord(reply) ? checkCategoryName(reply.name, "category") : fail("bad_reply", "category");
        if (!r.ok || !sameCategory(r.value, c.value)) return refuse("bad_reply", "category");
        const now = get().customCategories;
        if (!categoryExists(now, r.value)) set({ customCategories: [...now, r.value] });
        set({ error: null });
        return ok(r.value);
      },

      clear: () => set({ scenario: null, notes: [], customCategories: [], skipped: 0, error: null }),
    };
  });
}

/** The app's store. A page sets its backing once with `setBacking`. */
export const useNotesStore = createNotesStore();
