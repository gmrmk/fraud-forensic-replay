import type { Note } from "./types";

/** Order of notes: by time, then by seq (seq is unique per scenario). No clock is read. */
export function compareNotes(a: Note, b: Note): number {
  return a.time - b.time || a.seq - b.seq;
}

/** A new array in order; the input is left as it was. */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort(compareNotes);
}
