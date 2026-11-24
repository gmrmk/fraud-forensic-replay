/**
 * Shared support for the notes component tests: an in-memory backing for the store, a pivot
 * context with one record a note can link to, and a fake clipboard. Not shipped: only tests import it.
 */
import { makeNoteId } from "../../lib/notes/id";
import type { Entity } from "../../lib/entity";
import type { PivotContext } from "../../lib/matches";
import type { NotesBacking } from "../../store/notes";
import type { Note, NoteDraft, NoteFields } from "../../lib/notes/types";

export const SCENARIO = "card-fraud";
/** A note time from the shared fixtures (a 13 digit number that is not a card number). */
export const NOTE_TIME = 1763556003600;

/** A backing that keeps notes in a map, as the static build's memory backing does. */
export function fakeBacking(): NotesBacking & { rows: Map<string, Note>; calls: string[] } {
  const rows = new Map<string, Note>();
  const calls: string[] = [];
  let seq = 0;
  return {
    rows,
    calls,
    async list() {
      calls.push("list");
      return { notes: [...rows.values()], categories: [], skipped: 0 };
    },
    async create(draft: NoteDraft) {
      calls.push("create");
      seq += 1;
      const n: Note = { ...draft, id: makeNoteId(), seq };
      rows.set(n.id, n);
      return n;
    },
    async update(id: string, fields: NoteFields) {
      calls.push("update");
      const old = rows.get(id);
      if (!old) throw new Error("none");
      const n: Note = { ...old, ...fields };
      rows.set(id, n);
      return n;
    },
    async remove(id: string) {
      calls.push("remove");
      rows.delete(id);
    },
    async addCategory(name: string) {
      calls.push("category");
      return { name };
    },
  };
}

export const RECORD: Entity = {
  id: "rec-1",
  kind: "stop",
  timestamp: NOTE_TIME,
  coords: { lat: 29.76, lng: -95.37 },
  fields: {},
  displayMetadata: { primaryLabel: "Corner Store", secondaryLabel: "", paletteKind: "stop", pivotableFields: [] },
};

export const CONTEXT: PivotContext = { transactions: [], logins: [], places: [], entities: [RECORD] };

/** A fake clipboard that offers HTML as well as plain text. */
export function fakeClipboard(plain: string) {
  return {
    getData: (type: string) =>
      type === "text/plain" ? plain : type === "text/html" ? '<p>x<img src="x" onerror="boom()"><a href="https://example.test">y</a></p>' : "",
    types: ["text/html", "text/plain"],
  };
}
