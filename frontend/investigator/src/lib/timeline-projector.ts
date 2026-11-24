/**
 * timeline-projector - the ms <-> screen-% mapping shared by every timeline data layer.
 *
 * The TimelineShell builds ONE projector against its active domain (the visible zoom window, or
 * the whole span for a folded bar) and hands it to the data layer, so a layer
 * never re-derives (ts - min) / span itself - that math appeared ~8x across the old Timeline and
 * drifts easily. pct is intentionally UNCLAMPED so off-window detection can read pct < 0 / > 100.
 */
export interface TimelineProjector {
  /** ms -> 0..100 (%) along the track, against the active domain. Unclamped. */
  pct: (ms: number) => number;
  /** a 0..1 track fraction -> ms (for click-to-seek / scrub inside a layer). */
  msAt: (frac: number) => number;
  domainMin: number;
  domainMax: number;
  span: number;
}

export function makeProjector(domainMin: number, domainMax: number): TimelineProjector {
  const span = domainMax - domainMin;
  return {
    domainMin,
    domainMax,
    span,
    pct: (ms) => (span > 0 ? ((ms - domainMin) / span) * 100 : 0),
    msAt: (frac) => domainMin + frac * span,
  };
}
