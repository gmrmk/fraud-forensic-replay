// frontend/investigator/src/lib/houston-day.test.ts
import { describe, it, expect } from "vitest";
import { houstonDayKey, formatHoustonDateTime, HOU_TZ } from "./houston-day";

describe("HOU_TZ", () => {
  // The one exported source of the app's zone: files added later import it instead of
  // writing the string again.
  it("is the America/Chicago zone", () => {
    expect(HOU_TZ).toBe("America/Chicago");
  });
});

describe("houstonDayKey", () => {
  // The bug this guards: Timeline's today-bucket used browser-local midnight,
  // so off a non-Central machine it bucketed the wrong calendar day. The
  // helper freezes the day key to America/Chicago by construction, so the
  // result is independent of the runner's timezone.
  it("returns the HOUSTON calendar day when UTC and Houston differ", () => {
    // 2026-05-22T03:00:00Z is 2026-05-21 22:00 in Houston (CDT, -05:00).
    // A naive UTC/local bucket would say 2026-05-22; the Houston key is the day before.
    const ms = Date.parse("2026-05-22T03:00:00Z");
    expect(houstonDayKey(ms)).toBe("2026-05-21");
  });

  it("returns the obvious date for a mid-day Houston timestamp", () => {
    // 2026-05-21T17:00:00Z is 2026-05-21 12:00 in Houston (noon) - same day in
    // both zones, so the obvious answer.
    const ms = Date.parse("2026-05-21T17:00:00Z");
    expect(houstonDayKey(ms)).toBe("2026-05-21");
  });

  it("is deterministic for the same ms (no Date.now dependency)", () => {
    const ms = Date.parse("2026-05-21T17:00:00Z");
    expect(houstonDayKey(ms)).toBe(houstonDayKey(ms));
  });

  it("crosses the Houston midnight boundary correctly", () => {
    // 2026-05-22T04:59:59Z is 2026-05-21 23:59:59 in Houston (still the 21st);
    // 2026-05-22T05:00:00Z is 2026-05-22 00:00:00 in Houston (now the 22nd).
    expect(houstonDayKey(Date.parse("2026-05-22T04:59:59Z"))).toBe("2026-05-21");
    expect(houstonDayKey(Date.parse("2026-05-22T05:00:00Z"))).toBe("2026-05-22");
  });

  it("zero-pads month and day to a stable YYYY-MM-DD shape", () => {
    // 2026-01-09T18:00:00Z is 2026-01-09 12:00 in Houston (CST, -06:00).
    expect(houstonDayKey(Date.parse("2026-01-09T18:00:00Z"))).toBe("2026-01-09");
  });
});

describe("formatHoustonDateTime", () => {
  // The timeline's style ("Mon Jun 8 · 9:04a"), frozen to Houston.
  it("formats an ISO datetime with an offset, seconds dropped", () => {
    expect(formatHoustonDateTime("2026-06-08T09:04:17-05:00")).toBe("Mon Jun 8 · 9:04a");
  });

  it("formats an ISO datetime without seconds, converting the offset to Houston", () => {
    expect(formatHoustonDateTime("2026-06-08T19:30Z")).toBe("Mon Jun 8 · 2:30p");
  });

  it("follows the DST switch (CST before, CDT after 2026-03-08 08:00Z)", () => {
    expect(formatHoustonDateTime("2026-03-08T07:30:00Z")).toBe("Sun Mar 8 · 1:30a");
    expect(formatHoustonDateTime("2026-03-08T08:30:00Z")).toBe("Sun Mar 8 · 3:30a");
  });

  it("leaves a non-date string, a bare date and an offset-less time untouched", () => {
    expect(formatHoustonDateTime("AS64511 Cloud host")).toBe("AS64511 Cloud host");
    expect(formatHoustonDateTime("2026-06-08")).toBe("2026-06-08");
    expect(formatHoustonDateTime("2026-06-08T09:04:17")).toBe("2026-06-08T09:04:17");
    expect(formatHoustonDateTime("2026-13-45T99:99Z")).toBe("2026-13-45T99:99Z");
  });
});
