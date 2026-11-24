/**
 * The ATO storytelling layer: in an account takeover the TIMING is the
 * signature, so the timeline renders it as evidence - the one severity
 * session's elapsed-time chips (+7m), the quiet dwell gap before it
 * (48H QUIET), and a per-day density band where Day 28 lights up against
 * 29 quiet days. Pure functions over generic ticks; no Priya-specific code.
 */
import { describe, expect, it } from "vitest";
import {
  dayCells,
  elapsedChips,
  kindPathSegments,
  quietGap,
  severitySession,
  type StoryTick,
} from "./timeline-story";

const H = 3_600_000;
const DAY = 24 * H;
const MIN = 60_000;

const T0 = Date.parse("2026-04-27T00:00:00-05:00");
const SPAN = 30 * DAY;

function tick(o: Partial<StoryTick> & { id: string; ts: number }): StoryTick {
  return { kind: "auth", session: null, severe: false, ...o };
}

// The canon kill chain: login 10:07, email +7m, payee +9m, wire +13m, wire +30m,
// all one session; the last precursor (a benign Tamsinmere) sits ~48h earlier.
const KILL_START = T0 + 28 * DAY + 10 * H + 7 * MIN;
const FIXTURE: StoryTick[] = [
  tick({ id: "coffee", ts: T0 + 8 * H }),
  tick({ id: "tamsinmere-hook", ts: KILL_START - 48 * H, kind: "transfer", session: "s-z" }),
  tick({ id: "login", ts: KILL_START, kind: "login", session: "sess-takeover", severe: true }),
  tick({ id: "email", ts: KILL_START + 7 * MIN, kind: "account_event", session: "sess-takeover" }),
  tick({ id: "payee", ts: KILL_START + 16 * MIN, kind: "account_event", session: "sess-takeover" }),
  tick({ id: "wire1", ts: KILL_START + 29 * MIN, kind: "transfer", session: "sess-takeover" }),
  tick({
    id: "wire2",
    ts: KILL_START + 59 * MIN,
    kind: "transfer",
    session: "sess-takeover",
    severe: true,
  }),
];

describe("severitySession", () => {
  it("finds the multi-event session containing a severe tick", () => {
    expect(severitySession(FIXTURE)).toBe("sess-takeover");
  });

  it("returns null when no severe tick exists", () => {
    const benign = FIXTURE.map((t) => ({ ...t, severe: false }));
    expect(severitySession(benign)).toBeNull();
  });

  it("ignores a severe tick whose session has only one event", () => {
    const lone = [tick({ id: "x", ts: T0, session: "solo", severe: true })];
    expect(severitySession(lone)).toBeNull();
  });
});

describe("elapsedChips", () => {
  it("labels the gap between consecutive same-session events in minutes", () => {
    const chips = elapsedChips(FIXTURE, "sess-takeover", T0, SPAN);
    expect(chips.map((c) => c.label)).toEqual(["+7m", "+9m", "+13m", "+30m"]);
  });

  it("positions each chip between its two events", () => {
    const chips = elapsedChips(FIXTURE, "sess-takeover", T0, SPAN);
    const loginPct = ((KILL_START - T0) / SPAN) * 100;
    expect(chips[0].pct).toBeGreaterThan(loginPct);
    expect(chips[0].pct).toBeLessThan(loginPct + 1);
  });

  it("returns [] for a null session", () => {
    expect(elapsedChips(FIXTURE, null, T0, SPAN)).toEqual([]);
  });
});

describe("quietGap", () => {
  it("brackets the dwell between the last precursor and the takeover", () => {
    const gap = quietGap(FIXTURE, "sess-takeover", T0, SPAN);
    expect(gap).not.toBeNull();
    expect(gap?.label).toBe("48H QUIET");
    expect(gap?.fromPct).toBeLessThan(gap!.toPct);
  });

  it("returns null when the dwell is under the 12h floor", () => {
    const close = FIXTURE.map((t) =>
      t.id === "tamsinmere-hook" ? { ...t, ts: KILL_START - 2 * H } : t,
    );
    expect(quietGap(close, "sess-takeover", T0, SPAN)).toBeNull();
  });

  it("returns null for a null session", () => {
    expect(quietGap(FIXTURE, null, T0, SPAN)).toBeNull();
  });
});

describe("dayCells", () => {
  it("builds one cell per day with counts and severity", () => {
    const cells = dayCells(FIXTURE, T0, T0 + SPAN);
    expect(cells).toHaveLength(30);
    expect(cells[0].count).toBe(1); // the coffee
    expect(cells[28].count).toBe(5); // the kill chain
    expect(cells[28].severe).toBe(true);
    expect(cells[0].severe).toBe(false);
  });

  it("cells span the full width in order", () => {
    const cells = dayCells(FIXTURE, T0, T0 + SPAN);
    expect(cells[0].leftPct).toBe(0);
    expect(cells[29].leftPct + cells[29].widthPct).toBeCloseTo(100, 5);
  });

  // houstonMidnightMs's binary-search bounds sat below true
  // Houston local midnight, so it converged to a UTC-offset boundary instead
  // of the real Houston-day crossing - ticks landed in the previous day's
  // cell by ~5-6h (the CDT UTC offset leaking through). 2026-05-27T04:30:00Z
  // is 2026-05-26T23:30:00 Central: 30 minutes before local midnight, so it
  // must bucket into the 2026-05-26 cell, not 2026-05-27.
  it("buckets a tick just before Houston local midnight into the earlier day", () => {
    const winStart = Date.parse("2026-05-25T00:00:00-05:00");
    const winEnd = Date.parse("2026-05-29T00:00:00-05:00");
    const beforeMidnight = Date.parse("2026-05-27T04:30:00Z"); // 2026-05-26 23:30 CDT
    const ticks: StoryTick[] = [tick({ id: "before", ts: beforeMidnight })];
    const cells = dayCells(ticks, winStart, winEnd);

    const may26Start = ((Date.parse("2026-05-26T00:00:00-05:00") - winStart) / (winEnd - winStart)) * 100;
    const may27Start = ((Date.parse("2026-05-27T00:00:00-05:00") - winStart) / (winEnd - winStart)) * 100;

    // Find the cell covering just-before-midnight: its leftPct must be the
    // 05-26 boundary, not the 05-27 boundary.
    const hitIdx = cells.findIndex((c) => c.count === 1);
    expect(hitIdx).toBeGreaterThanOrEqual(0);
    expect(cells[hitIdx].leftPct).toBeCloseTo(may26Start, 5);
    expect(cells[hitIdx].leftPct).not.toBeCloseTo(may27Start, 1);
  });

  it("buckets a tick just after Houston local midnight into the next day", () => {
    const winStart = Date.parse("2026-05-25T00:00:00-05:00");
    const winEnd = Date.parse("2026-05-29T00:00:00-05:00");
    const afterMidnight = Date.parse("2026-05-27T05:30:00Z"); // 2026-05-27 00:30 CDT
    const ticks: StoryTick[] = [tick({ id: "after", ts: afterMidnight })];
    const cells = dayCells(ticks, winStart, winEnd);

    const may27Start = ((Date.parse("2026-05-27T00:00:00-05:00") - winStart) / (winEnd - winStart)) * 100;
    const may26Start = ((Date.parse("2026-05-26T00:00:00-05:00") - winStart) / (winEnd - winStart)) * 100;

    const hitIdx = cells.findIndex((c) => c.count === 1);
    expect(hitIdx).toBeGreaterThanOrEqual(0);
    expect(cells[hitIdx].leftPct).toBeCloseTo(may27Start, 5);
    expect(cells[hitIdx].leftPct).not.toBeCloseTo(may26Start, 1);
  });

  // A window that ends in the middle of a day. The 23 h probes from the start
  // fall at May 25 00:00, May 25 23:00 and May 26 22:00 (all before maxTime),
  // so the probes alone never reach May 27: the last part-day must still get
  // its own cell, and a tick inside it must be counted there.
  describe("a window that ends in the middle of a day", () => {
    const winStart = Date.parse("2026-05-25T00:00:00-05:00");
    const winEnd = Date.parse("2026-05-27T12:00:00-05:00");
    const may26 = Date.parse("2026-05-26T00:00:00-05:00");
    const may27 = Date.parse("2026-05-27T00:00:00-05:00");
    const span = winEnd - winStart;

    it("gives the last part-day its own cell, from its midnight to maxTime", () => {
      const cells = dayCells([], winStart, winEnd);
      expect(cells).toHaveLength(3);
      expect(cells[1].leftPct).toBeCloseTo(((may26 - winStart) / span) * 100, 5);
      expect(cells[1].widthPct).toBeCloseTo(((may27 - may26) / span) * 100, 5);
      expect(cells[2].leftPct).toBeCloseTo(((may27 - winStart) / span) * 100, 5);
      expect(cells[2].leftPct + cells[2].widthPct).toBeCloseTo(100, 5);
    });

    it("counts a mark inside the last part-day in that cell", () => {
      const mark = tick({
        id: "late-fraud",
        ts: Date.parse("2026-05-27T10:00:00-05:00"),
        kind: "fraud",
        severe: true,
      });
      const cells = dayCells([mark], winStart, winEnd);
      expect(cells.map((c) => c.count)).toEqual([0, 0, 1]);
      expect(cells[2].severe).toBe(true);
      expect(cells[1].severe).toBe(false);
    });
  });

  // These two pin what the function gave before the last part-day was keyed:
  // a window ending exactly on a midnight opens no cell for the day after it,
  // and a window over the spring clock change (a 23 h day, March 8) keeps one
  // cell per Houston day.
  it("opens no cell for the day that starts exactly at maxTime", () => {
    const winStart = Date.parse("2026-05-25T00:00:00-05:00");
    const winEnd = Date.parse("2026-05-27T00:00:00-05:00");
    const cells = dayCells([], winStart, winEnd);
    expect(cells).toHaveLength(2);
    expect(cells[0].leftPct).toBe(0);
    expect(cells[1].leftPct).toBeCloseTo(50, 5);
    expect(cells[1].leftPct + cells[1].widthPct).toBeCloseTo(100, 5);
  });

  it("keeps one cell per Houston day over a clock change", () => {
    const winStart = Date.parse("2026-03-07T00:00:00-06:00");
    const winEnd = Date.parse("2026-03-10T00:00:00-05:00");
    const mar8 = Date.parse("2026-03-08T00:00:00-06:00");
    const mar9 = Date.parse("2026-03-09T00:00:00-05:00");
    const span = winEnd - winStart;
    const cells = dayCells([], winStart, winEnd);
    expect(cells).toHaveLength(3);
    expect(cells[1].leftPct).toBeCloseTo(((mar8 - winStart) / span) * 100, 5);
    expect(cells[2].leftPct).toBeCloseTo(((mar9 - winStart) / span) * 100, 5);
    expect(cells[2].leftPct + cells[2].widthPct).toBeCloseTo(100, 5);
  });
});

describe("kindPathSegments", () => {
  const events = [
    { ts: T0 + 2 * DAY, severe: false },
    { ts: T0 + 5 * DAY, severe: false },
    { ts: T0 + 28 * DAY, severe: true },
    { ts: T0 + 28 * DAY + 30 * MIN, severe: true },
  ];

  it("returns one segment per consecutive pair, in time order", () => {
    const segs = kindPathSegments(events, T0, SPAN);
    expect(segs).toHaveLength(3);
    expect(segs[0].fromPct).toBeLessThan(segs[0].toPct);
    expect(segs[1].fromPct).toBeCloseTo(segs[0].toPct, 5);
  });

  it("marks a segment severe when its RIGHT endpoint is severe", () => {
    const segs = kindPathSegments(events, T0, SPAN);
    expect(segs.map((s) => s.severe)).toEqual([false, true, true]);
  });

  it("sorts unordered input by time", () => {
    const segs = kindPathSegments([events[2], events[0], events[1]], T0, SPAN);
    expect(segs[0].fromPct).toBeLessThan(segs[1].fromPct);
  });

  it("returns empty for fewer than two events or a zero span", () => {
    expect(kindPathSegments([events[0]], T0, SPAN)).toEqual([]);
    expect(kindPathSegments(events, T0, 0)).toEqual([]);
  });
});
