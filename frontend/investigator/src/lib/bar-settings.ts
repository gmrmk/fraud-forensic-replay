// The playbar's five settings, held in one place. Each is a constant: the build reads
// no saved value for it, draws no control for it and never puts it in the share link. A later
// change of choice is a change of one line here.
//
// The values are the ids of the chosen options. The options not chosen are not named in this
// module, and nothing here reads the browser.

/** What a folded rows section shows. "count" is how many rows are active each hour. */
export const ROWS_FOLD = "count";

/** What a folded lane shows. "bars" is its bars and its number on one line. */
export const LANE_FOLD = "bars";

/** What a folded Timeline shows. "each" is a line for each section. */
export const TIMELINE_FOLD = "each";

/** What a lane opens into. "networks" is the networks it came from. */
export const LANE_DEPTH = "networks";

/** What the Timeline opens into. "kinds" is a line for each kind of event. */
export const TIMELINE_DEPTH = "kinds";
