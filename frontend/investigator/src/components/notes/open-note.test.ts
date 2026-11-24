/**
 * Where a new note window opens, and the time it takes (PLAN-tag-menu B.1). The window is 300 by 350
 * chrome pixels (`NOTE_WINDOW_DIMS`); at the text size 100 that is 300 by 350 window pixels, which is
 * what the cases below read. A door is the box of the control that opened the window.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { noteTimeFor, placeNoteWindow, type Box } from "./open-note";
import { infoOf } from "../../lib/notes/test-fixtures";
import { NOTE_TIME } from "./test-support";
import { chromeToWindowNow } from "../../store/text-size";
import { useTextSize } from "../../store/text-size";
import { NOTE_WINDOW_DIMS } from "../../lib/window-dims";

const VIEW = { w: 1440, h: 900 };
const W = 300;
const H = 350;
const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });

beforeEach(() => useTextSize.getState().setSize(100));
afterEach(() => useTextSize.getState().setSize(100));

describe("NOTE_WINDOW_DIMS", () => {
  it("is the measured size of an empty linked draft", () => {
    expect(NOTE_WINDOW_DIMS).toEqual({ width: 300, height: 350 });
  });
});

describe("placeNoteWindow", () => {
  it("over: left at the door's left, bottom 40 px above the door's bottom", () => {
    expect(placeNoteWindow(box(500, 600, 560, 630), "over", VIEW)).toEqual({ x: 500, y: 630 - H - 40 });
  });

  it("above: bottom 8 px over the door's top", () => {
    expect(placeNoteWindow(box(500, 600, 560, 630), "above", VIEW)).toEqual({ x: 500, y: 600 - 8 - H });
  });

  it("above flips below the door when there is no room over it", () => {
    expect(placeNoteWindow(box(500, 200, 560, 230), "above", VIEW)).toEqual({ x: 500, y: 230 + 8 });
  });

  it("below: top 8 px under the door's bottom", () => {
    expect(placeNoteWindow(box(500, 100, 560, 130), "below", VIEW)).toEqual({ x: 500, y: 130 + 8 });
  });

  it("right: left 8 px past the door's right, top at the door's top", () => {
    expect(placeNoteWindow(box(100, 300, 400, 340), "right", VIEW)).toEqual({ x: 408, y: 300 });
  });

  it("right flips to the left of the door at the right edge", () => {
    expect(placeNoteWindow(box(1100, 300, 1400, 340), "right", VIEW)).toEqual({ x: 1100 - 8 - W, y: 300 });
  });

  it("every side keeps the window 8 px inside both axes for a door at each corner", () => {
    const corners = [box(0, 0, 10, 10), box(1430, 0, 1440, 10), box(0, 890, 10, 900), box(1430, 890, 1440, 900)];
    for (const side of ["over", "above", "below", "right"] as const) {
      for (const door of corners) {
        const { x, y } = placeNoteWindow(door, side, VIEW);
        expect(x, `${side} ${door.left},${door.top} x`).toBeGreaterThanOrEqual(8);
        expect(y, `${side} ${door.left},${door.top} y`).toBeGreaterThanOrEqual(8);
        expect(x + W, `${side} ${door.left},${door.top} right edge`).toBeLessThanOrEqual(VIEW.w - 8);
        expect(y + H, `${side} ${door.left},${door.top} bottom edge`).toBeLessThanOrEqual(VIEW.h - 8);
      }
    }
  });

  it("clamps the exact spots at the corners", () => {
    expect(placeNoteWindow(box(0, 0, 10, 10), "over", VIEW)).toEqual({ x: 8, y: 8 });
    expect(placeNoteWindow(box(1430, 890, 1440, 900), "over", VIEW)).toEqual({ x: VIEW.w - W - 8, y: 900 - H - 40 });
    expect(placeNoteWindow(box(1430, 890, 1440, 900), "below", VIEW)).toEqual({ x: VIEW.w - W - 8, y: VIEW.h - H - 8 });
  });

  it("a view smaller than the window leaves it 8 px from the top left", () => {
    expect(placeNoteWindow(box(100, 100, 150, 150), "below", { w: 200, h: 200 })).toEqual({ x: 8, y: 8 });
  });

  it("measures the window at the text size now held", () => {
    useTextSize.getState().setSize(125);
    const h = chromeToWindowNow(NOTE_WINDOW_DIMS.height);
    expect(h).toBeGreaterThan(H);
    expect(placeNoteWindow(box(500, 600, 560, 630), "above", VIEW).y).toBe(Math.round(600 - 8 - h));
  });

  it("with no view given it reads the window's size", () => {
    const { x, y } = placeNoteWindow(box(5000, 5000, 5010, 5010), "over");
    expect(x).toBe(window.innerWidth - W - 8);
    expect(y).toBe(window.innerHeight - H - 8);
  });
});

describe("noteTimeFor", () => {
  it("is the record's own time, in whole milliseconds", () => {
    expect(noteTimeFor(infoOf({ time: NOTE_TIME + 0.4 }), 5)).toBe(NOTE_TIME);
    expect(noteTimeFor(infoOf({ time: NOTE_TIME + 0.6 }), 5)).toBe(NOTE_TIME + 1);
  });

  it("is the playhead when the record is not found or holds no time", () => {
    expect(noteTimeFor(null, NOTE_TIME + 0.6)).toBe(NOTE_TIME + 1);
    expect(noteTimeFor(infoOf({ time: null }), NOTE_TIME + 0.4)).toBe(NOTE_TIME);
  });
});
