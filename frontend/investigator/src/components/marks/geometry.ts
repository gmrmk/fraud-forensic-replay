/**
 * The investigator's marks, as numbers: the width of a plate from its parts, where a Timeline plate's
 * anchor may sit so the plate stays whole inside the track, and the globe ring's size round a dot's
 * halo. Pure: no element, no store, no clock.
 *
 * The widths a pile of marks needs are here too: the plate that several close marks join, the row a
 * folded-out member hangs in, and the pixel twin of the Timeline's CSS clamp.
 *
 * What this file does not do: it reads no field of a record (the caller passes a magnitude value and
 * its maximum), and it decides nothing about which marks are close (that is `mark-piles.ts`).
 */
import { ML_DOT_RADIUS, ML_HALO_RADIUS, ML_MAGNITUDE_MAX_RADIUS } from "../../lib/globe/constants";
import { markerScale } from "../../lib/magnitude";
import type { Disposition } from "../../lib/marks/types";
import { MARK_GLYPH_PX } from "./glyphs";

/** The plate's padding on every side, and the gap between its parts, in px. */
export const PLATE_PAD_PX = 2;
export const PLATE_GAP_PX = 2;
/**
 * The width of one figure of a mono 8 px count. A deliberate estimate: a figure of the app's mono font
 * at 8 px is under 5 px wide, and the plate's width only decides where the Timeline holds it inside
 * the track, so a half pixel of error shows nowhere.
 */
export const DIGIT_PX = 5;
/** From the plate's left edge to the lens's centre: the padding plus half the 9 px lens. */
export const GLYPH_ORIGIN_PX = 6.5;
/** The lens's centre is held at least this far inside both ends of the track. */
export const EDGE_PX = 7;
/** The globe handle's length and the gap between the dot's halo and the ring's centre line, in px. */
export const HANDLE_PX = 7;
export const RING_GAP_PX = 1;
/** A row under the track and the unfold step: the 13 px plate and a 2 px gap. */
export const ROW_STEP_PX = 15;
/** Two plates within this many px of each other touch, and so join. */
export const TOUCH_PX = 2;
/**
 * The Timeline diamond's size and how far its centre is held inside both ends of the track. The
 * diamond layer holds its own twins of both (its hit box is `HIT_PX`, 14, and the edge is half of it);
 * a test pins this one to that hit box so the two cannot drift.
 */
export const NOTE_EDGE_PX = 7;
export const DIAMOND_PX = 11;

export interface PlateParts {
  /** True when the plate leads with the lens. */
  lens: boolean;
  /** The count of the record's notes; no part at 0. */
  notes: number;
  disposition: Disposition;
  pinned: boolean;
}

/** The plate's width: the padding, the parts that are present, and the gap between neighbours. */
export function plateWidth(p: PlateParts): number {
  const parts: number[] = [];
  if (p.lens) parts.push(MARK_GLYPH_PX);
  if (p.notes >= 1) parts.push(String(p.notes).length * DIGIT_PX);
  if (p.disposition !== "none") parts.push(MARK_GLYPH_PX);
  if (p.pinned) parts.push(MARK_GLYPH_PX);
  const inner = parts.reduce((sum, w) => sum + w, 0) + PLATE_GAP_PX * Math.max(0, parts.length - 1);
  return PLATE_PAD_PX * 2 + inner;
}

export interface PileParts {
  /** True when the plate leads with the lens. */
  lens: boolean;
  /** How many records the pile holds. */
  records: number;
  /** How many decision glyphs the plate shows (each one once, at most three). */
  glyphs: number;
  pinned: boolean;
}

/**
 * The width of a pile plate: the padding, the lens when present, the sign and the figure of the
 * count, one 9 px glyph for each decision shown, the pin when any member is pinned, and the gap
 * between neighbours. The sign is counted as one more figure wide (a deliberate estimate, like
 * `DIGIT_PX`: the plate's width only decides where a pile holds inside the track and which marks
 * touch it, so a fraction of a pixel shows nowhere).
 */
export function pileWidth(p: PileParts): number {
  const parts: number[] = [];
  if (p.lens) parts.push(MARK_GLYPH_PX);
  parts.push((1 + String(p.records).length) * DIGIT_PX);
  for (let i = 0; i < p.glyphs; i++) parts.push(MARK_GLYPH_PX);
  if (p.pinned) parts.push(MARK_GLYPH_PX);
  const inner = parts.reduce((sum, w) => sum + w, 0) + PLATE_GAP_PX * (parts.length - 1);
  return PLATE_PAD_PX * 2 + inner;
}

/**
 * The CSS `left` of a Timeline plate's anchor (the lens's centre): `pct` percent along the track,
 * held at least `EDGE_PX` from the left end and far enough from the right end that the plate's right
 * edge stays inside the track. A plate hangs with its left edge `GLYPH_ORIGIN_PX` before the anchor,
 * so its right edge is `width - GLYPH_ORIGIN_PX` after it; a plate narrower than that bound's
 * `EDGE_PX` keeps the lens at least `EDGE_PX` from the right end too.
 */
export function timelineLeft(pct: number, width: number): string {
  const right = Math.max(EDGE_PX, width - GLYPH_ORIGIN_PX);
  return `clamp(${EDGE_PX}px, ${pct}%, calc(100% - ${right}px))`;
}

/**
 * The px twin of `timelineLeft`: where the lens's centre of a plate of `width` lies, in px from the
 * track's left edge, when its anchor is `pct` percent along a track `trackPx` wide. The same clamp as
 * the CSS: at least `EDGE_PX` in, and far enough from the right end that the plate's right edge stays
 * inside the track. It lets the layout of close marks know where plates lie without asking the page.
 */
export function lensPx(pct: number, width: number, trackPx: number): number {
  return Math.max(EDGE_PX, Math.min((pct / 100) * trackPx, trackPx - Math.max(EDGE_PX, width - GLYPH_ORIGIN_PX)));
}

/**
 * The radius of the halo the data draws round a record's dot, in px. A built-in kind's halo is
 * `ML_HALO_RADIUS`; a manifest kind's is 6 plus its dot (`max(3, 22 x scale)`), the globe layer's own
 * formula. Pass null for a built-in kind, or the record's magnitude value and the kind's maximum.
 */
export function haloRadius(magnitude: { value: number | null; max: number } | null): number {
  if (magnitude === null) return ML_HALO_RADIUS;
  const dot = Math.max(ML_DOT_RADIUS, ML_MAGNITUDE_MAX_RADIUS * markerScale(magnitude.value, magnitude.max));
  return ML_HALO_RADIUS - ML_DOT_RADIUS + dot;
}

/** The ring's radius: its centre line sits `RING_GAP_PX` outside the halo. */
export const ringRadius = (halo: number): number => halo + RING_GAP_PX;

/** The handle's far end, up and left of the ring's centre by this much on each axis. */
export const handleOffset = (ring: number): number => (ring + HANDLE_PX) / Math.SQRT2;
