/**
 * Where a new popout sits relative to its pin: a column to the right of the pin, each new
 * window below the lowest window already in that column at the same pin. A window that would
 * cross into the case bottom stack starts the next column. Columns stay left of the Inspector:
 * when the room right of the pin is used up they mirror to the pin's left. Pure; offsets are the
 * screen-space tether offsets the flagged-window anchor already uses.
 *
 * ponytail: heights are estimates (window-dims.ts), and the free area is measured once, when the
 * window opens. A later camera move carries the tethered stack with its pin, over the Inspector or
 * the bottom stack if the pin travels there. Upgrade path: re-place a pin's stack on moveend.
 */
import { COLLAPSED_BAR_HEIGHT } from "./window-dims";
import type { LngLat } from "./node-anchor";

export const POPOUT_DX = 32;
export const POPOUT_GAP = 8;
/** The popout max width (WindowFrame `wide`). */
export const POPOUT_WIDTH = 300;
/** Column pitch: the popout width plus the gap. */
export const POPOUT_COLUMN = POPOUT_WIDTH + POPOUT_GAP;
const FIRST_DY = -COLLAPSED_BAR_HEIGHT / 2;

export interface TetheredWindow {
  lngLat: LngLat;
  offset: { dx: number; dy: number };
  collapsed: boolean;
  height: number;
}

/** The new window's estimated height, its pin on screen, and the free area it must land in:
 *  left of `right` (the Inspector's left edge) and above `bottom` (the bottom stack's top). */
export interface PopoutFit {
  height: number;
  pinX: number;
  pinY: number;
  right: number;
  bottom: number;
}

const samePin = (a: LngLat, b: LngLat) =>
  Math.abs(a.lng - b.lng) < 1e-6 && Math.abs(a.lat - b.lat) < 1e-6;

/** Nearest column on the grid: 0, 1, ... rightward; -1, -2, ... for the mirrored columns. */
const columnOf = (dx: number) => Math.round((dx - POPOUT_DX) / POPOUT_COLUMN);

/** Column offsets that fit the free area: rightward first, then mirrored to the pin's left. */
function columns(fit?: PopoutFit): number[] {
  if (!fit) return [POPOUT_DX];
  const cols: number[] = [];
  for (let dx = POPOUT_DX; fit.pinX + dx + POPOUT_WIDTH <= fit.right; dx += POPOUT_COLUMN) cols.push(dx);
  for (let dx = -POPOUT_DX - POPOUT_WIDTH; fit.pinX + dx >= 0; dx -= POPOUT_COLUMN) cols.push(dx);
  return cols.length > 0 ? cols : [POPOUT_DX];
}

/** Without `fit` (no projection available) the first column grows downward unbounded. */
export function nextPopoutOffset(
  at: LngLat,
  tethered: readonly TetheredWindow[],
  fit?: PopoutFit,
): { dx: number; dy: number } {
  const here = tethered.filter((t) => samePin(t.lngLat, at));
  const cols = columns(fit);
  for (const dx of cols) {
    const inCol = here.filter((t) => columnOf(t.offset.dx) === columnOf(dx));
    if (inCol.length === 0) return { dx, dy: FIRST_DY };
    const bottom = Math.max(
      ...inCol.map((t) => t.offset.dy + (t.collapsed ? COLLAPSED_BAR_HEIGHT : t.height)),
    );
    const dy = bottom + POPOUT_GAP;
    if (!fit || fit.pinY + dy + fit.height <= fit.bottom) return { dx, dy };
  }
  // Every column in the free area is full: open over the first one's top, where the window is
  // visible and draggable, rather than below the bottom stack.
  return { dx: cols[0], dy: FIRST_DY };
}
