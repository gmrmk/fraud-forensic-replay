// frontend/investigator/src/lib/rows-small.test.ts
// The pure parts of the folded rows' small version. The count of the rows that are
// active in each step, its scale (0 to the largest count of the whole case), the day cells of a
// story with no step (taken from the Houston day's own boundaries, so a clock change is correct),
// the solo's count, and the printed words. Every fixture is written in this file with generic
// names (a pack of "Group" rows).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SMALL_PLOT_PX } from "./bar-metrics-small";
import type { RowTick } from "./row-ticks";
import {
  barHeightPx,
  buildCountModel,
  cellAt,
  countFigureText,
  countLabelText,
  houstonDayEnd,
  houstonDayStart,
} from "./rows-small";
import type { Track, TrackSet } from "./tracks";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 5:00 PM and 8:00 AM Houston time on Tuesday June 2, 2026 (CDT, UTC-5). */
const EVENING = Date.parse("2026-06-02T22:00:00Z");
const MORNING = Date.parse("2026-06-02T13:00:00Z");

interface Ev {
  row: number;
  t: number;
}
interface Bar {
  row: number;
  t: number;
  value: number;
}

/** A set of `rows` named rows, `rest` rest rows after them, the given events and bars. */
function makeSet(rows: number, events: readonly Ev[], bars: readonly Bar[], step: number, rest = 0): { set: TrackSet; ticks: RowTick[] } {
  const tracks: Track[] = [];
  for (let i = 0; i < rows + rest; i += 1) {
    const own = bars.filter((b) => b.row === i).map((b) => ({ t: b.t, value: b.value }));
    tracks.push({
      key: i < rows ? `v:g${i}` : `rest:${i}`,
      name: `Group ${i}`,
      rest: i >= rows,
      count: 0,
      bars: own,
      total: own.reduce((s, b) => s + b.value, 0),
      kinds: [],
      lines: [],
    });
  }
  const trackOf = new Map<string, number>();
  const ticks: RowTick[] = events.map((e, n) => {
    const id = `e${n}`;
    trackOf.set(id, e.row);
    return { id, kind: "k", label: id, secondary: "", facts: [], t: e.t, session: null, challengeVar: null, newDevice: false, blocked: false };
  });
  const set: TrackSet = {
    by: "g",
    heading: "Group",
    tracks,
    named: rows,
    trackOf,
    scale: bars.length > 0 ? { top: 100, max: 100, above: 0 } : null,
    step: bars.length > 0 ? step : 0,
    barPalette: "",
    barName: "Weight",
    barUnit: "kg",
    memberLabel: "",
  };
  return { set, ticks };
}

/** Rows 0..n-1 each with one event at `t`. */
const eventsAt = (t: number, n: number): Ev[] => Array.from({ length: n }, (_, row) => ({ row, t }));

describe("buildCountModel, a story with an hourly step", () => {
  // 15 of 30 rows active in the evening hour: 10 by an event, 5 by a bar, and row 12 by both.
  // 21 of 30 in the morning hour: 21 rows by an event.
  const events = [...eventsAt(EVENING + 10 * 60_000, 10), { row: 12, t: EVENING + 20 * 60_000 }, ...eventsAt(MORNING + 5 * 60_000, 21)];
  const bars: Bar[] = [10, 11, 12, 13, 14].map((row) => ({ row, t: EVENING, value: 3 }));
  const { set, ticks } = makeSet(30, events, bars, HOUR);
  const model = buildCountModel({ set, ticks, soloKey: null });

  it("counts a row once in an hour, whether an event, a bar over zero, or both put it there", () => {
    expect(cellAt(model, EVENING + 22 * 60_000).n).toBe(15);
    expect(cellAt(model, MORNING + 45 * 60_000).n).toBe(21);
  });

  it("scales from 0 to the largest count of the whole case", () => {
    expect(model.top).toBe(21);
    expect(model.named).toBe(30);
  });

  it("does not count a bar of zero", () => {
    const zero = makeSet(30, [], [{ row: 0, t: EVENING, value: 0 }, { row: 1, t: EVENING, value: 4 }], HOUR);
    const m = buildCountModel({ set: zero.set, ticks: zero.ticks, soloKey: null });
    expect(cellAt(m, EVENING).n).toBe(1);
  });

  it("leaves the rest rows out of the count and out of the total", () => {
    const withRest = makeSet(3, [{ row: 0, t: EVENING }, { row: 3, t: EVENING }, { row: 4, t: EVENING }], [{ row: 1, t: EVENING, value: 2 }], HOUR, 2);
    const m = buildCountModel({ set: withRest.set, ticks: withRest.ticks, soloKey: null });
    expect(cellAt(m, EVENING).n).toBe(2);
    expect(m.named).toBe(3);
  });

  it("gives an hour with nothing in it a count of 0 and draws no bar for it", () => {
    expect(cellAt(model, EVENING + 3 * HOUR).n).toBe(0);
    expect(model.cells.map((c) => c.t)).toEqual([MORNING, EVENING]);
  });

  it("gives each cell its own end, one step on", () => {
    expect(model.cells.every((c) => c.end - c.t === HOUR)).toBe(true);
  });
});

describe("buildCountModel, a story with no step takes its day cells from the Houston day", () => {
  // Three days across the fall clock change of 2026-11-01 (the 1st is 25 hours long).
  const OCT31 = Date.parse("2026-10-31T17:00:00Z");
  const NOV1 = Date.parse("2026-11-01T18:00:00Z");
  const NOV2 = Date.parse("2026-11-02T18:00:00Z");
  const { set, ticks } = makeSet(5, [...eventsAt(OCT31, 2), ...eventsAt(NOV1, 4), ...eventsAt(NOV2, 1)], [], 0);
  const model = buildCountModel({ set, ticks, soloKey: null });

  it("starts each cell at local midnight on both sides of a clock change", () => {
    expect(model.cells.map((c) => c.t)).toEqual([
      Date.parse("2026-10-31T05:00:00Z"), // 00:00 CDT
      Date.parse("2026-11-01T05:00:00Z"), // 00:00 CDT, the day that has 25 hours
      Date.parse("2026-11-02T06:00:00Z"), // 00:00 CST
    ]);
  });

  it("ends the 25 hour day at the next local midnight and not 24 hours on", () => {
    const nov1 = model.cells[1];
    expect(nov1.end - nov1.t).toBe(25 * HOUR);
    expect(nov1.end).toBe(model.cells[2].t);
  });

  it("counts the rows of each day", () => {
    expect(model.cells.map((c) => c.n)).toEqual([2, 4, 1]);
    expect(model.top).toBe(4);
    expect(model.origin).toBeNull();
  });

  it("finds a day cell for an instant with no event in it, from the same boundaries", () => {
    const gap = cellAt(model, Date.parse("2026-11-03T18:00:00Z"));
    expect(gap.n).toBe(0);
    expect(gap.t).toBe(Date.parse("2026-11-03T06:00:00Z"));
    expect(gap.end - gap.t).toBe(DAY);
  });
});

describe("houstonDayStart and houstonDayEnd", () => {
  it("finds the midnight of an ordinary day", () => {
    expect(houstonDayStart(Date.parse("2026-06-02T22:22:00Z"))).toBe(Date.parse("2026-06-02T05:00:00Z"));
    expect(houstonDayEnd(Date.parse("2026-06-02T05:00:00Z"))).toBe(Date.parse("2026-06-03T05:00:00Z"));
  });

  it("finds the 23 hour day of the spring clock change and the 25 hour day of the fall one", () => {
    const spring = houstonDayStart(Date.parse("2026-03-08T18:00:00Z"));
    expect(spring).toBe(Date.parse("2026-03-08T06:00:00Z"));
    expect(houstonDayEnd(spring) - spring).toBe(23 * HOUR);
    const fall = houstonDayStart(Date.parse("2026-11-01T18:00:00Z"));
    expect(houstonDayEnd(fall) - fall).toBe(25 * HOUR);
  });

  it("answers an instant that is exactly a midnight with that midnight", () => {
    const midnight = Date.parse("2026-06-02T05:00:00Z");
    expect(houstonDayStart(midnight)).toBe(midnight);
    expect(houstonDayStart(midnight - 1)).toBe(Date.parse("2026-06-01T05:00:00Z"));
  });
});

describe("buildCountModel under a solo", () => {
  const events: Ev[] = [
    { row: 2, t: EVENING + 5 * 60_000 },
    { row: 2, t: EVENING + 40 * 60_000 },
    { row: 2, t: EVENING + 45 * 60_000 },
    { row: 2, t: MORNING + 10 * 60_000 },
    ...eventsAt(EVENING + 50 * 60_000, 8),
  ];
  const { set, ticks } = makeSet(30, events, [{ row: 2, t: EVENING, value: 5 }], HOUR);

  it("counts the soloed row's own events in the hour", () => {
    const m = buildCountModel({ set, ticks, soloKey: "v:g2" });
    expect(cellAt(m, EVENING + 22 * 60_000).n).toBe(4);
    expect(cellAt(m, MORNING).n).toBe(1);
    expect(m.soloed).toBe(true);
  });

  it("takes the scale from that row's largest count over the whole case", () => {
    expect(buildCountModel({ set, ticks, soloKey: "v:g2" }).top).toBe(4);
  });

  it("gives an hour in which the row has no event a count of 0", () => {
    expect(cellAt(buildCountModel({ set, ticks, soloKey: "v:g2" }), EVENING + 4 * HOUR).n).toBe(0);
  });

  it("counts the whole case when the solo names no named row", () => {
    const whole = buildCountModel({ set, ticks, soloKey: null });
    expect(buildCountModel({ set, ticks, soloKey: "v:nobody" })).toEqual(whole);
    expect(whole.soloed).toBe(false);
  });
});

describe("buildCountModel, nothing to draw", () => {
  it("has no cell and a top of 0 for a story with no named rows", () => {
    const { set, ticks } = makeSet(0, [], [], 0);
    const m = buildCountModel({ set, ticks, soloKey: null });
    expect(m.cells).toEqual([]);
    expect(m.top).toBe(0);
    expect(m.named).toBe(0);
  });

  it("has a top of 0 for named rows with nothing in any hour", () => {
    const { set, ticks } = makeSet(4, [], [], 0);
    expect(buildCountModel({ set, ticks, soloKey: null }).top).toBe(0);
  });
});

describe("barHeightPx", () => {
  it("fills the plot with the busiest step of the whole case", () => {
    expect(barHeightPx(9, 9)).toBe(SMALL_PLOT_PX);
    expect(barHeightPx(21, 21)).toBe(SMALL_PLOT_PX);
  });

  it("draws two different counts at two different heights, even over a tall scale", () => {
    expect(barHeightPx(3, 9)).toBe(8);
    expect(barHeightPx(1, 9)).not.toBe(barHeightPx(3, 9));
    // No rounding to whole px: on a scale over 24, counts 1 and 2 still differ.
    expect(barHeightPx(1, 128)).not.toBe(barHeightPx(2, 128));
  });

  it("draws 0 for a count of 0 and for a scale of 0", () => {
    expect(barHeightPx(0, 9)).toBe(0);
    expect(barHeightPx(3, 0)).toBe(0);
  });
});

describe("the printed words", () => {
  it("prints the number at the line out of all the named rows", () => {
    expect(countFigureText(15, 30, false)).toBe("15 of 30");
    expect(countFigureText(21, 30, false)).toBe("21 of 30");
    expect(countFigureText(9, 128, false)).toBe("9 of 128");
  });

  it("prints the soloed row's count alone", () => {
    expect(countFigureText(3, 30, true)).toBe("3");
  });

  it("prints the name cell's range, 0 to the largest count of the whole case", () => {
    expect(countLabelText(HOUR, 24, false)).toBe("Active / 1H · 0 to 24");
    expect(countLabelText(DAY, 9, false)).toBe("Active / 1D · 0 to 9");
    expect(countLabelText(DAY, 4, false)).toBe("Active / 1D · 0 to 4");
  });

  it("says events under a solo, and leaves the step out when it is not a whole unit", () => {
    expect(countLabelText(HOUR, 3, true)).toBe("Events / 1H · 0 to 3");
    expect(countLabelText(0, 24, false)).toBe("Active · 0 to 24");
  });
});

describe("the module's source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "rows-small.ts"), "utf8");

  it("reads no clock", () => {
    expect(source).not.toMatch(/Date\.now|new Date\(\)|performance\.now|setInterval|setTimeout/);
  });

  it("holds no code of the option that was not picked", () => {
    expect(source.toLowerCase()).not.toContain(["stri", "pe"].join(""));
  });
});
