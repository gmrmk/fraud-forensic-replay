/**
 * What the backend's refusals mean to the page. A refusal is read for its `detail.code` and
 * nothing else: the message, the path and any other text of a reply are never read, kept or
 * shown, so a value a refusal might quote can never come back to the screen.
 *
 * The 12 codes are the backend's own table (`notes_routes.MESSAGES`). `statusKeyFor` maps a
 * code to a key of E10's sentences (`STATUS` in tooltip-words/notes.ts); a code the table does
 * not know reads "refused".
 */
import type { STATUS } from "../tooltip-words/notes";

export const BACKEND_CODES = [
  "bad_request",
  "body_schema",
  "too_long",
  "card_number",
  "bad_json",
  "too_large",
  "bad_file",
  "bad_scenario",
  "category_exists",
  "limit_reached",
  "not_found",
  "backing_failed",
] as const;
export type BackendCode = (typeof BACKEND_CODES)[number];

/** A code the page raises itself: no reply came (a network failure, a 5xx, a reply that is not JSON). */
export type IoCode = BackendCode | "no_answer";

type StatusKey = keyof typeof STATUS;

const KEYS = new Map<string, StatusKey>([
  ["card_number", "card"],
  ["too_long", "tooLong"],
  ["too_large", "tooLong"],
  ["limit_reached", "limit"],
  ["backing_failed", "noAnswer"],
  ["no_answer", "noAnswer"],
]);

/** The E10 sentence key for a code. Anything unknown, and anything that is not a string, is "refused". */
export function statusKeyFor(code: unknown): StatusKey {
  return typeof code === "string" ? (KEYS.get(code) ?? "refused") : "refused";
}

const KNOWN = new Set<string>(BACKEND_CODES);

/** The code of a refusal body (`{ detail: { code } }`), or null. Only a listed code passes. */
export function codeFromBody(body: unknown): BackendCode | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return null;
  const code = (detail as { code?: unknown }).code;
  return typeof code === "string" && KNOWN.has(code) ? (code as BackendCode) : null;
}

/** What a backing throws. The message is fixed text built from the code, never from a reply. */
export class NotesIoError extends Error {
  readonly code: IoCode;
  constructor(code: IoCode) {
    super(`notes io: ${code}`);
    this.name = "NotesIoError";
    this.code = code;
  }
}
