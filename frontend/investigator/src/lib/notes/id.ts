/**
 * The id maker (memory backing; the backend has its own twin). An id is `note-` plus 32
 * lowercase hex from a uuid. Hex digits include 0 to 9, so about 1 id in 450 holds a run the
 * card number guard refuses: the maker draws again until the guard passes the id.
 */
import { refusesText } from "./guard";
import { LIMITS } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function defaultUuid(): string {
  return crypto.randomUUID();
}

/**
 * `uuid` is the random source (injected so a test can feed it a refused draw). Throws after
 * `maxDraws` draws that gave no usable id; the error names no id.
 */
export function makeNoteId(uuid: () => string = defaultUuid, maxDraws = 16): string {
  for (let draw = 0; draw < maxDraws; draw++) {
    const raw = uuid().toLowerCase();
    if (!UUID.test(raw)) continue;
    const id = "note-" + raw.replaceAll("-", "");
    if (id.length === 5 + LIMITS.idHex && !refusesText(id)) return id;
  }
  throw new Error("note id: no usable draw");
}
