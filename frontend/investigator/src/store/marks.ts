/**
 * The marks store: what the investigator did to records (a pin, a disposition and a Fail category),
 * their typed Fail categories (one list for every story) and their custom paths, for the story the
 * page holds. The backing (the
 * backend, or memory) is injected as an interface; this module holds no network call and no browser
 * storage, and reads no clock.
 *
 * ONE DOOR. A node or a path reaches the lists only through a checked write: the page's own check
 * (`checkNode`, `checkPath`, the card number guard included) runs before anything is sent and again on
 * what the backing answers. A reply is data: one that is not a record, names another record or story,
 * or repeats a held id is a bad reply and is never placed. A refusal holds a code and a path, never a
 * value.
 *
 * The hooks at the foot select raw slices and derive with `useMemo`, so a result keeps its identity
 * until a slice it reads changes (no selector returns a new object).
 *
 * THE MOVE (D6). `moveSavedMarks` gives records the PASS or FAIL their linked notes saved, writing only
 * with `ifUnsettled`. Every node write (a press, a pin, a category, the move) runs in one line, so a
 * press is built from the store after an earlier move's answer is placed, never from a read made before.
 *
 * What this file does not do: it never deletes a node (clearing writes the cleared node and keeps it),
 * it never writes a note, and it draws nothing.
 */
import { useMemo } from "react";
import { create } from "zustand";
import { linkFromSelected, lookupFromContext, type RecordLookup } from "../components/notes/record-lookup";
import { showInputsOf, type DrawInputs, type ShowInputs } from "../lib/marks/draw";
import { movedMarks } from "../lib/marks/move";
import { checkNode, checkPath, checkPathDraft, checkPathFields, checkRecord, compareRecords } from "../lib/marks/schema";
import {
  factsIndex,
  failCategoryList,
  failWords,
  nextPathName,
  nodeOf,
  notesOf,
  yourMarks,
  type YourMark,
} from "../lib/marks/select";
import {
  MARK_LIMITS,
  canonicalKind,
  recordKey,
  sameRecord,
  type CustomPath,
  type PathFields,
  type RecordFacts,
  type RecordNode,
  type RecordRef,
  type SetDisposition,
} from "../lib/marks/types";
import type { MarksBacking } from "../lib/notes-io/transport";
import { categoryExists, checkCategoryName, normalizeCategoryName, sameCategory } from "../lib/notes/categories";
import { checkScenario } from "../lib/notes/schema";
import { fail, ok, type Check, type Note, type NoteError, type NoteErrorCode } from "../lib/notes/types";
import { overlaysOf } from "../lib/verdicts";
import { PIN_WINS, useLayers } from "./layers";
import { useNotesStore } from "./notes";
import { usePivotData } from "./pivot-data";
import { usePivotStore } from "./pivot";
import { usePlayhead } from "./playhead";
import { useSchema } from "./schema";
import { useSelection } from "./selection";

export interface MarksState {
  backing: MarksBacking | null;
  scenario: string | null;
  /** Checked nodes of the loaded story, in record key order. */
  nodes: RecordNode[];
  /** Checked paths of the loaded story, in seq order. */
  paths: CustomPath[];
  /** The typed Fail categories, in the order they were added: one list shared by every story, so a change of story keeps it. */
  failCategories: string[];
  /** Rows that arrived in a list and were refused. */
  skipped: number;
  /** The last refusal: a fixed code and a path, never a value. */
  error: NoteError | null;
  setBacking(backing: MarksBacking | null): void;
  /** Loads a story's marks. Resolves the number of nodes kept. */
  load(scenario: string): Promise<Check<number>>;
  /** Sets the disposition; a press on the held one clears it to none. Writes category null and settled true. */
  pressDisposition(record: RecordRef, d: SetDisposition): Promise<Check<RecordNode>>;
  /** Only while the disposition is FAIL. Writes settled true. */
  setCategory(record: RecordRef, category: string | null): Promise<Check<RecordNode>>;
  /** Flips the pin and keeps `settled` as the node held it (false for a record with no row); the record's windows follow. */
  togglePin(record: RecordRef): Promise<Check<RecordNode>>;
  addFailCategory(name: string): Promise<Check<string>>;
  /** The name defaults to `nextPathName(paths)`. */
  createPath(stops: RecordRef[], name?: string): Promise<Check<CustomPath>>;
  updatePath(id: string, fields: PathFields): Promise<Check<CustomPath>>;
  removePath(id: string): Promise<Check<string>>;
  /**
   * D6: gives each record whose node is not yet settled the PASS or FAIL its linked notes saved (see
   * `movedMarks`). Every row goes out with `ifUnsettled` true, so a settled row never changes, and no note
   * is written. Resolves the number of rows written; a refusal stops it and stays as the answer.
   */
  moveSavedMarks(notes: readonly Note[]): Promise<Check<number>>;
  clear(): void;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function createMarksStore(backing: MarksBacking | null = null) {
  return create<MarksState>()((set, get) => {
    const refuse = (code: NoteErrorCode, where: string) => {
      const f = fail(code, where);
      set({ error: { code, where } });
      return f;
    };
    const refuseWith = (e: NoteError) => refuse(e.code, e.where);
    const needBacking = (): MarksBacking | null => get().backing;

    /** The node the record holds, or the cleared default of the loaded story (null with no story). */
    const current = (record: RecordRef): RecordNode | null => {
      const scenario = get().scenario;
      if (scenario === null) return null;
      return (
        nodeOf(get().nodes, record) ?? {
          scenario,
          record: { kind: record.kind, id: record.id },
          pinned: false,
          disposition: "none",
          category: null,
          settled: false,
        }
      );
    };

    /** The door for a node: check it, count it, send it, check the reply, place it. */
    const write = async (next: RecordNode, ifUnsettled = false): Promise<Check<RecordNode>> => {
      const checked = checkNode(next);
      if (!checked.ok) return refuseWith(checked);
      const st = get();
      if (st.scenario === null || checked.value.scenario !== st.scenario) return refuse("bad_scenario", "scenario");
      const held = nodeOf(st.nodes, checked.value.record);
      // A cleared node still counts: rows are never deleted.
      if (!held && st.nodes.length >= MARK_LIMITS.nodesPerScenario) return refuse("limit_reached", "nodes");
      const b = needBacking();
      if (!b) return refuse("backing_failed", "backing");
      let reply: unknown;
      try {
        reply = await b.putNode(checked.value, ifUnsettled);
      } catch {
        return refuse("backing_failed", "node");
      }
      const n = checkNode(reply);
      if (!n.ok) return refuse("bad_reply", n.where);
      if (n.value.scenario !== get().scenario || !sameRecord(n.value.record, checked.value.record)) return refuse("bad_reply", "record");
      const rest = get().nodes.filter((x) => !sameRecord(x.record, n.value.record));
      set({ nodes: [...rest, n.value].sort((a, b2) => compareRecords(a.record, b2.record)), error: null });
      return ok(n.value);
    };

    /**
     * One line for every node write: a press and the move of saved note marks never overlap. A press
     * builds the node it sends from the store, so one built before the move's answer is placed would send
     * the older disposition back (the backend writes a press as sent and keeps `settled` true), and the
     * move would never write that record again. Each step reads the store when its turn comes. A step that
     * throws does not stop the line.
     */
    let line: Promise<unknown> = Promise.resolve();
    const inLine = <T>(step: () => Promise<T>): Promise<T> => {
      const run = line.then(step, step);
      line = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    };

    /** The record, checked and written canonical. */
    const recordOf = (record: RecordRef): Check<RecordRef> => checkRecord(record, "record");

    return {
      backing,
      scenario: null,
      nodes: [],
      paths: [],
      failCategories: [],
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
        if (!isRecord(reply) || !Array.isArray(reply.nodes) || !Array.isArray(reply.paths) || !Array.isArray(reply.failCategories)) {
          return refuse("bad_reply", "list");
        }
        let skipped = typeof reply.skipped === "number" && Number.isSafeInteger(reply.skipped) && reply.skipped > 0 ? reply.skipped : 0;

        const nodes: RecordNode[] = [];
        const records = new Set<string>();
        for (const raw of reply.nodes) {
          const n = checkNode(raw);
          if (n.ok && n.value.scenario === s.value && !records.has(recordKey(n.value.record))) {
            records.add(recordKey(n.value.record));
            nodes.push(n.value);
          } else skipped += 1;
        }
        nodes.sort((a, b2) => compareRecords(a.record, b2.record));

        const paths: CustomPath[] = [];
        const ids = new Set<string>();
        const seqs = new Set<number>();
        for (const raw of reply.paths) {
          const p = checkPath(raw);
          if (p.ok && p.value.scenario === s.value && !ids.has(p.value.id) && !seqs.has(p.value.seq)) {
            ids.add(p.value.id);
            seqs.add(p.value.seq);
            paths.push(p.value);
          } else skipped += 1;
        }
        paths.sort((a, b2) => a.seq - b2.seq);

        const failCategories: string[] = [];
        for (const raw of reply.failCategories) {
          const c = checkCategoryName(raw);
          if (c.ok && !categoryExists(failCategories, c.value)) failCategories.push(c.value);
        }
        set({ scenario: s.value, nodes, paths, failCategories, skipped, error: null });
        return ok(nodes.length);
      },

      pressDisposition: (record, d) =>
        inLine(async () => {
          const r = recordOf(record);
          if (!r.ok) return refuseWith(r);
          const cur = current(r.value);
          if (!cur) return refuse("bad_scenario", "scenario");
          return write({ ...cur, disposition: cur.disposition === d ? "none" : d, category: null, settled: true });
        }),

      setCategory: (record, category) =>
        inLine(async () => {
          const r = recordOf(record);
          if (!r.ok) return refuseWith(r);
          const cur = current(r.value);
          if (!cur) return refuse("bad_scenario", "scenario");
          if (cur.disposition !== "fail") return refuse("bad_request", "disposition");
          let name: string | null = null;
          if (category !== null) {
            const c = checkCategoryName(normalizeCategoryName(typeof category === "string" ? category : ""), "category");
            if (!c.ok) return refuseWith(c);
            name = c.value;
          }
          return write({ ...cur, category: name, settled: true });
        }),

      togglePin: (record) =>
        inLine(async () => {
          const r = recordOf(record);
          if (!r.ok) return refuseWith(r);
          const cur = current(r.value);
          if (!cur) return refuse("bad_scenario", "scenario");
          const done = await write({ ...cur, pinned: !cur.pinned });
          if (done.ok) usePivotStore.getState().setRecordPinned(done.value.record, done.value.pinned);
          return done;
        }),

      addFailCategory: async (name) => {
        const st = get();
        if (st.scenario === null) return refuse("bad_scenario", "scenario");
        const c = checkCategoryName(normalizeCategoryName(typeof name === "string" ? name : ""), "category");
        if (!c.ok) return refuseWith(c);
        if (categoryExists(st.failCategories, c.value)) return refuse("category_exists", "category");
        if (st.failCategories.length >= MARK_LIMITS.failCategories) return refuse("limit_reached", "failCategories");
        const b = needBacking();
        if (!b) return refuse("backing_failed", "backing");
        let reply: unknown;
        try {
          reply = await b.addFailCategory(c.value);
        } catch {
          return refuse("backing_failed", "category");
        }
        const named = isRecord(reply) ? checkCategoryName(reply.name, "category") : fail("bad_reply", "category");
        if (!named.ok || !sameCategory(named.value, c.value)) return refuse("bad_reply", "category");
        const now = get().failCategories;
        if (!categoryExists(now, named.value)) set({ failCategories: [...now, named.value] });
        set({ error: null });
        return ok(named.value);
      },

      createPath: async (stops, name) => {
        const st = get();
        if (st.scenario === null) return refuse("bad_scenario", "scenario");
        const draft = checkPathDraft({
          scenario: st.scenario,
          name: name === undefined ? nextPathName(st.paths) : normalizeCategoryName(typeof name === "string" ? name : ""),
          stops,
        });
        if (!draft.ok) return refuseWith(draft);
        if (st.paths.length >= MARK_LIMITS.pathsPerScenario) return refuse("limit_reached", "paths");
        const b = needBacking();
        if (!b) return refuse("backing_failed", "backing");
        let reply: unknown;
        try {
          reply = await b.createPath(draft.value);
        } catch {
          return refuse("backing_failed", "create");
        }
        const p = checkPath(reply);
        if (!p.ok) return refuse("bad_reply", p.where);
        const held = get().paths;
        const same =
          p.value.scenario === get().scenario &&
          p.value.name === draft.value.name &&
          p.value.stops.length === draft.value.stops.length &&
          p.value.stops.every((s, i) => sameRecord(s, draft.value.stops[i]));
        if (!same || held.some((x) => x.id === p.value.id || x.seq === p.value.seq)) return refuse("bad_reply", "id");
        set({ paths: [...held, p.value].sort((a, b2) => a.seq - b2.seq), error: null });
        return ok(p.value);
      },

      updatePath: async (id, fields) => {
        const f = checkPathFields(fields);
        if (!f.ok) return refuseWith(f);
        const old = get().paths.find((x) => x.id === id);
        if (!old) return refuse("not_found", "id");
        const b = needBacking();
        if (!b) return refuse("backing_failed", "backing");
        let reply: unknown;
        try {
          reply = await b.updatePath(id, f.value);
        } catch {
          return refuse("backing_failed", "update");
        }
        const p = checkPath(reply);
        if (!p.ok) return refuse("bad_reply", p.where);
        // The id, the story and the seq do not change on an update.
        if (p.value.id !== id || p.value.scenario !== old.scenario || p.value.seq !== old.seq) return refuse("bad_reply", "id");
        set({ paths: get().paths.map((x) => (x.id === id ? p.value : x)), error: null });
        return ok(p.value);
      },

      removePath: async (id) => {
        if (!get().paths.some((x) => x.id === id)) return refuse("not_found", "id");
        const b = needBacking();
        if (!b) return refuse("backing_failed", "backing");
        try {
          await b.removePath(id);
        } catch {
          return refuse("backing_failed", "remove");
        }
        set({ paths: get().paths.filter((x) => x.id !== id), error: null });
        return ok(id);
      },

      moveSavedMarks: (notes) =>
        inLine(async () => {
          const st = get();
          if (st.scenario === null) return refuse("bad_scenario", "scenario");
          let written = 0;
          for (const row of movedMarks(st.scenario, notes, st.nodes)) {
            const done = await write(row, true);
            if (!done.ok) return done;
            // A row the backing already held settled comes back as it was, and is not counted.
            if (done.value.disposition === row.disposition) written += 1;
          }
          return ok(written);
        }),

      clear: () => set({ scenario: null, nodes: [], paths: [], failCategories: [], skipped: 0, error: null }),
    };
  });
}

/** The app's store. A page sets its backing once with `setBacking`. */
export const useMarksStore = createMarksStore();

/**
 * Opens (or raises) the record's own window, pinned when the record is pinned. The one opener: nobody
 * computes a spot of their own. Null with no story (the marks store's, else the notes store's).
 */
export function openRecordWindow(record: RecordRef, lookup: RecordLookup, at?: { x: number; y: number }): string | null {
  const marks = useMarksStore.getState();
  const scenario = marks.scenario ?? useNotesStore.getState().scenario;
  if (scenario === null) return null;
  const rec: RecordRef = { kind: canonicalKind(record.kind), id: record.id };
  return usePivotStore.getState().openRecord(rec, {
    lngLat: lookup(rec)?.lngLat ?? null,
    pinned: nodeOf(marks.nodes, rec)?.pinned ?? false,
    at,
  });
}

// ---------------------------------------------------------------------------- the hooks

/** The record's node, or null. Follows the store; the same node until that row changes. */
export function useRecordNode(r: RecordRef | null): RecordNode | null {
  const nodes = useMarksStore((s) => s.nodes);
  const key = r === null ? null : recordKey(r);
  return useMemo(() => (key === null ? null : (nodes.find((n) => recordKey(n.record) === key) ?? null)), [nodes, key]);
}

/** The story's notes linked to the record, in time then seq order. */
export function useRecordNotes(r: RecordRef | null): Note[] {
  const notes = useNotesStore((s) => s.notes);
  const scenario = useNotesStore((s) => s.scenario);
  const kind = r === null ? null : r.kind;
  const id = r === null ? null : r.id;
  return useMemo(() => (kind === null || id === null || scenario === null ? [] : notesOf(notes, scenario, { kind, id })), [notes, scenario, kind, id]);
}

/** One function from a record to what the investigator did to it; changes only with the nodes, notes or paths. */
export function useRecordFacts(): (r: RecordRef) => RecordFacts {
  const nodes = useMarksStore((s) => s.nodes);
  const paths = useMarksStore((s) => s.paths);
  const marksScenario = useMarksStore((s) => s.scenario);
  const notes = useNotesStore((s) => s.notes);
  const notesScenario = useNotesStore((s) => s.scenario);
  const scenario = marksScenario ?? notesScenario ?? "";
  return useMemo(() => factsIndex(scenario, nodes, notes, paths), [scenario, nodes, notes, paths]);
}

/** The Fail category list of the window: the story's failed-decision words, then the typed names. */
export function useFailCategories(): string[] {
  const entities = usePivotData((s) => s.entities);
  const schemaNodes = useSchema((s) => s.nodes);
  const typed = useMarksStore((s) => s.failCategories);
  return useMemo(() => failCategoryList(failWords(overlaysOf(entities, schemaNodes)), typed), [entities, schemaNodes, typed]);
}

/** Your marks: the marked records of the story, pinned first. */
export function useYourMarks(lookup: RecordLookup): YourMark[] {
  const nodes = useMarksStore((s) => s.nodes);
  const marksScenario = useMarksStore((s) => s.scenario);
  const notes = useNotesStore((s) => s.notes);
  const notesScenario = useNotesStore((s) => s.scenario);
  const scenario = marksScenario ?? notesScenario;
  return useMemo(() => (scenario === null ? [] : yourMarks(scenario, nodes, notes, lookup)), [scenario, nodes, notes, lookup]);
}

/**
 * A lookup over the five lists of the case (places are not in them: a place link finds nothing here,
 * which shows nowhere, since a place has no time). Memoised on the five lists, so its index is rebuilt
 * when one changes and not otherwise.
 */
export function useCaseLookup(): RecordLookup {
  const transactions = usePivotData((s) => s.transactions);
  const logins = usePivotData((s) => s.logins);
  const accountEvents = usePivotData((s) => s.accountEvents);
  const transfers = usePivotData((s) => s.transfers);
  const entities = usePivotData((s) => s.entities);
  return useMemo(
    () => lookupFromContext({ transactions, logins, places: [], accountEvents, transfers, entities }),
    [transactions, logins, accountEvents, transfers, entities],
  );
}

/**
 * The record the Inspector shows, in canonical form, or null: the selection read as a link
 * (`linkFromSelected`, which leaves out a selected note and a record whose id the link check refuses),
 * its kind made canonical. The same object while the record is the same, whatever new selection
 * object arrives for it.
 */
function useSelectedRecord(): RecordRef | null {
  const selected = useSelection((s) => s.selected);
  const link = linkFromSelected(selected);
  const kind = link === null ? null : canonicalKind(link.kind);
  const id = link === null ? null : link.id;
  return useMemo(() => (kind === null || id === null ? null : { kind, id }), [kind, id]);
}

/**
 * The switches the one function reads, and the selected record; its value holds still between
 * playhead ticks and changes when the selected record does.
 */
export function useShowInputs(): ShowInputs {
  const showAuths = useLayers((s) => s.showAuths);
  const showLogins = useLayers((s) => s.showLogins);
  const showPlaces = useLayers((s) => s.showPlaces);
  const hiddenKinds = useLayers((s) => s.hiddenKinds);
  const hiddenValues = useLayers((s) => s.hiddenValues);
  const yoursOn = useLayers((s) => s.yoursOn);
  const yoursFacets = useLayers((s) => s.yoursFacets);
  const schemaNodes = useSchema((s) => s.nodes);
  const facts = useRecordFacts();
  const selected = useSelectedRecord();
  return useMemo(
    () => showInputsOf({ showAuths, showLogins, showPlaces, pinWins: PIN_WINS, hiddenKinds, hiddenValues, yoursOn, yoursFacets }, schemaNodes, facts, selected),
    [showAuths, showLogins, showPlaces, hiddenKinds, hiddenValues, yoursOn, yoursFacets, schemaNodes, facts, selected],
  );
}

/** The one function's inputs: the switches, plus the playhead (the only clock) and whether its bounds have loaded. */
export function useDrawInputs(): DrawInputs {
  const show = useShowInputs();
  const playhead = usePlayhead((s) => s.playhead);
  const windowed = usePlayhead((s) => s.maxTime > s.minTime);
  return useMemo(() => ({ ...show, playhead, windowed }), [show, playhead, windowed]);
}
