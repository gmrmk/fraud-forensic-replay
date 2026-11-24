/**
 * The words of the investigator's marks, line by line: the accessible name and the tooltip lines of a
 * mark on the globe or under the Timeline. The kind in every word is the kind's label (the caller
 * resolves it: the manifest label, else the canonical kind).
 */
import { describe, it, expect } from "vitest";
import { markName, markTip, pileName, pileTip, type PileTipInput } from "./marks";

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
// eslint-disable-next-line no-control-regex
const NON_ASCII = /[^\x00-\x7f]/;

describe("markName", () => {
  it("names the thing and the action, with the kind label and the data's headline", () => {
    expect(markName("auth", "Corner Store")).toBe("Open your mark: auth: Corner Store");
    expect(markName("Stop", "Corner Store")).toBe("Open your mark: Stop: Corner Store");
  });
});

describe("markTip", () => {
  const full = { kindLabel: "auth", headline: "Corner Store", time: "T", notes: 4, disposition: "fail", category: "Shared key", pinned: true } as const;

  it("gives every line, in order, for a pinned FAIL record with a time, notes and a category", () => {
    expect(markTip(full)).toEqual([
      "Your mark on auth: Corner Store.",
      "Time: T",
      "Notes: 4",
      "You marked this FAIL.",
      "Category: Shared key",
      "Pinned.",
    ]);
  });

  it("gives only the first line for a record with no time, no notes, no disposition and no pin", () => {
    expect(markTip({ kindLabel: "auth", headline: "Corner Store", time: null, notes: 0, disposition: "none", category: null, pinned: false })).toEqual([
      "Your mark on auth: Corner Store.",
    ]);
  });

  it("words WAITING and PASS as the investigator's own entry", () => {
    expect(markTip({ ...full, disposition: "wait", category: null, pinned: false })[3]).toBe("You marked this WAITING.");
    expect(markTip({ ...full, disposition: "pass", category: null, pinned: false })[3]).toBe("You marked this PASS.");
  });

  it("prints no category unless the disposition is FAIL", () => {
    expect(markTip({ ...full, disposition: "pass" })).not.toContain("Category: Shared key");
    expect(markTip({ ...full, disposition: "none" })).not.toContain("Category: Shared key");
  });

  it("prints a FAIL with no category without a category line", () => {
    expect(markTip({ ...full, category: null })).toEqual([
      "Your mark on auth: Corner Store.",
      "Time: T",
      "Notes: 4",
      "You marked this FAIL.",
      "Pinned.",
    ]);
  });

  it("prints the notes line for one note and none for zero", () => {
    expect(markTip({ ...full, notes: 1 })).toContain("Notes: 1");
    expect(markTip({ ...full, notes: 0 }).some((l) => l.startsWith("Notes"))).toBe(false);
  });

  it("holds no dash character and no non-ASCII byte", () => {
    const lines = [markName("auth", "Corner Store"), ...markTip(full)];
    for (const l of lines) {
      expect(l).not.toMatch(DASHES);
      expect(l).not.toMatch(NON_ASCII);
    }
  });
});

describe("pileName", () => {
  it("says what the thing is and how many records it holds, then what a press does", () => {
    expect(pileName(3, false)).toBe("Your marks on 3 records. Show each one.");
    expect(pileName(3, true)).toBe("Your marks on 3 records. Fold them.");
  });
});

describe("pileTip", () => {
  const base: PileTipInput = {
    records: 3,
    first: "A",
    last: "B",
    counts: { pass: 1, fail: 2, wait: 0 },
    pinned: 2,
    unfolded: false,
  };

  it("gives every line, in order, for a folded pile with a span, two decisions and two pinned records", () => {
    expect(pileTip(base)).toEqual([
      "Your marks on 3 records.",
      "Time: A to B",
      "You marked PASS: 1",
      "You marked FAIL: 2",
      "Pinned: 2",
      "Press to show each one.",
    ]);
  });

  it("prints a time that begins and ends at one clock text once", () => {
    expect(pileTip({ ...base, last: "A" })[1]).toBe("Time: A");
  });

  it("leaves the time line out when no member has a time", () => {
    const lines = pileTip({ ...base, first: null, last: null });
    expect(lines.some((l) => l.startsWith("Time"))).toBe(false);
    expect(lines).toHaveLength(5);
  });

  it("leaves the pinned line out when no record is pinned", () => {
    expect(pileTip({ ...base, pinned: 0 }).some((l) => l.startsWith("Pinned"))).toBe(false);
  });

  it("ends with what a press does: show each one when folded, fold them when unfolded", () => {
    expect(pileTip(base).at(-1)).toBe("Press to show each one.");
    expect(pileTip({ ...base, unfolded: true }).at(-1)).toBe("Press to fold them.");
  });

  it("prints a decision line only for a decision a member carries, in the glyph order, with WAITING in full", () => {
    expect(pileTip({ ...base, counts: { pass: 0, fail: 0, wait: 3 } }).filter((l) => l.startsWith("You marked"))).toEqual([
      "You marked WAITING: 3",
    ]);
    expect(pileTip({ ...base, counts: { pass: 1, fail: 1, wait: 1 } }).filter((l) => l.startsWith("You marked"))).toEqual([
      "You marked PASS: 1",
      "You marked FAIL: 1",
      "You marked WAITING: 1",
    ]);
    expect(pileTip({ ...base, counts: { pass: 0, fail: 0, wait: 0 } }).some((l) => l.startsWith("You marked"))).toBe(false);
  });

  it("holds no dash character and no non-ASCII byte in its own words", () => {
    // The clock's real text carries a middle dot of its own; the caller's text is a stand-in here.
    const lines = [pileName(3, false), pileName(3, true), ...pileTip(base), ...pileTip({ ...base, unfolded: true })];
    for (const l of lines) {
      expect(l).not.toMatch(DASHES);
      expect(l).not.toMatch(NON_ASCII);
    }
  });

  it("states no conclusion: the decision lines are the investigator's own entry", () => {
    for (const l of pileTip({ ...base, counts: { pass: 1, fail: 1, wait: 1 } })) {
      expect(l).not.toMatch(/fraud|suspicious|likely|probably|stolen|compromised/i);
    }
  });
});
