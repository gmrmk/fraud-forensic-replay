// frontend/investigator/src/lib/tooltip-words/record-window.ts
// Every sentence the record's own window and its opener in the Inspector's header print.
// Labels are plain names of at most three words; each
// tooltip and state line is one sentence that says what a thing is or what a press does. None states a
// conclusion about a case. "Add a note at the playhead." is not here: the window reuses `ADD_ROW` of
// `notes.ts`. The words of the Fail category list come last.
//
// The middle dot is built from its code point, so no source file holds the character.

/** The middle dot (U+00B7). */
export const MID = String.fromCharCode(0xb7);

/** The Inspector's lens button: its name and its tooltip. */
export const OPENER = {
  name: "Open your mark",
  tip: "Open your window for this record, with its pin, your mark and your notes.",
} as const;

/** The window's title and its dialog name: the record's own id, then "Your mark". */
export const WINDOW_TITLE = (id: string): string => `${id} ${MID} Your mark`;

/**
 * The frame's pin button is the record's pin. Keyed by the record's CURRENT state: `unpinned` is the
 * wording while the record is not pinned (a press pins it), `pinned` while it is (a press unpins it).
 */
export const PIN = {
  unpinned: {
    name: "Pin the record",
    tip: "Pin the record so it stays drawn, leads your marks and keeps this window open.",
  },
  pinned: {
    name: "Unpin the record",
    tip: "Unpin the record; the next window opened then replaces this one.",
  },
} as const;

/** The group of the three buttons PASS, FAIL and WAITING. */
export const GROUP = {
  name: "Your mark",
  tip: "Your own mark on this record, which the app never sets.",
} as const;

/** An unheld button's tooltip; `word` is one of `DISPOSITION_WORD`. */
export const pressTip = (word: string): string => `Mark this record ${word}.`;

/** The held button's tooltip. */
export const heldTip = (word: string): string => `Your mark is ${word}; press again to clear it.`;

/** The window's first line when the lookup finds no record. */
export const MISSING = "This record is not in the data.";

/** The window's status line after a refused press. */
export const STATUS = {
  backingFailed: "Not saved: the backend did not answer.",
  limitReached: "Not saved: this scenario is at its limit of marked records.",
  refused: "Not saved: the backend refused it.",
  /** The Fail category field's own limit line (the typed list holds 100 names in all). */
  categoryLimit: "Not saved: the list is at its limit of fail categories.",
} as const;

// ---- The Fail category ----
// A typed Fail category belongs to every story, so no word below
// names one scenario. The field's own sentences ("Category name", the three refusals, "Add", "Cancel")
// are reused from `notes.ts` (`CATEGORY_ADD`, `CATEGORY_FIELD_BUTTONS`), not repeated here.

/** The row's label, and the trigger's name. */
export const FAIL_CATEGORY = { name: "Fail category", tip: "The category of your FAIL mark." } as const;

/** The list's last row. */
export const TYPE_ROW = { name: "Type a category", tip: "Type a category of your own." } as const;

/** A row of the story's own failing words (the outcome of a FAIL decision in the data). */
export const STORY_WORD_TIP = "An outcome word of a FAIL decision in the data.";

/** A row of a category the investigator typed. */
export const TYPED_TIP = "A category you typed.";

/** The chosen row, in place of its origin line. */
export const CHOSEN_TIP = "Your chosen category; press again to clear it.";

/** The trigger's value while no category is chosen (the Inspector's empty value). */
export const NONE_CHOSEN = "-";

/** The typing field's and its two buttons' tooltips. */
export const FIELD_TIP = "The name of a new fail category.";
export const ADD_TIP = "Add this name to the list and choose it.";
export const CANCEL_TIP = "Close the field and keep the list as it is.";
