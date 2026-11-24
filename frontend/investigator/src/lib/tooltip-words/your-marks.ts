/**
 * The words of the Your marks block in the Notes menu (window N1). Labels are plain names; the row's
 * tooltip is one sentence that says what the row is, and the row adds its own values after it.
 * Words only: nothing here states a conclusion about a case, holds state or reads a store.
 *
 * What this file does not hold: the disposition words (`DISPOSITION_WORD`, lib/marks/words.ts).
 */

/** The block's heading and the list's name. */
export const HEADING = "Your marks";

/** The first line of a row's tooltip: what the row is. */
export const ROW_TIP = "A record you marked, pinned or noted.";

/** A row's second line and tooltip part for a pinned record. */
export const PINNED = "Pinned";

/** A row's note count: "1 note", "N notes". */
export const noteCount = (n: number): string => (n === 1 ? "1 note" : `${n} notes`);
