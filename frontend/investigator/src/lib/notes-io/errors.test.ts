/**
 * The table from a backend code to the design's E10 sentence key. The 12 codes the backend can
 * send, and anything else, map to a fixed key; a refusal is read for its `detail.code` only,
 * and never for its message, path or text.
 */
import { describe, it, expect } from "vitest";
import { BACKEND_CODES, NotesIoError, codeFromBody, statusKeyFor } from "./errors";
import { STATUS } from "../tooltip-words/notes";

const EXPECTED: Record<string, keyof typeof STATUS> = {
  bad_request: "refused",
  body_schema: "refused",
  too_long: "tooLong",
  card_number: "card",
  bad_json: "refused",
  too_large: "tooLong",
  bad_file: "refused",
  bad_scenario: "refused",
  category_exists: "refused",
  limit_reached: "limit",
  not_found: "refused",
  backing_failed: "noAnswer",
};

describe("statusKeyFor: a backend code to an E10 sentence key", () => {
  it("lists exactly the 12 codes of the backend's table", () => {
    expect([...BACKEND_CODES].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [code, key] of Object.entries(EXPECTED)) {
    it(`${code} reads ${key}`, () => {
      expect(statusKeyFor(code)).toBe(key);
      expect(STATUS[statusKeyFor(code)].length).toBeGreaterThan(0);
    });
  }

  it("an unknown code, a number and nothing read 'refused'", () => {
    expect(statusKeyFor("something_new")).toBe("refused");
    expect(statusKeyFor(422)).toBe("refused");
    expect(statusKeyFor(undefined)).toBe("refused");
    expect(statusKeyFor("__proto__")).toBe("refused");
    expect(statusKeyFor("constructor")).toBe("refused");
  });

  it("the no-answer code is its own key", () => {
    expect(statusKeyFor("no_answer")).toBe("noAnswer");
  });
});

describe("codeFromBody: only detail.code, only from the allow-list", () => {
  it("reads a known code and nothing else of the body", () => {
    const body = { detail: { code: "card_number", where: "body.content[0]", message: "4111111111111111" } };
    expect(codeFromBody(body)).toBe("card_number");
  });
  it("refuses an unknown code, a wrong shape and a framework detail list", () => {
    expect(codeFromBody({ detail: { code: "oops" } })).toBeNull();
    expect(codeFromBody({ detail: [{ type: "string_too_long", input: "4111111111111111" }] })).toBeNull();
    expect(codeFromBody({ detail: "text" })).toBeNull();
    expect(codeFromBody(null)).toBeNull();
    expect(codeFromBody("card_number")).toBeNull();
    expect(codeFromBody({ detail: { code: { toString: () => "card_number" } } })).toBeNull();
  });
});

describe("NotesIoError", () => {
  it("carries a fixed code and a fixed message that names no value", () => {
    const e = new NotesIoError("card_number");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("card_number");
    expect(e.message).toBe("notes io: card_number");
  });
});
