// frontend/investigator/src/lib/bar-metrics-stack.ts
// The layout numbers of the folded Timeline's line for each section,
// in px. They sit apart from bar-metrics.ts, which holds the open bar's numbers. Pure
// constants: no clock, no storage, no DOM.

/** The first column of the stack. It holds the Timeline button, the clock and, while a row is alone,
 *  the control that clears it; each section's small version takes this as its own name column, so the
 *  three strips start at one place. Wider than the open bar's name column (148), since the Timeline
 *  button and the clock do not fit in that. */
export const STACK_NAME_PX = 216;

/** The gap between the strips' right end and the transport, which is the one line's own gap (the
 *  gap-4 of its row). The stack takes it as a column of its own, since a gap between all columns
 *  would move the slider off the small versions' plots. */
export const STACK_GAP_PX = 16;
