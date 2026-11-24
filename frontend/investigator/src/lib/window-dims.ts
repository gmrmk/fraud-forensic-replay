/** Approximate rendered sizes of workspace windows. Used by smart-position
 *  collision detection at call sites that don't have access to the actual
 *  DOM rect (the window hasn't mounted yet). If the rendered components
 *  change size meaningfully, update here. */
export const DETAIL_WINDOW_DIMS = { width: 220, height: 150 } as const;
export const TRACE_WINDOW_DIMS = { width: 320, height: 300 } as const;
export const COLLAPSED_BAR_HEIGHT = 34 as const;
/** Popout estimates for stacking at a shared pin (a section is ~6 field rows plus the
 *  inspector hint). */
export const SECTION_POPOUT_DIMS = { width: 300, height: 190 } as const;
/** A decision's notes (four rows and a wrapped note), and a pile's member list. */
export const NOTES_POPOUT_DIMS = { width: 300, height: 230 } as const;
export const PILE_POPOUT_DIMS = { width: 300, height: 220 } as const;
/** The record's own window (pin, PASS, FAIL, WAITING, the record's notes). An estimate: measured in
 *  the browser it is 298 wide and 172 high with no note, 206 with one, 270 with three, 302 with four. */
export const RECORD_WINDOW_DIMS = { width: 300, height: 260 } as const;
/** The note window, for placing it beside its door. Measured in the browser: an empty draft linked to a
 *  record is 298 wide and 349 high. A draft with the category field open is taller (a known limit: the
 *  window may cross the screen's foot by its growth). */
export const NOTE_WINDOW_DIMS = { width: 300, height: 350 } as const;
