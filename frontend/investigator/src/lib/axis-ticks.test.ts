import { describe, it, expect } from "vitest";
import { tickStep, tickLabel, axisTicks } from "./axis-ticks";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("tickStep - granularity grows finer as the span shrinks", () => {
  it("a sub-minute window steps by seconds", () => {
    expect(tickStep(20 * SEC)).toBeLessThan(MIN);
  });
  it("an hours window steps by minutes/hours (not seconds, not days)", () => {
    const s = tickStep(2 * HOUR);
    expect(s).toBeGreaterThanOrEqual(MIN);
    expect(s).toBeLessThan(DAY);
  });
  it("a multi-day window steps by days+", () => {
    expect(tickStep(30 * DAY)).toBeGreaterThanOrEqual(DAY);
  });
  it("a multi-year window steps by months+", () => {
    expect(tickStep(2 * 365 * DAY)).toBeGreaterThanOrEqual(30 * DAY);
  });
});

describe("tickLabel - Houston time, format matched to the step", () => {
  // 2026-05-12T14:30:15 Houston (CDT, −05:00) === 19:30:15 UTC.
  const t = Date.parse("2026-05-12T19:30:15Z");
  it("a seconds step → hh:mm:ss", () => {
    expect(tickLabel(t, 15 * SEC)).toBe("14:30:15");
  });
  it("a minutes/hours step → hh:mm", () => {
    expect(tickLabel(t, 15 * MIN)).toBe("14:30");
  });
  it("a days step → a Mon-DD date", () => {
    expect(tickLabel(t, DAY)).toMatch(/May/);
  });
});

describe("axisTicks - drilling into time yields hh:mm:ss", () => {
  it("a 2-minute window produces only hh:mm:ss labels", () => {
    const min = Date.parse("2026-05-12T19:30:00Z");
    const ticks = axisTicks(min, min + 2 * MIN);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((t) => /^\d{2}:\d{2}:\d{2}$/.test(t.label))).toBe(true);
  });
  it("a 30-day window produces date labels (not clock times)", () => {
    const min = Date.parse("2026-04-27T05:00:00Z");
    const ticks = axisTicks(min, min + 30 * DAY);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.some((t) => /[A-Z][a-z]{2}/.test(t.label))).toBe(true);
  });
  it("returns [] for a non-positive span", () => {
    expect(axisTicks(100, 100)).toEqual([]);
  });
});

// The clock's form: 12 hour reads "4:00p", 24 hour reads "16:00". The form is an
// optional trailing argument; leaving it out gives the 24 hour marks the axis has always drawn.
describe("tickLabel - the 12 hour form", () => {
  const t = Date.parse("2026-05-12T19:30:15Z"); // 2:30:15 PM Houston
  it("a seconds step reads h:mm:ssp", () => {
    expect(tickLabel(t, 15 * SEC, true)).toBe("2:30:15p");
  });
  it("a minutes or hours step reads h:mmp", () => {
    expect(tickLabel(t, 15 * MIN, true)).toBe("2:30p");
    expect(tickLabel(t, HOUR, true)).toBe("2:30p");
  });
  it("a morning hour reads with a", () => {
    expect(tickLabel(Date.parse("2026-05-12T14:00:00Z"), HOUR, true)).toBe("9:00a");
  });
  it("midnight reads 12:00a and noon 12:00p", () => {
    expect(tickLabel(Date.parse("2026-05-12T05:00:00Z"), HOUR, true)).toBe("12:00a");
    expect(tickLabel(Date.parse("2026-05-12T17:00:00Z"), HOUR, true)).toBe("12:00p");
  });
  it("day and month steps read the same in both forms", () => {
    expect(tickLabel(t, DAY, true)).toBe(tickLabel(t, DAY, false));
    expect(tickLabel(t, 30 * DAY, true)).toBe(tickLabel(t, 30 * DAY, false));
  });
});

describe("tickLabel - the 24 hour form and the default", () => {
  const t = Date.parse("2026-05-12T19:30:15Z");
  it("passing false gives the same as passing nothing", () => {
    expect(tickLabel(t, 15 * SEC, false)).toBe(tickLabel(t, 15 * SEC));
    expect(tickLabel(t, 15 * MIN, false)).toBe(tickLabel(t, 15 * MIN));
  });
  it("midnight reads 00:00 and never 24:00", () => {
    expect(tickLabel(Date.parse("2026-05-12T05:00:00Z"), HOUR)).toBe("00:00");
  });
});

describe("axisTicks - the hours under the bar follow the form", () => {
  // The picks' window: 3:45 PM June 8 to 7:45 AM June 9 Houston, a 3 hour step.
  const min = Date.parse("2026-06-08T20:45:00Z");
  const max = Date.parse("2026-06-09T12:45:00Z");
  const labels = (h12?: boolean) => axisTicks(min, max, h12).map((t) => t.label);
  it("12 hour marks", () => {
    expect(labels(true)).toEqual(["4:00p", "7:00p", "10:00p", "1:00a", "4:00a", "7:00a"]);
  });
  it("24 hour marks", () => {
    expect(labels(false)).toEqual(["16:00", "19:00", "22:00", "01:00", "04:00", "07:00"]);
  });
  it("the default is the 24 hour marks", () => {
    expect(labels()).toEqual(labels(false));
  });
  it("the form changes the labels and not where the marks fall", () => {
    const a = axisTicks(min, max, true).map((t) => t.ms);
    const b = axisTicks(min, max, false).map((t) => t.ms);
    expect(a).toEqual(b);
  });
  it("a two-minute window reads h:mm:ssp in 12 hour", () => {
    const m = Date.parse("2026-05-12T19:30:00Z");
    const ticks = axisTicks(m, m + 2 * MIN, true);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((t) => /^\d{1,2}:\d{2}:\d{2}[ap]$/.test(t.label))).toBe(true);
  });
  it("a 30-day window reads the same dates in both forms", () => {
    const m = Date.parse("2026-04-27T05:00:00Z");
    expect(axisTicks(m, m + 30 * DAY, true)).toEqual(axisTicks(m, m + 30 * DAY, false));
  });
});
