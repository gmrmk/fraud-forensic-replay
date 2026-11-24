/**
 * One transport, two backings (the backend's routes, or memory). It carries the notes backing and
 * the marks backing together, plus the two file operations a backing needs: the file for a scenario,
 * and applying a checked file. It holds no state of its own and reads no clock.
 */
import type { NotesBacking } from "../../store/notes";
import type { PathFields, RecordNode } from "../marks/types";
import type { NotesFile } from "../notes/types";

/**
 * What the marks store asks of a backing: the investigator's nodes, typed Fail categories and custom
 * paths. Every answer is `unknown` data: the store checks it before it is kept or drawn.
 */
export interface MarksBacking {
  /** Resolves `{ nodes, paths, failCategories, skipped }`. */
  list(scenario: string): Promise<unknown>;
  /**
   * Resolves the stored node. With `ifUnsettled` false the three fields are written and `settled` is
   * kept true once it is true. With `ifUnsettled` true (the move of saved note marks only) a row that is
   * already settled comes back unchanged, and an unsettled row takes disposition and category, becomes
   * settled and keeps its pin.
   */
  putNode(node: RecordNode, ifUnsettled: boolean): Promise<unknown>;
  /**
   * Resolves `{ name }`. A typed Fail category belongs to no story: the one list is shared by every story
   * (as the note categories are), so the call names none.
   */
  addFailCategory(name: string): Promise<unknown>;
  /** Resolves the stored path (an id and a seq the backing gave). */
  createPath(draft: { scenario: string } & PathFields): Promise<unknown>;
  /** Resolves the stored path; its id, scenario and seq do not change. */
  updatePath(id: string, fields: PathFields): Promise<unknown>;
  /** A path that is already gone is what was asked for: it does not throw. */
  removePath(id: string): Promise<void>;
}

export interface NotesTransport {
  kind: "api" | "memory";
  backing: NotesBacking;
  marks: MarksBacking;
  /** The file document (version 2) for a scenario. Unchecked: the caller checks it before it is used. */
  exportFile(scenario: string): Promise<unknown>;
  /** Applies a file that has passed `checkFile`. The caller then loads the lists again. */
  importFile(file: NotesFile): Promise<void>;
}
