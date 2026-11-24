// frontend/investigator/src/lib/head-edge.test.ts
// The two pure rules of the head: where the faint part
// starts and which side of the line a number stands on. The grids here are
// fixtures of the pure function, not a manifest: the manifest allows an hour step only.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIGURE_ADVANCE_EM, figureSide, figureWidthPx, headEdge } from "./head-edge";

const MIN = 60_000;
const HOUR = 3_600_000;
// Mon Jun 8 2026, midnight UTC: an hour edge in Houston too, because every offset is whole hours.
const FIRST = Date.parse("2026-06-08T00:00:00Z");
const hourGrid = { step: HOUR, firstBucketStart: FIRST };

describe("headEdge", () => {
  it("is the end of the hour the playhead is in", () => {
    // 5:22 PM in Houston is 22:22 UTC; the hour ends at 6:00 PM, 23:00 UTC.
    const at = Date.parse("2026-06-08T22:22:00Z");
    expect(headEdge(at, [hourGrid])).toBe(Date.parse("2026-06-08T23:00:00Z"));
  });

  it("puts the edge an hour on when the playhead is exactly on an hour edge", () => {
    // 6:00 PM is the start of the next hour, so its edge is 7:00 PM.
    const at = Date.parse("2026-06-08T23:00:00Z");
    expect(headEdge(at, [hourGrid])).toBe(Date.parse("2026-06-09T00:00:00Z"));
  });

  it("takes the latest end over the lanes, each on its own grid", () => {
    const quarter = { step: 15 * MIN, firstBucketStart: FIRST };
    const at = Date.parse("2026-06-08T22:22:00Z");
    // The 15 minute lane ends at 22:30, the hour lane at 23:00; the later one is the edge.
    expect(headEdge(at, [quarter, hourGrid])).toBe(Date.parse("2026-06-08T23:00:00Z"));
    expect(headEdge(at, [hourGrid, quarter])).toBe(Date.parse("2026-06-08T23:00:00Z"));
    // A 15 minute lane alone ends at 22:30.
    expect(headEdge(at, [quarter])).toBe(Date.parse("2026-06-08T22:30:00Z"));
  });

  it("reads a lane's grid from where its first bucket starts, not from the epoch", () => {
    // A grid that starts at :20 past the hour has its edges at :20.
    const shifted = { step: HOUR, firstBucketStart: FIRST + 20 * MIN };
    const at = Date.parse("2026-06-08T22:22:00Z");
    expect(headEdge(at, [shifted])).toBe(Date.parse("2026-06-08T23:20:00Z"));
  });

  it("is the playhead where the pack has no lane", () => {
    const at = Date.parse("2026-06-08T22:22:00Z");
    expect(headEdge(at, [])).toBe(at);
  });

  it("skips a grid whose step is not above zero", () => {
    const at = Date.parse("2026-06-08T22:22:00Z");
    expect(headEdge(at, [{ step: 0, firstBucketStart: FIRST }])).toBe(at);
    expect(headEdge(at, [{ step: -HOUR, firstBucketStart: FIRST }, hourGrid])).toBe(Date.parse("2026-06-08T23:00:00Z"));
  });

  it("holds before the first bucket, on the same grid", () => {
    const before = FIRST - 10 * MIN;
    expect(headEdge(before, [hourGrid])).toBe(FIRST);
  });

  it("reads 10:00 AM for a card story at 9:14 AM on 2026-05-21", () => {
    // 9:14 AM in Houston (CDT) is 14:14 UTC; the hour edge is 10:00 AM, 15:00 UTC.
    const first = Date.parse("2026-05-20T05:00:00Z");
    const at = Date.parse("2026-05-21T14:14:00Z");
    expect(headEdge(at, [{ step: HOUR, firstBucketStart: first }])).toBe(Date.parse("2026-05-21T15:00:00Z"));
  });
});

describe("figureWidthPx", () => {
  it("measures a figure from its characters, its padding and its gap", () => {
    // The widest figure of a lane's measures: 11 characters, 69.5 px of text, 78.5 px with the
    // 6 px of padding and the 3 px gap.
    expect(FIGURE_ADVANCE_EM).toBe(0.632);
    expect(figureWidthPx(11, 10, 6, 3)).toBeCloseTo(78.52, 2);
    // The lane's widest figure, 4,133.57: eight characters.
    expect(figureWidthPx(8, 10, 6, 3)).toBeCloseTo(59.56, 2);
  });
});

describe("figureSide", () => {
  // One bar of a one hour step, starting at FIRST. A 1,244 px plot with the line in the middle of
  // it leaves room on either side.
  const base = { barStart: FIRST, step: HOUR, linePx: 600, figurePx: 60, plotPx: 1244 };

  it("stands right of the line in the first half of its bar's step", () => {
    expect(figureSide({ ...base, playhead: FIRST + 0.25 * HOUR })).toBe("right");
    expect(figureSide({ ...base, playhead: FIRST })).toBe("right");
    expect(figureSide({ ...base, playhead: FIRST + HOUR / 2 - 1 })).toBe("right");
  });

  it("stands left of the line from exactly half the step", () => {
    expect(figureSide({ ...base, playhead: FIRST + 0.5 * HOUR })).toBe("left");
    expect(figureSide({ ...base, playhead: FIRST + 0.75 * HOUR })).toBe("left");
    expect(figureSide({ ...base, playhead: FIRST + HOUR - 1 })).toBe("left");
  });

  it("stands left near the plot's right end, where its width would pass it", () => {
    const quarter = FIRST + 0.25 * HOUR;
    // 1,230 + 60 passes 1,244: left even in the first half.
    expect(figureSide({ ...base, playhead: quarter, linePx: 1230 })).toBe("left");
    // 1,184 + 60 is exactly 1,244: it fits, so it stays right.
    expect(figureSide({ ...base, playhead: quarter, linePx: 1184 })).toBe("right");
    expect(figureSide({ ...base, playhead: quarter, linePx: 1185 })).toBe("left");
  });

  it("leaves the right-end rule out while the plot's width is not known", () => {
    const quarter = FIRST + 0.25 * HOUR;
    expect(figureSide({ ...base, playhead: quarter, linePx: 5000, plotPx: 0 })).toBe("right");
  });

  it("stands right in a step that is not above zero, unless the end passes", () => {
    expect(figureSide({ ...base, playhead: FIRST, step: 0 })).toBe("right");
  });

  it("changes side once in an hour, and not at every tick", () => {
    const sides: string[] = [];
    for (let t = FIRST; t < FIRST + HOUR; t += MIN) sides.push(figureSide({ ...base, playhead: t }));
    const changes = sides.filter((s, i) => i > 0 && s !== sides[i - 1]).length;
    expect(changes).toBe(1);
  });
});

// Section 8, the Must on the head's source: the new files read the playhead and nothing else.
// The needles are assembled from fragments so that this file passes its own scan, and so does
// the grep of the Done-check, which reads the test files in the head folder too.
describe("source of the head's files", () => {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const headDir = join(SRC, "components/timeline/head");
  const files = [
    ...["HeadSled", "HeadTab", "HeadRail", "HeadClock", "BarFold", "LaneFigure"].map((n) => join(headDir, `${n}.tsx`)),
    join(SRC, "lib/head-edge.ts"),
    join(SRC, "lib/tooltip-words/head.ts"),
  ];
  const tests = [
    ...readdirSync(headDir)
      .filter((n) => /\.test\./.test(n))
      .map((n) => join(headDir, n)),
    join(SRC, "lib/head-edge.test.ts"),
    join(SRC, "lib/tooltip-words/head.test.ts"),
  ];

  it("lists files that exist", () => {
    for (const f of [...files, ...tests]) expect(() => readFileSync(f, "utf8"), f).not.toThrow();
  });

  it("holds no clock, no timer and no moving style", () => {
    const needles = [
      ["Date", ".now"],
      ["set", "Interval"],
      ["set", "Timeout"],
      ["performance", ".now"],
      ["trans", "ition"],
      ["ani", "mate"],
      ["request", "AnimationFrame"],
    ].map((p) => p.join(""));
    for (const f of [...files, ...tests]) {
      const text = readFileSync(f, "utf8");
      for (const needle of needles) expect(text.includes(needle), `${f} holds ${needle}`).toBe(false);
    }
  });

  it("holds no word of one pack", () => {
    const needles = [
      ["au", "th"],
      ["sp", "end"],
      ["u", "sd"],
      ["us", "age"],
    ].map((p) => p.join(""));
    for (const f of [...files, ...tests]) {
      const text = readFileSync(f, "utf8").toLowerCase();
      for (const needle of needles) expect(text.includes(needle), `${f} holds ${needle}`).toBe(false);
    }
  });

  it("writes no colour literal: every rgb( is a token lookup", () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      const literals = [...text.matchAll(/rgba?\((?!var\()/g)];
      expect(literals, f).toHaveLength(0);
      expect(/#[0-9a-fA-F]{3,8}\b/.test(text), `${f} holds a hex colour`).toBe(false);
    }
  });
});
