/**
 * The pile model, task by task: the face a pile plate shows and the order of its members (T1.2), the
 * layout under the Timeline's track (T1.3) and the layout on the globe (T1.4). Pure: members are
 * hand-built records, never read from a store or a clock.
 */
import { describe, it, expect } from "vitest";
import {
  DISPOSITION_ORDER,
  GLOBE_REACH,
  RING_MERGE_PX,
  globeLayout,
  joinOrder,
  memberOrder,
  pileFace,
  trackLayout,
  type GlobePoint,
  type PileMember,
  type TrackLayout,
  type TrackMark,
  type TrackNote,
} from "./mark-piles";
import { DIAMOND_PX, GLYPH_ORIGIN_PX, TOUCH_PX, handleOffset, lensPx, pileWidth, plateWidth } from "./geometry";
import { DISPOSITION_WORD } from "../../lib/marks/words";
import { pileItems, type PileItem } from "../../lib/verdict-piles";
import type { Entity } from "../../lib/entity";

const member = (key: string, over: Partial<PileMember> = {}): PileMember => ({
  key,
  time: 0,
  pinned: false,
  disposition: "none",
  dim: false,
  open: false,
  ...over,
});

describe("DISPOSITION_ORDER", () => {
  it("is check, cross, hourglass: pass, fail, wait", () => {
    expect([...DISPOSITION_ORDER]).toEqual(["pass", "fail", "wait"]);
  });

  it("matches the order the words list a decision's lines in", () => {
    expect(Object.keys(DISPOSITION_WORD)).toEqual([...DISPOSITION_ORDER]);
  });
});

describe("pileFace", () => {
  it("counts records, not notes", () => {
    const face = pileFace([member("a"), member("b"), member("c")].map((m) => ({ ...m, notes: 5 })));
    expect(face.records).toBe(3);
  });

  it("lists the glyphs check, cross, hourglass, once each, only those a member carries", () => {
    const face = pileFace([
      member("a", { disposition: "wait" }),
      member("b", { disposition: "pass" }),
      member("c", { disposition: "wait" }),
      member("d"),
    ]);
    expect(face.glyphs.map((g) => g.disposition)).toEqual(["pass", "wait"]);
    expect(face.counts).toEqual({ pass: 1, fail: 0, wait: 2 });
  });

  it("shows no glyph for a pile whose members carry no decision", () => {
    expect(pileFace([member("a"), member("b")]).glyphs).toEqual([]);
  });

  it("dims a glyph only when every member carrying it is dim", () => {
    const mixed = pileFace([
      member("a", { disposition: "fail", dim: true }),
      member("b", { disposition: "fail", dim: false }),
      member("c", { disposition: "pass", dim: true }),
    ]);
    expect(mixed.glyphs).toEqual([
      { disposition: "pass", dim: true },
      { disposition: "fail", dim: false },
    ]);
  });

  it("dims a glyph whose only carrier is ahead of the playhead, while the others stay lit", () => {
    const face = pileFace([member("a", { disposition: "fail" }), member("b", { disposition: "wait", dim: true })]);
    expect(face.glyphs).toEqual([
      { disposition: "fail", dim: false },
      { disposition: "wait", dim: true },
    ]);
  });

  it("dims the contents only when every member is dim", () => {
    expect(pileFace([member("a", { dim: true }), member("b", { dim: true })]).dim).toBe(true);
    expect(pileFace([member("a", { dim: true }), member("b", { dim: false })]).dim).toBe(false);
  });

  it("is open when any member's window is open", () => {
    expect(pileFace([member("a"), member("b", { open: true })]).open).toBe(true);
    expect(pileFace([member("a"), member("b")]).open).toBe(false);
  });

  it("is pinned when any member is pinned, with the count", () => {
    const face = pileFace([member("a", { pinned: true }), member("b"), member("c", { pinned: true })]);
    expect(face.pinned).toBe(true);
    expect(face.pinnedCount).toBe(2);
    const none = pileFace([member("a"), member("b")]);
    expect(none.pinned).toBe(false);
    expect(none.pinnedCount).toBe(0);
  });
});

describe("memberOrder and joinOrder", () => {
  const set = [
    member("c", { time: 30 }),
    member("untimed-b", { time: null }),
    member("a", { time: 30 }),
    member("p-late", { time: 90, pinned: true }),
    member("untimed-a", { time: null }),
    member("early", { time: 10 }),
    member("p-early", { time: 20, pinned: true }),
  ];

  it("orders a column pinned first, then by time, untimed after timed, then by key", () => {
    expect(memberOrder(set).map((m) => m.key)).toEqual(["p-early", "p-late", "early", "a", "c", "untimed-a", "untimed-b"]);
  });

  it("orders a join by time, untimed after timed, then by key, whatever the pin", () => {
    expect(joinOrder(set).map((m) => m.key)).toEqual(["early", "p-early", "a", "c", "p-late", "untimed-a", "untimed-b"]);
  });

  it("compares keys by code unit, so an upper-case key comes before a lower-case one", () => {
    const keys = joinOrder([member("b:x"), member("B:x"), member("a:x")]).map((m) => m.key);
    expect(keys).toEqual(["B:x", "a:x", "b:x"]);
  });

  it("returns a new array and leaves the input as it was", () => {
    const input = [member("b", { time: 2 }), member("a", { time: 1 })];
    const out = joinOrder(input);
    expect(out).not.toBe(input);
    expect(input.map((m) => m.key)).toEqual(["b", "a"]);
  });

  it("keeps the extra fields of what it was given", () => {
    const rich = [{ ...member("a", { time: 2 }), tag: "x" }, { ...member("b", { time: 1 }), tag: "y" }];
    expect(memberOrder(rich).map((m) => m.tag)).toEqual(["y", "x"]);
  });
});

// ---------------------------------------------------------------------------------------------
// T1.3. Under the track. Positions are the lens's centre in chrome px along the track. Row 0 hangs at
// `top: 100%` and row 1 at `calc(100% + 15px)`; the names below use those. A mark's time is its x, so
// time order is left to right. Where a case sits on a boundary it uses a track of 1024 px and whole or
// binary fractions of a pixel, so the percent the layout divides back is exact.
// ---------------------------------------------------------------------------------------------

const TRACK = 1244;
const pctOf = (px: number, track = TRACK): number => (px / track) * 100;

const trackMark = (key: string, at: number, over: Partial<TrackMark> = {}, track = TRACK): TrackMark => ({
  key,
  time: at,
  pct: pctOf(at, track),
  notes: 0,
  pinned: false,
  disposition: "none",
  dim: false,
  open: false,
  ...over,
});
const note = (key: string, at: number, track = TRACK): TrackNote => ({ key, pct: pctOf(at, track) });

/** A plate of the lens and the pin only: 24 px wide. */
const pinned = (key: string, at: number, track = TRACK): TrackMark => trackMark(key, at, { pinned: true }, track);

const piles = <M extends TrackMark>(l: TrackLayout<M>) => l.plates.flatMap((p) => (p.type === "pile" ? [p] : []));
const keysOf = <M extends TrackMark>(l: TrackLayout<M>) =>
  l.plates.map((p) => (p.type === "single" ? [p.mark.key] : p.members.map((m) => m.key)));

/** The two rules every layout keeps: no two row-one plates within 2 px, and every mark is on one plate. */
function expectSound(l: TrackLayout<TrackMark>, marks: readonly TrackMark[]) {
  for (let i = 1; i < l.plates.length; i++) {
    expect(l.plates[i].left, `plate ${i}`).toBeGreaterThanOrEqual(l.plates[i - 1].right + TOUCH_PX);
  }
  const placed = l.plates.flatMap((p) => (p.type === "single" ? [p.mark.key] : p.members.map((m) => m.key)));
  expect([...placed].sort()).toEqual(marks.map((m) => m.key).sort());
}

describe("trackLayout: before the track is measured", () => {
  it("makes no pile and puts every diamond in row 0 when the track is 0 px wide", () => {
    const marks = [pinned("a", 100), pinned("b", 101), pinned("c", 102)];
    const l = trackLayout(marks, [note("n1", 100), note("n2", 101)], 0);
    expect(l.plates.map((p) => p.type)).toEqual(["single", "single", "single"]);
    expect([...l.diamondRow.values()]).toEqual([0, 0]);
    expect(l.diamondRow.size).toBe(2);
  });

  it("does the same for a track of an unknown (negative) width", () => {
    expect(piles(trackLayout([pinned("a", 100), pinned("b", 101)], [], -5))).toEqual([]);
  });
});

describe("trackLayout: the touch rule", () => {
  const T = 1024;
  const m1 = (): TrackMark => pinned("a", 150, T);

  it("leaves two plates 2.00 px apart single", () => {
    const marks = [m1(), pinned("b", 176, T)];
    const l = trackLayout(marks, [], T);
    expect(l.plates.map((p) => p.type)).toEqual(["single", "single"]);
    // The title's own number, read off the layout: the gap between the plates is exactly 2.
    expect(l.plates[1].left - l.plates[0].right).toBe(2);
    expectSound(l, marks);
  });

  it("joins two plates 1.99 px apart into one pile", () => {
    const marks = [m1(), pinned("b", 175.99, T)];
    const l = trackLayout(marks, [], T);
    expect(l.plates.map((p) => p.type)).toEqual(["pile"]);
    expect(lensPx(marks[1].pct, 24, T) - GLYPH_ORIGIN_PX - (lensPx(marks[0].pct, 24, T) - GLYPH_ORIGIN_PX + 24)).toBeCloseTo(1.99, 9);
    expectSound(l, marks);
  });

  it("gives a single plate the width and the place of one mark", () => {
    const [only] = trackLayout([trackMark("a", 300, { notes: 12, disposition: "pass", pinned: true })], [], TRACK).plates;
    const w = plateWidth({ lens: true, notes: 12, disposition: "pass", pinned: true });
    expect(only.type).toBe("single");
    expect(only.left).toBeCloseTo(300 - GLYPH_ORIGIN_PX, 9);
    expect(only.right).toBeCloseTo(300 - GLYPH_ORIGIN_PX + w, 9);
  });

  it("makes no plate and no row for no marks", () => {
    const l = trackLayout([], [note("n", 100)], TRACK);
    expect(l.plates).toEqual([]);
    expect(l.diamondRow.get("n")).toBe(0);
  });

  it("does not depend on the order the marks come in", () => {
    const marks = [pinned("c", 308), pinned("a", 300), pinned("b", 304), pinned("far", 700)];
    expect(keysOf(trackLayout(marks, [], TRACK))).toEqual(keysOf(trackLayout([...marks].reverse(), [], TRACK)));
  });
});

describe("trackLayout: the dense case (six records within 61 px)", () => {
  // Offsets from the first record's lens, at 1.720 px an hour: 0, 2.22, 2.31, 14.22, 39.73, 61.22 px. The
  // anchor sits mid-track, so nothing clamps.
  const A = 300;
  const dense = (zeroMember: Partial<TrackMark> = { disposition: "wait", pinned: true }): TrackMark[] => [
    trackMark("auth:0107", A + 0, { disposition: "pass", notes: 1 }),
    trackMark("auth:0108", A + 2.22, { disposition: "fail", notes: 2 }),
    trackMark("auth:0110", A + 2.31, { notes: 0, ...zeroMember }),
    trackMark("auth:0113", A + 14.22, { notes: 1 }),
    trackMark("auth:0116", A + 39.73, { disposition: "pass", notes: 3 }),
    trackMark("auth:0118", A + 61.22, { disposition: "fail", dim: true }),
  ];

  it("joins all six into one pile 69 px wide", () => {
    const marks = dense();
    const l = trackLayout(marks, [], TRACK);
    expect(l.plates).toHaveLength(1);
    const [pile] = piles(l);
    expect(pile.members).toHaveLength(6);
    expect(pile.width).toBe(69);
    expect(pile.face.records).toBe(6);
    expect(pile.face.glyphs.map((g) => g.disposition)).toEqual(["pass", "fail", "wait"]);
    expect(pile.face.pinned).toBe(true);
    expectSound(l, marks);
  });

  it("reaches 62.5 px past the anchor's lens, and that reach is what pulls the last record in", () => {
    const [pile] = piles(trackLayout(dense(), [], TRACK));
    expect(pile.right - A).toBeCloseTo(62.5, 9);
    // The last record's plate starts 54.72 px after the anchor's lens, less than 64.5 (the reach plus 2).
    const lastLeft = A + 61.22 - GLYPH_ORIGIN_PX;
    expect(lastLeft - A).toBeCloseTo(54.72, 9);
    expect(lastLeft).toBeLessThan(pile.right + TOUCH_PX);
  });

  it("would leave the last record single if the pile were only 58 px (no hourglass)", () => {
    // The third record decides FAIL instead of WAITING: check, cross and the pin make 58 px, whose reach
    // (right edge 51.5 from the anchor) ends before the last record's plate.
    const marks = dense({ disposition: "fail", pinned: true });
    const l = trackLayout(marks, [], TRACK);
    expect(l.plates.map((p) => p.type)).toEqual(["pile", "single"]);
    const [pile] = piles(l);
    expect(pile.width).toBe(58);
    expect(pile.members).toHaveLength(5);
    expect(l.plates[1].type === "single" && l.plates[1].mark.key).toBe("auth:0118");
    expectSound(l, marks);
  });

  it("puts the free note's diamond, which lies inside the pile, in row 1", () => {
    const l = trackLayout(dense(), [note("note:free", A + 36.23)], TRACK);
    expect(l.diamondRow.get("note:free")).toBe(1);
  });
});

describe("trackLayout: the group's reach follows the widened pile", () => {
  it("joins a third mark that clears the first plate but not the pile the second made", () => {
    const first = trackMark("a", 300, { disposition: "pass" });
    const second = trackMark("b", 306, { disposition: "fail" });
    const third = trackMark("c", 340);
    // The first plate alone ends at 317.5; the third starts at 333.5, which is clear of it.
    expect(trackLayout([first, third], [], TRACK).plates.map((p) => p.type)).toEqual(["single", "single"]);
    // The pile of the first two is 47 px wide and ends at 340.5, so the third touches it.
    const l = trackLayout([first, second, third], [], TRACK);
    expect(l.plates.map((p) => p.type)).toEqual(["pile"]);
    expect(piles(l)[0].members.map((m) => m.key)).toEqual(["a", "b", "c"]);
    expect(piles(l)[0].width).toBe(pileWidth({ lens: true, records: 3, glyphs: 2, pinned: false }));
  });
});

describe("trackLayout: where a pile hangs", () => {
  it("hangs at its earliest member's percent and is keyed pile: plus that member's key", () => {
    const marks = [pinned("m3", 310), pinned("m1", 300), pinned("m2", 305)];
    const [pile] = piles(trackLayout(marks, [], TRACK));
    expect(pile.key).toBe("pile:m1");
    expect(pile.pct).toBe(marks[1].pct);
    expect(pile.members.map((m) => m.key)).toEqual(["m1", "m2", "m3"]);
  });

  it("breaks a tie of times by key, so the anchor is the same on every tick", () => {
    const a = trackMark("b", 300, { time: 7, pinned: true });
    const b = trackMark("a", 300, { time: 7, pinned: true });
    expect(piles(trackLayout([a, b], [], TRACK))[0].key).toBe("pile:a");
  });

  it("keeps the plates in time order along the row", () => {
    const marks = [pinned("z", 900), pinned("a", 100), pinned("m", 500)];
    expect(keysOf(trackLayout(marks, [], TRACK))).toEqual([["a"], ["m"], ["z"]]);
  });
});

describe("trackLayout: the drawn cases", () => {
  it("joins the two marks of the playhead state, 0.09 px apart, into one pile of two", () => {
    // A cross, pinned, lit; a hourglass ahead of the playhead, dim. Another mark alone further on.
    const marks = [
      trackMark("rs-0002", 800, { disposition: "fail", pinned: true }),
      trackMark("rs-0012", 800.09, { disposition: "wait", dim: true }),
      trackMark("nw-0004", 1100, { disposition: "pass", pinned: true }),
    ];
    const l = trackLayout(marks, [], TRACK);
    expect(l.plates.map((p) => p.type)).toEqual(["pile", "single"]);
    const [pile] = piles(l);
    expect(pile.width).toBe(58);
    expect(pile.face.glyphs).toEqual([
      { disposition: "fail", dim: false },
      { disposition: "wait", dim: true },
    ]);
    expect(pile.face.pinned).toBe(true);
    expect(pile.face.dim).toBe(false);
    expectSound(l, marks);
  });

  it("joins plates that overlap by half a pixel at text step 125 (a track of 961 px)", () => {
    const T = 961;
    // 20 px and 24 px wide plates: the second starts 0.5 px before the first ends.
    const a = trackMark("a", 400, { notes: 1 }, T);
    const b = trackMark("b", 419.5, { disposition: "wait" }, T);
    const l = trackLayout([a, b], [], T);
    expect(l.plates.map((p) => p.type)).toEqual(["pile"]);
    expect(piles(l)[0].face.glyphs.map((g) => g.disposition)).toEqual(["wait"]);
    expect(piles(l)[0].width).toBe(36);
  });

  it("keeps a lone plate and a pile apart when the gap between them is wide", () => {
    const marks = [pinned("a", 100), pinned("b", 103), pinned("c", 400)];
    expect(keysOf(trackLayout(marks, [], TRACK))).toEqual([["a", "b"], ["c"]]);
  });
});

describe("trackLayout: the right end of the track", () => {
  it("merges a pile that widens and clamps left into its neighbour, so no two plates lie within 2 px", () => {
    const T = 400;
    // A pinned plate (24 px) ends at 367.5. A lens-only plate (13 px) near the end clears it, at 383.5.
    const a = pinned("a", 350, T);
    const b = trackMark("b", 390, {}, T);
    expect(trackLayout([a, b], [], T).plates.map((p) => p.type)).toEqual(["single", "single"]);
    // A second mark joins b and the pile (36 px) clamps against the track's end: it now starts at 364,
    // inside the first plate's reach, so the first plate joins it.
    const c = trackMark("c", 392, { disposition: "pass" }, T);
    const marks = [a, b, c];
    const l = trackLayout(marks, [], T);
    expect(l.plates.map((p) => p.type)).toEqual(["pile"]);
    const [pile] = piles(l);
    expect(pile.key).toBe("pile:a");
    expect(pile.members.map((m) => m.key)).toEqual(["a", "b", "c"]);
    // The merged pile hangs at the first plate's percent and, at 47 px, no longer needs to clamp.
    expect(pile.width).toBe(47);
    expect(pile.left).toBeCloseTo(350 - GLYPH_ORIGIN_PX, 9);
    expectSound(l, marks);
  });

  it("holds a pile whole inside the track: its right edge never passes the end", () => {
    const T = 400;
    const marks = [pinned("a", 380, T), pinned("b", 388, T), pinned("c", 396, T)];
    const l = trackLayout(marks, [], T);
    for (const p of l.plates) expect(p.right).toBeLessThanOrEqual(T + 1e-9);
    expectSound(l, marks);
  });
});

describe("trackLayout: it never leaves two plates within 2 px", () => {
  it.each([160, 400, 961, 1244])("on a track %i px wide, for marks laid out at many spacings and mixes", (T) => {
    const dispositions = ["none", "pass", "fail", "wait"] as const;
    for (const step of [0.5, 1, 3, 7, 13, 20, 33]) {
      for (const n of [1, 2, 3, 5, 9, 17, 40]) {
        const marks = Array.from({ length: n }, (_, i) =>
          trackMark(`k${String(i).padStart(3, "0")}`, 5 + i * step, { disposition: dispositions[i % 4], pinned: i % 3 === 0, notes: i % 5 }, T),
        );
        expectSound(trackLayout(marks, [], T), marks);
      }
    }
  });
});

describe("trackLayout: the diamonds", () => {
  const T = 1024;
  // One plate, 24 px wide, with its lens at 500: it covers 493.5 to 517.5.
  const plate = (): TrackMark => pinned("a", 500, T);
  const rowAt = (x: number): 0 | 1 => trackLayout([plate()], [note("n", x, T)], T).diamondRow.get("n")!;

  it("hangs in row 0 when the diamond is exactly 2 px clear of a plate, on either side", () => {
    // The diamond's box is its centre plus and minus 5.5 px.
    expect(rowAt(519.5 + DIAMOND_PX / 2)).toBe(0);
    expect(rowAt(491.5 - DIAMOND_PX / 2)).toBe(0);
  });

  it("hangs in row 1 when the diamond is 1.99 px from a plate, on either side", () => {
    expect(rowAt(519.49 + DIAMOND_PX / 2)).toBe(1);
    expect(rowAt(491.51 - DIAMOND_PX / 2)).toBe(1);
  });

  it("hangs in row 1 when the diamond lies under the plate", () => {
    expect(rowAt(505)).toBe(1);
  });

  it("hangs in row 1 under a pile as it does under a single plate", () => {
    const marks = [pinned("a", 500, T), pinned("b", 504, T)];
    expect(piles(trackLayout(marks, [], T))).toHaveLength(1);
    expect(trackLayout(marks, [note("n", 520, T)], T).diamondRow.get("n")).toBe(1);
  });

  it("keeps a diamond far from every plate in row 0", () => {
    expect(rowAt(200)).toBe(0);
    expect(rowAt(900)).toBe(0);
  });

  it("holds a diamond at least 7 px inside both ends of the track, as the diamond layer does", () => {
    const edge = pinned("e", 7, T);
    // The plate's box is 0.5 to 24.5; a diamond at percent 0 is held at 7 and lies on it.
    const l = trackLayout([edge], [{ key: "n", pct: 0 }], T);
    expect(l.diamondRow.get("n")).toBe(1);
    const atEnd = trackLayout([pinned("z", T - 7, T)], [{ key: "n", pct: 100 }], T);
    expect(atEnd.diamondRow.get("n")).toBe(1);
  });

  it("does not move a diamond for another diamond: diamonds may lie on one another", () => {
    const l = trackLayout([plate()], [note("near", 505, T), note("x1", 700, T), note("x2", 701, T)], T);
    expect(l.diamondRow.get("near")).toBe(1);
    expect(l.diamondRow.get("x1")).toBe(0);
    expect(l.diamondRow.get("x2")).toBe(0);
  });

  it("treats a free note's diamond and a linked note's plain diamond alike: both are a key and a percent", () => {
    const l = trackLayout([plate()], [note("note:free-1", 505, T), note("note:plain-1", 505, T)], T);
    expect(l.diamondRow.get("note:free-1")).toBe(l.diamondRow.get("note:plain-1"));
    expect(l.diamondRow.get("note:free-1")).toBe(1);
  });

  it("reads each diamond against the plates as they are drawn after a join", () => {
    // The first plate ends at 517.5, so a diamond at 530 (box 524.5 to 535.5) is clear of it. Joined with
    // the plate that touches it, the pile ends at 529.5 and the diamond lies on it.
    const a = pinned("a", 500, T);
    const b = pinned("b", 524, T);
    expect(trackLayout([a], [note("n", 530, T)], T).diamondRow.get("n")).toBe(0);
    expect(trackLayout([a, b], [note("n", 530, T)], T).diamondRow.get("n")).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// T1.4. On the globe. Points are projected px of the map; the first of a pile in time order is its
// anchor. A point's time is its order in the call unless a case says otherwise.
// ---------------------------------------------------------------------------------------------

let clockless = 0;
/** A ringed point (radius 10, the built-in halo's ring) at (x, y); times rise with each call. */
const gp = (key: string, x: number, y: number, over: Partial<GlobePoint> = {}): GlobePoint => ({
  key,
  time: (clockless += 1),
  pinned: false,
  disposition: "none",
  dim: false,
  open: false,
  x,
  y,
  lngLat: { lng: x / 10, lat: y / 10 },
  ring: true,
  radius: 10,
  ...over,
});

describe("the globe's constants", () => {
  it("are the data's own reach, 44 by 16 px, and a 2 px ring merge", () => {
    expect(GLOBE_REACH).toEqual({ x: 44, y: 16 });
    expect(RING_MERGE_PX).toBe(2);
  });
});

describe("globeLayout: which points join", () => {
  it("joins the points within 44 by 16 px of the anchor, and not those 45 px or 17 px away", () => {
    const a = gp("a", 0, 0);
    const b = gp("b", 44, 16);
    const farX = gp("c", 45, 0);
    const farY = gp("d", 0, 17);
    const { plates } = globeLayout([a, b, farX, farY]);
    expect(plates.map((p) => p.members.map((m) => m.key))).toEqual([["a", "b"], ["c"], ["d"]]);
  });

  it("joins a point to the first group whose anchor is in reach, not to a member that is not an anchor", () => {
    // b is in a's reach; c is in b's reach but not in a's, so c starts its own group.
    const { plates } = globeLayout([gp("a", 0, 0), gp("b", 40, 0), gp("c", 80, 0)]);
    expect(plates.map((p) => p.members.map((m) => m.key))).toEqual([["a", "b"], ["c"]]);
  });

  it("makes the anchor the earliest point, whatever order the points come in", () => {
    const early = gp("late-key", 5, 5, { time: 1 });
    const later = gp("a", 0, 0, { time: 2 });
    const { plates } = globeLayout([later, early]);
    expect(plates).toHaveLength(1);
    expect(plates[0].key).toBe("pile:late-key");
    expect(plates[0].members.map((m) => m.key)).toEqual(["late-key", "a"]);
  });

  it("makes the plate of one point a single plate with no face and the point's own key", () => {
    const { plates } = globeLayout([gp("solo", 10, 10)]);
    expect(plates).toHaveLength(1);
    expect(plates[0].key).toBe("solo");
    expect(plates[0].face).toBeNull();
    expect(plates[0].members).toHaveLength(1);
  });

  it("gives a pile its face and a key of pile: plus the anchor's key", () => {
    const { plates } = globeLayout([
      gp("a", 0, 0, { disposition: "fail", pinned: true }),
      gp("b", 10, 3, { disposition: "wait", dim: true }),
    ]);
    expect(plates[0].key).toBe("pile:a");
    expect(plates[0].face).toEqual(pileFace(plates[0].members));
    expect(plates[0].face?.glyphs.map((g) => g.disposition)).toEqual(["fail", "wait"]);
    expect(plates[0].face?.pinned).toBe(true);
  });

  it("makes no plate for no points", () => {
    expect(globeLayout([])).toEqual({ rings: [], plates: [] });
  });
});

describe("globeLayout: the twin of the data's pile", () => {
  it("keeps pileItems' grouping for the same timed, distinct points", () => {
    // A fixed scatter: no two points share a time, so the two sorts agree and only the rule is compared.
    const scatter: GlobePoint[] = Array.from({ length: 24 }, (_, i) =>
      gp(`p${String(i).padStart(2, "0")}`, (i * 29) % 170, (i * 13) % 61, { ring: false, time: 1000 + i * 7 }),
    );
    const items: PileItem[] = scatter.map((p) => ({
      id: p.key,
      family: "decision",
      x: p.x,
      y: p.y,
      at: p.time as number,
      countKey: p.key,
      word: "x",
      tone: "fail",
      lit: false,
      entity: {} as Entity,
      lngLat: p.lngLat,
    }));
    const data = pileItems(items, GLOBE_REACH).map((p) => p.members.map((m) => m.id));
    const mine = globeLayout(scatter).plates.map((p) => p.members.map((m) => m.key));
    expect(mine).toEqual(data);
    // The scatter is dense enough to hold piles and singles both, so the comparison means something.
    expect(data.some((g) => g.length > 1)).toBe(true);
    expect(data.some((g) => g.length === 1)).toBe(true);
  });
});

describe("globeLayout: rings", () => {
  it("merges rings within 2 px on both axes and of one radius into one ring at the head's place", () => {
    const head = gp("a", 100, 100);
    const { rings } = globeLayout([head, gp("b", 102, 98)]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toEqual({ key: "a", lngLat: head.lngLat, radius: 10, handle: true, members: ["a", "b"] });
  });

  it("does not merge rings 3 px apart", () => {
    expect(globeLayout([gp("a", 100, 100), gp("b", 103, 100)]).rings).toHaveLength(2);
    expect(globeLayout([gp("a", 100, 100), gp("b", 100, 103)]).rings).toHaveLength(2);
  });

  it("keeps two rings within 2 px of different radius as two, and only the one a plate hangs at has a handle", () => {
    // A magnitude kind's larger halo must stay visible round a plain dot's.
    const { rings, plates } = globeLayout([gp("a", 100, 100), gp("b", 101, 101, { radius: 14 })]);
    expect(rings.map((r) => [r.key, r.radius, r.handle])).toEqual([
      ["a", 10, true],
      ["b", 14, false],
    ]);
    expect(plates).toHaveLength(1);
  });

  it("leaves a point with no ring out of every ring", () => {
    const { rings } = globeLayout([gp("a", 100, 100), gp("b", 100, 100, { ring: false })]);
    expect(rings).toHaveLength(1);
    expect(rings[0].members).toEqual(["a"]);
  });

  it("draws a handle only on a ring a plate hangs at: four rings in one pile have one handle", () => {
    const { rings, plates } = globeLayout([gp("a", 0, 0), gp("b", 15, 0), gp("c", 0, 10), gp("d", 30, 5)]);
    expect(plates).toHaveLength(1);
    expect(rings.map((r) => r.handle)).toEqual([true, false, false, false]);
    expect(rings.map((r) => r.key)).toEqual(["a", "b", "c", "d"]);
  });

  it("gives a ring merged into the anchor's no handle of its own: one ring, one handle", () => {
    const { rings } = globeLayout([gp("a", 0, 0), gp("b", 1, 1), gp("c", 2, 2)]);
    expect(rings).toHaveLength(1);
    expect(rings[0].members).toEqual(["a", "b", "c"]);
    expect(rings[0].handle).toBe(true);
  });

  it("gives every single point's own ring a handle", () => {
    const { rings } = globeLayout([gp("a", 0, 0), gp("b", 200, 0), gp("c", 400, 0)]);
    expect(rings.map((r) => r.handle)).toEqual([true, true, true]);
  });
});

describe("globeLayout: where the plate hangs", () => {
  it("hangs an anchor with a ring at its ring's handle end: the handle offset of the ring, no lens", () => {
    const a = gp("-0091", 300, 200, { radius: 10 });
    const { plates } = globeLayout([a, gp("-0101", 310, 205), gp("-0119", 320, 190)]);
    expect(plates).toHaveLength(1);
    expect(plates[0].lens).toBe(false);
    expect(plates[0].corner).toBe(handleOffset(10));
    expect(plates[0].corner).toBeCloseTo(12.02, 2);
    expect(plates[0].lngLat).toEqual(a.lngLat);
  });

  it("takes the corner from the ring's own radius, so a magnitude kind's larger ring holds its plate further out", () => {
    const { plates } = globeLayout([gp("a", 300, 200, { radius: 14 })]);
    expect(plates[0].corner).toBe(handleOffset(14));
  });

  it("hangs an anchor with no ring at its own point, 7 px out, with the lens", () => {
    const anchor = gp("cap", 300, 200, { ring: false });
    const { plates, rings } = globeLayout([anchor, gp("b", 310, 205)]);
    expect(plates[0].key).toBe("pile:cap");
    expect(plates[0].lens).toBe(true);
    expect(plates[0].corner).toBe(7);
    expect(plates[0].lngLat).toEqual(anchor.lngLat);
    // The member's ring stays and draws no handle: only a ring a plate hangs at has one.
    expect(rings).toEqual([{ key: "b", lngLat: { lng: 31, lat: 20.5 }, radius: 10, handle: false, members: ["b"] }]);
  });

  it("makes a single point with no ring a plate alone with the lens and no ring", () => {
    const { plates, rings } = globeLayout([gp("cap", 300, 200, { ring: false })]);
    expect(rings).toEqual([]);
    expect(plates[0]).toMatchObject({ key: "cap", lens: true, corner: 7, face: null });
  });

  it("makes a single point with a ring a plate at the ring's handle end and a ring with a handle", () => {
    const solo = gp("a", 300, 200);
    const { plates, rings } = globeLayout([solo]);
    expect(plates[0]).toMatchObject({ key: "a", lens: false, face: null, lngLat: solo.lngLat });
    expect(plates[0].corner).toBe(handleOffset(10));
    expect(rings).toEqual([{ key: "a", lngLat: solo.lngLat, radius: 10, handle: true, members: ["a"] }]);
  });

  it("hangs an anchor whose ring merged into an earlier member's ring at that shared ring", () => {
    // p1 is in p0's reach (44 px) so it is a member; p2 is 46 px from p0, so it anchors a group of its
    // own, but its ring lies 2 px from p1's and shares it. Both groups' plates hang at their rings.
    const p0 = gp("p0", 0, 0);
    const p1 = gp("p1", 44, 0);
    const p2 = gp("p2", 46, 0);
    const { plates, rings } = globeLayout([p0, p1, p2]);
    expect(plates.map((p) => [p.key, p.members.map((m) => m.key)])).toEqual([
      ["pile:p0", ["p0", "p1"]],
      ["p2", ["p2"]],
    ]);
    expect(plates[1].lens).toBe(false);
    expect(plates[1].lngLat).toEqual(p1.lngLat);
    expect(plates[1].corner).toBe(handleOffset(10));
    expect(rings.map((r) => [r.key, r.members, r.handle])).toEqual([
      ["p0", ["p0"], true],
      ["p1", ["p1", "p2"], true],
    ]);
  });
});
