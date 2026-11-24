/**
 * The backing that keeps notes in memory: the static site's, where no backend answers (design
 * section 6, "Static site"). A map of notes per scenario and the custom category names; nothing
 * is written to any browser store, so the notes last until the page unloads, and the page asks
 * first while they are not in a file (unsaved.ts).
 *
 * It answers as the backend does: an id the card guard passes (`makeNoteId` draws again), a seq
 * of max plus 1 per scenario, copies on every read, and the same limits. The store still checks
 * every note it receives (`checkNote`), so this backing is no way around the page's check.
 *
 * The same backing keeps the investigator's marks for the visit (nodes, typed Fail categories, custom
 * paths) with the backend's rules and limits: 1,000 nodes and 20 paths for a story, 100 typed Fail
 * categories in all (one list shared by every story, as the note categories are), `settled` never back
 * to false, ids the card guard passes, seq of max plus 1, copies on every read. It checks its own inputs
 * again and throws the backend's codes.
 */
import { NotesIoError } from "./errors";
import type { NotesTransport } from "./transport";
import { checkNode, checkPathDraft, checkPathFields, compareRecords, makePathId } from "../marks/schema";
import { MARK_LIMITS, recordKey, type CustomPath, type PathFields, type RecordNode } from "../marks/types";
import { STARTER_CATEGORIES, categoryExists, checkCategoryName } from "../notes/categories";
import { buildNotesFile } from "../notes/file";
import { makeNoteId } from "../notes/id";
import { sortNotes } from "../notes/order";
import { LIMITS, type Check, type Note, type NoteDraft, type NoteFields, type NotesFile } from "../notes/types";

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A refused check, in the codes the backend answers with: a card number and a too long name keep their
 *  own, any other refusal is a bad request. The error names no value. */
function refusedBy<T>(c: Check<T>): T {
  if (c.ok) return c.value;
  throw new NotesIoError(c.code === "card_number" || c.code === "too_long" || c.code === "bad_scenario" ? c.code : "bad_request");
}

export function createMemoryBacking(uuid?: () => string): NotesTransport {
  /** scenario -> id -> note. Held notes are never handed out: every read is a copy. */
  const held = new Map<string, Map<string, Note>>();
  const customCategories: string[] = [];
  // The marks, with the same rules and limits as the backend's tables. Nothing here reaches a browser
  // store: they last until the page unloads, and the page asks first while they are not in a file.
  /** scenario -> record key -> node. */
  const nodesHeld = new Map<string, Map<string, RecordNode>>();
  /** path id -> path. Ids are global, as notes' are. */
  const pathsHeld = new Map<string, CustomPath>();
  /** The typed Fail categories of the visit, in the order they were added: one list for every story. */
  const failHeld: string[] = [];

  const nodeMap = (scenario: string): Map<string, RecordNode> => {
    let m = nodesHeld.get(scenario);
    if (!m) nodesHeld.set(scenario, (m = new Map()));
    return m;
  };
  const pathsOf = (scenario: string): CustomPath[] =>
    [...pathsHeld.values()].filter((p) => p.scenario === scenario).sort((a, b) => a.seq - b.seq);
  const topSeq = (paths: readonly CustomPath[]): number => paths.reduce((top, p) => Math.max(top, p.seq), 0);
  const mintPath = (): string => {
    for (let i = 0; i < 8; i++) {
      const id = makePathId(uuid);
      if (!pathsHeld.has(id)) return id;
    }
    throw new NotesIoError("backing_failed");
  };

  const scenarioMap = (scenario: string): Map<string, Note> => {
    let m = held.get(scenario);
    if (!m) held.set(scenario, (m = new Map()));
    return m;
  };
  const nextSeq = (m: Map<string, Note>): number => {
    let top = 0;
    for (const n of m.values()) top = Math.max(top, n.seq);
    return top + 1;
  };
  const find = (id: string): Note | null => {
    for (const m of held.values()) {
      const n = m.get(id);
      if (n) return n;
    }
    return null;
  };
  const taken = (id: string): boolean => find(id) !== null;
  const mint = (): string => {
    for (let i = 0; i < 8; i++) {
      const id = makeNoteId(uuid);
      if (!taken(id)) return id;
    }
    throw new NotesIoError("backing_failed");
  };

  return {
    kind: "memory",
    backing: {
      async list(scenario) {
        return { notes: copy(sortNotes([...scenarioMap(scenario).values()])), categories: [...customCategories], skipped: 0 };
      },
      async create(draft: NoteDraft) {
        const m = scenarioMap(draft.scenario);
        if (m.size >= LIMITS.notesPerScenario) throw new NotesIoError("limit_reached");
        const note: Note = { ...copy(draft), id: mint(), seq: nextSeq(m) };
        m.set(note.id, note);
        return copy(note);
      },
      async update(id: string, fields: NoteFields) {
        const old = find(id);
        if (!old) throw new NotesIoError("not_found");
        const note: Note = { ...old, ...copy(fields) };
        scenarioMap(old.scenario).set(id, note);
        return copy(note);
      },
      async remove(id: string) {
        for (const m of held.values()) m.delete(id);
      },
      async addCategory(name: string) {
        if (categoryExists([...STARTER_CATEGORIES, ...customCategories], name)) throw new NotesIoError("category_exists");
        customCategories.push(name);
        return { name };
      },
    },

    marks: {
      async list(scenario: string) {
        const nodes = [...nodeMap(scenario).values()].sort((a, b) => compareRecords(a.record, b.record));
        return { nodes: copy(nodes), paths: copy(pathsOf(scenario)), failCategories: [...failHeld], skipped: 0 };
      },

      async putNode(raw: RecordNode, ifUnsettled: boolean) {
        const node = refusedBy(checkNode(raw));
        const m = nodeMap(node.scenario);
        const key = recordKey(node.record);
        const old = m.get(key);
        if (!old && m.size >= MARK_LIMITS.nodesPerScenario) throw new NotesIoError("limit_reached");
        let next: RecordNode;
        if (ifUnsettled) {
          if (old && old.settled) return copy(old);
          // An unsettled row keeps its pin and takes the disposition and category; no row inserts as sent.
          next = old ? { ...old, disposition: node.disposition, category: node.category, settled: true } : node;
        } else {
          next = { ...node, settled: (old?.settled ?? false) || node.settled };
        }
        m.set(key, copy(next));
        return copy(next);
      },

      async addFailCategory(name: string) {
        const n = refusedBy(checkCategoryName(name, "category"));
        if (categoryExists(failHeld, n)) throw new NotesIoError("category_exists");
        if (failHeld.length >= MARK_LIMITS.failCategories) throw new NotesIoError("limit_reached");
        failHeld.push(n);
        return { name: n };
      },

      async createPath(raw: { scenario: string } & PathFields) {
        const draft = refusedBy(checkPathDraft(raw));
        const mine = pathsOf(draft.scenario);
        if (mine.length >= MARK_LIMITS.pathsPerScenario) throw new NotesIoError("limit_reached");
        const path: CustomPath = { id: mintPath(), scenario: draft.scenario, seq: topSeq(mine) + 1, name: draft.name, stops: draft.stops };
        pathsHeld.set(path.id, path);
        return copy(path);
      },

      async updatePath(id: string, raw: PathFields) {
        const fields = refusedBy(checkPathFields(raw));
        const old = pathsHeld.get(id);
        if (!old) throw new NotesIoError("not_found");
        const path: CustomPath = { ...old, name: fields.name, stops: fields.stops };
        pathsHeld.set(id, path);
        return copy(path);
      },

      async removePath(id: string) {
        pathsHeld.delete(id);
      },
    },

    async exportFile(scenario: string) {
      return buildNotesFile(scenario, customCategories, [...scenarioMap(scenario).values()], {
        nodes: [...nodeMap(scenario).values()],
        paths: pathsOf(scenario),
        failCategories: [...failHeld],
      });
    },

    /**
     * A checked file, applied as one step: a note whose id is held replaces it and keeps its seq, a new
     * id takes the next seq in file order. A node of the file replaces the node of its record with
     * `settled` held OR the file's; a path whose id is held keeps its seq and takes the file's name and
     * stops, a new id takes the next seq; Fail categories merge ignoring case. The held state changes
     * only when every part fits: the four limits and the id rule are judged before anything is kept.
     */
    async importFile(file: NotesFile) {
      const m = scenarioMap(file.scenario);
      const next = new Map(m);
      let seq = nextSeq(m);
      for (const n of file.notes) {
        const old = next.get(n.id);
        if (!old && find(n.id)) throw new NotesIoError("bad_file"); // an id held by another scenario
        const note: Note = { ...copy(n), scenario: file.scenario, seq: old ? old.seq : seq++ };
        next.set(n.id, note);
      }
      if (next.size > LIMITS.notesPerScenario) throw new NotesIoError("limit_reached");

      const nodes = new Map(nodeMap(file.scenario));
      for (const n of file.nodes) {
        const key = recordKey(n.record);
        const node: RecordNode = { ...copy(n), scenario: file.scenario, settled: (nodes.get(key)?.settled ?? false) || n.settled };
        nodes.set(key, node);
      }
      if (nodes.size > MARK_LIMITS.nodesPerScenario) throw new NotesIoError("limit_reached");

      const paths = new Map(pathsOf(file.scenario).map((p) => [p.id, p]));
      let pathSeq = topSeq([...paths.values()]);
      for (const p of file.paths) {
        const old = paths.get(p.id);
        const elsewhere = pathsHeld.get(p.id);
        if (!old && elsewhere) throw new NotesIoError("bad_file"); // an id held by another scenario
        paths.set(p.id, { id: p.id, scenario: file.scenario, seq: old ? old.seq : ++pathSeq, name: p.name, stops: copy(p.stops) });
      }
      if (paths.size > MARK_LIMITS.pathsPerScenario) throw new NotesIoError("limit_reached");

      // The file's names merge into the one shared list, ignoring case; the merged list may not pass 100.
      const fails = [...failHeld];
      for (const name of file.failCategories) if (!categoryExists(fails, name)) fails.push(name);
      if (fails.length > MARK_LIMITS.failCategories) throw new NotesIoError("limit_reached");

      m.clear();
      for (const [id, n] of next) m.set(id, n);
      for (const name of file.categories) {
        if (!categoryExists([...STARTER_CATEGORIES, ...customCategories], name)) customCategories.push(name);
      }
      nodesHeld.set(file.scenario, nodes);
      for (const [id, p] of paths) pathsHeld.set(id, p);
      failHeld.splice(0, failHeld.length, ...fails);
    },
  };
}
