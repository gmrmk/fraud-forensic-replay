/**
 * The api backing against a fake `fetch`: the routes, the headers the routes ask for, the codes,
 * and the promise that nothing a reply says is echoed. A reply is data: the store checks it
 * again (`checkNote`), and the last tests drive the real store to prove it.
 */
import { describe, it, expect } from "vitest";
import { createApiBacking, type FetchLike } from "./apiBacking";
import { NotesIoError } from "./errors";
import { createNotesStore } from "../../store/notes";
import { LIST_WIRE, NODE_PUT_WIRE, NODE_WIRE, PATH_WIRE, bodyOf, clone, makeNote, VISA } from "../notes/test-fixtures";
import { buildNotesFile } from "../notes/file";
import type { NoteDraft } from "../notes/types";
import { checkNode, checkPath } from "../marks/schema";
import type { RecordNode } from "../marks/types";

interface Call {
  url: string;
  init: RequestInit;
  headers: Headers;
}
interface Reply {
  status?: number;
  body?: unknown;
  reject?: boolean;
  raw?: string;
}

function fakeFetch(...replies: Reply[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetch: FetchLike = async (url, init = {}) => {
    calls.push({ url, init, headers: new Headers(init.headers as HeadersInit | undefined) });
    const r = queue.shift() ?? { status: 200, body: {} };
    if (r.reject) throw new TypeError("network down: 4111111111111111");
    const status = r.status ?? 200;
    const text = r.raw ?? (r.body === undefined ? "" : JSON.stringify(r.body));
    return new Response(status === 204 ? null : text, { status, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

const SCENARIO = "card-fraud";
const DRAFT: NoteDraft = (() => {
  const { id: _id, seq: _seq, ...rest } = makeNote();
  return rest;
})();
const FIELDS = (() => {
  const { id: _id, seq: _seq, scenario: _s, time: _t, ...rest } = makeNote();
  return rest;
})();
const NOTE = makeNote();

describe("api backing: routes and headers", () => {
  it("list: GET with the scenario in the query, no body", async () => {
    const { fetch, calls } = fakeFetch({ body: { notes: [], categories: [], skipped: 0 } });
    const api = createApiBacking(fetch);
    const r = await api.backing.list(SCENARIO);
    expect(r).toEqual({ notes: [], categories: [], skipped: 0 });
    expect(calls[0].url).toBe(`/api/notes?scenario=${SCENARIO}`);
    expect(calls[0].init.method ?? "GET").toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("create: POST /api/notes with the client header, JSON content type and the draft as the body", async () => {
    const { fetch, calls } = fakeFetch({ status: 201, body: NOTE });
    const api = createApiBacking(fetch);
    await api.backing.create(clone(DRAFT));
    expect(calls[0].url).toBe("/api/notes");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].headers.get("X-FFR-Client")).toBe("notes");
    expect(calls[0].headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(calls[0].init.body as string)).toEqual(DRAFT);
  });

  it("update: PUT /api/notes/{id} with both headers and the fields", async () => {
    const { fetch, calls } = fakeFetch({ body: NOTE });
    await createApiBacking(fetch).backing.update(NOTE.id, clone(FIELDS));
    expect(calls[0].url).toBe(`/api/notes/${NOTE.id}`);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].headers.get("X-FFR-Client")).toBe("notes");
    expect(calls[0].headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(calls[0].init.body as string)).toEqual(FIELDS);
  });

  it("remove: DELETE sends the client header and no content type and no body", async () => {
    const { fetch, calls } = fakeFetch({ status: 204 });
    await createApiBacking(fetch).backing.remove(NOTE.id);
    expect(calls[0].url).toBe(`/api/notes/${NOTE.id}`);
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].headers.get("X-FFR-Client")).toBe("notes");
    expect(calls[0].headers.has("Content-Type")).toBe(false);
    expect(calls[0].init.body).toBeUndefined();
  });

  it("addCategory: POST /api/notes/categories with the name only", async () => {
    const { fetch, calls } = fakeFetch({ status: 201, body: { name: "Lead" } });
    const r = await createApiBacking(fetch).backing.addCategory("Lead");
    expect(r).toEqual({ name: "Lead" });
    expect(calls[0].url).toBe("/api/notes/categories");
    expect(calls[0].headers.get("X-FFR-Client")).toBe("notes");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ name: "Lead" });
  });

  it("export: GET with the scenario; import: POST with both headers and the file", async () => {
    const file = buildNotesFile(SCENARIO, [], [NOTE]);
    const { fetch, calls } = fakeFetch({ body: file }, { body: { added: 1, replaced: 0 } });
    const api = createApiBacking(fetch);
    expect(await api.exportFile(SCENARIO)).toEqual(file);
    expect(calls[0].url).toBe(`/api/notes/export?scenario=${SCENARIO}`);
    await api.importFile(file);
    expect(calls[1].url).toBe("/api/notes/import");
    expect(calls[1].init.method).toBe("POST");
    expect(calls[1].headers.get("X-FFR-Client")).toBe("notes");
    expect(calls[1].headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(calls[1].init.body as string)).toEqual(file);
  });

  it("an id or scenario is encoded into the path, never joined raw", async () => {
    const { fetch, calls } = fakeFetch({ status: 204 }, { body: { notes: [] } });
    const api = createApiBacking(fetch);
    await api.backing.remove("a/b?c=d");
    await api.backing.list("x&y=1");
    expect(calls[0].url).toBe("/api/notes/a%2Fb%3Fc%3Dd");
    expect(calls[1].url).toBe("/api/notes?scenario=x%26y%3D1");
  });
});

describe("api backing: failures", () => {
  it("a network failure throws a no-answer error that names no value", async () => {
    const { fetch } = fakeFetch({ reject: true });
    const err = await createApiBacking(fetch).backing.list(SCENARIO).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotesIoError);
    expect((err as NotesIoError).code).toBe("no_answer");
    expect(String((err as Error).message)).not.toContain("4111");
  });

  it("a 5xx throws, and reading the list on a 4xx throws", async () => {
    const { fetch } = fakeFetch({ status: 500, raw: "Traceback 4111111111111111" }, { status: 400, body: { detail: { code: "bad_scenario", where: "scenario", message: "m" } } });
    const api = createApiBacking(fetch);
    await expect(api.backing.create(clone(DRAFT))).rejects.toBeInstanceOf(NotesIoError);
    await expect(api.backing.list(SCENARIO)).rejects.toBeInstanceOf(NotesIoError);
  });

  it("a reply that is not JSON throws a no-answer error", async () => {
    const { fetch } = fakeFetch({ status: 200, raw: "<html>4111111111111111" });
    const err = await createApiBacking(fetch).backing.list(SCENARIO).catch((e: unknown) => e);
    expect((err as NotesIoError).code).toBe("no_answer");
    expect(String((err as Error).message)).not.toContain("4111");
  });

  it("DELETE of a note that is gone (404) resolves; any other refusal throws", async () => {
    const { fetch } = fakeFetch(
      { status: 404, body: { detail: { code: "not_found", where: "", message: "m" } } },
      { status: 403, body: { detail: { code: "bad_request", where: "", message: "m" } } },
    );
    const api = createApiBacking(fetch);
    await expect(api.backing.remove(NOTE.id)).resolves.toBeUndefined();
    await expect(api.backing.remove(NOTE.id)).rejects.toBeInstanceOf(NotesIoError);
  });

  it("an import refusal throws the backend's code, from the allow-list only", async () => {
    const file = buildNotesFile(SCENARIO, [], [NOTE]);
    const { fetch } = fakeFetch(
      { status: 422, body: { detail: { code: "card_number", where: "notes[0].body", message: "4111111111111111" } } },
      { status: 422, body: { detail: { code: "made_up_code", where: "x", message: "y" } } },
    );
    const api = createApiBacking(fetch);
    const a = await api.importFile(file).catch((e: unknown) => e);
    expect((a as NotesIoError).code).toBe("card_number");
    const b = await api.importFile(file).catch((e: unknown) => e);
    expect((b as NotesIoError).code).toBe("bad_request");
    expect(JSON.stringify([a, b, (a as Error).message, (b as Error).message])).not.toContain("4111");
  });
});

describe("api backing through the real store: the page checks every reply again", () => {
  it("a 4xx on create resolves a value the store refuses: it says 'refused' and echoes nothing", async () => {
    const reply = { status: 422, body: { detail: { code: "card_number", where: "body.content[0].text", message: `The note has ${VISA}` } } };
    const { fetch } = fakeFetch({ body: { notes: [], categories: [], skipped: 0 } }, reply);
    const api = createApiBacking(fetch);
    const store = createNotesStore(api.backing);
    await store.getState().load(SCENARIO);
    const r = await store.getState().create(clone(DRAFT));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("bad_reply");
    expect(store.getState().notes).toEqual([]);
    expect(JSON.stringify(store.getState().error)).not.toContain("4111");
  });

  it("a list reply with a bad colour, an extra key and a guarded body keeps only the clean note", async () => {
    const good = makeNote({ id: "note-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seq: 1 });
    const badColour = { ...clone(makeNote({ id: "note-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", seq: 2 })), colour: "url(https://example.invalid/x)" };
    const extra = { ...clone(makeNote({ id: "note-cccccccccccccccccccccccccccccccc", seq: 3 })), href: "javascript:alert(1)" };
    const guarded = makeNote({ id: "note-dddddddddddddddddddddddddddddddd", seq: 4, body: bodyOf(`Pay with ${VISA}`) });
    const badId = makeNote({ id: `note-${VISA}${"a".repeat(16)}`, seq: 5 });
    const { fetch } = fakeFetch({ body: { notes: [good, badColour, extra, guarded, badId], categories: ["Lead", "Lead", "x".repeat(40)], skipped: 0 } });
    const store = createNotesStore(createApiBacking(fetch).backing);
    const r = await store.getState().load(SCENARIO);
    expect(r.ok).toBe(true);
    expect(store.getState().notes.map((n) => n.id)).toEqual([good.id]);
    expect(store.getState().skipped).toBe(4);
    expect(store.getState().customCategories).toEqual(["Lead"]);
  });

  it("an update reply for another note, or a create reply with a bad shape, is refused", async () => {
    const { fetch } = fakeFetch(
      { body: { notes: [NOTE], categories: [], skipped: 0 } },
      { body: { ...clone(NOTE), id: "note-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" } },
      { status: 201, body: { id: NOTE.id } },
    );
    const store = createNotesStore(createApiBacking(fetch).backing);
    await store.getState().load(SCENARIO);
    const u = await store.getState().update(NOTE.id, clone(FIELDS));
    expect(u.ok).toBe(false);
    const c = await store.getState().create(clone(DRAFT));
    expect(c.ok).toBe(false);
    expect(store.getState().notes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------- the marks (F8)

describe("api backing: the marks routes", () => {
  const refusal = (code: string, status = 422) => ({ status, body: { detail: { code, where: "x", message: `m ${VISA}` } } });
  const PATH_ID = "path-0123456789abcdef0123456789abcdef";
  const STOPS = [
    { kind: "auth", id: "tx-0001" },
    { kind: "login", id: "lg-0002" },
  ];

  it("list: GET /api/notes/marks with the scenario in the query and no client header", async () => {
    const { fetch, calls } = fakeFetch({ raw: LIST_WIRE });
    const r = await createApiBacking(fetch).marks.list(SCENARIO);
    expect(JSON.stringify(r)).toBe(LIST_WIRE);
    expect(calls[0].url).toBe(`/api/notes/marks?scenario=${SCENARIO}`);
    expect(calls[0].init.method ?? "GET").toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
    expect(calls[0].headers.has("X-FFR-Client")).toBe(false);
  });

  it("putNode: PUT /api/notes/marks/node with both headers and the exact body text, ifUnsettled last", async () => {
    const { fetch, calls } = fakeFetch({ raw: NODE_WIRE });
    const stored = await createApiBacking(fetch).marks.putNode(JSON.parse(NODE_WIRE), false);
    expect(JSON.stringify(stored)).toBe(NODE_WIRE);
    expect(calls[0].url).toBe("/api/notes/marks/node");
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].headers.get("X-FFR-Client")).toBe("notes");
    expect(calls[0].headers.get("Content-Type")).toBe("application/json");
    expect(calls[0].init.body).toBe(NODE_PUT_WIRE);
  });

  it("putNode sends the key the backend reads, ifUnsettled, true when asked, and no other flag", async () => {
    const { fetch, calls } = fakeFetch({ raw: NODE_WIRE });
    await createApiBacking(fetch).marks.putNode(JSON.parse(NODE_WIRE), true);
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.ifUnsettled).toBe(true);
    expect("ifAbsent" in body).toBe(false);
    expect(Object.keys(body)).toEqual(["scenario", "record", "pinned", "disposition", "category", "settled", "ifUnsettled"]);
  });

  it("putNode sends a node in the wire's key order whatever order it was built in", async () => {
    const { fetch, calls } = fakeFetch({ raw: NODE_WIRE });
    const shuffled = { settled: true, category: "Shared key", disposition: "fail", pinned: true, record: { id: "tx-0001", kind: "auth" }, scenario: SCENARIO } as RecordNode;
    await createApiBacking(fetch).marks.putNode(shuffled, false);
    expect(calls[0].init.body).toBe(NODE_PUT_WIRE);
  });

  // A typed Fail category is shared by every story: the route names no scenario, and the backend refuses a
  // body that holds one (422 bad_request), so the body is the name alone.
  it("addFailCategory: POST /api/notes/marks/fail-categories with the name alone", async () => {
    const { fetch, calls } = fakeFetch({ status: 201, body: { name: "Shared key" } });
    const r = await createApiBacking(fetch).marks.addFailCategory("Shared key");
    expect(r).toEqual({ name: "Shared key" });
    expect(calls[0].url).toBe("/api/notes/marks/fail-categories");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].headers.get("X-FFR-Client")).toBe("notes");
    expect(calls[0].headers.get("Content-Type")).toBe("application/json");
    expect(calls[0].init.body).toBe('{"name":"Shared key"}');
    expect("scenario" in JSON.parse(calls[0].init.body as string)).toBe(false);
  });

  it("createPath: POST /api/notes/marks/paths with scenario, name and stops", async () => {
    const { fetch, calls } = fakeFetch({ status: 201, raw: PATH_WIRE });
    const r = await createApiBacking(fetch).marks.createPath({ scenario: SCENARIO, name: "Path 1", stops: STOPS });
    expect(JSON.stringify(r)).toBe(PATH_WIRE);
    expect(calls[0].url).toBe("/api/notes/marks/paths");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].headers.get("Content-Type")).toBe("application/json");
    expect(calls[0].init.body).toBe(JSON.stringify({ scenario: SCENARIO, name: "Path 1", stops: STOPS }));
  });

  it("updatePath: PUT /api/notes/marks/paths/<encoded id> with name and stops only", async () => {
    const { fetch, calls } = fakeFetch({ raw: PATH_WIRE }, { raw: PATH_WIRE });
    const api = createApiBacking(fetch);
    await api.marks.updatePath(PATH_ID, { name: "Renamed", stops: STOPS });
    expect(calls[0].url).toBe(`/api/notes/marks/paths/${PATH_ID}`);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].init.body).toBe(JSON.stringify({ name: "Renamed", stops: STOPS }));
    await api.marks.updatePath("a/b?c", { name: "N", stops: STOPS });
    expect(calls[1].url).toBe("/api/notes/marks/paths/a%2Fb%3Fc");
  });

  it("removePath: DELETE with the client header, no content type and no body", async () => {
    const { fetch, calls } = fakeFetch({ status: 204 });
    await createApiBacking(fetch).marks.removePath(PATH_ID);
    expect(calls[0].url).toBe(`/api/notes/marks/paths/${PATH_ID}`);
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].headers.get("X-FFR-Client")).toBe("notes");
    expect(calls[0].headers.has("Content-Type")).toBe(false);
    expect(calls[0].init.body).toBeUndefined();
  });

  it("a 4xx on put, add, create or update resolves the value no check can take, and echoes nothing", async () => {
    const { fetch } = fakeFetch(refusal("card_number"), refusal("category_exists", 409), refusal("limit_reached", 409), refusal("bad_request"));
    const api = createApiBacking(fetch);
    const answers = [
      await api.marks.putNode(JSON.parse(NODE_WIRE), false),
      await api.marks.addFailCategory("x"),
      await api.marks.createPath({ scenario: SCENARIO, name: "P", stops: STOPS }),
      await api.marks.updatePath(PATH_ID, { name: "P", stops: STOPS }),
    ];
    for (const a of answers) expect(a).toEqual({ refused: true });
    expect(checkNode(answers[0]).ok).toBe(false);
    expect(checkPath(answers[2]).ok).toBe(false);
    expect(JSON.stringify(answers)).not.toContain("4111");
  });

  it("a 404 on remove resolves (the path is gone); another refusal throws its code", async () => {
    const { fetch } = fakeFetch(refusal("not_found", 404), refusal("bad_request", 403));
    const api = createApiBacking(fetch);
    await expect(api.marks.removePath(PATH_ID)).resolves.toBeUndefined();
    const e = await api.marks.removePath(PATH_ID).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(NotesIoError);
    expect((e as NotesIoError).code).toBe("bad_request");
  });

  it("a 5xx or a network failure throws no_answer, on every operation", async () => {
    const calls: Array<(api: ReturnType<typeof createApiBacking>) => Promise<unknown>> = [
      (a) => a.marks.putNode(JSON.parse(NODE_WIRE), false),
      (a) => a.marks.addFailCategory("x"),
      (a) => a.marks.createPath({ scenario: SCENARIO, name: "P", stops: STOPS }),
      (a) => a.marks.updatePath(PATH_ID, { name: "P", stops: STOPS }),
      (a) => a.marks.removePath(PATH_ID),
      (a) => a.marks.list(SCENARIO),
    ];
    for (const run of calls) {
      const five = await run(createApiBacking(fakeFetch({ status: 500, raw: `Traceback ${VISA}` }).fetch)).catch((e: unknown) => e);
      expect((five as NotesIoError).code).toBe("no_answer");
      const down = await run(createApiBacking(fakeFetch({ reject: true }).fetch)).catch((e: unknown) => e);
      expect((down as NotesIoError).code).toBe("no_answer");
      expect(String((five as Error).message) + String((down as Error).message)).not.toContain("4111");
    }
  });

  it("a refused list throws its detail.code only, from the allow-list", async () => {
    const { fetch } = fakeFetch(refusal("bad_scenario", 400), refusal("made_up_code", 400));
    const api = createApiBacking(fetch);
    const a = await api.marks.list(SCENARIO).catch((e: unknown) => e);
    expect((a as NotesIoError).code).toBe("bad_scenario");
    const b = await api.marks.list(SCENARIO).catch((e: unknown) => e);
    expect((b as NotesIoError).code).toBe("bad_request");
    expect(JSON.stringify([a, b, (a as Error).message])).not.toContain("4111");
  });

  it("a reply is passed on as it came: the backing does not judge it (the marks store does)", async () => {
    const { fetch } = fakeFetch({ raw: NODE_WIRE.replace("tx-0001", "tx-0002") });
    const r = checkNode(await createApiBacking(fetch).marks.putNode(JSON.parse(NODE_WIRE), false));
    expect(r.ok && r.value.record.id).toBe("tx-0002");
  });
});
