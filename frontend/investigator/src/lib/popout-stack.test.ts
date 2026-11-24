import { describe, it, expect } from "vitest";
import { nextPopoutOffset, POPOUT_COLUMN, POPOUT_DX, POPOUT_GAP, POPOUT_WIDTH } from "./popout-stack";
import { COLLAPSED_BAR_HEIGHT } from "./window-dims";

const AMS = { lng: 4.9041, lat: 52.3676 };
const HOU = { lng: -95.5262, lat: 29.7371 };

describe("nextPopoutOffset", () => {
  it("first popout at a pin centres its header on the pin, to the right", () => {
    expect(nextPopoutOffset(AMS, [])).toEqual({ dx: POPOUT_DX, dy: -COLLAPSED_BAR_HEIGHT / 2 });
  });

  it("the next one goes below the lowest window already tethered to the same pin", () => {
    const tethered = [
      { lngLat: AMS, offset: { dx: 32, dy: -17 }, collapsed: false, height: 190 },
      { lngLat: AMS, offset: { dx: 60, dy: 300 }, collapsed: false, height: 190 }, // dragged lower
    ];
    expect(nextPopoutOffset(AMS, tethered)).toEqual({ dx: POPOUT_DX, dy: 300 + 190 + POPOUT_GAP });
  });

  it("a collapsed window counts as its header bar only", () => {
    const tethered = [{ lngLat: AMS, offset: { dx: 32, dy: -17 }, collapsed: true, height: 260 }];
    expect(nextPopoutOffset(AMS, tethered).dy).toBe(-17 + COLLAPSED_BAR_HEIGHT + POPOUT_GAP);
  });

  it("wraps to a second column when the next window would cross the viewport bottom", () => {
    // A tall popout and a section at a mid-screen pin on a 1080px viewport.
    const tethered = [
      { lngLat: HOU, offset: { dx: 32, dy: -17 }, collapsed: false, height: 280 },
      { lngLat: HOU, offset: { dx: 32, dy: 271 }, collapsed: false, height: 190 },
    ];
    // 1920x1080 with the Inspector from x=1588 and the bottom stack from y=908.
    const fit = { height: 280, pinX: 600, pinY: 300, right: 1588, bottom: 908 };
    expect(nextPopoutOffset(HOU, tethered, fit)).toEqual({ dx: POPOUT_DX + POPOUT_COLUMN, dy: -COLLAPSED_BAR_HEIGHT / 2 });
    // A window short enough to end above the bottom stack still fits under the first two (300 + 469 + 60 <= 908).
    expect(nextPopoutOffset(HOU, tethered, { ...fit, height: 60 })).toEqual({ dx: POPOUT_DX, dy: 271 + 190 + POPOUT_GAP });
    // The second column stacks downward like the first.
    const wrapped = [...tethered, { lngLat: HOU, offset: { dx: POPOUT_DX + POPOUT_COLUMN, dy: -17 }, collapsed: false, height: 280 }];
    expect(nextPopoutOffset(HOU, wrapped, { ...fit, height: 190 })).toEqual({ dx: POPOUT_DX + POPOUT_COLUMN, dy: 263 + POPOUT_GAP });
  });

  it("stops a column above the case bottom stack, not the viewport bottom", () => {
    const one = [{ lngLat: HOU, offset: { dx: 32, dy: -17 }, collapsed: false, height: 280 }];
    // 540 + 271 + 190 = 1001: inside a 1080px viewport, but under a bottom stack that starts at 908.
    const fit = { height: 190, pinX: 600, pinY: 540, right: 1588, bottom: 908 };
    expect(nextPopoutOffset(HOU, one, fit).dx).toBe(POPOUT_DX + POPOUT_COLUMN);
  });

  it("a pin near the Inspector opens its column on the pin's left", () => {
    const fit = { height: 280, pinX: 1400, pinY: 300, right: 1588, bottom: 908 };
    expect(nextPopoutOffset(HOU, [], fit)).toEqual({ dx: -POPOUT_DX - POPOUT_WIDTH, dy: -COLLAPSED_BAR_HEIGHT / 2 });
  });

  it("once the room right of the pin is full, columns mirror to the pin's left", () => {
    const left = -POPOUT_DX - POPOUT_WIDTH;
    const fit = { height: 280, pinX: 1000, pinY: 540, right: 1588, bottom: 908 };
    const full = [
      { lngLat: HOU, offset: { dx: 32, dy: -17 }, collapsed: false, height: 280 },
      { lngLat: HOU, offset: { dx: 32, dy: 271 }, collapsed: false, height: 190 },
    ];
    // 1000 + 340 + 300 > 1588: no second column on the right.
    expect(nextPopoutOffset(HOU, full, fit)).toEqual({ dx: left, dy: -COLLAPSED_BAR_HEIGHT / 2 });
    const mirrored = [...full, { lngLat: HOU, offset: { dx: left, dy: -17 }, collapsed: false, height: 280 }];
    expect(nextPopoutOffset(HOU, mirrored, { ...fit, height: 60 })).toEqual({ dx: left, dy: 263 + POPOUT_GAP });
  });

  it("when every column in the free area is full, the window opens over the first column's top", () => {
    // Visible and draggable beats tidy: stacking lower would put its header under the bottom stack.
    const fit = { height: 280, pinX: 400, pinY: 400, right: 800, bottom: 700 };
    const full = [
      { lngLat: HOU, offset: { dx: 32, dy: -17 }, collapsed: false, height: 280 },
      { lngLat: HOU, offset: { dx: -POPOUT_DX - POPOUT_WIDTH, dy: -17 }, collapsed: false, height: 280 },
    ];
    expect(nextPopoutOffset(HOU, full, fit)).toEqual({ dx: POPOUT_DX, dy: -COLLAPSED_BAR_HEIGHT / 2 });
  });

  it("windows tethered to another pin do not push the column", () => {
    const tethered = [{ lngLat: HOU, offset: { dx: 32, dy: -17 }, collapsed: false, height: 260 }];
    expect(nextPopoutOffset(AMS, tethered)).toEqual({ dx: POPOUT_DX, dy: -COLLAPSED_BAR_HEIGHT / 2 });
  });
});
