/**
 * Smart collision-avoidance for new pivot windows.
 *
 * Algorithm:
 *   1. Start candidate = (originRect.left - size.width - 12, originRect.top)
 * - prefer LEFT of the origin so the drawer slides leftward into the
 *      analyst's primary workspace (Spec 2 intent). If that would push past
 *      the viewport left edge, fall back to
 *      (originRect.right + 12, originRect.top).
 *   2. Test candidate against every existing window rect using AABB
 *      with 8px padding. If clear, return it.
 *   3. On collision, step +24,+24 and retry.
 *   4. If step would push the candidate off the viewport right edge,
 *      reset cx to initial.x. Independently, if step would push off
 *      the bottom edge, reset cy to initial.y.
 *   5. Cap at 12 attempts; return last candidate (graceful overlap
 *      rather than failure).
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

interface Args {
  origin: Rect;
  size: Size;
  existing: Rect[];
  viewport: Rect;
}

const PADDING = 8;
const STEP = 24;
const MAX_ATTEMPTS = 12;
const GAP_FROM_ORIGIN = 12;

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width + PADDING &&
    a.x + a.width + PADDING > b.x &&
    a.y < b.y + b.height + PADDING &&
    a.y + a.height + PADDING > b.y
  );
}

export function nextNonOverlappingPosition(args: Args): { x: number; y: number } {
  const { origin, size, existing, viewport } = args;

  // Initial: LEFT of origin, falling back to RIGHT if that would push
  // past the viewport's left edge. Left-first matches the Spec 2
  // intent - investigators read left-to-right, so the supplemental
  // drawer should slide into the workspace area rather than off the
  // far edge of the screen.
  let initialX = origin.x - size.width - GAP_FROM_ORIGIN;
  if (initialX < viewport.x) {
    initialX = Math.min(
      viewport.width - size.width,
      origin.x + origin.width + GAP_FROM_ORIGIN,
    );
  }
  let initialY = origin.y;
  if (initialY + size.height > viewport.height) {
    initialY = Math.max(viewport.y, viewport.height - size.height);
  }

  let cx = initialX;
  let cy = initialY;
  let lastCandidate = { x: cx, y: cy };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate: Rect = { x: cx, y: cy, width: size.width, height: size.height };
    lastCandidate = { x: cx, y: cy };

    const collides = existing.some((e) => overlaps(candidate, e));
    if (!collides) return lastCandidate;

    cx += STEP;
    cy += STEP;

    if (cx + size.width > viewport.width) {
      cx = initialX;
    }
    if (cy + size.height > viewport.height) {
      cy = initialY;
    }
  }

  return lastCandidate;
}
