/**
 * The card number guard's layout test (the spacing slip).
 *
 * A span of whole groups has an accepted layout when it is a card's layout or one slip from it (a
 * group split in two, two neighbours joined, the boundary of two neighbours moved by one digit). The
 * accepted layouts are pinned as exact lists in backend/tests/note_vectors.json (layout_vectors),
 * which the backend suite reads too; this file checks the page's guard against them, and against the
 * same test written a second way (by cut positions) on every split of 13 to 19 digits.
 */
import { describe, it, expect } from "vitest";
import {
  acceptEdit,
  acceptedLayouts,
  isAcceptedLayout,
  isCardLayout,
  refusedClosedCount,
  refusesText,
  type EditState,
} from "./guard";
import { VECTORS, VISA } from "./test-fixtures";

type LayoutVectors = { counts: Record<string, number>; accepted: Record<string, string[]>; rejected: number[][] };
const LAYOUT_VECTORS = (VECTORS as unknown as { layout_vectors: LayoutVectors }).layout_vectors;
type Noted = { id: string; expect: string; note?: string; limit?: boolean; label: string; text: string };
const TEXT = VECTORS.text_vectors as unknown as Noted[];

// The card layouts per total as cut positions (the running sums of the group sizes, the total left
// out): a single group (no cut); 4s with a last group of 1 to 4 (cuts 4, 8, 12, and 16 from 17
// digits); 4-6-5 and 4-6-4 (cuts 4 and 10, for 15 and 14 digits).
const cardCuts = (total: number): number[][] => {
  const out: number[][] = [[], total >= 17 ? [4, 8, 12, 16] : [4, 8, 12]];
  if (total === 14 || total === 15) out.push([4, 10]);
  return out;
};
/** The layout test by cut positions: a card's cuts, plus one cut, minus one cut, or one cut moved by one. */
function cutsAccept(total: number, mine: Set<number>): boolean {
  for (const card of cardCuts(total)) {
    const theirs = new Set(card);
    const onlyMine = [...mine].filter((c) => !theirs.has(c));
    const onlyTheirs = card.filter((c) => !mine.has(c));
    if (onlyMine.length === 0 && onlyTheirs.length <= 1) return true; // the same, or a missing space
    if (onlyTheirs.length === 0 && onlyMine.length === 1) return true; // a stray space
    if (onlyMine.length === 1 && onlyTheirs.length === 1 && Math.abs(onlyMine[0] - onlyTheirs[0]) === 1) return true;
  }
  return false;
}

// published test numbers of the eight brands, one each
const PUBLISHED = [
  "4111111111111111", "5555555555554444", "378282246310005", "6011111111111117", "3530111333300000",
  "36227206271667", "6205500000000000004", "6304000000000000",
];
const BRAND_SLUGS = ["visa", "mastercard", "american-express", "discover", "jcb", "diners-club", "unionpay", "maestro"];
const SLIP_KINDS = ["stray-space", "missing-space", "moved-boundary", "contiguous-one-space"];
// honest lines the strict rule refused, the narrowing allowed and the cure must keep allowed
const HONEST_KEPT = [
  "honest-two-unix-times", "honest-phone-then-date", "honest-date-range-count", "honest-dates-clocks-count",
  "honest-small-counts", "honest-two-amounts", "honest-record-ids-date-count",
];

describe("the layout test of the spacing slip cure (2026-11-19)", () => {
  it("the accepted layouts are the pinned lists exactly, 31, 50, 53, 38, 41, 44 and 46", () => {
    expect(LAYOUT_VECTORS.counts).toEqual({ "13": 31, "14": 50, "15": 53, "16": 38, "17": 41, "18": 44, "19": 46 });
    for (let total = 13; total <= 19; total++) {
      const got = acceptedLayouts(total).map((s) => s.join("-")).sort();
      expect(got, String(total)).toEqual([...LAYOUT_VECTORS.accepted[String(total)]].sort());
      expect(got).toHaveLength(LAYOUT_VECTORS.counts[String(total)]);
      for (const sizes of acceptedLayouts(total)) expect(isAcceptedLayout(sizes)).toBe(true);
    }
  });

  it("the rejected layouts are not accepted", () => {
    for (const sizes of LAYOUT_VECTORS.rejected) {
      expect(sizes.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(13);
      expect(isAcceptedLayout(sizes), sizes.join("-")).toBe(false);
    }
  });

  it("equals the cut position test on every split of 13 to 19 digits", () => {
    for (let total = 13; total <= 19; total++) {
      for (let mask = 0; mask < 1 << (total - 1); mask++) {
        const cuts = new Set<number>();
        const sizes: number[] = [];
        let last = 0;
        for (let b = 0; b < total - 1; b++) {
          if ((mask >> b) & 1) {
            cuts.add(b + 1);
            sizes.push(b + 1 - last);
            last = b + 1;
          }
        }
        sizes.push(total - last);
        if (isAcceptedLayout(sizes) !== cutsAccept(total, cuts)) throw new Error(`differs on ${sizes.join("-")}`);
      }
    }
  });

  it("a card layout is still accepted, a slip is not a card layout, and nothing outside 13 to 19 digits is accepted", () => {
    expect(isCardLayout([4, 4, 4, 4]) && isAcceptedLayout([4, 4, 4, 4])).toBe(true);
    expect(isCardLayout([4, 4, 4, 3, 1])).toBe(false);
    expect(isAcceptedLayout([4, 4, 4, 3, 1])).toBe(true);
    expect(isAcceptedLayout([4, 4, 4])).toBe(false);
    expect(isAcceptedLayout([4, 4, 4, 4, 4])).toBe(false);
    expect(acceptedLayouts(12)).toEqual([]);
    expect(acceptedLayouts(20)).toEqual([]);
  });

  it("every published number in every accepted layout is refused with an expiry, a time or a hyphen form", () => {
    for (const num of PUBLISHED) {
      for (const sizes of acceptedLayouts(num.length)) {
        const parts: string[] = [];
        let at = 0;
        for (const s of sizes) {
          parts.push(num.slice(at, at + s));
          at += s;
        }
        const line = parts.join(" ");
        const label = `${num.length} ${sizes.join("-")}`;
        expect(refusesText(`${line} 12/27 123`), label).toBe(true);
        expect(refusesText(`14:05 ${line} 3`), label).toBe(true);
        expect(refusesText(`${line.replace(/ /g, "-")} 12/27`), label).toBe(true);
      }
    }
  });

  it("a number in every accepted layout split by one of the six white space separators of 2026-11-19 is refused", () => {
    const six = (VECTORS as unknown as { separator_vectors: { added_2026_11_19: number[] } }).separator_vectors.added_2026_11_19;
    for (const cp of six) {
      for (const num of PUBLISHED) {
        for (const sizes of acceptedLayouts(num.length)) {
          const parts: string[] = [];
          let at = 0;
          for (const s of sizes) {
            parts.push(num.slice(at, at + s));
            at += s;
          }
          const line = parts.join(String.fromCodePoint(cp));
          const label = `${cp} ${num.length} ${sizes.join("-")}`;
          expect(refusesText(line), label).toBe(true);
          expect(refusesText(`${line} 12/27 123`), label).toBe(true);
        }
      }
    }
  });

  it("two slips in one number pass with an expiry beside it (a stated limit); the number alone is refused", () => {
    const spaced = "411 11111 111 11111";
    expect(spaced.replace(/ /g, "")).toBe(VISA);
    expect(refusesText(spaced)).toBe(true);
    expect(refusesText(`${spaced} 12/27 123`)).toBe(false);
  });

  it("the vectors the cure changed, and a number of every brand with one slip, are refused with the dated note", () => {
    const by = new Map(TEXT.map((v) => [v.id, v]));
    for (const slug of BRAND_SLUGS) {
      for (const kind of SLIP_KINDS) {
        const v = by.get(`slip-${slug}-${kind}`)!;
        expect(v.expect, v.id).toBe("refused");
        expect(v.limit, v.id).toBeUndefined();
        expect(v.note, v.id).toMatch(/2026-11-19/);
        expect(v.note, v.id).toMatch(/cures the spacing slip/);
        expect(refusesText(v.text), v.id).toBe(true);
      }
    }
  });

  it("a number of every brand with two slips is allowed as a stated limit, with the dated note", () => {
    const by = new Map(TEXT.map((v) => [v.id, v]));
    for (const slug of BRAND_SLUGS) {
      const v = by.get(`double-slip-${slug}`)!;
      expect(v.expect, v.id).toBe("allowed");
      expect(v.limit, v.id).toBe(true);
      expect(v.note, v.id).toMatch(/2026-11-19/);
      expect(v.note, v.id).toMatch(/two slips/);
      expect(refusesText(v.text), v.id).toBe(false);
    }
  });

  it("the honest kinds the narrowing allowed stay allowed", () => {
    const by = new Map(TEXT.map((v) => [v.id, v]));
    for (const id of HONEST_KEPT) expect(refusesText(by.get(id)!.text), id).toBe(false);
  });
});

describe("typing a slipped number (the typing rule keeps its meaning)", () => {
  /** Type `s` one character at a time at `caret` of `text`; returns what each keystroke did. */
  function typeAt(s: string, text: string, caret: number): { accepted: boolean[]; state: EditState } {
    let cur: EditState = { text, caret };
    const accepted: boolean[] = [];
    for (const ch of s) {
      const next: EditState = {
        text: cur.text.slice(0, cur.caret as number) + ch + cur.text.slice(cur.caret as number),
        caret: (cur.caret as number) + ch.length,
      };
      const ok = acceptEdit(cur, next, 1);
      accepted.push(ok);
      if (ok) cur = next;
    }
    return { accepted, state: cur };
  }
  const STRAY = "4111 1111 1111 111 1"; // 4-4-4-3-1, a stray space in 4-4-4-4

  it("typed at the end of the text, every digit is accepted (the run is open) and the next separator is refused", () => {
    const r = typeAt(STRAY, "Card: ", 6);
    expect(r.accepted.every(Boolean)).toBe(true);
    expect(r.state.text).toBe(`Card: ${STRAY}`);
    expect(refusedClosedCount(r.state.text, r.state.caret)).toBe(0); // open at the caret
    expect(refusedClosedCount(r.state.text, null)).toBe(1); // Save, paste and blur judge it closed
    expect(typeAt(" ", r.state.text, r.state.text.length).accepted).toEqual([false]);
    expect(typeAt("x", r.state.text, r.state.text.length).accepted).toEqual([false]);
  });

  it("a span of an open run is open only when it ends at the run's last digit: the slipped number before an expiry is closed", () => {
    // the caret is at the end of the number and an expiry follows: the run is not open, so the span of
    // the number (4-4-4-3-1, one slip from 4-4-4-4) ends before the run's last digit and is judged
    const text = `${STRAY} 12/27 123`;
    expect(refusedClosedCount(text, STRAY.length)).toBe(1);
    expect(refusedClosedCount(text, null)).toBe(1);
    // typing the last digit of the number in front of an existing expiry is refused, the digits before it are accepted
    const r = typeAt(STRAY, " 12/27 123", 0);
    expect(r.accepted.slice(0, -1).every(Boolean)).toBe(true);
    expect(r.accepted[r.accepted.length - 1]).toBe(false);
  });

  it("a slipped number pasted with its expiry and code is refused, with or without a caret", () => {
    const line = `${STRAY} 12/27 123`;
    const before: EditState = { text: "", caret: 0 };
    expect(acceptEdit(before, { text: line, caret: line.length }, line.length)).toBe(false);
    expect(refusedClosedCount(line, line.length)).toBe(1);
  });

  it("two slips pasted with an expiry are accepted (the stated limit)", () => {
    const line = "411 11111 111 11111 12/27 123";
    const before: EditState = { text: "", caret: 0 };
    expect(acceptEdit(before, { text: line, caret: line.length }, line.length)).toBe(true);
    expect(refusesText(line)).toBe(false);
  });
});
