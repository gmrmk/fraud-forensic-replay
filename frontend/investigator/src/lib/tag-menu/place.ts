// frontend/investigator/src/lib/tag-menu/place.ts
// Where the right-click menu sits and which side its tooltips take. Pure: sizes and the view are window
// pixels measured by the caller (the menu's shell is not zoomed, so its own offset size is already in
// window pixels), and nothing here reads the page, a store or a clock.
//
// What this file does not do: it measures nothing and draws nothing.
import type { Box } from "../../components/notes/open-note";

/** The menu keeps this far from every edge of the view. */
export const MENU_EDGE = 8;
/** The gap between a Timeline node and the menu above or below it. */
export const MENU_GAP = 3;

/** Near edge wins when the menu is larger than the view (as the note window's own clamp does). */
const clampAxis = (v: number, size: number, view: number): number => Math.max(MENU_EDGE, Math.min(v, view - size - MENU_EDGE));

/**
 * Top left of the menu in window px, and the side its tooltips take.
 * With a door box (a Timeline node): left is the box's left, flipped to the box's right edge minus the
 * width when the menu would pass view.w - 8; top is the box's top minus the height minus 3, or the box's
 * bottom plus 3 when that is under 8. With none: left is the point's x, flipped to x - w; top is the
 * point's y, flipped to y - h when the menu would pass view.h - 8. Then each axis is clamped into
 * [8, view - size - 8]. The side is "left" when the menu flipped left (its tooltips go to its left),
 * else "right"; a clamp does not change it.
 */
export function placeMenu(
  size: { w: number; h: number },
  view: { w: number; h: number },
  door: { at: { x: number; y: number }; rect: Box | null },
): { left: number; top: number; side: "left" | "right" } {
  const { rect, at } = door;
  let left: number;
  let top: number;
  let side: "left" | "right" = "right";
  if (rect) {
    left = rect.left;
    if (left + size.w > view.w - MENU_EDGE) {
      left = rect.right - size.w;
      side = "left";
    }
    top = rect.top - size.h - MENU_GAP;
    if (top < MENU_EDGE) top = rect.bottom + MENU_GAP;
  } else {
    left = at.x;
    if (left + size.w > view.w - MENU_EDGE) {
      left = at.x - size.w;
      side = "left";
    }
    top = at.y;
    if (top + size.h > view.h - MENU_EDGE) top = at.y - size.h;
  }
  return { left: clampAxis(left, size.w, view.w), top: clampAxis(top, size.h, view.h), side };
}
