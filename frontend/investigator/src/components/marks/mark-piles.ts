/**
 * The investigator's marks that lie close together: which of them join one plate, and what that plate
 * shows. Under the Timeline's track, marks are swept in time order and a plate that would touch the
 * one before it joins it; on the globe, marks within the data's own reach of a pile's first mark join
 * one plate, and rings that lie on one another draw as one ring. Pure: positions come in as numbers
 * (px of the track, px of the map) and nothing is read from a store, an element or a clock.
 *
 * A pile is derived from the marks every time it is asked for; nothing here is kept, and whether a
 * pile is unfolded is the component's own state.
 *
 * What this file does not do: it draws nothing, projects nothing, reads no field of a record (a
 * member is a key, a time, a pin and a decision), and does not import the data's capsule piles (that
 * file is not this piece's; `GLOBE_REACH` and the join rule are a twin of it, pinned by a test).
 */
import type { Disposition, SetDisposition } from "../../lib/marks/types";
import {
  DIAMOND_PX,
  GLYPH_ORIGIN_PX,
  NOTE_EDGE_PX,
  TOUCH_PX,
  handleOffset,
  lensPx,
  pileWidth,
  plateWidth,
} from "./geometry";

/** The decisions in the order a pile plate shows their glyphs: check, cross, hourglass. */
export const DISPOSITION_ORDER: readonly SetDisposition[] = ["pass", "fail", "wait"];

/** One mark of a pile, as one surface sees it. */
export interface PileMember {
  /** `recordKey` of the record. */
  key: string;
  /** The record's time, or null for a record with none. */
  time: number | null;
  pinned: boolean;
  disposition: Disposition;
  /** This surface's level for the mark is "dim" (ahead of the playhead). */
  dim: boolean;
  /** The record's window is open. */
  open: boolean;
}

export interface PileGlyph {
  disposition: SetDisposition;
  /** Every member carrying this decision is dim. */
  dim: boolean;
}

/** What a pile plate shows. */
export interface PileFace {
  /** `members.length`; a pile always holds two or more. */
  records: number;
  /** One glyph for each decision a member carries, in `DISPOSITION_ORDER`. */
  glyphs: PileGlyph[];
  /** Any member is pinned. */
  pinned: boolean;
  pinnedCount: number;
  /** How many members carry each decision. */
  counts: Record<SetDisposition, number>;
  /** Every member is dim. */
  dim: boolean;
  /** Any member's window is open. */
  open: boolean;
}

export function pileFace(members: readonly PileMember[]): PileFace {
  const counts: Record<SetDisposition, number> = { pass: 0, fail: 0, wait: 0 };
  const lit: Record<SetDisposition, boolean> = { pass: false, fail: false, wait: false };
  let pinnedCount = 0;
  let open = false;
  let dim = members.length > 0;
  for (const m of members) {
    if (m.disposition !== "none") {
      counts[m.disposition] += 1;
      if (!m.dim) lit[m.disposition] = true;
    }
    if (m.pinned) pinnedCount += 1;
    if (m.open) open = true;
    if (!m.dim) dim = false;
  }
  const glyphs: PileGlyph[] = [];
  for (const d of DISPOSITION_ORDER) if (counts[d] > 0) glyphs.push({ disposition: d, dim: !lit[d] });
  return { records: members.length, glyphs, pinned: pinnedCount > 0, pinnedCount, counts, dim, open };
}

/** Code-unit order, never `localeCompare`: the same order the record keys are stored in. */
const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Time order with a record that has no time after those that do. */
function byTime(a: PileMember, b: PileMember): number {
  if (a.time === null || b.time === null) return a.time === b.time ? 0 : a.time === null ? 1 : -1;
  return a.time - b.time;
}

/** The order of an unfolded column: pinned first, then time (untimed after timed), then key. */
export function memberOrder<T extends PileMember>(members: readonly T[]): T[] {
  return [...members].sort((a, b) => Number(b.pinned) - Number(a.pinned) || byTime(a, b) || byKey(a.key, b.key));
}

/** The order marks are swept in; the first of a pile is its anchor: time (untimed after timed), then key. */
export function joinOrder<T extends PileMember>(members: readonly T[]): T[] {
  return [...members].sort((a, b) => byTime(a, b) || byKey(a.key, b.key));
}

// ---------------------------------------------------------------------------------------------
// Under the Timeline's track
// ---------------------------------------------------------------------------------------------

/** A mark as the Timeline sees it: it has a time, a place along the track, and a count of its notes. */
export interface TrackMark extends PileMember {
  time: number;
  /** Percent along the track, as `timelineLeft` takes it. */
  pct: number;
  /** How many notes link the record; a single plate prints it, a pile never does. */
  notes: number;
}
/** A free or plain note's diamond: only its place matters to a plate. */
export interface TrackNote {
  key: string;
  pct: number;
}
/**
 * A plate in row one, with its left and right edge in px from the track's left edge. A pile's members
 * are in join order, so `members[0]` is the anchor the pile hangs at; the component puts a column in
 * `memberOrder`.
 */
export type TrackPlate<M extends TrackMark> =
  | { type: "single"; mark: M; left: number; right: number }
  | { type: "pile"; key: string; members: M[]; pct: number; width: number; face: PileFace; left: number; right: number };
export interface TrackLayout<M extends TrackMark> {
  /** Row one, left to right (time order). No two plates lie within `TOUCH_PX` of each other. */
  plates: TrackPlate<M>[];
  /** Which row a diamond hangs in, by note key: 1 when a row-one plate would touch it. */
  diamondRow: ReadonlyMap<string, 0 | 1>;
}

/** The decisions a group carries, one bit each, so a join keeps a running set instead of a recount. */
const BIT: Record<SetDisposition, number> = { pass: 1, fail: 2, wait: 4 };
const bitsIn = (mask: number): number => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);

interface Group<M extends TrackMark> {
  members: M[];
  mask: number;
  pinned: boolean;
  width: number;
  left: number;
  right: number;
}

/** A group's width and place: one mark's own plate, or the pile plate hanging at the first mark. */
function place<M extends TrackMark>(g: Group<M>, trackPx: number): void {
  const anchor = g.members[0];
  g.width =
    g.members.length === 1
      ? plateWidth({ lens: true, notes: anchor.notes, disposition: anchor.disposition, pinned: anchor.pinned })
      : pileWidth({ lens: true, records: g.members.length, glyphs: bitsIn(g.mask), pinned: g.pinned });
  g.left = lensPx(anchor.pct, g.width, trackPx) - GLYPH_ORIGIN_PX;
  g.right = g.left + g.width;
}

const groupOf = <M extends TrackMark>(m: M, trackPx: number): Group<M> => {
  const g: Group<M> = {
    members: [m],
    mask: m.disposition === "none" ? 0 : BIT[m.disposition],
    pinned: m.pinned,
    width: 0,
    left: 0,
    right: 0,
  };
  place(g, trackPx);
  return g;
};

/**
 * Where the plates under the track lie, and which row each diamond hangs in.
 *
 * Marks are swept in join order. A mark joins the plate before it when its own plate would start less
 * than `TOUCH_PX` after that plate ends (a gap of exactly 2 px stays two plates). A joined group is
 * one pile plate, as wide as its glyphs make it and hanging at its first mark, so a wider pile reaches
 * further and may pull the next mark in. Where the track's right end holds a widened pile left, the
 * pile may come to touch the plate before it, and the two are merged in turn, so no two plates in row
 * one ever lie within 2 px. Before the track is measured (`trackPx` of 0 or less) nothing piles.
 *
 * A diamond hangs one row lower when a plate in row one lies within 2 px of it. Diamonds are never
 * piled and may lie on one another.
 */
export function trackLayout<M extends TrackMark>(marks: readonly M[], notes: readonly TrackNote[], trackPx: number): TrackLayout<M> {
  const ordered = joinOrder(marks);
  const measured = trackPx > 0;
  const stack: Group<M>[] = [];
  for (const m of ordered) {
    stack.push(groupOf(m, trackPx));
    // Merge the newest group into the one before while they touch. A merge can widen the one before
    // and move it left against the track's end, so the check goes on until they clear.
    while (measured && stack.length >= 2) {
      const top = stack[stack.length - 1];
      const prev = stack[stack.length - 2];
      if (top.left >= prev.right + TOUCH_PX) break;
      stack.pop();
      for (const x of top.members) prev.members.push(x);
      prev.mask |= top.mask;
      prev.pinned = prev.pinned || top.pinned;
      place(prev, trackPx);
    }
  }
  const plates: TrackPlate<M>[] = stack.map((g) =>
    g.members.length === 1
      ? { type: "single", mark: g.members[0], left: g.left, right: g.right }
      : {
          type: "pile",
          key: `pile:${g.members[0].key}`,
          members: g.members,
          pct: g.members[0].pct,
          width: g.width,
          face: pileFace(g.members),
          left: g.left,
          right: g.right,
        },
  );
  return { plates, diamondRow: measured ? diamondRows(notes, plates, trackPx) : new Map(notes.map((n) => [n.key, 0 as const])) };
}

/**
 * Each diamond's row. The plates are sorted by both edges (the merge above leaves a gap of 2 px or
 * more between neighbours), so the one plate that could touch a diamond is found by binary search and
 * a tick costs O(notes log plates).
 */
function diamondRows<M extends TrackMark>(notes: readonly TrackNote[], plates: readonly TrackPlate<M>[], trackPx: number): Map<string, 0 | 1> {
  const rows = new Map<string, 0 | 1>();
  for (const n of notes) {
    const x = Math.max(NOTE_EDGE_PX, Math.min((n.pct / 100) * trackPx, trackPx - NOTE_EDGE_PX));
    const lo = x - DIAMOND_PX / 2;
    const hi = x + DIAMOND_PX / 2;
    // The first plate whose right edge, a touch further, passes the diamond's left edge.
    let a = 0;
    let b = plates.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (plates[mid].right + TOUCH_PX > lo) b = mid;
      else a = mid + 1;
    }
    rows.set(n.key, a < plates.length && plates[a].left < hi + TOUCH_PX ? 1 : 0);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// On the globe
// ---------------------------------------------------------------------------------------------

/**
 * How far a mark may lie from a pile's first mark and still join it: the data's own reach for its
 * capsule piles (`GlobeBadgeLayer`'s `REACH`). A twin, not an import (that file is not this piece's);
 * a test feeds the same points to the data's `pileItems` and compares the groups.
 */
export const GLOBE_REACH = { x: 44, y: 16 } as const;
/** Two rings whose centres lie within this many px on both axes, and of one radius, draw as one. */
export const RING_MERGE_PX = 2;
/** How far a plate hangs up and left of a point that draws no ring: the single plate's own offset. */
const NO_RING_CORNER_PX = 7;

type LngLat = { lng: number; lat: number };

/** A mark on the globe's near side, after projection (px of the map, as the page's chrome measures them). */
export interface GlobePoint extends PileMember {
  x: number;
  y: number;
  lngLat: LngLat;
  /** The record's own dot is drawn, so the mark draws a ring round it (`view.dot` and not a decision). */
  ring: boolean;
  /** The ring's radius in px. */
  radius: number;
}
/** One ring to draw: the head's place, one radius, and the keys of every mark whose ring it is. */
export interface GlobeRing {
  /** The key of the first mark of the ring in join order. */
  key: string;
  lngLat: LngLat;
  radius: number;
  /** A plate hangs at this ring. Only such a ring has a handle. */
  handle: boolean;
  members: string[];
}
/** One plate to draw. `members[0]` is the anchor; a column puts them in `memberOrder`. */
export interface GlobePlate<P extends GlobePoint> {
  /** The anchor's key for a single plate, `pile:` and the anchor's key for a pile. */
  key: string;
  /** One point: a single plate. */
  members: P[];
  /** Null for a single plate. */
  face: PileFace | null;
  /** Where the plate's marker sits: the anchor's ring (its cluster's head) or the anchor's own point. */
  lngLat: LngLat;
  /** How far up and left of that place the plate's corner hangs. */
  corner: number;
  /** The plate leads with the lens: the anchor draws no ring to stand for the record. */
  lens: boolean;
}

interface Cluster<P extends GlobePoint> {
  head: P;
  members: string[];
  handle: boolean;
}

/**
 * The rings and plates of the near side's marks. Callers pass only points on the near side of the
 * globe; a far side mark keeps its single form.
 *
 * Plates: in join order, a point joins the first group whose anchor lies within `GLOBE_REACH` on both
 * axes (the data's capsule piles' rule, with no family and no merge by key: every member is a distinct
 * record), else it anchors a group. Rings: rings that lie within `RING_MERGE_PX` of one another AND have
 * one radius draw as one ring at the first one's place, so a magnitude kind's larger halo is never
 * hidden under a smaller ring. A ring has a handle only when a plate hangs at it, so a member's ring
 * that is not the anchor's draws its ring and no handle.
 */
export function globeLayout<P extends GlobePoint>(points: readonly P[]): { rings: GlobeRing[]; plates: GlobePlate<P>[] } {
  const ordered = joinOrder(points);

  const clusters: Cluster<P>[] = [];
  const clusterOf = new Map<string, Cluster<P>>();
  for (const p of ordered) {
    if (!p.ring) continue;
    let home = clusters.find(
      (c) => c.head.radius === p.radius && Math.abs(c.head.x - p.x) <= RING_MERGE_PX && Math.abs(c.head.y - p.y) <= RING_MERGE_PX,
    );
    if (!home) {
      home = { head: p, members: [], handle: false };
      clusters.push(home);
    }
    home.members.push(p.key);
    clusterOf.set(p.key, home);
  }

  const groups: P[][] = [];
  for (const p of ordered) {
    const home = groups.find((g) => Math.abs(g[0].x - p.x) <= GLOBE_REACH.x && Math.abs(g[0].y - p.y) <= GLOBE_REACH.y);
    if (home) home.push(p);
    else groups.push([p]);
  }

  const plates = groups.map((g): GlobePlate<P> => {
    const anchor = g[0];
    const ring = clusterOf.get(anchor.key);
    if (ring) ring.handle = true;
    return {
      key: g.length === 1 ? anchor.key : `pile:${anchor.key}`,
      members: g,
      face: g.length === 1 ? null : pileFace(g),
      lngLat: ring ? ring.head.lngLat : anchor.lngLat,
      corner: ring ? handleOffset(ring.head.radius) : NO_RING_CORNER_PX,
      lens: !ring,
    };
  });

  const rings = clusters.map((c): GlobeRing => ({ key: c.head.key, lngLat: c.head.lngLat, radius: c.head.radius, handle: c.handle, members: c.members }));
  return { rings, plates };
}
