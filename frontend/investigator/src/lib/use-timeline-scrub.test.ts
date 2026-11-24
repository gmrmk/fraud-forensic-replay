import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useTimelineScrub } from "./use-timeline-scrub";
import { usePlayhead } from "../store/playhead";

// Minimal synthetic keyboard event - only the fields the handler reads.
function keyEvent(key: string, shiftKey = false): KeyboardEvent<HTMLDivElement> {
  return { key, shiftKey, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLDivElement>;
}

describe("useTimelineScrub keyboard (item O transport-family key model)", () => {
  beforeEach(() => {
    // span 1000, playhead at the midpoint (frac 0.5). Window == full bounds here,
    // so window-relative stepping equals the global span.
    usePlayhead.setState({
      minTime: 100,
      maxTime: 1100,
      windowMin: 100,
      windowMax: 1100,
      playhead: 600,
      isPlaying: true,
      isScrubbing: false,
    });
  });

  it("ArrowRight nudges the playhead forward 1% of span", () => {
    const { result } = renderHook(() => useTimelineScrub());
    result.current.onTrackKeyDown(keyEvent("ArrowRight"));
    expect(usePlayhead.getState().playhead).toBe(610); // (0.5 + 0.01) * 1000 + 100
  });

  it("Shift+ArrowRight nudges 10% of span", () => {
    const { result } = renderHook(() => useTimelineScrub());
    result.current.onTrackKeyDown(keyEvent("ArrowRight", true));
    expect(usePlayhead.getState().playhead).toBe(700); // 0.6
  });

  it("ArrowLeft nudges back 1% of span", () => {
    const { result } = renderHook(() => useTimelineScrub());
    result.current.onTrackKeyDown(keyEvent("ArrowLeft"));
    expect(usePlayhead.getState().playhead).toBe(590); // 0.49
  });

  it("Home jumps to the window start; End jumps to the window end", () => {
    const { result } = renderHook(() => useTimelineScrub());
    result.current.onTrackKeyDown(keyEvent("Home"));
    expect(usePlayhead.getState().playhead).toBe(100);
    result.current.onTrackKeyDown(keyEvent("End"));
    expect(usePlayhead.getState().playhead).toBe(1100);
  });

  it("clamps at the far boundary (ArrowRight at the window end does not overshoot)", () => {
    usePlayhead.setState({ playhead: 1100 });
    const { result } = renderHook(() => useTimelineScrub());
    result.current.onTrackKeyDown(keyEvent("ArrowRight"));
    expect(usePlayhead.getState().playhead).toBe(1100);
  });

  it("pauses playback on a keyboard scrub (playhead is the truth, not the clock)", () => {
    const { result } = renderHook(() => useTimelineScrub());
    result.current.onTrackKeyDown(keyEvent("ArrowRight"));
    expect(usePlayhead.getState().isPlaying).toBe(false);
  });

  it("ignores a non-scrub key (no preventDefault, no playhead move)", () => {
    const { result } = renderHook(() => useTimelineScrub());
    const e = keyEvent("a");
    result.current.onTrackKeyDown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(usePlayhead.getState().playhead).toBe(600);
  });

  it("no-ops when the window has zero span (guards a divide-by-zero)", () => {
    usePlayhead.setState({ minTime: 500, maxTime: 500, windowMin: 500, windowMax: 500, playhead: 500 });
    const { result } = renderHook(() => useTimelineScrub());
    const e = keyEvent("ArrowRight");
    result.current.onTrackKeyDown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(usePlayhead.getState().playhead).toBe(500);
  });
});

// Minimal synthetic mouse event - only the fields the handler reads.
function mouseEvent(init: { button: number; ctrlKey?: boolean; clientX?: number }): MouseEvent<HTMLDivElement> {
  return { clientX: 250, ctrlKey: false, ...init } as unknown as MouseEvent<HTMLDivElement>;
}

describe("useTimelineScrub mouse press (a right press opens a menu and never seeks)", () => {
  beforeEach(() => {
    // Window [100, 1100], playhead 600, playing. A press at x = 250 on a track 0..1000 wide
    // would seek to 350, so any seek shows.
    usePlayhead.setState({
      minTime: 100,
      maxTime: 1100,
      windowMin: 100,
      windowMax: 1100,
      playhead: 600,
      isPlaying: true,
      isScrubbing: false,
    });
  });

  function mounted() {
    const hook = renderHook(() => useTimelineScrub());
    const el = document.createElement("div");
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 32, width: 1000, height: 32, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    hook.result.current.trackRef.current = el;
    return hook;
  }

  function press(hook: ReturnType<typeof mounted>, e: MouseEvent<HTMLDivElement>): void {
    act(() => hook.result.current.onTrackMouseDown(e));
  }

  function untouched(): void {
    const s = usePlayhead.getState();
    expect(s.playhead).toBe(600);
    expect(s.isPlaying).toBe(true);
    expect(s.isScrubbing).toBe(false);
  }

  it("a right press (button 2) leaves the playhead, playback and the scrub as they were", () => {
    const hook = mounted();
    press(hook, mouseEvent({ button: 2 }));
    untouched();
  });

  it("a ctrl press with the main button (a Mac's right click) leaves them too", () => {
    const hook = mounted();
    press(hook, mouseEvent({ button: 0, ctrlKey: true }));
    untouched();
  });

  it("a middle press (button 1) leaves them too, by choice", () => {
    const hook = mounted();
    press(hook, mouseEvent({ button: 1 }));
    untouched();
  });

  it("the main button alone still seeks, pauses and starts the scrub", () => {
    const hook = mounted();
    press(hook, mouseEvent({ button: 0 }));
    const s = usePlayhead.getState();
    expect(s.playhead).toBe(350); // 100 + 0.25 * 1000
    expect(s.isPlaying).toBe(false);
    expect(s.isScrubbing).toBe(true);
    act(() => usePlayhead.getState().setScrubbing(false));
  });
});

describe("useTimelineScrub - window-relative (zoom)", () => {
  beforeEach(() => {
    // Global span 0..1000, zoomed into the window [400, 500] (span 100).
    usePlayhead.setState({
      minTime: 0,
      maxTime: 1000,
      windowMin: 400,
      windowMax: 500,
      playhead: 450,
      isPlaying: false,
      isScrubbing: false,
    });
  });

  it("ArrowRight steps 1% of the WINDOW span, not the global span", () => {
    const { result } = renderHook(() => useTimelineScrub());
    result.current.onTrackKeyDown(keyEvent("ArrowRight"));
    // 1% of window span (100) = 1 → 451, NOT 1% of global (1000) = 10 → 460.
    expect(usePlayhead.getState().playhead).toBe(451);
  });

  it("Shift+ArrowRight steps 10% of the window span", () => {
    const { result } = renderHook(() => useTimelineScrub());
    result.current.onTrackKeyDown(keyEvent("ArrowRight", true));
    expect(usePlayhead.getState().playhead).toBe(460); // 450 + 0.10 * 100
  });

  it("End jumps to the window's right edge (windowMax), not the global maxTime", () => {
    const { result } = renderHook(() => useTimelineScrub());
    result.current.onTrackKeyDown(keyEvent("End"));
    expect(usePlayhead.getState().playhead).toBe(500); // windowMax, not 1000
  });

  it("Home jumps to the window's left edge (windowMin)", () => {
    const { result } = renderHook(() => useTimelineScrub());
    result.current.onTrackKeyDown(keyEvent("Home"));
    expect(usePlayhead.getState().playhead).toBe(400); // windowMin, not 0
  });
});

describe("useTimelineScrub - scrubDomain: 'bounds' (the whole span)", () => {
  beforeEach(() => {
    // Global span 0..1000, but ZOOMED into the window [400, 500]. Bounds mode
    // must IGNORE the window and scrub against minTime/maxTime (the full span).
    usePlayhead.setState({
      minTime: 0,
      maxTime: 1000,
      windowMin: 400,
      windowMax: 500,
      playhead: 500,
      isPlaying: false,
      isScrubbing: false,
    });
  });

  it("ArrowRight steps 1% of the FULL bounds span, not the window span", () => {
    const { result } = renderHook(() => useTimelineScrub("bounds"));
    result.current.onTrackKeyDown(keyEvent("ArrowRight"));
    // frac = (500 - 0) / 1000 = 0.5 → +1% → 0.51 → 510, NOT window-relative.
    expect(usePlayhead.getState().playhead).toBe(510);
  });

  it("End jumps to maxTime (the global right edge), not windowMax", () => {
    const { result } = renderHook(() => useTimelineScrub("bounds"));
    result.current.onTrackKeyDown(keyEvent("End"));
    expect(usePlayhead.getState().playhead).toBe(1000); // maxTime, not windowMax 500
  });

  it("Home jumps to minTime (the global left edge), not windowMin", () => {
    const { result } = renderHook(() => useTimelineScrub("bounds"));
    result.current.onTrackKeyDown(keyEvent("Home"));
    expect(usePlayhead.getState().playhead).toBe(0); // minTime, not windowMin 400
  });

  it("defaults to 'window' when no scrubDomain is passed (preserves case behavior)", () => {
    const { result } = renderHook(() => useTimelineScrub());
    result.current.onTrackKeyDown(keyEvent("End"));
    expect(usePlayhead.getState().playhead).toBe(500); // windowMax, the existing default
  });
});

describe("useTimelineScrub step and mark keys", () => {
  beforeEach(() => {
    usePlayhead.setState({ minTime: 100, maxTime: 1100, windowMin: 100, windowMax: 1100, playhead: 600, isPlaying: false, isScrubbing: false });
  });

  it("comma and period step back and forward through the callback", () => {
    const onStep = vi.fn();
    const { result } = renderHook(() => useTimelineScrub("window", { onStep }));
    const back = keyEvent(",");
    result.current.onTrackKeyDown(back);
    result.current.onTrackKeyDown(keyEvent("."));
    expect(onStep.mock.calls).toEqual([[-1], [1]]);
    expect(back.preventDefault).toHaveBeenCalled();
    expect(usePlayhead.getState().playhead).toBe(600); // the callback moves the playhead, not the hook
  });

  it("m drops or lifts a mark through the callback", () => {
    const onMark = vi.fn();
    const { result } = renderHook(() => useTimelineScrub("window", { onMark }));
    result.current.onTrackKeyDown(keyEvent("m"));
    result.current.onTrackKeyDown(keyEvent("M"));
    expect(onMark).toHaveBeenCalledTimes(2);
  });

  it("without callbacks the keys do nothing and are not swallowed", () => {
    const { result } = renderHook(() => useTimelineScrub());
    for (const key of [",", ".", "m"]) {
      const e = keyEvent(key);
      result.current.onTrackKeyDown(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(usePlayhead.getState().playhead).toBe(600);
  });

  it("a browser shortcut on the same key is left alone", () => {
    const onMark = vi.fn();
    const onStep = vi.fn();
    const { result } = renderHook(() => useTimelineScrub("window", { onStep, onMark }));
    for (const mod of ["ctrlKey", "metaKey", "altKey"]) {
      result.current.onTrackKeyDown({ ...keyEvent("m"), [mod]: true } as never);
      result.current.onTrackKeyDown({ ...keyEvent("."), [mod]: true } as never);
    }
    expect(onMark).not.toHaveBeenCalled();
    expect(onStep).not.toHaveBeenCalled();
  });

  it("Escape is not handled", () => {
    const { result } = renderHook(() => useTimelineScrub("window", { onStep: vi.fn(), onMark: vi.fn() }));
    const e = keyEvent("Escape");
    result.current.onTrackKeyDown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

describe("useTimelineScrub keys pressed on a button inside the track (a mark or a pile member)", () => {
  beforeEach(() => {
    usePlayhead.setState({
      minTime: 100,
      maxTime: 1100,
      windowMin: 100,
      windowMax: 1100,
      playhead: 600,
      isPlaying: true,
      isScrubbing: false,
      markA: null,
      markB: null,
    });
  });

  /** A key pressed on a button inside the track, or on the track itself, as React hands it to the track's handler. */
  function pressOn(key: string, onTrack: boolean): KeyboardEvent<HTMLDivElement> {
    const track = document.createElement("div");
    const mark = document.createElement("button");
    track.appendChild(mark);
    const target = onTrack ? track : mark;
    return { key, shiftKey: false, target, currentTarget: track, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLDivElement>;
  }

  it.each(["Home", "End", "ArrowRight", "ArrowLeft", "PageUp", "PageDown", "m", "n", ".", ","])(
    "%s leaves the playhead, playback, the A and B marks and the note opener as they were",
    (key) => {
      const onMark = vi.fn();
      const onNote = vi.fn();
      const onStep = vi.fn();
      const { result } = renderHook(() => useTimelineScrub("window", { onMark, onNote, onStep }));
      const e = pressOn(key, false);
      result.current.onTrackKeyDown(e);
      const s = usePlayhead.getState();
      expect(s.playhead).toBe(600);
      expect(s.isPlaying).toBe(true);
      expect(s.markA).toBeNull();
      expect(s.markB).toBeNull();
      expect(onMark).not.toHaveBeenCalled();
      expect(onNote).not.toHaveBeenCalled();
      expect(onStep).not.toHaveBeenCalled();
      expect(e.preventDefault).not.toHaveBeenCalled();
    },
  );

  it("the same keys pressed on the track itself act as they do today", () => {
    const onMark = vi.fn();
    const onNote = vi.fn();
    const { result } = renderHook(() => useTimelineScrub("window", { onMark, onNote }));
    result.current.onTrackKeyDown(pressOn("m", true));
    result.current.onTrackKeyDown(pressOn("n", true));
    expect(onMark).toHaveBeenCalledTimes(1);
    expect(onNote).toHaveBeenCalledTimes(1);
    result.current.onTrackKeyDown(pressOn("ArrowRight", true));
    expect(usePlayhead.getState().playhead).toBe(610);
    expect(usePlayhead.getState().isPlaying).toBe(false);
    result.current.onTrackKeyDown(pressOn("Home", true));
    expect(usePlayhead.getState().playhead).toBe(100);
  });
});
