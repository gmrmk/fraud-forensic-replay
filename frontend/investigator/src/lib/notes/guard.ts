/**
 * The card number guard. One rule, pinned by backend/tests/note_vectors.json (which the backend
 * guard reads too) and by one digit table (backend/tests/note_digit_table.json).
 *
 * THE RULE
 *  1. Flatten: text joined across marks; paragraphs and hard breaks joined by one line feed.
 *     Then NFKC, then drop the format characters of the table, then scan.
 *  2. A digit is any code point the table lists as a decimal digit (never the engine's idea).
 *  3. A run is the longest digit sequence with at most 3 separator characters in a row between
 *     digits. EVERY CHARACTER WITH THE UNICODE PROPERTY White_Space IS A SEPARATOR. After NFKC the
 *     separators are the 19 code points of SEPARATORS: space, tab, line feed, vertical tab, form
 *     feed, carriage return, next line (U+0085), no-break space, Ogham space mark (U+1680), line
 *     separator (U+2028), paragraph separator (U+2029) and the hyphen-minus, U+2010 to U+2015 and
 *     U+2212, which are separators though they are not white space. The other 14 members of the
 *     property (U+2000 to U+200A, U+202F, U+205F, U+3000) NFKC turns into a plain space. The
 *     backend's guard holds the same set, and the shared vectors pin it (separator_vectors). Any
 *     other character ends a run. A GROUP is a maximal sequence of digits inside a run, with no
 *     separator in it.
 *  4. THE ORIGINAL RULE, unchanged: a run is refused when the whole run holds 13 to 19 digits in
 *     total and passes the Luhn check, whatever the digits are.
 *  5. THE NARROWED RULE: a run is also refused when a SPAN of
 *     whole consecutive groups of it, 13 to 19 digits in total, meets all three of these: (a) its
 *     digits pass the Luhn check; (b) it is a brand's number: its leading digits fall in an issuer
 *     prefix of one row of BRAND_TABLE and its length is one that same row uses; (c) it has an
 *     ACCEPTED LAYOUT, which is a card's layout or one slip from one (the layout test, rule 6).
 *     The brand and layout tests use only the span's own digits and group sizes. A group of more
 *     than 19 digits is never part of a span and is judged by nothing.
 *     This refuses an ordinary card line: a number of a brand in the table, written the way
 *     cards are written, with its expiry, its security code, a time or a count beside it.
 *  6. THE LAYOUT TEST (it cures the spacing slip). Let sizes
 *     be the span's group sizes in order and L their sum (13 to 19). A CARD'S LAYOUT is: one
 *     single group; or every group 4 digits but the last, which holds 1 to 4 (4-4-4-1 to 4-4-4-4
 *     and 4-4-4-4-1 to 4-4-4-4-3); or exactly 4-6-5; or exactly 4-6-4. The span has an accepted
 *     layout when sizes is a card's layout of the same L, or is one made from such a layout by
 *     ONE slip: a stray extra space (one group split in two, every part 1 digit or more:
 *     4-4-4-3-1); a missing space (two neighbouring groups joined: 8-4-4); or one boundary moved
 *     by one digit (both groups stay at 1 digit or more: 3-5-4-4, or 4-5-6 from 4-6-5). A
 *     contiguous number with one space in it is the stray space of the single group, so any two
 *     groups that add up to L pass. The accepted layouts are built per L at load
 *     (ACCEPTED_LAYOUTS; 31, 50, 53, 38, 41, 44 and 46 layouts for L = 13 to 19) and the shared
 *     vectors pin the exact lists. Two slips in one number are two slips from every card layout
 *     and are not accepted.
 *
 * WHY IT WAS NARROWED. The strict rule refused a run when ANY span of
 * whole groups of 13 to 19 digits passed Luhn, and when a group over 19 digits held such a number
 * at its first or its last digit. Over 234,000 generated lines of 26 kinds of the things a person
 * types in a note it newly refused 31,544 honest notes of bare numbers set side by side (a phone
 * number then a date, a date range and a count, two Unix times, a string of 20 or more digits).
 * Narrowing it accepts that some card lines with an expiry beside them can
 * pass again. The narrowed rule newly refused 256 of those lines (0.11 percent).
 *
 * WHY THE LAYOUT TEST WIDENED. A card number with ONE slip in its spacing
 * and an expiry, a code or a count beside it passed about 3 times in 4 for all eight brands. The
 * number alone was still refused by the original rule. The layout test of rule 6 is the
 * cure. After it none of 26,418 single slip lines passes. The cost over the same 234,000
 * honest lines: 333 more lines refused than the narrowed rule (0.14 percent), 320 of them a UK
 * style phone number beside a date (3.56 percent of that kind, a five group span of 2-2-4-4-4 or
 * 4-4-4-2-2 that passes Luhn about 1 time in 10), 589 more than the original rule (0.25 percent).
 *
 * WHAT IT DOES NOT REFUSE (stated limits, each pinned by a vector and a test so that nobody
 * later believes otherwise). The first three are accepted limits:
 *  - two slips in one number (two moved boundaries such as 3-5-3-5, or a stray space plus a
 *    moved boundary), or any layout further from a card's layout (pairs of 2), with other digits
 *    beside it: the layout test stops one slip
 *    (about 72 percent of two slip lines still pass, 98 percent of those two slips from every
 *    card layout); the number alone is still refused by the original rule, in every layout;
 *  - a number of a brand outside the table, or whose length is not one its prefix's row uses,
 *    with other digits beside it (a prefix the table does not hold, such as Maestro UK, a Diners
 *    Club number with a 30 prefix outside 300 to 305, a 15 digit number that starts with 4);
 *  - digits written straight on to a number with no separator in one group of more than 19
 *    digits (a card number then 4 or more digits glued to it);
 *  and the limits that stood before:
 *  - groups split by a full stop, a slash, an underscore, a comma or a colon;
 *  - groups split by four or more separator characters in a row, of any kind and in any mix
 *    (spaces, tabs, hyphens, any white space character, or three blank paragraphs, which are four
 *    line feeds);
 *  - a first group in parentheses;
 *  - a number with its digits reversed, or written in words, or split by a letter;
 *  - digits run on to a number with no separator, when the group stays 19 digits or fewer and
 *    fails the check as a whole (a card number with a 1 to 3 digit code written straight after
 *    it);
 *  - a number split across two notes (each note is judged alone);
 *  - a 13 digit number held in the note's `time` field (about 1 in 10 real times pass Luhn, so
 *    the field cannot be guarded);
 *  - a number whose digits the page's Unicode data NFKC-folds differently from the backend's.
 *  It still refuses some non-cards: a lone 13 digit Unix time and a date range such as
 *  2026-11-01 2026-11-05 can pass Luhn (the original rule), and so can a 16 digit time with a
 *  count beside it that has a brand prefix. Since the cure of the spacing slip a UK style phone
 *  number beside a date can be refused too (a five group span one stray space from 4-4-4-4 that
 *  passes Luhn and starts with the Visa prefix 44), as can a pair of phone numbers or a list of
 *  small counts that happen to make such a span. The editor catches a number typed by mistake. It
 *  does not stop a person set on hiding one.
 *
 * TYPING. The rule for a run still open is a pure function of the text and the caret. A run is
 * CLOSED when it does not end at the caret and OPEN when it does (the digits before the caret
 * end the run, and nothing of the run lies after the caret). Within an open run, a SPAN (the
 * whole run is one) is open only when it ends at the run's last digit (the digit being typed can
 * still change it); a span that ends earlier cannot change by typing at the caret and counts as
 * closed. The brand and layout tests add no open state: they read only the span itself, so a
 * slipped number typed digit by digit is open until a separator or a character after the caret
 * closes its run, exactly as an unslipped one is (guard-layout.test.ts types one). A run
 * counts as refused when any closed span of it is refused. Save, blur, and every paste or drop
 * (any insert of 2 or more characters) judge every span of every run as closed, so
 * `refusedClosedCount(text, null)` is the Save rule. A transaction is accepted by `acceptEdit`
 * when:
 *  - the text did not change (a caret move or a selection change): always accepted, so the caret
 *    is never trapped;
 *  - it only removed text: always accepted, so a refused number can always be deleted; a number
 *    that such a deletion leaves or joins is stopped at Save;
 *  - otherwise the number of refused closed runs after it is not larger than before it.
 * So the 16th digit of a valid number is accepted (the run is open), the next space is refused
 * (the run is now closed and refused), and a pasted number is refused.
 *
 * WHAT HAPPENS WHEN THE CARET MOVES AWAY, OR THE EDITOR IS LEFT. The move itself is never
 * refused. The run it leaves is then closed, so `refusedClosedCount` is 1 for it, Save is
 * refused with the card number message, and the next edit elsewhere is accepted only if it does
 * not add a refused closed run. Leaving the editor (blur) closes every run the same way: the
 * window stays open, the status line says the note has a number, and Save is blocked. A draft is
 * not stored, so it never reaches a file or the backend.
 *
 * Where the caret sits inside normalisation: the caret is a UTF-16 offset in the flattened text.
 * The text before it is scanned on its own, and its last run is open when it ends the text
 * before the caret and the whole text's run with the same ordinal holds the same digits.
 */
import { flattenBody } from "./body";
import { digitValue, isFormatCp } from "./digits";
import type { Body, NoteLink } from "./types";

const MAX_SEPARATORS = 3;
const MIN_DIGITS = 13;
const MAX_DIGITS = 19;

/**
 * THE BRAND TABLE (rule 5): per brand the issuer prefix ranges as [digits in the prefix, lowest,
 * highest] and the lengths the same row uses. Checked 2026-11-19 against the issuer identification
 * number table of https://en.wikipedia.org/wiki/Payment_card_number. The backend's guard holds the
 * same rows, and the shared vectors pin the first and last prefix of every range and the prefix
 * just outside it. Diners Club is held at 300 to 305 (the article says 30); Maestro lengths start
 * at 13 (the article says 12, which a span of 13 or more digits can never have); Maestro UK is not
 * held.
 */
export const BRAND_TABLE: readonly (readonly [string, readonly (readonly [number, number, number])[], readonly number[]])[] = [
  ["Visa", [[1, 4, 4]], [13, 16, 19]],
  ["Mastercard", [[2, 51, 55], [4, 2221, 2720]], [16]],
  ["American Express", [[2, 34, 34], [2, 37, 37]], [15]],
  ["Discover", [[4, 6011, 6011], [3, 644, 649], [2, 65, 65]], [16, 17, 18, 19]],
  ["JCB", [[4, 3528, 3589]], [16, 17, 18, 19]],
  ["Diners Club", [[3, 300, 305], [2, 36, 36], [2, 38, 38], [2, 39, 39]], [14, 15, 16, 17, 18, 19]],
  ["UnionPay", [[2, 62, 62]], [16, 17, 18, 19]],
  [
    "Maestro",
    [[4, 5018, 5018], [4, 5020, 5020], [4, 5038, 5038], [4, 5893, 5893], [4, 6304, 6304], [4, 6759, 6759], [4, 6761, 6761], [4, 6762, 6762], [4, 6763, 6763]],
    [13, 14, 15, 16, 17, 18, 19],
  ],
];

export interface Run {
  /** The digits of the run, as 0 to 9 characters whatever script they were written in. */
  digits: string;
  /** The same digits as the run's groups (maximal digit sequences with no separator inside). */
  groups: string[];
  /** True when the run's last digit is the last character of the scanned text. */
  atEnd: boolean;
}

/** The flattened text and the caret's UTF-16 offset in it. `null` means no caret: every run is closed. */
export interface EditState {
  text: string;
  caret: number | null;
}

/**
 * THE SEPARATORS (rule 3), as code points after NFKC: every White_Space character that NFKC leaves
 * alone or that is not a plain space (the other members, U+2000 to U+200A, U+202F, U+205F and
 * U+3000, become U+0020), and the hyphen-minus, U+2010 to U+2015 and U+2212. Written out, never
 * read from the engine: a regular expression's \s holds U+FEFF and misses U+0085. The backend's
 * guard holds the same set and the shared vectors pin it (separator_vectors).
 */
export const SEPARATORS: ReadonlySet<number> = new Set([
  0x09, // tab
  0x0a, // line feed
  0x0b, // vertical tab
  0x0c, // form feed
  0x0d, // carriage return
  0x20, // space
  0x85, // next line
  0xa0, // no-break space
  0x1680, // Ogham space mark
  0x2028, // line separator
  0x2029, // paragraph separator
  0x2d, // hyphen-minus
  0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, // hyphen to horizontal bar
  0x2212, // minus sign
]);

function isSeparator(cp: number): boolean {
  return SEPARATORS.has(cp);
}

/** NFKC, then drop the format characters, as an array of code points. */
function prepare(text: string): number[] {
  const out: number[] = [];
  for (const ch of text.normalize("NFKC")) {
    const cp = ch.codePointAt(0) as number;
    if (!isFormatCp(cp)) out.push(cp);
  }
  return out;
}

export function luhnValid(digits: string): boolean {
  let total = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  }
  return total % 10 === 0;
}

/** Every run of the text, in order (refused or not). */
export function findRuns(text: string): Run[] {
  const cps = prepare(text);
  const runs: Run[] = [];
  let groups: string[] = []; // the closed groups of the run being read
  let cur = ""; // the digits of the group being read
  let seps = 0;
  let lastDigit = -1;
  const close = () => {
    if (cur) groups.push(cur);
    if (groups.length > 0) runs.push({ digits: groups.join(""), groups, atEnd: lastDigit === cps.length - 1 });
    groups = [];
    cur = "";
    seps = 0;
  };
  for (let i = 0; i < cps.length; i++) {
    const d = digitValue(cps[i]);
    if (d >= 0) {
      cur += String(d);
      seps = 0;
      lastDigit = i;
    } else if ((cur || groups.length > 0) && isSeparator(cps[i])) {
      if (cur) {
        groups.push(cur);
        cur = "";
      }
      seps += 1;
      if (seps > MAX_SEPARATORS) close();
    } else {
      close();
    }
  }
  close();
  return runs;
}

/**
 * True when the leading digits fall in an issuer prefix of one row of the table and the length is
 * one that same row uses (the Luhn check is not made here).
 */
export function isBrandNumberShape(digits: string): boolean {
  for (const [, prefixes, lengths] of BRAND_TABLE) {
    if (!lengths.includes(digits.length)) continue;
    for (const [k, low, high] of prefixes) {
      const lead = Number(digits.slice(0, k));
      if (lead >= low && lead <= high) return true;
    }
  }
  return false;
}

/** A single group; or every group 4 digits but the last, which holds 1 to 4; or 4-6-5; or 4-6-4. */
export function isCardLayout(sizes: readonly number[]): boolean {
  if (sizes.length === 1) return true;
  const key = sizes.join("-");
  if (key === "4-6-5" || key === "4-6-4") return true;
  const last = sizes[sizes.length - 1];
  return sizes.slice(0, -1).every((s) => s === 4) && last >= 1 && last <= 4;
}

/** The card's layouts of one total (rule 6), built from the rule's own statement. */
function cardLayouts(total: number): number[][] {
  const out: number[][] = [[total]];
  for (let last = 1; last <= 4; last++) {
    const body = total - last;
    if (body >= 4 && body % 4 === 0) out.push([...Array<number>(body / 4).fill(4), last]);
  }
  for (const t of [[4, 6, 5], [4, 6, 4]]) if (t[0] + t[1] + t[2] === total) out.push(t);
  return out.filter(isCardLayout);
}

/**
 * Every layout one slip from a card's layout, of the same total: a group split in two, two
 * neighbours joined, or the boundary of two neighbours moved one digit (every group stays at 1 digit
 * or more).
 */
function oneSlip(card: readonly number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < card.length; i++) {
    for (let a = 1; a < card[i]; a++) out.push([...card.slice(0, i), a, card[i] - a, ...card.slice(i + 1)]);
  }
  for (let i = 0; i < card.length - 1; i++) {
    out.push([...card.slice(0, i), card[i] + card[i + 1], ...card.slice(i + 2)]);
    if (card[i] > 1) out.push([...card.slice(0, i), card[i] - 1, card[i + 1] + 1, ...card.slice(i + 2)]);
    if (card[i + 1] > 1) out.push([...card.slice(0, i), card[i] + 1, card[i + 1] - 1, ...card.slice(i + 2)]);
  }
  return out;
}

/**
 * The accepted layouts of rule 6 by total digits, as "4-4-4-1" keys; 31, 50, 53, 38, 41, 44 and 46
 * layouts for 13 to 19 digits. The shared vectors pin the exact lists.
 */
export const ACCEPTED_LAYOUTS: ReadonlyMap<number, ReadonlySet<string>> = new Map(
  Array.from({ length: MAX_DIGITS - MIN_DIGITS + 1 }, (_, k): [number, ReadonlySet<string>] => {
    const total = MIN_DIGITS + k;
    const keys = new Set<string>();
    for (const card of cardLayouts(total)) {
      keys.add(card.join("-"));
      for (const s of oneSlip(card)) keys.add(s.join("-"));
    }
    return [total, keys];
  }),
);

/** The accepted layouts of one total, sorted; none outside 13 to 19 digits. */
export function acceptedLayouts(total: number): number[][] {
  const keys = ACCEPTED_LAYOUTS.get(total);
  if (!keys) return [];
  return [...keys]
    .map((k) => k.split("-").map(Number))
    .sort((a, b) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
      return a.length - b.length;
    });
}

/** A card's layout, or one slip from one (rule 6), judged by the group sizes alone. */
export function isAcceptedLayout(sizes: readonly number[]): boolean {
  return ACCEPTED_LAYOUTS.get(sizes.reduce((a, b) => a + b, 0))?.has(sizes.join("-")) ?? false;
}

/**
 * Whether a run holds a refused number (rule 4 and rule 5): the whole run when it is 13 to 19
 * digits that pass Luhn, or a span of whole groups that is also a brand's number in an accepted layout.
 * A group of more than 19 digits is never part of a span. With `open` set, a span (the whole run is
 * one) that ends at the run's last digit is not judged: it can still change by typing at the caret.
 */
export function runRefused(groups: readonly string[], open: boolean): boolean {
  const n = groups.length;
  for (let i = 0; i < n; i++) {
    let total = 0;
    for (let j = i; j < n; j++) {
      total += groups[j].length;
      if (total > MAX_DIGITS) break;
      if (open && j === n - 1) continue;
      if (total < MIN_DIGITS) continue;
      const digits = groups.slice(i, j + 1).join("");
      if (!luhnValid(digits)) continue;
      if (i === 0 && j === n - 1) return true; // the original rule: the whole run
      if (isBrandNumberShape(digits) && isAcceptedLayout(groups.slice(i, j + 1).map((g) => g.length))) return true;
    }
  }
  return false;
}

/**
 * The number of refused runs that are closed. With no caret every run is closed (Save, blur,
 * paste, drop). With a caret, a run that ends at the caret is open: only its spans that end
 * before its last digit count (see TYPING above).
 */
export function refusedClosedCount(text: string, caret?: number | null): number {
  const runs = findRuns(text);
  let open = -1;
  if (caret !== undefined && caret !== null) {
    const head = findRuns(text.slice(0, Math.max(0, caret)));
    const last = head.length - 1;
    if (last >= 0 && head[last].atEnd && runs[last] !== undefined && runs[last].digits === head[last].digits) open = last;
  }
  let n = 0;
  for (let i = 0; i < runs.length; i++) if (runRefused(runs[i].groups, i === open)) n += 1;
  return n;
}

/** True when the text holds a refused number (every run judged closed). The Save rule. */
export function refusesText(text: string): boolean {
  return refusedClosedCount(text, null) > 0;
}

export function refusesBody(body: Body): boolean {
  return refusesText(flattenBody(body));
}

/**
 * Whether a transaction is accepted. `inserted` is the number of characters it inserted; 2 or
 * more (a paste or a drop) judges every run as closed.
 */
export function acceptEdit(before: EditState, after: EditState, inserted: number): boolean {
  if (after.text === before.text) return true;
  if (inserted <= 0 && after.text.length < before.text.length) return true;
  const was = refusedClosedCount(before.text, before.caret);
  const now = inserted >= 2 ? refusedClosedCount(after.text, null) : refusedClosedCount(after.text, after.caret);
  return now <= was;
}

/**
 * Every string a note holds: its id, scenario, category, the link's kind and id, and the body.
 * Any field left out is not judged. The id is a channel too: a file can carry an id that holds
 * a valid number written in hex digits.
 */
export function holdsCardNumber(n: {
  id?: string;
  scenario?: string;
  category?: string;
  link?: NoteLink | null;
  body?: Body;
}): boolean {
  const strings = [n.id, n.scenario, n.category, n.link?.kind, n.link?.id];
  if (strings.some((s) => s !== undefined && refusesText(s))) return true;
  return n.body !== undefined && refusesBody(n.body);
}
