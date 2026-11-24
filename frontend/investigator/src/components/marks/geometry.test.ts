/**
 * The marks' numbers: the plate's width from its parts, where the Timeline plate's anchor may sit so
 * the plate stays whole inside the track, and the globe ring's size round a dot's halo.
 */
import { describe, it, expect } from "vitest";
import {
  DIAMOND_PX,
  DIGIT_PX,
  EDGE_PX,
  GLYPH_ORIGIN_PX,
  HANDLE_PX,
  NOTE_EDGE_PX,
  PLATE_GAP_PX,
  PLATE_PAD_PX,
  RING_GAP_PX,
  ROW_STEP_PX,
  TOUCH_PX,
  handleOffset,
  haloRadius,
  lensPx,
  pileWidth,
  plateWidth,
  ringRadius,
  timelineLeft,
} from "./geometry";
import { STROKE } from "./glyph-paths";
import { HIT_PX } from "../notes/note-marks";
import { ML_AUTH_RING_WIDTH, ML_DOT_RADIUS, ML_HALO_RADIUS } from "../../lib/globe/constants";

/** Evaluates the plate's `left` (a clamp of px, percent and calc(100% - px)) against a track width. */
function anchorPx(css: string, trackW: number): number {
  const m = /^clamp\(([\d.]+)px, ([\d.]+)%, calc\(100% - ([\d.]+)px\)\)$/.exec(css);
  if (!m) throw new Error(`not the plate's clamp: ${css}`);
  return Math.min(Math.max(parseFloat(m[1]), (parseFloat(m[2]) / 100) * trackW), trackW - parseFloat(m[3]));
}

describe("the constants", () => {
  it("hold the plan's numbers", () => {
    expect(PLATE_PAD_PX).toBe(2);
    expect(PLATE_GAP_PX).toBe(2);
    expect(DIGIT_PX).toBe(5);
    expect(GLYPH_ORIGIN_PX).toBe(6.5);
    expect(EDGE_PX).toBe(7);
    expect(HANDLE_PX).toBe(7);
    expect(RING_GAP_PX).toBe(1);
  });
});

describe("plateWidth", () => {
  it("is the padding, the parts and the gaps between them", () => {
    expect(plateWidth({ lens: true, notes: 0, disposition: "none", pinned: true })).toBe(2 + 9 + 2 + 9 + 2);
    expect(plateWidth({ lens: true, notes: 12, disposition: "pass", pinned: true })).toBe(2 + 9 + 2 + 10 + 2 + 9 + 2 + 9 + 2);
    expect(plateWidth({ lens: false, notes: 1, disposition: "none", pinned: false })).toBe(2 + 5 + 2);
  });

  it("counts one digit width for each digit of the count and no part that is absent", () => {
    expect(plateWidth({ lens: false, notes: 100, disposition: "none", pinned: false })).toBe(2 + 15 + 2);
    expect(plateWidth({ lens: false, notes: 0, disposition: "wait", pinned: false })).toBe(2 + 9 + 2);
    expect(plateWidth({ lens: true, notes: 0, disposition: "none", pinned: false })).toBe(2 + 9 + 2);
  });
});

describe("timelineLeft", () => {
  it("is a clamp of the left bound, the percent and the right bound", () => {
    expect(timelineLeft(50, 24)).toBe("clamp(7px, 50%, calc(100% - 17.5px))");
    expect(timelineLeft(12.5, 47)).toBe("clamp(7px, 12.5%, calc(100% - 40.5px))");
  });

  it("keeps the lens centre at least 7 px from the right end for a plate narrower than 13.5 px", () => {
    expect(timelineLeft(100, 9)).toBe("clamp(7px, 100%, calc(100% - 7px))");
    expect(timelineLeft(100, 13)).toBe("clamp(7px, 100%, calc(100% - 7px))");
  });

  it.each([160, 400, 1200])("holds the plate whole inside a track %i px wide", (w) => {
    for (const width of [9, 24, 47]) {
      // The plate hangs with its left edge GLYPH_ORIGIN_PX before its anchor.
      const at0 = anchorPx(timelineLeft(0, width), w) - GLYPH_ORIGIN_PX;
      expect(at0).toBeGreaterThanOrEqual(0.5);
      const at100 = anchorPx(timelineLeft(100, width), w) - GLYPH_ORIGIN_PX + width;
      expect(at100).toBeLessThanOrEqual(w);
      expect(anchorPx(timelineLeft(50, width), w)).toBe(w / 2);
    }
  });
});

describe("the pile's constants", () => {
  it("hold the plan's numbers: a 15 px row, a 2 px touch, the diamond's edge and size", () => {
    expect(ROW_STEP_PX).toBe(15);
    expect(TOUCH_PX).toBe(2);
    expect(NOTE_EDGE_PX).toBe(7);
    expect(DIAMOND_PX).toBe(11);
  });

  it("keep the diamond's edge at half the note hit box the diamond layer holds it by", () => {
    expect(NOTE_EDGE_PX).toBe(HIT_PX / 2);
  });

  it("make a row one plate (13 px) and a gap (2 px)", () => {
    expect(ROW_STEP_PX).toBe(plateWidth({ lens: true, notes: 0, disposition: "none", pinned: false }) + PLATE_GAP_PX);
  });
});

describe("pileWidth", () => {
  it("is the padding, the lens, the figure after the sign, each glyph, the pin and the gaps", () => {
    // The dense case of the drawn sheets: six records, three glyphs, a pin.
    expect(pileWidth({ lens: true, records: 6, glyphs: 3, pinned: true })).toBe(2 + 9 + 2 + 10 + 2 + 9 + 2 + 9 + 2 + 9 + 2 + 9 + 2);
    expect(pileWidth({ lens: true, records: 6, glyphs: 3, pinned: true })).toBe(69);
  });

  it("is 58 for two records with two glyphs and a pin (the playhead state)", () => {
    expect(pileWidth({ lens: true, records: 2, glyphs: 2, pinned: true })).toBe(58);
  });

  it("is 58 for five records with three glyphs, a pin and no lens (the globe's Houston pile)", () => {
    expect(pileWidth({ lens: false, records: 5, glyphs: 3, pinned: true })).toBe(58);
  });

  it("counts one more figure for the sign, and one for each digit of the count", () => {
    expect(pileWidth({ lens: true, records: 12, glyphs: 0, pinned: false })).toBe(30);
    expect(pileWidth({ lens: true, records: 2, glyphs: 0, pinned: false })).toBe(2 + 9 + 2 + 10 + 2);
    expect(pileWidth({ lens: true, records: 100, glyphs: 0, pinned: false })).toBe(2 + 9 + 2 + 20 + 2);
  });

  it("adds no part and no gap for a glyph, a pin or a lens that is absent", () => {
    expect(pileWidth({ lens: false, records: 3, glyphs: 0, pinned: false })).toBe(2 + 10 + 2);
    expect(pileWidth({ lens: false, records: 3, glyphs: 1, pinned: false })).toBe(2 + 10 + 2 + 9 + 2);
  });
});

/** The CSS clamp's value: the lower bound wins over a smaller upper bound, as CSS does. */
function clampPx(css: string, trackW: number): number {
  const m = /^clamp\(([\d.]+)px, ([\d.]+)%, calc\(100% - ([\d.]+)px\)\)$/.exec(css);
  if (!m) throw new Error(`not the plate's clamp: ${css}`);
  return Math.max(parseFloat(m[1]), Math.min((parseFloat(m[2]) / 100) * trackW, trackW - parseFloat(m[3])));
}

describe("lensPx", () => {
  it.each([160, 961, 1244])("equals the CSS clamp timelineLeft describes, on a track %i px wide", (track) => {
    for (const width of [24, 69]) {
      for (const pct of [0, 50, 100]) {
        expect(lensPx(pct, width, track)).toBeCloseTo(clampPx(timelineLeft(pct, width), track), 9);
      }
    }
  });

  it("holds the lens at least 7 px inside the left end and the plate whole inside the right end", () => {
    expect(lensPx(0, 69, 1244)).toBe(7);
    expect(lensPx(100, 69, 1244)).toBe(1244 - (69 - GLYPH_ORIGIN_PX));
    expect(lensPx(100, 9, 1244)).toBe(1244 - 7);
  });

  it("is the percent's own place away from both ends", () => {
    expect(lensPx(50, 69, 1244)).toBe(622);
  });
});

describe("the globe ring", () => {
  it("takes a built-in kind's halo as 9 and a manifest kind's from its magnitude", () => {
    expect(haloRadius(null)).toBe(9);
    expect(haloRadius({ value: null, max: 0 })).toBe(9);
    expect(haloRadius({ value: 100, max: 100 })).toBe(6 + 22);
    expect(haloRadius({ value: 1, max: 100 })).toBe(6 + 3);
  });

  it("agrees with the data's own halo constants", () => {
    expect(haloRadius(null)).toBe(ML_HALO_RADIUS);
    expect(ML_HALO_RADIUS - ML_DOT_RADIUS).toBe(6);
  });

  it("puts the ring's centre line 1 px outside the halo, clear of the halo and of the auth dot's own ring", () => {
    expect(ringRadius(9)).toBe(10);
    const inner = ringRadius(9) - STROKE.globeRing / 2;
    expect(inner).toBeGreaterThan(9);
    expect(inner).toBeGreaterThan(ML_DOT_RADIUS + ML_AUTH_RING_WIDTH);
  });

  it("puts the handle's end up and left by (radius + handle) over root two on each axis", () => {
    expect(handleOffset(10)).toBeCloseTo(12.02, 2);
    expect(handleOffset(10)).toBeCloseTo((10 + HANDLE_PX) / Math.SQRT2, 12);
  });
});
