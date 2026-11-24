/**
 * The page's one notes transport. It is chosen once by the build (`isStatic`: the memory
 * backing for the static site, the api backing for the live app), never by a failed fetch, and
 * handed to the notes store and to the marks store (one transport, two backings). A second call
 * returns the same transport, so a remount loses no notes and no marks.
 */
import { createApiBacking } from "./apiBacking";
import { createMemoryBacking } from "./memoryBacking";
import type { NotesTransport } from "./transport";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";

let current: NotesTransport | null = null;

export function startNotesTransport(isStatic: boolean): NotesTransport {
  if (!current) current = isStatic ? createMemoryBacking() : createApiBacking();
  useNotesStore.getState().setBacking(current.backing);
  useMarksStore.getState().setBacking(current.marks);
  return current;
}

export function currentTransport(): NotesTransport | null {
  return current;
}

/** For tests: forget the transport. */
export function resetNotesTransport(): void {
  current = null;
}
