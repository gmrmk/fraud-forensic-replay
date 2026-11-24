/**
 * The seam (design section 7): a note as the platform's abstract Entity, so a new person-made
 * kind needs no change to the Timeline, the store interface or the guard. The linked record's
 * place is looked up by the caller (`resolve`) at draw time; no coordinates are stored.
 */
import type { Entity } from "../entity";
import { noteLabel } from "./body";
import type { Note, NoteLink } from "./types";

/** Resolves the record a note links to into a place, or null when it has none in the data. */
export type ResolveLink = (link: NoteLink) => { lat: number; lng: number } | null;

export function noteToEntity(note: Note, resolve: ResolveLink): Entity {
  const label = noteLabel(note);
  return {
    id: note.id,
    kind: "note",
    timestamp: note.time,
    coords: note.link === null ? null : resolve(note.link),
    fields: {
      category: note.category,
      decision: note.decision,
      colour: note.colour,
      label,
      body: note.body,
      link_kind: note.link === null ? null : note.link.kind,
      link_id: note.link === null ? null : note.link.id,
      seq: note.seq,
      scenario: note.scenario,
    },
    displayMetadata: {
      primaryLabel: label,
      secondaryLabel: note.category,
      paletteKind: "note",
      pivotableFields: [],
      detailFieldOrder: ["category", "decision", "time", "link", "body"],
    },
  };
}
