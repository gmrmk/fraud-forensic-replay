// The open bar's layout numbers, in px unless the name says otherwise. One module, so the rows,
// the head, the lane and the depth blocks read the same figure. The names carry no
// _PX suffix. Pure constants: no clock, no storage, no DOM.

/** The name column at the left of the open bar. The band, the track and the hours start after it. */
export const GUTTER = 148;

/** A row's height, which is also the pitch between rows. 24 px, so each per-row control reaches the 24 px
 *  target size of WCAG 2.5.8 by spacing. */
export const ROW = 24;

/** The rail the clock's tab rides, above the track. */
export const HEAD_RAIL = 18;

/** The width of the triangle that opens a row. */
export const OPEN = 14;

/** The height of an open row's line of nodes. */
export const LINE = 18;

/** The height of an open row's line of bars on a scale of its own (its range sits under its name). */
export const OWN_LINE = 30;

/** How many rows of the rows' list stay visible at the least: three whole rows and a half, so a
 *  list that goes on visibly goes on. 3.5 times ROW is 84 px. */
export const LIST_FLOOR_ROWS = 3.5;

/** The most lines a block of depth lines shows. It scrolls beyond. */
export const DEPTH_MAX_LINES = 6;

/** The open bar's share of the window's inner height, counting the bar's panel. */
export const OPEN_BAR_SHARE = 0.42;

/** The class every focus ring on the bar takes. One focus token, the app's alarm channel, which
 *  is the colour of the app's own base outline (index.css, `:focus-visible`), and not the raw
 *  accent (`--r1-rgb`), which falls under 3:1 on the glass in neon light and in the deuteranopia,
 *  protanopia and tritanopia dark modes. The ring clears 3:1 in all twelve cells of six colour
 *  modes and two themes (bar-metrics.test.ts). The colour is a look change and is open to the
 *  owner. */
export const BAR_FOCUS_RING = "outline-none focus-visible:ring-1 focus-visible:ring-signal";
