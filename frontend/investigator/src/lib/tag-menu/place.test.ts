// frontend/investigator/src/lib/tag-menu/place.test.ts
// Where the tag menu sits (PLAN-tag-menu 4.5, C1.2). Every expected number is worked by hand from the
// rule: left = the door's left (flipped to the door's right edge minus the width when it would pass
// view.w - 8); top = the door's top minus the height minus 3 (or the door's bottom plus 3 when that is
// under 8); at a point, left = x (flipped to x - w) and top = y (flipped to y - h when it would pass
// view.h - 8); then each axis is clamped into [8, view - size - 8], and the near edge wins when the
// menu is larger than the view.
import { describe, expect, it } from "vitest";
import { MENU_EDGE, MENU_GAP, placeMenu } from "./place";

const SIZE = { w: 208, h: 120 };
const VIEW = { w: 1440, h: 900 };
const tick = (left: number, top: number) => ({ left, top, right: left + 12, bottom: top + 12 });
const at = (x: number, y: number) => ({ at: { x, y }, rect: null });
const onTick = (left: number, top: number) => ({ at: { x: left + 6, y: top + 6 }, rect: tick(left, top) });

describe("placeMenu constants", () => {
  it("keeps 8 px from every edge and 3 px from the node", () => {
    expect(MENU_EDGE).toBe(8);
    expect(MENU_GAP).toBe(3);
  });
});

describe("placeMenu over a Timeline node", () => {
  it("sits above the node, left edges level, when there is room (top 400 - 120 - 3 = 277)", () => {
    expect(placeMenu(SIZE, VIEW, onTick(600, 400))).toEqual({ left: 600, top: 277, side: "right" });
  });

  it("goes below the node when the room above is under 8 px (node 20 px from the top: 32 + 3 = 35)", () => {
    expect(placeMenu(SIZE, VIEW, onTick(600, 20))).toEqual({ left: 600, top: 35, side: "right" });
  });

  it("stays above when the room above is exactly 8 px (131 - 120 - 3 = 8)", () => {
    expect(placeMenu(SIZE, VIEW, onTick(600, 131)).top).toBe(8);
  });

  it("flips to the node's right edge, with side left, when the node is 100 px from the right edge (1352 - 208 = 1144)", () => {
    expect(placeMenu(SIZE, VIEW, onTick(1340, 400))).toEqual({ left: 1144, top: 277, side: "left" });
  });

  it("does not flip when the menu ends exactly 8 px from the right edge (1224 + 208 = 1432)", () => {
    expect(placeMenu(SIZE, VIEW, onTick(1224, 400))).toEqual({ left: 1224, top: 277, side: "right" });
  });
});

describe("placeMenu at a point", () => {
  it("opens right and down of the point when there is room, side right", () => {
    expect(placeMenu(SIZE, VIEW, at(300, 200))).toEqual({ left: 300, top: 200, side: "right" });
  });

  it("flips up near the bottom (850 + 120 is past 892, so 850 - 120 = 730)", () => {
    expect(placeMenu(SIZE, VIEW, at(300, 850))).toEqual({ left: 300, top: 730, side: "right" });
  });

  it("flips left near the right edge, side left (1400 - 208 = 1192)", () => {
    expect(placeMenu(SIZE, VIEW, at(1400, 200))).toEqual({ left: 1192, top: 200, side: "left" });
  });

  it("flips both ways in the far corner", () => {
    expect(placeMenu(SIZE, VIEW, at(1430, 890))).toEqual({ left: 1222, top: 770, side: "left" });
  });
});

describe("placeMenu clamps 8 px inside the view", () => {
  const SMALL = { w: 300, h: 200 };

  it("clamps up to the near edges (x 100 flips left to -108; y 3 stays and is lifted to 8; in a 300 by 200 view)", () => {
    expect(placeMenu(SIZE, SMALL, at(100, 3))).toEqual({ left: 8, top: 8, side: "left" });
  });

  it("clamps down to the far edges (x 400, y 300: 192 and 180 clamp to 84 and 72)", () => {
    expect(placeMenu(SIZE, SMALL, at(400, 300))).toEqual({ left: 84, top: 72, side: "left" });
  });

  it("clamps a node's menu too (node at 100, 100: flipped left to -96 and below to 115, clamped to 8 and 72)", () => {
    expect(placeMenu(SIZE, SMALL, onTick(100, 100))).toEqual({ left: 8, top: 72, side: "left" });
  });

  it("a menu measured twice as large (text size 200) still clamps: 416 by 240 in a 300 by 200 view lets the near edge win", () => {
    const BIG = { w: 416, h: 240 };
    expect(placeMenu(BIG, SMALL, at(100, 100))).toEqual({ left: 8, top: 8, side: "left" });
  });

  it("a menu twice as large in the full view flips and clamps by its own size (1312 - 416 = 896; top 500 - 240 - 3 = 257)", () => {
    const BIG = { w: 416, h: 240 };
    expect(placeMenu(BIG, VIEW, onTick(1300, 500))).toEqual({ left: 896, top: 257, side: "left" });
    expect(placeMenu(BIG, VIEW, onTick(600, 500))).toEqual({ left: 600, top: 257, side: "right" });
  });
});
