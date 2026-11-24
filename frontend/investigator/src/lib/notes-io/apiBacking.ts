/**
 * The backing that talks to the backend's routes (design section 6). Chosen by the build, never
 * by a failed fetch.
 *
 * - Every write (POST, PUT, DELETE) sends `X-FFR-Client: notes`; a request with a body also sends
 *   `Content-Type: application/json`. DELETE has no body and no content type. The custom header
 *   makes a cross-site `fetch` fail its preflight; the backend sends no CORS headers.
 * - A reply is data: the store checks every note again (`checkNote`) before it is kept or drawn.
 * - Failures. No answer (a network failure, a 5xx, a reply that is not JSON) throws
 *   `NotesIoError("no_answer")`, which the store reads as "the backend did not answer". A 4xx on
 *   create, update or addCategory resolves a value the store cannot take (a bad reply), so the
 *   window says "The backend refused the note." The code of a refusal is read from `detail.code`
 *   only, against a list (errors.ts); no message, path or text of a reply is ever passed on.
 *   Import and export throw the code, because the file side reads it to pick its sentence.
 * - The marks routes (`/api/notes/marks...`) follow the same rules: a 4xx on put, add, create or
 *   update resolves the same refused value (the marks store reads it as a bad reply); a remove that
 *   answers 404 is done; a refused list throws its code.
 */
import { NotesIoError, codeFromBody, type IoCode } from "./errors";
import type { NotesTransport } from "./transport";
import type { PathFields, RecordNode } from "../marks/types";
import type { NoteDraft, NoteFields, NotesFile } from "../notes/types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const PREFIX = "/api/notes";
const CLIENT = { "X-FFR-Client": "notes" } as const;
const JSON_BODY = { ...CLIENT, "Content-Type": "application/json" } as const;

interface Answer {
  status: number;
  /** Parsed JSON of the reply, or undefined when it had none (a 204) or could not be read. */
  data: unknown;
}

/** What a 4xx create, update or addCategory resolves: a value that no check can take as a note or a name. */
const REFUSED = Object.freeze({ refused: true });

export function createApiBacking(fetchImpl?: FetchLike): NotesTransport {
  const send: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));

  async function call(method: string, path: string, body?: unknown): Promise<Answer> {
    const init: RequestInit = { method };
    if (method !== "GET") init.headers = body === undefined ? { ...CLIENT } : { ...JSON_BODY };
    if (body !== undefined) init.body = JSON.stringify(body);
    let res: Response;
    try {
      res = await send(path, init);
    } catch {
      throw new NotesIoError("no_answer");
    }
    if (res.status >= 500) throw new NotesIoError("no_answer");
    if (res.status === 204) return { status: 204, data: undefined };
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      if (res.ok) throw new NotesIoError("no_answer");
      data = undefined;
    }
    return { status: res.status, data };
  }

  const ok = (a: Answer): boolean => a.status >= 200 && a.status < 300;
  const refusal = (a: Answer): NotesIoError => new NotesIoError((codeFromBody(a.data) ?? "bad_request") satisfies IoCode);
  const q = (scenario: string): string => `scenario=${encodeURIComponent(scenario)}`;

  return {
    kind: "api",
    backing: {
      async list(scenario) {
        const a = await call("GET", `${PREFIX}?${q(scenario)}`);
        if (!ok(a)) throw refusal(a);
        return a.data;
      },
      async create(draft: NoteDraft) {
        const a = await call("POST", PREFIX, draft);
        return ok(a) ? a.data : REFUSED;
      },
      async update(id: string, fields: NoteFields) {
        const a = await call("PUT", `${PREFIX}/${encodeURIComponent(id)}`, fields);
        return ok(a) ? a.data : REFUSED;
      },
      async remove(id: string) {
        const a = await call("DELETE", `${PREFIX}/${encodeURIComponent(id)}`);
        // A note that is already gone is what the person asked for.
        if (!ok(a) && a.status !== 404) throw refusal(a);
      },
      async addCategory(name: string) {
        const a = await call("POST", `${PREFIX}/categories`, { name });
        return ok(a) ? a.data : REFUSED;
      },
    },
    marks: {
      async list(scenario) {
        const a = await call("GET", `${PREFIX}/marks?${q(scenario)}`);
        if (!ok(a)) throw refusal(a);
        return a.data;
      },
      async putNode(node: RecordNode, ifUnsettled: boolean) {
        // Built key by key, so the body is the wire's text whatever order or extras the node came with.
        const body = {
          scenario: node.scenario,
          record: { kind: node.record.kind, id: node.record.id },
          pinned: node.pinned,
          disposition: node.disposition,
          category: node.category,
          settled: node.settled,
          ifUnsettled,
        };
        const a = await call("PUT", `${PREFIX}/marks/node`, body);
        return ok(a) ? a.data : REFUSED;
      },
      async addFailCategory(name: string) {
        // The body is the name alone: the route names no story, and a body that holds a scenario is refused.
        const a = await call("POST", `${PREFIX}/marks/fail-categories`, { name });
        return ok(a) ? a.data : REFUSED;
      },
      async createPath(draft) {
        const a = await call("POST", `${PREFIX}/marks/paths`, { scenario: draft.scenario, name: draft.name, stops: draft.stops });
        return ok(a) ? a.data : REFUSED;
      },
      async updatePath(id: string, fields: PathFields) {
        const a = await call("PUT", `${PREFIX}/marks/paths/${encodeURIComponent(id)}`, { name: fields.name, stops: fields.stops });
        return ok(a) ? a.data : REFUSED;
      },
      async removePath(id: string) {
        const a = await call("DELETE", `${PREFIX}/marks/paths/${encodeURIComponent(id)}`);
        // A path that is already gone is what the person asked for.
        if (!ok(a) && a.status !== 404) throw refusal(a);
      },
    },
    async exportFile(scenario: string) {
      const a = await call("GET", `${PREFIX}/export?${q(scenario)}`);
      if (!ok(a)) throw refusal(a);
      return a.data;
    },
    async importFile(file: NotesFile) {
      const a = await call("POST", `${PREFIX}/import`, file);
      if (!ok(a)) throw refusal(a);
    },
  };
}
