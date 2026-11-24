// frontend/investigator/src/lib/bar-metrics-small.ts
// The layout numbers of a folded section's small version, in px. They sit apart from
// bar-metrics.ts, which holds the open bar's numbers. Pure constants: no clock, no storage, no DOM.

/** The count's plot, as high as the folded lane's plot (the lane's own LANE_PLOT_PX is 24), so the
 *  two small versions read as equals. */
export const SMALL_PLOT_PX = 24;

/** The least gap between a small version's label and its plot (the count's label measured
 *  0.6 px, too tight). */
export const SMALL_LABEL_GAP_PX = 12;
