/**
 * nodeProminence - how strongly the timeline should present individual event
 * nodes (and their rings) versus the ambient density backdrop. Keyed on the
 * number of events currently in the visible window:
 *
 *   - Few events visible (zoomed in, or sparse data) → prominence 1: nodes and
 *     rings grow, their glow tightens so neighbours stop merging, and the patchy
 *     density gradient fades, so each event reads as a crisp distinct mark.
 *   - Many events visible (zoomed out) → prominence 0: the gradient carries the
 *     picture and the nodes stay small texture on top of it.
 *
 * Returns 1 at or below `low`, 0 at or above `high`, linear between. This is the
 * single factor the Timeline threads into dot size, glow blur, ring size, and
 * gradient opacity, so the whole track stays internally consistent at any zoom.
 */
export function nodeProminence(count: number, low = 10, high = 70): number {
  if (count <= low) return 1;
  if (count >= high) return 0;
  return (high - count) / (high - low);
}
