/**
 * Categories: five starter names and the person's own. A name is NFC, trimmed, 1 to 24
 * characters (code points), with no control or format character, and it takes the card number
 * guard. Names are unique ignoring case. No rename or remove in v1.
 */
import { charCount } from "./body";
import { isControlCp, isFormatCp } from "./digits";
import { refusesText } from "./guard";
import { LIMITS, fail, ok, type Check, type Note } from "./types";

export const STARTER_CATEGORIES: readonly string[] = ["Note", "Question", "Follow up", "Source", "Context"];

/** What a person typed, made ready for the check: NFC, then trimmed. */
export function normalizeCategoryName(raw: string): string {
  return raw.normalize("NFC").trim();
}

/** Strict: the value must already be normalized. Never echoes the value in a refusal. */
export function checkCategoryName(raw: unknown, where = "category"): Check<string> {
  if (typeof raw !== "string") return fail("bad_request", where);
  if (raw === "") return fail("bad_request", where);
  if (charCount(raw) > LIMITS.categoryChars) return fail("too_long", where);
  if (raw !== raw.normalize("NFC") || raw !== raw.trim()) return fail("bad_request", where);
  for (const ch of raw) {
    const cp = ch.codePointAt(0) as number;
    if (isControlCp(cp) || isFormatCp(cp)) return fail("bad_request", where);
  }
  if (refusesText(raw)) return fail("card_number", where);
  return ok(raw);
}

const fold = (s: string): string => s.toLowerCase();

export function sameCategory(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

export function categoryExists(list: readonly string[], name: string): boolean {
  return list.some((c) => sameCategory(c, name));
}

/** Starters, the person's own names, then any name a note uses that the others do not hold. */
export function categoryList(custom: readonly string[], notes: readonly Note[]): string[] {
  const out: string[] = [...STARTER_CATEGORIES];
  for (const c of custom) if (!categoryExists(out, c)) out.push(c);
  for (const n of notes) if (!categoryExists(out, n.category)) out.push(n.category);
  return out;
}
