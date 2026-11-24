/**
 * Tests for the playhead store - focuses on Spec 3 additions: direction-
 * aware wrap (rewind), pauseAndZeroRate, and the `playbackRate === 0`
 * default-to-1× behavior in play() and toggle().
 */
import { describe, it, expect, beforeEach } from "vitest";
import { usePlayhead, MIN_WINDOW_MS } from "./playhead";

beforeEach(() => {
  usePlayhead.setState({
    playhead: 5_000,
    minTime: 0,
    maxTime: 10_000,
    isPlaying: false,
    playbackRate: 1,
    isScrubbing: false,
  });
});

describe("playhead.play() - strict stop-at-boundary", () => {
  it("forward + at maxTime: replays from the start", () => {
    usePlayhead.setState({ playhead: 10_000, playbackRate: 1 });
    usePlayhead.getState().play();
    expect(usePlayhead.getState().playhead).toBe(0); // reset to minTime
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("forward + mid-window: starts playing", () => {
    usePlayhead.setState({ playhead: 5_000, playbackRate: 1 });
    usePlayhead.getState().play();
    expect(usePlayhead.getState().playhead).toBe(5_000);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("reverse + at minTime: replays from the end", () => {
    usePlayhead.setState({ playhead: 0, playbackRate: -1 });
    usePlayhead.getState().play();
    expect(usePlayhead.getState().playhead).toBe(10_000); // reset to maxTime
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("reverse + mid-window: starts playing", () => {
    usePlayhead.setState({ playhead: 5_000, playbackRate: -1 });
    usePlayhead.getState().play();
    expect(usePlayhead.getState().playhead).toBe(5_000);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("rate=0 + at maxTime: defaults rate to 1× and replays from the start", () => {
    usePlayhead.setState({ playhead: 10_000, playbackRate: 0 });
    usePlayhead.getState().play();
    expect(usePlayhead.getState().playbackRate).toBe(1); // defaulted
    expect(usePlayhead.getState().playhead).toBe(0); // reset to minTime
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("rate=0 + mid-window: defaults rate to 1× and starts playing", () => {
    usePlayhead.setState({ playhead: 5_000, playbackRate: 0 });
    usePlayhead.getState().play();
    expect(usePlayhead.getState().playbackRate).toBe(1);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("reverse + at maxTime: starts playing (still room to go backward)", () => {
    usePlayhead.setState({ playhead: 10_000, playbackRate: -4 });
    usePlayhead.getState().play();
    expect(usePlayhead.getState().playhead).toBe(10_000);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("forward + at minTime: starts playing (still room to go forward)", () => {
    usePlayhead.setState({ playhead: 0, playbackRate: 4 });
    usePlayhead.getState().play();
    expect(usePlayhead.getState().playhead).toBe(0);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });
});

describe("playhead.toggle() - strict stop-at-boundary", () => {
  it("when playing: just pauses", () => {
    usePlayhead.setState({ isPlaying: true, playbackRate: 4 });
    usePlayhead.getState().toggle();
    expect(usePlayhead.getState().isPlaying).toBe(false);
  });

  it("when paused + forward + at maxTime: replays from the start", () => {
    usePlayhead.setState({ playhead: 10_000, isPlaying: false, playbackRate: 1 });
    usePlayhead.getState().toggle();
    expect(usePlayhead.getState().playhead).toBe(0);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("when paused + reverse + at minTime: replays from the end", () => {
    usePlayhead.setState({ playhead: 0, isPlaying: false, playbackRate: -1 });
    usePlayhead.getState().toggle();
    expect(usePlayhead.getState().playhead).toBe(10_000);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });

  it("when paused + rate=0 + mid-window: defaults to 1× and toggles to play", () => {
    usePlayhead.setState({ playhead: 5_000, isPlaying: false, playbackRate: 0 });
    usePlayhead.getState().toggle();
    expect(usePlayhead.getState().playbackRate).toBe(1);
    expect(usePlayhead.getState().isPlaying).toBe(true);
  });
});

describe("playhead.pauseAndZeroRate()", () => {
  it("sets isPlaying=false AND playbackRate=0 atomically", () => {
    usePlayhead.setState({ isPlaying: true, playbackRate: 4 });
    usePlayhead.getState().pauseAndZeroRate();
    expect(usePlayhead.getState().isPlaying).toBe(false);
    expect(usePlayhead.getState().playbackRate).toBe(0);
  });

  it("works from a paused state with non-zero rate", () => {
    usePlayhead.setState({ isPlaying: false, playbackRate: -4 });
    usePlayhead.getState().pauseAndZeroRate();
    expect(usePlayhead.getState().isPlaying).toBe(false);
    expect(usePlayhead.getState().playbackRate).toBe(0);
  });
});

describe("playhead.setRate() - accepts new value range", () => {
  it("accepts negative rates", () => {
    usePlayhead.getState().setRate(-4);
    expect(usePlayhead.getState().playbackRate).toBe(-4);
  });

  it("accepts fractional rates", () => {
    usePlayhead.getState().setRate(0.5);
    expect(usePlayhead.getState().playbackRate).toBe(0.5);
  });

  it("accepts zero", () => {
    usePlayhead.getState().setRate(0);
    expect(usePlayhead.getState().playbackRate).toBe(0);
  });
});

describe("playhead window - zoom transport (Phase 1)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const Y = 365 * DAY;
  const LO = 0;
  const HI = 2 * Y; // a 2-year span - the real per-account case

  beforeEach(() => {
    usePlayhead.getState().setBounds(LO, HI);
  });

  it("setBounds initializes the window to the full span", () => {
    const s = usePlayhead.getState();
    expect(s.windowMin).toBe(LO);
    expect(s.windowMax).toBe(HI);
  });

  it("setWindow sets the visible window", () => {
    usePlayhead.getState().setWindow(Y, Y + 30 * DAY);
    const s = usePlayhead.getState();
    expect(s.windowMin).toBe(Y);
    expect(s.windowMax).toBe(Y + 30 * DAY);
  });

  it("setWindow clamps to the data bounds", () => {
    usePlayhead.getState().setWindow(-1000, HI + 1000);
    const s = usePlayhead.getState();
    expect(s.windowMin).toBe(LO);
    expect(s.windowMax).toBe(HI);
  });

  it("setWindow enforces the minimum window width", () => {
    usePlayhead.getState().setWindow(Y, Y + 100); // 0.1s, below the floor
    const s = usePlayhead.getState();
    expect(s.windowMax - s.windowMin).toBeGreaterThanOrEqual(MIN_WINDOW_MS);
  });

  it("allows a sub-minute window so the axis can reach hh:mm:ss", () => {
    usePlayhead.getState().setWindow(Y, Y + 45_000); // 45s - well above the 5s floor
    const s = usePlayhead.getState();
    expect(s.windowMax - s.windowMin).toBe(45_000);
  });

  it("snapToStart snaps to the window start (windowMin), not the data start (TML-17)", () => {
    usePlayhead.getState().setWindow(Y, Y + 45_000); // a narrow window mid-span
    usePlayhead.getState().snapToStart();
    const s = usePlayhead.getState();
    expect(s.playhead).toBe(s.windowMin);
    expect(s.playhead).not.toBe(LO); // the visible-window start, not minTime
  });

  it("zoomAt zooms in around the center, keeping the center stationary", () => {
    usePlayhead.getState().zoomAt(Y, 0.5); // halve the span around the 1-year mark
    const s = usePlayhead.getState();
    expect(s.windowMax - s.windowMin).toBe(Y); // 2Y * 0.5
    expect(s.windowMin).toBe(Y - Y / 2);
    expect(s.windowMax).toBe(Y + Y / 2);
  });

  it("zoomAt clamps the zoomed window to the data bounds", () => {
    usePlayhead.getState().setWindow(LO, HI / 4);
    usePlayhead.getState().zoomAt(LO, 4); // zoom out past the left edge
    const s = usePlayhead.getState();
    expect(s.windowMin).toBeGreaterThanOrEqual(LO);
    expect(s.windowMax).toBeLessThanOrEqual(HI);
  });

  it("panWindow shifts the window, preserving its width", () => {
    usePlayhead.getState().setWindow(Y, Y + 30 * DAY);
    usePlayhead.getState().panWindow(10 * DAY);
    const s = usePlayhead.getState();
    expect(s.windowMin).toBe(Y + 10 * DAY);
    expect(s.windowMax - s.windowMin).toBe(30 * DAY);
  });

  it("panWindow pins at the data bounds without shrinking", () => {
    usePlayhead.getState().setWindow(HI - 30 * DAY, HI);
    usePlayhead.getState().panWindow(100 * DAY); // way past the end
    const s = usePlayhead.getState();
    expect(s.windowMax).toBe(HI);
    expect(s.windowMax - s.windowMin).toBe(30 * DAY); // width preserved
  });

  it("zoomToFit resets the window to the full span", () => {
    usePlayhead.getState().setWindow(Y, Y + DAY);
    usePlayhead.getState().zoomToFit();
    const s = usePlayhead.getState();
    expect(s.windowMin).toBe(LO);
    expect(s.windowMax).toBe(HI);
  });

  it("holds the invariant minTime <= windowMin < windowMax <= maxTime", () => {
    usePlayhead.getState().setWindow(-5000, HI + 5000);
    const s = usePlayhead.getState();
    expect(s.minTime).toBeLessThanOrEqual(s.windowMin);
    expect(s.windowMin).toBeLessThan(s.windowMax);
    expect(s.windowMax).toBeLessThanOrEqual(s.maxTime);
  });

  it("window ops never move the playhead or playback state (decoupled)", () => {
    usePlayhead.setState({ playhead: Y, isPlaying: false });
    usePlayhead.getState().zoomAt(Y, 0.5);
    usePlayhead.getState().panWindow(DAY);
    expect(usePlayhead.getState().playhead).toBe(Y);
    expect(usePlayhead.getState().isPlaying).toBe(false);
  });
});

describe("marks", () => {
  beforeEach(() => usePlayhead.setState({ markA: null, markB: null }));

  it("toggleMark drops A, then B, at the playhead", () => {
    usePlayhead.setState({ playhead: 2_000 });
    usePlayhead.getState().toggleMark();
    usePlayhead.setState({ playhead: 6_000 });
    usePlayhead.getState().toggleMark();
    expect([usePlayhead.getState().markA, usePlayhead.getState().markB]).toEqual([2_000, 6_000]);
  });

  it("toggleMark on a mark lifts it", () => {
    usePlayhead.setState({ markA: 2_000, markB: 6_000, playhead: 2_000 });
    usePlayhead.getState().toggleMark();
    expect([usePlayhead.getState().markA, usePlayhead.getState().markB]).toEqual([6_000, null]);
  });

  it("setMarks sets both, and new bounds clear them (a mark belongs to one dataset)", () => {
    usePlayhead.getState().setMarks(1_000, 3_000);
    expect([usePlayhead.getState().markA, usePlayhead.getState().markB]).toEqual([1_000, 3_000]);
    usePlayhead.getState().setBounds(0, 50_000);
    expect([usePlayhead.getState().markA, usePlayhead.getState().markB]).toEqual([null, null]);
  });

  it("dropping a mark does not move the playhead or start playback", () => {
    usePlayhead.setState({ playhead: 4_000, isPlaying: false });
    usePlayhead.getState().toggleMark();
    expect(usePlayhead.getState().playhead).toBe(4_000);
    expect(usePlayhead.getState().isPlaying).toBe(false);
  });
});

describe("an opening position (from a share link)", () => {
  beforeEach(() =>
    usePlayhead.setState({ minTime: 0, maxTime: 0, windowMin: 0, windowMax: 0, playhead: 0, markA: null, markB: null, opening: null }),
  );

  it("given before the data is known, it is where the bounds land instead of the end", () => {
    usePlayhead.getState().openAt({ playhead: 7_000, a: 2_000, b: 9_000, window: [1_000, 8_000] });
    usePlayhead.getState().setBounds(0, 10_000);
    const s = usePlayhead.getState();
    expect([s.playhead, s.markA, s.markB, s.windowMin, s.windowMax]).toEqual([7_000, 2_000, 9_000, 1_000, 8_000]);
  });

  it("survives a second arrival of bounds (the case data, then the file-backed kinds)", () => {
    usePlayhead.getState().openAt({ playhead: 7_000 });
    usePlayhead.getState().setBounds(0, 10_000);
    usePlayhead.getState().setBounds(0, 12_000);
    expect(usePlayhead.getState().playhead).toBe(7_000);
  });

  it("given after the data is known, it applies at once", () => {
    usePlayhead.getState().setBounds(0, 10_000);
    usePlayhead.getState().openAt({ playhead: 4_000 });
    expect(usePlayhead.getState().playhead).toBe(4_000);
  });

  it("is clamped into the data", () => {
    usePlayhead.getState().openAt({ playhead: 99_000, a: -5, b: 50_000 });
    usePlayhead.getState().setBounds(0, 10_000);
    const s = usePlayhead.getState();
    expect([s.playhead, s.markA, s.markB]).toEqual([10_000, 0, 10_000]);
  });

  it("stands down once the playhead is moved: later bounds land at the end as before", () => {
    usePlayhead.getState().openAt({ playhead: 7_000, a: 2_000 });
    usePlayhead.getState().setBounds(0, 10_000);
    usePlayhead.getState().setPlayhead(3_000);
    usePlayhead.getState().setBounds(0, 10_000);
    const s = usePlayhead.getState();
    expect([s.playhead, s.markA, s.opening]).toEqual([10_000, null, null]);
  });

  it("without one, bounds land at the end with the full window and no marks", () => {
    usePlayhead.getState().setBounds(100, 900);
    const s = usePlayhead.getState();
    expect([s.playhead, s.windowMin, s.windowMax, s.markA, s.markB]).toEqual([900, 100, 900, null, null]);
  });
});

// widenBounds: the bounds grew because more of the same data arrived. It keeps what has been placed.
describe("widenBounds: the same data grew", () => {
  const reset = () =>
    usePlayhead.setState({
      minTime: 0,
      maxTime: 0,
      windowMin: 0,
      windowMax: 0,
      playhead: 0,
      markA: null,
      markB: null,
      opening: null,
      isPlaying: false,
      playbackRate: 1,
    });
  beforeEach(reset);

  it("with no bounds known it lands as setBounds does: the end, no marks, the whole span", () => {
    usePlayhead.setState({ markA: 1, markB: 2 });
    usePlayhead.getState().widenBounds(100, 900);
    const s = usePlayhead.getState();
    expect([s.minTime, s.maxTime]).toEqual([100, 900]);
    expect([s.playhead, s.windowMin, s.windowMax, s.markA, s.markB]).toEqual([900, 100, 900, null, null]);
  });

  it("with a standing opening it lands on the opening each time the bounds grow", () => {
    usePlayhead.getState().openAt({ playhead: 7_000, a: 2_000, b: 9_000, window: [1_000, 8_000] });
    usePlayhead.getState().widenBounds(0, 10_000);
    let s = usePlayhead.getState();
    expect([s.playhead, s.markA, s.markB, s.windowMin, s.windowMax]).toEqual([7_000, 2_000, 9_000, 1_000, 8_000]);
    usePlayhead.getState().widenBounds(0, 12_000);
    s = usePlayhead.getState();
    expect([s.playhead, s.markA, s.markB, s.windowMin, s.windowMax]).toEqual([7_000, 2_000, 9_000, 1_000, 8_000]);
    expect(s.opening).not.toBeNull();
  });

  it("keeps the playhead where it was and widens a whole-span window to the new whole span", () => {
    usePlayhead.getState().setBounds(0, 10_000);
    usePlayhead.getState().setPlayhead(3_000);
    usePlayhead.getState().widenBounds(0, 15_000);
    const s = usePlayhead.getState();
    expect([s.minTime, s.maxTime]).toEqual([0, 15_000]);
    expect(s.playhead).toBe(3_000);
    expect([s.windowMin, s.windowMax]).toEqual([0, 15_000]);
    expect(s.opening).toBeNull();
  });

  it("widens at the start as well: the playhead stays and the whole span follows", () => {
    usePlayhead.getState().setBounds(2_000, 10_000);
    usePlayhead.getState().setPlayhead(5_000);
    usePlayhead.getState().widenBounds(1_000, 12_000);
    const s = usePlayhead.getState();
    expect([s.minTime, s.maxTime, s.playhead, s.windowMin, s.windowMax]).toEqual([1_000, 12_000, 5_000, 1_000, 12_000]);
  });

  it("keeps the marks, and a mark that is not set stays null", () => {
    usePlayhead.getState().setBounds(0, 10_000);
    usePlayhead.getState().setMarks(2_000, 6_000);
    usePlayhead.getState().widenBounds(0, 15_000);
    expect([usePlayhead.getState().markA, usePlayhead.getState().markB]).toEqual([2_000, 6_000]);
    usePlayhead.getState().setMarks(4_000, null);
    usePlayhead.getState().widenBounds(0, 20_000);
    expect([usePlayhead.getState().markA, usePlayhead.getState().markB]).toEqual([4_000, null]);
  });

  it("keeps a zoomed window as it was", () => {
    usePlayhead.getState().setBounds(0, 10_000);
    usePlayhead.getState().setWindow(2_000, 8_000); // wider than MIN_WINDOW_MS, so setWindow keeps it as asked
    usePlayhead.getState().widenBounds(0, 15_000);
    const s = usePlayhead.getState();
    expect([s.windowMin, s.windowMax]).toEqual([2_000, 8_000]);
  });

  it("clamps a playhead and a mark that fall outside the new bounds, and a window with them", () => {
    usePlayhead.getState().setBounds(0, 10_000);
    usePlayhead.getState().setPlayhead(9_500);
    usePlayhead.getState().setMarks(500, 9_800);
    usePlayhead.getState().setWindow(8_000, 9_900);
    usePlayhead.getState().widenBounds(1_000, 9_000);
    const s = usePlayhead.getState();
    expect([s.playhead, s.markA, s.markB]).toEqual([9_000, 1_000, 9_000]);
    expect(s.windowMin).toBeGreaterThanOrEqual(1_000);
    expect(s.windowMax).toBeLessThanOrEqual(9_000);
    expect(s.windowMin).toBeLessThan(s.windowMax);
  });

  it("does not touch playback: isPlaying and the rate stay", () => {
    usePlayhead.getState().setBounds(0, 10_000);
    usePlayhead.setState({ isPlaying: true, playbackRate: -2 });
    usePlayhead.getState().widenBounds(0, 15_000);
    const s = usePlayhead.getState();
    expect([s.isPlaying, s.playbackRate]).toEqual([true, -2]);
  });

  // A pin on what must not change: setBounds is a new dataset and still lands at the end.
  it("setBounds after setPlayhead still lands at the end with no marks", () => {
    usePlayhead.getState().setBounds(0, 10_000);
    usePlayhead.getState().setPlayhead(3_000);
    usePlayhead.getState().setMarks(1_000, 2_000);
    usePlayhead.getState().setBounds(0, 15_000);
    const s = usePlayhead.getState();
    expect([s.playhead, s.markA, s.markB, s.windowMin, s.windowMax]).toEqual([15_000, null, null, 0, 15_000]);
  });
});
