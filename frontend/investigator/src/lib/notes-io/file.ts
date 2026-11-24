/**
 * Save to a file and load from a file (design section 6), the same format in both builds.
 *
 * Save. The file comes from the transport (the backend's export, or the memory backing), never
 * from a draft: a draft is not a note and is not in the store or in memory. The document is
 * checked again with `checkFile` (the backend's reply is data), written as a JSON Blob through
 * an `a` element with a download name, and the URL is revoked.
 *
 * Load. The size is judged before the text is read (2 MB), then `parseNotesFile` runs the whole
 * check, card number guard included, all or nothing. Only a file that passes reaches the
 * transport, and the store then loads the list again, so every note still enters the page
 * through `checkNote`. A refusal answers with one of the design's sentences (M8, or E10 for the
 * backend), chosen by a fixed code: the value that caused it is never in the answer. When the marks
 * have reloaded, the PASS or FAIL that the notes saved moves to their records (`moveSavedMarks`).
 *
 * The file's scenario must be the page's own scenario: the page holds one, and a scenario switch
 * is a full reload.
 */
import { NotesIoError, statusKeyFor } from "./errors";
import type { NotesTransport } from "./transport";
import { isUntouchedNode, markSaved, marksOf } from "./unsaved";
import { recordKey } from "../marks/types";
import { categoryExists } from "../notes/categories";
import { checkFile, parseNotesFile } from "../notes/file";
import { LIMITS, type NoteErrorCode } from "../notes/types";
import { STATUS, fileResult } from "../tooltip-words/notes";
import { useMarksStore } from "../../store/marks";
import type { NotesState } from "../../store/notes";
import { usePlayhead } from "../../store/playhead";

export interface FileOutcome {
  ok: boolean;
  /** One sentence of the design. Empty when a save went well: the browser shows its own download. */
  message: string;
}

export interface FileDeps {
  transport: NotesTransport;
  /** The page's scenario. */
  scenario: string;
  /** The notes store (or any object with its `getState`). */
  store: { getState(): NotesState };
}

/** What the page reads of a file picked by the person. A `File` fits. */
export interface FileLike {
  size: number;
  text(): Promise<string>;
}

export const downloadName = (scenario: string): string => `ffr-notes-${scenario}.json`;

interface DownloadEnv {
  doc: { createElement(tag: "a"): HTMLAnchorElement; body: { append(n: Node): void } };
  url: { createObjectURL(b: Blob): string; revokeObjectURL(u: string): void };
  later(f: () => void): void;
}

/** Writes a JSON Blob through an `a` element with a download name, then revokes the URL. */
export function triggerDownload(name: string, text: string, env?: Partial<DownloadEnv>): void {
  const doc: DownloadEnv["doc"] = env?.doc ?? document;
  const url: DownloadEnv["url"] = env?.url ?? URL;
  const later = env?.later ?? ((f: () => void) => void setTimeout(f, 0));
  const href = url.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = doc.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  doc.body.append(a);
  a.click();
  a.remove();
  // The click has started the download; the URL is let go after the current task.
  later(() => url.revokeObjectURL(href));
}

const noAnswer = (): FileOutcome => ({ ok: false, message: STATUS.noAnswer });
const bad = (message: string): FileOutcome => ({ ok: false, message });

/** The sentence for a thrown error of a transport (an export or an import). */
function thrownSentence(e: unknown): string {
  const code = e instanceof NotesIoError ? e.code : "no_answer";
  switch (code) {
    case "card_number":
      return fileResult.card;
    case "too_large":
      return fileResult.tooLarge;
    case "bad_scenario":
      return fileResult.scenario;
    case "bad_file":
    case "bad_json":
      return fileResult.notFile;
    default:
      return STATUS[statusKeyFor(code)];
  }
}

/** The sentence for a refusal of the page's own file check. */
function checkSentence(code: NoteErrorCode): string {
  switch (code) {
    case "card_number":
      return fileResult.card;
    case "too_large":
      return fileResult.tooLarge;
    case "bad_scenario":
      return fileResult.scenario;
    default:
      return fileResult.notFile;
  }
}

export async function saveNotesFile(deps: FileDeps, download: (name: string, text: string) => void = triggerDownload): Promise<FileOutcome> {
  let raw: unknown;
  try {
    raw = await deps.transport.exportFile(deps.scenario);
  } catch (e) {
    return bad(thrownSentence(e));
  }
  const checked = checkFile(raw, { scenarios: [deps.scenario] });
  if (!checked.ok) return bad(STATUS.refused);
  download(downloadName(deps.scenario), JSON.stringify(checked.value, null, 2));
  // What the marks store holds is what the file holds (the marks store is the page's one; a caller that
  // injects its own notes store leaves it empty, and its marks then count as nothing).
  markSaved(deps.store.getState().notes, marksOf(useMarksStore.getState()));
  return { ok: true, message: "" };
}

/**
 * The scenario's span of time as the page holds it: the playhead's bounds, which the page sets
 * from its loaded data. A note in a file must lie inside it, because opening a note puts its time
 * in the address. Until the page knows its bounds (max not above min) the span is empty, so a file
 * with notes is refused and a file without notes loads. The bounds are the case's own span.
 */
function pageSpan(): { min: number; max: number } {
  const { minTime, maxTime } = usePlayhead.getState();
  return maxTime > minTime ? { min: minTime, max: maxTime } : { min: 1, max: 0 };
}

export async function loadNotesFile(file: FileLike, deps: FileDeps): Promise<FileOutcome> {
  if (file.size > LIMITS.fileBytes) return bad(fileResult.tooLarge);
  let text: string;
  try {
    text = await file.text();
  } catch {
    return bad(fileResult.notFile);
  }
  const parsed = parseNotesFile(text, { scenarios: [deps.scenario], timeSpan: pageSpan() });
  if (!parsed.ok) return bad(checkSentence(parsed.code));
  try {
    await deps.transport.importFile(parsed.value);
  } catch (e) {
    return bad(thrownSentence(e));
  }
  const loaded = await deps.store.getState().load(deps.scenario);
  if (!loaded.ok) return noAnswer();
  // The marks come back too, when the marks store has a backing (a caller that injects its own notes
  // store leaves it without one). A marks reload that fails leaves the file's sentence as it is: the
  // error stays in the marks store.
  const marks = useMarksStore.getState();
  const marksLoaded = marks.backing !== null ? (await marks.load(deps.scenario)).ok : false;
  // The page is "in a file" only when it holds nothing the file lacks: no note, node, path or Fail category.
  const held = deps.store.getState().notes;
  const heldMarks = marksOf(useMarksStore.getState());
  const notesIn = new Set(parsed.value.notes.map((n) => n.id));
  const nodesIn = new Set(parsed.value.nodes.map((n) => recordKey(n.record)));
  const pathsIn = new Set(parsed.value.paths.map((p) => p.id));
  const inFile =
    held.every((n) => notesIn.has(n.id)) &&
    heldMarks.nodes.every((n) => isUntouchedNode(n) || nodesIn.has(recordKey(n.record))) &&
    heldMarks.paths.every((p) => pathsIn.has(p.id)) &&
    heldMarks.failCategories.every((c) => categoryExists(parsed.value.failCategories, c));
  // D6: the PASS or FAIL that notes saved moves to their records, once the marks have reloaded. The question
  // above was asked first on purpose: a moved node is derived from the file's own notes, which the file
  // already holds, so the page is still in a file after the move and is marked saved with it.
  if (marksLoaded) await useMarksStore.getState().moveSavedMarks(held);
  if (inFile) markSaved(held, marksOf(useMarksStore.getState()));
  return { ok: true, message: fileResult.loaded(parsed.value.notes.length) };
}
