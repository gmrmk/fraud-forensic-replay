/**
 * Notes and marks that are not in a file. The static site keeps notes, nodes, custom paths and typed
 * Fail categories in memory, so the page asks before it unloads while any of them is not in a file
 * (design section 6). Something is "in a file" when the last save of a file, or the last load of one,
 * held exactly what the page holds now. The live app never asks: the backend holds them.
 *
 * Only the notes the store holds count. A draft is not a note, so an open draft neither makes the
 * page unsaved nor can it reach a file. A node row that is pinned false, "none", null and not settled
 * (a pin pressed twice) is what a record with no row looks like, so it neither counts nor changes the
 * signature; a cleared row that was settled does count (the file holds it).
 */
import type { CustomPath, RecordNode } from "../marks/types";
import type { Note } from "../notes/types";

/** The three lists of the marks store, as a file holds them. */
export interface MarksLists {
  nodes: readonly RecordNode[];
  paths: readonly CustomPath[];
  failCategories: readonly string[];
}

export const NO_MARKS: MarksLists = { nodes: [], paths: [], failCategories: [] };

/** The three lists of a marks state. */
export function marksOf(state: MarksLists): MarksLists {
  return { nodes: state.nodes, paths: state.paths, failCategories: state.failCategories };
}

/** The signature at the last save or load of a file; null before either. */
let saved: string | null = null;

/** A row that reads as a record with no row: not pinned, no disposition, no category, never settled. */
export const isUntouchedNode = (n: RecordNode): boolean => !n.pinned && n.disposition === "none" && n.category === null && !n.settled;
const touchedNodes = (nodes: readonly RecordNode[]): RecordNode[] => nodes.filter((n) => !isUntouchedNode(n));

/** A string that changes with every field a notes file holds: the notes, the nodes, the paths and the Fail categories. */
export function marksAwareSignature(
  notes: readonly Note[],
  nodes: readonly RecordNode[],
  paths: readonly CustomPath[],
  failCategories: readonly string[],
): string {
  return JSON.stringify([
    notes.map((n) => [n.id, n.seq, n.scenario, n.time, n.link, n.colour, n.category, n.decision, n.body]),
    touchedNodes(nodes).map((n) => [n.scenario, n.record.kind, n.record.id, n.pinned, n.disposition, n.category, n.settled]),
    paths.map((p) => [p.id, p.seq, p.scenario, p.name, p.stops.map((s) => [s.kind, s.id])]),
    [...failCategories],
  ]);
}

/** What the page holds now is in a file. */
export function markSaved(notes: readonly Note[], marks: MarksLists): void {
  saved = marksAwareSignature(notes, marks.nodes, marks.paths, marks.failCategories);
}

export function hasUnsaved(notes: readonly Note[], marks: MarksLists): boolean {
  const something = notes.length > 0 || touchedNodes(marks.nodes).length > 0 || marks.paths.length > 0 || marks.failCategories.length > 0;
  return something && marksAwareSignature(notes, marks.nodes, marks.paths, marks.failCategories) !== saved;
}

export function resetUnsaved(): void {
  saved = null;
}

export interface UnloadOptions {
  isStatic: boolean;
  getNotes: () => readonly Note[];
  getMarks: () => MarksLists;
  /** Where the event is heard. The window, when none is given. */
  target?: EventTarget;
}

/** Asks the browser to confirm an unload while notes or marks are unsaved. Returns the function that stops it. */
export function armUnloadPrompt({ isStatic, getNotes, getMarks, target }: UnloadOptions): () => void {
  if (!isStatic) return () => undefined;
  const where: EventTarget = target ?? window;
  const onUnload = (e: Event): void => {
    if (!hasUnsaved(getNotes(), getMarks())) return;
    e.preventDefault();
    // Older browsers read the question from returnValue. The text is the browser's own.
    (e as BeforeUnloadEvent).returnValue = "";
  };
  where.addEventListener("beforeunload", onUnload);
  return () => where.removeEventListener("beforeunload", onUnload);
}
