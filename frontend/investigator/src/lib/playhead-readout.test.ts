import { afterEach, describe, expect, it, vi } from "vitest";
import { makePlayheadFormatter, buildTxDays, todayTotals } from "./playhead-readout";
import { houstonDayKey } from "./houston-day";

// The zone is an argument of the formatter: the lib file holds none. The test names the one the
// Timeline passes.
const ZONE = "America/Chicago";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("makePlayheadFormatter", () => {
  // Golden strings: the output of the readout's formatter as it stood when this test was written, printed by running
  // its code and not typed by hand. They cover noon, midnight, the last minute of a day, a winter
  // date and both daylight-saving changes.
  const GOLDEN: [string, string][] = [
    ["2026-05-14T20:05:00Z", "Thu May 14 · 3:05p"],
    ["2026-05-14T05:00:00Z", "Thu May 14 · 12:00a"],
    ["2026-05-14T17:00:00Z", "Thu May 14 · 12:00p"],
    ["2026-05-15T04:59:00Z", "Thu May 14 · 11:59p"],
    ["2026-01-15T06:30:00Z", "Thu Jan 15 · 12:30a"],
    ["2026-03-08T07:30:00Z", "Sun Mar 8 · 1:30a"],
    ["2026-11-01T06:30:00Z", "Sun Nov 1 · 1:30a"],
  ];

  it.each(GOLDEN)("gives today's words for %s", (iso, words) => {
    const format = makePlayheadFormatter(ZONE);
    expect(format(Date.parse(iso))).toBe(words);
  });

  it("follows the zone it is given and not the runner's", () => {
    const utc = makePlayheadFormatter("UTC");
    expect(utc(Date.parse("2026-05-14T20:05:00Z"))).toBe("Thu May 14 · 8:05p");
  });

  it("builds no formatter and calls no date-to-string method while it formats", () => {
    const format = makePlayheadFormatter(ZONE);
    format(0);
    const built = vi.spyOn(Intl, "DateTimeFormat");
    const dateWords = vi.spyOn(Date.prototype, "toLocaleDateString");
    const timeWords = vi.spyOn(Date.prototype, "toLocaleTimeString");
    for (let i = 0; i < 60; i++) format(Date.parse("2026-05-14T20:05:00Z") + i * 60_000);
    expect(built).toHaveBeenCalledTimes(0);
    expect(dateWords).toHaveBeenCalledTimes(0);
    expect(timeWords).toHaveBeenCalledTimes(0);
  });
});

describe("buildTxDays and todayTotals", () => {
  const T0 = Date.parse("2026-05-14T20:00:00Z"); // 3:00 PM Houston, May 14
  const txs = Array.from({ length: 200 }, (_, i) => ({
    // 100 on May 14 Houston, 100 on May 15 Houston.
    timestamp: new Date(T0 + (i < 100 ? i : 24 * 60 + i) * 60_000).toISOString(),
    amount: 10 + (i % 7),
  }));

  it("holds each transaction's time, Houston day and amount", () => {
    const days = buildTxDays(txs);
    expect(days).toHaveLength(200);
    expect(days[0]).toEqual({ ts: T0, day: houstonDayKey(T0), amount: 10 });
    expect(days[150].day).toBe(houstonDayKey(Date.parse(txs[150].timestamp)));
    expect(days[0].day).not.toBe(days[150].day);
  });

  it("counts the transactions that share the playhead's Houston day and have happened", () => {
    const days = buildTxDays(txs);
    const at = T0 + 9 * 60_000; // the tenth transaction of May 14 has just happened
    const want = txs.slice(0, 10).reduce((sum, t) => sum + t.amount, 0);
    expect(todayTotals(days, at)).toEqual({ auths: 10, spend: want });
    expect(todayTotals(days, T0 - 1)).toEqual({ auths: 0, spend: 0 });
  });

  it("sixty tallies cost one day key each, not one for each transaction", () => {
    const days = buildTxDays(txs);
    const keys = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts");
    for (let i = 0; i < 60; i++) todayTotals(days, T0 + i * 1000);
    expect(keys).toHaveBeenCalledTimes(60);
  });
});
