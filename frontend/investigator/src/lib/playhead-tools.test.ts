/**
 * Stepping from event to event, the two marks, and the wording of the gap between them.
 * Pure: the timeline supplies its events in time order and acts on the answers.
 */
import { describe, it, expect } from "vitest";
import { formatGap, nextMarks, stepTarget, type StepEvent } from "./playhead-tools";

const S = 1000;
const MIN = 60 * S;
const HOUR = 60 * MIN;

// Five events; the middle three share one instant (a tie the step must walk one by one).
const events: StepEvent[] = [
  { id: "a", t: 100 },
  { id: "b1", t: 200 },
  { id: "b2", t: 200 },
  { id: "b3", t: 200 },
  { id: "c", t: 300 },
];

describe("stepTarget", () => {
  it("goes to the first event after the playhead, or the last before it", () => {
    expect(stepTarget(events, 150, null, 1)).toBe(1);
    expect(stepTarget(events, 150, null, -1)).toBe(0);
    expect(stepTarget(events, 250, null, 1)).toBe(4);
    expect(stepTarget(events, 250, null, -1)).toBe(3);
  });

  it("an event exactly at the playhead is not the next one", () => {
    expect(stepTarget(events, 100, null, 1)).toBe(1);
    expect(stepTarget(events, 300, null, -1)).toBe(3);
  });

  it("is null past either end, and for no events", () => {
    expect(stepTarget(events, 300, null, 1)).toBeNull();
    expect(stepTarget(events, 100, null, -1)).toBeNull();
    expect(stepTarget(events, 50, null, -1)).toBeNull();
    expect(stepTarget(events, 400, null, 1)).toBeNull();
    expect(stepTarget([], 100, null, 1)).toBeNull();
  });

  it("walks a tie one event at a time when the selected record sits at the playhead", () => {
    expect(stepTarget(events, 200, "b1", 1)).toBe(2);
    expect(stepTarget(events, 200, "b2", 1)).toBe(3);
    expect(stepTarget(events, 200, "b3", 1)).toBe(4); // leaves the tie
    expect(stepTarget(events, 200, "b3", -1)).toBe(2);
    expect(stepTarget(events, 200, "b1", -1)).toBe(0);
  });

  it("lets time decide when the selected record is not at the playhead or not an event", () => {
    expect(stepTarget(events, 150, "c", 1)).toBe(1);
    expect(stepTarget(events, 200, "nobody", 1)).toBe(4);
    expect(stepTarget(events, 200, null, -1)).toBe(0);
  });

  it("stops at the ends from a selected record too", () => {
    expect(stepTarget(events, 300, "c", 1)).toBeNull();
    expect(stepTarget(events, 100, "a", -1)).toBeNull();
  });
});

describe("nextMarks", () => {
  it("fills A, then B", () => {
    expect(nextMarks({ a: null, b: null }, 500)).toEqual({ a: 500, b: null });
    expect(nextMarks({ a: 500, b: null }, 900)).toEqual({ a: 500, b: 900 });
  });

  it("keeps the pair in time order whichever was dropped first", () => {
    expect(nextMarks({ a: 500, b: null }, 200)).toEqual({ a: 200, b: 500 });
  });

  it("lifts the mark the playhead sits on, and A takes B's place when A is lifted", () => {
    expect(nextMarks({ a: 500, b: 900 }, 900)).toEqual({ a: 500, b: null });
    expect(nextMarks({ a: 500, b: 900 }, 500)).toEqual({ a: 900, b: null });
    expect(nextMarks({ a: 500, b: null }, 500)).toEqual({ a: null, b: null });
  });

  it("with both set, moves the nearer mark", () => {
    expect(nextMarks({ a: 500, b: 900 }, 600)).toEqual({ a: 600, b: 900 });
    expect(nextMarks({ a: 500, b: 900 }, 800)).toEqual({ a: 500, b: 800 });
    expect(nextMarks({ a: 500, b: 900 }, 1200)).toEqual({ a: 500, b: 1200 });
    expect(nextMarks({ a: 500, b: 900 }, 100)).toEqual({ a: 100, b: 900 });
  });
});

describe("formatGap", () => {
  it("names the two largest units that matter", () => {
    expect(formatGap(0)).toBe("0 s");
    expect(formatGap(59 * S)).toBe("59 s");
    expect(formatGap(61 * S)).toBe("1 min 01 s");
    expect(formatGap(4 * MIN + 12 * S)).toBe("4 min 12 s");
    expect(formatGap(HOUR + 5 * MIN)).toBe("1 h 05 min");
    expect(formatGap(49 * HOUR)).toBe("2 d 1 h");
    expect(formatGap(3 * 24 * HOUR)).toBe("3 d 0 h");
  });

  it("rounds to the second and drops the sign: a gap is a length", () => {
    expect(formatGap(1499)).toBe("1 s");
    expect(formatGap(-(4 * MIN + 12 * S))).toBe("4 min 12 s");
  });
});
