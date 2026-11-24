import { describe, it, expect } from "vitest";
import { nextNonOverlappingPosition, type Rect } from "./smart-position";

const VIEWPORT: Rect = { x: 0, y: 0, width: 1920, height: 1080 };

// A typical Inspector field rect - top-right of the screen, narrow column.
const ORIGIN_FIELD: Rect = { x: 1700, y: 100, width: 200, height: 22 };

// A typical popover footprint.
const POPOVER_SIZE = { width: 220, height: 180 };

describe("nextNonOverlappingPosition", () => {
  it("returns the start position when no existing windows", () => {
    const pos = nextNonOverlappingPosition({
      origin: ORIGIN_FIELD,
      size: POPOVER_SIZE,
      existing: [],
      viewport: VIEWPORT,
    });
    // Popover starts to the LEFT of the origin field by default
    // because the origin is on the right edge; algorithm should
    // place the popover where it fits - adjacent to origin.
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.x + POPOVER_SIZE.width).toBeLessThanOrEqual(VIEWPORT.width);
    expect(pos.y).toBeGreaterThan(0);
    expect(pos.y + POPOVER_SIZE.height).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it("steps past an overlapping window", () => {
    // Existing window occupies the spot the algorithm would normally pick.
    const occupiedStart = nextNonOverlappingPosition({
      origin: ORIGIN_FIELD,
      size: POPOVER_SIZE,
      existing: [],
      viewport: VIEWPORT,
    });
    const blocker: Rect = { ...occupiedStart, ...POPOVER_SIZE };
    const pos = nextNonOverlappingPosition({
      origin: ORIGIN_FIELD,
      size: POPOVER_SIZE,
      existing: [blocker],
      viewport: VIEWPORT,
    });
    // Position should be different from the blocker's
    const overlap =
      pos.x < blocker.x + blocker.width &&
      pos.x + POPOVER_SIZE.width > blocker.x &&
      pos.y < blocker.y + blocker.height &&
      pos.y + POPOVER_SIZE.height > blocker.y;
    expect(overlap).toBe(false);
  });

  it("wraps when stepping would push off the right edge", () => {
    const nearEdge: Rect = { x: 1850, y: 100, width: 50, height: 22 };
    // Where the algorithm places the first candidate with no blockers.
    const firstPos = nextNonOverlappingPosition({
      origin: nearEdge, size: POPOVER_SIZE, existing: [], viewport: VIEWPORT,
    });
    // Block that spot, forcing a step. The stepped position would push past
    // the right edge, triggering the cx-wrap branch.
    const blocker: Rect = { ...firstPos, ...POPOVER_SIZE };
    const pos = nextNonOverlappingPosition({
      origin: nearEdge,
      size: POPOVER_SIZE,
      existing: [blocker],
      viewport: VIEWPORT,
    });
    expect(pos.x + POPOVER_SIZE.width).toBeLessThanOrEqual(VIEWPORT.width);
    // Confirm cx wrapped to initialX rather than being pushed further right.
    expect(pos.x).toBe(firstPos.x);
  });

  it("caps at 12 attempts and returns last candidate", () => {
    // Tile 12 overlapping blockers near the origin so every candidate collides.
    const blockers: Rect[] = [];
    let bx = 100, by = 100;
    for (let i = 0; i < 12; i++) {
      blockers.push({ x: bx, y: by, ...POPOVER_SIZE });
      bx += 24;
      by += 24;
    }
    const tight: Rect = { x: 100, y: 100, width: 200, height: 22 };
    const pos = nextNonOverlappingPosition({
      origin: tight,
      size: POPOVER_SIZE,
      existing: blockers,
      viewport: VIEWPORT,
    });
    // After 12 failed attempts, we accept whatever the last candidate was.
    // No assertion on non-overlap - the cap exists precisely for this case.
    // At attempt 11 (the last) the candidate is (initialX + 11*STEP, initialY + 11*STEP).
    // initialX = 312 (tight.x + tight.width + GAP_FROM_ORIGIN = 100+200+12).
    // initialY = 100. STEP = 24.
    expect(pos.x).toBe(576);
    expect(pos.y).toBe(364);
  });

  it("resets cy when bottom edge is reached even if cx stays in bounds", () => {
    // Tiny viewport so y-overflow happens quickly. Wide enough that cx never
    // wraps. With size 60x80 and initial (100, 100), steps of (+24,+24) hit
    // y > viewport.height when cy = 220 (i.e., 100 + 5*24 = 220, 220+80=300).
    // Need at least 6 forced collisions for y to overflow.
    const smallViewport: Rect = { x: 0, y: 0, width: 800, height: 300 };
    const smallSize = { width: 60, height: 80 };
    const tight: Rect = { x: 100, y: 100, width: 40, height: 22 };
    // Tile 10 blockers along the diagonal so every candidate up to attempt 10
    // collides; the 6th step would have cy + 80 > 300.
    const blockers: Rect[] = [];
    let bx = 152, by = 100;
    for (let i = 0; i < 10; i++) {
      blockers.push({ x: bx, y: by, ...smallSize });
      bx += 24;
      by += 24;
    }
    const pos = nextNonOverlappingPosition({
      origin: tight,
      size: smallSize,
      existing: blockers,
      viewport: smallViewport,
    });
    // After the y-reset, cy is no longer marching off-screen.
    expect(pos.y + smallSize.height).toBeLessThanOrEqual(smallViewport.height);
  });
});
